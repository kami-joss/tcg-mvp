// Décor peint d'un plateau (handoff « Plateau 15 × 15 ») : sol calculé par `buildGround` à partir des données du décor
// et des tuiles vues de dessus, et sprites peints posés debout sur leurs cases. Rendu seulement. Un plateau sans décor
// peint garde le décor procédural d'`IsoDecor`.
import { useEffect, useState } from 'react';
import type { Board } from '../../engine';
import DECOR_15 from './decor-15x15.json';
import { isWaterPixel } from './ambience';
import { buildGround } from './isoGround';
import type { GroundDecor, GroundSprite } from './isoGround';
import { SPRITES } from './scenery';

/** Tuiles du sol, pièces de 1 × 2 cases et texture de bruit, par nom de fichier. */
export const GROUND_IMAGES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../assets/plateau15/sol/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
);

/** Sprite peint : sur une case, ou entre deux cases (cadres de mine) ; `miroir` le retourne autour de son ancre. */
export interface PaintedSprite extends GroundSprite {
  readonly entre?: readonly (readonly [number, number])[];
  readonly miroir?: boolean;
}

export interface PaintedDecor extends GroundDecor {
  readonly sprites: readonly PaintedSprite[];
}

/** Décors peints, par nom de plateau. */
const PAINTED: Readonly<Record<string, PaintedDecor>> = {
  'Champ de bataille (15 × 15)': DECOR_15 as unknown as PaintedDecor,
};

export const paintedDecor = (board: Board): PaintedDecor | null => PAINTED[board.name] ?? null;

/** Vert du sol peint, en attendant qu'il soit calculé (et autour de lui en vue de dessus). */
export const GROUND_WAIT = '#6f9a48';

/**
 * Fond du plateau à plat (vue de dessus) : le sol peint, sans sprites, mis à l'échelle du pas des cases (`pitch`) et
 * calé sur le coin de la première case, comme le décor l'est en vue inclinée ; du vert du sol autour et en attendant.
 * Pas de rotation : le plateau n'est plus retourné d'un joueur à l'autre (SPEC §10).
 */
export function flatGroundBackground(decor: PaintedDecor, cells: number, url: string | null, pitch: number, pad: number): string {
  if (!url) return GROUND_WAIT;
  const { pas, case: cell, marge } = decor.plan;
  const scale = pitch / pas;
  const size = (2 * marge + cells * pas - (pas - cell)) * scale;
  const offset = pad - marge * scale;
  const px = (value: number) => `${Number(value.toFixed(2))}px`;
  return `url(${url}) ${px(offset)} ${px(offset)} / ${px(size)} ${px(size)} no-repeat, ${GROUND_WAIT}`;
}

/** Les sprites peints sont en densité 2 : échelle 0,5 dans le plan du plateau. */
export const PAINTED_SPRITE_SCALE = 0.5;

/**
 * Sprites couchés sur des cases où l'on marche (les ponts) : dessinés à plat dans le plan du sol, sous les jetons. Debout,
 * leur moitié basse passerait sous le sol (coupée net) et ils cacheraient le monstre posé dessus.
 */
const FLAT_SPRITES: ReadonlySet<string> = new Set(['pont_r', 'pont_c']);

/** Avancée minimale d'un sprite debout vers la caméra (celle du décor procédural). */
const STAND_DEPTH = 24;

/**
 * Avancée d'un sprite debout vers la caméra, pour que rien de lui ne passe sous le sol : en isométrie, le sol situé
 * `v` px sous son ancre à l'écran est `v × √2` px plus près de la caméra. Les sprites peints descendent sous leur ancre
 * (leur base est dessinée en perspective) : sans cela, le bas des rochers, des billots ou de la forge serait rogné.
 */
export function paintedStandDepth(id: string): number {
  const [, h, , ay] = SPRITES[id]!;
  return Math.max(STAND_DEPTH, Math.ceil((h - ay) * PAINTED_SPRITE_SCALE * Math.SQRT2) + 2);
}

/** Un sprite peint à poser : son ancre au sol (x, y) dans le plan du plateau affiché, debout (`dz`) ou à plat. */
export interface PlacedSprite {
  readonly key: string;
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly mirror: boolean;
  readonly flat: boolean;
  /** Avancée vers la caméra d'un sprite debout. */
  readonly dz: number;
}

/**
 * Place les sprites peints dans le plan du plateau (`flipped` : tourné de 180°) : au centre de leur case, au milieu des
 * deux centres pour `entre`. Un sprite qui couvre plusieurs cases (`empreinte`, la forge) est ancré sur celle de ses
 * cases la plus proche de la caméra à l'écran, plateau tourné ou non.
 */
export function placePaintedSprites(decor: PaintedDecor, rows: number, cols: number, flipped: boolean): PlacedSprite[] {
  const { pas, case: cell, marge } = decor.plan;
  const shown = ([row, col]: readonly [number, number]): [number, number] => (flipped ? [rows - 1 - row, cols - 1 - col] : [row, col]);
  const center = (pos: readonly [number, number]): [number, number] => {
    const [row, col] = shown(pos);
    return [marge + col * pas + cell / 2, marge + row * pas + cell / 2];
  };
  return decor.sprites.flatMap((sprite, i): PlacedSprite[] => {
    let x: number;
    let y: number;
    if (sprite.entre) {
      const [a, b] = sprite.entre.map(center);
      if (!a || !b) return [];
      [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    } else {
      const cells = sprite.empreinte ?? (sprite.case ? [sprite.case] : []);
      const front = [...cells].sort((p, q) => shown(q)[0] + shown(q)[1] - (shown(p)[0] + shown(p)[1]))[0];
      if (!front) return [];
      [x, y] = center(front);
    }
    const flat = FLAT_SPRITES.has(sprite.id);
    return [{ key: `p${i}`, id: sprite.id, x, y, mirror: sprite.miroir ?? false, flat, dz: flat ? 0 : paintedStandDepth(sprite.id) }];
  });
}

/** Noms des images dont le sol a besoin : herbe, sols de zones, terre des socles, pièces peintes, bruit. */
export function groundImageNames(decor: GroundDecor): string[] {
  const names = new Set<string>(['bruit', 'terre_unie', 'terre_copeaux', ...decor.herbe.tuiles]);
  for (const zone of decor.zones) for (const tile of zone.tuiles) names.add(tile);
  for (const decal of decor.decals) names.add(decal.image);
  return [...names];
}

/** Image chargée (`load`, pas `decode()`, qui peut ne jamais répondre dans une page en arrière-plan). */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Sol peint : image introuvable (${url})`));
    image.src = url;
  });
}

/** Sol calculé une fois par plateau (1 à 2 s), puis gardé pour la session : une URL d'objet vers l'image. */
const grounds = new Map<string, Promise<string>>();

function groundUrl(board: Board, decor: PaintedDecor): Promise<string> {
  let ground = grounds.get(board.name);
  if (!ground) {
    ground = Promise.all(groundImageNames(decor).map(async (name) => [name, await loadImage(GROUND_IMAGES[name]!)] as const))
      // Le calcul bloque la page 1 à 2 s : il attend que le plateau soit d'abord affiché.
      .then((images) => new Promise<typeof images>((resolve) => setTimeout(() => resolve(images), 0)))
      .then((images) => buildGround(board.rows, decor, Object.fromEntries(images)))
      .then((canvas) => new Promise<string>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Sol peint : image vide'))))));
    grounds.set(board.name, ground);
    // Un échec (image introuvable) n'est pas gardé : on réessaiera au prochain affichage.
    ground.catch(() => grounds.delete(board.name));
  }
  return ground;
}

/** URL du sol peint du plateau quand il est prêt (toutes les vues l'affichent), `null` avant ou s'il n'en a pas. */
export function usePaintedGround(board: Board): string | null {
  const decor = paintedDecor(board);
  const [ready, setReady] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => {
    if (!decor) return;
    let alive = true;
    groundUrl(board, decor).then(
      (url) => alive && setReady({ name: board.name, url }),
      (error: unknown) => console.error(error),
    );
    return () => {
      alive = false;
    };
  }, [board, decor]);
  return decor && ready?.name === board.name ? ready.url : null;
}

/** Masques de l'eau des pièces peintes (canal, étangs), par image : calculés une fois par session. */
const waterMasks = new Map<string, Promise<Readonly<Record<string, string>>>>();

/** Masque d'une pièce peinte : blanc opaque sur l'eau, transparent ailleurs (berges, planches, nénuphars). */
function waterMask(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const water = isWaterPixel(d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!);
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = water ? 255 : 0;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Masques de l'eau du plateau à décor peint, par nom d'image, pour que ses reflets animés restent sur l'eau ; `null`
 * avant qu'ils soient prêts, sans décor peint, ou si `enabled` est faux (animations coupées).
 */
export function useWaterMasks(board: Board, enabled: boolean): Readonly<Record<string, string>> | null {
  const decor = paintedDecor(board);
  const [ready, setReady] = useState<{ name: string; masks: Readonly<Record<string, string>> } | null>(null);
  useEffect(() => {
    if (!decor || !enabled) return;
    let alive = true;
    let masks = waterMasks.get(board.name);
    if (!masks) {
      const names = [...new Set(decor.decals.map((decal) => decal.image))];
      masks = Promise.all(names.map(async (name) => [name, waterMask(await loadImage(GROUND_IMAGES[name]!))] as const)).then((entries) =>
        Object.fromEntries(entries),
      );
      waterMasks.set(board.name, masks);
      masks.catch(() => waterMasks.delete(board.name));
    }
    masks.then(
      (result) => alive && setReady({ name: board.name, masks: result }),
      (error: unknown) => console.error(error),
    );
    return () => {
      alive = false;
    };
  }, [board, decor, enabled]);
  return decor && enabled && ready?.name === board.name ? ready.masks : null;
}
