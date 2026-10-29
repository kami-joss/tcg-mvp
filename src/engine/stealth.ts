// Camouflage (Farceur, Pénombre, SPEC.md §5.6, §10) : un monstre caché à l'adversaire tant qu'aucun monstre ni terrain
// adverse n'est dans un rayon de N autour de lui.
// Le joueur actif agit sur ce qu'il voit : ses actions légales se calculent sans les monstres qu'il ne voit pas,
// puis se résolvent sur l'état réel, où ces monstres occupent leur case et peuvent l'interrompre.
import { radiusCells, samePos } from './board';
import { emit } from './events';
import { getKeyword, setUnit } from './units';
import { statusAmount } from './statuses';
import type { BoardState, GameState, PlayerId, Unit, UnitId } from './types';

/**
 * `unit` est invisible pour `viewer` : monstre adverse camouflé (mot-clé, ou statut posé par Pénombre), non révélé, sans
 * aucune unité de `viewer` (monstre ou terrain) dans un rayon de N autour de lui (la plus grande valeur de camouflage).
 */
export function isHiddenFrom(state: BoardState, unit: Unit, viewer: PlayerId): boolean {
  if (unit.kind !== 'monster' || unit.owner === viewer || unit.revealed) return false;
  const radii = [
    getKeyword(unit, 'camouflage')?.amount,
    ...unit.statuses.filter((s) => s.kind === 'camouflage').map(statusAmount),
  ].filter((n): n is number => n !== undefined);
  if (radii.length === 0) return false;
  const around = radiusCells(state.board, unit.pos, Math.max(...radii));
  return Object.values(state.units).every((other) => other.owner !== viewer || !around.some((cell) => samePos(cell, other.pos)));
}

/** Unités que `viewer` ne voit pas. */
export function getHiddenUnitIds(state: BoardState, viewer: PlayerId): UnitId[] {
  return Object.values(state.units)
    .filter((unit) => isHiddenFrom(state, unit, viewer))
    .map((unit) => unit.id);
}

/** L'état tel que le voit `viewer` : sans les monstres invisibles pour lui. */
export function perceivedBy<S extends BoardState>(state: S, viewer: PlayerId): S {
  const hidden = getHiddenUnitIds(state, viewer);
  if (hidden.length === 0) return state;
  const units = Object.fromEntries(Object.entries(state.units).filter(([id]) => !hidden.includes(id)));
  return { ...state, units };
}

/** L'état tel que le voit le joueur actif : c'est sur lui que ses actions sont proposées et validées. */
export function perceived(state: GameState): GameState {
  return perceivedBy(state, state.activePlayer);
}

/** Un monstre invisible qui bloque une action se révèle jusqu'à la fin du tour. */
export function reveal(state: GameState, unitId: UnitId): GameState {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster' || unit.revealed) return state;
  const revealed = { ...unit, revealed: true };
  return setUnit(emit(state, { type: 'revealed', unit: revealed }), revealed);
}
