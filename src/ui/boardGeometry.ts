// Géométrie des vues de dessus et inclinée : mesures du plateau pour une taille de case, et plus grande case qui fait
// tenir la scène dans la zone du plateau (l'écran de jeu occupe toute la hauteur de la fenêtre, sans défilement).

/** Inclinaison, perspective et épaisseur du bord avant du plateau incliné (maquette « Plateau v4 »). */
export const TILT_DEG = 45;
export const PERSPECTIVE = 2200;
export const EDGE = 22;

/** Taille des cases : 68 px dans la maquette, jusqu'à 84 px sur grand écran ; au moins de quoi rester cliquable. */
export const CELL_MAX = 84;
export const CELL_MIN = 28;
/** Espace entre les cases et marge intérieure du plateau. */
export const BOARD_GAP = 4;
export const BOARD_PAD = 14;

export interface Metrics {
  readonly width: number;
  readonly height: number;
  readonly cell: number;
  readonly pitch: number;
  readonly pad: number;
}

/** Mesures du plateau à plat pour une taille de case. */
export function boardMetrics(cell: number, rows: number, cols: number): Metrics {
  const pitch = cell + BOARD_GAP;
  return {
    cell,
    pitch,
    pad: BOARD_PAD,
    width: 2 * BOARD_PAD + cols * pitch - BOARD_GAP,
    height: 2 * BOARD_PAD + rows * pitch - BOARD_GAP,
  };
}

/**
 * Géométrie de la vue inclinée : hauteur de la scène (plateau projeté + jetons du fond) et grossissement des jetons
 * par rangée affichée, qui leur rend la moitié de ce que la perspective leur fait perdre.
 */
export function tiltGeometry(m: Metrics, rows: number) {
  const rad = (TILT_DEG * Math.PI) / 180;
  const originY = m.height / 2;
  const depth = (row: number) => m.height - (m.pad + row * m.pitch + m.cell - 1);
  const standScale = (row: number) => 1 + 0.5 * ((PERSPECTIVE + depth(row) * Math.sin(rad)) / PERSPECTIVE - 1);
  const project = (t: number, h: number) =>
    -originY + (-t * Math.cos(rad) - h + originY) * (PERSPECTIVE / (PERSPECTIVE + t * Math.sin(rad)));
  const tokenHeight = (92 * m.cell) / 68;
  let top = project(m.height, 0);
  for (let row = 0; row < rows; row++) top = Math.min(top, project(depth(row), tokenHeight * standScale(row)));
  const sceneHeight = Math.ceil(-top + 24);
  return { sceneHeight, originY, standScale };
}

/** Taille de la scène (vue de dessus ou inclinée) pour une taille de case. */
export function sceneSize(cell: number, rows: number, cols: number, tilted: boolean): { width: number; height: number } {
  const m = boardMetrics(cell, rows, cols);
  return { width: m.width, height: tilted ? tiltGeometry(m, rows).sceneHeight : m.height };
}

/** Plus grande case (de `CELL_MIN` à `CELL_MAX` px) pour laquelle la scène tient dans la zone du plateau. */
export function fitCell(width: number, height: number, rows: number, cols: number, tilted: boolean): number {
  const fits = (cell: number) => {
    const size = sceneSize(cell, rows, cols, tilted);
    return size.width <= width && size.height <= height;
  };
  let low = CELL_MIN;
  let high = CELL_MAX;
  if (fits(high)) return high;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}
