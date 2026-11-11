// Partie en ligne, côté écran (SPEC.md §7 ter) : ce que l'écran d'un joueur sait de sa partie d'après les messages du
// serveur, et ce qui en découle pour l'affichage (la page à montrer, le bandeau, les réglages). Logique pure et testée ;
// `useOnlineGame.ts` tient la connexion, `OnlineScreen.tsx` affiche.
import { VICTORY_VP } from '../engine';
import type { PlayerId, PlayerView } from '../engine';
import type { LogEntry } from '../ui/log';
import { boardSlug } from '../ui/routes';
import { TIMER_TEXT, manaRulesOf, modeOf, victoryVpOf } from '../ui/session';
import type { Opening, Setup } from '../ui/session';
import type { ExternalClock } from '../ui/turnTimer';
import { boardOf, deckOf } from './protocol';
import type { ErrorCode, RoomDecks, RoomSettings, ServerMessage } from './protocol';

/** La connexion : première connexion, ouverte, ou reconnexion après une coupure. */
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

/** Ce que montre la page : connexion, attente de l'invité (hôte), rejoindre (invité), dés, partie, ou une erreur. */
export type OnlinePhase = 'loading' | 'waiting' | 'join' | 'opening' | 'playing' | 'error';

export interface OnlineError {
  readonly code: ErrorCode | 'notFound';
  readonly text: string;
}

export interface OnlineState {
  readonly roomId: string;
  readonly status: ConnectionStatus;
  /** Ma place, une fois que le serveur l'a dite (`welcome`). */
  readonly seat: PlayerId | null;
  /** Où en est la salle d'après le dernier message : salle d'attente, dés, partie. */
  readonly stage: 'lobby' | 'opening' | 'game' | null;
  readonly settings: RoomSettings | null;
  readonly decks: RoomDecks | null;
  readonly opening: Opening | null;
  /** La partie vue par ce joueur, et la vue d'avant : point de départ des animations (`null` après une (re)connexion). */
  readonly view: PlayerView | null;
  readonly before: PlayerView | null;
  readonly log: readonly LogEntry[];
  /** Numéro de la dernière nouvelle de la partie : l'écran le renvoie quand il a fini de l'animer. */
  readonly seq: number;
  readonly clock: ExternalClock | null;
  readonly opponentConnected: boolean;
  /** Erreur qui arrête tout pour cet écran : lien déjà servi, autre version du jeu, place d'un autre, partie introuvable. */
  readonly fatal: OnlineError | null;
  /** Refus passager (un coup refusé), affiché jusqu'au prochain message. */
  readonly notice: string | null;
}

export type OnlineEvent =
  | { readonly type: 'opened' }
  | { readonly type: 'closed' }
  | { readonly type: 'notFound' }
  | { readonly type: 'message'; readonly message: ServerMessage };

/** Erreurs du serveur qui arrêtent tout : on ne se reconnecte pas. */
export const FATAL_ERRORS: readonly ErrorCode[] = ['version', 'full', 'token'];

export const NOT_FOUND_TEXT = 'Le lien est faux, ou la partie a été effacée après 24 heures sans activité.';

export function initialOnlineState(roomId: string): OnlineState {
  return {
    roomId,
    status: 'connecting',
    seat: null,
    stage: null,
    settings: null,
    decks: null,
    opening: null,
    view: null,
    before: null,
    log: [],
    seq: 0,
    clock: null,
    opponentConnected: false,
    fatal: null,
    notice: null,
  };
}

export function onlineReducer(state: OnlineState, event: OnlineEvent): OnlineState {
  switch (event.type) {
    case 'opened':
      return { ...state, status: 'open' };
    case 'closed':
      // Avant tout message, on se connecte encore ; ensuite, c'est une reconnexion.
      return state.fatal ? state : { ...state, status: state.stage === null && state.status === 'connecting' ? 'connecting' : 'reconnecting' };
    case 'notFound':
      return { ...state, fatal: { code: 'notFound', text: NOT_FOUND_TEXT } };
    case 'message':
      return onMessage(state, event.message);
  }
}

function onMessage(state: OnlineState, message: ServerMessage): OnlineState {
  switch (message.type) {
    case 'welcome':
      return { ...state, seat: message.seat, notice: null };
    case 'lobby':
      return { ...state, stage: 'lobby', settings: message.settings, decks: message.decks, notice: null };
    case 'opening':
      return { ...state, stage: 'opening', settings: message.settings, decks: message.decks, opening: message.opening, notice: null };
    case 'state': {
      // La nouvelle qui suit la précédente s'anime depuis elle ; après une (re)connexion, on repart de la vue reçue.
      const follows = state.view !== null && message.seq === state.seq + 1;
      return {
        ...state,
        stage: 'game',
        settings: message.settings,
        decks: message.decks,
        view: message.view,
        before: follows ? state.view : null,
        log: message.log,
        seq: message.seq,
        clock: message.clock,
        opponentConnected: message.opponentConnected,
        notice: null,
      };
    }
    case 'clock':
      return { ...state, clock: message.clock };
    case 'presence':
      return { ...state, opponentConnected: message.opponentConnected };
    case 'error':
      return FATAL_ERRORS.includes(message.code) ? { ...state, fatal: { code: message.code, text: message.text } } : { ...state, notice: message.text };
  }
}

/** La page à montrer. */
export function onlinePhase(state: OnlineState): OnlinePhase {
  if (state.fatal) return 'error';
  switch (state.stage) {
    case 'lobby':
      return state.seat === null ? 'join' : 'waiting';
    case 'opening':
      return state.opening ? 'opening' : 'loading';
    case 'game':
      return state.view ? 'playing' : 'loading';
    default:
      return 'loading';
  }
}

/** Bandeau de la partie : connexion perdue, adversaire déconnecté, ou un coup refusé. */
export function onlineBanner(state: OnlineState): string | null {
  if (state.status === 'reconnecting') return 'Connexion perdue : reconnexion…';
  if (state.view && state.view.winner === null && !state.opponentConnected) {
    return state.settings?.timer
      ? 'Ton adversaire s’est déconnecté : ses tours passeront à la fin de son temps.'
      : 'Ton adversaire s’est déconnecté : il peut revenir par le même lien.';
  }
  return state.notice;
}

/** Les réglages de l'écran de jeu, comme pour une partie locale ; `null` si la carte ou un deck n'existe pas ici. */
export function onlineSetup(settings: RoomSettings, decks: RoomDecks): Setup | null {
  const board = boardOf(settings.board);
  const host = deckOf(decks[1]);
  const guest = deckOf(decks[2]);
  if (!board || !host || !guest) return null;
  return {
    board,
    mode: settings.mode,
    economy: settings.economy,
    manaRules: settings.manaRules,
    ...(settings.victoryVp !== undefined ? { victoryVp: settings.victoryVp } : {}),
    decks: { 1: host, 2: guest },
    ai: null,
    timer: settings.timer,
  };
}

/** Les réglages de l'accueil, pour créer une partie en ligne (les decks : celui de l'hôte suit à part). */
export function roomSettingsOf(setup: Setup): RoomSettings {
  return {
    board: boardSlug(setup.board),
    mode: modeOf(setup),
    economy: setup.economy ?? 'classic',
    manaRules: manaRulesOf(setup),
    timer: setup.timer === true,
    victoryVp: victoryVpOf(setup),
  };
}

/** Les réglages d'une partie, une ligne chacun : ce que voit l'invité avant de rejoindre, et l'hôte qui l'attend. */
export function settingsLines(settings: RoomSettings, decks: RoomDecks): string[] {
  const board = boardOf(settings.board);
  return [
    `Carte : ${board?.name ?? settings.board}`,
    `Mode : ${settings.mode === 'contestation' ? 'Contestation' : 'Normal'}`,
    `Économie : ${settings.economy === 'reserve' ? 'Réserve' : 'Classique'}`,
    `Mana : génération max ${settings.manaRules.baseCap}, limite ${settings.manaRules.limit}`,
    `Minuteur : ${settings.timer ? `${TIMER_TEXT} de réflexion par tour` : 'sans'}`,
    `Victoire : ${settings.victoryVp ?? VICTORY_VP} VP`,
    `Deck de l’hôte (J1) : ${deckOf(decks[1])?.name ?? decks[1]}`,
  ];
}

/** Adresse de la connexion à la salle, sur le même hôte que la page. */
export function socketUrl(roomId: string, location: { readonly protocol: string; readonly host: string }): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/parties/${roomId}/ws`;
}

/** Crée une partie en ligne sur le serveur : son identifiant et le jeton de l'hôte, ou la raison du refus. */
export async function createOnlineGame(
  setup: Setup,
  post: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init),
): Promise<{ readonly id: string; readonly token: string } | { readonly error: string }> {
  let response: Response;
  try {
    response = await post('/api/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: roomSettingsOf(setup), deck: setup.decks[1].id }),
    });
  } catch {
    return { error: SERVER_DOWN };
  }
  const body = (await response.json().catch(() => null)) as { id?: unknown; token?: unknown; error?: unknown } | null;
  if (response.ok && typeof body?.id === 'string' && typeof body.token === 'string') return { id: body.id, token: body.token };
  if (typeof body?.error === 'string') return { error: body.error };
  return { error: SERVER_DOWN };
}

export const SERVER_DOWN =
  'Le serveur des parties en ligne ne répond pas. En local, lance-le avec « npm run online » (ou « npx wrangler dev » à côté de « npm run dev »).';

const tokenKey = (roomId: string) => `tcg-partie-${roomId}`;

/** Jeton de ma place dans cette partie, gardé par ce navigateur (il me reconnaît si je reviens). */
export function loadToken(roomId: string): string | null {
  try {
    return window.localStorage.getItem(tokenKey(roomId));
  } catch {
    return null;
  }
}

export function saveToken(roomId: string, token: string): void {
  try {
    window.localStorage.setItem(tokenKey(roomId), token);
  } catch {
    // Stockage indisponible : la place sera perdue si la page se recharge.
  }
}
