// Déroulement d'une partie en hotseat (SPEC.md §4.3) : état complet, journal, et écran de passage entre
// deux tours ; ou contre l'IA d'entraînement (§7 bis) : pas d'écran de passage, l'écran montre toujours la vue du
// joueur humain. App.tsx n'en est que l'enveloppe React : toute la logique est ici, testée sans navigateur.
import { BATTLEFIELD_13, DECKS, IllegalActionError, applyAction, createGame, getPlayerView } from '../engine';
import type { Action, Board, Deck, GameMode, GameState, PlayerId } from '../engine';
import { logEntry } from './log';
import type { LogEntry } from './log';

/**
 * Carte, mode et deck de chaque joueur, choisis avant la partie ; `mode` : Normal par défaut, contestation seulement sur
 * une carte qui le propose (§4.4 bis) ; `ai` : le joueur tenu par l'IA (J2), s'il y en a un.
 */
export interface Setup {
  readonly board: Board;
  readonly mode?: GameMode;
  readonly decks: Readonly<Record<PlayerId, Deck>>;
  readonly ai?: PlayerId | null;
}

/** Le mode joué : contestation seulement si la carte le propose. */
export function modeOf(setup: Pick<Setup, 'board' | 'mode'>): GameMode {
  return setup.mode === 'contestation' && setup.board.contestation ? 'contestation' : 'normal';
}

/** Joueur dont l'écran montre la vue : le joueur actif en hotseat, toujours le joueur humain contre l'IA. */
export function viewerOf(session: Pick<Session, 'setup' | 'game'>): PlayerId {
  const { ai } = session.setup;
  if (ai) return ai === 1 ? 2 : 1;
  return session.game.activePlayer;
}

/** Partie proposée d'emblée : la grande carte 13 × 13 (handoff V7), en mode Normal, deck Classique des deux côtés. */
export const DEFAULT_SETUP: Setup = { board: BATTLEFIELD_13, mode: 'normal', decks: { 1: DECKS[0]!, 2: DECKS[0]! } };

/**
 * Lancer de dés d'ouverture (SPEC.md §4.1) : un dé à 6 faces par joueur ; en cas d'égalité, on relance. Le gagnant du
 * dernier lancer choisit s'il commence ; contre l'IA, l'IA qui gagne commence.
 */
export interface Opening {
  /** Les lancers, dans l'ordre : tous des égalités sauf le dernier. */
  readonly rolls: readonly Readonly<Record<PlayerId, number>>[];
  /** Le joueur au plus gros chiffre du dernier lancer. */
  readonly winner: PlayerId;
  /** Le joueur qui commence ; `null` tant que le gagnant n'a pas choisi. */
  readonly chosen: PlayerId | null;
}

/** Lance les dés jusqu'à départager les joueurs (`random` : un nombre de [0, 1[, injecté pour les tests). */
export function rollOpening(random: () => number = Math.random): Opening {
  const die = () => Math.floor(random() * 6) + 1;
  const rolls: Record<PlayerId, number>[] = [];
  for (;;) {
    const roll = { 1: die(), 2: die() };
    rolls.push(roll);
    if (roll[1] !== roll[2]) return { rolls, winner: roll[1] > roll[2] ? 1 : 2, chosen: null };
  }
}

export interface Session {
  /** Change à chaque nouvelle partie, pour repartir d'un écran neuf. */
  readonly id: number;
  readonly setup: Setup;
  /** État complet de la partie : l'autorité locale (le futur serveur). L'écran n'en reçoit que des vues. */
  readonly game: GameState;
  /** État d'avant la dernière action : l'écran rejoue ses événements à partir de là. */
  readonly previous: GameState | null;
  /** Journal : une entrée par action. */
  readonly log: readonly LogEntry[];
  /** Joueur à qui passer l'écran : tant qu'il n'a pas cliqué, rien de la partie n'est affiché. */
  readonly handoffTo: PlayerId | null;
  /** Lancer de dés d'ouverture en cours : tant qu'il l'est, personne ne joue et rien de la partie n'est affiché. */
  readonly opening: Opening | null;
}

export type SessionEvent =
  | { readonly type: 'play'; readonly action: Action }
  /** Le joueur suivant a pris l'écran, ou l'écran des dés est validé (l'IA qui gagne commence). */
  | { readonly type: 'ready' }
  /** Le gagnant du lancer de dés choisit le joueur qui commence. */
  | { readonly type: 'chooseFirst'; readonly first: PlayerId }
  /** Nouvelle partie, avec la carte et les decks choisis (les mêmes par défaut), et son lancer de dés s'il y en a un. */
  | { readonly type: 'restart'; readonly setup?: Setup; readonly opening?: Opening };

/** Phrase du lancer de dés pour le journal : « J1 3 · J2 3 (égalité, on relance), J1 5 · J2 2. J1 commence. » */
function openingText({ rolls }: Opening, first: PlayerId, winner: PlayerId): string {
  const shown = rolls.map((roll, i) => `J1 ${roll[1]} · J2 ${roll[2]}${i < rolls.length - 1 ? ' (égalité, on relance)' : ''}`).join(', ');
  return `Lancer de dés : ${shown}. J${winner} a le plus gros chiffre${first === winner ? ' et choisit de commencer' : ` et laisse J${first} commencer`}.`;
}

function startLog(setup: Setup, game: GameState, opening: Opening | null, first: PlayerId): LogEntry[] {
  const { board, decks } = setup;
  const mode = game.mode;
  const player = game.players[first];
  return [
    {
      kind: 'start',
      player: null,
      icon: 'castle',
      text: `Début de la partie sur la carte « ${board.name} »${mode === 'contestation' ? ', en mode contestation' : ''}, J1 avec le deck ${decks[1].name}, J2 avec le deck ${decks[2].name}.`,
      items: [],
    },
    ...(opening ? [{ kind: 'start' as const, player: null, icon: 'laurels' as const, text: openingText(opening, first, opening.winner), items: [] }] : []),
    {
      kind: 'turn',
      player: first,
      icon: 'water-drop',
      text: `J${first} commence avec ${player.mana} mana.`,
      items: [],
      turn: { number: game.turn, player: first, mana: player.mana, vp: 0 },
    },
  ];
}

function startGame(setup: Setup, first: PlayerId): GameState {
  const { board, decks } = setup;
  return createGame(
    board,
    { 1: decks[1].cards, 2: decks[2].cards },
    { 1: decks[1].shiny ?? [], 2: decks[2].shiny ?? [] },
    modeOf(setup),
    first,
  );
}

/**
 * Nouvelle partie. Avec un lancer de dés (`opening`), la partie n'est jouable qu'après le choix du gagnant (`chooseFirst`),
 * ou, si c'est l'IA qui gagne, après le clic pour commencer : elle commence. Sans lancer, J1 commence (essais, tests).
 */
export function newSession(id: number, setup: Setup = DEFAULT_SETUP, opening: Opening | null = null): Session {
  const aiWins = opening !== null && setup.ai === opening.winner;
  const decided = opening === null || aiWins;
  const first: PlayerId = aiWins ? opening.winner : 1;
  const game = startGame(setup, first);
  return {
    id,
    setup,
    game,
    previous: null,
    log: startLog(setup, game, decided ? opening : null, first),
    handoffTo: null,
    opening: opening === null ? null : { ...opening, chosen: aiWins ? first : null },
  };
}

export function updateSession(session: Session, event: SessionEvent): Session {
  switch (event.type) {
    case 'play':
      return play(session, event.action);
    case 'ready':
      return { ...session, handoffTo: null, opening: session.opening?.chosen != null ? null : session.opening };
    case 'chooseFirst': {
      const { opening } = session;
      if (!opening || opening.chosen !== null) return session;
      const game = startGame(session.setup, event.first);
      return { ...session, game, log: startLog(session.setup, game, opening, event.first), opening: null };
    }
    case 'restart':
      return newSession(session.id + 1, event.setup ?? session.setup, event.opening ?? null);
  }
}

function play(session: Session, action: Action): Session {
  // Pendant le passage d'écran ou le lancer de dés, personne ne joue.
  if (session.handoffTo !== null || session.opening !== null) return session;
  const { game } = session;
  try {
    const next = applyAction(game, action);
    const viewer = game.activePlayer;
    const entry = logEntry(getPlayerView(game, viewer), action, getPlayerView(next, viewer));
    // Entre deux tours, l'écran est masqué jusqu'à ce que le joueur suivant le prenne ; inutile si la partie est finie.
    // Contre l'IA, un seul humain : pas d'écran de passage.
    const turnChanged = next.activePlayer !== game.activePlayer && next.winner === null && !session.setup.ai;
    return {
      ...session,
      game: next,
      previous: game,
      log: [...session.log, entry],
      handoffTo: turnChanged ? next.activePlayer : null,
    };
  } catch (error) {
    if (!(error instanceof IllegalActionError)) throw error;
    const refused: LogEntry = { kind: 'refused', player: game.activePlayer, icon: 'knockout', text: `Action refusée : ${error.message}`, items: [] };
    return { ...session, log: [...session.log, refused] };
  }
}
