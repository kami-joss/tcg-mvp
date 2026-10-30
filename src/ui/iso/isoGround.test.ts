import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, BATTLEFIELD_15, getCell } from '../../engine';
import { seeded, smoothstep, socleBlend, weightedPick, zoneBlend } from './isoGround';
import {
  GROUND_IMAGES,
  GROUND_WAIT,
  flatGroundBackground,
  groundImageNames,
  paintedBoardDecor,
  paintedDecor,
  paintedStandDepth,
  placePaintedSprites,
  worldPlan,
} from './paintedDecor';
import { SPRITES, planSize } from './scenery';

describe('sol peint : fonctions de calcul (handoff plateau 15)', () => {
  it('pseudo-aléatoire déterministe : la même graine, la même suite, dans [0, 1)', () => {
    const a = seeded(4);
    const b = seeded(4);
    const values = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(values);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(seeded(5)()).not.toBe(seeded(4)());
  });

  it('tirage pondéré : respecte les poids, et ne tire jamais un nom de poids nul', () => {
    const random = seeded(1);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) counts[weightedPick(random, ['a', 'b', 'c'], [10, 30, 0])]! += 1;
    expect(counts.c).toBe(0);
    expect(counts.b! / counts.a!).toBeGreaterThan(2.4);
    expect(counts.b! / counts.a!).toBeLessThan(3.6);
    expect(weightedPick(() => 0.999999, ['a', 'b'], [1, 1])).toBe('b');
  });

  it('socle : loin de tout socle, le bruit seul ne dessine rien (plus de taches sombres dans l’herbe)', () => {
    expect(socleBlend(0, 3, 3)).toEqual({ alpha: 0, rim: 0 });
  });

  it('zone : loin de toute zone, le bruit seul ne dessine pas sa bande sombre (plus de points sombres réguliers)', () => {
    // Bruit au plus fort : sans garde-fou, la frontière d'une zone sans cases tombait ici, bande sombre comprise.
    expect(zoneBlend(0, 3.02, 3.02)).toEqual({ alpha: 0, band: 0 });
    // Sur la frontière d'une vraie zone, rien ne change.
    expect(zoneBlend(0.5, 0, 0).band).toBe(1);
  });

  it('smoothstep : 0 avant, 1 après, ½ au milieu', () => {
    expect([smoothstep(-1), smoothstep(0), smoothstep(0.5), smoothstep(1), smoothstep(2)]).toEqual([0, 0, 0.5, 1, 1]);
  });

  it('sol de zone : opaque dedans, absent dehors, bande sombre sur la frontière', () => {
    expect(zoneBlend(1, 0, 0).alpha).toBe(1);
    expect(zoneBlend(0, 0, 0).alpha).toBe(0);
    const edge = zoneBlend(0.5, 0, 0);
    expect(edge.band).toBe(1);
    expect(zoneBlend(1, 0, 0).band).toBeLessThan(0.01);
    // Par plaques (Scierie) : un bruit faible laisse passer l'herbe, même au cœur de la zone.
    expect(zoneBlend(1, 0, 0, { noise: -1, offset: 0.2 }).alpha).toBe(0);
    expect(zoneBlend(1, 0, 0, { noise: 1, offset: 0.2 }).alpha).toBe(1);
  });

  it('socle : opaque sous le relief, liseré sur son bord', () => {
    expect(socleBlend(1, 0, 0).alpha).toBe(1);
    expect(socleBlend(0, 0, 0).alpha).toBe(0);
    expect(socleBlend(0.22, 0, 0).rim).toBeCloseTo(0.18);
  });
});

describe('décor peint du 15 × 15 (rendu seulement)', () => {
  const full = paintedDecor(BATTLEFIELD_15)!;
  const board = paintedBoardDecor(BATTLEFIELD_15)!;
  const inBoard = ([row, col]: readonly number[]) => row! >= 0 && col! >= 0 && row! < 15 && col! < 15;

  it('seul le 15 × 15 en a un ; même plan que le plateau (cases de 68 px au pas de 72, marge 14)', () => {
    expect(paintedDecor(BATTLEFIELD_13)).toBeNull();
    const { pas, case: cell, marge, densite } = full.plan;
    expect({ pas, cell, marge, densite }).toEqual({ pas: 72, cell: 68, marge: 14, densite: 2 });
    expect(2 * marge + 15 * pas - (pas - cell)).toBe(planSize(15));
  });

  it('décor complet : 6 cases de décor tout autour (plan de 1968 px), 254 sprites ; le plateau seul : 29 sprites, 6 pièces d’eau', () => {
    expect(full.plan.bordure).toBe(6);
    expect(worldPlan(full, 15)).toBe(1968);
    expect(full.sprites).toHaveLength(254);
    expect(board.plan.bordure).toBe(0);
    expect(worldPlan(board, 15)).toBe(planSize(15));
    expect(board.sprites).toHaveLength(29);
    expect(board.decals).toHaveLength(6);
    // Sols, socles et sprites restent dans le monde : 6 cases tout autour du plateau.
    const inWorld = ([row, col]: readonly number[]) => row! >= -6 && col! >= -6 && row! < 21 && col! < 21;
    for (const zone of full.zones) for (const pos of zone.cases) expect(inWorld(pos), `${zone.sol} ${pos}`).toBe(true);
    for (const socle of full.socles) for (const pos of socle.cases) expect(inWorld(pos)).toBe(true);
    for (const sprite of full.sprites) expect(inWorld(sprite.case ?? sprite.entre![0]!), sprite.id).toBe(true);
  });

  it('vue de dessus : le sol suit le pas des cases, calé sur la première case ; vert uni en attendant', () => {
    expect(flatGroundBackground(board, 15, null, 72, 14)).toBe(GROUND_WAIT);
    expect(flatGroundBackground(board, 15, 'sol.png', 72, 14)).toBe(`url(sol.png) 0px 0px / 1104px 1104px no-repeat, ${GROUND_WAIT}`);
    // Cases de 50 px au pas de 54 : échelle 0,75 ; le coin de la première case reste à 14 px du bord.
    expect(flatGroundBackground(board, 15, 'sol.png', 54, 14)).toBe(`url(sol.png) 3.5px 3.5px / 828px 828px no-repeat, ${GROUND_WAIT}`);
  });

  it('toutes les images du sol sont dans le projet', () => {
    for (const name of groundImageNames(full)) expect(GROUND_IMAGES[name], name).toBeDefined();
  });

  it('pièces peintes (canal, étangs) du plateau sur des cases X d’eau, ou sous un pont ; celles du décor extérieur, hors du plateau', () => {
    for (const sprite of board.sprites) expect((sprite.empreinte ?? (sprite.case ? [sprite.case] : sprite.entre ?? [])).every(inBoard)).toBe(true);
    const bridges = board.sprites.filter((s) => s.id.startsWith('pont') && s.case).map((s) => `${s.case![0]},${s.case![1]}`);
    expect(bridges).toEqual(['9,1', '13,5']);
    for (const { case: [row, col], sens } of board.decals) {
      const second = sens === 'lignes' ? { row: row + 1, col } : { row, col: col + 1 };
      for (const pos of [{ row, col }, second]) {
        const key = `${pos.row},${pos.col}`;
        if (bridges.includes(key)) {
          expect(getCell(BATTLEFIELD_15, pos).kind, key).toBe('plain');
          continue;
        }
        expect(getCell(BATTLEFIELD_15, pos).kind, key).toBe('blocked');
        expect(BATTLEFIELD_15.scenery!.water, key).toContainEqual(pos);
      }
    }
    for (const decal of full.decals.filter((d) => !board.decals.includes(d))) expect(inBoard(decal.case), `${decal.case}`).toBe(false);
  });
});

describe('sprites peints du 15 × 15 (rendu seulement)', () => {
  const full = paintedDecor(BATTLEFIELD_15)!;
  const board = paintedBoardDecor(BATTLEFIELD_15)!;
  const center = (cell: number) => 14 + cell * 72 + 34;

  it('chaque sprite a ses mesures dans SPRITES ; sur le plateau, montagnes, rochers, forge, minerai et billots sur des cases X', () => {
    for (const sprite of full.sprites) expect(SPRITES[sprite.id], sprite.id).toBeDefined();
    for (const sprite of board.sprites) {
      if (sprite.id.startsWith('pont') || sprite.entre) continue;
      for (const [row, col] of sprite.empreinte ?? [sprite.case!]) {
        expect(getCell(BATTLEFIELD_15, { row, col }).kind, `${sprite.id} (${row}, ${col})`).toBe('blocked');
      }
    }
  });

  it('au centre de leur case, au milieu de deux cases pour un cadre de mine ; miroir conservé', () => {
    const placed = placePaintedSprites(board, 15, 15, false);
    expect(placed[0]).toMatchObject({ key: 'p0', id: 'montagne_large', x: center(9), y: center(0), mirror: true, flat: false, inBoard: true });
    expect(placed.find((s) => s.id === 'cadre_mine_1')).toMatchObject({ x: (center(8) + center(9)) / 2, y: center(1) });
    expect(placed.find((s) => s.id === 'pont_c')).toMatchObject({ x: center(5), y: center(13), mirror: false });
  });

  it('ancrés sur leur `case` : la forge sur sa case avant, un bâtiment sur sa case centrale, un champ au coin de ses 4 cases', () => {
    const placed = placePaintedSprites(full, 15, 15, false);
    expect(placed.find((s) => s.id === 'forge_rochers')).toMatchObject({ x: center(5), y: center(5) });
    expect(placed.find((s) => s.id === 'ecurie')).toMatchObject({ x: center(-3), y: center(5), inBoard: false });
    expect(placed.find((s) => s.id === 'potager')).toMatchObject({ x: center(16.5), y: center(8.5), inBoard: false });
  });

  it('échelle : 0,5 (images en densité 2), multipliée par `echelle` du décor', () => {
    const placed = placePaintedSprites(full, 15, 15, false);
    for (const [i, sprite] of full.sprites.entries()) expect(placed[i]!.scale, sprite.id).toBeCloseTo(0.5 * (sprite.echelle ?? 1));
    expect(full.sprites.some((s) => s.echelle !== undefined && s.echelle !== 1)).toBe(true);
  });

  it('les ponts sont couchés dans le sol (on marche dessus) ; les autres sprites, debout, ne passent jamais sous le sol', () => {
    const placed = placePaintedSprites(full, 15, 15, false);
    expect(placed.filter((s) => s.flat).map((s) => s.id)).toEqual(['pont_r', 'pont_c']);
    for (const { id, flat, dz, scale } of placed) {
      if (flat) continue;
      const [, h, , ay] = SPRITES[id]!;
      // Le sol situé v px sous l'ancre à l'écran est v × √2 px plus près de la caméra : le sprite doit être devant.
      expect(dz, id).toBeGreaterThan((h - ay) * scale * Math.SQRT2);
      expect(dz, id).toBeGreaterThanOrEqual(24);
    }
    // Billot : 58 px de base sous l'ancre en densité 2, 29 à l'échelle ; montagne : peu de base, l'avancée par défaut.
    expect(paintedStandDepth('billot')).toBe(44);
    expect(paintedStandDepth('montagne_pic')).toBe(Math.max(24, Math.ceil(20.5 * Math.SQRT2) + 2));
  });
});
