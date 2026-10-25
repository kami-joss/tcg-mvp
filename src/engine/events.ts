// Événements d'une action (handoff « Lot 2 ») : ce qui s'est passé, dans l'ordre, pour que l'interface le rejoue
// en animation. Le moteur les ajoute à l'état au fil de la résolution ; ils ne changent rien aux règles.
import type { GameEvent, GameState } from './types';

export function emit(state: GameState, ...events: GameEvent[]): GameState {
  return { ...state, events: [...state.events, ...events] };
}
