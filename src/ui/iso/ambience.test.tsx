import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_15 } from '../../engine';
import {
  EMBER,
  MOTE,
  SMOKE,
  SPRITE_FX,
  cloudAt,
  flick,
  groundAmbience,
  isWaterPixel,
  patchMatrix,
  pulse,
  riser,
  scatter,
  spritePoint,
  twinkle,
  waterPatches,
} from './ambience';
import type { Matrix2D } from './ambience';
import { paintedBoardDecor, paintedDecor, placePaintedSprites, spritesHiding } from './paintedDecor';
import { SPRITES } from './scenery';

const decor = paintedBoardDecor(BATTLEFIELD_15)!;

describe('ambiance du décor peint : calculs', () => {
  it('eau : bleu franc seulement, pas les berges, le bois ni les nénuphars', () => {
    expect(isWaterPixel(60, 170, 220, 255)).toBe(true);
    expect(isWaterPixel(150, 110, 70, 255)).toBe(false); // planche
    expect(isWaterPixel(90, 160, 60, 255)).toBe(false); // nénuphar
    expect(isWaterPixel(60, 170, 220, 80)).toBe(false); // bord transparent
  });

  it('pièces d’eau aux places où `buildGround` les peint (case de 72 px, gouttière comprise)', () => {
    const patches = waterPatches(decor);
    expect(patches).toHaveLength(decor.decals.length);
    expect(patches[0]).toEqual({
      key: 'w0',
      image: 'canal_2cases_a',
      x: 14 + 5 * 72 - 2,
      y: 14 + 11 * 72 - 2,
      width: 72,
      height: 144,
      transposed: false,
      mirrored: false,
      kind: 'canal',
    });
    // Les pièces de canal alternent bout pour bout : chaque raccord se fait entre deux bouts identiques.
    expect(patches.map((p) => p.mirrored)).toEqual([false, true, false, true, false, false]);
    expect(patches.filter((p) => p.transposed).map((p) => p.image)).toEqual(['canal_2cases_b', 'canal_2cases_b']);
    expect(patches.filter((p) => p.kind === 'pond')).toHaveLength(2);
  });

  it('feu et fumée de la forge, cristaux : des points de leur image, autour de l’ancre (retournés avec le sprite)', () => {
    for (const [id, fx] of Object.entries(SPRITE_FX)) {
      const [w, h] = SPRITES[id]!;
      for (const [x, y] of [fx.fire, fx.smoke].filter((p) => p !== undefined)) expect(x >= 0 && x <= w && y >= 0 && y <= h, id).toBe(true);
    }
    expect(spritePoint('hd_forge', SPRITE_FX.hd_forge!.fire!, 0.5, false)).toEqual([-41.5, -35.5]);
    expect(spritePoint('hd_forge', SPRITE_FX.hd_forge!.fire!, 0.5, true)).toEqual([41.5, -35.5]);
    // Le moyeu des ailes du moulin : sur le bout d'axe, dans l'image de la tour.
    const [w, h] = SPRITES.hd_moulin!;
    const [x, y] = SPRITE_FX.hd_moulin!.sails!.hub;
    expect(x >= 0 && x <= w && y >= 0 && y <= h).toBe(true);
    expect(SPRITES[SPRITE_FX.hd_moulin!.sails!.image]).toBeDefined();
  });

  it('particules tirées une fois : toujours les mêmes, dans [0, 1[', () => {
    expect(scatter(7, 6)).toEqual(scatter(7, 6));
    for (const { u, v, phase } of scatter(7, 50)) for (const n of [u, v, phase]) expect(n >= 0 && n < 1).toBe(true);
  });
});

describe('ambiance au sol (canvas PixiJS) : calculs', () => {
  const B = 1104;
  const apply = ([a, b, c, d, tx, ty]: Matrix2D, x: number, y: number) => [a * x + c * y + tx, b * x + d * y + ty];

  it('pièce d’eau posée comme `buildGround` la peint : retournée bout pour bout, puis transposée', () => {
    const patch = { key: 'w', image: 'canal', x: 100, y: 200, width: 72, height: 144, kind: 'canal' as const };
    const corner = (m: Matrix2D) => [apply(m, 0, 0), apply(m, 72, 0), apply(m, 0, 144)];
    expect(corner(patchMatrix({ ...patch, transposed: false, mirrored: false }))).toEqual([[100, 200], [172, 200], [100, 344]]);
    // Retournée : le haut de la pièce (y = 0) est en bas.
    expect(corner(patchMatrix({ ...patch, transposed: false, mirrored: true }))).toEqual([[100, 344], [172, 344], [100, 200]]);
    // Transposée : la longueur de la pièce suit les colonnes.
    expect(corner(patchMatrix({ ...patch, transposed: true, mirrored: false }))).toEqual([[100, 200], [100, 272], [244, 200]]);
    expect(corner(patchMatrix({ ...patch, transposed: true, mirrored: true }))).toEqual([[244, 200], [244, 272], [100, 200]]);
  });

  it('eau du plateau : canal rapide et franc, étang lent et discret, trois scintillements sur chaque pièce', () => {
    const scene = groundAmbience(decor, B, []);
    expect(scene.water).toHaveLength(decor.decals.length);
    const canal = scene.water.find((w) => w.image.startsWith('canal'))!;
    const pond = scene.water.find((w) => w.image.startsWith('etang'))!;
    expect([canal.flowPeriod, canal.driftPeriod, canal.strength]).toEqual([2.6, 5, 0.42]);
    expect([pond.flowPeriod, pond.driftPeriod, pond.strength]).toEqual([8, 13, 0.2]);
    for (const layer of scene.water) {
      expect(layer.glints).toHaveLength(3);
      for (const g of layer.glints) expect(g.x > 0 && g.x < layer.width && g.y > 0 && g.y < layer.height).toBe(true);
    }
    // Trois ombres de nuages (plus de rafales de vent).
    expect(scene.clouds).toHaveLength(3);
    expect(scene).not.toHaveProperty('gusts');
  });

  it('emprise : le plateau seul, ou le plateau et l’eau du décor extérieur (de l’autre côté si le plateau est retourné)', () => {
    expect(groundAmbience(decor, B, []).bounds).toEqual({ x: 0, y: 0, width: B, height: B });
    const world = groundAmbience(paintedDecor(BATTLEFIELD_15)!, B, []);
    expect(world.bounds.x).toBeLessThan(0);
    expect(world.bounds.y + world.bounds.height).toBeGreaterThan(B);
    const turned = groundAmbience(paintedDecor(BATTLEFIELD_15)!, B, [], true);
    expect(turned.bounds.x + turned.bounds.width).toBe(B - world.bounds.x);
    expect(turned.bounds.y).toBe(B - (world.bounds.y + world.bounds.height));
  });

  it('mouvements des anciennes keyframes : halo qui respire, nuage qui traverse', () => {
    expect(pulse(0, 3.2)).toBeCloseTo(0.45, 5);
    expect(pulse(1.6, 3.2)).toBeCloseTo(1, 5);
    const cloud = { top: 0, width: 560, height: 340, x0: -620, x1: 1144, dy: 60, period: 100, delay: 0 };
    expect(cloudAt(cloud, 0)).toEqual({ x: -620, y: 0 });
    expect(cloudAt(cloud, 50)).toEqual({ x: 262, y: 30 });
  });
});

describe('décor peint qui s’efface (plateau PixiJS)', () => {
  it('la forge s’efface devant un jeton posé derrière elle, en (4, 3), pas devant un jeton ailleurs', () => {
    const placed = placePaintedSprites(decor, 15, 15, false);
    const hiding = spritesHiding(placed, decor.plan, 15, 15, false, 'iso');
    const forge = placed.find((sprite) => SPRITE_FX[sprite.id]?.fire)!;
    expect(hiding.get('4,3')).toContain(forge.key);
    for (const cell of ['0,0', '13,13']) expect(hiding.get(cell) ?? []).not.toContain(forge.key);
  });
});

describe('ambiance debout (plateau PixiJS) : mouvements des anciennes keyframes', () => {
  it('éclat : éteint jusqu’à 60 % de sa période, plein à 78 %, éteint à la fin', () => {
    expect(twinkle(0.5, 1, 0)).toEqual({ alpha: 0, scale: 0.3 });
    expect(twinkle(0.78, 1, 0).alpha).toBeCloseTo(1, 5);
    expect(twinkle(0.78, 1, 0).scale).toBeCloseTo(1, 5);
    expect(twinkle(0.999, 1, 0).alpha).toBeLessThan(0.01);
  });

  it('braise, fumée, particule : montent en s’effaçant, la fumée grossit', () => {
    const start = riser(0, 2, 0, { sx: 10, ...EMBER });
    expect(start).toEqual({ x: 0, y: -0, alpha: 0, scale: 1 });
    const peak = riser(0.3, 2, 0, { sx: 10, ...EMBER });
    expect(peak.alpha).toBeCloseTo(1, 5);
    const end = riser(1.999, 2, 0, { sx: 10, ...EMBER });
    expect(end.x).toBeCloseTo(10, 1);
    expect(end.y).toBeCloseTo(-48, 1);
    expect(end.alpha).toBeLessThan(0.01);
    expect(riser(0.999, 1, 0, { sx: 0, ...SMOKE }).scale).toBeCloseTo(2.4, 2);
    expect(riser(0.25, 1, 0, { sx: 0, ...MOTE }).alpha).toBeCloseTo(0.95, 5);
  });

  it('flamme : aller-retour de (1, 1) à (0,86, 1,2) toutes les 0,6 s', () => {
    expect(flick(0)).toEqual({ sx: 1, sy: 1 });
    const mid = flick(0.3);
    expect(mid.sx).toBeCloseTo(0.86, 5);
    expect(mid.sy).toBeCloseTo(1.2, 5);
  });
});
