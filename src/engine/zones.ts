// Contrôle des mana zones (SPEC.md §4.4) et mana qu'elles rapportent (§4.2, §5, §6).
import { getCell, getManaZones } from './board';
import { getTerrainCard } from './cards';
import { MANA_PER_CONTROLLED_ZONE } from './config';
import { getKeyword, getMonsterAt, getUnitsAt } from './units';
import type { BoardState, ManaZoneId, PlayerId, Position } from './types';

/**
 * Joueur qui contrôle la mana zone en `pos` : celui dont un monstre l'occupe, sinon celui dont
 * un terrain l'occupe, sinon personne (zone neutre). `null` aussi si `pos` n'est pas une mana zone.
 */
export function getZoneController(state: BoardState, pos: Position): PlayerId | null {
  const cell = getCell(state.board, pos);
  if (cell.kind !== 'plain' || cell.manaZone === null) return null;
  const occupant = getMonsterAt(state, pos) ?? getUnitsAt(state, pos).find((unit) => unit.kind === 'terrain');
  return occupant?.owner ?? null;
}

export function getControlledZones(state: BoardState, player: PlayerId): { zone: ManaZoneId; pos: Position }[] {
  return getManaZones(state.board).filter(({ pos }) => getZoneController(state, pos) === player);
}

/**
 * Mana que rapporte une mana zone à celui qui la contrôle : la base, + le bonus de son terrain
 * (Autel de mana), + le bonus du monstre `etendard` qui l'occupe. Les bonus se cumulent (§10).
 */
export function getZoneMana(state: BoardState, pos: Position): number {
  const terrain = getUnitsAt(state, pos).find((unit) => unit.kind === 'terrain');
  const monster = getMonsterAt(state, pos);
  return (
    MANA_PER_CONTROLLED_ZONE +
    (terrain ? getTerrainCard(terrain.cardId).zoneManaBonus : 0) +
    (monster ? (getKeyword(monster, 'etendard')?.amount ?? 0) : 0)
  );
}
