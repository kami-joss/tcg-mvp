// Ambiance animée du décor peint (15 × 15) : reflets de l'eau, feu et fumée de la forge, éclats des cristaux de la Mine,
// halo et particules des mana zones, ombres de nuages et rafales de vent. Rendu seulement, et seulement quand les
// animations sont permises. Ici, les données et les calculs ; le rendu est dans `IsoDecor` (éléments debout, en CSS) et
// `AmbienceCanvas` (ambiance au sol, un seul canvas PixiJS : `groundAmbience` la décrit, `pulse`, `cloudAt`, `gustAt`
// l'animent comme le faisaient les keyframes `amb*`).
import { seeded } from './isoGround';
import type { PaintedDecor } from './paintedDecor';
import { SPRITES } from './scenery';

type Point = readonly [x: number, y: number];

/**
 * Points remarquables des sprites peints, en px de leur image, relevés sur les images : la gueule du four et le haut de
 * la cheminée de la forge, le rectangle des cristaux violets des tas de minerai et des cristaux HD.
 */
export const SPRITE_FX: Readonly<Record<string, { readonly fire?: Point; readonly smoke?: Point; readonly crystals?: readonly [number, number, number, number] }>> = {
  forge_rochers: { fire: [205, 303], smoke: [213, 188] },
  tas_minerai: { crystals: [19, 11, 83, 81] },
  // Cristaux HD de la forêt violette : le corps du cristal, sans la base ni la pointe.
  hd_cristal_gros: { crystals: [5, 24, 90, 115] },
  hd_cristal_eclat: { crystals: [5, 29, 63, 143] },
  hd_cristal_amas: { crystals: [5, 26, 120, 125] },
  hd_cristal_amas_b: { crystals: [5, 26, 105, 125] },
  hd_cristal_large: { crystals: [5, 24, 92, 118] },
};

/** Pixel d'eau d'une pièce peinte (canal, étang) : bleu franc ; ni les berges, ni les planches, ni les nénuphars. */
export function isWaterPixel(r: number, g: number, b: number, a: number): boolean {
  return a > 200 && b > 140 && b - r > 60 && g > 90;
}

/** Une pièce d'eau du sol : son rectangle (`pas` × 2 `pas`) dans le plan du plateau, à l'endroit où `buildGround` la peint. */
export interface WaterPatch {
  readonly key: string;
  readonly image: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Pièce posée le long des colonnes : transposée, comme dans `buildGround`. */
  readonly transposed: boolean;
  /** Pièce retournée bout pour bout (`miroir`), comme dans `buildGround`. */
  readonly mirrored: boolean;
  /** Canal (eau qui coule) ou étang (eau calme). */
  readonly kind: 'canal' | 'pond';
}

export function waterPatches(decor: PaintedDecor): WaterPatch[] {
  const { pas, case: cell, marge } = decor.plan;
  return decor.decals.map((decal, i) => ({
    key: `w${i}`,
    image: decal.image,
    x: marge + decal.case[1] * pas - (pas - cell) / 2,
    y: marge + decal.case[0] * pas - (pas - cell) / 2,
    width: pas,
    height: 2 * pas,
    transposed: decal.sens === 'colonnes',
    mirrored: decal.miroir ?? false,
    kind: decal.image.startsWith('etang') ? 'pond' : 'canal',
  }));
}

/** Décalage, depuis l'ancre d'un sprite affiché à l'échelle `scale`, d'un point de son image (retourné avec lui). */
export function spritePoint(id: string, [px, py]: Point, scale: number, mirror: boolean): [number, number] {
  const [, , ax, ay] = SPRITES[id]!;
  return [(mirror ? ax - px : px - ax) * scale, (py - ay) * scale];
}

/** Particules tirées une fois pour toutes (graine fixe) : position `u`, `v` dans [0, 1[ et phase dans [0, 1[. */
export function scatter(seed: number, count: number): { u: number; v: number; phase: number }[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({ u: random(), v: random(), phase: random() }));
}

// --- Ambiance au sol, dessinée par PixiJS dans un canvas du plan du plateau (`AmbienceCanvas`).

/** Couleurs de l'ambiance au sol : reflets et caustiques de l'eau, ombre des nuages, rafales. */
export const GROUND_FX_COLORS = {
  ripple: 'oklch(0.98 0.03 200)',
  caustic: 'oklch(0.97 0.04 195)',
  cloud: 'oklch(0.22 0.04 160)',
  gust: 'oklch(0.98 0.03 120)',
} as const;

/** Matrice affine (a, b, c, d, tx, ty) : x' = a x + c y + tx, y' = b x + d y + ty, comme `matrix()` en CSS. */
export type Matrix2D = readonly [a: number, b: number, c: number, d: number, tx: number, ty: number];

/**
 * Pose d'une pièce d'eau dans le plan du plateau, depuis son repère (largeur `pas`, longueur 2 `pas`, l'eau qui coule
 * vers le bas) : retournée bout pour bout (`miroir`) puis transposée, dans cet ordre, comme `buildGround` la peint.
 */
export function patchMatrix(patch: WaterPatch): Matrix2D {
  const { x, y, height: h, transposed, mirrored } = patch;
  if (transposed && mirrored) return [0, 1, -1, 0, x + h, y];
  if (transposed) return [0, 1, 1, 0, x, y];
  if (mirrored) return [1, 0, 0, -1, x, y + h];
  return [1, 0, 0, 1, x, y];
}

/** Scintillement sur l'eau : son centre dans le repère de la pièce, sa période et son retard (s). */
export interface Glint {
  readonly x: number;
  readonly y: number;
  readonly period: number;
  readonly delay: number;
}

/** Une pièce d'eau animée : reflets qui coulent, caustiques qui dérivent, scintillements, tous sur son eau seule. */
export interface WaterLayer {
  readonly key: string;
  readonly image: string;
  readonly matrix: Matrix2D;
  readonly width: number;
  readonly height: number;
  /** Période (s) des reflets (un trait tous les 30 px) et de la dérive des caustiques (36 px) : le canal coule plus vite. */
  readonly flowPeriod: number;
  readonly driftPeriod: number;
  /** Opacité des reflets : francs dans le canal, discrets dans un étang. */
  readonly strength: number;
  readonly glints: readonly Glint[];
}

/** Halo au sol d'une mana zone, à la couleur de celui qui la tient. */
export interface ZoneHalo {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

/** Ombre de nuage (ellipse floue) qui traverse le plateau de gauche à droite. */
export interface CloudShadow {
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly x0: number;
  readonly x1: number;
  readonly dy: number;
  readonly period: number;
  readonly delay: number;
}

/** Rafale : un trait clair qui file et s'efface. */
export interface Gust {
  readonly top: number;
  readonly width: number;
  readonly x0: number;
  readonly x1: number;
  readonly period: number;
  readonly delay: number;
}

/** Rectangle en px du plan du plateau. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Toute l'ambiance au sol d'un plateau peint de côté `size` (px) : eau, halos des mana zones, nuages, rafales. `bounds` :
 * ce qu'elle couvre, le plateau et l'eau du décor extérieur (plateau retourné compris) ; nuages et rafales restent
 * découpés au plateau.
 */
export interface GroundAmbience {
  readonly size: number;
  readonly bounds: Rect;
  /** Plateau retourné vers le joueur : l'eau tourne de 180° avec lui (autour du centre du plateau). */
  readonly flipped: boolean;
  readonly water: readonly WaterLayer[];
  readonly halos: readonly ZoneHalo[];
  readonly clouds: readonly CloudShadow[];
  readonly gusts: readonly Gust[];
}

/** Rayon (px) du halo d'une mana zone. */
export const HALO_RADIUS = 46;

/** Décrit l'ambiance au sol, avec les mêmes tirages (graines) que l'ancienne ambiance en CSS. */
export function groundAmbience(decor: PaintedDecor, size: number, halos: readonly ZoneHalo[], flipped = false): GroundAmbience {
  const water = waterPatches(decor).map((patch, i): WaterLayer => {
    const canal = patch.kind === 'canal';
    return {
      key: patch.key,
      image: patch.image,
      matrix: patchMatrix(patch),
      width: patch.width,
      height: patch.height,
      flowPeriod: canal ? 2.6 : 8,
      driftPeriod: canal ? 5 : 13,
      strength: canal ? 0.42 : 0.2,
      // Un point de 3 px posé entre 10 et 90 % de la largeur, 8 et 92 % de la longueur.
      glints: scatter(31 + i, 3).map((g) => ({
        x: (0.1 + g.u * 0.8) * patch.width + 1.5,
        y: (0.08 + g.v * 0.84) * patch.height + 1.5,
        period: 2.2 + g.phase * 1.6,
        delay: -g.phase * 3,
      })),
    };
  });
  const clouds = [0, 1, 2].map(
    (i): CloudShadow => ({
      top: [0.15, 0.5, 0.82][i]! * size - 170,
      width: 560,
      height: 340,
      x0: -620,
      x1: size + 40,
      dy: [60, -40, 30][i]!,
      period: [95, 120, 80][i]!,
      delay: -[10, 70, 40][i]!,
    }),
  );
  const gusts = scatter(7, 6).map(
    (p): Gust => ({
      top: 40 + p.u * (size - 80),
      width: 150 + p.v * 80,
      x0: -200 + p.v * 300,
      x1: 300 + p.v * 500,
      period: 7 + p.phase * 5,
      delay: -p.phase * 10,
    }),
  );
  // Emprise : le plateau, et chaque coin de chaque pièce d'eau, à l'endroit où elle s'affiche.
  let [x0, y0, x1, y1] = [0, 0, size, size];
  for (const { matrix: [a, b, c, d, tx, ty], width, height } of water) {
    for (const [u, v] of [[0, 0], [width, 0], [0, height], [width, height]] as const) {
      const px = a * u + c * v + tx;
      const py = b * u + d * v + ty;
      const [x, y] = flipped ? [size - px, size - py] : [px, py];
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  const bounds = { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1) - Math.floor(x0), height: Math.ceil(y1) - Math.floor(y0) };
  return { size, bounds, flipped, water, halos, clouds, gusts };
}

/** Avancement (0 à 1) d'une animation en boucle de période `period` (s), avec un retard `delay` (négatif : déjà en cours). */
export const progress = (t: number, period: number, delay = 0): number => ((((t - delay) / period) % 1) + 1) % 1;

/** Accélération puis décélération, proche de `ease-in-out`. */
const ease = (x: number): number => x * x * (3 - 2 * x);

/** Opacité d'un halo qui respire (`ambPulse`) : 0,45, puis 1 à mi-période, puis 0,45. */
export function pulse(t: number, period: number): number {
  const f = progress(t, period);
  return 0.45 + 0.55 * ease(f < 0.5 ? f * 2 : 2 - f * 2);
}

/** Position du coin haut-gauche d'une ombre de nuage (`ambCloud`) : de `x0` à `x1`, en dérivant de `dy`. */
export function cloudAt(cloud: CloudShadow, t: number): { x: number; y: number } {
  const f = progress(t, cloud.period, cloud.delay);
  return { x: cloud.x0 + (cloud.x1 - cloud.x0) * f, y: cloud.top + cloud.dy * f };
}

/** Rafale (`ambGust`) : elle file de `x0` à `x1` pendant les 30 premiers % de sa période, visible surtout au début. */
export function gustAt(gust: Gust, t: number): { x: number; alpha: number } {
  const f = progress(t, gust.period, gust.delay);
  const x = f < 0.3 ? gust.x0 + (gust.x1 - gust.x0) * ease(f / 0.3) : gust.x1;
  const alpha = f < 0.08 ? ease(f / 0.08) : f < 0.3 ? 1 - ease((f - 0.08) / 0.22) : 0;
  return { x, alpha };
}
