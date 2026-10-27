// Création de la partie (SPEC.md §4.1).
import { BOARD } from './board';
import { TEST_GRIMOIRE } from './cards';
import { startTurn } from './turns';
import type { Board, CardId, GameState, PlayerId, PlayerState } from './types';

/** Les exemplaires brillants qui sont bien dans le deck (un par exemplaire présent, au plus). */
function shinyCopies(deck: readonly CardId[], shiny: readonly CardId[]): readonly CardId[] {
  const left = [...deck];
  return shiny.filter((cardId) => {
    const index = left.indexOf(cardId);
    if (index < 0) return false;
    left.splice(index, 1);
    return true;
  });
}

function createPlayer(id: PlayerId, deck: readonly CardId[], shiny: readonly CardId[]): PlayerState {
  const copies = shinyCopies(deck, shiny);
  return { id, mana: 0, vp: 0, grimoire: [...deck], used: [], spellsThisTurn: [], ...(copies.length > 0 ? { shiny: copies } : {}) };
}

/**
 * Nouvelle partie, sur le plateau classique et avec le grimoire de test par défaut. `shiny` : les exemplaires brillants
 * de chaque deck (purement visuels).
 */
export function createGame(
  board: Board = BOARD,
  decks: Readonly<Record<PlayerId, readonly CardId[]>> = { 1: TEST_GRIMOIRE, 2: TEST_GRIMOIRE },
  shiny: Readonly<Record<PlayerId, readonly CardId[]>> = { 1: [], 2: [] },
): GameState {
  // Mise en place (§4.1), puis début du premier tour de J1, qui s'applique dès le tour 1 (§10).
  return startTurn({
    board,
    players: { 1: createPlayer(1, decks[1], shiny[1]), 2: createPlayer(2, decks[2], shiny[2]) },
    activePlayer: 1,
    turn: 1,
    units: {},
    traps: [],
    burningCells: [],
    nextUnitId: 1,
    winner: null,
    events: [],
  });
}
