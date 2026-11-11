// Parties en ligne (SPEC.md §7 ter) : ce que se disent l'écran d'un joueur et le serveur, et les réglages d'une partie.
// Le serveur fait autorité : il n'envoie à chacun que sa vue (`getPlayerView`), le journal (public, §7 ter) et l'horloge ;
// jamais l'action d'un coup adverse, qui peut contenir la case d'un piège ou d'un monstre invisible. Rien ici ne touche au
// réseau : `room.ts` fait la logique de la salle, le serveur (Cloudflare) ne fait que transmettre.
import { BOARDS, DECKS } from '../engine';
import type { Action, Board, Deck, Economy, GameMode, ManaRules, PlayerId, PlayerView } from '../engine';
import type { LogEntry } from '../ui/log';
import { boardSlug } from '../ui/routes';
import { MANA_CHOICES, isVictoryChoice } from '../ui/session';
import type { Opening } from '../ui/session';
import type { ExternalClock } from '../ui/turnTimer';

/** Réglages d'une partie en ligne, choisis par l'hôte à l'accueil (§4.2, §4.4 bis). */
export interface RoomSettings {
  /** La carte, par son identifiant d'adresse (`boardSlug`). */
  readonly board: string;
  readonly mode: GameMode;
  readonly economy: Economy;
  readonly manaRules: ManaRules;
  /** Minuteur de tour (option « Minuteur », §4.2). */
  readonly timer: boolean;
  /** VP pour gagner (§4.10) ; absent dans une salle créée avant ce réglage : 30. */
  readonly victoryVp?: number;
}

/** Les decks des deux joueurs, par identifiant ; celui de l'invité tant qu'il n'a pas rejoint : `null`. */
export type RoomDecks = Readonly<{ 1: string; 2: string | null }>;

/** Écran d'un joueur → serveur. */
export type ClientMessage =
  /** À la connexion : la version de son jeu, et son jeton s'il a déjà une place (reconnexion). */
  | { readonly type: 'hello'; readonly version: string; readonly token: string | null }
  /** L'invité prend la place libre, avec le deck qu'il a choisi. */
  | { readonly type: 'join'; readonly deck: string }
  /** Le gagnant du lancer de dés choisit qui commence. */
  | { readonly type: 'chooseFirst'; readonly first: PlayerId }
  /** Un coup du joueur actif. */
  | { readonly type: 'play'; readonly action: Action }
  /** Son écran a fini d'animer la nouvelle `seq` : le chrono peut repartir. */
  | { readonly type: 'idle'; readonly seq: number }
  /** Il abandonne (à tout moment de la partie). */
  | { readonly type: 'concede' };

/** Pourquoi le serveur refuse : version, place déjà prise, jeton inconnu, message illisible, coup refusé. */
export type ErrorCode = 'version' | 'full' | 'token' | 'invalid' | 'refused';

/** Serveur → écran d'un joueur. */
export type ServerMessage =
  /** Sa place dans la partie, et son jeton (à garder pour se reconnecter). */
  | { readonly type: 'welcome'; readonly seat: PlayerId; readonly token: string }
  /** La partie attend son invité : ses réglages et le deck de l'hôte (l'invité choisit le sien). */
  | { readonly type: 'lobby'; readonly settings: RoomSettings; readonly decks: RoomDecks }
  /** Lancer de dés d'ouverture (§4.1) : le gagnant choisit qui commence. */
  | { readonly type: 'opening'; readonly settings: RoomSettings; readonly decks: RoomDecks; readonly opening: Opening }
  /**
   * La partie, vue par ce joueur : sa vue, le journal, l'horloge (si la partie a un minuteur) et si l'adversaire est
   * connecté. `seq` : numéro de cette nouvelle, que l'écran renvoie quand il a fini de l'animer (`idle`).
   */
  | {
      readonly type: 'state';
      readonly seq: number;
      readonly settings: RoomSettings;
      readonly decks: RoomDecks;
      readonly view: PlayerView;
      readonly log: readonly LogEntry[];
      readonly clock: ExternalClock | null;
      readonly opponentConnected: boolean;
    }
  /** L'horloge repart (fin des animations, ou attente écoulée). */
  | { readonly type: 'clock'; readonly clock: ExternalClock }
  /** L'adversaire vient de se connecter ou de se déconnecter. */
  | { readonly type: 'presence'; readonly opponentConnected: boolean }
  | { readonly type: 'error'; readonly code: ErrorCode; readonly text: string };

/** La carte d'un identifiant d'adresse. */
export const boardOf = (slug: string): Board | undefined => BOARDS.find((board) => boardSlug(board) === slug);

export const deckOf = (id: string | null): Deck | undefined => (id === null ? undefined : DECKS.find((deck) => deck.id === id));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isSeat = (value: unknown): value is PlayerId => value === 1 || value === 2;

/** Réglages de l'hôte, vérifiés comme à l'accueil ; sinon, la raison. */
export function checkSettings(data: unknown): RoomSettings | { readonly error: string } {
  if (!isRecord(data)) return { error: 'Réglages illisibles.' };
  const board = typeof data.board === 'string' ? boardOf(data.board) : undefined;
  if (!board) return { error: 'Carte inconnue.' };
  if (data.mode !== 'normal' && data.mode !== 'contestation') return { error: 'Mode inconnu.' };
  if (data.mode === 'contestation' && !board.contestation) return { error: 'Cette carte ne propose pas le mode contestation.' };
  if (data.economy !== 'classic' && data.economy !== 'reserve') return { error: 'Économie inconnue.' };
  const rules = data.manaRules;
  if (!isRecord(rules)) return { error: 'Réglages du mana illisibles.' };
  for (const key of ['baseCap', 'limit'] as const) {
    const value = rules[key];
    const { min, max } = MANA_CHOICES[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return { error: 'Réglages du mana hors des valeurs de l’accueil.' };
  }
  if (typeof data.timer !== 'boolean') return { error: 'Minuteur illisible.' };
  if (data.victoryVp !== undefined && !isVictoryChoice(data.victoryVp)) return { error: 'VP pour gagner hors des valeurs de l’accueil.' };
  return {
    board: data.board as string,
    mode: data.mode,
    economy: data.economy,
    manaRules: { baseCap: rules.baseCap as number, limit: rules.limit as number },
    timer: data.timer,
    ...(data.victoryVp !== undefined ? { victoryVp: data.victoryVp } : {}),
  };
}

/**
 * Un message reçu, vérifié dans sa forme ; `null` s'il est illisible. Un coup n'est vérifié qu'en surface (un objet à
 * `type`) : c'est le moteur qui le juge.
 */
export function parseClientMessage(data: unknown): ClientMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case 'hello':
      return typeof data.version === 'string' && (data.token === null || typeof data.token === 'string')
        ? { type: 'hello', version: data.version, token: data.token }
        : null;
    case 'join':
      return typeof data.deck === 'string' ? { type: 'join', deck: data.deck } : null;
    case 'chooseFirst':
      return isSeat(data.first) ? { type: 'chooseFirst', first: data.first } : null;
    case 'play':
      return isRecord(data.action) && typeof data.action.type === 'string' ? { type: 'play', action: data.action as unknown as Action } : null;
    case 'idle':
      return typeof data.seq === 'number' && Number.isInteger(data.seq) ? { type: 'idle', seq: data.seq } : null;
    case 'concede':
      return { type: 'concede' };
    default:
      return null;
  }
}
