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
 * l'occupe, sinon personne (§4.4). Mode contestation : un terrain de la zone la tient pour son propriétaire ; sans
 * terrain, le seul joueur qui y a des monstres ; les deux : contestée (§4.4 bis). Personne aussi si `pos` n'est pas
 * une mana zone.
 */
export function getZoneStatus(state: ZoneState, pos: Position): ZoneStatus {
  const cell = getCell(state.board, pos);
  if (cell.kind !== 'plain' || cell.manaZone === null) return { pos, controller: null, contested: false };
  if (state.mode === 'normal') {
    const occupant = getMonsterAt(state, pos) ?? getUnitsAt(state, pos).find((unit) => unit.kind === 'terrain');
    return { pos, controller: occupant?.owner ?? null, contested: false };
  }
  const units = getZoneCells(state.board, state.mode, pos).flatMap((zoneCell) => getUnitsAt(state, zoneCell));
  const terrains = units.filter((unit) => unit.kind === 'terrain');
  const holders = new Set((terrains.length > 0 ? terrains : units).map((unit) => unit.owner));
  const [controller = null] = holders;
  return holders.size > 1 ? { pos, controller: null, contested: true } : { pos, controller, contested: false };
}

/** Joueur qui tient la mana zone en `pos` ; `null` si elle est neutre ou contestée. */
export function getZoneController(state: ZoneState, pos: Position): PlayerId | null {
  return getZoneStatus(state, pos).controller;
}

export function getControlledZones(state: ZoneState, player: PlayerId): { zone: ManaZoneId; pos: Position }[] {
  return getManaZones(state.board).filter(({ pos }) => getZoneController(state, pos) === player);
}

/**
 * Mana que rapporte une mana zone à `controller` (par défaut, celui qui la tient) : la base, + le bonus de son terrain
 * (Autel de mana), + le bonus de ses monstres `etendard` dans la zone (sur la case en mode Normal). Les bonus se
 * cumulent (§10).
 */
export function getZoneMana(state: ZoneState, pos: Position, controller = getZoneController(state, pos)): number {
  const units = getZoneCells(state.board, state.mode, pos)
    .flatMap((cell) => getUnitsAt(state, cell))
    .filter((unit) => unit.owner === controller);
  return units.reduce(
    (mana, unit) =>
      mana +
      (unit.kind === 'terrain' ? getTerrainCard(unit.cardId).zoneManaBonus : (getKeyword(unit, 'etendard')?.amount ?? 0)),
    MANA_PER_CONTROLLED_ZONE,
  );
}
