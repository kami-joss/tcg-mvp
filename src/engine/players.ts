// Mise à jour immuable de l'état d'un joueur.
import { VICTORY_VP } from './config';
import { emit } from './events';
import type { CardId, GameState, PlayerId, PlayerState, Position } from './types';

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

/** Déplace un exemplaire de la carte du grimoire du joueur actif vers sa pile « utilisées », sans rien payer. */
export function takeFromGrimoire(state: GameState, cardId: CardId): GameState {
  const player = state.players[state.activePlayer];
  const index = player.grimoire.indexOf(cardId);
  return updatePlayer(state, player.id, {
    grimoire: [...player.grimoire.slice(0, index), ...player.grimoire.slice(index + 1)],
    used: [...player.used, cardId],
  });
}
