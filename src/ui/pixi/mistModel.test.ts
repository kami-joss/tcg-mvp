import { describe, expect, it } from 'vitest';
import { MIST_LAYERS, MIST_TILE, mistTile } from './mistModel';

describe('mer de brume sous l’île', () => {
  const [far, near] = MIST_LAYERS as [(typeof MIST_LAYERS)[number], (typeof MIST_LAYERS)[number]];

  it('deux couches : la lointaine plus petite, plus lente et moins entraînée par le défilement que la proche', () => {
    expect(MIST_LAYERS).toHaveLength(2);
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.parallax).toBeLessThan(near.parallax);
    expect(Math.hypot(...far.drift)).toBeLessThan(Math.hypot(...near.drift));
    // Moins que le plateau : elles paraissent plus bas que lui.
    for (const layer of MIST_LAYERS) expect(layer.parallax).toBeLessThan(1);
  });

  it('suit le défilement en parallaxe, dérive avec le temps, immobile sans animation', () => {
    const at = (x: number, y: number, t = 0) => mistTile(near, { x, y }, 1, t);
    expect(at(-100, 0).x - at(0, 0).x).toBeCloseTo(-100 * near.parallax, 6);
    expect(at(0, 0, 2).x - at(0, 0, 0).x).toBeCloseTo(2 * near.drift[0]);
    expect(at(0, 0, 0)).toEqual(at(0, 0, 0));
  });

  it('grandit moins vite que le plateau au zoom, et reste dans un motif après des heures de dérive', () => {
    expect(mistTile(far, { x: 0, y: 0 }, 4, 0).scale).toBeCloseTo(far.scale * 2);
    const late = mistTile(near, { x: -5000, y: 3000 }, 1.5, 3 * 3600);
    const period = MIST_TILE * near.scale * Math.sqrt(1.5);
    for (const v of [late.x, late.y]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(period);
    }
  });
});
