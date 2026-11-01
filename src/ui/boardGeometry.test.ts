import { describe, expect, it } from 'vitest';
import { CELL_GROWN, CELL_MAX, CELL_MIN, boardMetrics, fitCell, sceneSize, tiltGeometry } from './boardGeometry';

describe('géométrie du plateau : il tient dans sa zone, sans défilement', () => {
  it('mesures à plat : 11 cases de 68 px, 4 px entre elles, 14 px de marge', () => {
    expect(boardMetrics(68, 9, 11)).toEqual({ cell: 68, pitch: 72, pad: 14, width: 816, height: 672 });
  });

  it('grande zone : le plateau grandit jusqu’à ×1,35 (cases de 113 px au plus ; les jetons, eux, s’arrêtent à 84 px)', () => {
    expect(CELL_MAX).toBe(84);
    expect(CELL_GROWN).toBe(113);
    expect(fitCell(2400, 1800, 11, 11, false)).toBe(CELL_GROWN);
    expect(fitCell(2400, 1800, 11, 11, true)).toBe(CELL_GROWN);
    expect(fitCell(1100, 1100, 11, 11, false)).toBeGreaterThan(CELL_MAX);
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

  it('vue inclinée avec le décor 2,5D : la scène l’englobe, le plateau y reste au point de fuite', () => {
    const m = boardMetrics(50, 13, 13);
    const plain = tiltGeometry(m, 13);
    const decor = tiltGeometry(m, 13, true);
    expect(plain).toMatchObject({ sceneWidth: m.width, boardLeft: 0 });
    expect(decor.sceneWidth).toBeGreaterThan(m.width + 100);
    expect(decor.sceneHeight).toBeGreaterThan(plain.sceneHeight + 80);
    expect(decor.originX).toBeCloseTo(decor.boardLeft + m.width / 2);
    expect(decor.boardTop + m.height).toBeLessThan(decor.sceneHeight);
    // À place égale, des cases plus petites pour faire tenir le décor.
    expect(fitCell(1000, 800, 13, 13, true, true)).toBeLessThan(fitCell(1000, 800, 13, 13, true));
  });

  it('zone minuscule : jamais sous la taille minimale (la zone défile alors)', () => {
    expect(fitCell(100, 100, 11, 11, false)).toBe(CELL_MIN);
  });
});
