// Décor peint d'un plateau (handoff « Plateau 15 × 15 ») : sol calculé par `buildGround` à partir des données du décor
// et des tuiles vues de dessus, et sprites peints posés debout sur leurs cases ; avec son décor extérieur (6 cases tout
// autour, v2). Rendu seulement. Un plateau sans décor peint garde le décor procédural d'`IsoDecor`.
import { useEffect, useState } from 'react';
import type { Board } from '../../engine';
import DECOR_15 from './decor-15x15.json';
import { isWaterPixel } from './ambience';
import { groundKey, readGround, writeGround } from './groundCache';
import type { GroundRequest, GroundResponse } from './groundWorker';
import { buildGround } from './isoGround';
import type { GroundDecor, GroundSprite } from './isoGround';
import { SPRITES } from './scenery';

/** Tuiles du sol, pièces de 1 × 2 cases et texture de bruit, par nom de fichier. */
export const GROUND_IMAGES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../assets/plateau15/sol/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
);

/**
 * Sprite peint : sur une case, ou entre deux cases (cadres de mine) ; `miroir` le retourne autour de son ancre ;
 * `echelle` multiplie l'échelle 0,5 (décor extérieur).
 */
export interface PaintedSprite extends GroundSprite {
  readonly entre?: readonly (readonly [number, number])[];
  readonly miroir?: boolean;
  readonly echelle?: number;
}

export interface PaintedDecor extends GroundDecor {
  readonly sprites: readonly PaintedSprite[];
}

/**
 * Le décor réduit au plateau : pas de bordure (`plan.bordure` = 0), seuls les sprites et les pièces d'eau posés sur ses
 * cases. Son sol se calcule vite (environ 1,5 s) : il s'affiche en premier, et en vue de dessus.
 */
export function boardOnly(decor: PaintedDecor, size: number): PaintedDecor {
  const inBoard = ([row, col]: readonly number[]) => row! >= 0 && col! >= 0 && row! < size && col! < size;
  return {
    ...decor,
    plan: { ...decor.plan, bordure: 0 },
    decals: decor.decals.filter(({ case: [row, col], sens }) => inBoard([row, col]) && inBoard(sens === 'lignes' ? [row + 1, col] : [row, col + 1])),
    sprites: decor.sprites.filter((s) => (s.entre ?? s.empreinte ?? (s.case ? [s.case] : [])).every(inBoard)),
  };
}

/** Décors peints, par nom de plateau : complet et réduit au plateau (des objets stables : les effets de React en dépendent). */
const PAINTED: Readonly<Record<string, { readonly full: PaintedDecor; readonly board: PaintedDecor }>> = {
  'Champ de bataille (15 × 15)': { full: DECOR_15 as unknown as PaintedDecor, board: boardOnly(DECOR_15 as unknown as PaintedDecor, 15) },
};

/** Le décor peint complet du plateau (décor extérieur compris), ou `null` s'il n'en a pas. */
export const paintedDecor = (board: Board): PaintedDecor | null => PAINTED[board.name]?.full ?? null;

/** Le décor peint réduit au plateau. */
export const paintedBoardDecor = (board: Board): PaintedDecor | null => PAINTED[board.name]?.board ?? null;

/** Côté du plan du monde peint (plateau et décor extérieur), en px de plan : 1968 pour le 15 × 15 avec 6 cases autour. */
export function worldPlan(decor: PaintedDecor, size: number): number {
  const { pas, case: cell, marge, bordure = 0 } = decor.plan;
  return 2 * marge + (size + 2 * bordure) * pas - (pas - cell);
}

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
export const STAND_DEPTH = 24;

/**
 * Avancée d'un sprite debout vers la caméra, pour que rien de lui ne passe sous le sol : en isométrie, le sol situé
 * `v` px sous son ancre à l'écran est `v × √2` px plus près de la caméra. Les sprites peints descendent sous leur ancre
 * (leur base est dessinée en perspective) : sans cela, le bas des rochers, des billots ou de la forge serait rogné.
 */
export function paintedStandDepth(id: string, scale = PAINTED_SPRITE_SCALE): number {
  const [, h, , ay] = SPRITES[id]!;
  return Math.max(STAND_DEPTH, Math.ceil((h - ay) * scale * Math.SQRT2) + 2);
}

/** Un sprite peint à poser : son ancre au sol (x, y) dans le plan du plateau affiché, debout (`dz`) ou à plat. */
export interface PlacedSprite {
  readonly key: string;
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Échelle d'affichage : 0,5 (densité 2), multipliée par `echelle` du décor. */
  readonly scale: number;
  readonly mirror: boolean;
  readonly flat: boolean;
  /** Avancée vers la caméra d'un sprite debout, pour que le sol (dans le plan des cases) ne le rogne pas. */
  readonly dz: number;
  /** Posé sur le plateau (sinon dans le décor extérieur). */
  readonly inBoard: boolean;
}

/**
 * Place les sprites peints dans le plan du plateau (`flipped` : tourné de 180°) : ancrés au centre de leur `case` (qui
 * peut être décimale : arbres semés librement, champs au coin commun de leurs 4 cases ; pour un bâtiment, sa case
 * centrale ; pour la forge, sa case la plus proche de la caméra), au milieu des deux centres pour `entre`.
 */
export function placePaintedSprites(decor: PaintedDecor, rows: number, cols: number, flipped: boolean): PlacedSprite[] {
  const { pas, case: cell, marge } = decor.plan;
  const shown = ([row, col]: readonly [number, number]): [number, number] => (flipped ? [rows - 1 - row, cols - 1 - col] : [row, col]);
  const center = (pos: readonly [number, number]): [number, number] => {
    const [row, col] = shown(pos);
    return [marge + col * pas + cell / 2, marge + row * pas + cell / 2];
  };
  const inside = ([row, col]: readonly number[]) => row! >= 0 && col! >= 0 && row! < rows && col! < cols;
  return decor.sprites.flatMap((sprite, i): PlacedSprite[] => {
    let x: number;
    let y: number;
    if (sprite.entre) {
      const [a, b] = sprite.entre.map(center);
      if (!a || !b) return [];
      [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    } else if (sprite.case) {
      [x, y] = center(sprite.case);
    } else {
      return [];
    }
    const flat = FLAT_SPRITES.has(sprite.id);
    const scale = PAINTED_SPRITE_SCALE * (sprite.echelle ?? 1);
    const cells = sprite.entre ?? sprite.empreinte ?? [sprite.case!];
    return [
      {
        key: `p${i}`,
        id: sprite.id,
        x,
        y,
        scale,
        mirror: sprite.miroir ?? false,
        flat,
        dz: flat ? 0 : paintedStandDepth(sprite.id, scale),
        inBoard: cells.every(inside),
      },
    ];
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

/** Sol calculé sur le fil principal (plateau seul, si la tâche de fond n'est pas possible), en WebP. */
async function groundOnMainThread(size: number, decor: PaintedDecor): Promise<Blob> {
  const images = await Promise.all(groundImageNames(decor).map(async (name) => [name, await loadImage(GROUND_IMAGES[name]!)] as const));
  // Le calcul bloque la page 1 à 2 s : il attend que le plateau soit d'abord affiché.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const canvas = buildGround(size, decor, Object.fromEntries(images));
  // WebP : 20 fois plus rapide à encoder que PNG (0,3 s contre 7 pour le plateau seul) et 14 fois plus léger, avec la
  // transparence ; un navigateur qui ne l'encode pas donne du PNG.
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Sol peint : image vide'))), 'image/webp', 0.92),
  );
}

/** La tâche de fond du calcul des sols : une seule, créée au premier besoin ; ses demandes passent dans l'ordre. */
let worker: Worker | null = null;
let nextRequest = 0;
const requests = new Map<number, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>();

const canUseWorker = (): boolean => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

function groundInWorker(size: number, decor: PaintedDecor): Promise<Blob> {
  if (!worker) {
    worker = new Worker(new URL('./groundWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<GroundResponse>) => {
      const request = requests.get(data.id);
      requests.delete(data.id);
      if ('blob' in data) request?.resolve(data.blob);
      else request?.reject(new Error(data.error));
    };
  }
  const id = nextRequest++;
  const images = Object.fromEntries(groundImageNames(decor).map((name) => [name, new URL(GROUND_IMAGES[name]!, location.href).href]));
  const message: GroundRequest = { id, size, decor, images };
  return new Promise((resolve, reject) => {
    requests.set(id, { resolve, reject });
    worker!.postMessage(message);
  });
}

/** Densité du sol avec son décor extérieur (README : 1,5 sur ordinateur, 1 sur téléphone ; 2 serait trop lourd). */
export const worldDensity = (): number => (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 1 : 1.5);

/** Sols prêts ou en cours, par clé du cache : une URL d'objet, calculée ou lue une fois par session. */
const grounds = new Map<string, Promise<string>>();

/** Le sol de la clé `key` : lu dans le cache de l'appareil, sinon calculé par `compute` puis mis en cache. */
function groundUrl(key: string, compute: () => Promise<Blob>): Promise<string> {
  let ground = grounds.get(key);
  if (!ground) {
    ground = readGround(key)
      .then(
        (cached) =>
          cached ??
          compute().then((blob) => {
            void writeGround(key, blob);
            return blob;
          }),
      )
      .then((blob) => URL.createObjectURL(blob));
    grounds.set(key, ground);
    // Un échec n'est pas gardé : on réessaiera au prochain affichage.
    ground.catch(() => grounds.delete(key));
  }
  return ground;
}

/** Les sols peints d'un plateau : `board` (plateau seul) puis `world` (avec le décor extérieur), `null` tant qu'absents. */
export interface PaintedGrounds {
  readonly board: string | null;
  readonly world: string | null;
}

const NO_GROUNDS: PaintedGrounds = { board: null, world: null };

/**
 * Sols peints du plateau : celui du plateau seul d'abord (vite prêt ; c'est aussi celui de la vue de dessus), puis
 * celui du monde avec son décor extérieur, calculé en tâche de fond (20 à 30 s la première fois, puis lu dans le cache
 * de l'appareil). Sans tâche de fond possible, seulement le plateau.
 */
export function usePaintedGround(board: Board): PaintedGrounds {
  const set = PAINTED[board.name];
  const [ready, setReady] = useState<{ name: string; grounds: PaintedGrounds }>({ name: board.name, grounds: NO_GROUNDS });
  useEffect(() => {
    if (!set) return;
    let alive = true;
    const update = (patch: Partial<PaintedGrounds>) =>
      alive &&
      setReady((current) => ({ name: board.name, grounds: { ...(current.name === board.name ? current.grounds : NO_GROUNDS), ...patch } }));
    const size = board.rows;
    const boardDecor = set.board;
    const boardReady = groundUrl(groundKey(`${board.name}|plateau`, boardDecor, boardDecor.plan.densite), () =>
      canUseWorker() ? groundInWorker(size, boardDecor).catch(() => groundOnMainThread(size, boardDecor)) : groundOnMainThread(size, boardDecor),
    ).then(
      (url) => update({ board: url }),
      (error: unknown) => console.error(error),
    );
    if ((set.full.plan.bordure ?? 0) > 0 && canUseWorker()) {
      const density = worldDensity();
      const worldDecor: PaintedDecor = { ...set.full, plan: { ...set.full.plan, densite: density } };
      // Après le plateau seul : la tâche de fond traite ses demandes l'une après l'autre, le plateau passe d'abord.
      void boardReady
        .then(() => groundUrl(groundKey(`${board.name}|monde`, worldDecor, density), () => groundInWorker(size, worldDecor)))
        .then(
          (url) => update({ world: url }),
          (error: unknown) => console.error(error),
        );
    }
    return () => {
      alive = false;
    };
  }, [board, set]);
  return set && ready.name === board.name ? ready.grounds : NO_GROUNDS;
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
