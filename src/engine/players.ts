// Mise à jour immuable de l'état d'un joueur.
import { getCard } from './cards';
import { RESERVE_LIMIT_PER_TERRAIN, RESERVE_MANA_LIMIT, VICTORY_VP } from './config';
import { emit } from './events';
import type { CardCopy, CardId, GameState, PlayerId, PlayerState, Position, Unit } from './types';
import type { Economy } from './types';

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

/**
 * Limite de la réserve de mana (économie « Réserve ») : 10, plus 1 par terrain du joueur sur le plateau ; `null` en
 * économie classique (pas de limite).
 */
export function getManaLimit(state: { readonly economy: Economy; readonly units: GameState['units'] }, id: PlayerId): number | null {
  if (state.economy !== 'reserve') return null;
  const terrains = Object.values(state.units).filter((unit) => unit.kind === 'terrain' && unit.owner === id).length;
  return RESERVE_MANA_LIMIT + RESERVE_LIMIT_PER_TERRAIN * terrains;
}

/**
 * Ajoute (ou retire, si négatif) du mana. Économie « Réserve » : un gain s'arrête à la limite (revenus comme gains en
 * cours de tour, validé le 2026-11-08).
 */
export function addMana(state: GameState, id: PlayerId, amount: number, pos: Position | null = null): GameState {
  const limit = getManaLimit(state, id);
  const mana = state.players[id].mana;
  const gain = amount > 0 && limit !== null ? Math.min(amount, Math.max(0, limit - mana)) : amount;
  if (gain === 0) return state;
  return updatePlayer(emit(state, { type: 'mana', player: id, amount: gain, pos }), id, { mana: mana + gain });
}

/** Économie « Réserve » : la réserve qui dépasse la limite (un terrain détruit l'a baissée) y est ramenée tout de suite. */
export function clampMana(state: GameState, id: PlayerId): GameState {
  const limit = getManaLimit(state, id);
  const mana = state.players[id].mana;
  return limit !== null && mana > limit ? addMana(state, id, limit - mana) : state;
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
 * Retire un exemplaire de la carte du grimoire du joueur actif, sans rien payer ; un exemplaire brillant d'abord, s'il en
 * a un. La carte s'ajoute à ses cartes jouées ; un sort va au cimetière ; un monstre ou un terrain n'y ira qu'en quittant
 * le plateau (§4.3). Un sort n'y est jamais brillant : il ne l'est pas à l'écran (§10).
 */
export function takeFromGrimoire(state: GameState, cardId: CardId): GameState {
  const player = state.players[state.activePlayer];
  const spell = getCard(cardId).kind === 'spell';
  const shiny = player.shiny?.includes(cardId) ?? false;
  const copy: CardCopy = shiny && !spell ? { cardId, shiny: true } : { cardId };
  return updatePlayer(state, player.id, {
    grimoire: withoutOne(player.grimoire, cardId),
    played: [...player.played, copy],
    ...(spell ? { graveyard: [...player.graveyard, copy] } : {}),
    ...(shiny && player.shiny ? { shiny: withoutOne(player.shiny, cardId) } : {}),
  });
}

/** L'unité, brillante si l'exemplaire joué l'était. */
export function shine<T extends Unit>(unit: T, shiny: boolean): T {
  return shiny ? { ...unit, shiny: true } : unit;
}
