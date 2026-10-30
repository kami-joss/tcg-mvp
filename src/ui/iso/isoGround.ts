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
  /** Teinte multipliée sur les tuiles de la zone (0..1 par canal) et saturation (1 = inchangée). */
  readonly teinte?: readonly [number, number, number];
  readonly saturation?: number;
  /** Rétrécit la zone de ce nombre de px de plan sur chaque bord (allées plus fines que les cases). */
  readonly retrait?: number;
}
export interface GroundSocle {
  readonly cases: readonly (readonly [number, number])[];
  readonly teinte: readonly [number, number, number];
  /** Rétrécit le socle de ce nombre de px de plan sur chaque bord (sol d'un enclos qui ne doit pas déborder). */
  readonly retrait?: number;
}
export interface GroundDecal {
  readonly image: string;
  readonly case: readonly [number, number];
  /** Pièce de 1 × 2 cases : le long des lignes (vers le bas) ou des colonnes (vers la droite). */
  readonly sens: 'lignes' | 'colonnes';
  /**
   * Retourne la pièce bout pour bout. Les deux extrémités d'une pièce ne sont pas identiques (berges un peu décalées) :
   * en alternant `miroir` d'une pièce à la suivante, chaque raccord se fait entre deux bouts identiques, sans marche.
   */
  readonly miroir?: boolean;
}
export interface GroundSprite {
  readonly id: string;
  readonly case?: readonly [number, number];
  readonly empreinte?: readonly (readonly [number, number])[];
  /** `arbre` : ombre ronde sous le feuillage, la case peut être décimale (arbres semés librement). */
  readonly ombre?: 'haute' | 'moyenne' | 'basse' | 'arbre';
}
export interface GroundDecor {
  /** `bordure` : nombre de cases de décor peintes autour du plateau (0 si absent). */
  readonly plan: { readonly pas: number; readonly case: number; readonly marge: number; readonly densite: number; readonly bordure?: number };
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
  // Loin de toute zone (masque nul), le bruit seul ne doit rien dessiner, comme pour les socles : sans ce garde-fou, la
  // bande sombre de la frontière apparaissait aux pics du bruit, en points sombres réguliers dans l'herbe (les zones
  // vides du décor s'additionnant).
  const gate = smoothstep(mask / 0.12);
  return { alpha: alpha * gate, band: Math.exp(-((d / 0.16) ** 2)) * gate };
}

/** Socle de terre sous les reliefs : alpha du socle et liseré sombre de son bord. */
export function socleBlend(mask: number, coarse: number, fine: number): { alpha: number; rim: number } {
  const s = mask + 0.16 * coarse + 0.05 * fine;
  // Loin de tout socle (masque nul), le bruit seul ne doit rien dessiner : sans ce garde-fou, le liseré
  // apparaissait partout où le bruit est fort, en taches sombres dans l'herbe.
  const gate = smoothstep(mask / 0.12);
  return { alpha: Math.min(1, Math.max(0, (s - 0.2) / 0.14)) * gate, rim: Math.exp(-(((s - 0.22) / 0.04) ** 2)) * 0.18 * gate };
}

const SHADOW_LENGTH = { haute: 0.9, moyenne: 0.45, basse: 0.15, arbre: 0 } as const;

/**
 * Construit le sol d'un plateau `size` × `size`. `images` contient les tuiles vues de dessus (côté 2 × `pas` px), les
 * pièces de 1 × 2 cases et `bruit` (texture tuilable). Renvoie un canevas de côté `plan × densité`.
 */
export function buildGround(size: number, decor: GroundDecor, images: Readonly<Record<string, CanvasImageSource>>, makeCanvas: MakeCanvas = browserCanvas): Canvas {
  const { pas, case: cell, marge, densite: D } = decor.plan;
  const border = decor.plan.bordure ?? 0;
  const plan = 2 * marge + (size + 2 * border) * pas - (pas - cell);
  const W = Math.round(plan * D);
  const ground = makeCanvas(W, W);
  const g = ground.getContext('2d')!;
  // Canevas de travail : suivis pour être libérés dès la fin de chaque étape (avec une bordure de décor, un canevas
  // pèse plusieurs dizaines de Mo ; sans libération, le pic mémoire fait planter les petits appareils).
  const temp: Canvas[] = [];
  const track = (w: number, h: number): Canvas => {
    const c = makeCanvas(w, h);
    temp.push(c);
    return c;
  };
  const scoped = (fn: () => void) => {
    const mark = temp.length;
    fn();
    for (const c of temp.splice(mark)) {
      c.width = 0;
      c.height = 0;
    }
  };
  const fresh = (): [Canvas, Ctx] => {
    const c = track(W, W);
    return [c, c.getContext('2d')!];
  };
  const inPlan = (ctx: Ctx) => ctx.setTransform(D, 0, 0, D, 0, 0);
  // Une case couvre tout son pas (la demi-gouttière autour comprise) : pas de joint entre les tuiles.
  // Les cases de décor ont des indices négatifs ou ≥ size ; la case (0, 0) du plateau est décalée de `border` cases.
  const cellX = (col: number) => marge + (col + border) * pas - (pas - cell) / 2;
  const cellY = (row: number) => marge + (row + border) * pas - (pas - cell) / 2;
  // Tuiles à bords fondus, un peu plus grandes que la case : elles se chevauchent, et la grille des tuiles
  // (légères différences de teinte d'une tuile à l'autre) ne se voit plus.
  const FEATHER = 0.16;
  const feathered = new Map<string, Canvas>();
  const featheredTile = (name: string): Canvas => {
    let c = feathered.get(name);
    if (c) return c;
    const S = Math.round(pas * (1 + 2 * FEATHER) * D);
    c = makeCanvas(S, S);
    const x = c.getContext('2d')!;
    // la tuile est répétée en miroir sur ses bords pour remplir le débord sans couture
    const inner = pas * D;
    const off = (S - inner) / 2;
    for (const [sx, sy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]] as const) {
      x.save();
      x.translate(off + sx * inner + (sx === 0 ? 0 : inner / 2) + inner / 2 * (sx === 0 ? 1 : 0), off + sy * inner + inner / 2);
      x.scale(sx === 0 ? 1 : -1, sy === 0 ? 1 : -1);
      x.drawImage(images[name]!, -inner / 2, -inner / 2, inner, inner);
      x.restore();
    }
    const m = makeCanvas(S, S);
    const mx = m.getContext('2d')!;
    mx.filter = `blur(${(S * FEATHER) / 2.2}px)`;
    mx.fillStyle = '#fff';
    mx.fillRect(S * FEATHER * 0.9, S * FEATHER * 0.9, S * (1 - 1.8 * FEATHER), S * (1 - 1.8 * FEATHER));
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(m, 0, 0);
    feathered.set(name, c);
    return c;
  };
  /** Pose des tuiles en deux passes : d'abord nettes et jointives (aucun trou), puis fondues par-dessus. */
  const paint = (ctx: Ctx, cells: readonly (readonly [number, number])[], pick: () => string) => {
    const names = cells.map(() => pick());
    cells.forEach(([row, col], i) => ctx.drawImage(images[names[i]!]!, cellX(col), cellY(row), pas, pas));
    cells.forEach(([row, col], i) =>
      ctx.drawImage(featheredTile(names[i]!), cellX(col) - pas * FEATHER, cellY(row) - pas * FEATHER, pas * (1 + 2 * FEATHER), pas * (1 + 2 * FEATHER)),
    );
  };
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
    const a = track(M, M);
    const ax = a.getContext('2d')!;
    ax.fillStyle = '#fff';
    const g0 = Math.max(0, grow);
    for (const [row, col] of cells) ax.fillRect(cellX(col) - g0, cellY(row) - g0, pas + 2 * g0, pas + 2 * g0);
    if (grow < 0) {
      // érosion : flou puis seuil haut, la zone perd environ |grow| px sur chaque bord
      const e = track(M, M);
      const ex = e.getContext('2d')!;
      ex.filter = `blur(${-grow}px)`;
      ex.drawImage(a, 0, 0);
      const d0 = ex.getImageData(0, 0, M, M);
      for (let i = 3; i < d0.data.length; i += 4) d0.data[i] = d0.data[i]! > 245 ? 255 : 0;
      ax.clearRect(0, 0, M, M);
      ax.putImageData(d0, 0, 0);
    }
    const b = track(M, M);
    const bx = b.getContext('2d')!;
    bx.filter = `blur(${blur}px)`;
    bx.drawImage(a, 0, 0);
    const d = bx.getImageData(0, 0, M, M).data;
    const v = new Float32Array(M * M);
    for (let i = 0; i < v.length; i++) v[i] = d[i * 4 + 3]! / 255;
    return v;
  };
  const alphaCanvas = (alpha: Float32Array, rgb: readonly number[] = [0, 0, 0]): Canvas => {
    const m = track(M, M);
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
      if (!seen.has(k) && r + dr >= -border && c + dc >= -border && r + dr < size + border && c + dc < size + border) {
        seen.add(k);
        out.push([r + dr, c + dc]);
      }
    }
    return out;
  };

  // --- 1. herbe partout, marge comprise -------------------------------------------------------------------------
  inPlan(g);
  {
    const all: [number, number][] = [];
    for (let row = -border - 1; row <= size + border; row++) for (let col = -border - 1; col <= size + border; col++) all.push([row, col]);
    paint(g, all, () => weightedPick(random, decor.herbe.tuiles, decor.herbe.poids));
  }
  scoped(() => {
    // grandes nuances : bruit étiré sur ~6 cases, en lumière douce, pour casser la répétition des tuiles
    const [n2, n2x] = fresh();
    const big = 6 * pas;
    n2x.filter = 'grayscale(1)';
    for (let y = 0; y < plan; y += big) for (let xx = 0; xx < plan; xx += big) n2x.drawImage(images.bruit!, xx * D, y * D, big * D, big * D);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = 0.6;
    g.drawImage(n2, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  });
  scoped(() => {
    const [c, x] = fresh();
    x.filter = 'saturate(0.8) sepia(0.1) brightness(0.93)';
    x.drawImage(ground, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.drawImage(c, 0, 0);
  });

  // --- 2. sols de zones, transition bruitée et bande sombre sur la frontière ------------------------------------
  for (const zone of decor.zones) scoped(() => {
    const [layer, lx] = fresh();
    inPlan(lx);
    paint(lx, ring(zone.cases), () => weightedPick(random, zone.tuiles, zone.poids));
    if (zone.teinte || zone.saturation !== undefined) {
      const [t2, t2x] = fresh();
      t2x.filter = `saturate(${zone.saturation ?? 1})`;
      t2x.drawImage(layer, 0, 0);
      t2x.filter = 'none';
      if (zone.teinte) {
        t2x.globalCompositeOperation = 'multiply';
        t2x.fillStyle = `rgb(${zone.teinte.map((v) => Math.round(v * 255)).join(',')})`;
        t2x.fillRect(0, 0, W, W);
        t2x.globalCompositeOperation = 'destination-in';
        t2x.drawImage(layer, 0, 0);
        t2x.globalCompositeOperation = 'source-over';
      }
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.clearRect(0, 0, W, W);
      lx.drawImage(t2, 0, 0);
    }
    const mask = cellMask(zone.cases, 10, -(zone.retrait ?? 0));
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
  });

  // --- 3. socles de terre sous les reliefs, teintés -------------------------------------------------------------
  for (const socle of decor.socles) scoped(() => {
    if (socle.cases.length === 0) return;
    const [layer, lx] = fresh();
    inPlan(lx);
    paint(lx, ring(socle.cases), () => (random() < 0.5 ? 'terre_unie' : 'terre_copeaux'));
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
    const mask = cellMask(socle.cases, 13, -(socle.retrait ?? 0));
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
  });

  // --- 4. pièces peintes dans le sol (canal, étangs) ------------------------------------------------------------
  for (const d of decor.decals) {
    const [row, col] = d.case;
    const x = cellX(col);
    const y = cellY(row);
    if (d.sens === 'lignes') g.setTransform(D, 0, 0, D, x * D, y * D);
    else g.setTransform(0, D, D, 0, x * D, y * D); // transposée : la pièce part vers la droite
    if (d.miroir) g.transform(1, 0, 0, -1, 0, 2 * pas);
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
    if (s.ombre === 'arbre' && s.case) {
      const cx0 = cellX(s.case[1]) + pas / 2;
      const cy0 = cellY(s.case[0]) + pas / 2;
      aox.beginPath();
      aox.ellipse(cx0, cy0, pas * 0.34, pas * 0.34, 0, 0, Math.PI * 2);
      aox.fill();
      cx.beginPath();
      cx.ellipse(cx0 + pas * 0.55, cy0 + pas * 0.1, pas * 0.6, pas * 0.32, 0, 0, Math.PI * 2);
      cx.fill();
      continue;
    }
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

  // --- 6. bords du monde fondus en transparence (décor en bordure seulement) -----------------------------------
  if (border > 0) {
    const [fade, fx] = fresh();
    inPlan(fx);
    fx.fillStyle = '#fff';
    const inset = marge + pas * 1.3;
    fx.fillRect(inset, inset, plan - 2 * inset, plan - 2 * inset);
    const soft = blurred(fade, pas * 0.6);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(soft, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
  return ground;
}
