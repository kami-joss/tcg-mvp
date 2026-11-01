import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, BATTLEFIELD_15, getPlayerView } from '../engine';
import type { PlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { Board } from './Board';
import { DECOR_FADE } from './iso/IsoDecor';
import type { BoardView } from './settings';

const render = (view: PlayerView, mode: BoardView, zoom = 1, margins?: { left: number; right: number }) =>
  renderToStaticMarkup(
    <Board
      view={view}
      highlights={new Map()}
      attacks={new Map()}
      selectedUnitId={null}
      focused={false}
      path={[]}
      reach={new Map()}
      showArt
      mode={mode}
      zoom={zoom}
      animated={false}
      flipped={false}
      margins={margins}
      onCellClick={() => {}}
      onCellHover={() => {}}
    />,
  );

const battlefield = (units: Parameters<typeof gameWith>[0] = []) =>
  getPlayerView(gameWith(units, { board: BATTLEFIELD }), 1);

describe('plateau : vues du handoff (lots 3 et 5)', () => {
  it('vue isométrique : décor, caméra iso, pas de falaises en barres', () => {
    const html = render(battlefield(), 'iso');
    expect(html).toContain('board--iso');
    expect(html).toContain('iso-decor');
    expect(html).toContain('rotateX(54.7356deg) rotateZ(45deg)');
    expect(html).not.toContain('class="cliff');
  });

  it('rivière : 4 cases X du Champ de bataille, dans toutes les vues', () => {
    const html = render(battlefield(), 'top');
    expect(html.match(/cell--water/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Rivière"');
  });

  it('terrain debout en vues inclinée et iso : un blason, petit sous un monstre ; à plat en vue de dessus', () => {
    const alone = battlefield([
      { terrain: 'bastion', owner: 1, at: at(2, 2) },
      { monster: 'chevalier', owner: 1, at: at(1, 9) },
      { terrain: 'autel-de-mana', owner: 1, at: at(1, 9) },
    ]);
    const tilted = render(alone, 'tilt');
    expect(tilted.match(/class="crest crest--p1"/g)).toHaveLength(1);
    expect(tilted.match(/class="crest crest--p1 is-small"/g)).toHaveLength(1);
    // Debout, c'est le blason qui porte l'identifiant du terrain (animations), plus la plaque au sol.
    expect(tilted).toContain('class="crest__body" data-tid="u1"');
    expect(render(alone, 'top')).not.toContain('crest');
  });

  it('zoom : la scène qui dépasse le cadre le fait défiler ; en vue de dessus, toute la scène grandit (ou rapetisse)', () => {
    expect(render(battlefield(), 'top', 1.5)).toContain('board-viewport is-scrollable');
    expect(render(battlefield(), 'top', 1.5)).toContain('overflow-x:auto;overflow-y:auto');
    expect(render(battlefield(), 'top', 1.5)).toContain('zoom:1.5');
    expect(render(battlefield(), 'top', 1)).not.toContain('is-scrollable');
    expect(render(battlefield(), 'top', 0.65)).toContain('zoom:0.65');
    expect(render(battlefield(), 'top', 0.65)).toContain('overflow-x:hidden;overflow-y:hidden');
  });
});

describe('marges de glisse (handoff V11, lot 13 §1)', () => {
  it('un espace vide de chaque côté de la scène, dans le cadre qui défile ; aucun sans marges', () => {
    const html = render(battlefield(), 'iso', 1, { left: 296, right: 316 });
    expect(html).toMatch(/<div class="board-viewport__glide" style="width:296px" aria-hidden="true"><\/div><div class="scene/);
    expect(html).toMatch(/<\/div><div class="board-viewport__glide" style="width:316px" aria-hidden="true"><\/div><\/div><\/div>$/);
    // Zone de 900 px de large : la scène iso calée sur sa largeur, plus les marges, la dépasse et le cadre défile.
    expect(html).toContain('overflow-x:auto');
    expect(render(battlefield(), 'iso')).not.toContain('board-viewport__glide');
  });
});

describe('décor peint qui s’efface (15 × 15, vue iso)', () => {
  const view = (units: Parameters<typeof gameWith>[0] = []) => getPlayerView(gameWith(units, { board: BATTLEFIELD_15 }), 1);
  const faded = (html: string) => html.match(new RegExp(`opacity:${DECOR_FADE}`, 'g'))?.length ?? 0;

  it('la forge s’efface devant un monstre posé derrière elle, pas devant un monstre ailleurs', () => {
    expect(faded(render(view([{ monster: 'chevalier', owner: 1, at: at(0, 0) }]), 'iso'))).toBe(0);
    // (4, 3), à gauche de la forge (4, 4)–(5, 5) : elle s'efface (sans animations, elle n'a pas de feu).
    expect(faded(render(view([{ monster: 'chevalier', owner: 1, at: at(4, 3) }]), 'iso'))).toBe(1);
  });

  it('plateau peint : quadrillage adouci (`board--painted`), seulement en vue décorée du 15 × 15', () => {
    expect(render(view(), 'iso')).toContain('board--painted');
    expect(render(view(), 'top')).not.toContain('board--painted');
    expect(render(battlefield(), 'iso')).not.toContain('board--painted');
  });

  it('la case survolée compte comme un jeton', () => {
    const html = renderToStaticMarkup(
      <Board
        view={view()}
        highlights={new Map()}
        attacks={new Map()}
        selectedUnitId={null}
        focused={false}
        path={[]}
        reach={new Map()}
        showArt
        mode="iso"
        zoom={1}
        animated={false}
        flipped={false}
        onCellClick={() => {}}
        onCellHover={() => {}}
        hovered={at(4, 3)}
      />,
    );
    expect(faded(html)).toBe(1);
  });
});

describe('plateau PixiJS (réglage expérimental, 15 × 15)', () => {
  const view = getPlayerView(gameWith([], { board: BATTLEFIELD_15 }), 1);
  const renderPixi = (board: PlayerView, mode: BoardView) =>
    renderToStaticMarkup(
      <Board
        view={board}
        highlights={new Map()}
        attacks={new Map()}
        selectedUnitId={null}
        focused={false}
        path={[]}
        reach={new Map()}
        showArt
        mode={mode}
        zoom={1}
        animated={false}
        flipped={false}
        pixi
        onCellClick={() => {}}
        onCellHover={() => {}}
      />,
    );

  it('le décor passe au canvas PixiJS (sous la scène) : plus de décor en HTML, les cases restent', () => {
    const html = renderPixi(view, 'iso');
    expect(html).toContain('class="pixi-board"');
    expect(html).toContain('scene--pixi');
    expect(html).not.toContain('iso-decor');
    expect(html.match(/data-cell=/g)).toHaveLength(15 * 15);
  });

  it('la vue inclinée revient à l’isométrique ; la vue de dessus et les autres plateaux restent en HTML', () => {
    expect(renderPixi(view, 'tilt')).toContain('board--iso');
    expect(renderPixi(view, 'top')).not.toContain('pixi-board');
    expect(renderPixi(getPlayerView(gameWith([], { board: BATTLEFIELD }), 1), 'iso')).not.toContain('pixi-board');
  });
});
