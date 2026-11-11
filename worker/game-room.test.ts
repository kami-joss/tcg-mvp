import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13 } from '../src/engine';
import type { ServerMessage } from '../src/online/protocol';
import { IDLE_WAIT_MS, ROOM_TTL_MS } from '../src/online/room';
import { boardSlug } from '../src/ui/routes';
import { TURN_TIMER_MS } from '../src/ui/turnTimer';
import { GameRoom } from './game-room';
import type { Runtime } from './game-room';
import worker from './index';

// Salle d'une partie en ligne côté Cloudflare (SPEC.md §7 ter), avec un faux runtime : le stockage, les connexions
// gardées pendant la veille (et ce qui leur est attaché), l'heure du réveil. La logique de la salle a ses propres tests
// (`src/online/room.test.ts`) ; ici, ce que l'objet en fait.

const SETTINGS = { board: boardSlug(BATTLEFIELD_13), mode: 'normal', economy: 'classic', manaRules: { baseCap: 5, limit: 10 }, timer: true };

type Message<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

class FakeSocket {
  readonly inbox: ServerMessage[] = [];
  attachment: unknown = null;
  closed = false;
  send(text: string): void {
    this.inbox.push(JSON.parse(text) as ServerMessage);
  }
  serializeAttachment(value: unknown): void {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment(): unknown {
    return this.attachment;
  }
  close(): void {
    this.closed = true;
  }
  last<T extends ServerMessage['type']>(type: T): Message<T> | undefined {
    return [...this.inbox].reverse().find((message): message is Message<T> => message.type === type);
  }
}

class FakeState {
  readonly sockets: FakeSocket[] = [];
  readonly data = new Map<string, unknown>();
  alarm: number | null = null;
  readonly storage = {
    get: async (key: string) => structuredClone(this.data.get(key)),
    put: async (key: string, value: unknown) => void this.data.set(key, structuredClone(value)),
    deleteAll: async () => this.data.clear(),
    getAlarm: async () => this.alarm,
    setAlarm: async (at: number | Date) => void (this.alarm = Number(at)),
    deleteAlarm: async () => void (this.alarm = null),
  };
  acceptWebSocket(ws: FakeSocket): void {
    this.sockets.push(ws);
  }
  getWebSockets(): FakeSocket[] {
    return this.sockets.filter((ws) => !ws.closed);
  }
}

/** Un faux runtime : l'heure qu'on avance à la main, des dés réglés (J1 5, J2 2 : J1 choisit), des jetons numérotés. */
function runtime(clock: { now: number }): Runtime {
  const dice = [5, 2];
  let tokens = 0;
  return { now: () => clock.now, random: () => ((dice.shift() ?? 1) - 1) / 6 + 0.01, token: () => `jeton-${++tokens}` };
}

const asState = (state: FakeState) => state as unknown as DurableObjectState;
const asSocket = (ws: FakeSocket) => ws as unknown as WebSocket;

function create(room: GameRoom, body: unknown = { id: 'salle', token: 'jeton-hote', settings: SETTINGS, deck: 'classique' }) {
  return room.fetch(new Request('https://salle/creer', { method: 'POST', body: JSON.stringify(body) }));
}

/** Une salle créée, l'hôte et l'invité connectés, la partie lancée (J1 commence). */
async function started() {
  const clock = { now: 1_000_000 };
  const state = new FakeState();
  const room = new GameRoom(asState(state), {}, runtime(clock));
  await create(room);
  const host = new FakeSocket();
  const guest = new FakeSocket();
  const say = (ws: FakeSocket, message: unknown) => room.webSocketMessage(asSocket(ws), JSON.stringify(message));
  room.accept(asSocket(host));
  await say(host, { type: 'hello', version: 'dev', token: 'jeton-hote' });
  room.accept(asSocket(guest));
  await say(guest, { type: 'hello', version: 'dev', token: null });
  await say(guest, { type: 'join', deck: 'classique' });
  await say(host, { type: 'chooseFirst', first: 1 });
  return { clock, state, room, host, guest, say };
}

describe('créer une partie', () => {
  it('la salle vérifie les réglages, garde la partie et demande son réveil pour le ménage', async () => {
    const clock = { now: 5000 };
    const state = new FakeState();
    const room = new GameRoom(asState(state), {}, runtime(clock));
    expect((await create(room, { id: 'salle', token: 't', settings: { ...SETTINGS, board: 'nulle-part' }, deck: 'classique' })).status).toBe(400);
    const created = await create(room);
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: 'salle', token: 'jeton-hote' });
    expect(state.data.get('room')).toMatchObject({ id: 'salle', phase: 'waiting' });
    expect(state.alarm).toBe(5000 + ROOM_TTL_MS);
    expect((await create(room)).status).toBe(409);
  });

  it('sans WebSocket : 426 ; une partie qui n’existe pas : 404, à la connexion comme à la question « existe-t-elle ? »', async () => {
    const room = new GameRoom(asState(new FakeState()), {}, runtime({ now: 0 }));
    expect((await room.fetch(new Request('https://salle/ws'))).status).toBe(426);
    expect((await room.fetch(new Request('https://salle/ws', { headers: { Upgrade: 'websocket' } }))).status).toBe(404);
    expect((await room.fetch(new Request('https://salle/etat'))).status).toBe(404);
    await create(room);
    const found = await room.fetch(new Request('https://salle/etat'));
    expect([found.status, await found.json()]).toEqual([200, { phase: 'waiting' }]);
  });
});

describe('jouer', () => {
  it('chaque connexion garde la place de son joueur ; chacun reçoit sa vue', async () => {
    const { host, guest } = await started();
    expect([host.attachment, guest.attachment]).toEqual([{ seat: 1 }, { seat: 2 }]);
    expect(host.last('welcome')).toEqual({ type: 'welcome', seat: 1, token: 'jeton-hote' });
    expect(guest.last('welcome')).toEqual({ type: 'welcome', seat: 2, token: 'jeton-1' });
    expect([host.last('state')!.view.viewer, guest.last('state')!.view.viewer]).toEqual([1, 2]);
  });

  it('après la veille, un objet neuf reprend la partie (stockage) et les places (connexions)', async () => {
    const { clock, state, host, guest } = await started();
    const awake = new GameRoom(asState(state), {}, runtime(clock));
    await awake.webSocketMessage(asSocket(host), JSON.stringify({ type: 'play', action: { type: 'endTurn' } }));
    expect(guest.last('state')!.view.activePlayer).toBe(2);
    expect(host.last('state')!.view.activePlayer).toBe(2);
  });

  it('après une mise en ligne, la salle est servie par la nouvelle version : les écrans à jour s’y reconnectent', async () => {
    const { clock, state, guest } = await started();
    // La salle a été créée par une version précédente du serveur.
    state.data.set('room', { ...(state.data.get('room') as object), version: 'ancienne' });
    const updated = new GameRoom(asState(state), {}, runtime(clock));
    const back = new FakeSocket();
    updated.accept(asSocket(back));
    await updated.webSocketMessage(asSocket(back), JSON.stringify({ type: 'hello', version: 'dev', token: 'jeton-1' }));
    expect(back.last('welcome')).toEqual({ type: 'welcome', seat: 2, token: 'jeton-1' });
    expect(back.last('state')!.view.viewer).toBe(2);
    // Un écran resté sur l'ancienne version doit recharger la page.
    await updated.webSocketMessage(asSocket(guest), JSON.stringify({ type: 'hello', version: 'ancienne', token: 'jeton-1' }));
    expect(guest.last('error')?.code).toBe('version');
  });

  it('un message illisible est refusé, à son auteur seul', async () => {
    const { room, host, guest } = await started();
    const before = guest.inbox.length;
    await room.webSocketMessage(asSocket(host), 'pas du json');
    expect(host.last('error')?.code).toBe('invalid');
    expect(guest.inbox).toHaveLength(before);
  });
});

describe('réveils', () => {
  it('l’heure du réveil suit la salle : fin de l’attente des animations, puis 0:00, où le tour finit', async () => {
    const { clock, state, room, guest } = await started();
    expect(state.alarm).toBe(clock.now + IDLE_WAIT_MS);
    clock.now = state.alarm!;
    await room.alarm();
    expect(guest.last('clock')).toMatchObject({ clock: { running: true } });
    expect(state.alarm).toBe(clock.now + TURN_TIMER_MS);
    clock.now = state.alarm!;
    await room.alarm();
    expect(guest.last('state')!.view.activePlayer).toBe(2);
    expect(guest.last('state')!.log.at(-2)!.text).toBe('Temps de réflexion écoulé : fin du tour de J1.');
  });

  it('ménage : 24 h sans message, la salle est effacée et ses connexions fermées', async () => {
    const { clock, state, room, host } = await started();
    clock.now += ROOM_TTL_MS;
    await room.alarm();
    expect(state.data.size).toBe(0);
    expect(host.closed).toBe(true);
  });
});

describe('connexions', () => {
  it('l’adversaire sait quand l’autre part et revient ; les connexions comptées sont celles encore ouvertes', async () => {
    const { room, state, host, guest, say } = await started();
    guest.closed = true;
    await room.webSocketClose(asSocket(guest));
    expect(host.last('presence')).toEqual({ type: 'presence', opponentConnected: false });
    expect(state.data.get('room')).toMatchObject({ connections: { 1: 1, 2: 0 } });
    const back = new FakeSocket();
    room.accept(asSocket(back));
    await say(back, { type: 'hello', version: 'dev', token: 'jeton-1' });
    expect(back.last('state')!.view.viewer).toBe(2);
    expect(host.last('presence')).toEqual({ type: 'presence', opponentConnected: true });
  });
});

describe('le Worker', () => {
  /** Une fausse liste de salles : chaque demande transmise est notée. */
  function env() {
    const sent: { name: string; url: string; body: unknown }[] = [];
    const ROOMS = {
      idFromName: (name: string) => ({ toString: () => name }),
      get: (id: { toString(): string }) => ({
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          sent.push({ name: id.toString(), url: String(input instanceof Request ? input.url : input), body: init?.body ? JSON.parse(String(init.body)) : null });
          return new Response('ok');
        },
      }),
    };
    return { env: { ROOMS: ROOMS as unknown as DurableObjectNamespace }, sent };
  }

  it('crée une partie en tirant son identifiant et le jeton de l’hôte ; transmet les connexions à leur salle', async () => {
    const { env: bindings, sent } = env();
    await worker.fetch(new Request('https://jeu/api/parties', { method: 'POST', body: JSON.stringify({ settings: SETTINGS, deck: 'classique' }) }), bindings);
    expect(sent).toHaveLength(1);
    const { name, url, body } = sent[0]!;
    expect(url).toBe('https://salle/creer');
    expect(body).toMatchObject({ id: name, settings: SETTINGS, deck: 'classique' });
    expect(name).toMatch(/^[a-z2-9]{12}$/);
    expect((body as { token: string }).token).toMatch(/^[0-9a-f]{32}$/);
    await worker.fetch(new Request(`https://jeu/api/parties/${name}/ws`), bindings);
    expect(sent[1]).toMatchObject({ name, url: `https://jeu/api/parties/${name}/ws` });
    await worker.fetch(new Request(`https://jeu/api/parties/${name}`), bindings);
    expect(sent[2]).toMatchObject({ name, url: 'https://salle/etat' });
  });

  it('refuse une demande illisible, un identifiant qui n’en est pas un, et le reste', async () => {
    const { env: bindings, sent } = env();
    expect((await worker.fetch(new Request('https://jeu/api/parties', { method: 'POST', body: '{' }), bindings)).status).toBe(400);
    expect((await worker.fetch(new Request('https://jeu/api/parties'), bindings)).status).toBe(405);
    expect((await worker.fetch(new Request('https://jeu/api/parties/../../ws'), bindings)).status).toBe(404);
    expect((await worker.fetch(new Request('https://jeu/api/autre'), bindings)).status).toBe(404);
    expect(sent).toEqual([]);
  });
});
