import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, BATTLEFIELD_15 } from '../../engine';
import { SPRITE_FX, isWaterPixel, scatter, spritePoint, waterPatches } from './ambience';
import { IsoDecor } from './IsoDecor';
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

  it('forge, cristaux, mana zones, nuages et rafales sur le 15 × 15 quand les animations sont permises', () => {
    const html = render(BATTLEFIELD_15, true);
    for (const name of ['ambEmber', 'ambSmoke', 'ambTwinkle', 'ambMote', 'ambCloud', 'ambGust']) expect(html, name).toContain(name);
    // Cinq mana zones, cinq particules chacune.
    expect(html.match(/ambMote/g)).toHaveLength(25);
  });

  it('rien sans animations, ni sur un plateau sans décor peint', () => {
    expect(render(BATTLEFIELD_15, false)).not.toMatch(/amb[A-Z]/);
    expect(render(BATTLEFIELD_13, true)).not.toMatch(/amb[A-Z]/);
  });
});
