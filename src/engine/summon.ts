// Invoquer un monstre (SPEC.md §4.5) : depuis le grimoire en jouant la carte, ou par l'effet d'un Invocateur.
import { getSummonZone } from './board';
import { getTerrainCard } from './cards';
import { emit } from './events';
import { addMana, shine, takeFromGrimoire } from './players';
import { NEW_MOVEMENT, enterCell } from './traps';
import { addUnit, createMonsterUnit, getMonsterAt, getUnitsAt } from './units';
import type { BoardState, GameState, MonsterCard, PlayerId, Position } from './types';

/**
 * Cases d'invocation libres du camp de `player` : celles de sa zone d'invocation sans aucune unité, et celles de ses
 * terrains « Point d'invocation » sans monstre (§4.5).
 */
export function getFreeSummonCells(state: BoardState, player: PlayerId): Position[] {
  const zone = getSummonZone(state.board, player).filter((pos) => getUnitsAt(state, pos).length === 0);
  const points = Object.values(state.units).flatMap((unit) =>
    unit.kind === 'terrain' && unit.owner === player && getTerrainCard(unit.cardId).summonPoint && !getMonsterAt(state, unit.pos)
      ? [unit.pos]
      : [],
  );
  return [...zone, ...points];
}

/**
 * Pose le monstre de `card` pour `player` en `pos` : il peut agir aussitôt (§4.5). Il entre sur sa case : un piège
 * ennemi ou un terrain « Passage » s'y déclenche (§10).
 */
export function placeSummonedMonster(
  state: GameState,
  player: PlayerId,
  card: MonsterCard,
  pos: Position,
  shiny = false,
): GameState {
  const id = `u${state.nextUnitId}`;
  const unit = shine(createMonsterUnit(id, card, player, pos, state.turn, state.board.mobilityBonus), shiny);
  return enterCell(addUnit(emit(state, { type: 'summon', unit }), () => unit), id, NEW_MOVEMENT).state;
}

/** Paie le coût de la carte et la déplace du grimoire vers la pile « utilisées ». */
export function payCard(state: GameState, player: PlayerId, card: { readonly id: MonsterCard['id']; readonly cost: number }): GameState {
  return takeFromGrimoire(addMana(state, player, -card.cost), card.id);
}
