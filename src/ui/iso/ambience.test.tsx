import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, BATTLEFIELD_15 } from '../../engine';
import {
  EMBER,
  MOTE,
  SMOKE,
  SPRITE_FX,
  cloudAt,
  flick,
  groundAmbience,
  gustAt,
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
import { AmbienceCanvas } from './AmbienceCanvas';
import { DECOR_FADE, IsoDecor } from './IsoDecor';
import { paintedBoardDecor, paintedDecor } from './paintedDecor';
import { SPRITES, isoScenery } from './scenery';

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
    expect(spritePoint('forge_rochers', SPRITE_FX.forge_rochers!.fire!, 0.5, false)).toEqual([-14.5, -12]);
    expect(spritePoint('forge_rochers', SPRITE_FX.forge_rochers!.fire!, 0.5, true)).toEqual([14.5, -12]);
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
    // Trois ombres de nuages et six rafales, comme avant.
    expect([scene.clouds.length, scene.gusts.length]).toEqual([3, 6]);
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

  it('mouvements des anciennes keyframes : halo qui respire, nuage qui traverse, rafale qui file puis s’efface', () => {
    expect(pulse(0, 3.2)).toBeCloseTo(0.45, 5);
    expect(pulse(1.6, 3.2)).toBeCloseTo(1, 5);
    const cloud = { top: 0, width: 560, height: 340, x0: -620, x1: 1144, dy: 60, period: 100, delay: 0 };
    expect(cloudAt(cloud, 0)).toEqual({ x: -620, y: 0 });
    expect(cloudAt(cloud, 50)).toEqual({ x: 262, y: 30 });
    const gust = { top: 0, width: 150, x0: 0, x1: 300, period: 10, delay: 0 };
    expect(gustAt(gust, 0)).toEqual({ x: 0, alpha: 0 });
    expect(gustAt(gust, 0.8).alpha).toBeCloseTo(1, 5);
    expect(gustAt(gust, 3)).toEqual({ x: 300, alpha: 0 });
    expect(gustAt(gust, 7).alpha).toBe(0);
  });
});

describe('ambiance du décor peint : rendu', () => {
  const render = (board: typeof BATTLEFIELD_15, animated: boolean) =>
    renderToStaticMarkup(
      <IsoDecor
        board={board}
        scenery={isoScenery(board)!}
        flipped={false}
        controllers={new Map()}
        animated={animated}
        painted={paintedDecor(board) !== null}
        ground={null}
      />,
    );

  it('15 × 15, animations permises : forge, cristaux et particules des mana zones en CSS ; le reste dans un canvas', () => {
    const html = render(BATTLEFIELD_15, true);
    for (const name of ['ambEmber', 'ambSmoke', 'ambTwinkle', 'ambMote']) expect(html, name).toContain(name);
    // Eau, halos, nuages et rafales : plus d'éléments animés, un seul calque dessiné par PixiJS.
    for (const name of ['ambFlow', 'ambDrift', 'ambCloud', 'ambGust', 'ambPulse 3.2s']) expect(html, name).not.toContain(name);
    expect(html.match(/data-ambience/g)).toHaveLength(1);
    // Allégé : trois particules par mana zone (cinq zones), deux éclats par sprite de cristaux.
    expect(html.match(/ambMote/g)).toHaveLength(15);
    const crystals = paintedBoardDecor(BATTLEFIELD_15)!.sprites.filter((s) => SPRITE_FX[s.id]?.crystals).length;
    expect(html.match(/ambTwinkle/g)).toHaveLength(2 * crystals);
  });

  it('le canvas couvre l’emprise de l’ambiance, dans le plan du sol, sans capter la souris (PixiJS se charge ensuite)', () => {
    const scene = groundAmbience(paintedDecor(BATTLEFIELD_15)!, 1104, []);
    const html = renderToStaticMarkup(<AmbienceCanvas scene={scene} masks={{}} depth={-0.75} />);
    const { x, y, width, height } = scene.bounds;
    expect(html).toBe(
      `<div data-ambience="" aria-hidden="true" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;transform:translateZ(-0.75px);pointer-events:none"></div>`,
    );
  });

  it('rien sans animations, ni sur un plateau sans décor peint', () => {
    for (const html of [render(BATTLEFIELD_15, false), render(BATTLEFIELD_13, true)]) {
      expect(html).not.toMatch(/amb[A-Z]/);
      expect(html).not.toContain('data-ambience');
    }
  });

  it('un sprite peint s’efface quand il cache un jeton ou la case survolée, et seulement lui', () => {
    const html = (reveal?: ReadonlySet<string>) =>
      renderToStaticMarkup(
        <IsoDecor board={BATTLEFIELD_15} scenery={isoScenery(BATTLEFIELD_15)!} flipped={false} controllers={new Map()} animated painted reveal={reveal} />,
      );
    const faded = (markup: string) => markup.match(new RegExp(`opacity:${DECOR_FADE}`, 'g'))?.length ?? 0;
    expect(faded(html())).toBe(0);
    expect(faded(html(new Set(['0,0', '13,13'])))).toBe(0);
    // La case (4, 3), devant la forge à gauche : la forge s'efface, avec son feu et sa fumée.
    expect(faded(html(new Set(['4,3'])))).toBe(2);
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
