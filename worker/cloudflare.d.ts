// Ce que ce serveur utilise du runtime Cloudflare Workers, décrit ici plutôt que par `@cloudflare/workers-types` : ce
// paquet remplace les types du navigateur, et la salle réutilise le code de l'application, vérifié avec eux. Fichier de
// déclarations global (sans import ni export) : il complète les types du navigateur (WebSocket, ResponseInit).

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectState {
  readonly storage: DurableObjectStorage;
  /** Accepte une connexion en la laissant ouverte pendant la veille de l'objet (WebSocket Hibernation). */
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface WebSocket {
  /** Données attachées à la connexion, gardées pendant la veille de l'objet (2 Ko au plus). */
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

interface ResponseInit {
  webSocket?: WebSocket | null;
}

declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };
