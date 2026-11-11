// Mise à jour immuable de l'état d'un joueur.
import { getCard } from './cards';
import { VICTORY_VP } from './config';
import { emit } from './events';
import type { CardCopy, CardId, GameState, ManaRules, PlayerId, PlayerState, Position, Unit } from './types';

export function opponent(player: PlayerId): PlayerId {
  return player === 1 ? 2 : 1;
}

export function updatePlayer(state: GameState, id: PlayerId, patch: Partial<Omit<PlayerState, 'id'>>): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...patch } } };
}

/**
 * VP pour gagner de la partie (§4.10, choisis à l'accueil) ; `VICTORY_VP` pour une partie gardée d'avant ce réglage (une
 * partie en ligne reprise après une mise à jour).
 */
export function getVictoryVp(state: { readonly victoryVp?: number }): number {
  return state.victoryVp ?? VICTORY_VP;
}

/** Ajoute des VP. Le premier joueur à atteindre les VP de la partie gagne immédiatement (SPEC.md §4.10). */
export function addVp(state: GameState, id: PlayerId, amount: number, pos: Position | null = null): GameState {
  if (amount === 0) return state;
  const vp = state.players[id].vp + amount;
  const next = updatePlayer(emit(state, { type: 'vp', player: id, amount, pos }), id, { vp });
  return next.winner === null && vp >= getVictoryVp(next) ? { ...next, winner: id } : next;
}

/**
 * Limite du mana (SPEC.md §4.2, §10) : le mana qu'un joueur peut avoir au total, réglée à l'accueil (10 par défaut), la
 * même dans les deux économies ; les terrains ne la changent pas.
 */
export function getManaLimit(state: { readonly manaRules: ManaRules }): number {
  return state.manaRules.limit;
}

/**
 * Ajoute (ou retire, si négatif) du mana. Un gain s'arrête à la limite (revenus du début de tour comme gains en cours de
 * tour, le surplus est perdu, validé le 2026-11-08) ; une dépense n'est pas touchée.
 */
export function addMana(state: GameState, id: PlayerId, amount: number, pos: Position | null = null): GameState {
  const mana = state.players[id].mana;
  const gain = amount > 0 ? Math.min(amount, Math.max(0, getManaLimit(state) - mana)) : amount;
  if (gain === 0) return state;
  return updatePlayer(emit(state, { type: 'mana', player: id, amount: gain, pos }), id, { mana: mana + gain });
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
 * a un. Un sort va au cimetière ; un monstre ou un terrain arrive sur le plateau, et n'ira au cimetière qu'en le quittant
 * (§4.3). Un sort n'y est jamais brillant : il ne l'est pas à l'écran (§10).
 */
export function takeFromGrimoire(state: GameState, cardId: CardId): GameState {
  const player = state.players[state.activePlayer];
  const spell = getCard(state.cards, cardId).kind === 'spell';
  const shiny = player.shiny?.includes(cardId) ?? false;
  const copy: CardCopy = shiny && !spell ? { cardId, shiny: true } : { cardId };
  return updatePlayer(state, player.id, {
    grimoire: withoutOne(player.grimoire, cardId),
    ...(spell ? { graveyard: [...player.graveyard, copy] } : {}),
    ...(shiny && player.shiny ? { shiny: withoutOne(player.shiny, cardId) } : {}),
  });
}

/** L'unité, brillante si l'exemplaire joué l'était. */
export function shine<T extends Unit>(unit: T, shiny: boolean): T {
  return shiny ? { ...unit, shiny: true } : unit;
}
