// Création de la partie (SPEC.md §4.1).
import { BOARD } from './board';
import { TEST_GRIMOIRE } from './cards';
import { startTurn } from './turns';
import type { Board, CardId, GameState, PlayerId, PlayerState } from './types';

function createPlayer(id: PlayerId, deck: readonly CardId[]): PlayerState {
  return { id, mana: 0, vp: 0, grimoire: [...deck], used: [], spellsThisTurn: [] };
}

/** Nouvelle partie, sur le plateau classique et avec le grimoire de test par défaut. */
export function createGame(
  board: Board = BOARD,
  decks: Readonly<Record<PlayerId, readonly CardId[]>> = { 1: TEST_GRIMOIRE, 2: TEST_GRIMOIRE },
): GameState {
  // Mise en place (§4.1), puis début du premier tour de J1, qui s'applique dès le tour 1 (§10).
  return startTurn({
    board,
    players: { 1: createPlayer(1, decks[1]), 2: createPlayer(2, decks[2]) },
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
