// Sol du plateau vu de dessus, calculé à partir des données (handoff « Plateau 15 × 15 »).
// Rendu uniquement : rien ici ne touche aux règles. Le résultat est une image du plan du plateau (repère de
// `scenery.ts` : cases de `case` px au pas de `pas`, marge `marge`), posée sous les cases ; la vue isométrique la
// projette avec le reste du plateau. Calculé une fois par plateau, jamais à chaque image.

export interface GroundTilesDef {
  readonly tuiles: readonly string[];
  readonly poids: readonly number[];
}
/** L'herbe : ses tuiles et poids, plus des cases sobres et le filtre posé sur elle. */
export interface GroundGrass extends GroundTilesDef {
  /** Cases où seules ces tuiles sont posées : pas de fleurs sur une mana zone ni autour (leur rose est proche de la teinte « contestée »). */
  readonly sobre?: { readonly tuiles: readonly string[]; readonly cases: readonly (readonly [number, number])[] };
  /** Filtre CSS de l'herbe une fois posée (défaut : celui des premières tuiles) ; `none` pour des tuiles déjà à leur teinte. */
  readonly filtre?: string;
  /**
   * Herbe posée en continu : n × n tuiles découpées dans une même texture raccordée, dans l'ordre des lignes, répétées
   * tous les n cases à la place du tirage. Ses grandes plages se suivent d'une case à l'autre (tirées au hasard, elles
   * feraient un damier) ; les tuiles sont jointives, sans fondu.
   */
  readonly motif?: readonly string[];
  /** Touffes posées une à une par-dessus l'herbe (`GroundTufts`) : du volume, sans motif qui se répète. */
  readonly touffes?: GroundTufts;
  /**
   * Force des grandes nuances (bruit flouté en lumière douce, 0 à 1 ; 0,6 par défaut) : elles cassent la répétition des
   * tuiles, mais font varier la couleur de l'herbe d'une case à l'autre ; 0 pour une herbe partout de la même couleur.
   */
  readonly nuances?: number;
}

/**
 * Touffes d'herbe posées une à une sur le sol (2026-11-11) : chacune est une image vue comme les sprites (isométrie
 * vraie), dessinée dans le plan redressée par l'inverse de la projection, pour que la vue isométrique la remette debout.
 * Leur nombre, leur place, leur image et leur taille sont tirés pour chaque case : aucune case ne ressemble à une autre.
 */
/** Une sorte de végétation semée (`GroundTufts`) : son image, son poids au tirage, sa taille, son pied. */
export interface GroundTuftKind {
  /** Image (dans le dossier du sol), vue comme les sprites, recadrée au plus près. */
  readonly image: string;
  /** Poids au tirage, relatif aux autres sortes (une touffe fréquente, un champignon rare). */
  readonly poids: number;
  /** Largeur à l'écran, en fraction de la largeur du losange d'une case (plus petite, plus grande). */
  readonly taille: readonly [number, number];
  /**
   * Pied dans l'image, en fraction de sa hauteur depuis le haut : en bas pour une plante debout (sa base), vers le milieu
   * pour ce qui est couché au sol (trèfle, rosette, pierres).
   */
  readonly pied: number;
  /** Écart aux cases nues (`GroundTufts.sans`), en cases ; celui de `GroundTufts` par défaut (plus grand pour des fleurs). */
  readonly rayon?: number;
  /**
   * Sorte locale : semée seulement sur ces cases et leur carré de `rayon` (des cailloux autour des roches), à raison de
   * `parCase` éléments par case en moyenne, en plus et hors du tirage général.
   */
  readonly pres?: { readonly cases: readonly (readonly [number, number])[]; readonly rayon: number; readonly parCase: number };
}

/**
 * Végétation semée une à une sur le sol (2026-11-11) : chaque élément est une image vue comme les sprites (isométrie
 * vraie), dessinée dans le plan redressée par l'inverse de la projection, pour que la vue isométrique la remette debout.
 * Leur nombre par case (tirage de Poisson : des cases vides, d'autres à deux ou trois éléments), leur sorte, leur place
 * sur toute la case et leur taille sont tirés pour chaque case : aucune case ne ressemble à une autre.
 */
export interface GroundTufts {
  readonly sortes: readonly GroundTuftKind[];
  /** Éléments par case en moyenne (loi de Poisson). */
  readonly parCase: number;
  /** Cases laissées nues, et leur carré de `rayon` : les mana zones, pour que leur lueur et leur icône restent lisibles. */
  readonly sans: readonly (readonly [number, number])[];
  readonly rayon: number;
  /** Opacité de l'ombre de contact sous chaque élément. */
  readonly ombre: number;
}

/** Un élément posé : son image, son pied dans le plan du sol (px de plan), sa largeur à l'écran (unités du plan), son pied dans l'image. */
export interface TuftPlacement {
  readonly image: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly pied: number;
}

/** Graine propre à une case : le même tirage où qu'elle soit calculée (plateau seul, monde, sol net). */
function cellSeed(seed: number, row: number, col: number): number {
  let h = (seed ^ Math.imul(row + 0x9e37, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (col + 0x632b), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Tirage de Poisson de moyenne `mean` (méthode de Knuth). */
export function poisson(random: () => number, mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = random();
  while (p > limit) {
    k++;
    p *= random();
  }
  return k;
}

/**
 * La végétation d'un sol `size` × `size` (décor extérieur compris), triée du fond vers l'avant (les éléments les plus
 * proches de la caméra dessinés en dernier). Pure et déterministe : la même case donne toujours les mêmes éléments.
 */
export function tuftPlacements(size: number, decor: GroundDecor): TuftPlacement[] {
  const tufts = decor.herbe.touffes;
  if (!tufts || tufts.sortes.length === 0 || tufts.parCase <= 0) return [];
  const { pas, case: cell, marge } = decor.plan;
  const border = decor.plan.bordure ?? 0;
  const corner = (index: number) => marge + (index + border) * pas - (pas - cell) / 2;
  const near = (row: number, col: number, radius: number) => tufts.sans.some(([r, c]) => Math.abs(r - row) <= radius && Math.abs(c - col) <= radius);
  const diamond = pas * Math.SQRT2;
  const general = tufts.sortes.filter((kind) => !kind.pres);
  const local = tufts.sortes.filter((kind) => kind.pres);
  const names = general.map((kind) => kind.image);
  const weights = general.map((kind) => kind.poids);
  const out: TuftPlacement[] = [];
  const place = (kind: GroundTuftKind, row: number, col: number, random: () => number) => {
    const [x, y, t] = [random(), random(), random()];
    const [small, large] = kind.taille;
    out.push({ image: kind.image, x: corner(col) + pas * x, y: corner(row) + pas * y, width: diamond * (small + (large - small) * t), pied: kind.pied });
  };
  for (let row = -border; row < size + border; row++) {
    for (let col = -border; col < size + border; col++) {
      if (near(row, col, tufts.rayon)) continue;
      const random = seeded(cellSeed(decor.graine, row, col));
      const count = names.length > 0 ? poisson(random, tufts.parCase) : 0;
      for (let i = 0; i < count; i++) {
        const kind = general[names.indexOf(weightedPick(random, names, weights))]!;
        // Une sorte qui veut plus d'écart (des fleurs) n'est pas posée trop près des cases nues : on tire quand même sa
        // place, pour que le tirage des éléments suivants ne dépende pas de ce choix.
        if (kind.rayon !== undefined && kind.rayon > tufts.rayon && near(row, col, kind.rayon)) {
          random();
          random();
          random();
          continue;
        }
        place(kind, row, col, random);
      }
      for (const kind of local) {
        const { cases, rayon, parCase } = kind.pres!;
        if (!cases.some(([r, c]) => Math.abs(r - row) <= rayon && Math.abs(c - col) <= rayon)) continue;
        const extra = poisson(random, parCase);
        for (let i = 0; i < extra; i++) place(kind, row, col, random);
      }
    }
  }
  return out.sort((a, b) => a.x + a.y - (b.x + b.y));
}

/**
 * Flou du bruit des grandes nuances, en unités du plan : il efface son grain fin (moins d'une unité) et garde ses
 * grandes taches (plusieurs dizaines d'unités), seules utiles pour casser la répétition des tuiles.
 */
export const NUANCE_BLUR = 4;

/** Filtre de l'herbe par défaut, réglé pour les premières tuiles. */
export const GRASS_FILTER = 'saturate(0.8) sepia(0.1) brightness(0.93)';

/** La tuile d'une case dans un motif de n × n tuiles posé en continu (répété tous les n cases, indices négatifs compris). */
export function motifTile(motif: readonly string[], row: number, col: number): string {
  const n = Math.round(Math.sqrt(motif.length));
  const mod = (v: number) => ((v % n) + n) % n;
  return motif[mod(row) * n + mod(col)]!;
}

/** La tuile d'herbe d'une case : celle du motif, ou tirée parmi toutes, ou parmi les seules tuiles sobres sur une case sobre. */
export function grassTile(random: () => number, grass: GroundGrass, row: number, col: number): string {
  if (grass.motif) return motifTile(grass.motif, row, col);
  const sober = grass.sobre;
  if (sober && sober.cases.some(([r, c]) => r === row && c === col)) {
    const weights = sober.tuiles.map((name) => grass.poids[grass.tuiles.indexOf(name)] ?? 1);
    return weightedPick(random, sober.tuiles, weights);
  }
  return weightedPick(random, grass.tuiles, grass.poids);
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
  /** Filtre CSS posé sur les tuiles de la zone avant la teinte, à la place de la saturation (celui de l'herbe, pour un sous-bois d'herbe). */
  readonly filtre?: string;
  /** Tuiles posées en continu, comme `herbe.motif` : le sous-bois prolonge l'herbe peinte, seulement à l'ombre. */
  readonly motif?: readonly string[];
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
  /** `arbre` : ombre ronde sous le feuillage et ombre portée à sa `taille`, la case peut être décimale (arbres semés librement). */
  readonly ombre?: 'haute' | 'moyenne' | 'basse' | 'arbre';
  /** Largeur et hauteur de l'arbre à l'écran (px, au pas de 72 px), d'après son image et son échelle : la taille de son ombre. */
  readonly taille?: readonly [number, number];
}
/**
 * Terre au pied des sprites (2026-11-11) : une tache de terre aux bords bruités sous chaque arbre et chaque rocher
 * listé, pour adoucir le passage de l'herbe au relief ; les taches voisines se fondent en une seule (un bosquet, une
 * crête).
 */
export interface GroundFootDirt {
  /** Tuiles de la terre (celles du chemin), tirées au hasard. */
  readonly tuiles: readonly string[];
  /** Teinte multipliée sur la terre (0..1 par canal). */
  readonly teinte: readonly [number, number, number];
  readonly opacite: number;
  /** Sprites concernés, par identifiant, et le rayon de leur tache en cases (multiplié par l'échelle du sprite). */
  readonly pieds: readonly { readonly ids: readonly string[]; readonly rayon: number }[];
}

/** Une tache de terre : son centre dans le plan du sol (px de plan) et son rayon (px de plan). */
export interface FootDirtSpot {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface GroundDecor {
  /** Terre au pied des arbres et des rochers (`GroundFootDirt`). */
  readonly terre?: GroundFootDirt;
  /** `bordure` : nombre de cases de décor peintes autour du plateau (0 si absent). */
  readonly plan: { readonly pas: number; readonly case: number; readonly marge: number; readonly densite: number; readonly bordure?: number };
  readonly graine: number;
  readonly herbe: GroundGrass;
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

/**
 * Une partie carrée du sol, en unités du plan du sol entier (coin haut-gauche et côté) : `buildGround` ne dessine que
 * ce carré, avec exactement le même contenu que le sol entier (même hasard, mêmes masques, mêmes ombres), et le fond
 * sur ses bords (`GROUND_VIEW_FADE`) pour se poser sans raccord sur le sol entier.
 */
export interface GroundView {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * Fondu des bords d'un recadrage (`GroundView`), en unités du plan : un carré blanc à `inset` du bord, flouté d'écart type
 * `blur` ; transparent au bord, opaque à `inset + 3 × blur`. Les flous près du bord (ombres) n'y ont pas tout leur
 * voisinage : cette bande transparente les cache.
 */
export const GROUND_VIEW_FADE = { inset: 30, blur: 9 } as const;

/**
 * Le plateau et `margin` cases autour, dans le plan du sol entier (décor extérieur compris) : le recadrage à dessiner
 * plus finement (`buildGround(…, view)`). La marge garde le fondu de ses bords hors du plateau.
 */
export function boardView(plan: GroundDecor['plan'], size: number, margin = 1): GroundView {
  const { pas, case: cell, marge, bordure = 0 } = plan;
  const start = marge + (bordure - margin) * pas - (pas - cell) / 2;
  return { x: start, y: start, size: (size + 2 * margin) * pas };
}

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

/** Les taches de terre d'un sol `size` × `size` (`decor.terre`) : une par sprite listé, au centre de sa case. */
export function footDirtSpots(size: number, decor: GroundDecor): FootDirtSpot[] {
  const dirt = decor.terre;
  if (!dirt) return [];
  const { pas, case: cell, marge } = decor.plan;
  const border = decor.plan.bordure ?? 0;
  const center = (index: number) => marge + (index + border) * pas - (pas - cell) / 2 + pas / 2;
  const out: FootDirtSpot[] = [];
  for (const sprite of decor.sprites) {
    const foot = dirt.pieds.find((group) => group.ids.includes(sprite.id));
    if (!foot || !sprite.case) continue;
    const [row, col] = sprite.case;
    if (row < -border || col < -border || row >= size + border || col >= size + border) continue;
    const scale = (sprite as { readonly echelle?: number }).echelle ?? 1;
    out.push({ x: center(col), y: center(row), r: foot.rayon * pas * scale });
  }
  return out;
}

/** Longueur de l'ombre portée d'un relief, d'un bâtiment ou d'un objet, en cases, selon sa hauteur. */
const SHADOW_LENGTH = { haute: 1.2, moyenne: 0.55, basse: 0.35, arbre: 0 } as const;

/**
 * Sens des ombres portées dans le plan : vers le bas à droite de l'écran (sud-est), comme celles peintes dans la forge,
 * la lumière venant du haut à gauche. 15° des colonnes vers les lignes : en isométrie, ce sens tombe à 45° sous
 * l'horizontale.
 */
export const SHADOW_DIR = [Math.cos(Math.PI / 12), Math.sin(Math.PI / 12)] as const;

/**
 * Toutes les ombres portées (arbres, reliefs, bâtiments, objets) sur un même calque : opacité `alpha` après un flou de
 * `blur` px du plan ; noires, elles se fondent là où elles se croisent au lieu de s'additionner.
 */
const CAST_SHADOW = { alpha: 0.42, blur: 7 } as const;

/**
 * Ombre portée d'un arbre : une goutte qui part du pied, large de `base` × sa largeur à l'écran, longue de `length` × sa
 * hauteur (une hauteur debout de 1 px du plan fait √(2/3) px à l'écran, isométrie vraie).
 */
const TREE_SHADOW = { base: 0.4, length: 0.62 } as const;

/** La goutte de l'ombre d'un arbre au pied (x, y) du plan : enveloppe du cercle du pied et de la pointe. */
export function treeShadow(x: number, y: number, [width, height]: readonly [number, number]): { r: number; tip: readonly [number, number] } {
  const r = width * TREE_SHADOW.base;
  const length = Math.max((height / Math.sqrt(2 / 3)) * TREE_SHADOW.length, r * 1.5);
  return { r, tip: [x + SHADOW_DIR[0] * length, y + SHADOW_DIR[1] * length] };
}

/**
 * Construit le sol d'un plateau `size` × `size`. `images` contient les tuiles vues de dessus (côté 2 × `pas` px), les
 * pièces de 1 × 2 cases et `bruit` (texture tuilable). Renvoie un canevas de côté `plan × densité`, ou seulement le
 * carré `view` (côté `view.size × densité`), au même contenu. Les images réduites le sont en haute qualité.
 */
export function buildGround(
  size: number,
  decor: GroundDecor,
  images: Readonly<Record<string, CanvasImageSource>>,
  makeRawCanvas: MakeCanvas = browserCanvas,
  view: GroundView | null = null,
): Canvas {
  const { pas, case: cell, marge, densite: D } = decor.plan;
  const border = decor.plan.bordure ?? 0;
  const plan = 2 * marge + (size + 2 * border) * pas - (pas - cell);
  // Le carré dessiné, dans le plan : tout le sol, ou le recadrage.
  const [vx, vy, vs] = view ? [view.x, view.y, view.size] : [0, 0, plan];
  const W = Math.round(vs * D);
  // Réductions en haute qualité (les tuiles de 180 px réduites à la densité du sol ; le lissage par défaut crénèle) :
  // le réglage tient tant que le canevas garde sa taille.
  const makeCanvas: MakeCanvas = (width, height) => {
    const canvas = makeRawCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context) context.imageSmoothingQuality = 'high';
    return canvas;
  };
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
  const inPlan = (ctx: Ctx) => ctx.setTransform(D, 0, 0, D, -vx * D, -vy * D);
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
  /**
   * Pose des tuiles en deux passes : d'abord nettes et jointives (aucun trou), puis fondues par-dessus ; une seule pour
   * des tuiles qui se suivent (`feather` faux : le fondu y mêlerait leurs bords en miroir).
   */
  const paint = (ctx: Ctx, cells: readonly (readonly [number, number])[], pick: (row: number, col: number) => string, feather = true) => {
    const names = cells.map(([row, col]) => pick(row, col));
    cells.forEach(([row, col], i) => ctx.drawImage(images[names[i]!]!, cellX(col), cellY(row), pas, pas));
    if (feather) cells.forEach(([row, col], i) =>
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
    // Le masque est au pas d'un pixel du plan entier : on n'en prend que le carré dessiné.
    const side = view ? vs : M;
    x.drawImage(m, vx, vy, side, side, 0, 0, W, W);
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
    paint(g, all, (row, col) => grassTile(random, decor.herbe, row, col), !decor.herbe.motif);
  }

  // --- 1 bis. touffes posées une à une, sous les nuances et le filtre de l'herbe, et sous les chemins, socles et pièces
  // d'eau qui les recouvrent ------------------------------------------------------------------------------------------
  const tufts = decor.herbe.touffes;
  const placements = tuftPlacements(size, decor);
  if (tufts && placements.length > 0) {
    const shadow = makeCanvas(64, 64);
    const sx = shadow.getContext('2d')!;
    const disc = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    disc.addColorStop(0, 'rgba(30,36,14,1)');
    disc.addColorStop(1, 'rgba(30,36,14,0)');
    sx.fillStyle = disc;
    sx.fillRect(0, 0, 64, 64);
    // Redresse une image vue en isométrie : l'inverse de X = (x − y)/√2, Y = (x + y)/√6.
    const [upright, depth] = [Math.SQRT1_2, Math.sqrt(1.5)];
    for (const tuft of placements) {
      const image = images[tuft.image] as (CanvasImageSource & { readonly width: number; readonly height: number }) | undefined;
      if (!image) continue;
      inPlan(g);
      // Ombre de contact : un disque flou dans le plan (aplati par la projection), un peu vers le bas à droite de l'écran.
      const r = tuft.width * 0.34;
      const [ox, oy] = [SHADOW_DIR[0] * r * 0.25, SHADOW_DIR[1] * r * 0.25];
      g.globalAlpha = tufts.ombre;
      g.drawImage(shadow, tuft.x + ox - r, tuft.y + oy - r, 2 * r, 2 * r);
      g.globalAlpha = 1;
      g.transform(upright, -upright, depth, depth, tuft.x, tuft.y);
      const height = (tuft.width * image.height) / image.width;
      g.drawImage(image, -tuft.width / 2, -tuft.pied * height, tuft.width, height);
    }
    inPlan(g);
  }
  const nuances = decor.herbe.nuances ?? 0.6;
  if (nuances > 0) scoped(() => {
    // grandes nuances : bruit étiré sur ~6 cases, en lumière douce, pour casser la répétition des tuiles. Le bruit est
    // d'abord flouté (`NUANCE_BLUR`), en tuile raccordée (entourée de ses copies, pour un flou sans couture) : son grain
    // fin, étiré et posé sur toute l'herbe, la couvrait d'un brouillard tacheté qui la rendait floue (2026-11-11).
    const [n2, n2x] = fresh();
    const big = 6 * pas;
    const P = Math.round(big * D);
    const wide = track(3 * P, 3 * P);
    const wx = wide.getContext('2d')!;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) wx.drawImage(images.bruit!, i * P, j * P, P, P);
    const smooth = track(P, P);
    const smx = smooth.getContext('2d')!;
    smx.filter = `grayscale(1) blur(${NUANCE_BLUR * D}px)`;
    smx.drawImage(wide, -P, -P);
    for (let y = 0; y < plan; y += big) for (let xx = 0; xx < plan; xx += big) n2x.drawImage(smooth, (xx - vx) * D, (y - vy) * D, P, P);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = nuances;
    g.drawImage(n2, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  });
  scoped(() => {
    const [c, x] = fresh();
    x.filter = decor.herbe.filtre ?? GRASS_FILTER;
    x.drawImage(ground, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.drawImage(c, 0, 0);
  });

  // --- 2. sols de zones, transition bruitée et bande sombre sur la frontière ------------------------------------
  for (const zone of decor.zones) scoped(() => {
    const [layer, lx] = fresh();
    inPlan(lx);
    const motif = zone.motif;
    if (motif) paint(lx, ring(zone.cases), (row, col) => motifTile(motif, row, col), false);
    else paint(lx, ring(zone.cases), () => weightedPick(random, zone.tuiles, zone.poids));
    if (zone.teinte || zone.saturation !== undefined || zone.filtre) {
      const [t2, t2x] = fresh();
      t2x.filter = zone.filtre ?? `saturate(${zone.saturation ?? 1})`;
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

  // --- 2 bis. terre au pied des arbres et des rochers (`decor.terre`) : une tache bruitée par sprite -------------
  const dirt = decor.terre;
  const spots = footDirtSpots(size, decor);
  if (dirt && spots.length > 0) scoped(() => {
    const [layer, lx] = fresh();
    inPlan(lx);
    const cells = new Map<string, [number, number]>();
    for (const spot of spots) {
      const reach = Math.ceil(spot.r / pas) + 1;
      const [col, row] = [Math.floor((spot.x - marge) / pas) - border, Math.floor((spot.y - marge) / pas) - border];
      for (let dr = -reach; dr <= reach; dr++) for (let dc = -reach; dc <= reach; dc++) cells.set(`${row + dr},${col + dc}`, [row + dr, col + dc]);
    }
    paint(lx, [...cells.values()], () => dirt.tuiles[Math.floor(random() * dirt.tuiles.length)]!);
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.globalCompositeOperation = 'multiply';
    lx.fillStyle = `rgb(${dirt.teinte.map((v) => Math.round(v * 255)).join(',')})`;
    lx.fillRect(0, 0, W, W);
    lx.globalCompositeOperation = 'source-over';
    // Masque au pas d'un pixel du plan : un disque par tache, au bord rongé par le bruit ; les disques voisins se fondent.
    const alpha = new Float32Array(M * M);
    for (const spot of spots) {
      const [x0, x1] = [Math.max(0, Math.floor(spot.x - spot.r * 1.5)), Math.min(M - 1, Math.ceil(spot.x + spot.r * 1.5))];
      const [y0, y1] = [Math.max(0, Math.floor(spot.y - spot.r * 1.5)), Math.min(M - 1, Math.ceil(spot.y + spot.r * 1.5))];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * M + x;
          const v = 1 - Math.hypot(x - spot.x, y - spot.y) / spot.r + 0.22 * noise.coarse[i]! + 0.07 * noise.fine[i]!;
          const a = smoothstep(v / 0.35) * dirt.opacite;
          if (a > alpha[i]!) alpha[i] = a;
        }
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(masked(layer, alpha), 0, 0);
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
    if (d.sens === 'lignes') g.setTransform(D, 0, 0, D, (x - vx) * D, (y - vy) * D);
    else g.setTransform(0, D, D, 0, (x - vx) * D, (y - vy) * D); // transposée : la pièce part vers la droite
    if (d.miroir) g.transform(1, 0, 0, -1, 0, 2 * pas);
    g.drawImage(images[d.image]!, 0, 0, pas, 2 * pas);
  }

  // --- 5. occlusion sous les reliefs, ombres portées vers le bas à droite de l'écran (`SHADOW_DIR`) ------------
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
      // Goutte : de la pointe à un bord du cercle du pied, autour de son dos, puis à l'autre bord.
      const { r, tip } = treeShadow(cx0, cy0, s.taille ?? [pas, 2 * pas]);
      const dir = Math.atan2(SHADOW_DIR[1], SHADOW_DIR[0]);
      const side = Math.acos(r / Math.hypot(tip[0] - cx0, tip[1] - cy0));
      cx.beginPath();
      cx.moveTo(tip[0], tip[1]);
      cx.arc(cx0, cy0, r, dir + side, dir + 2 * Math.PI - side);
      cx.closePath();
      cx.fill();
      continue;
    }
    // Le pied de la case (un peu à droite) étiré dans le sens des ombres : un hexagone.
    const length = pas * SHADOW_LENGTH[s.ombre];
    const [dx, dy] = [SHADOW_DIR[0] * length, SHADOW_DIR[1] * length];
    const cells = s.empreinte ?? (s.case ? [s.case] : []);
    for (const [row, col] of cells) {
      aox.fillRect(cellX(col) - 4, cellY(row) - 4, pas + 8, pas + 8);
      const [x0, y0, x1, y1] = [cellX(col) + pas * 0.2, cellY(row) + pas * 0.1, cellX(col) + pas, cellY(row) + pas * 0.9];
      cx.beginPath();
      for (const [x, y] of [[x0, y0], [x1, y0], [x1 + dx, y0 + dy], [x1 + dx, y1 + dy], [x0 + dx, y1 + dy], [x0, y1]] as const) cx.lineTo(x, y);
      cx.closePath();
      cx.fill();
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const blurred = (src: Canvas, px: number): Canvas => {
    const [c, x] = fresh();
    x.filter = `blur(${px * D}px)`;
    x.drawImage(src, 0, 0);
    return c;
  };
  g.globalAlpha = CAST_SHADOW.alpha;
  g.drawImage(blurred(cast, CAST_SHADOW.blur), 0, 0);
  g.globalAlpha = 0.34;
  g.drawImage(blurred(ao, 12), 0, 0);
  g.globalAlpha = 1;

  // --- 6. bords du monde fondus en transparence (décor en bordure seulement), ou ceux du recadrage -------------
  if (view) {
    const [fade, fx] = fresh();
    fx.fillStyle = '#fff';
    const inset = GROUND_VIEW_FADE.inset * D;
    fx.fillRect(inset, inset, W - 2 * inset, W - 2 * inset);
    const soft = blurred(fade, GROUND_VIEW_FADE.blur);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(soft, 0, 0);
    g.globalCompositeOperation = 'source-over';
  } else if (border > 0) {
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
