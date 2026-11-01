import { describe, expect, it } from 'vitest';
import { DIE, DROP, EASE, LAND, REST, SLAM, bezier, lungeMotion, poseOf, running, sample, shakeMotions, walkMotions } from './tokenMotion';

// Les animations d'action du plateau PixiJS reprennent celles des jetons HTML (`fx/stage.ts`) : mêmes durées, mêmes
// étapes, mêmes courbes.

describe('courbes', () => {
  it('comme `cubic-bezier()` du CSS : bornes, linéaire, ease-in lent au départ, ease-out rapide', () => {
    expect(bezier(EASE.in, 0)).toBe(0);
    expect(bezier(EASE.in, 1)).toBe(1);
    expect(bezier(EASE.linear, 0.3)).toBeCloseTo(0.3, 4);
    expect(bezier(EASE.in, 0.5)).toBeCloseTo(0.3153, 3);
    expect(bezier(EASE.out, 0.5)).toBeCloseTo(0.6847, 3);
    expect(bezier(EASE.inOut, 0.5)).toBeCloseTo(0.5, 4);
  });
});

describe('images clés', () => {
  it('pose de départ, d’arrivée, et entre deux images clés ; une valeur absente vaut celle du repos', () => {
    expect(sample(DROP, 0)).toMatchObject({ y: -26, sx: 0.2, alpha: 0 });
    expect(sample(DROP, DROP.duration)).toEqual(REST);
    expect(sample(LAND, LAND.duration * 2)).toEqual(REST);
    // Mort : à la fin, minuscule, tournée de 35° et invisible.
    expect(sample(DIE, DIE.duration)).toMatchObject({ sx: 0.1, rot: 35, alpha: 0 });
    const mid = sample(SLAM, SLAM.duration / 2);
    expect(mid.sx).toBeLessThan(1.7);
    expect(mid.sx).toBeGreaterThan(0.9);
  });

  it('secousse : plus forte pour un coup dur, avec un éclair qui retombe', () => {
    const [soft] = shakeMotions(false);
    const [hard, flash] = shakeMotions(true);
    expect(Math.abs(hard!.frames[1]!.pose.x!)).toBeGreaterThan(Math.abs(soft!.frames[1]!.pose.x!));
    expect(sample(flash!, 0).flash).toBeCloseTo(1.6);
    expect(sample(flash!, flash!.duration).flash).toBe(0);
  });

  it('élan : recule puis file vers la cible, dans le plan', () => {
    const lunge = lungeMotion({ x: 0, y: 0 }, { x: 72, y: 0 });
    expect(lunge.frames[1]!.pose).toMatchObject({ dx: -8, dy: -0 });
    expect(lunge.frames[2]!.pose).toMatchObject({ dx: 28, dy: 0 });
  });
});

describe('marche', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 72, y: 0 },
    { x: 72, y: 72 },
  ];

  it('glisse de case en case et garde sa dernière pose jusqu’à son retrait ; saute à chaque pas', () => {
    const [slide, hops] = walkMotions(points, 420, 13);
    expect(slide).toMatchObject({ duration: 420, hold: true, origin: { x: 0, y: 0 } });
    expect(sample(slide!, 210)).toMatchObject({ dx: 72, dy: 0 });
    expect(sample(slide!, 420)).toMatchObject({ dx: 72, dy: 72 });
    // Mi-pas : en l'air de 13 px, un peu grossi ; posé au bout de chaque pas.
    expect(sample(hops!, 105)).toMatchObject({ y: -13, sx: 1.06 });
    expect(sample(hops!, 210).y).toBeCloseTo(0);
    expect(walkMotions(points.slice(0, 1), 0, 13)).toEqual([]);
  });

  it('la pose donne le point du plan où est le jeton, même quand sa case a changé en route', () => {
    const playing = walkMotions(points, 420, 13).map((motion) => ({ motion, start: 1000 }));
    expect(poseOf(playing, 1210).at).toEqual({ x: 72, y: 0 });
    expect(poseOf(playing, 5000).at).toEqual({ x: 72, y: 72 });
    expect(running(playing[0]!, 1300)).toBe(true);
    expect(running(playing[0]!, 1500)).toBe(false);
  });
});

describe('animations mêlées', () => {
  it('les écarts s’ajoutent, les échelles et opacités se multiplient', () => {
    const playing = [
      { motion: DIE, start: 0 },
      { motion: lungeMotion({ x: 0, y: 0 }, { x: 0, y: 72 }), start: 0 },
    ];
    const { pose, at } = poseOf(playing, DIE.duration);
    expect(at).toBeNull();
    expect(pose).toMatchObject({ alpha: 0, rot: 35 });
    expect(pose.sx).toBeCloseTo(0.1);
    expect(poseOf([], 0)).toEqual({ pose: REST, at: null });
  });
});
