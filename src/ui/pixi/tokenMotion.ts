// Animations d'action des unités du plateau PixiJS (migration, sous-étape 3d) : les mêmes que celles des jetons HTML
// (`fx/stage.ts` : marche, élan, atterrissage, mort, apparition, terrain posé, secousse, recul), mêmes durées, mêmes
// étapes et mêmes courbes, décrites en images clés et échantillonnées à chaque image. Pur et testé ; `tokenLayer.ts`
// les applique.

/**
 * Pose d'une unité : écart dans le plan (`dx`, `dy`, px du plan), écart à l'écran (`x`, `y`, px de jeton), échelle,
 * rotation (degrés, sens horaire), opacité et éclat (luminosité ajoutée : 1,6 = `brightness(2.6)`).
 */
export interface Pose {
  readonly dx: number;
  readonly dy: number;
  readonly x: number;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
  readonly rot: number;
  readonly alpha: number;
  readonly flash: number;
}

export const REST: Pose = { dx: 0, dy: 0, x: 0, y: 0, sx: 1, sy: 1, rot: 0, alpha: 1, flash: 0 };
type Building = { -readonly [K in keyof Pose]: Pose[K] };

/** Courbe de Bézier cubique, comme `cubic-bezier()` du CSS. */
export type Easing = readonly [number, number, number, number];
export const EASE = {
  linear: [0, 0, 1, 1],
  in: [0.42, 0, 1, 1],
  out: [0, 0, 0.58, 1],
  inOut: [0.42, 0, 0.58, 1],
} as const satisfies Record<string, Easing>;

/** Image clé : sa place (0 à 1), la pose (les champs absents gardent leur valeur de repos), la courbe jusqu'à la suivante. */
export interface Frame {
  readonly at: number;
  readonly pose: Partial<Pose>;
  readonly easing?: Easing;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Motion {
  readonly frames: readonly Frame[];
  /** Durée (ms). */
  readonly duration: number;
  /** Courbe sur toute la durée (`easing` de l'animation). */
  readonly easing?: Easing;
  /** Garde sa dernière pose une fois finie (`fill: forwards`), jusqu'à ce qu'on la retire. */
  readonly hold?: boolean;
  /** L'écart dans le plan est compté depuis ce point (marche) et non depuis la case de l'unité, qui change en route. */
  readonly origin?: Point;
}

export interface Playing {
  readonly motion: Motion;
  /** Début (ms, horloge de `performance.now()`). */
  readonly start: number;
}

/** Valeur de la courbe à `t` (0 à 1) : on cherche le paramètre dont l'abscisse vaut `t`. */
export function bezier([x1, y1, x2, y2]: Easing, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (x1 === y1 && x2 === y2) return t;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (u: number) => ((ax * u + bx) * u + cx) * u;
  let [lo, hi, u] = [0, 1, t];
  for (let i = 0; i < 30; i++) {
    const x = xAt(u);
    if (Math.abs(x - t) < 1e-6) break;
    if (x < t) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return ((ay * u + by) * u + cy) * u;
}

const KEYS = Object.keys(REST) as (keyof Pose)[];

/** Pose d'une animation après `elapsed` ms (la dernière une fois finie). */
export function sample(motion: Motion, elapsed: number): Pose {
  const { frames } = motion;
  const p = bezier(motion.easing ?? EASE.linear, Math.min(1, Math.max(0, elapsed / motion.duration)));
  let i = 0;
  while (i < frames.length - 2 && p > frames[i + 1]!.at) i++;
  const a = frames[i]!;
  const b = frames[i + 1] ?? a;
  const f = b.at > a.at ? bezier(a.easing ?? EASE.linear, (p - a.at) / (b.at - a.at)) : 1;
  const pose: Building = { ...REST };
  for (const key of KEYS) {
    const from = a.pose[key] ?? REST[key];
    const to = b.pose[key] ?? REST[key];
    pose[key] = f >= 1 ? to : from + (to - from) * f;
  }
  return pose;
}

/**
 * Pose d'une unité à `now` d'après ses animations en cours, comme `composite: 'add'` : écarts, rotations et éclats
 * s'ajoutent, échelles et opacités se multiplient. `at` : le point du plan imposé par une marche, sinon `null`.
 */
export function poseOf(playing: readonly Playing[], now: number): { pose: Pose; at: Point | null } {
  const pose: Building = { ...REST };
  let at: Point | null = null;
  for (const { motion, start } of playing) {
    const s = sample(motion, now - start);
    if (motion.origin) at = { x: motion.origin.x + s.dx, y: motion.origin.y + s.dy };
    else {
      pose.dx += s.dx;
      pose.dy += s.dy;
    }
    pose.x += s.x;
    pose.y += s.y;
    pose.sx *= s.sx;
    pose.sy *= s.sy;
    pose.rot += s.rot;
    pose.alpha *= s.alpha;
    pose.flash += s.flash;
  }
  return { pose, at };
}

/** Une animation est encore en cours (sinon elle est finie, ou ne fait plus que garder sa pose). */
export const running = ({ motion, start }: Playing, now: number): boolean => now - start < motion.duration;

/**
 * Marche (`walk`) : le jeton glisse dans le plan de point en point (le départ, puis chaque case), chaque pas avec sa
 * courbe, et saute de `hop` px à mi-pas en grossissant un peu. Les points sont les pieds du jeton dans le plan.
 */
export function walkMotions(points: readonly Point[], duration: number, hop: number): Motion[] {
  const [start, ...cells] = points;
  const n = cells.length;
  if (!start || n === 0) return [];
  const slide: Frame[] = [{ at: 0, pose: {}, easing: EASE.inOut }];
  const hops: Frame[] = [{ at: 0, pose: {}, easing: EASE.out }];
  cells.forEach((p, i) => {
    slide.push({ at: (i + 1) / n, pose: { dx: p.x - start.x, dy: p.y - start.y }, easing: EASE.inOut });
    hops.push({ at: (i + 0.5) / n, pose: { y: -hop, sx: 1.06, sy: 1.06 }, easing: EASE.in }, { at: (i + 1) / n, pose: {}, easing: EASE.out });
  });
  return [
    { frames: slide, duration, hold: true, origin: start },
    { frames: hops, duration },
  ];
}

/** Élan d'une attaque au contact (`lunge`) : recule de 8 px, file de 28 px vers la cible, revient. */
export function lungeMotion(from: Point, to: Point): Motion {
  const [sx, sy] = [Math.sign(to.x - from.x), Math.sign(to.y - from.y)];
  return {
    frames: [
      { at: 0, pose: {} },
      { at: 0.35, pose: { dx: -sx * 8, dy: -sy * 8, sx: 1.04, sy: 1.04 } },
      { at: 0.6, pose: { dx: sx * 28, dy: sy * 28, sx: 1.1, sy: 1.1 } },
      { at: 1, pose: {} },
    ],
    duration: 460,
    easing: EASE.inOut,
  };
}

/** Atterrissage (`land`) : écrasement. */
export const LAND: Motion = {
  frames: [
    { at: 0, pose: { sx: 1.14, sy: 0.84 } },
    { at: 0.5, pose: { sx: 0.96, sy: 1.05 } },
    { at: 1, pose: {} },
  ],
  duration: 260,
  easing: EASE.out,
};

/** Mort (`die`) : grossit en tournant, puis rapetisse et disparaît ; reste invisible jusqu'à son retrait. */
export const DIE: Motion = {
  frames: [
    { at: 0, pose: {} },
    { at: 0.3, pose: { sx: 1.18, sy: 1.18, rot: -7 } },
    { at: 1, pose: { sx: 0.1, sy: 0.1, rot: 35, alpha: 0 } },
  ],
  duration: 480,
  easing: EASE.in,
  hold: true,
};

/** Apparition d'un monstre (`drop`) : chute sur sa case et écrasement. */
export const DROP: Motion = {
  frames: [
    { at: 0, pose: { y: -26, sx: 0.2, sy: 0.2, alpha: 0 } },
    { at: 0.7, pose: { sx: 1.12, sy: 0.86 } },
    { at: 1, pose: {} },
  ],
  duration: 420,
  easing: EASE.in,
};

/** Terrain posé (`slam`) : tombe de haut en grossissant à l'envers. */
export const SLAM: Motion = {
  frames: [
    { at: 0, pose: { sx: 1.7, sy: 1.7, alpha: 0 } },
    { at: 0.6, pose: { sx: 0.9, sy: 0.9 } },
    { at: 1, pose: {} },
  ],
  duration: 380,
  easing: EASE.in,
};

/** Coup reçu (`shake`) : secousse (plus forte pour un coup dur) et éclair blanc. */
export function shakeMotions(hard: boolean): Motion[] {
  const m = hard ? 1.7 : 1;
  return [
    {
      frames: [
        { at: 0, pose: {} },
        { at: 0.25, pose: { x: -6 * m, y: m, rot: -5 * m } },
        { at: 0.5, pose: { x: 5 * m, y: -m, rot: 4 * m } },
        { at: 0.75, pose: { x: -3 * m, rot: -2 * m } },
        { at: 1, pose: {} },
      ],
      duration: 400,
      easing: EASE.out,
    },
    { frames: [{ at: 0, pose: { flash: 1.6 } }, { at: 1, pose: {} }], duration: 340, easing: EASE.out },
  ];
}

/** Recul du tireur (`recoil`). */
export const RECOIL: Motion = {
  frames: [
    { at: 0, pose: {} },
    { at: 0.3, pose: { y: 6, sx: 0.92, sy: 0.92 } },
    { at: 1, pose: {} },
  ],
  duration: 300,
  easing: EASE.out,
};
