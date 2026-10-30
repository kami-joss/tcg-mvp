// Décor 2,5D des vues isométrique et inclinée (handoff, lot 5 ; maquette « Plateau v5 », `decor()`), posé dans le plan du plateau,
// sous les cases : bloc de terrain et lac, rochers sur les cases X, rivière, mana zones modélisées (muret et poteaux
// à la couleur du contrôleur, repère ; plus de drapeau depuis le lot 11), enclaves de la Mine et de la Scierie, décor de bordure. Les sprites sont des
// « billboards » : la rotation inverse de la caméra les garde face à l'écran, et la 3D les trie devant ou derrière.
// Plateau à décor peint (15 × 15) : son sol calculé remplace le bloc, le lac, la rivière et les enclaves, ses sprites
// peints les rochers, les mana zones modélisées et la bordure.
// Rien ici ne capte la souris : les cases restent seules cliquables.
import { createElement } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { getCell } from '../../engine';
import type { Board, PlayerId } from '../../engine';
import { SPRITE_FX, scatter, spritePoint, waterPatches } from './ambience';
import { GROUND_WAIT, STAND_DEPTH, paintedBoardDecor, paintedDecor, placePaintedSprites, useWaterMasks, worldPlan } from './paintedDecor';
import { ISO, ISO_TILT, SPRITES, ZONE_DECOR, borderDecor, planSize } from './scenery';
import type { IsoScenery } from './scenery';

// Sprites Kenney du décor procédural, et sprites peints du 15 × 15 (handoff plateau 15).
const SPRITE_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    ...(import.meta.glob('../../assets/decor/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
    ...(import.meta.glob('../../assets/plateau15/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  }).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
);

const PLAYER = { 1: 'oklch(0.56 0.15 255)', 2: 'oklch(0.56 0.18 25)' } as const;
const NEUTRAL = 'oklch(0.82 0.13 85)';
/** Zone contestée (mode contestation) : entre le bleu de J1 et le rouge de J2. */
const CONTESTED = 'oklch(0.64 0.18 330)';
const zoneColor = (owner: PlayerId | 'contested' | null) => (owner === 'contested' ? CONTESTED : owner ? PLAYER[owner] : NEUTRAL);
const DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

interface IsoDecorProps {
  board: Board;
  scenery: IsoScenery;
  flipped: boolean;
  /** Contrôleur de chaque mana zone (« ligne,colonne »), `null` si elle est neutre. */
  /** Qui tient chaque mana zone (`ligne,colonne`) ; `contested` en mode contestation, quand les deux joueurs y sont. */
  controllers: ReadonlyMap<string, PlayerId | 'contested' | null>;
  animated: boolean;
  /**
   * Caméra : `iso` (plateau en rotateX(54,7°) rotateZ(45°)) ou `tilt` (vue inclinée, plateau en rotateX(45°)) ; les
   * éléments debout reçoivent la rotation inverse pour rester face à l'écran.
   */
  camera?: 'iso' | 'tilt';
  /** Pas des cases à l'écran (taille + espace) : le décor est dessiné pour 72 px et mis à l'échelle (vue inclinée). */
  pitch?: number;
  /**
   * Plateau à décor peint (handoff plateau 15) : son sol calculé (`usePaintedGround`) remplace le bloc de terrain, le
   * lac, la rivière et les enclaves. `ground` : l'URL du sol, `null` pendant son calcul (un vert uni en attendant).
   */
  painted?: boolean;
  ground?: string | null;
  /** Sol du monde peint, décor extérieur compris (`null` tant qu'il n'est pas prêt) : il remplace `ground`. */
  world?: string | null;
}


/** Rotation qui redresse un élément du sol face à l'écran, pour chaque caméra. */
const FACE_CAMERA = { iso: `rotateZ(-45deg) rotateX(${-ISO_TILT}deg)`, tilt: 'rotateX(-45deg)' } as const;

/**
 * Transformation qui couche dans le plan du sol une image dessinée vue par la caméra, pour qu'elle paraisse la même à
 * l'écran : l'inverse de la caméra dans le plan (rotation de −45° et étirement de 1/cos 54,7° en iso, 1/cos 45° en vue
 * inclinée), comme les textes au sol.
 */
const ON_GROUND = { iso: 'rotate(-45deg) scale(1, 1.7321)', tilt: 'scale(1, 1.4142)' } as const;

type Node = ReactElement;

const box = (left: number, top: number, width: number, height: number): CSSProperties => ({
  position: 'absolute',
  left,
  top,
  width,
  height,
});

const div = (key: string, style: CSSProperties, ...children: Node[]): Node => createElement('div', { key, style }, ...children);

export function IsoDecor({ board, scenery, flipped, controllers, animated, camera = 'iso', pitch = ISO.pitch, painted = false, ground = null, world = null }: IsoDecorProps) {
  const { R, N, D, W } = ISO;
  const B = planSize(Math.max(board.rows, board.cols));
  const P = ISO.pitch;
  const S = B + R + N;
  const WP = 440;
  const last = { row: board.rows - 1, col: board.cols - 1 };
  const anim = (value: string) => (animated ? value : 'none');
  // Masques de l'eau peinte, pour ses reflets animés (plateau peint, animations permises).
  const waterMasks = useWaterMasks(board, painted && animated);
  const disp = (r: number, c: number): [number, number] => (flipped ? [last.row - r, last.col - c] : [r, c]);
  const out: Node[] = [];

  const shadowAt = (key: string, x: number, y: number, radius: number, alpha: number) =>
    div('sh' + key, {
      ...box(x - radius, y - radius, radius * 2, radius * 2),
      borderRadius: '50%',
      background: `radial-gradient(closest-side, oklch(0.22 0.04 170 / ${alpha}), transparent)`,
      transform: 'translateZ(-0.5px)',
    });

  /**
   * Élément debout face caméra, ancré au sol en (x, y) : sa boîte (w × h) a son point d'ancrage en (ax, ay). `dz` le
   * décolle vers la caméra, `lift` le monte (en z). La boîte couvre tout son contenu : un élément 3D composé est rogné à
   * sa boîte, un conteneur de taille nulle cacherait tout ce qui dépasse de son coin.
   */
  const upright = (key: string, x: number, y: number, w: number, h: number, ax: number, ay: number, dz: number, lift: number, ...children: Node[]) =>
    div(
      key,
      {
        ...box(x - ax, y - ay, w, h),
        transformOrigin: `${ax}px ${ay}px`,
        transform: `${lift ? `translateZ(${lift}px) ` : ''}${FACE_CAMERA[camera]} translateZ(${dz}px)`,
      },
      ...children,
    );

  /**
   * Sprite couché dans le plan du sol (les ponts), ancré en (x, y), entre le sol peint et les cases : il paraît le même
   * qu'un sprite debout, mais les cases et les jetons passent par-dessus, et le sol ne le rogne pas.
   */
  const flatSprite = (key: string, id: string, x: number, y: number, scale: number, mirror: boolean): Node => {
    const [w, h, ax, ay] = SPRITES[id]!;
    const origin = `${ax * scale}px ${ay * scale}px`;
    return div(
      key,
      { ...box(x - ax * scale, y - ay * scale, w * scale, h * scale), transformOrigin: origin, transform: `translateZ(-0.5px) ${ON_GROUND[camera]}` },
      createElement('img', {
        key: 'img',
        src: SPRITE_URLS[id],
        alt: '',
        draggable: false,
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          maxWidth: 'none',
          display: 'block',
          ...(mirror ? { transformOrigin: origin, transform: 'scaleX(-1)' } : {}),
        },
      }),
    );
  };

  /** Sprite du décor, debout face caméra, ancré au sol en (x, y) ; `mirror` le retourne autour de son ancre. */
  const billboard = (key: string, id: string, x: number, y: number, scale: number, dz = 24, lift = 0, mirror = false): Node => {
    const [w, h, ax, ay] = SPRITES[id]!;
    // Les arbres (t1…) et les touffes (g1…, f1…) du pack Kenney ondulent ; jamais les sprites peints.
    const sway = /^t\d/.test(id) ? 1 : /^[gf]\d/.test(id) ? 2 : 0;
    const d = ((((x * 7 + y * 13) % 50) + 50) % 50) / 10;
    const animation = sway
      ? anim(`${sway === 2 ? 'isoSwayGrass' : 'isoSway'} ${(sway === 2 ? 2.2 + d * 0.2 : 3.4 + d * 0.4).toFixed(2)}s ease-in-out ${(-d).toFixed(2)}s infinite`)
      : 'none';
    return upright(
      key,
      x,
      y,
      w * scale,
      h * scale,
      ax * scale,
      ay * scale,
      dz,
      lift,
      createElement('img', {
        key: 'img',
        src: SPRITE_URLS[id],
        alt: '',
        draggable: false,
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          maxWidth: 'none',
          display: 'block',
          transformOrigin: `${ax * scale}px ${ay * scale}px`,
          ...(mirror ? { transform: 'scaleX(-1)' } : {}),
          animation,
        },
      }),
    );
  };

  // --- Plateau à décor peint : son sol, dans le plan du plateau (tourné de 180° avec lui), sous les cases et les ombres.
  // Celui du monde, avec le décor extérieur, déborde de `bordure` cases tout autour et s'efface sur ses bords. En
  // isométrie (sans perspective), il est reculé loin le long de l'axe de la caméra : il paraît le même à l'écran, mais
  // plus rien ne passe sous lui, et les sprites extérieurs n'ont pas à être avancés pour ne pas être rognés.
  const fullDecor = painted ? paintedDecor(board) : null;
  const border = fullDecor?.plan.bordure ?? 0;
  const showWorld = world !== null && fullDecor !== null && border > 0;
  if (painted) {
    const W = fullDecor ? worldPlan(fullDecor, Math.max(board.rows, board.cols)) : B;
    out.push(
      showWorld
        ? div('ground', {
            ...box(-border * P, -border * P, W, W),
            transform:
              camera === 'iso'
                ? `rotateZ(-45deg) rotateX(${-ISO_TILT}deg) translateZ(-4000px) rotateX(${ISO_TILT}deg) rotateZ(45deg)${flipped ? ' rotate(180deg)' : ''}`
                : `translateZ(-1px)${flipped ? ' rotate(180deg)' : ''}`,
            background: `url(${world}) 0 0 / 100% 100% no-repeat`,
          })
        : div('ground', {
            ...box(0, 0, B, B),
            transform: `translateZ(-1px)${flipped ? ' rotate(180deg)' : ''}`,
            background: ground ? `url(${ground}) 0 0 / 100% 100% no-repeat` : GROUND_WAIT,
          }),
    );
  }

  // --- Lac sous le bloc, écume autour (pas de lac autour d'un sol peint).
  if (!painted) out.push(
    div(
      'lake',
      {
        ...box(-R - WP, -R - WP, S + 2 * WP, S + 2 * WP),
        transform: `translateZ(${-W}px)`,
        overflow: 'hidden',
        background: 'radial-gradient(closest-side, #a6dccb 52%, #80c4b9 68%, #5ba6a7 84%, #468b98)',
        // Le lac s'efface avant les bords de la scène : rien ne déborde sur le reste de l'écran.
        WebkitMaskImage: 'radial-gradient(closest-side, #000 52%, transparent 72%)',
        maskImage: 'radial-gradient(closest-side, #000 52%, transparent 72%)',
      },
      div('rip1', {
        position: 'absolute',
        inset: -160,
        background: 'repeating-linear-gradient(135deg, transparent 0 60px, oklch(0.98 0.03 185 / .55) 60px 63px, transparent 63px 72px)',
        WebkitMaskImage: 'repeating-linear-gradient(45deg, #000 0 40px, transparent 40px 76px)',
        maskImage: 'repeating-linear-gradient(45deg, #000 0 40px, transparent 40px 76px)',
        animation: anim('isoRip1 6s linear infinite'),
      }),
      div('rip2', {
        position: 'absolute',
        inset: -160,
        background: 'repeating-linear-gradient(135deg, transparent 0 96px, oklch(0.42 0.07 205 / .16) 96px 104px, transparent 104px 110px)',
        animation: anim('isoRip2 11s linear infinite'),
      }),
    ),
    div('foam', {
      ...box(-R, -R, S, S),
      transform: `translateZ(${-W + 1}px)`,
      boxShadow: '0 0 0 6px oklch(0.97 0.03 185 / .8), 0 0 22px 12px oklch(0.97 0.03 185 / .4)',
      animation: anim('isoFoam 3.4s ease-in-out infinite'),
    }),
  );

  // --- Eau, creusée dans le dessus du bloc : tronçons de rivière d'une case, horizontaux (celui du bord avant se jette
  // dans le lac), et étangs (cases voisines verticalement : un seul lit allongé, 5 px de marge, courant vers le bas).
  const HW = 19;
  const VW = 25;
  const beds = (painted ? [] : scenery.runs).map((run) => {
    const v = (run.r0 * 5 + run.col * 3) % 4;
    const key = `rv${run.r0}_${run.col}`;
    const dc = flipped ? last.col - run.col : run.col;
    if (run.r1 > run.r0) {
      const a = flipped ? last.row - run.r1 : run.r0;
      const b = flipped ? last.row - run.r0 : run.r1;
      const xc = 48 + dc * P;
      return { key, vertical: true, xa: xc - VW, xb: xc + VW, ya: 14 + a * P + 5, yb: 10 + (b + 1) * P - 5, source: false, mouth: false, fall: false, v };
    }
    const yc = 48 + (flipped ? last.row - run.r0 : run.r0) * P;
    return {
      key,
      vertical: false,
      xa: dc === 0 ? -R : 14 + dc * P,
      xb: dc === last.col ? B + N : 10 + (dc + 1) * P,
      ya: yc - HW,
      yb: yc + HW,
      source: dc !== 0,
      mouth: dc !== last.col,
      fall: dc === last.col,
      v,
    };
  });
  const full = 'linear-gradient(#000 0 0)';
  const holes = (layers: string[]): CSSProperties =>
    layers.length
      ? {
          WebkitMask: [...layers, full].join(', '),
          mask: [...layers, full].join(', '),
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }
      : {};
  const topHoles = holes(beds.map((q) => `${full} ${q.xa + R}px ${q.ya + R}px / ${q.xb - q.xa}px ${q.yb - q.ya}px no-repeat`));
  const sideHoles = holes(beds.filter((q) => q.fall).map((q) => `${full} 0px ${q.ya + R}px / 9px ${q.yb - q.ya}px no-repeat`));

  // --- Bloc de terrain : flancs en terre (lumière à droite) et dessus herbeux.
  if (!painted) out.push(
    div('sideL', {
      ...box(-R, B + N, S, D),
      transformOrigin: '50% 0',
      transform: 'rotateX(-90deg)',
      background:
        'linear-gradient(180deg, #4f8a60 0 6px, #3c6a4a 6px 9px, #8e7550 9px, #887050 34%, #786048 34% 41%, #806a4b 41% 62%, #6c5a3e 62% 70%, #5f5036 70%)',
    }),
    div('sideR', {
      ...box(B + N, -R, D, S),
      ...sideHoles,
      transformOrigin: '0 50%',
      transform: 'rotateY(90deg)',
      background:
        'linear-gradient(90deg, #66a274 0 6px, #4f8a60 6px 9px, #d6b273 9px, #c8a868 34%, #b8955b 34% 41%, #c09d61 41% 62%, #a8874f 62% 70%, #987850 70%)',
    }),
    div('top', {
      ...box(-R, -R, S, S),
      ...topHoles,
      transform: 'translateZ(-1px)',
      background:
        'radial-gradient(24% 18% at 16% 40%, #70ad80, transparent 70%), radial-gradient(22% 26% at 64% 12%, #5c986d, transparent 70%), radial-gradient(30% 22% at 82% 70%, #6eaa7d, transparent 70%), radial-gradient(26% 20% at 36% 84%, #5e9a6f, transparent 70%), #66a275',
    }),
  );

  // --- Rochers sur les cases X qui ne sont pas de la rivière ; ils suivent leur case quand le plateau tourne.
  const ROCKS: readonly (readonly [string, number])[] = [
    ['r3', 0.5],
    ['r1', 0.5],
    ['r6', 0.66],
    ['r2', 0.5],
    ['r5', 0.66],
  ];
  for (let r = 0; r < (painted ? 0 : board.rows); r++) {
    for (let c = 0; c < board.cols; c++) {
      if (getCell(board, { row: r, col: c }).kind !== 'blocked' || scenery.water.has(`${r},${c}`)) continue;
      const [dr, dc] = disp(r, c);
      const x = 48 + dc * P;
      const y = 48 + dr * P;
      const [id, scale] = ROCKS[(r * 3 + c * 7) % ROCKS.length]!;
      out.push(shadowAt(`x${r}_${c}`, x, y, 34, 0.38), billboard(`x${r}_${c}`, id, x, y, scale));
    }
  }

  const streak = (key: string, period: number, alpha: number, width: number, band: string, duration: number, delay: number) =>
    div(key, {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: -period,
      right: 0,
      background: `repeating-linear-gradient(90deg, transparent 0 ${period - width}px, oklch(0.98 0.03 185 / ${alpha}) ${period - width}px ${period}px)`,
      WebkitMaskImage: band,
      maskImage: band,
      animation: anim(`${period === 48 ? 'isoFlow' : 'isoFlowWide'} ${duration}s linear ${delay}s infinite`),
    });
  /** Même chose vers le bas, pour les étangs. */
  const streakDown = (key: string, period: number, alpha: number, width: number, band: string, duration: number, delay: number) =>
    div(key, {
      position: 'absolute',
      left: 0,
      right: 0,
      top: -period,
      bottom: 0,
      background: `repeating-linear-gradient(180deg, transparent 0 ${period - width}px, oklch(0.98 0.03 185 / ${alpha}) ${period - width}px ${period}px)`,
      WebkitMaskImage: band,
      maskImage: band,
      animation: anim(`${period === 48 ? 'isoFlowY' : 'isoFlowYWide'} ${duration}s linear ${delay}s infinite`),
    });
  for (const q of beds) {
    const width = q.xb - q.xa;
    const height = q.yb - q.ya;
    const xm = (q.xa + q.xb) / 2;
    const ym = (q.ya + q.yb) / 2;
    const v = q.v;
    out.push(
      div(
        q.key + 'w',
        {
          ...box(q.xa, q.ya, width, height),
          transform: 'translateZ(-9px)',
          overflow: 'hidden',
          background: `linear-gradient(${q.vertical ? 90 : 180}deg, #a3ddcf, #6cbcb9 22%, #4c9fad 50%, #5aaeb3 76%, #95d6c9)`,
        },
        ...(q.vertical
          ? [
              streakDown('s1', 48, 0.7, 12, 'repeating-linear-gradient(90deg, transparent 0 6px, #000 6px 8px, transparent 8px 14px)', 1.9 + v * 0.15, -v * 0.4),
              streakDown('s2', 72, 0.38, 22, 'repeating-linear-gradient(90deg, transparent 0 10px, #000 10px 13px, transparent 13px 19px)', 3.6, -v),
            ]
          : [
              streak('s1', 48, 0.75, 12, 'repeating-linear-gradient(180deg, transparent 0 5px, #000 5px 7px, transparent 7px 12px)', 1.5 + v * 0.15, -v * 0.4),
              streak('s2', 72, 0.4, 22, 'repeating-linear-gradient(180deg, transparent 0 9px, #000 9px 12px, transparent 12px 17px)', 3.2, -v),
            ]),
        div('edge', {
          position: 'absolute',
          inset: 0,
          boxShadow: q.vertical
            ? 'inset 2px 0 0 oklch(0.97 0.03 185 / .8), inset 0 2px 0 oklch(0.97 0.03 185 / .8), inset -2px 0 0 oklch(0.97 0.03 185 / .55), inset 0 -2px 0 oklch(0.97 0.03 185 / .55), inset 7px 7px 6px -4px oklch(0.25 0.05 205 / .35)'
            : 'inset 0 2px 0 oklch(0.97 0.03 185 / .8), inset 0 -2px 0 oklch(0.97 0.03 185 / .55), inset 0 7px 6px -4px oklch(0.25 0.05 205 / .35)',
        }),
      ),
      // Berges : celle du fond (vue de face) et celle de gauche.
      div(q.key + 'bk', {
        ...box(q.xa, q.ya, width, 9),
        transformOrigin: '50% 0',
        transform: 'translateZ(-1px) rotateX(-90deg)',
        background: 'linear-gradient(180deg, #4f8a60 0 2px, #9a7d55 2px, #7d6446 75%, #6a5a3c)',
      }),
      div(q.key + 'ba', {
        ...box(q.xa, q.ya, 9, height),
        transformOrigin: '0 50%',
        transform: 'translateZ(-1px) rotateY(90deg)',
        background: 'linear-gradient(90deg, #66a274 0 2px, #cfae6c 2px, #ad8c54)',
      }),
    );
    if (q.vertical) {
      // Touffes et petites roches sur les berges de l'étang.
      out.push(
        billboard(q.key + 'g1', ['g2', 'g5', 'g3', 'g6'][v]!, q.xa - 5, ym - 22, 0.5, 4),
        billboard(q.key + 'g2', ['g6', 'g3', 'g2', 'g5'][v]!, q.xb + 6, ym + 18, 0.48, 4),
        billboard(q.key + 'f', 'f3', q.xb + 5, q.ya + 22, 0.45, 4),
        billboard(q.key + 'g3', ['g3', 'g6', 'g5', 'g2'][v]!, q.xa - 4, q.yb - 14, 0.46, 4),
        billboard(q.key + 'ra', 'r1', q.xa + 3, q.ya + 3, 0.2, 4),
        billboard(q.key + 'rc', 'r3', q.xb - 3, q.yb - 3, 0.18, 4),
      );
      continue;
    }
    out.push(
      billboard(q.key + 'g1', ['g2', 'g5', 'g3', 'g6'][v]!, xm + (v % 2 ? 14 : -16), q.ya - 4, 0.5, 4),
      billboard(q.key + 'g2', ['g6', 'g3', 'g2', 'g5'][v]!, xm + (v % 2 ? -18 : 12), q.yb + 5, 0.48, 4),
      billboard(q.key + 'f', 'f3', xm + (v % 2 ? -4 : 22), q.yb + 4, 0.45, 4),
    );
    if (q.source) out.push(billboard(q.key + 'ra', 'r1', q.xa + 2, q.ya + 2, 0.2, 4));
    if (q.mouth) out.push(billboard(q.key + 'rc', 'r3', q.xb - 2, q.yb - 3, 0.17, 4));
    if (q.fall) {
      out.push(
        div(
          q.key + 'fall',
          {
            ...box(B + N, q.ya, W - 8, height),
            transformOrigin: '0 50%',
            transform: 'translateX(0.6px) translateZ(-8px) rotateY(90deg)',
            overflow: 'hidden',
            background: 'linear-gradient(90deg, #c4efe4 0 2px, #7fcfc6 2px, #57a9b0 70%, #4a98a6)',
          },
          div('flow', {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: -48,
            right: 0,
            background: 'repeating-linear-gradient(90deg, transparent 0 30px, oklch(0.98 0.03 185 / .8) 30px 48px)',
            WebkitMaskImage: 'repeating-linear-gradient(180deg, #000 0 3px, transparent 3px 7px)',
            maskImage: 'repeating-linear-gradient(180deg, #000 0 3px, transparent 3px 7px)',
            animation: anim('isoFlow .7s linear infinite'),
          }),
        ),
        div(q.key + 'splash', {
          ...box(B + N - 6, q.ya - 10, 26, height + 20),
          transform: `translateZ(${-W + 1.5}px)`,
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, oklch(0.99 0.02 185 / .95), oklch(0.97 0.03 185 / .5) 60%, transparent)',
          animation: anim('isoFoam 1.6s ease-in-out infinite'),
        }),
      );
    }
  }
  const inWater = (x: number, y: number) => beds.some((q) => x > q.xa - 10 && x < q.xb + 10 && y > q.ya - 14 && y < q.yb + 14);

  // --- Plateau peint : ses sprites (montagnes, rochers, forge, ponts, cadres de mine…) remplacent les rochers Kenney, les
  // mana zones modélisées et le décor de bordure (validé) ; leurs ombres sont peintes dans le sol.
  // Décor extérieur seulement quand son sol est là : sinon, le plateau seul (ses sprites, ses pièces d'eau).
  const paintedData = showWorld ? fullDecor : painted ? paintedBoardDecor(board) : null;
  if (paintedData) {
    for (const { key, id, x, y, scale, mirror, flat, dz, inBoard } of placePaintedSprites(paintedData, board.rows, board.cols, flipped)) {
      // Hors du plateau, le sol reculé (iso) ne rogne rien : l'avancée par défaut garde l'ordre naturel de profondeur.
      const depth = showWorld && camera === 'iso' && !inBoard ? STAND_DEPTH : dz;
      out.push(flat ? flatSprite(key, id, x, y, scale, mirror) : billboard(key, id, x, y, scale, depth, 0, mirror));
    }
  }

  // --- Ambiance du plateau peint, seulement quand les animations sont permises : reflets de l'eau, feu et fumée de la
  // forge, éclats des cristaux, halo et particules des mana zones, ombres de nuages et rafales de vent.
  if (paintedData && animated) {
    const dot = (key: string, style: CSSProperties) => div(key, { position: 'absolute', borderRadius: '50%', opacity: 0, ...style });

    // Eau : reflets qui coulent dans le canal, lents dans les étangs, scintillements ; chaque pièce est masquée sur son
    // eau. Dans le plan du sol, tournées avec lui, sous les ponts couchés.
    if (waterMasks) {
      out.push(
        div(
          'ambWater',
          { ...box(0, 0, B, B), transform: `translateZ(-0.75px)${flipped ? ' rotate(180deg)' : ''}` },
          ...waterPatches(paintedData).flatMap((patch, i) => {
            const mask = waterMasks[patch.image];
            if (!mask) return [];
            const canal = patch.kind === 'canal';
            return [
              div(
                patch.key,
                {
                  ...box(patch.x, patch.y, patch.width, patch.height),
                  transformOrigin: '0 0',
                  // Transposée puis retournée bout pour bout, dans cet ordre, comme `buildGround` peint la pièce.
                  transform: `${patch.transposed ? 'matrix(0, 1, 1, 0, 0, 0) ' : ''}${patch.mirrored ? `matrix(1, 0, 0, -1, 0, ${patch.height})` : ''}`.trim() || undefined,
                  overflow: 'hidden',
                  WebkitMaskImage: `url(${mask})`,
                  maskImage: `url(${mask})`,
                  WebkitMaskSize: '100% 100%',
                  maskSize: '100% 100%',
                },
                div('ripples', {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: -30,
                  bottom: 0,
                  background: `repeating-linear-gradient(180deg, transparent 0 12px, oklch(0.98 0.03 200 / ${canal ? 0.42 : 0.2}) 12px 14px, transparent 14px 30px)`,
                  animation: `ambFlow30 ${canal ? 2.6 : 8}s linear infinite`,
                }),
                div('caustics', {
                  position: 'absolute',
                  left: -36,
                  right: 0,
                  top: -36,
                  bottom: 0,
                  backgroundImage:
                    'radial-gradient(9px 5px at 30% 40%, oklch(0.97 0.04 195 / .45), transparent), radial-gradient(7px 4px at 75% 70%, oklch(0.97 0.04 195 / .35), transparent)',
                  backgroundSize: '36px 36px',
                  animation: `ambDrift36 ${canal ? 5 : 13}s linear infinite`,
                }),
                ...scatter(31 + i, 3).map((g, j) =>
                  dot('glint' + j, {
                    left: `${10 + g.u * 80}%`,
                    top: `${8 + g.v * 84}%`,
                    width: 3,
                    height: 3,
                    background: 'white',
                    boxShadow: '0 0 4px 1px oklch(0.98 0.03 200 / .8)',
                    animation: `ambTwinkle ${(2.2 + g.phase * 1.6).toFixed(2)}s ease-in-out ${(-g.phase * 3).toFixed(2)}s infinite`,
                  }),
                ),
              ),
            ];
          }),
        ),
      );
    }

    // Forge : lueur du four qui vacille, braises, fumée de la cheminée ; tas de minerai : éclats des cristaux. Posés sur
    // leur sprite, juste devant lui.
    for (const { key, id, x, y, scale, mirror, dz } of placePaintedSprites(paintedData, board.rows, board.cols, flipped)) {
      const fx = SPRITE_FX[id];
      if (fx?.fire && fx.smoke) {
        const [fx0, fy0] = spritePoint(id, fx.fire, scale, mirror);
        const [sx0, sy0] = spritePoint(id, fx.smoke, scale, mirror);
        // Boîte de 100 × 230 px autour de l'ancre : elle couvre la fumée jusqu'en haut de sa course.
        const AX = 60;
        const AY = 210;
        out.push(
          upright(
            key + 'fire',
            x,
            y,
            100,
            230,
            AX,
            AY,
            dz + 1,
            0,
            div('halo', {
              position: 'absolute',
              left: AX + fx0 - 36,
              top: AY + fy0 - 24,
              width: 72,
              height: 48,
              borderRadius: '50%',
              background: 'radial-gradient(closest-side, oklch(0.8 0.16 60 / .32), transparent)',
              animation: 'ambPulse 1.7s ease-in-out infinite',
            }),
            div('glow', {
              position: 'absolute',
              left: AX + fx0 - 15,
              top: AY + fy0 - 12,
              width: 30,
              height: 24,
              borderRadius: '50%',
              background: 'radial-gradient(closest-side, oklch(0.92 0.15 80 / .85), oklch(0.75 0.19 45 / .35) 60%, transparent)',
              animation: 'isoFlick .3s ease-in-out infinite alternate',
            }),
            ...scatter(11, 6).map((p, i) =>
              dot('ember' + i, {
                left: AX + fx0 - 1.5 + (p.u - 0.5) * 10,
                top: AY + fy0 - 6,
                width: 3,
                height: 3,
                background: 'oklch(0.9 0.16 75)',
                boxShadow: '0 0 4px oklch(0.85 0.18 60)',
                ['--sx' as string]: `${((p.v - 0.5) * 26).toFixed(1)}px`,
                animation: `ambEmber ${(1.3 + p.v).toFixed(2)}s ease-out ${(-p.phase * 2).toFixed(2)}s infinite`,
              }),
            ),
            ...scatter(17, 4).map((p, i) =>
              dot('smoke' + i, {
                left: AX + sx0 - 7,
                top: AY + sy0 - 7,
                width: 14,
                height: 14,
                background: 'radial-gradient(closest-side, oklch(0.8 0.01 80 / .6), transparent)',
                ['--sx' as string]: `${(4 + p.u * 16).toFixed(1)}px`,
                animation: `ambSmoke ${(3.4 + p.v * 1.2).toFixed(2)}s ease-out ${(-i * 1.1 - p.phase).toFixed(2)}s infinite`,
              }),
            ),
          ),
        );
      }
      if (fx?.crystals) {
        const [ca, cb, cc, cd] = fx.crystals;
        const [x0, y0] = spritePoint(id, [ca, cb], scale, mirror);
        const [x1, y1] = spritePoint(id, [cc, cd], scale, mirror);
        const left = Math.min(x0, x1);
        const w = Math.abs(x1 - x0);
        const h = y1 - y0;
        out.push(
          upright(
            key + 'crystals',
            x,
            y,
            w + 12,
            h + 12,
            6 - left,
            6 - y0,
            dz + 1,
            0,
            ...scatter(50 + Number(key.slice(1)), 4).map((p, i) =>
              dot('spark' + i, {
                left: 6 + p.u * w - 4.5,
                top: 6 + p.v * h - 4.5,
                width: 9,
                height: 9,
                borderRadius: 0,
                background:
                  'linear-gradient(white, white) center / 1.5px 100% no-repeat, linear-gradient(white, white) center / 100% 1.5px no-repeat, radial-gradient(closest-side, oklch(0.9 0.12 310 / .9), transparent)',
                animation: `ambTwinkle ${(2 + p.v * 2).toFixed(2)}s ease-in-out ${(-p.phase * 4).toFixed(2)}s infinite`,
              }),
            ),
          ),
        );
      }
    }

    // Mana zones : halo au sol qui respire et particules qui montent, à la couleur de celui qui la tient (dorées si
    // elle est neutre, violettes si elle est contestée).
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = getCell(board, { row: r, col: c });
        if (cell.kind !== 'plain' || !cell.manaZone) continue;
        const [dr, dc] = disp(r, c);
        const cx = 48 + dc * P;
        const cy = 48 + dr * P;
        const owner = controllers.get(`${r},${c}`) ?? null;
        const color = zoneColor(owner);
        out.push(
          div(`azg${r}_${c}`, {
            ...box(cx - 46, cy - 46, 92, 92),
            transform: 'translateZ(-0.3px)',
            borderRadius: '50%',
            background: `radial-gradient(closest-side, color-mix(in oklch, ${color} 55%, transparent), transparent)`,
            animation: 'ambPulse 3.2s ease-in-out infinite',
          }),
          upright(
            `azm${r}_${c}`,
            cx,
            cy,
            64,
            96,
            32,
            84,
            8,
            0,
            ...scatter(r * 15 + c, 5).map((p, i) =>
              dot('mote' + i, {
                left: 32 + (p.u - 0.5) * 44 - 2,
                top: 84 - p.v * 14 - 2,
                width: 4,
                height: 4,
                background: `color-mix(in oklch, ${color} 45%, white)`,
                boxShadow: `0 0 6px 1px ${color}`,
                ['--sx' as string]: `${((p.phase - 0.5) * 12).toFixed(1)}px`,
                animation: `ambMote ${(2.6 + p.v * 1.4).toFixed(2)}s ease-out ${(-p.phase * 3).toFixed(2)}s infinite`,
              }),
            ),
          ),
        );
      }
    }

    // Vent : ombres de nuages qui passent lentement et rafales (traits clairs) sur le terrain, découpées au plateau.
    out.push(
      div(
        'ambSky',
        { ...box(0, 0, B, B), transform: 'translateZ(-0.25px)', overflow: 'hidden' },
        ...[0, 1, 2].map((i) =>
          div('cloud' + i, {
            position: 'absolute',
            left: 0,
            top: [0.15, 0.5, 0.82][i]! * B - 170,
            width: 560,
            height: 340,
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, oklch(0.22 0.04 160 / .2), transparent)',
            ['--x0' as string]: '-620px',
            ['--x1' as string]: `${B + 40}px`,
            ['--dy' as string]: `${[60, -40, 30][i]}px`,
            animation: `ambCloud ${[95, 120, 80][i]}s linear ${-[10, 70, 40][i]!}s infinite`,
          }),
        ),
        ...scatter(7, 6).map((p, i) =>
          dot('gust' + i, {
            left: 0,
            top: 40 + p.u * (B - 80),
            width: 150 + p.v * 80,
            height: 2,
            borderRadius: 1,
            background: 'linear-gradient(90deg, transparent, oklch(0.98 0.03 120 / .55), transparent)',
            ['--x0' as string]: `${(-200 + p.v * 300).toFixed(0)}px`,
            ['--x1' as string]: `${(300 + p.v * 500).toFixed(0)}px`,
            animation: `ambGust ${(7 + p.phase * 5).toFixed(1)}s ease-in-out ${(-p.phase * 10).toFixed(1)}s infinite`,
          }),
        ),
      ),
    );
  }

  // --- Mana zones : muret et poteaux d'angle à la couleur du contrôleur, repère au coin arrière (pas sur un plateau peint).
  const MATERIALS = {
    stone: { lit: '#ece5d3', shade: '#bdb5a2', line: '#8f8878', period: 15 },
    wood: { lit: '#d2b06c', shade: '#a07e4f', line: '#6f5636', period: 9 },
  };
  /** Petit élément debout (feu de la Forge) : boîte de 60 × 70 px, ancrée en bas au milieu ; enfants placés depuis l'ancre. */
  const standing = (key: string, x: number, y: number, dz: number, ...children: Node[]) =>
    upright(key, x, y, 60, 70, 30, 66, dz, 0, div('anchor', { ...box(30, 66, 0, 0) }, ...children));
  for (let r = 0; r < (painted ? 0 : board.rows); r++) {
    for (let c = 0; c < board.cols; c++) {
      const cell = getCell(board, { row: r, col: c });
      if (cell.kind !== 'plain' || !cell.manaZone) continue;
      const zone = ZONE_DECOR[cell.manaZone];
      const [dr, dc] = disp(r, c);
      const x0 = 14 + dc * P;
      const y0 = 14 + dr * P;
      const owner = controllers.get(`${r},${c}`) ?? null;
      const cap = zoneColor(owner);
      const m = MATERIALS[zone.wall];
      const key = `z${r}_${c}`;
      const wallH = 9;
      const postH = 17;
      const inset = 3;
      const L = 68 - 2 * inset;
      const ax = x0 + inset;
      const ay = y0 + inset;
      const transition = 'background .45s ease';
      const wallY = (k: string, top: number) =>
        div(key + k, {
          ...box(ax, top, L, wallH),
          transformOrigin: '50% 0',
          transform: 'rotateX(90deg)',
          transition,
          background: `linear-gradient(180deg, transparent 0 58%, ${m.line} 58% 66%, ${cap} 66%), repeating-linear-gradient(90deg, ${m.shade} 0 ${m.period}px, ${m.line} ${m.period}px ${m.period + 1}px)`,
        });
      const wallX = (k: string, left: number) =>
        div(key + k, {
          ...box(left, ay, wallH, L),
          transformOrigin: '0 50%',
          transform: 'rotateY(-90deg)',
          transition,
          background: `linear-gradient(90deg, transparent 0 58%, ${m.line} 58% 66%, ${cap} 66%), repeating-linear-gradient(180deg, ${m.lit} 0 ${m.period}px, ${m.line} ${m.period}px ${m.period + 1}px)`,
        });
      const post = (k: string, px: number, py: number) => [
        div(key + k + 'y', {
          ...box(px - 3.5, py + 3.5, 7, postH),
          transformOrigin: '50% 0',
          transform: 'rotateX(90deg)',
          transition,
          background: `linear-gradient(180deg, ${m.shade} 0 68%, ${cap} 68%)`,
        }),
        div(key + k + 'x', {
          ...box(px + 3.5, py - 3.5, postH, 7),
          transformOrigin: '0 50%',
          transform: 'rotateY(-90deg)',
          transition,
          background: `linear-gradient(90deg, ${m.lit} 0 68%, ${cap} 68%)`,
        }),
        div(key + k + 't', { ...box(px - 3.5, py - 3.5, 7, 7), transform: `translateZ(${postH}px)`, transition, background: cap }),
      ];
      out.push(
        wallY('wt', ay),
        wallY('wb', ay + L),
        wallX('wl', ax),
        wallX('wr', ax + L),
        ...post('p0', ax, ay),
        ...post('p1', ax + L, ay),
        ...post('p2', ax, ay + L),
        ...post('p3', ax + L, ay + L),
      );
      zone.marks.forEach(([id, scale, dx, dy], i) => out.push(billboard(`${key}m${i}`, id, x0 + 18 + dx, y0 + 18 + dy, scale, 4)));
      if (zone.fire) {
        out.push(
          standing(
            key + 'fire',
            x0 + 18,
            y0 + 18,
            8,
            div('glow', {
              position: 'absolute',
              left: -18,
              top: -14,
              width: 36,
              height: 20,
              borderRadius: '50%',
              background: 'radial-gradient(closest-side, oklch(0.85 0.17 70 / .75), transparent)',
              animation: anim('isoFlick .35s ease-in-out infinite alternate'),
            }),
            div('flame', {
              position: 'absolute',
              left: -6,
              top: -24,
              width: 12,
              height: 20,
              borderRadius: '50% 50% 45% 45% / 65% 65% 35% 35%',
              background: 'radial-gradient(60% 55% at 50% 70%, oklch(0.97 0.1 95), oklch(0.8 0.18 60) 55%, oklch(0.62 0.21 35) 85%, transparent)',
              transformOrigin: '50% 100%',
              animation: anim('isoFlick .28s ease-in-out infinite alternate'),
            }),
            ...[-7, 4, 9].map((sx, i) =>
              div('spark' + i, {
                position: 'absolute',
                left: -1.5,
                top: -16,
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: 'oklch(0.9 0.15 80)',
                ['--sx' as string]: `${sx}px`,
                opacity: animated ? 1 : 0,
                animation: anim(`isoSpark ${(1.1 + i * 0.3).toFixed(1)}s ease-out ${(-i * 0.45).toFixed(2)}s infinite`),
              }),
            ),
          ),
        );
      }
    }
  }

  // --- Enclaves : carrière de la Mine (remparts de pierre taillée), creux de la Scierie (talus de terre).
  const slope = (dirt: boolean, tone: 'lit' | 'shade' | 'dark', dir: number) => {
    const palette = dirt
      ? { lit: ['#d2a86c', '#b08852'], shade: ['#b08857', '#8f6d44'], dark: ['#9a7549', '#7d5e3a'] }
      : { lit: ['#8ac697', '#4f8a5e'], shade: ['#6aa676', '#3f7650'], dark: ['#4a7d57', '#406e4c'] };
    const [c1, c2] = palette[tone];
    return (
      `linear-gradient(${dir}deg, #92ca9d 0 3px, ${c1} 3px, ${c2})` +
      (dirt ? `, repeating-linear-gradient(${dir + 90}deg, transparent 0 6px, oklch(0.4 0.05 60 / .22) 6px 8px)` : '')
    );
  };
  const STONE = {
    top: 'linear-gradient(#e2dccb 0 1.5px, #cdc6b3 1.5px)',
    y: 'repeating-linear-gradient(90deg, transparent 0 22px, #857f70 22px 23px, transparent 23px 37px, #857f70 37px 38px, transparent 38px 53px), linear-gradient(180deg, #8f8978 0 22%, #a49e8c 22% 26%, #aea896 26% 55%, #969080 55% 60%, #b5af9d 60%)',
    x: 'repeating-linear-gradient(180deg, transparent 0 19px, #9d9786 19px 20px, transparent 20px 41px, #9d9786 41px 42px, transparent 42px 58px), linear-gradient(90deg, #c4bdaa 0 22%, #d6cfbc 22% 26%, #e0d9c6 26% 55%, #cbc4b1 55% 60%, #e9e2cf 60%)',
  };
  const QUARRY_ROCKS: readonly (readonly [string, number])[] = [
    ['q1', 0.3], ['q2', 0.36], ['q3', 0.3], ['q4', 0.32], ['q5', 0.28], ['q6', 0.28], ['q9', 0.27], ['q7', 0.3], ['q8', 0.28],
  ];
  const RIDGE: readonly (readonly [string, number])[] = [
    ['s1', 0.46], ['s2', 0.46], ['g2', 0.6], ['g6', 0.55], ['t22', 0.28], ['g4', 0.6], ['l1', 0.3],
  ];
  (painted ? [] : scenery.regions).forEach((region, gi) => {
    const inside = (r: number, c: number) => r >= region.r0 && r <= region.r1 && c >= region.c0 && c <= region.c1;
    const offBoard = (r: number, c: number) => r < 0 || c < 0 || r > last.row || c > last.col;
    const toZone = (r: number, c: number) => Math.abs(r - region.zone.row) + Math.abs(c - region.zone.col);
    const segments: { h: boolean; x: number; y: number; s: number; k: string; edge: boolean }[] = [];
    /** Mur entre la case (r, c), côté intérieur, et sa voisine (nr, nc). */
    const add = (r: number, c: number, nr: number, nc: number, edge: boolean) => {
      const [dr, dc] = disp(r, c);
      const [er, ec] = disp(nr, nc);
      const k = `${r}_${c}_${nr - r}_${nc - c}`;
      segments.push(
        dc === ec
          ? { h: true, x: 12 + dc * P, y: 12 + Math.max(dr, er) * P, s: er > dr ? -1 : 1, k, edge }
          : { h: false, x: 12 + Math.max(dc, ec) * P, y: 12 + dr * P, s: ec > dc ? -1 : 1, k, edge },
      );
    };
    // Bords du plateau compris dans l'enclave.
    for (let r = region.r0; r <= region.r1; r++) {
      for (let c = region.c0; c <= region.c1; c++) {
        for (const [a, b] of DIRS) if (offBoard(r + a, c + b)) add(r, c, r + a, c + b, true);
      }
    }
    // Ses falaises (hautes pour la Mine, basses pour la Scierie), même à l'intérieur du rectangle : le côté intérieur
    // est la case la plus proche de la mana zone (handoff, lot 7).
    for (const { between: [a, b], rangedShotsPass } of board.cliffs) {
      if (rangedShotsPass === (region.type === 'quarry') || !(inside(a.row, a.col) || inside(b.row, b.col))) continue;
      if (toZone(a.row, a.col) <= toZone(b.row, b.col)) add(a.row, a.col, b.row, b.col, false);
      else add(b.row, b.col, a.row, a.col, false);
    }
    segments.forEach((q, i) => {
      const key = `g${gi}${q.k}`;
      const t = 0.25 + ((i * 29 + gi * 11) % 50) / 100;
      const px = q.h ? q.x + t * P : q.x;
      const py = q.h ? q.y : q.y + t * P;
      if (region.type === 'quarry') {
        const H = 20;
        const T = 12;
        if (q.h) {
          out.push(
            div(key + 't', { ...box(q.x, q.y - T / 2, P, T), transform: `translateZ(${H}px)`, background: STONE.top }),
            div(key + 'f', { ...box(q.x, q.y + T / 2, P, H), transformOrigin: '50% 0', transform: 'rotateX(90deg)', background: STONE.y }),
            div(key + 'e', { ...box(q.x + P, q.y - T / 2, H, T), transformOrigin: '0 50%', transform: 'rotateY(-90deg)', background: STONE.x }),
          );
        } else {
          out.push(
            div(key + 't', { ...box(q.x - T / 2, q.y, T, P), transform: `translateZ(${H}px)`, background: STONE.top }),
            div(key + 'f', { ...box(q.x + T / 2, q.y, H, P), transformOrigin: '0 50%', transform: 'rotateY(-90deg)', background: STONE.x }),
            div(key + 'e', { ...box(q.x - T / 2, q.y + P, T, H), transformOrigin: '50% 0', transform: 'rotateX(90deg)', background: STONE.y }),
          );
        }
        const [id, scale] = QUARRY_ROCKS[(i * 5 + 3) % QUARRY_ROCKS.length]!;
        out.push(billboard(key + 'r', id, px, py, q.edge ? scale * 1.25 : scale, 4, H));
        if (q.edge) {
          const [id2, scale2] = QUARRY_ROCKS[(i * 3 + 5) % QUARRY_ROCKS.length]!;
          const t2 = (t + 0.45) % 1;
          out.push(billboard(key + 'r2', id2, q.h ? q.x + t2 * P : q.x, q.h ? q.y : q.y + t2 * P, scale2 * 1.15, 4, H));
        }
      } else {
        const H = 14;
        const A = 49.4;
        const L = 18.44;
        if (q.h) {
          out.push(
            div(key + 'p', { ...box(q.x, q.y, P, L), transformOrigin: '50% 0', transform: `translateZ(${H}px) rotateX(${-A}deg)`, background: slope(q.s > 0, 'shade', 180) }),
            div(key + 'n', { ...box(q.x, q.y - L, P, L), transformOrigin: '50% 100%', transform: `translateZ(${H}px) rotateX(${A}deg)`, background: slope(q.s < 0, 'dark', 0) }),
          );
        } else {
          out.push(
            div(key + 'p', { ...box(q.x, q.y, L, P), transformOrigin: '0 50%', transform: `translateZ(${H}px) rotateY(${A}deg)`, background: slope(q.s > 0, 'lit', 90) }),
            div(key + 'n', { ...box(q.x - L, q.y, L, P), transformOrigin: '100% 50%', transform: `translateZ(${H}px) rotateY(${-A}deg)`, background: slope(q.s < 0, 'dark', 270) }),
          );
        }
        const [id, scale] = RIDGE[(i * 3 + 1) % RIDGE.length]!;
        out.push(billboard(key + 'd', id, px, py, scale, 4, H));
        const t2 = (t + 0.5) % 1;
        const grass = ['g1', 'g2', 'g3', 'g5', 'f3', 'g6'][(i * 5 + gi) % 6]!;
        out.push(billboard(key + 'd2', grass, q.h ? q.x + t2 * P : q.x, q.h ? q.y : q.y + t2 * P, 0.6, 4, H));
      }
    });
  });

  // --- Décor de bordure : fixe, même quand le plateau tourne ; retiré des lits de la rivière et des étangs (aucun autour
  // d'un plateau peint).
  (painted ? [] : borderDecor(B)).forEach(([id, x, y, scale], i) => {
    if (inWater(x, y)) return;
    if (id[0] === 't') out.push(shadowAt(`d${i}`, x, y, Math.round((30 * scale) / 0.56), 0.3));
    out.push(billboard(`d${i}`, id, x, y, scale));
  });

  // Cases d'un autre pas que celui du décor (vue inclinée) : tout est mis à l'échelle autour du coin de la première case.
  const scale = pitch / P;
  const { pad } = ISO;
  const style = scale === 1 ? undefined : { transform: `translate(${pad}px, ${pad}px) scale3d(${scale}, ${scale}, ${scale}) translate(${-pad}px, ${-pad}px)` };
  return (
    <div className="iso-decor" aria-hidden="true" style={style}>
      {out}
    </div>
  );
}
