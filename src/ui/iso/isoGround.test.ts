import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, BATTLEFIELD_15, getCell } from '../../engine';
import { grassTile, seeded, smoothstep, socleBlend, weightedPick, zoneBlend } from './isoGround';
import {
  GROUND_IMAGES,
  GROUND_WAIT,
  HD_SPRITE_SCALE,
  PAINTED_SPRITE_SCALE,
  STAND_DEPTH,
  flatGroundBackground,
  groundImageNames,
  paintedBoardDecor,
  paintedDecor,
  paintedStandDepth,
  placePaintedSprites,
  spriteScale,
  spritesHiding,
  worldPlan,
} from './paintedDecor';
import type { PlacedSprite } from './paintedDecor';
import { HD_SPRITE_IDS, SPRITES, planSize } from './scenery';

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

  it('herbe : sur une case sobre, seulement les tuiles sobres ; ailleurs, toutes', () => {
    const grass = { tuiles: ['unie', 'fleurs'], poids: [1, 1], sobre: { tuiles: ['unie'], cases: [[2, 2]] as [number, number][] } };
    const random = seeded(3);
    const sober = new Set(Array.from({ length: 200 }, () => grassTile(random, grass, 2, 2)));
    const elsewhere = new Set(Array.from({ length: 200 }, () => grassTile(random, grass, 2, 3)));
    expect([...sober]).toEqual(['unie']);
    expect(elsewhere).toEqual(new Set(['unie', 'fleurs']));
  });

  it('herbe en motif : la tuile de la case dans le motif n × n, répété, cases du décor extérieur comprises', () => {
    const motif = Array.from({ length: 9 }, (_, i) => `m${i + 1}`);
    const grass = { tuiles: ['unie'], poids: [1], motif, sobre: { tuiles: ['unie'], cases: [[0, 0]] as [number, number][] } };
    const random = seeded(3);
    expect(grassTile(random, grass, 0, 0)).toBe('m1');
    expect(grassTile(random, grass, 1, 2)).toBe('m6');
    expect(grassTile(random, grass, 4, 5)).toBe('m6');
    // Indices négatifs (décor extérieur) : le motif continue sans saut.
    expect(grassTile(random, grass, -1, -1)).toBe('m9');
    expect(grassTile(random, grass, -3, 3)).toBe('m1');
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

  it('décor complet : 6 cases de décor tout autour (plan de 1968 px), 239 sprites ; le plateau seul : 26 sprites, 6 pièces d’eau', () => {
    expect(full.plan.bordure).toBe(6);
    expect(worldPlan(full, 15)).toBe(1968);
    // Le carré de pierres (9, 9)–(10, 10) porte un seul amas de 2 × 2, au lieu de quatre rochers.
    expect(full.sprites).toHaveLength(239);
    expect(board.plan.bordure).toBe(0);
    expect(worldPlan(board, 15)).toBe(planSize(15));
    expect(board.sprites).toHaveLength(26);
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
    const bridges = board.sprites.filter((s) => s.dessus && s.case).map((s) => `${s.case![0]},${s.case![1]}`);
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
      if (sprite.dessus || sprite.entre) continue;
      for (const [row, col] of sprite.empreinte ?? [sprite.case!]) {
        expect(getCell(BATTLEFIELD_15, { row, col }).kind, `${sprite.id} (${row}, ${col})`).toBe('blocked');
      }
    }
  });

  it('au centre de leur case, au milieu de deux cases pour un cadre de mine ; miroir conservé', () => {
    const placed = placePaintedSprites(board, 15, 15, false);
    expect(placed[0]).toMatchObject({ key: 'p0', id: 'hd_cristal_amas', x: center(9), y: center(0), mirror: false, flat: false, inBoard: true });
    expect(placed.find((s) => s.id === 'cadre_mine_1')).toMatchObject({ x: (center(8) + center(9)) / 2, y: center(1) });
    expect(placed.find((s) => s.topDown === 'colonnes')).toMatchObject({ id: 'hd_pont', x: center(5), y: center(13), mirror: false });
  });

  it('ancrés sur leur `case` : la forge au centre de sa dalle 2 × 2, un bâtiment sur sa case centrale, un champ au coin de ses 4 cases', () => {
    const placed = placePaintedSprites(full, 15, 15, false);
    expect(placed.find((s) => s.id === 'hd_forge')).toMatchObject({ x: (center(4) + center(5)) / 2, y: (center(4) + center(5)) / 2, inBoard: true });
    expect(placed.find((s) => s.id === 'hd_ecurie')).toMatchObject({ x: center(-3), y: center(5), inBoard: false });
    expect(placed.find((s) => s.id === 'hd_parcelle_ble')).toMatchObject({ x: center(18.5), y: center(10.5), inBoard: false });
    expect(placed.find((s) => s.id === 'potager')).toMatchObject({ x: center(16.5), y: center(8.5), inBoard: false });
  });

  it('échelle : 0,5 (images en densité 2) ou 0,398 (sprites HD, losange de 256 px), multipliée par `echelle` du décor', () => {
    const placed = placePaintedSprites(full, 15, 15, false);
    for (const [i, sprite] of full.sprites.entries()) {
      // Vu de dessus (le pont) : l'image ramenée à une case du plan.
      const expected = sprite.dessus ? full.plan.pas / SPRITES[sprite.id]![0] : spriteScale(sprite.id) * (sprite.echelle ?? 1);
      expect(placed[i]!.scale, sprite.id).toBeCloseTo(expected);
    }
    expect(full.sprites.some((s) => s.echelle !== undefined && s.echelle !== 1)).toBe(true);
    // Une case du plan (72 px de pas) fait 72 × √2 px de large à l'écran : le losange de 256 px des sprites HD s'y ramène.
    expect(HD_SPRITE_SCALE * 256).toBeCloseTo(72 * Math.SQRT2);
    expect(spriteScale('hd_arbre_rond')).toBe(HD_SPRITE_SCALE);
    expect(spriteScale('arbre_rond')).toBe(PAINTED_SPRITE_SCALE);
  });

  it('arbres verts : les six de la refonte, plus aucun ancien arbre, buisson ni sapin vert', () => {
    const ids = new Set(full.sprites.map((s) => s.id));
    for (const id of ['hd_arbre_rond', 'hd_arbre_dome', 'hd_arbre_haut', 'hd_grand_arbre', 'hd_petit_arbre', 'hd_sapin_vert']) expect(ids.has(id), id).toBe(true);
    expect([...ids].filter((id) => /^(arbre|buisson|sapin)_/.test(id))).toEqual([]);
  });

  it('sprites HD : jamais retournés (la lumière vient du haut à gauche), images présentes', () => {
    const hd = full.sprites.filter((s) => HD_SPRITE_IDS.has(s.id));
    expect(hd.length).toBeGreaterThan(80);
    for (const sprite of hd) expect(sprite.miroir ?? false, sprite.id).toBe(false);
  });

  it('herbe peinte posée en continu (motif 3 × 3, sans fleurs) ; cristaux vifs à 2 cases au moins de la zone de la Mine', () => {
    expect(full.herbe.motif).toHaveLength(9);
    for (const tile of full.herbe.motif!) expect(GROUND_IMAGES[tile], tile).toBeDefined();
    expect([...full.herbe.tuiles, ...full.herbe.motif!].some((t) => t.includes('fleurs'))).toBe(false);
    // Le sous-bois prolonge l'herbe à l'ombre : même motif, même filtre, sans terre ni ancienne herbe.
    for (const zone of full.zones.filter((z) => z.sol === 'sous_bois')) {
      expect(zone.motif).toEqual(full.herbe.motif);
      expect(zone.filtre).toBe(full.herbe.filtre);
      expect(zone.tuiles.some((t) => t.startsWith('terre') || t.startsWith('herbe_unie'))).toBe(false);
    }
    for (const sprite of board.sprites.filter((s) => s.id.startsWith('hd_cristal'))) {
      const [row, col] = sprite.case!;
      expect(Math.abs(row - 2) + Math.abs(col - 12), `${sprite.id} (${row}, ${col})`).toBeGreaterThanOrEqual(2);
    }
  });

  it('les ponts sont vus de dessus, à plat dans le sol (on marche dessus) ; les autres sprites, debout, ne passent jamais sous le sol', () => {
    const placed = placePaintedSprites(full, 15, 15, false);
    // Leurs longerons franchissent l'eau : le long des lignes en (9, 1), des colonnes en (13, 5).
    expect(placed.filter((s) => s.flat).map((s) => [s.id, s.topDown, s.x, s.y])).toEqual([
      ['hd_pont', 'lignes', center(1), center(9)],
      ['hd_pont', 'colonnes', center(5), center(13)],
    ]);
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

  it('lisibilité : l’amas du centre, réduit, au milieu de son carré ; aucun sprite du décor extérieur ne cache un jeton', () => {
    const placed = placePaintedSprites(full, 15, 15, false);
    const middle = (center(9) + center(10)) / 2;
    expect(placed.find((s) => s.id === 'hd_amas_blocs')).toMatchObject({ x: middle, y: middle, scale: HD_SPRITE_SCALE * 0.7, inBoard: true });
    // Le décor extérieur posé comme dans `IsoDecor` (iso, sol du monde : avancée par défaut hors du plateau).
    const hiding = spritesHiding(placed, full.plan, 15, 15, false, 'iso', (s) => (s.inBoard ? s.dz : STAND_DEPTH));
    const ring = new Set(placed.filter((s) => !s.inBoard).map((s) => s.key));
    for (const [cell, keys] of hiding) {
      const [row, col] = cell.split(',').map(Number) as [number, number];
      if (getCell(BATTLEFIELD_15, { row, col }).kind === 'blocked') continue;
      expect(keys.filter((key) => ring.has(key)).map((key) => placed[Number(key.slice(1))]!.id), cell).toEqual([]);
    }
  });
});

describe('décor qui s’efface devant un jeton', () => {
  const plan = paintedBoardDecor(BATTLEFIELD_15)!.plan;
  const at = (row: number, col: number, id = 'hd_sapin_haut', flat = false): PlacedSprite => ({
    key: `s${row}_${col}`,
    id,
    x: 14 + col * 72 + 34,
    y: 14 + row * 72 + 34,
    scale: HD_SPRITE_SCALE,
    mirror: false,
    flat,
    topDown: null,
    dz: 24,
    inBoard: true,
  });

  it('un grand sapin cache les jetons des cases derrière lui, jamais ceux de devant', () => {
    const hiding = spritesHiding([at(5, 5)], plan, 15, 15, false, 'iso');
    // Juste derrière à l'écran (une ligne et une colonne de moins), puis la suivante : 217 px de haut.
    expect(hiding.get('4,4')).toEqual(['s5_5']);
    expect(hiding.get('3,3')).toEqual(['s5_5']);
    expect(hiding.has('6,6')).toBe(false);
    expect(hiding.has('5,6')).toBe(false);
    // Un jeune sapin, bas, ne cache que la case juste derrière lui, et seulement en partie.
    expect(spritesHiding([at(5, 5, 'hd_jeune_sapin')], plan, 15, 15, false, 'iso').has('3,3')).toBe(false);
  });

  it('un sprite couché ne cache rien ; plateau retourné : les cases cachées restent données par leur position réelle', () => {
    expect(spritesHiding([at(5, 5, 'pont_c', true)], plan, 15, 15, false, 'iso').size).toBe(0);
    // Posé en (5, 5) à l'écran, plateau retourné : la case (4, 4) de l'écran est la (10, 10) réelle.
    expect(spritesHiding([at(5, 5)], plan, 15, 15, true, 'iso').get('10,10')).toEqual(['s5_5']);
  });

  it('vue inclinée : derrière, c’est la ligne du dessus', () => {
    const hiding = spritesHiding([at(5, 5)], plan, 15, 15, false, 'tilt');
    expect(hiding.get('4,5')).toEqual(['s5_5']);
    expect(hiding.has('6,5')).toBe(false);
  });
});
