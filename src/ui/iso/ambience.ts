// Ambiance animée du décor peint (15 × 15) : reflets de l'eau, feu et fumée de la forge, éclats des cristaux de la Mine,
// halo et particules des mana zones, ombres de nuages et rafales de vent. Rendu seulement, et seulement quand les
// animations sont permises. Ici, les données et les calculs ; le rendu est dans `IsoDecor`.
import { seeded } from './isoGround';
import type { PaintedDecor } from './paintedDecor';
import { SPRITES } from './scenery';

type Point = readonly [x: number, y: number];

/**
 * Points remarquables des sprites peints, en px de leur image (densité 2), relevés sur les images : la gueule du four
 * et le haut de la cheminée de la forge, le rectangle des cristaux violets des tas de minerai.
 */
export const SPRITE_FX: Readonly<Record<string, { readonly fire?: Point; readonly smoke?: Point; readonly crystals?: readonly [number, number, number, number] }>> = {
  forge_rochers: { fire: [205, 303], smoke: [213, 188] },
  tas_minerai: { crystals: [19, 11, 83, 81] },
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
