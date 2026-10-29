// Sol du plateau vu de dessus, calculé à partir des données (handoff « Plateau 15 × 15 »).
// Rendu uniquement : rien ici ne touche aux règles. Le résultat est une image du plan du plateau (repère de
// `scenery.ts` : cases de `case` px au pas de `pas`, marge `marge`), posée sous les cases ; la vue isométrique la
// projette avec le reste du plateau. Calculé une fois par plateau, jamais à chaque image.

export interface GroundTilesDef {
  readonly tuiles: readonly string[];
  readonly poids: readonly number[];
}
export interface GroundZone extends GroundTilesDef {
  readonly sol: string;
  readonly cases: readonly (readonly [number, number])[];
  readonly bande: readonly [number, number, number];
  readonly forceBande: number;
  /** Sol par plaques (terre seulement par endroits, l'herbe ailleurs) : décalage du seuil, 0.2 pour la Scierie. */
  readonly plaques?: number;
}
export interface GroundSocle {
  readonly cases: readonly (readonly [number, number])[];
  readonly teinte: readonly [number, number, number];
}
export interface GroundDecal {
  readonly image: string;
  readonly case: readonly [number, number];
  /** Pièce de 1 × 2 cases : le long des lignes (vers le bas) ou des colonnes (vers la droite). */
  readonly sens: 'lignes' | 'colonnes';
}
export interface GroundSprite {
  readonly id: string;
  readonly case?: readonly [number, number];
  readonly empreinte?: readonly (readonly [number, number])[];
  readonly ombre?: 'haute' | 'moyenne' | 'basse';
}
export interface GroundDecor {
  readonly plan: { readonly pas: number; readonly case: number; readonly marge: number; readonly densite: number };
  readonly graine: number;
  readonly herbe: GroundTilesDef;
  readonly zones: readonly GroundZone[];
  readonly socles: readonly GroundSocle[];
  readonly decals: readonly GroundDecal[];
  readonly sprites: readonly GroundSprite[];
}

type Canvas = HTMLCanvasElement;
type Ctx = CanvasRenderingContext2D;
export type MakeCanvas = (width: number, height: number) => Canvas;

const browserCanvas: MakeCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/** Pseudo-aléatoire déterministe (mulberry32) : le même plateau à chaque chargement. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedPick(random: () => number, names: readonly string[], weights: readonly number[]): string {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let x = random() * total;
  for (let i = 0; i < names.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return names[i]!;
  }
  return names[names.length - 1]!;
}

export const smoothstep = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/** Transition d'un sol de zone : alpha du sol et force de la bande sombre, d'après le masque flou et le bruit. */
export function zoneBlend(mask: number, coarse: number, fine: number, patches?: { noise: number; offset: number }): { alpha: number; band: number } {
  const d = (mask - 0.5) * 2.2 + 0.32 * coarse + 0.06 * fine;
  let alpha = smoothstep((d + 0.12) / 0.24);
  if (patches) alpha *= Math.min(1, Math.max(0, (patches.noise * 0.9 + fine * 0.25 + patches.offset) * 1.8));
  return { alpha, band: Math.exp(-((d / 0.16) ** 2)) };
}

/** Socle de terre sous les reliefs : alpha du socle et liseré sombre de son bord. */
export function socleBlend(mask: number, coarse: number, fine: number): { alpha: number; rim: number } {
  const s = mask + 0.16 * coarse + 0.05 * fine;
  return { alpha: Math.min(1, Math.max(0, (s - 0.2) / 0.14)), rim: Math.exp(-(((s - 0.22) / 0.04) ** 2)) * 0.18 };
}

const SHADOW_LENGTH = { haute: 0.9, moyenne: 0.45, basse: 0.15 } as const;

/**
 * Construit le sol d'un plateau `size` × `size`. `images` contient les tuiles vues de dessus (côté 2 × `pas` px), les
 * pièces de 1 × 2 cases et `bruit` (texture tuilable). Renvoie un canevas de côté `plan × densité`.
 */
export function buildGround(size: number, decor: GroundDecor, images: Readonly<Record<string, CanvasImageSource>>, makeCanvas: MakeCanvas = browserCanvas): Canvas {
  const { pas, case: cell, marge, densite: D } = decor.plan;
  const plan = 2 * marge + size * pas - (pas - cell);
  const W = Math.round(plan * D);
  const ground = makeCanvas(W, W);
  const g = ground.getContext('2d')!;
  const fresh = (): [Canvas, Ctx] => {
    const c = makeCanvas(W, W);
    return [c, c.getContext('2d')!];
  };
  const inPlan = (ctx: Ctx) => ctx.setTransform(D, 0, 0, D, 0, 0);
  // Une case couvre tout son pas (la demi-gouttière autour comprise) : pas de joint entre les tuiles.
  const cellX = (col: number) => marge + col * pas - (pas - cell) / 2;
  const cellY = (row: number) => marge + row * pas - (pas - cell) / 2;
  const tile = (ctx: Ctx, name: string, row: number, col: number) => ctx.drawImage(images[name]!, cellX(col), cellY(row), pas, pas);
  const random = seeded(decor.graine);

  // --- masques au pas d'un pixel du plan ----------------------------------------------------------------------
  const M = Math.round(plan);
  const noise = (() => {
    const c = makeCanvas(M, M);
    const x = c.getContext('2d')!;
    const period = 2.5 * pas;
    for (let y = 0; y < M; y += period) for (let xx = 0; xx < M; xx += period) x.drawImage(images.bruit!, xx, y, period, period);
    const d = x.getImageData(0, 0, M, M).data;
    const n = M * M;
    const coarse = new Float32Array(n);
    const fine = new Float32Array(n);
    const patches = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      coarse[i] = (d[i * 4]! - 128) / 42;
      fine[i] = (d[i * 4 + 1]! - 128) / 42;
      patches[i] = (d[i * 4 + 2]! - 128) / 42;
    }
    return { coarse, fine, patches };
  })();
  /** Masque flou (0..1) d'un ensemble de cases, lu dans le canal alpha (fond transparent). */
  const cellMask = (cells: readonly (readonly [number, number])[], blur: number, grow = 0): Float32Array => {
    const a = makeCanvas(M, M);
    const ax = a.getContext('2d')!;
    ax.fillStyle = '#fff';
    for (const [row, col] of cells) ax.fillRect(cellX(col) - grow, cellY(row) - grow, pas + 2 * grow, pas + 2 * grow);
    const b = makeCanvas(M, M);
    const bx = b.getContext('2d')!;
    bx.filter = `blur(${blur}px)`;
    bx.drawImage(a, 0, 0);
    const d = bx.getImageData(0, 0, M, M).data;
    const v = new Float32Array(M * M);
    for (let i = 0; i < v.length; i++) v[i] = d[i * 4 + 3]! / 255;
    return v;
  };
  const alphaCanvas = (alpha: Float32Array, rgb: readonly number[] = [0, 0, 0]): Canvas => {
    const m = makeCanvas(M, M);
    const mx = m.getContext('2d')!;
    const img = mx.createImageData(M, M);
    for (let i = 0; i < alpha.length; i++) {
      img.data[i * 4] = rgb[0]!;
      img.data[i * 4 + 1] = rgb[1]!;
      img.data[i * 4 + 2] = rgb[2]!;
      img.data[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, alpha[i]!)));
    }
    mx.putImageData(img, 0, 0);
    const [c, x] = fresh();
    x.drawImage(m, 0, 0, W, W);
    return c;
  };
  const masked = (layer: Canvas, alpha: Float32Array): Canvas => {
    const x = layer.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(alphaCanvas(alpha, [255, 255, 255]), 0, 0);
    x.globalCompositeOperation = 'source-over';
    return layer;
  };
  const ring = (cells: readonly (readonly [number, number])[]): [number, number][] => {
    const seen = new Set<string>();
    const out: [number, number][] = [];
    for (const [r, c] of cells) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const k = `${r + dr},${c + dc}`;
      if (!seen.has(k) && r + dr >= 0 && c + dc >= 0 && r + dr < size && c + dc < size) {
        seen.add(k);
        out.push([r + dr, c + dc]);
      }
    }
    return out;
  };

  // --- 1. herbe partout, marge comprise -------------------------------------------------------------------------
  inPlan(g);
  for (let row = -1; row <= size; row++) for (let col = -1; col <= size; col++) tile(g, weightedPick(random, decor.herbe.tuiles, decor.herbe.poids), row, col);
  {
    const [c, x] = fresh();
    x.filter = 'saturate(0.8) sepia(0.1) brightness(0.93)';
    x.drawImage(ground, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.drawImage(c, 0, 0);
  }

  // --- 2. sols de zones, transition bruitée et bande sombre sur la frontière ------------------------------------
  for (const zone of decor.zones) {
    const [layer, lx] = fresh();
    inPlan(lx);
    for (const [row, col] of ring(zone.cases)) tile(lx, weightedPick(random, zone.tuiles, zone.poids), row, col);
    const mask = cellMask(zone.cases, 10);
    const alpha = new Float32Array(mask.length);
    const band = new Float32Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
      const b = zoneBlend(mask[i]!, noise.coarse[i]!, noise.fine[i]!, zone.plaques === undefined ? undefined : { noise: noise.patches[i]!, offset: zone.plaques });
      alpha[i] = b.alpha;
      band[i] = b.band * zone.forceBande;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(masked(layer, alpha), 0, 0);
    g.drawImage(alphaCanvas(band, zone.bande), 0, 0);
  }

  // --- 3. socles de terre sous les reliefs, teintés -------------------------------------------------------------
  for (const socle of decor.socles) {
    const [layer, lx] = fresh();
    inPlan(lx);
    for (const [row, col] of ring(socle.cases)) tile(lx, random() < 0.5 ? 'terre_unie' : 'terre_copeaux', row, col);
    const [tinted, tx] = fresh();
    tx.filter = 'saturate(0.45)';
    tx.drawImage(layer, 0, 0);
    tx.filter = 'none';
    tx.globalCompositeOperation = 'multiply';
    tx.fillStyle = `rgb(${socle.teinte.map((v) => Math.round(v * 255)).join(',')})`;
    tx.fillRect(0, 0, W, W);
    tx.globalCompositeOperation = 'screen';
    tx.fillStyle = 'rgb(40,34,26)';
    tx.fillRect(0, 0, W, W);
    tx.globalCompositeOperation = 'destination-in';
    tx.drawImage(layer, 0, 0);
    tx.globalCompositeOperation = 'source-over';
    const mask = cellMask(socle.cases, 13);
    const alpha = new Float32Array(mask.length);
    const rim = new Float32Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
      const b = socleBlend(mask[i]!, noise.coarse[i]!, noise.fine[i]!);
      alpha[i] = b.alpha;
      rim[i] = b.rim;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(masked(tinted, alpha), 0, 0);
    g.drawImage(alphaCanvas(rim), 0, 0);
  }

  // --- 4. pièces peintes dans le sol (canal, étangs) ------------------------------------------------------------
  for (const d of decor.decals) {
    const [row, col] = d.case;
    const x = cellX(col);
    const y = cellY(row);
    if (d.sens === 'lignes') g.setTransform(D, 0, 0, D, x * D, y * D);
    else g.setTransform(0, D, D, 0, x * D, y * D); // transposée : la pièce part vers la droite
    g.drawImage(images[d.image]!, 0, 0, pas, 2 * pas);
  }

  // --- 5. occlusion sous les reliefs, ombres portées vers l'avant droit de l'écran (+colonne) -----------------
  const [ao, aox] = fresh();
  const [cast, cx] = fresh();
  inPlan(aox);
  inPlan(cx);
  aox.fillStyle = '#000';
  cx.fillStyle = '#000';
  for (const s of decor.sprites) {
    if (!s.ombre) continue;
    const cells = s.empreinte ?? (s.case ? [s.case] : []);
    for (const [row, col] of cells) {
      aox.fillRect(cellX(col) - 4, cellY(row) - 4, pas + 8, pas + 8);
      cx.fillRect(cellX(col) + pas * 0.2, cellY(row) + pas * 0.1, pas * (0.8 + SHADOW_LENGTH[s.ombre]), pas * 0.8);
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const blurred = (src: Canvas, px: number): Canvas => {
    const [c, x] = fresh();
    x.filter = `blur(${px * D}px)`;
    x.drawImage(src, 0, 0);
    return c;
  };
  g.globalAlpha = 0.26;
  g.drawImage(blurred(cast, 14), 0, 0);
  g.globalAlpha = 0.34;
  g.drawImage(blurred(ao, 12), 0, 0);
  g.globalAlpha = 1;
  return ground;
}
