// Overframes (handoff overframe v1 et v2, handoff V11 lot 12 §4) : cartes dont le haut du personnage sort du cadre de
// la fiche, animées. Les définitions viennent telles quelles de `overframes.json` (calques, ancre de respiration, lueur,
// particules, couleurs normales et brillantes), dans le repère de la fiche 280 × 498 ; les autres contextes (tuiles,
// aperçu plein écran) mettent le tout à l'échelle sans recalculer les cotes. Une carte qui fournit ses calques devient
// une overframe ; n'importe quel exemplaire peut être brillant (images `_shiny` si elles existent, sinon le shiny
// générique sur les images normales).
import type { CSSProperties } from 'react';
import type { CardId } from '../engine';
import data from '../assets/overframe/overframes.json';

/** Une image du kit, posée dans le repère de la fiche (x, y en px CSS ; scale = taille affichée / taille du fichier). */
export interface OverframeImage {
  readonly src: string;
  readonly w: number;
  readonly h: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * Pièce animée posée dans le calque du pop (x, y relatifs à son coin haut-gauche) : tresses qui balancent, mèches au
 * vent (`hairWind`, depuis leur racine `origin`), paupières qui clignent.
 */
export interface OverframePart extends OverframeImage {
  readonly id: string;
  readonly origin?: readonly [number, number];
  readonly anim: 'swayL' | 'swayR' | 'hairWind' | 'blink';
}

/**
 * Reflet métallique (`shine`) : copie de l'illustration posée dans son calque (elle respire avec lui), éclaircie et
 * contrastée, dont seule une bande masquée passe : seules les zones claires (dorures, volutes) s'allument.
 */
export interface OverframeShine {
  readonly opacity: number;
  readonly filter: string;
  readonly blend: string;
  readonly mask: string;
  readonly maskSize: string;
}

/** Un anneau de graduations du cadran : `tick` avance d'un cran par seconde, `spinBack` tourne à l'envers. */
export interface OverframeRing {
  readonly background: string;
  readonly mask: string;
  readonly opacity: number;
  readonly inset?: number;
  readonly anim: 'tick' | 'spinBack';
}

/** Cadran qui avance (`dial`), posé dans le cadre au-dessus de la lueur, incliné comme la montre. */
export interface OverframeDial {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly transform: string;
  readonly outer: OverframeRing;
  readonly inner: OverframeRing;
  /** Liseré (box-shadow). */
  readonly rim: string;
}

export interface OverframeLook {
  /** Les deux couleurs du disque de lueur. */
  readonly glow: readonly [string, string];
  /** Arrêt de la seconde couleur (60 % par défaut). */
  readonly glowStop?: string;
  /** Contour fin, halo et ombre du pop. */
  readonly popFilter: string;
  readonly label?: string;
}

export type ParticleSetName = 'snow' | 'embers' | 'sparks' | 'motesGold' | 'motesAmethyst';

export interface OverframeDef {
  /** Hauteur du débordement au-dessus du cadre, réservée au-dessus de la fiche. */
  readonly headroom: number;
  /** Point fixe de la respiration, dans le repère de la fiche. */
  readonly breathAnchor: readonly [number, number];
  readonly art: OverframeImage;
  readonly pop: OverframeImage;
  /** Bouts qui passent devant les bords du cadre (Archer du feu). */
  readonly sides: OverframeImage | null;
  readonly parts: readonly OverframePart[];
  readonly shine?: OverframeShine | null;
  readonly dial?: OverframeDial | null;
  /** Lueur : dans le cadre (`inside`, sous le contenu) ou par-dessus tout (`outside`). */
  readonly glow: { readonly layer: 'inside' | 'outside'; readonly x: number; readonly y: number; readonly size: number };
  readonly particles: Exclude<ParticleSetName, 'sparks'>;
  readonly sweep: 'white' | 'warm';
  /** Durée du reflet qui balaie un exemplaire normal (6 500 ms par défaut ; brillant, toujours 4 200 ms). */
  readonly sweepMs?: number;
  /** Couleurs normales et brillantes ; `generic` : un exemplaire brillant garde les couleurs normales. */
  readonly looks: { readonly normal: OverframeLook; readonly shiny: OverframeLook | 'generic' };
}

const DEFS = data as unknown as Readonly<Record<string, OverframeDef>>;

/**
 * Overframes des cartes du jeu. L'entrée `archer_feu` du kit est l'Apprenti - Sorciers du feu (l'illustration est la
 * sienne) ; `maitre_des_heures`, le Maître des heures - Explorateur du temps.
 */
export const OVERFRAMES: Partial<Record<CardId, OverframeDef>> = {
  'archer-de-glace': DEFS.archer_glace,
  apprenti: DEFS.archer_feu,
  chronomancienne: DEFS.chronomancienne,
  'maitre-des-heures': DEFS.maitre_des_heures,
};

/**
 * Le plus grand débordement des overframes : la place réservée au-dessus de toutes les fiches, pour que le haut du cadre
 * soit toujours au même endroit, overframe ou non.
 */
export const MAX_HEADROOM = Math.max(...Object.values(OVERFRAMES).map((def) => def?.headroom ?? 0));

/** Couleurs de la lueur et du pop pour un exemplaire normal ou brillant. */
export function overframeLook(def: OverframeDef, shiny: boolean): OverframeLook {
  return shiny && def.looks.shiny !== 'generic' ? def.looks.shiny : def.looks.normal;
}

// Les images du kit, par nom de fichier.
const FILES = import.meta.glob('../assets/overframe/*.{jpg,png}', { eager: true, query: '?url', import: 'default' }) as Record<
  string,
  string
>;
const URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);

const shinyName = (src: string) => src.replace(/(\.\w+)$/, '_shiny$1');

/** L'image du kit à afficher : sa version `_shiny` pour un exemplaire brillant, si elle existe. */
export function overframeUrl(src: string, shiny: boolean): string {
  return (shiny ? URLS[shinyName(src)] : undefined) ?? URLS[src] ?? src;
}

/** La carte a ses propres images brillantes ; sinon, un exemplaire brillant reçoit le shiny générique. */
export function hasShinyImages(def: OverframeDef): boolean {
  return URLS[shinyName(def.art.src)] !== undefined;
}

/** Bande du reflet qui balaie la carte (normal blanc ou chaud, brillant arc-en-ciel). */
export const SWEEPS: Readonly<Record<OverframeDef['sweep'] | 'shiny', string>> = {
  white: 'linear-gradient(105deg, transparent 44%, oklch(1 0 0 / .2) 50%, transparent 56%)',
  warm: 'linear-gradient(105deg, transparent 44%, oklch(0.95 0.09 70 / .24) 50%, transparent 56%)',
  shiny:
    'linear-gradient(105deg, transparent 38%, oklch(0.9 0.14 350 / .4) 44%, oklch(0.93 0.13 90 / .4) 50%, oklch(0.9 0.12 170 / .4) 56%, transparent 62%)',
};

/** Reflet holographique des exemplaires brillants. */
export const HOLO =
  'linear-gradient(115deg, oklch(0.8 0.16 350), oklch(0.88 0.14 85), oklch(0.85 0.13 165), oklch(0.78 0.13 240), oklch(0.75 0.17 305), oklch(0.8 0.16 350)) 0% 50% / 300% 300%';

export interface Particle {
  readonly style: CSSProperties;
}

const STAR = 'polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%)';

interface ParticleDraw {
  readonly size: number;
  readonly duration: number;
  readonly delay: number;
  readonly drift: number;
  readonly dist: number;
  readonly opacity: number;
  /** Départ, tirés en dernier (même ordre que la maquette). */
  readonly left: number;
  readonly top: number;
  readonly rotate?: number;
  readonly look: CSSProperties;
}

/** Abscisse de départ des neiges, braises et étincelles : de −10 à 290 px. */
const spread = (random: () => number) => random() * 300 - 10;

/**
 * Un jeu de particules, tiré une fois avec une graine fixe (même tirage que la maquette) : `back` dans le cadre, `front`
 * par-dessus (cadre étendu du débordement vers le haut). Chacune tombe ou monte (`--dy`) en dérivant (`--dx`).
 */
function particleSet(
  seed: number,
  back: number,
  front: number,
  draw: (front: boolean, index: number, random: () => number) => ParticleDraw,
): { readonly back: readonly Particle[]; readonly front: readonly Particle[] } {
  let t = seed;
  const random = () => {
    t = (t * 9301 + 49297) % 233280;
    return t / 233280;
  };
  const generate = (count: number, isFront: boolean): Particle[] =>
    Array.from({ length: count }, (_, i) => {
      const p = draw(isFront, i, random);
      return {
        style: {
          left: `${p.left.toFixed(1)}px`,
          top: `${+p.top.toFixed(1)}px`,
          width: `${p.size.toFixed(1)}px`,
          height: `${p.size.toFixed(1)}px`,
          ...p.look,
          '--dx': `${p.drift.toFixed(1)}px`,
          '--dy': `${p.dist}px`,
          '--op': p.opacity.toFixed(2),
          '--rot': `${p.rotate ?? 0}deg`,
          animationDuration: `${p.duration.toFixed(2)}s`,
          animationDelay: `${(-p.delay).toFixed(2)}s`,
        } as CSSProperties,
      };
    });
  return { back: generate(back, false), front: generate(front, true) };
}

/**
 * Poussière d'or qui monte (lot 2 du kit) : 14 derrière, 8 devant ; une sur 4 est une étoile à 4 branches, les autres
 * des points avec halo ; or (teinte 75 à 95), ou une sur 3 améthyste (300 à 315).
 */
function motes(seed: number, amethyst: boolean, rotate: number) {
  return particleSet(seed, 14, 8, (front, i, random) => {
    const star = i % 4 === 0;
    const size = star ? (front ? 9 + random() * 5 : 6 + random() * 4) : front ? 2.5 + random() * 2.5 : 1.5 + random() * 2;
    const hue = amethyst && i % 3 === 2 ? 300 + random() * 15 : 75 + random() * 20;
    return {
      size,
      duration: 6 + random() * 6,
      delay: random() * 12,
      drift: (random() - 0.3) * 70,
      dist: -Math.round(90 + random() * 170),
      opacity: 0.55 + random() * 0.45,
      left: front ? random() * 340 - 30 : random() * 280,
      top: front ? 60 + random() * 560 : 110 + random() * 380,
      rotate,
      look: star
        ? { clipPath: STAR, background: `oklch(0.95 0.1 ${hue.toFixed(0)})` }
        : {
            borderRadius: '50%',
            background: `oklch(0.95 0.1 ${hue.toFixed(0)})`,
            boxShadow: `0 0 5px 1px oklch(0.82 0.14 ${(hue - 5).toFixed(0)} / .85)`,
          },
    };
  });
}

/**
 * Neige (Archer de glace), braises (Apprenti - Sorciers du feu), étincelles arc-en-ciel (tout exemplaire brillant),
 * poussière d'or (Maître des heures, étoiles qui tournent) et d'or et d'améthyste (Chronomancienne).
 */
export const PARTICLES: Readonly<Record<ParticleSetName, { readonly back: readonly Particle[]; readonly front: readonly Particle[] }>> = {
  snow: particleSet(7, 16, 6, (front, _i, random) => {
    const size = front ? 3 + random() * 3 : 1.5 + random() * 2.5;
    return {
      size,
      duration: (front ? 5 : 7) + random() * 6,
      delay: random() * 12,
      drift: (random() - 0.5) * 60,
      dist: front ? 640 : 540,
      opacity: front ? 0.5 + random() * 0.3 : 0.35 + random() * 0.45,
      left: spread(random),
      top: front ? -30 : -20,
      look: {
        borderRadius: '50%',
        background: 'oklch(0.98 0.01 240)',
        filter: size > 4 ? 'blur(1px)' : 'none',
        boxShadow: '0 0 4px oklch(0.95 0.03 230 / .8)',
      },
    };
  }),
  embers: particleSet(23, 14, 6, (front, _i, random) => {
    const size = front ? 3 + random() * 3 : 2 + random() * 2.5;
    const hue = 45 + random() * 35;
    return {
      size,
      duration: (front ? 4 : 5) + random() * 4,
      delay: random() * 9,
      drift: (random() - 0.5) * 70,
      dist: front ? -640 : -540,
      opacity: front ? 0.7 + random() * 0.3 : 0.55 + random() * 0.4,
      left: spread(random),
      top: front ? 600 : 505,
      look: {
        borderRadius: '50%',
        background: `oklch(0.88 0.16 ${hue.toFixed(0)})`,
        boxShadow: `0 0 6px 1px oklch(0.75 0.19 ${(hue - 10).toFixed(0)} / .9)`,
      },
    };
  }),
  sparks: particleSet(11, 14, 6, (front, i, random) => {
    const size = front ? 7 + random() * 6 : 4 + random() * 5;
    const hue = [350, 85, 305, 170][i % 4]!;
    return {
      size,
      duration: (front ? 6 : 8) + random() * 6,
      delay: random() * 12,
      drift: (random() - 0.5) * 50,
      dist: front ? 640 : 540,
      opacity: front ? 0.7 + random() * 0.3 : 0.5 + random() * 0.4,
      left: spread(random),
      top: front ? -30 : -20,
      rotate: 180,
      look: { clipPath: STAR, background: `oklch(0.95 0.1 ${hue})`, filter: `drop-shadow(0 0 3px oklch(0.85 0.16 ${hue}))` },
    };
  }),
  motesGold: motes(47, false, 180),
  motesAmethyst: motes(31, true, 0),
};

/** Taille et place d'une image du kit, en px CSS. */
export function imageBox(image: OverframeImage, shiny: boolean): CSSProperties {
  return {
    left: `${image.x}px`,
    top: `${image.y}px`,
    width: `${(image.w * image.scale).toFixed(2)}px`,
    height: `${(image.h * image.scale).toFixed(2)}px`,
    backgroundImage: `url("${overframeUrl(image.src, shiny)}")`,
  };
}

/** Point fixe de la respiration dans le repère d'un calque (l'ancre de la carte moins la place du calque). */
export function breathOrigin(def: OverframeDef, image: OverframeImage): string {
  return `${(def.breathAnchor[0] - image.x).toFixed(1)}px ${(def.breathAnchor[1] - image.y).toFixed(1)}px`;
}
