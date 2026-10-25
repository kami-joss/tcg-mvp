import { describe, expect, it } from 'vitest';
import { CELL_MAX, CELL_MIN, boardMetrics, fitCell, sceneSize } from './boardGeometry';

describe('géométrie du plateau : il tient dans sa zone, sans défilement', () => {
  it('mesures à plat : 11 cases de 68 px, 4 px entre elles, 14 px de marge', () => {
    expect(boardMetrics(68, 9, 11)).toEqual({ cell: 68, pitch: 72, pad: 14, width: 816, height: 672 });
  });

  it('grande zone : cases de 84 px au plus', () => {
    expect(CELL_MAX).toBe(84);
    expect(fitCell(2400, 1400, 11, 11, false)).toBe(CELL_MAX);
    expect(fitCell(2400, 1400, 11, 11, true)).toBe(CELL_MAX);
  });

  it('la plus grande case qui tient, en largeur comme en hauteur', () => {
    for (const [width, height, tilted] of [
      [700, 2000, false],
      [2000, 520, false],
      [2000, 520, true],
      [640, 480, true],
    ] as const) {
      const cell = fitCell(width, height, 11, 11, tilted);
      const size = sceneSize(cell, 11, 11, tilted);
      expect(size.width).toBeLessThanOrEqual(width);
      expect(size.height).toBeLessThanOrEqual(height);
      const bigger = sceneSize(cell + 1, 11, 11, tilted);
      expect(bigger.width > width || bigger.height > height).toBe(true);
    }
  });

  it('la vue inclinée, plus basse, laisse des cases plus grandes à hauteur égale', () => {
    expect(fitCell(2000, 600, 11, 11, true)).toBeGreaterThan(fitCell(2000, 600, 11, 11, false));
  });

  it('zone minuscule : jamais sous la taille minimale (la zone défile alors)', () => {
    expect(fitCell(100, 100, 11, 11, false)).toBe(CELL_MIN);
  });
});
