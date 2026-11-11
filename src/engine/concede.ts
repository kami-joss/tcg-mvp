// Abandon (parties en ligne, SPEC.md §7 ter) : un joueur abandonne la partie à tout moment, même pendant le tour de son
// adversaire, qui gagne aussitôt ; ou il la perd par absence. Ce n'est pas une action du joueur actif : la salle de jeu
// l'applique pour l'un ou l'autre joueur.
import { IllegalActionError } from './errors';
import { opponent } from './players';
import type { Concession, GameState, PlayerId } from './types';

/** `player` abandonne (ou perd par absence) : son adversaire gagne ; la partie est finie, plus aucune action n'est légale. */
export function concede(state: GameState, player: PlayerId, reason: Concession['reason'] = 'abandon'): GameState {
  if (state.winner !== null) throw new IllegalActionError(`La partie est terminée : J${state.winner} a gagné`);
  return { ...state, winner: opponent(player), concession: { player, reason }, events: [] };
}
