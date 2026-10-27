import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, getPlayerView } from '../engine';
import type { PlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { Board } from './Board';
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
