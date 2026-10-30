// Mode contestation (SPEC.md §4.4 bis) : les cases des zones de 9 cases, avec l'état de leur zone (tenue par J1 ou J2,
// neutre, contestée) et les bords du carré, pour les dessiner au sol. D'après la vue seulement : l'état d'une zone est
// public (§10).
import { getManaZones, getViewZoneStatus, getZoneCells } from '../engine';
import type { ManaZoneId, PlayerView, ZoneStatus } from '../engine';

/** Couleur d'une zone : celle du joueur qui la tient, neutre (dorée) ou contestée. */
export type ZoneLook = 'p1' | 'p2' | 'neutral' | 'contested';

export type ZoneEdge = 'top' | 'right' | 'bottom' | 'left';

/** Une case d'une zone de 9 cases : sa zone, son état, et ses côtés qui forment le bord du carré. */
export interface ZoneTile {
  readonly zone: ManaZoneId;
  readonly look: ZoneLook;
  readonly edges: readonly ZoneEdge[];
}

export function zoneLook(status: Pick<ZoneStatus, 'controller' | 'contested'>): ZoneLook {
  if (status.contested) return 'contested';
  return status.controller ? `p${status.controller}` : 'neutral';
}

/** Cases des zones de 9 cases, par `ligne,colonne` ; aucune en mode Normal (la mana zone a déjà son dessin). */
export function getZoneTiles(view: Pick<PlayerView, 'board' | 'mode' | 'zoneControl'>): Map<string, ZoneTile> {
  const tiles = new Map<string, ZoneTile>();
  if (view.mode === 'normal') return tiles;
  for (const { zone, pos } of getManaZones(view.board)) {
    const look = zoneLook(getViewZoneStatus(view, pos));
    for (const cell of getZoneCells(view.board, view.mode, pos)) {
      const edges: ZoneEdge[] = [];
      if (cell.row === pos.row - 1) edges.push('top');
      if (cell.col === pos.col + 1) edges.push('right');
      if (cell.row === pos.row + 1) edges.push('bottom');
      if (cell.col === pos.col - 1) edges.push('left');
      tiles.set(`${cell.row},${cell.col}`, { zone, look, edges });
    }
  }
  return tiles;
}

/** Côté affiché d'un bord, plateau retourné compris (rotation de 180°). */
export const FLIP_EDGE: Readonly<Record<ZoneEdge, ZoneEdge>> = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' };
