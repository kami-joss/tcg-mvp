import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, BATTLEFIELD_15, BOARD, getLegalActions } from '../engine';
import type { Action, PlayerId } from '../engine';
import { boardSlug } from '../ui/routes';
import { TURN_TIMER_MS } from '../ui/turnTimer';
import type { ServerMessage } from './protocol';
import { ABSENT_TURNS, IDLE_WAIT_MS, ROOM_TTL_MS, createRoom, disconnect, isStale, nextAlarm, receive, tick } from './room';
import type { Room, Step } from './room';

// Salle d'une partie en ligne (SPEC.md §7 ter), avec un serveur simulé : la salle, et la boîte de réception de chaque
// connexion. Le serveur réel (lot 3) ne fera que transmettre, comme ici.

const VERSION = 'v1';
const SETTINGS = { board: boardSlug(BATTLEFIELD_13), mode: 'normal', economy: 'classic', manaRules: { baseCap: 5, limit: 10 }, timer: true };

type Message<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

class Server {
  room: Room;
  now = 1_000_000;
  private tokens = 0;
  private dice: number[];
  readonly connections = new Map<string, { seat: PlayerId | null; inbox: ServerMessage[] }>();

  constructor(settings: unknown = SETTINGS, dice: number[] = [5, 2]) {
    const room = createRoom({ id: 'salle', version: VERSION, settings, hostDeck: 'classique', hostToken: 'jeton-hote', now: this.now });
    if ('error' in room) throw new Error(room.error);
    this.room = room;
    this.dice = [...dice];
  }

  private deps() {
    // Un dé à 6 faces : la valeur voulue, puis 1 si la liste est vide.
    return { now: this.now, random: () => ((this.dice.shift() ?? 1) - 1) / 6 + 0.01, token: () => `jeton-${++this.tokens}` };
  }

  connect(name: string): void {
    this.connections.set(name, { seat: null, inbox: [] });
  }

  send(name: string, data: unknown): void {
    const connection = this.connections.get(name)!;
    this.apply(receive(this.room, connection.seat, data, this.deps()), name);
  }

  close(name: string): void {
    const connection = this.connections.get(name)!;
    this.apply(disconnect(this.room, connection.seat), name);
    this.connections.delete(name);
  }

  wake(at: number): void {
    this.now = at;
    this.apply(tick(this.room, { now: at }), null);
  }

  private apply(step: Step, sender: string | null): void {
    this.room = step.room;
    if (sender && step.seat && this.connections.has(sender)) this.connections.get(sender)!.seat = step.seat;
    for (const { to, message } of step.out) {
      for (const [name, connection] of this.connections) {
        const hit = to === 'sender' ? name === sender : to === 'both' ? connection.seat !== null : connection.seat === to;
        if (hit) connection.inbox.push(message);
      }
    }
  }

  inbox(name: string): ServerMessage[] {
    return this.connections.get(name)!.inbox;
  }

  last<T extends ServerMessage['type']>(name: string, type: T): Message<T> | undefined {
    return [...this.inbox(name)].reverse().find((message): message is Message<T> => message.type === type);
  }

  /** L'hôte et l'invité à leur place, la partie lancée ; `first` commence (le gagnant des dés, J1, choisit). */
  static started(settings: unknown = SETTINGS, first: PlayerId = 1): Server {
    const server = new Server(settings, [5, 2]);
    server.connect('hote');
    server.send('hote', { type: 'hello', version: VERSION, token: 'jeton-hote' });
    server.connect('invite');
    server.send('invite', { type: 'hello', version: VERSION, token: null });
    server.send('invite', { type: 'join', deck: 'classique' });
    server.send('hote', { type: 'chooseFirst', first });
    return server;
  }

  /** Le nom de la connexion du joueur actif. */
  active(): string {
    return this.room.game!.activePlayer === 1 ? 'hote' : 'invite';
  }
}

const anyCell = (server: Server): Action => getLegalActions(server.room.game!).find((action) => action.type === 'playCard' && action.target.kind === 'cell')!;

describe('créer une partie en ligne', () => {
  it('les réglages de l’hôte sont vérifiés comme à l’accueil', () => {
    const create = (settings: unknown, hostDeck = 'classique') => createRoom({ id: 's', version: VERSION, settings, hostDeck, hostToken: 't', now: 0 });
    expect(create(SETTINGS)).toMatchObject({ phase: 'waiting', decks: { 1: 'classique', 2: null } });
    expect(create({ ...SETTINGS, board: 'nulle-part' })).toEqual({ error: 'Carte inconnue.' });
    expect(create({ ...SETTINGS, board: boardSlug(BOARD), mode: 'contestation' })).toEqual({ error: 'Cette carte ne propose pas le mode contestation.' });
    expect(create({ ...SETTINGS, board: boardSlug(BATTLEFIELD_15), mode: 'contestation' })).toMatchObject({ phase: 'waiting' });
    expect(create({ ...SETTINGS, manaRules: { baseCap: 2, limit: 10 } })).toEqual({ error: 'Réglages du mana hors des valeurs de l’accueil.' });
    expect(create({ ...SETTINGS, timer: 'oui' })).toEqual({ error: 'Minuteur illisible.' });
    expect(create(SETTINGS, 'inconnu')).toEqual({ error: 'Deck inconnu.' });
  });

  it('l’hôte se connecte avec son jeton : sa place (J1), puis l’attente de son invité', () => {
    const server = new Server();
    server.connect('hote');
    server.send('hote', { type: 'hello', version: VERSION, token: 'jeton-hote' });
    expect(server.inbox('hote')).toEqual([
      { type: 'welcome', seat: 1, token: 'jeton-hote' },
      { type: 'lobby', settings: server.room.settings, decks: { 1: 'classique', 2: null } },
    ]);
  });
});

describe('rejoindre par le lien', () => {
  it('l’invité voit les réglages et le deck de l’hôte, choisit le sien, et prend la place de J2', () => {
    const server = new Server();
    server.connect('hote');
    server.send('hote', { type: 'hello', version: VERSION, token: 'jeton-hote' });
    server.connect('invite');
    server.send('invite', { type: 'hello', version: VERSION, token: null });
    expect(server.inbox('invite')).toEqual([{ type: 'lobby', settings: server.room.settings, decks: { 1: 'classique', 2: null } }]);
    server.send('invite', { type: 'join', deck: 'vampire' });
    expect(server.last('invite', 'welcome')).toEqual({ type: 'welcome', seat: 2, token: 'jeton-1' });
    // Les deux voient le lancer de dés.
    for (const name of ['hote', 'invite']) expect(server.last(name, 'opening')).toMatchObject({ decks: { 1: 'classique', 2: 'vampire' }, opening: { winner: 1, chosen: null } });
  });

  it('le lien est à usage unique : le suivant est refusé', () => {
    const server = Server.started();
    server.connect('curieux');
    server.send('curieux', { type: 'hello', version: VERSION, token: null });
    expect(server.inbox('curieux')).toEqual([{ type: 'error', code: 'full', text: 'Ce lien a déjà servi : la partie a ses deux joueurs.' }]);
    server.send('curieux', { type: 'join', deck: 'classique' });
    expect(server.last('curieux', 'error')?.code).toBe('full');
    server.send('curieux', { type: 'hello', version: VERSION, token: 'pas-le-bon' });
    expect(server.last('curieux', 'error')?.code).toBe('token');
  });

  it('un jeu d’une autre version est refusé ; un message illisible aussi, et rien ne se joue sans place', () => {
    const server = new Server();
    server.connect('vieux');
    server.send('vieux', { type: 'hello', version: 'v0', token: null });
    expect(server.last('vieux', 'error')).toEqual({ type: 'error', code: 'version', text: 'Le jeu a été mis à jour : recharge la page.' });
    server.send('vieux', { type: 'n’importe quoi' });
    expect(server.last('vieux', 'error')?.code).toBe('invalid');
    server.send('vieux', { type: 'play', action: { type: 'endTurn' } });
    expect(server.last('vieux', 'error')?.code).toBe('token');
  });
});

describe('le lancer de dés, puis la partie', () => {
  it('seul le gagnant du lancer choisit ; la partie lancée, chacun reçoit sa vue et le même journal', () => {
    const server = new Server(SETTINGS, [2, 6]);
    server.connect('hote');
    server.send('hote', { type: 'hello', version: VERSION, token: 'jeton-hote' });
    server.connect('invite');
    server.send('invite', { type: 'hello', version: VERSION, token: null });
    server.send('invite', { type: 'join', deck: 'classique' });
    expect(server.room.opening).toMatchObject({ winner: 2 });
    server.send('hote', { type: 'chooseFirst', first: 1 });
    expect(server.last('hote', 'error')).toEqual({ type: 'error', code: 'refused', text: 'C’est au gagnant du lancer de dés de choisir.' });
    server.send('invite', { type: 'chooseFirst', first: 1 });
    const host = server.last('hote', 'state')!;
    const guest = server.last('invite', 'state')!;
    expect([host.view.viewer, guest.view.viewer]).toEqual([1, 2]);
    expect(host.view.activePlayer).toBe(1);
    expect(host.log).toEqual(guest.log);
    expect(host.log[0]!.text).toContain('Début de la partie sur la carte « Champ de bataille (13 × 13) », minuteur de 3 minutes par tour');
    expect(host.log[1]!.text).toContain('J2 a le plus gros chiffre et laisse J1 commencer.');
    // Les actions légales ne vont qu'au joueur actif.
    expect(host.view.legalActions.length).toBeGreaterThan(0);
    expect(guest.view.legalActions).toEqual([]);
  });

  it('un coup : le moteur le juge ; la nouvelle va aux deux joueurs, jamais l’action elle-même', () => {
    const server = Server.started();
    const before = server.room.seq;
    server.send('hote', { type: 'play', action: anyCell(server) });
    const host = server.last('hote', 'state')!;
    const guest = server.last('invite', 'state')!;
    expect([host.seq, guest.seq]).toEqual([before + 1, before + 1]);
    expect(host.log.at(-1)!.text).toMatch(/^J1 invoque /);
    for (const message of [...server.inbox('hote'), ...server.inbox('invite')]) expect('action' in message).toBe(false);
  });

  it('refusés, à leur auteur seul : le coup hors de son tour, le coup illégal', () => {
    const server = Server.started();
    const guestInbox = server.inbox('invite').length;
    server.send('invite', { type: 'play', action: { type: 'endTurn' } });
    expect(server.last('invite', 'error')).toEqual({ type: 'error', code: 'refused', text: 'Ce n’est pas ton tour.' });
    server.send('hote', { type: 'play', action: { type: 'move', unitId: 'u99', to: { row: 0, col: 0 } } });
    expect(server.last('hote', 'error')?.code).toBe('refused');
    // L'hôte ne reçoit pas le refus de l'invité, ni l'invité celui de l'hôte.
    expect(server.inbox('invite').slice(guestInbox).filter((m) => m.type === 'error')).toHaveLength(1);
    expect(server.inbox('hote').filter((m) => m.type === 'error')).toHaveLength(1);
  });
});

describe('minuteur en ligne', () => {
  it('le chrono attend la fin des animations : le signal de l’écran du joueur actif, sur la dernière nouvelle', () => {
    const server = Server.started();
    expect(server.last('hote', 'state')!.clock).toMatchObject({ spent: 0, running: false });
    const seq = server.room.seq;
    // Pas l'adversaire, ni une vieille nouvelle.
    server.send('invite', { type: 'idle', seq });
    server.send('hote', { type: 'idle', seq: seq - 1 });
    expect(server.room.clock!.since).toBeNull();
    server.send('hote', { type: 'idle', seq });
    expect(server.last('invite', 'clock')).toMatchObject({ clock: { spent: 0, running: true } });
    // Un coup l'arrête de nouveau, avec le temps déjà pris.
    server.now += 30_000;
    server.send('hote', { type: 'play', action: anyCell(server) });
    expect(server.last('invite', 'state')!.clock).toMatchObject({ spent: 30_000, running: false });
  });

  it('sans signal, il repart au bout de 10 secondes ; à 0:00, le tour finit et le journal le dit', () => {
    const server = Server.started();
    const start = server.now;
    expect(nextAlarm(server.room)).toBe(start + IDLE_WAIT_MS);
    server.wake(start + IDLE_WAIT_MS);
    expect(server.last('hote', 'clock')).toMatchObject({ clock: { spent: 0, running: true } });
    expect(nextAlarm(server.room)).toBe(start + IDLE_WAIT_MS + TURN_TIMER_MS);
    server.wake(start + IDLE_WAIT_MS + TURN_TIMER_MS);
    const state = server.last('invite', 'state')!;
    expect(state.view.activePlayer).toBe(2);
    expect(state.log.at(-2)!.text).toBe('Temps de réflexion écoulé : fin du tour de J1.');
    expect(state.log.at(-1)!.kind).toBe('turn');
    expect(state.clock).toMatchObject({ spent: 0, running: false });
  });

  it('un réveil trop tôt ne change rien ; sans minuteur, seul le ménage réveille la salle', () => {
    const server = Server.started();
    const count = server.inbox('hote').length;
    server.wake(server.now + 1000);
    expect(server.inbox('hote')).toHaveLength(count);
    const untimed = Server.started({ ...SETTINGS, timer: false });
    expect(untimed.last('hote', 'state')!.clock).toBeNull();
    expect(nextAlarm(untimed.room)).toBe(untimed.room.touchedAt + ROOM_TTL_MS);
  });
});

describe('absence, abandon et connexions', () => {
  /** Laisse filer le temps du tour en cours jusqu'à 0:00. */
  const timeOut = (server: Server) => {
    server.wake(nextAlarm(server.room)); // Fin de l'attente des animations.
    server.wake(nextAlarm(server.room)); // 0:00.
  };

  it('l’adversaire sait quand l’autre part et revient ; il se reconnecte avec son jeton et retrouve la partie', () => {
    const server = Server.started();
    server.close('invite');
    expect(server.last('hote', 'presence')).toEqual({ type: 'presence', opponentConnected: false });
    server.connect('invite-retour');
    server.send('invite-retour', { type: 'hello', version: VERSION, token: 'jeton-1' });
    expect(server.inbox('invite-retour')[0]).toEqual({ type: 'welcome', seat: 2, token: 'jeton-1' });
    expect(server.last('invite-retour', 'state')!.view.viewer).toBe(2);
    expect(server.last('hote', 'presence')).toEqual({ type: 'presence', opponentConnected: true });
  });

  it(`un joueur déconnecté perd après ${ABSENT_TURNS} tours de suite passés sans lui`, () => {
    const server = Server.started();
    server.close('invite');
    timeOut(server); // Tour de J1, connecté : il passe.
    expect(server.room.game!.activePlayer).toBe(2);
    timeOut(server); // Tour de J2, absent : 1.
    expect(server.room.absent[2]).toBe(1);
    timeOut(server); // Tour de J1.
    timeOut(server); // Tour de J2, absent : 2, il perd.
    const state = server.last('hote', 'state')!;
    expect(state.view).toMatchObject({ winner: 1, concession: { player: 2, reason: 'absence' } });
    expect(state.log.at(-1)!.text).toBe('J2 a quitté la partie : J1 gagne.');
    expect(server.room.phase).toBe('finished');
  });

  it('un tour passé en étant connecté remet le compte à zéro', () => {
    const server = Server.started();
    server.close('invite');
    timeOut(server);
    timeOut(server); // J2 absent : 1.
    timeOut(server);
    server.connect('invite-retour');
    server.send('invite-retour', { type: 'hello', version: VERSION, token: 'jeton-1' });
    timeOut(server); // J2 connecté, mais son temps est écoulé : 0.
    expect(server.room.absent[2]).toBe(0);
    expect(server.room.phase).toBe('playing');
  });

  it('abandon : à tout moment, même pendant le tour adverse ; l’adversaire gagne, plus rien ne se joue', () => {
    const server = Server.started();
    server.send('invite', { type: 'concede' });
    const state = server.last('hote', 'state')!;
    expect(state.view).toMatchObject({ winner: 1, concession: { player: 2, reason: 'abandon' } });
    expect(state.log.at(-1)!.text).toBe('J2 abandonne : J1 gagne la partie.');
    server.send('hote', { type: 'play', action: { type: 'endTurn' } });
    expect(server.last('hote', 'error')?.code).toBe('refused');
    server.send('hote', { type: 'concede' });
    expect(server.room.game!.concession).toEqual({ player: 2, reason: 'abandon' });
  });

  it('ménage : la salle est effacée 24 h après le dernier message', () => {
    const server = Server.started();
    expect(isStale(server.room, server.now + ROOM_TTL_MS - 1)).toBe(false);
    expect(isStale(server.room, server.now + ROOM_TTL_MS)).toBe(true);
  });
});
