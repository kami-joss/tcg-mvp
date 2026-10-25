import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, BOARD, getCell } from '../../engine';
import { BORDER_DECOR, SPRITES, ZONE_DECOR, isWater, isoCamera, isoScenery, regionRect } from './scenery';

describe('vue isométrique (handoff, lot 5)', () => {
  it('n’existe que pour le Champ de bataille', () => {
    expect(isoScenery(BATTLEFIELD)).not.toBeNull();
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
  });

  it('les enclaves entourent la Scierie et la Mine', () => {
    const [hollow, quarry] = isoScenery(BATTLEFIELD)!.regions;
    expect(getCell(BATTLEFIELD, { row: 1, col: 9 })).toMatchObject({ manaZone: 'scierie' });
    expect(hollow).toMatchObject({ type: 'hollow', r0: 0, r1: 2, c0: 8, c1: 10 });
    expect(getCell(BATTLEFIELD, { row: 9, col: 1 })).toMatchObject({ manaZone: 'mine' });
    expect(quarry).toMatchObject({ type: 'quarry', r0: 8, r1: 10, c0: 0, c1: 2 });
    // Sol de l'enclave : étendu jusqu'au bord du plateau, et retourné avec lui.
    expect(regionRect(hollow!, false, 11, 11)).toEqual([588, 0, 228, 228]);
    expect(regionRect(hollow!, true, 11, 11)).toEqual([0, 588, 228, 228]);
  });

  it('décor de bordure déterministe, avec des sprites connus', () => {
    expect(BORDER_DECOR.length).toBeGreaterThan(50);
    for (const [id] of BORDER_DECOR) expect(SPRITES[id], id).toBeDefined();
    for (const zone of Object.values(ZONE_DECOR)) for (const [id] of zone.marks) expect(SPRITES[id], id).toBeDefined();
  });

  it('caméra : la scène tient dans la zone du plateau (0,35 à 1), le zoom la multiplie, les textes gardent leur taille', () => {
    const wide = isoCamera(2400, 1400, 1);
    expect(wide.k).toBe(1);
    expect(wide).toMatchObject({ width: 1341, height: 948 });
    const fitted = isoCamera(800, 900, 1);
    expect(fitted.width).toBeLessThanOrEqual(800);
    expect(fitted.k).toBeCloseTo(800 / 1341);
    expect(isoCamera(1400, 474, 1).k).toBeCloseTo(0.5);
    const small = isoCamera(300, 200, 1);
    expect(small.k).toBe(0.35);
    expect(isoCamera(300, 200, 2).k).toBeCloseTo(0.7);
    expect(small.textScale * small.k).toBeCloseTo(0.92);
    expect(small.standScale).toBeGreaterThanOrEqual(1.1);
  });
});
