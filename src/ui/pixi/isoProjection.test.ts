import { describe, expect, it } from 'vitest';
import { isoCamera, isoFrame, planSize } from '../iso/scenery';
import { isoDepth, isoPlaneMatrix, isoProject, isoUnproject } from './isoProjection';

// La projection doit tomber exactement là où le plateau en CSS pose ses cases : le centre du plateau au centre de la
// scène, les coins du losange aux quatre points cardinaux.

const plan = planSize(15);
const camera = isoCamera(plan, isoFrame(plan).width, 900, 1);

describe('caméra isométrique du plateau PixiJS', () => {
  it('le centre du plateau tombe au milieu de la scène, à la hauteur de son centre', () => {
    const center = isoProject(camera, plan, plan / 2, plan / 2);
    expect(center.x).toBeCloseTo(camera.width / 2, 6);
    expect(center.y).toBeCloseTo(camera.centerY, 6);
  });

  it('losange : le coin (0, 0) en haut, (plan, plan) en bas, (plan, 0) à droite, (0, plan) à gauche', () => {
    const k = camera.k;
    const top = isoProject(camera, plan, 0, 0);
    const bottom = isoProject(camera, plan, plan, plan);
    const right = isoProject(camera, plan, plan, 0);
    const left = isoProject(camera, plan, 0, plan);
    expect(top.x).toBeCloseTo(camera.width / 2, 6);
    expect(bottom.y - top.y).toBeCloseTo((2 * plan * k) / Math.sqrt(6), 6);
    expect(right.x - left.x).toBeCloseTo((2 * plan * k) / Math.SQRT2, 6);
    expect(right.y).toBeCloseTo(left.y, 6);
    // Ce qui est plus bas sur le plateau est plus près de la caméra.
    expect(bottom.depth).toBeGreaterThan(top.depth);
  });

  it('l’inverse retrouve le point du plan sous l’écran', () => {
    for (const [x, y] of [[0, 0], [300, 120], [1104, 40], [-200, 900]] as const) {
      const p = isoProject(camera, plan, x, y);
      const back = isoUnproject(camera, plan, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
  });

  it('matrice affine du plan : celle de `scale(k) rotateX(54,7356°) rotateZ(45°)` au centre de la scène', () => {
    const [a, b, c, d] = isoPlaneMatrix(camera, plan);
    expect(a).toBeCloseTo(camera.k / Math.SQRT2, 9);
    expect(c).toBeCloseTo(-camera.k / Math.SQRT2, 9);
    expect(b).toBeCloseTo(camera.k * Math.cos((54.7356 * Math.PI) / 180) * Math.SQRT1_2, 5);
    expect(d).toBeCloseTo(b, 9);
  });

  it('ordre de dessin : plus bas sur le plateau, ou plus avancé, passe devant', () => {
    expect(isoDepth(100, 100, 0)).toBeLessThan(isoDepth(110, 100, 0));
    expect(isoDepth(100, 100, 24)).toBeGreaterThan(isoDepth(110, 100, 0));
  });
});
