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
 * Cadre du décor 2,5D autour du plateau en vue inclinée (lot 7), en px du plan du décor (cases au pas de 72 px) : bloc
 * de terrain et arbres à gauche et au fond, touffes à droite et devant ; hauteur des arbres du fond ; avancée et
 * hauteur du flanc avant du bloc.
 */
export const DECOR_FRAME = { left: 125, right: 64, back: 84, backHeight: 160, front: 36, drop: 50 } as const;

/** Pas des cases dans le plan du décor. */
const DECOR_PITCH = 72;

export interface TiltGeometry {
  readonly sceneWidth: number;
  readonly sceneHeight: number;
  /** Position du plateau (à plat) dans la scène. */
  readonly boardLeft: number;
  readonly boardTop: number;
  /** Point de fuite : le centre du plateau à plat. */
  readonly originX: number;
  readonly originY: number;
  /** Grossissement des jetons d'une rangée affichée. */
  readonly standScale: (row: number) => number;
}

/**
 * Géométrie de la vue inclinée : taille de la scène (plateau projeté, jetons du fond et, avec `decor`, le décor 2,5D
 * autour) et grossissement des jetons par rangée affichée, qui leur rend la moitié de ce que la perspective leur fait
 * perdre. Le plateau pivote autour de son bord avant.
 */
export function tiltGeometry(m: Metrics, rows: number, decor = false): TiltGeometry {
  const rad = (TILT_DEG * Math.PI) / 180;
  const centerY = m.height / 2;
  const depth = (row: number) => m.height - (m.pad + row * m.pitch + m.cell - 1);
  const standScale = (row: number) => 1 + 0.5 * ((PERSPECTIVE + depth(row) * Math.sin(rad)) / PERSPECTIVE - 1);
  /** Grossissement de la perspective à `t` px derrière le bord avant (devant : t < 0). */
  const scaleAt = (t: number) => PERSPECTIVE / (PERSPECTIVE + t * Math.sin(rad));
  /** Hauteur à l'écran, depuis le bord avant, d'un point à `t` px derrière lui et `h` px au-dessus du sol. */
  const project = (t: number, h: number) => -centerY + (-t * Math.cos(rad) - h + centerY) * scaleAt(t);
  const tokenHeight = (92 * m.cell) / 68;
  let top = project(m.height, 0);
  for (let row = 0; row < rows; row++) top = Math.min(top, project(depth(row), tokenHeight * standScale(row)));
  let bottom = EDGE;
  let left = m.width / 2;
  let right = m.width / 2;
  if (decor) {
    const k = m.pitch / DECOR_PITCH;
    const f = DECOR_FRAME;
    top = Math.min(top, project(m.height + f.back * k, f.backHeight * k));
    bottom = Math.max(bottom, project(-f.front * k, -f.drop * k));
    // Devant le bord avant, la perspective grossit : les coins avant du bloc débordent le plus.
    left = (m.width / 2 + f.left * k) * scaleAt(-f.front * k);
    right = (m.width / 2 + f.right * k) * scaleAt(-f.front * k);
  }
  const sceneHeight = Math.ceil(-top + bottom + 2);
  const boardTop = sceneHeight - bottom - m.height;
  return {
    sceneWidth: Math.ceil(left + right),
    sceneHeight,
    boardLeft: left - m.width / 2,
    boardTop,
    originX: left,
    originY: boardTop + centerY,
    standScale,
  };
}

/** Taille de la scène (vue de dessus ou inclinée, avec ou sans décor 2,5D) pour une taille de case. */
export function sceneSize(cell: number, rows: number, cols: number, tilted: boolean, decor = false): { width: number; height: number } {
  const m = boardMetrics(cell, rows, cols);
  if (!tilted) return { width: m.width, height: m.height };
  const geometry = tiltGeometry(m, rows, decor);
  return { width: geometry.sceneWidth, height: geometry.sceneHeight };
}

/** Plus grande case (de `CELL_MIN` à `CELL_MAX` px) pour laquelle la scène tient dans la zone du plateau. */
export function fitCell(width: number, height: number, rows: number, cols: number, tilted: boolean, decor = false): number {
  const fits = (cell: number) => {
    const size = sceneSize(cell, rows, cols, tilted, decor);
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
