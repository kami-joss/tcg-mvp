// Vue isométrique (handoff, lot 5 ; maquette « Plateau v5 », `decor()` et `renderVals()` ; taille quelconque depuis
// le lot 7) : données du décor et géométrie de la caméra. Rien ici ne touche aux règles : l'eau reste une case bloquée,
// les enclaves sont celles que dessinent déjà les falaises du plateau. Le décor vient du plateau (`Board.scenery`).
import type { Board, Enclave, ManaZoneId, Position } from '../../engine';

/** Inclinaison de la vraie isométrie : arctan(1/√2), en degrés. */
export const ISO_TILT = 54.7356;

/**
 * Dimensions du bloc de terrain, dans le plan du plateau (cases de 68 px au pas de 72 px, marge `pad`) : bordure côté
 * fond `R`, côté joueur `N`, hauteur des flancs `D`, profondeur du lac `W`.
 */
export const ISO = { R: 96, N: 36, D: 50, W: 36, pitch: 72, pad: 14 } as const;

/** Côté du plan d'un plateau de `cells` cases : 816 px en 11 × 11, 960 px en 13 × 13. */
export const planSize = (cells: number): number => 2 * ISO.pad + cells * 68 + (cells - 1) * 4;

/** Taille de la scène isométrique à l'échelle 1 (bloc, décor et lac compris), et hauteur de son centre. */
export function isoFrame(plan: number): { width: number; height: number; centerY: number } {
  const height = plan + 132;
  return { width: Math.round(height * Math.SQRT2), height, centerY: height / 2 + 57 };
}

/** Sprites du pack Kenney « Isometric Nature » (CC0), recadrés : [largeur, hauteur, ancre x, ancre y] en px source. */
export const SPRITES: Readonly<Record<string, readonly [number, number, number, number]>> = {
  t1: [93, 243, 46, 239], t2: [94, 246, 47, 242], t3: [109, 184, 48, 180], t4: [127, 250, 63, 246],
  t5: [127, 250, 63, 246], t6: [127, 250, 63, 246], t7: [108, 224, 46, 220], t8: [110, 207, 55, 203],
  t9: [115, 217, 57, 213], t10: [93, 159, 48, 155], t11: [127, 173, 63, 169], t12: [84, 303, 42, 299],
  t13: [84, 303, 42, 299], t14: [93, 299, 46, 295], t15: [129, 217, 74, 213], t16: [86, 227, 42, 223],
  t17: [127, 250, 63, 246], t18: [127, 173, 63, 169], t19: [108, 224, 46, 220], t20: [109, 184, 48, 180],
  t21: [86, 158, 44, 154], t22: [77, 181, 38, 177],
  r1: [125, 109, 61, 73], r2: [125, 109, 51, 73], r3: [106, 125, 60, 94], r4: [102, 168, 51, 138],
  r5: [80, 63, 39, 40], r6: [58, 66, 29, 49], r7: [132, 77, 76, 42], r8: [132, 62, 75, 34],
  r9: [50, 48, 25, 34], r10: [80, 63, 39, 40],
  g1: [26, 33, 10, 25], g2: [38, 37, 18, 26], g3: [24, 28, 12, 21], g4: [40, 33, 21, 21], g5: [33, 28, 14, 18],
  g6: [50, 40, 25, 26], f1: [18, 29, 9, 24], f2: [20, 25, 10, 19], f3: [18, 29, 9, 24], f4: [20, 25, 10, 19],
  f5: [18, 29, 9, 24], m1: [23, 26, 10, 19], m2: [24, 32, 12, 25], s1: [46, 45, 23, 32], s2: [46, 45, 23, 32],
  l1: [95, 80, 47, 52], z_mine: [106, 125, 57, 96], z_ring: [76, 51, 39, 39], z_stable: [184, 182, 92, 118],
  z_farm: [201, 186, 103, 111],
  q1: [62, 99, 31, 81], q2: [62, 69, 31, 51], q3: [63, 93, 32, 75], q4: [61, 85, 31, 67], q5: [58, 103, 29, 86],
  q6: [78, 105, 39, 82], q7: [132, 62, 66, 37], q8: [132, 77, 66, 46], q9: [49, 104, 25, 90],
};

/** Un élément de décor posé sur la bordure du bloc : sprite, position dans le plan du plateau, échelle. */
export type DecorItem = readonly [id: string, x: number, y: number, scale: number];

const borderDecors = new Map<number, readonly DecorItem[]>();

/** Décor de bordure (arbres, touffes, rochers) d'un plan de côté `plan`, généré une fois de façon déterministe. */
export function borderDecor(plan: number): readonly DecorItem[] {
  let decor = borderDecors.get(plan);
  if (!decor) {
    decor = makeBorderDecor(plan);
    borderDecors.set(plan, decor);
  }
  return decor;
}

function makeBorderDecor(plan: number): readonly DecorItem[] {
  let seed = 20261022;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (list: readonly string[]) => list[Math.floor(rnd() * list.length)]!;
  const TALL = ['t1', 't2', 't14', 't16', 't9', 't15'];
  const MID = ['t3', 't4', 't5', 't6', 't7', 't8', 't20'];
  const AUTUMN = ['t17', 't18', 't19'];
  const SMALL = ['t10', 't21', 't22', 't11'];
  const LOW = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'f1', 'f2', 'f3', 'f4', 'f5', 'm1', 'm2'];
  const ROCKS = ['r9', 'r10', 'r5', 's1', 's2'];
  const BIG = ['r7', 'r8', 'l1', 'r4'];
  const out: DecorItem[] = [];
  const put = (id: string, [x, y]: [number, number], scale: number) => out.push([id, Math.round(x), Math.round(y), Number(scale.toFixed(3))]);
  // Côtés du fond (haut et gauche à l'écran) : forêt.
  for (const side of [0, 1]) {
    const at = (t: number, d: number): [number, number] => (side ? [t, -d] : [-d, t]);
    for (let t = -64 + rnd() * 20; t < plan + 30; t += 56 + rnd() * 20) {
      const q = rnd();
      if (q < 0.08) put(pick(BIG), at(t, 70 + rnd() * 10), 0.5);
      else put(q < 0.24 ? pick(AUTUMN) : q < 0.55 ? pick(TALL) : pick(MID), at(t, 66 + rnd() * 18), 0.5 + rnd() * 0.12);
      if (rnd() < 0.5) put(pick(SMALL), at(t + 22 + rnd() * 12, 38 + rnd() * 8), 0.46 + rnd() * 0.1);
      put(rnd() < 0.3 ? pick(ROCKS) : pick(LOW), at(t + rnd() * 44, 14 + rnd() * 10), rnd() < 0.3 ? 0.42 : 0.6);
    }
  }
  // Côtés des joueurs (devant) : seulement des touffes et des cailloux, pour ne rien cacher.
  for (const side of [0, 1]) {
    const at = (t: number, d: number): [number, number] => (side ? [plan + d, t] : [t, plan + d]);
    for (let t = 6 + rnd() * 30; t < plan + 30; t += 44 + rnd() * 44) {
      put(rnd() < 0.22 ? pick(['r9', 'r5', 'r10', 's1']) : pick(LOW), at(t, 10 + rnd() * 18), rnd() < 0.25 ? 0.42 : 0.62);
    }
  }
  return out;
}

/** Enclave délimitée par des falaises : carrière de la Mine (`quarry`) ou creux de la Scierie (`hollow`). */
export type Region = Enclave;

/**
 * Eau d'une colonne : les cases d'eau voisines verticalement (lignes `r0` à `r1`) forment un seul étang allongé ;
 * une case seule (`r0 === r1`) est un tronçon de rivière horizontal.
 */
export interface WaterRun {
  readonly r0: number;
  readonly r1: number;
  readonly col: number;
}

/** Ce que le plateau a de particulier en vue isométrique. */
export interface IsoScenery {
  /** Cases X rendues en eau (« ligne,colonne ») : rendu seulement, règles d'une case bloquée. */
  readonly water: ReadonlySet<string>;
  readonly runs: readonly WaterRun[];
  /** Cases d'un étang vertical (« ligne,colonne »). */
  readonly ponds: ReadonlySet<string>;
  readonly regions: readonly Region[];
}

/** Regroupe les cases d'eau en colonnes, de gauche à droite puis de haut en bas. */
export function waterRuns(water: readonly Position[]): WaterRun[] {
  const cells = new Set(water.map((pos) => `${pos.row},${pos.col}`));
  const seen = new Set<string>();
  const runs: WaterRun[] = [];
  for (const { row, col } of [...water].sort((a, b) => a.col - b.col || a.row - b.row)) {
    if (seen.has(`${row},${col}`)) continue;
    let r1 = row;
    seen.add(`${row},${col}`);
    while (cells.has(`${r1 + 1},${col}`)) seen.add(`${++r1},${col}`);
    runs.push({ r0: row, r1, col });
  }
  return runs;
}

const sceneries = new WeakMap<Board, IsoScenery | null>();

/** Décor isométrique du plateau, ou `null` : pas de vue isométrique pour un plateau sans décor. */
export function isoScenery(board: Board): IsoScenery | null {
  if (!sceneries.has(board)) {
    const data = board.scenery;
    const runs = data ? waterRuns(data.water) : [];
    sceneries.set(
      board,
      data && {
        water: new Set(data.water.map((pos) => `${pos.row},${pos.col}`)),
        runs,
        ponds: new Set(
          runs.filter((run) => run.r1 > run.r0).flatMap((run) => Array.from({ length: run.r1 - run.r0 + 1 }, (_, i) => `${run.r0 + i},${run.col}`)),
        ),
        regions: data.enclaves,
      },
    );
  }
  return sceneries.get(board) ?? null;
}

/** Case bloquée rendue en eau (dans toutes les vues) : `'pond'` dans un étang vertical, `'river'` sinon. */
export function waterKind(board: Board, pos: Position): 'river' | 'pond' | null {
  const scenery = isoScenery(board);
  const key = `${pos.row},${pos.col}`;
  if (!scenery?.water.has(key)) return null;
  return scenery.ponds.has(key) ? 'pond' : 'river';
}

export function isWater(board: Board, pos: Position): boolean {
  return waterKind(board, pos) !== null;
}

/** Muret des mana zones en iso : matière, repères (sprite, échelle, décalage depuis le coin arrière), feu (Forge). */
export const ZONE_DECOR: Readonly<
  Record<ManaZoneId, { readonly wall: 'stone' | 'wood'; readonly marks: readonly (readonly [string, number, number, number])[]; readonly fire?: boolean }>
> = {
  forge: { wall: 'stone', marks: [['z_ring', 0.5, 0, 0]], fire: true },
  mine: { wall: 'stone', marks: [['z_mine', 0.37, 0, 0]] },
  scierie: { wall: 'wood', marks: [['l1', 0.42, 6, -2], ['s1', 0.5, -10, 14]] },
  ecurie: { wall: 'wood', marks: [['z_stable', 0.25, 0, 0]] },
  ferme: { wall: 'wood', marks: [['z_farm', 0.24, 0, 0], ['f4', 0.62, 30, -4], ['f2', 0.62, -4, 30]] },
};

/** Caméra isométrique pour une zone du plateau (largeur, hauteur) et un zoom donnés. */
export interface IsoCamera {
  /** Échelle du plateau (0,35 à 1, multipliée par le zoom). */
  readonly k: number;
  readonly width: number;
  readonly height: number;
  /** Hauteur du centre du plateau dans la scène. */
  readonly centerY: number;
  /** Grossissement des jetons debout, pour qu'ils restent lisibles quand le plateau rapetisse. */
  readonly standScale: number;
  /** Contre-échelle des textes au sol, pour qu'ils gardent leur taille à l'écran. */
  readonly textScale: number;
  /** Hauteur à l'écran du milieu d'un jeton debout au-dessus du sol (point d'impact des effets). */
  readonly lift: number;
}

/** Caméra pour un plan de côté `plan` (`planSize`). */
export function isoCamera(plan: number, areaWidth: number, areaHeight: number, zoom: number): IsoCamera {
  const frame = isoFrame(plan);
  // La scène entière tient dans la zone ; en dessous de 0,35, elle déborde.
  const fit = Math.max(0.35, Math.min(1, areaWidth / frame.width, areaHeight / frame.height));
  const k = fit * zoom;
  const standScale = Math.max(1.1, 0.95 / k);
  return {
    k,
    width: Math.round(frame.width * k),
    height: Math.round(frame.height * k),
    centerY: frame.centerY * k,
    standScale,
    textScale: 0.92 / k,
    lift: 27 * standScale * k,
  };
}

/**
 * Rectangle d'une enclave dans le plan du plateau (en coordonnées affichées), étendu au bord du plateau s'il le touche ;
 * `pitch` : pas des cases (72 px en iso, la taille des cases + 4 en vue inclinée).
 */
export function regionRect(
  region: Region,
  flipped: boolean,
  rows: number,
  cols: number,
  pitch: number = ISO.pitch,
): [x: number, y: number, w: number, h: number] {
  const row = (r: number) => (flipped ? rows - 1 - r : r);
  const col = (c: number) => (flipped ? cols - 1 - c : c);
  const r0 = Math.min(row(region.r0), row(region.r1));
  const r1 = Math.max(row(region.r0), row(region.r1));
  const c0 = Math.min(col(region.c0), col(region.c1));
  const c1 = Math.max(col(region.c0), col(region.c1));
  // Bord d'une enclave : au milieu de l'espace entre deux cases ; côté plateau, son bord extérieur.
  const edge = (cells: number) => 2 * ISO.pad + cells * pitch - 4;
  const x = c0 === 0 ? 0 : ISO.pad - 2 + c0 * pitch;
  const y = r0 === 0 ? 0 : ISO.pad - 2 + r0 * pitch;
  const x1 = c1 === cols - 1 ? edge(cols) : ISO.pad - 2 + (c1 + 1) * pitch;
  const y1 = r1 === rows - 1 ? edge(rows) : ISO.pad - 2 + (r1 + 1) * pitch;
  return [x, y, x1 - x, y1 - y];
}

/** Sols des enclaves : gravier gris (carrière), sciure sur terre sombre (creux). */
export const REGION_FLOORS: Readonly<Record<Region['type'], readonly string[]>> = {
  quarry: [
    'radial-gradient(3px 2px at 20% 30%, #8d8676, transparent)',
    'radial-gradient(4px 3px at 64% 22%, #8d8676, transparent)',
    'radial-gradient(3px 3px at 42% 70%, #8d8676, transparent)',
    'radial-gradient(4px 2px at 80% 62%, #8d8676, transparent)',
    'radial-gradient(3px 2px at 30% 88%, #8d8676, transparent)',
    'radial-gradient(3px 2px at 72% 84%, #8d8676, transparent)',
    'radial-gradient(closest-side, oklch(0.8 0.02 85 / .66), oklch(0.6 0.02 80 / .78))',
  ],
  hollow: [
    'radial-gradient(9% 7% at 30% 38%, oklch(0.84 0.08 80 / .6), transparent)',
    'radial-gradient(7% 6% at 62% 58%, oklch(0.84 0.08 80 / .55), transparent)',
    'radial-gradient(8% 5% at 46% 78%, oklch(0.84 0.08 80 / .5), transparent)',
    'radial-gradient(closest-side, oklch(0.62 0.07 90 / .3), oklch(0.32 0.05 120 / .55))',
  ],
};

/** Fond du plateau avec le décor 2,5D : les sols des enclaves, sous les cases. */
export function isoFloor(scenery: IsoScenery, flipped: boolean, rows: number, cols: number, pitch: number = ISO.pitch): string {
  const layers = scenery.regions.flatMap((region) => {
    const [x, y, w, h] = regionRect(region, flipped, rows, cols, pitch);
    return REGION_FLOORS[region.type].map((layer) => `${layer} ${x}px ${y}px / ${w}px ${h}px no-repeat`);
  });
  return [...layers, 'oklch(0.25 0.04 165 / .1)'].join(', ');
}
