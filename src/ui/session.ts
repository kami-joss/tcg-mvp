// Déroulement d'une partie en hotseat (SPEC.md §4.3) : état complet, journal, et écran de passage entre
// deux tours ; ou contre l'IA d'entraînement (§7 bis) : pas d'écran de passage, l'écran montre toujours la vue du
// joueur humain. App.tsx n'en est que l'enveloppe React : toute la logique est ici, testée sans navigateur.
import { BOARD, DECKS, IllegalActionError, applyAction, createGame, getPlayerView } from '../engine';
import type { Action, Board, Deck, GameState, PlayerId } from '../engine';
import { describeAction } from './log';

/** Carte et deck de chaque joueur, choisis avant la partie ; `ai` : le joueur tenu par l'IA (J2), s'il y en a un. */
export interface Setup {
  readonly board: Board;
  readonly decks: Readonly<Record<PlayerId, Deck>>;
  readonly ai?: PlayerId | null;
}

/** Joueur dont l'écran montre la vue : le joueur actif en hotseat, toujours le joueur humain contre l'IA. */
export function viewerOf(session: Pick<Session, 'setup' | 'game'>): PlayerId {
  const { ai } = session.setup;
  if (ai) return ai === 1 ? 2 : 1;
  return session.game.activePlayer;
}

export const DEFAULT_SETUP: Setup = { board: BOARD, decks: { 1: DECKS[0]!, 2: DECKS[0]! } };

export interface Session {
  /** Change à chaque nouvelle partie, pour repartir d'un écran neuf. */
  readonly id: number;
  readonly setup: Setup;
  /** État complet de la partie : l'autorité locale (le futur serveur). L'écran n'en reçoit que des vues. */
  readonly game: GameState;
  /** État d'avant la dernière action : l'écran rejoue ses événements à partir de là. */
  readonly previous: GameState | null;
  readonly log: readonly string[];
  /** Joueur à qui passer l'écran : tant qu'il n'a pas cliqué, rien de la partie n'est affiché. */
  readonly handoffTo: PlayerId | null;
}

export type SessionEvent =
  | { readonly type: 'play'; readonly action: Action }
  /** Le joueur suivant a pris l'écran. */
  | { readonly type: 'ready' }
  /** Nouvelle partie, avec la carte et les decks choisis (les mêmes par défaut). */
  | { readonly type: 'restart'; readonly setup?: Setup };

export function newSession(id: number, setup: Setup = DEFAULT_SETUP): Session {
  const { board, decks } = setup;
  const game = createGame(board, { 1: decks[1].cards, 2: decks[2].cards });
  const first = game.players[game.activePlayer];
  return {
    id,
    setup,
    game,
    previous: null,
    log: [
      `Début de la partie sur la carte « ${board.name} », J1 avec le deck ${decks[1].name}, J2 avec le deck ${decks[2].name}.`,
      `J${first.id} commence avec ${first.mana} mana.`,
    ],
    handoffTo: null,
  };
}

export function updateSession(session: Session, event: SessionEvent): Session {
  switch (event.type) {
    case 'play':
      return play(session, event.action);
    case 'ready':
      return { ...session, handoffTo: null };
    case 'restart':
      return newSession(session.id + 1, event.setup ?? session.setup);
  }
}

function play(session: Session, action: Action): Session {
  // Pendant le passage d'écran, personne ne joue.
  if (session.handoffTo !== null) return session;
  const { game } = session;
  try {
    const next = applyAction(game, action);
    const viewer = game.activePlayer;
    const lines = describeAction(getPlayerView(game, viewer), action, getPlayerView(next, viewer));
    // Entre deux tours, l'écran est masqué jusqu'à ce que le joueur suivant le prenne ; inutile si la partie est finie.
    // Contre l'IA, un seul humain : pas d'écran de passage.
    const turnChanged = next.activePlayer !== game.activePlayer && next.winner === null && !session.setup.ai;
    return {
      ...session,
      game: next,
      previous: game,
      log: [...session.log, ...lines],
      handoffTo: turnChanged ? next.activePlayer : null,
    };
  } catch (error) {
    if (!(error instanceof IllegalActionError)) throw error;
    return { ...session, log: [...session.log, `Action refusée : ${error.message}`] };
  }
}
