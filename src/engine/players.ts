// Mise à jour immuable de l'état d'un joueur.
import { VICTORY_VP } from './config';
import { emit } from './events';
import type { CardId, GameState, PlayerId, PlayerState, Position, Unit } from './types';

export function opponent(player: PlayerId): PlayerId {
  return player === 1 ? 2 : 1;
}

export function updatePlayer(state: GameState, id: PlayerId, patch: Partial<Omit<PlayerState, 'id'>>): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...patch } } };
}

/** Ajoute des VP. Le premier joueur à atteindre `VICTORY_VP` gagne immédiatement (SPEC.md §4.10). */
export function addVp(state: GameState, id: PlayerId, amount: number, pos: Position | null = null): GameState {
  if (amount === 0) return state;
  const vp = state.players[id].vp + amount;
  const next = updatePlayer(emit(state, { type: 'vp', player: id, amount, pos }), id, { vp });
  return next.winner === null && vp >= VICTORY_VP ? { ...next, winner: id } : next;
}

/** Ajoute (ou retire, si négatif) du mana. */
export function addMana(state: GameState, id: PlayerId, amount: number, pos: Position | null = null): GameState {
  if (amount === 0) return state;
  return updatePlayer(emit(state, { type: 'mana', player: id, amount, pos }), id, { mana: state.players[id].mana + amount });
}

/** Sans le premier `cardId` de la liste. */
const withoutOne = (cards: readonly CardId[], cardId: CardId): readonly CardId[] => {
  const index = cards.indexOf(cardId);
  return index < 0 ? cards : [...cards.slice(0, index), ...cards.slice(index + 1)];
};

/** L'exemplaire de cette carte que le joueur jouerait maintenant est brillant (ils partent en premier). */
export function isShinyCopy(state: GameState, id: PlayerId, cardId: CardId): boolean {
  return state.players[id].shiny?.includes(cardId) ?? false;
}

/**
 * Déplace un exemplaire de la carte du grimoire du joueur actif vers sa pile « utilisées », sans rien payer ; un
 * exemplaire brillant d'abord, s'il en a un.
 */
export function takeFromGrimoire(state: GameState, cardId: CardId): GameState {
  const player = state.players[state.activePlayer];
  return updatePlayer(state, player.id, {
    grimoire: withoutOne(player.grimoire, cardId),
    used: [...player.used, cardId],
    ...(player.shiny?.includes(cardId) ? { shiny: withoutOne(player.shiny, cardId) } : {}),
  });
}

/** L'unité, brillante si l'exemplaire joué l'était. */
export function shine<T extends Unit>(unit: T, shiny: boolean): T {
  return shiny ? { ...unit, shiny: true } : unit;
}
