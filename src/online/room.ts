// Salle d'une partie en ligne (SPEC.md §7 ter), logique pure : tout ce que fera le serveur, sans réseau ni horloge. Le
// serveur lui passe chaque message reçu avec l'heure, le hasard (dés) et un générateur de jetons ; elle rend la salle
// d'après, les messages à envoyer (à l'expéditeur, à un joueur ou aux deux) et, s'il vient d'être connu, la place de
// l'expéditeur. `tick` la réveille à l'heure que donne `nextAlarm` (fin de l'attente des animations, temps écoulé,
// ménage). La partie est celle du moteur, lancée comme en local (`startGame`, `startLog`) ; chaque joueur ne reçoit que
// sa vue et le journal (public), jamais l'action d'un coup adverse.
import { applyAction, concede as concedeGame, getPlayerView } from '../engine';
import type { Action, GameState, PlayerId } from '../engine';
import { logEntry } from '../ui/log';
import type { LogEntry } from '../ui/log';
import { rollOpening, startGame, startLog, timeoutEntry } from '../ui/session';
import type { Opening, Setup } from '../ui/session';
import { TURN_TIMER_MS } from '../ui/turnTimer';
import type { ExternalClock } from '../ui/turnTimer';
import { boardOf, checkSettings, deckOf, parseClientMessage } from './protocol';
import type { ErrorCode, RoomDecks, RoomSettings, ServerMessage } from './protocol';

/** Le chrono attend la fin des animations d'une action au plus ce temps (§7 ter). */
export const IDLE_WAIT_MS = 10_000;

/** Une salle sans message reçu depuis ce temps est effacée. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/** Tours de suite passés à la fin de son temps sans être connecté, après lesquels un joueur perd par absence (§7 ter). */
export const ABSENT_TURNS = 2;

/** `waiting` : l'invité n'est pas encore là ; `opening` : lancer de dés ; `playing` ; `finished` : la partie a un vainqueur. */
export type RoomPhase = 'waiting' | 'opening' | 'playing' | 'finished';

/** Horloge du tour en cours, dans une partie avec minuteur. */
export interface RoomClock {
  /** Change à chaque changement de l'horloge : l'écran repart du temps envoyé. */
  readonly id: number;
  /** Temps de réflexion pris dans le tour : jusqu'à `since` si le chrono tourne, en tout s'il est arrêté. */
  readonly spent: number;
  /** Le chrono tourne depuis cet instant ; `null` : il est arrêté, on attend la fin des animations. */
  readonly since: number | null;
  /** Chrono arrêté : il repart à cet instant au plus tard, même sans nouvelle de l'écran du joueur. */
  readonly waitUntil: number | null;
}

export interface Room {
  readonly id: string;
  /** Version du jeu du serveur : un écran d'une autre version est refusé. */
  readonly version: string;
  readonly settings: RoomSettings;
  readonly decks: RoomDecks;
  /** Jeton secret de chaque place (`null` : place libre) : il reconnaît le joueur qui se reconnecte. */
  readonly tokens: Readonly<{ 1: string; 2: string | null }>;
  readonly phase: RoomPhase;
  readonly opening: Opening | null;
  readonly game: GameState | null;
  readonly log: readonly LogEntry[];
  /** Numéro de la dernière nouvelle de la partie (message `state`). */
  readonly seq: number;
  readonly clock: RoomClock | null;
  /** Connexions ouvertes de chaque joueur (un joueur peut avoir deux onglets). */
  readonly connections: Readonly<Record<PlayerId, number>>;
  /** Tours de suite de chaque joueur passés à la fin de son temps sans être connecté. */
  readonly absent: Readonly<Record<PlayerId, number>>;
  /** Dernier message reçu (ménage). */
  readonly touchedAt: number;
}

/** Ce que la salle reçoit du serveur avec chaque message : l'heure, le hasard (dés), un nouveau jeton secret. */
export interface RoomDeps {
  readonly now: number;
  readonly random: () => number;
  readonly token: () => string;
}

/** À qui envoyer : l'expéditeur seul, un joueur (toutes ses connexions), ou les deux joueurs. */
export type Recipient = 'sender' | PlayerId | 'both';

export interface Outgoing {
  readonly to: Recipient;
  readonly message: ServerMessage;
}

/**
 * Ce que rend la salle : la salle d'après, les messages à envoyer et, si elle vient d'être connue, la place de
 * l'expéditeur (le serveur l'attache à sa connexion avant d'envoyer les messages).
 */
export interface Step {
  readonly room: Room;
  readonly out: readonly Outgoing[];
  readonly seat?: PlayerId;
}

const other = (seat: PlayerId): PlayerId => (seat === 1 ? 2 : 1);

/** Une nouvelle salle, avec les réglages et le deck de l'hôte (J1) ; sinon, la raison. */
export function createRoom(input: {
  readonly id: string;
  readonly version: string;
  readonly settings: unknown;
  readonly hostDeck: string;
  readonly hostToken: string;
  readonly now: number;
}): Room | { readonly error: string } {
  const settings = checkSettings(input.settings);
  if ('error' in settings) return settings;
  if (!deckOf(input.hostDeck)) return { error: 'Deck inconnu.' };
  return {
    id: input.id,
    version: input.version,
    settings,
    decks: { 1: input.hostDeck, 2: null },
    tokens: { 1: input.hostToken, 2: null },
    phase: 'waiting',
    opening: null,
    game: null,
    log: [],
    seq: 0,
    clock: null,
    connections: { 1: 0, 2: 0 },
    absent: { 1: 0, 2: 0 },
    touchedAt: input.now,
  };
}

/** Un message reçu d'une connexion (`seat` : la place qui lui est attachée, `null` avant d'être connue). */
export function receive(room: Room, seat: PlayerId | null, data: unknown, deps: RoomDeps): Step {
  const message = parseClientMessage(data);
  const touched: Room = { ...room, touchedAt: deps.now };
  if (!message) return refuse(touched, 'invalid', 'Message illisible.');
  switch (message.type) {
    case 'hello':
      return hello(touched, seat, message.version, message.token, deps);
    case 'join':
      return join(touched, seat, message.deck, deps);
    default:
      break;
  }
  if (seat === null) return refuse(touched, 'token', 'Rejoins d’abord la partie.');
  switch (message.type) {
    case 'chooseFirst':
      return chooseFirst(touched, seat, message.first, deps);
    case 'play':
      return play(touched, seat, message.action, deps);
    case 'idle':
      return idle(touched, seat, message.seq, deps);
    case 'concede':
      return concede(touched, seat, deps);
  }
}

/** Une connexion se ferme. */
export function disconnect(room: Room, seat: PlayerId | null): Step {
  if (seat === null) return { room, out: [] };
  const left = Math.max(0, room.connections[seat] - 1);
  const next: Room = { ...room, connections: { ...room.connections, [seat]: left } };
  return { room: next, out: left === 0 ? [{ to: other(seat), message: { type: 'presence', opponentConnected: false } }] : [] };
}

/**
 * Réveil (heure de `nextAlarm`) : le chrono repart si l'attente des animations est finie ; à 0:00, le tour finit, ou le
 * joueur perd par absence s'il n'est pas connecté pour la deuxième fois de suite (§7 ter).
 */
export function tick(room: Room, deps: Pick<RoomDeps, 'now'>): Step {
  const { clock, game } = room;
  if (room.phase !== 'playing' || !clock || !game) return { room, out: [] };
  const { now } = deps;
  const out: Outgoing[] = [];
  let current = room;
  let running = clock;
  if (running.since === null && running.waitUntil !== null && now >= running.waitUntil) {
    running = { id: running.id + 1, spent: running.spent, since: running.waitUntil, waitUntil: null };
    current = { ...current, clock: running };
  }
  if (running.since !== null && running.spent + (now - running.since) >= TURN_TIMER_MS) return timeout(current, now);
  if (running !== clock) out.push({ to: 'both', message: { type: 'clock', clock: clockOf(running, now)! } });
  return { room: current, out };
}

/** Heure à laquelle réveiller la salle : fin de l'attente des animations, temps écoulé, ou ménage. */
export function nextAlarm(room: Room): number {
  const cleanup = room.touchedAt + ROOM_TTL_MS;
  const clock = room.clock;
  if (room.phase !== 'playing' || !clock) return cleanup;
  const due = clock.since !== null ? clock.since + (TURN_TIMER_MS - clock.spent) : (clock.waitUntil ?? cleanup);
  return Math.min(due, cleanup);
}

/** La salle est à effacer : aucun message depuis `ROOM_TTL_MS`. */
export const isStale = (room: Room, now: number): boolean => now >= room.touchedAt + ROOM_TTL_MS;

function refuse(room: Room, code: ErrorCode, text: string): Step {
  return { room, out: [{ to: 'sender', message: { type: 'error', code, text } }] };
}

/** À la connexion : sa place (reconnexion, jeton connu), sinon la salle d'attente s'il reste une place. */
function hello(room: Room, seat: PlayerId | null, version: string, token: string | null, deps: RoomDeps): Step {
  if (version !== room.version) return refuse(room, 'version', 'Le jeu a été mis à jour : recharge la page.');
  // Une connexion déjà placée qui se présente de nouveau : on lui renvoie seulement où en est la partie.
  if (seat !== null) return { room, out: phaseMessages(room, seat, deps.now) };
  const found = ([1, 2] as const).find((s) => token !== null && room.tokens[s] === token);
  if (found) {
    const connections = { ...room.connections, [found]: room.connections[found] + 1 };
    const next: Room = { ...room, connections };
    const out: Outgoing[] = [{ to: 'sender', message: { type: 'welcome', seat: found, token: room.tokens[found]! } }, ...phaseMessages(next, found, deps.now)];
    if (room.connections[found] === 0) out.push({ to: other(found), message: { type: 'presence', opponentConnected: true } });
    return { room: next, out, seat: found };
  }
  if (token !== null) return refuse(room, 'token', 'Cette place n’est pas la tienne.');
  if (room.phase !== 'waiting') return refuse(room, 'full', 'Ce lien a déjà servi : la partie a ses deux joueurs.');
  return { room, out: [{ to: 'sender', message: { type: 'lobby', settings: room.settings, decks: room.decks } }] };
}

/** L'invité prend la place libre avec son deck : la partie commence par le lancer de dés. */
function join(room: Room, seat: PlayerId | null, deck: string, deps: RoomDeps): Step {
  if (seat !== null) return refuse(room, 'invalid', 'Tu as déjà ta place.');
  if (room.phase !== 'waiting' || room.tokens[2] !== null) return refuse(room, 'full', 'Ce lien a déjà servi : la partie a ses deux joueurs.');
  if (!deckOf(deck)) return refuse(room, 'invalid', 'Deck inconnu.');
  const token = deps.token();
  const next: Room = {
    ...room,
    decks: { 1: room.decks[1], 2: deck },
    tokens: { 1: room.tokens[1], 2: token },
    phase: 'opening',
    opening: rollOpening(deps.random),
    connections: { ...room.connections, 2: room.connections[2] + 1 },
  };
  return {
    room: next,
    seat: 2,
    out: [
      { to: 'sender', message: { type: 'welcome', seat: 2, token } },
      { to: 'both', message: { type: 'opening', settings: next.settings, decks: next.decks, opening: next.opening! } },
    ],
  };
}

/** Les réglages de la partie, comme ceux de l'accueil en local (§7 ter). */
function setupOf(room: Room): Setup {
  return {
    board: boardOf(room.settings.board)!,
    mode: room.settings.mode,
    economy: room.settings.economy,
    manaRules: room.settings.manaRules,
    ...(room.settings.victoryVp !== undefined ? { victoryVp: room.settings.victoryVp } : {}),
    decks: { 1: deckOf(room.decks[1])!, 2: deckOf(room.decks[2])! },
    ai: null,
    timer: room.settings.timer,
  };
}

/** Le gagnant du lancer de dés choisit qui commence : la partie est lancée. */
function chooseFirst(room: Room, seat: PlayerId, first: PlayerId, deps: RoomDeps): Step {
  const { opening } = room;
  if (room.phase !== 'opening' || !opening) return refuse(room, 'refused', 'Le lancer de dés est déjà joué.');
  if (seat !== opening.winner) return refuse(room, 'refused', 'C’est au gagnant du lancer de dés de choisir.');
  const setup = setupOf(room);
  const game = startGame(setup, first);
  const chosen: Opening = { ...opening, chosen: first };
  return broadcast({
    ...room,
    phase: 'playing',
    opening: chosen,
    game,
    log: startLog(setup, game, chosen, first),
    clock: room.settings.timer ? turnClock(0, deps.now) : null,
  }, deps.now);
}

/** Un coup du joueur actif : le moteur le juge ; refusé, seul son auteur le sait. */
function play(room: Room, seat: PlayerId, action: Action, deps: RoomDeps): Step {
  const { game } = room;
  if (room.phase !== 'playing' || !game) return refuse(room, 'refused', 'La partie n’est pas en cours.');
  if (game.activePlayer !== seat) return refuse(room, 'refused', 'Ce n’est pas ton tour.');
  let next: GameState;
  try {
    next = applyAction(game, action);
  } catch (error) {
    return refuse(room, 'refused', error instanceof Error ? `Action refusée : ${error.message}` : 'Action refusée.');
  }
  const entry = logEntry(getPlayerView(game, seat), action, getPlayerView(next, seat));
  return broadcast(
    {
      ...room,
      game: next,
      phase: next.winner !== null ? 'finished' : 'playing',
      log: [...room.log, entry],
      absent: { ...room.absent, [seat]: 0 },
      clock: room.clock && clockAfterAction(room.clock, game, next, deps.now),
    },
    deps.now,
  );
}

/** L'écran du joueur actif a fini d'animer la dernière nouvelle : le chrono repart. */
function idle(room: Room, seat: PlayerId, seq: number, deps: RoomDeps): Step {
  const { clock, game } = room;
  if (room.phase !== 'playing' || !clock || !game || clock.since !== null || seat !== game.activePlayer || seq !== room.seq) {
    return { room, out: [] };
  }
  const running: RoomClock = { id: clock.id + 1, spent: clock.spent, since: deps.now, waitUntil: null };
  return { room: { ...room, clock: running }, out: [{ to: 'both', message: { type: 'clock', clock: clockOf(running, deps.now)! } }] };
}

/** Il abandonne : son adversaire gagne aussitôt, même pendant son propre tour (§7 ter). */
function concede(room: Room, seat: PlayerId, deps: RoomDeps): Step {
  const { game } = room;
  if (room.phase !== 'playing' || !game) return refuse(room, 'refused', 'La partie n’est pas en cours.');
  return broadcast(
    { ...room, game: concedeGame(game, seat, 'abandon'), phase: 'finished', log: [...room.log, endEntry(seat, 'abandon')] },
    deps.now,
  );
}

/**
 * Temps écoulé : le tour du joueur actif finit. S'il n'est pas connecté, c'est un tour passé sans lui ; au deuxième
 * de suite, il perd par absence (§7 ter).
 */
function timeout(room: Room, now: number): Step {
  const game = room.game!;
  const seat = game.activePlayer;
  const absent = room.connections[seat] === 0 ? room.absent[seat] + 1 : 0;
  if (absent >= ABSENT_TURNS) {
    return broadcast(
      {
        ...room,
        game: concedeGame(game, seat, 'absence'),
        phase: 'finished',
        log: [...room.log, timeoutEntry(seat), endEntry(seat, 'absence')],
        absent: { ...room.absent, [seat]: absent },
      },
      now,
    );
  }
  const next = applyAction(game, { type: 'endTurn' });
  const entry = logEntry(getPlayerView(game, seat), { type: 'endTurn' }, getPlayerView(next, seat));
  return broadcast(
    {
      ...room,
      game: next,
      phase: next.winner !== null ? 'finished' : 'playing',
      log: [...room.log, timeoutEntry(seat), entry],
      absent: { ...room.absent, [seat]: absent },
      clock: turnClock(room.clock!.id, now),
    },
    now,
  );
}

/** Ligne du journal d'une partie perdue par abandon ou par absence. */
function endEntry(seat: PlayerId, reason: 'abandon' | 'absence'): LogEntry {
  const text = reason === 'abandon' ? `J${seat} abandonne : J${other(seat)} gagne la partie.` : `J${seat} a quitté la partie : J${other(seat)} gagne.`;
  return { kind: 'action', player: seat, icon: 'knockout', text, items: [] };
}

/** Nouveau tour : le chrono part de 0, après les animations du début de tour (au plus `IDLE_WAIT_MS`). */
function turnClock(previousId: number, now: number): RoomClock {
  return { id: previousId + 1, spent: 0, since: null, waitUntil: now + IDLE_WAIT_MS };
}

/** Après un coup : nouveau tour s'il a changé de joueur, sinon chrono arrêté le temps des animations. */
function clockAfterAction(clock: RoomClock, before: GameState, after: GameState, now: number): RoomClock {
  if (after.activePlayer !== before.activePlayer) return turnClock(clock.id, now);
  const spent = clock.spent + (clock.since !== null ? now - clock.since : 0);
  return { id: clock.id + 1, spent, since: null, waitUntil: now + IDLE_WAIT_MS };
}

/** L'horloge telle que l'écran la reçoit, à l'instant `now`. */
function clockOf(clock: RoomClock | null, now: number): ExternalClock | null {
  if (!clock) return null;
  return { id: clock.id, spent: clock.spent + (clock.since !== null ? now - clock.since : 0), running: clock.since !== null };
}

/** La partie vue par ce joueur. */
function stateMessage(room: Room, seat: PlayerId, now: number): ServerMessage {
  return {
    type: 'state',
    seq: room.seq,
    settings: room.settings,
    decks: room.decks,
    view: getPlayerView(room.game!, seat),
    log: room.log,
    clock: clockOf(room.clock, now),
    opponentConnected: room.connections[other(seat)] > 0,
  };
}

/** La nouvelle d'une partie qui change, pour chacun des deux joueurs (sa vue). */
function broadcast(room: Room, now: number): Step {
  const next: Room = { ...room, seq: room.seq + 1 };
  return { room: next, out: ([1, 2] as const).map((seat) => ({ to: seat, message: stateMessage(next, seat, now) })) };
}

/** Où en est la partie, pour une connexion qui arrive. */
function phaseMessages(room: Room, seat: PlayerId, now: number): Outgoing[] {
  switch (room.phase) {
    case 'waiting':
      return [{ to: 'sender', message: { type: 'lobby', settings: room.settings, decks: room.decks } }];
    case 'opening':
      return [{ to: 'sender', message: { type: 'opening', settings: room.settings, decks: room.decks, opening: room.opening! } }];
    default:
      return [{ to: 'sender', message: stateMessage(room, seat, now) }];
  }
}
