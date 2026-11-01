// Horloge de l'ambiance : le plateau PixiJS et les boucles CSS (orbes de mana, tuiles brillantes, overframes,
// respiration des jetons HTML…) avancent sur les mêmes images, 30 par seconde. Une boucle CSS laissée au navigateur
// fait recomposer toute la page à chaque image de l'écran (60 par seconde ou plus) : mesuré, la moitié du CPU au repos
// sur le 15 × 15. Les boucles infinies sont donc mises en pause et avancées ici, sur les images où le canvas dessine.
import { useEffect } from 'react';

/** Images par seconde de l'ambiance. */
export const AMBIENT_FPS = 30;

/**
 * Numéro de l'image d'ambiance d'un instant (ms, horloge de `requestAnimationFrame`) : tous ceux qui dessinent dans
 * une même image de l'écran reçoivent le même instant, donc le même numéro, et changent ensemble.
 */
export const ambientFrame = (now: number): number => Math.floor((now * AMBIENT_FPS) / 1000);

/** Ce qu'il faut d'une animation (une `CSSAnimation`, ou un faux dans les tests). */
export interface LoopAnimation {
  currentTime: CSSNumberish | null;
  readonly effect: { getTiming(): { iterations?: number }; readonly target?: Element | null } | null;
  pause(): void;
}

/** Une boucle d'ambiance : une animation CSS (pas une animation lancée par un script) qui se répète sans fin. */
const isLoop = (animation: LoopAnimation): boolean =>
  'animationName' in animation && animation.effect?.getTiming().iterations === Infinity;

/** Une boucle mise en pause par un `.of--paused` (overframe hors écran ou onglet caché) n'avance pas. */
const gated = (animation: LoopAnimation): boolean => Boolean(animation.effect?.target?.closest?.('.of--paused'));

/**
 * Avance les boucles d'ambiance à `now` : une nouvelle boucle est mise en pause et retenue avec son avance (son temps
 * courant moins `now`, délai négatif compris : elle garde sa phase) ; les retenues sont posées à `now` + avance ; celles
 * qui ont disparu (classe retirée) sont oubliées.
 */
export function driveLoops(animations: readonly LoopAnimation[], loops: Map<LoopAnimation, number>, now: number): void {
  const present = new Set(animations);
  for (const animation of loops.keys()) if (!present.has(animation)) loops.delete(animation);
  for (const animation of animations) {
    if (loops.has(animation) || !isLoop(animation)) continue;
    loops.set(animation, Number(animation.currentTime ?? 0) - now);
    animation.pause();
  }
  for (const [animation, offset] of loops) if (!gated(animation)) animation.currentTime = now + offset;
}

/** Tant que l'écran de jeu est affiché avec les animations : ses boucles CSS avancent à la cadence de l'ambiance. */
export function useAmbientLoops(animated: boolean): void {
  useEffect(() => {
    if (!animated || typeof document === 'undefined' || typeof document.getAnimations !== 'function') return;
    const loops = new Map<LoopAnimation, number>();
    let last = -1;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const frame = ambientFrame(now);
      if (frame === last) return;
      last = frame;
      driveLoops(document.getAnimations(), loops, now);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Celles qui restent (les animations coupées ont retiré les autres) sont rendues au navigateur, à leur phase.
      const alive = new Set<LoopAnimation>(document.getAnimations());
      for (const animation of loops.keys()) if (alive.has(animation)) (animation as unknown as Animation).play();
    };
  }, [animated]);
}
