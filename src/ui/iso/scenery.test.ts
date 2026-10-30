import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, BATTLEFIELD_13, BOARD, getCell } from '../../engine';
import { at } from '../../engine/test-utils';
import { SPRITES, ZONE_DECOR, borderDecor, isWater, isoCamera, isoFrame, isoScenery, planSize, regionRect, waterKind, waterRuns } from './scenery';

describe('vue isométrique (handoff, lots 5 et 7)', () => {
  it('existe pour les plateaux qui ont un décor : les deux Champs de bataille, pas le Classique', () => {
    expect(isoScenery(BATTLEFIELD)).not.toBeNull();
    expect(isoScenery(BATTLEFIELD_13)).not.toBeNull();
    expect(isoScenery(BOARD)).toBeNull();
  });

  it('la rivière ne recouvre que des cases bloquées (rendu seulement) : 4 tronçons en paires symétriques', () => {
    const scenery = isoScenery(BATTLEFIELD)!;
    expect([...scenery.water].sort()).toEqual(['4,6', '5,0', '5,10', '6,4']);
    for (const id of scenery.water) {
      const [row, col] = id.split(',').map(Number) as [number, number];
      expect(getCell(BATTLEFIELD, { row, col }).kind).toBe('blocked');
      expect(scenery.water.has(`${10 - row},${10 - col}`)).toBe(true);
    }
    expect(isWater(BATTLEFIELD, { row: 4, col: 4 })).toBe(false);
    expect(isWater(BOARD, { row: 3, col: 4 })).toBe(false);
    expect(waterKind(BATTLEFIELD, at(4, 6))).toBe('river');
  });

  it('13 × 13 : deux cases d’eau voisines verticalement forment un seul étang', () => {
    expect(waterRuns(BATTLEFIELD_13.scenery!.water)).toEqual([
      { r0: 2, r1: 3, col: 6 },
      { r0: 9, r1: 10, col: 6 },
    ]);
    expect(waterRuns([at(4, 6), at(6, 4)])).toEqual([
      { r0: 6, r1: 6, col: 4 },
      { r0: 4, r1: 4, col: 6 },
    ]);
    expect(waterKind(BATTLEFIELD_13, at(3, 6))).toBe('pond');
    expect(waterKind(BATTLEFIELD_13, at(3, 3))).toBeNull(); // un rocher
  });

  it('les enclaves entourent la Scierie et la Mine', () => {
    const [hollow, quarry] = isoScenery(BATTLEFIELD)!.regions;
    expect(getCell(BATTLEFIELD, { row: 1, col: 9 })).toMatchObject({ manaZone: 'scierie' });
    expect(hollow).toMatchObject({ type: 'hollow', r0: 0, r1: 2, c0: 8, c1: 10, zone: at(1, 9) });
    expect(getCell(BATTLEFIELD, { row: 9, col: 1 })).toMatchObject({ manaZone: 'mine' });
    expect(quarry).toMatchObject({ type: 'quarry', r0: 8, r1: 10, c0: 0, c1: 2, zone: at(9, 1) });
    // Sol de l'enclave : étendu jusqu'au bord du plateau, et retourné avec lui.
    expect(regionRect(hollow!, false, 11, 11)).toEqual([588, 0, 228, 228]);
    expect(regionRect(hollow!, true, 11, 11)).toEqual([0, 588, 228, 228]);
    const [hollow13] = isoScenery(BATTLEFIELD_13)!.regions;
    expect(regionRect(hollow13!, false, 13, 13)).toEqual([660, 0, 300, 300]);
  });

  it('taille du plan et du cadre tirées du nombre de cases (816 px en 11, 960 px en 13)', () => {
    expect(planSize(11)).toBe(816);
    expect(planSize(13)).toBe(960);
    expect(isoFrame(816)).toEqual({ width: 1341, height: 948, centerY: 531 });
    expect(isoFrame(960)).toEqual({ width: 1544, height: 1092, centerY: 603 });
  });

  it('décor de bordure déterministe, avec des sprites connus, jusqu’au bout du plan', () => {
    for (const plan of [816, 960]) {
      const decor = borderDecor(plan);
      expect(decor.length).toBeGreaterThan(50);
      expect(borderDecor(plan)).toBe(decor);
      for (const [id] of decor) expect(SPRITES[id], id).toBeDefined();
      expect(Math.max(...decor.map(([, x, y]) => Math.min(x, y)))).toBeGreaterThan(plan - 60);
    }
    for (const zone of Object.values(ZONE_DECOR)) for (const [id] of zone.marks) expect(SPRITES[id], id).toBeDefined();
  });

  it('caméra : calée sur la largeur de la zone (0,35 à 1,35), le zoom la multiplie, les textes gardent leur taille', () => {
    const fitted = isoCamera(816, 800, 300, 1);
    expect(fitted.k).toBeCloseTo(800 / 1341);
    expect(fitted.width).toBeLessThanOrEqual(800);
    expect(isoCamera(816, 800, 2000, 1).k).toBe(fitted.k);
    const wide = isoCamera(816, 2400, 1400, 1);
    expect(wide.k).toBe(1.35);
    expect(wide).toMatchObject({ width: 1810, height: 1280 });
    expect(isoCamera(960, 1544, 400, 1)).toMatchObject({ k: 1, width: 1544, height: 1092, centerY: 603 });
    // Au-delà de ×1, les jetons gardent leur taille à l'écran ; le zoom, lui, agrandit tout.
    expect(wide.standScale * wide.k).toBeCloseTo(isoCamera(816, 1341, 900, 1).standScale);
    expect(isoCamera(816, 800, 900, 2).standScale).toBe(isoCamera(816, 800, 900, 1).standScale);
    // Décor extérieur peint (15 × 15 et 6 cases autour) : même échelle, scène plus grande.
    const board = isoCamera(1104, 1400, 900, 1);
    const world = isoCamera(1104, 1400, 900, 1, 1968);
    expect(world.k).toBe(board.k);
    expect(world.width).toBe(Math.round(isoFrame(1968).width * board.k));
    expect(world.height).toBeGreaterThan(board.height);
    const small = isoCamera(816, 300, 200, 1);
    expect(small.k).toBe(0.35);
    expect(isoCamera(816, 300, 200, 2).k).toBeCloseTo(0.7);
    expect(small.textScale * small.k).toBeCloseTo(0.92);
    expect(small.standScale).toBeGreaterThanOrEqual(1.1);
  });
});
