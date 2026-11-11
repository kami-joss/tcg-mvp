// Contrôle des mana zones (SPEC.md §4.4, mode contestation §4.4 bis) et mana qu'elles rapportent (§4.2, §5, §6).
import { getCell, getManaZones, isOnBoard, samePos } from './board';
import { getTerrainCard } from './cards';
import { MANA_PER_CONTROLLED_ZONE } from './config';
import { getKeyword, getMonsterAt, getUnitsAt } from './units';
import type { Board, GameMode, ManaZoneId, PlayerId, Position, ZoneState, ZoneStatus } from './types';

/**
 * Cases de la zone de la mana zone en `pos` : la case seule en mode Normal ; en mode contestation, le carré 3 × 3 dont
 * elle est le centre, cases X comprises (personne ne s'y tient), sans les cases hors plateau (§4.4 bis).
 */
export function getZoneCells(board: Board, mode: GameMode, pos: Position): Position[] {
  if (mode === 'normal') return [pos];
  const cells: Position[] = [];
  for (let row = pos.row - 1; row <= pos.row + 1; row++) {
    for (let col = pos.col - 1; col <= pos.col + 1; col++) {
      const cell = { row, col };
      if (isOnBoard(board, cell)) cells.push(cell);
    }
  }
  return cells;
}

/** La mana zone dont la zone contient `pos`, s'il y en a une. */
export function getZoneOf(board: Board, mode: GameMode, pos: Position): { zone: ManaZoneId; pos: Position } | null {
  return getManaZones(board).find((zone) => getZoneCells(board, mode, zone.pos).some((cell) => samePos(cell, pos))) ?? null;
}

/**
 * Qui tient la mana zone en `pos`. Mode Normal : le joueur dont un monstre l'occupe, sinon celui dont un terrain
 * l'occupe, sinon personne (§4.4). Mode contestation : un terrain dans la zone la tient pour son propriétaire, quel que
 * soit le nombre de monstres ennemis ; sinon on compte les **monstres** de chaque joueur (1 chacun, camouflés compris) : le
 * plus nombreux la tient (supériorité numérique), à égalité avec des monstres des deux camps elle est **contestée**, sans
 * monstre elle est neutre (§4.4 bis). Personne aussi si `pos` n'est pas une mana zone.
 */
export function getZoneStatus(state: ZoneState, pos: Position): ZoneStatus {
  const cell = getCell(state.board, pos);
  if (cell.kind !== 'plain' || cell.manaZone === null) return { pos, controller: null, contested: false };
  if (state.mode === 'normal') {
    const occupant = getMonsterAt(state, pos) ?? getUnitsAt(state, pos).find((unit) => unit.kind === 'terrain');
    return { pos, controller: occupant?.owner ?? null, contested: false };
  }
  const count: Record<PlayerId, number> = { 1: 0, 2: 0 };
  const terrainOwners = new Set<PlayerId>();
  for (const zoneCell of getZoneCells(state.board, state.mode, pos)) {
    for (const unit of getUnitsAt(state, zoneCell)) {
      if (unit.kind === 'terrain') terrainOwners.add(unit.owner);
      else count[unit.owner]++;
    }
  }
  // Un terrain tient la zone : jamais pris par le nombre de monstres (deux terrains adverses, cas rare : contestée).
  if (terrainOwners.size === 1) return { pos, controller: [...terrainOwners][0]!, contested: false };
  if (terrainOwners.size === 2) return { pos, controller: null, contested: true };
  if (count[1] === count[2]) return { pos, controller: null, contested: count[1] > 0 };
  return { pos, controller: count[1] > count[2] ? 1 : 2, contested: false };
}

/** Joueur qui tient la mana zone en `pos` ; `null` si elle est neutre ou contestée. */
export function getZoneController(state: ZoneState, pos: Position): PlayerId | null {
  return getZoneStatus(state, pos).controller;
}

export function getControlledZones(state: ZoneState, player: PlayerId): { zone: ManaZoneId; pos: Position }[] {
  return getManaZones(state.board).filter(({ pos }) => getZoneController(state, pos) === player);
}

/**
 * Mana que rapporte une mana zone à `controller` (par défaut, celui qui la tient) : rien sans un de ses terrains dans la
 * zone (un monstre seul n'en génère pas, §4.2) ; sinon la base, + le bonus de son terrain (Autel de mana), + le bonus de
 * ses monstres `etendard` dans la zone (sur la case en mode Normal). Les bonus se cumulent (§10).
 */
export function getZoneMana(state: ZoneState, pos: Position, controller = getZoneController(state, pos)): number {
  const units = getZoneCells(state.board, state.mode, pos)
    .flatMap((cell) => getUnitsAt(state, cell))
    .filter((unit) => unit.owner === controller);
  if (!units.some((unit) => unit.kind === 'terrain')) return 0;
  return units.reduce(
    (mana, unit) =>
      mana +
      (unit.kind === 'terrain' ? getTerrainCard(state.cards, unit.cardId).zoneManaBonus : (getKeyword(state.cards, unit, 'etendard')?.amount ?? 0)),
    MANA_PER_CONTROLLED_ZONE,
  );
}
