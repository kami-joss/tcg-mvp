import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, getPlayerView } from '../engine';
import type { PlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { Board } from './Board';
import type { BoardView } from './settings';

const render = (view: PlayerView, mode: BoardView, zoom = 1) =>
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

  it('zoom au-delà de 100 % : fenêtre défilante ; en vue de dessus, toute la scène grandit', () => {
    expect(render(battlefield(), 'top', 1.5)).toContain('board-viewport is-zoomed');
    expect(render(battlefield(), 'top', 1.5)).toContain('zoom:1.5');
    expect(render(battlefield(), 'top', 1)).not.toContain('is-zoomed');
  });
});
