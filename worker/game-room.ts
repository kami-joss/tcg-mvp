// Salle d'une partie en ligne côté Cloudflare (SPEC.md §7 ter) : un Durable Object par partie, qui ne fait que
// transmettre. Toute la logique est dans `src/online/room.ts`. L'objet garde la salle dans son stockage à chaque message
// (il peut être mis en veille entre deux, ses connexions restant ouvertes), attache à chaque connexion la place de son
// joueur (elle survit à la veille), envoie les messages de la salle et se réveille à l'heure que donne `nextAlarm`
// (fin de l'attente des animations, temps écoulé, ménage après 24 h sans message).
import type { PlayerId } from '../src/engine';
import { createRoom, disconnect, isStale, nextAlarm, receive, tick } from '../src/online/room';
import type { Room, RoomDeps, Step } from '../src/online/room';
import { BUILD_ID } from '../src/online/version';
import { newToken } from './ids';

/** Ce que l'objet attache à chaque connexion : la place de son joueur, `null` tant qu'elle n'est pas connue. */
interface Attachment {
  readonly seat: PlayerId | null;
}

/** L'heure et le hasard du runtime ; remplacés dans les tests. */
export interface Runtime {
  readonly now: () => number;
  readonly random: () => number;
  readonly token: () => string;
}

const RUNTIME: Runtime = {
  now: () => Date.now(),
  random: () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32,
  token: newToken,
};

/** La demande de création que le Worker transmet : l'identifiant et le jeton tirés pour l'hôte, ses réglages et son deck. */
interface Creation {
  readonly id: string;
  readonly token: string;
  readonly settings: unknown;
  readonly deck: string;
}

const seatOf = (ws: WebSocket): PlayerId | null => (ws.deserializeAttachment() as Attachment | null)?.seat ?? null;

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Un message reçu, en JSON ; `null` s'il est illisible (la salle le refuse). */
function parse(data: string | ArrayBuffer): unknown {
  try {
    return JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
  } catch {
    return null;
  }
}

function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Déjà fermée.
  }
}

export class GameRoom {
  /** La salle lue du stockage ; `undefined` : pas encore lue depuis le réveil de l'objet. */
  private room: Room | null | undefined;
  /** L'heure du réveil déjà demandée (pour ne pas la redemander à chaque message). */
  private alarmAt: number | null = null;

  constructor(
    private readonly state: DurableObjectState,
    _env: unknown,
    private readonly runtime: Runtime = RUNTIME,
  ) {}

  /** Requêtes que le Worker transmet : la création de la salle, ou une connexion WebSocket d'un joueur. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/creer') return this.create(await request.json().catch(() => null));
    if (url.pathname === '/etat') {
      const room = await this.load();
      return room ? json({ phase: room.phase }, 200) : json({ error: 'Partie introuvable.' }, 404);
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Attendu : une connexion WebSocket.', { status: 426 });
    if (!(await this.load())) return new Response('Partie introuvable.', { status: 404 });
    const pair = new WebSocketPair();
    this.accept(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Une connexion qui arrive : gardée ouverte pendant la veille, sans place tant qu'elle ne s'est pas présentée. */
  accept(ws: WebSocket): void {
    this.state.acceptWebSocket(ws);
    ws.serializeAttachment({ seat: null } satisfies Attachment);
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const room = await this.load();
    if (!room) return closeQuietly(ws, 4404, 'Partie introuvable.');
    await this.apply(receive(this.live(room), seatOf(ws), parse(data), this.deps()), ws);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.leave(ws);
    closeQuietly(ws, 1000, 'Au revoir.');
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  /** Réveil : ménage d'une salle sans message depuis 24 h, sinon l'horloge de la salle. */
  async alarm(): Promise<void> {
    this.alarmAt = null;
    const room = await this.load();
    if (!room) return;
    const now = this.runtime.now();
    if (isStale(room, now)) {
      for (const ws of this.state.getWebSockets()) closeQuietly(ws, 1000, 'Partie effacée.');
      await this.state.storage.deleteAll();
      this.room = null;
      return;
    }
    await this.apply(tick(this.live(room), { now }), null);
  }

  private async create(body: unknown): Promise<Response> {
    const creation = body as Partial<Creation> | null;
    if (!creation || typeof creation.id !== 'string' || typeof creation.token !== 'string' || typeof creation.deck !== 'string') {
      return json({ error: 'Demande illisible.' }, 400);
    }
    if (await this.load()) return json({ error: 'Cette partie existe déjà.' }, 409);
    const room = createRoom({
      id: creation.id,
      version: BUILD_ID,
      settings: creation.settings,
      hostDeck: creation.deck,
      hostToken: creation.token,
      now: this.runtime.now(),
    });
    if ('error' in room) return json(room, 400);
    await this.save(room);
    return json({ id: room.id, token: creation.token }, 201);
  }

  /** Une connexion se ferme : la salle le sait (l'adversaire en est prévenu quand le joueur n'a plus de connexion). */
  private async leave(ws: WebSocket): Promise<void> {
    const room = await this.load();
    if (!room) return;
    const seat = seatOf(ws);
    // Compter les connexions ouvertes, celle-ci comprise, puis la retirer.
    const live = this.live(room, ws);
    const before: Room = seat ? { ...live, connections: { ...live.connections, [seat]: live.connections[seat] + 1 } } : live;
    await this.apply(disconnect(before, seat), null);
  }

  private deps(): RoomDeps {
    return { now: this.runtime.now(), random: this.runtime.random, token: this.runtime.token };
  }

  /**
   * La salle avec les connexions vraiment ouvertes, comptées sur celles du runtime (sauf `exclude`) : après un
   * redémarrage de l'objet, un compte gardé dans la salle pourrait compter des connexions perdues.
   */
  private live(room: Room, exclude: WebSocket | null = null): Room {
    const connections: Record<PlayerId, number> = { 1: 0, 2: 0 };
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      const seat = seatOf(ws);
      if (seat) connections[seat]++;
    }
    return { ...room, connections };
  }

  private async load(): Promise<Room | null> {
    if (this.room === undefined) {
      const stored = (await this.state.storage.get<Room>('room')) ?? null;
      // Une salle créée avant une mise en ligne est désormais servie par cette version du serveur : les écrans à jour la
      // rejoignent, un écran resté sur l'ancienne version est prié de recharger la page.
      this.room = stored && stored.version !== BUILD_ID ? { ...stored, version: BUILD_ID } : stored;
    }
    return this.room;
  }

  private async save(room: Room): Promise<void> {
    this.room = room;
    await this.state.storage.put('room', room);
    const at = nextAlarm(room);
    if (at !== this.alarmAt) {
      await this.state.storage.setAlarm(at);
      this.alarmAt = at;
    }
  }

  /** La salle d'après, gardée ; la place de l'expéditeur attachée à sa connexion ; puis les messages envoyés. */
  private async apply(step: Step, sender: WebSocket | null): Promise<void> {
    if (sender && step.seat) sender.serializeAttachment({ seat: step.seat } satisfies Attachment);
    await this.save(step.room);
    for (const { to, message } of step.out) {
      const text = JSON.stringify(message);
      const targets =
        to === 'sender'
          ? sender
            ? [sender]
            : []
          : this.state.getWebSockets().filter((ws) => {
              const seat = seatOf(ws);
              return seat !== null && (to === 'both' || seat === to);
            });
      for (const ws of targets) {
        try {
          ws.send(text);
        } catch {
          // Connexion qui se ferme : elle aura la partie à sa reconnexion.
        }
      }
    }
  }
}
