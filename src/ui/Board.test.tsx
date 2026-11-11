import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, BATTLEFIELD_15, getPlayerView } from '../engine';
import type { PlayerView, Position } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { Board, revealCells } from './Board';
import type { BoardView } from './settings';

const render = (view: PlayerView, mode: BoardView, zoom = 1, margins?: { left: number; right: number }, hovered: Position | null = null) =>
  renderToStaticMarkup(
    <Board
      view={view}
      hovered={hovered}
      highlights={new Map()}
      attacks={new Map()}
      selectedUnitId={null}
      focused={false}
      path={[]}
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

describe('décor peint qui s’efface (15 × 15)', () => {
  it('cases à dégager : celles des unités que le joueur voit, et la case survolée', () => {
    const view = getPlayerView(gameWith([{ monster: 'chevalier', owner: 1, at: at(4, 3) }], { board: BATTLEFIELD_15 }), 1);
    expect([...revealCells(view, null)]).toEqual(['4,3']);
    expect([...revealCells(view, at(0, 0))].sort()).toEqual(['0,0', '4,3']);
  });
});

describe('plateau PixiJS (15 × 15)', () => {
  const view = getPlayerView(gameWith([], { board: BATTLEFIELD_15 }), 1);
  const renderPixi = (board: PlayerView, mode: BoardView) => render(board, mode);

  it('le décor passe au canvas PixiJS (sous la scène) : plus de décor en HTML, les cases restent', () => {
    const html = renderPixi(view, 'iso');
    expect(html).toContain('class="pixi-board"');
    expect(html).toContain('scene--pixi');
    expect(html).not.toContain('iso-decor');
    expect(html.match(/data-cell=/g)).toHaveLength(15 * 15);
  });

  it('les cases sont dessinées dans le canvas : en HTML, ni repères, ni nom de zone, ni surbrillances', () => {
    const html = renderPixi(view, 'iso');
    expect(html.match(/cell--pixi/g)).toHaveLength(15 * 15);
    for (const name of ['zone-label', 'cell__summon', 'cell__glow', 'hl-move', 'layer--dim']) expect(html, name).not.toContain(name);
    // En vue de dessus, tout reste en HTML (le nom d'une zone, au survol).
    const plain = render(view, 'top', 1, undefined, at(7, 7));
    expect(plain).toContain('zone-label');
    expect(plain).toContain('cell__summon');
    expect(plain).not.toContain('cell--pixi');
  });

  it('vue de dessus : le nom d’une mana zone seulement au survol de la zone (une de ses 9 cases en contestation)', () => {
    const labels = (html: string) => html.match(/class="zone-label">[^<]*/g)?.map((tag) => tag.replace('class="zone-label">', ''));
    expect(labels(render(view, 'top'))).toBeUndefined();
    expect(labels(render(view, 'top', 1, undefined, at(6, 6)))).toBeUndefined();
    expect(labels(render(view, 'top', 1, undefined, at(7, 7)))).toEqual(['Forge']);
    const contest = { ...view, mode: 'contestation' as const };
    expect(labels(render(contest, 'top', 1, undefined, at(6, 6)))).toEqual(['Forge']);
  });

  it('vue de dessus : l’icône de chaque mana zone au centre de sa case, toujours ; en isométrique, dans le canvas', () => {
    const plain = render(view, 'top');
    const zones = plain.match(/cell--mana/g)?.length ?? 0;
    expect(zones).toBeGreaterThan(0);
    expect(plain.match(/cell__zone-icon/g)).toHaveLength(zones);
    expect(render(view, 'iso')).not.toContain('cell__zone-icon');
  });

  it('les unités sont dessinées dans le canvas : pas de jeton, de blason ni de flèche en HTML', () => {
    const units = getPlayerView(
      gameWith(
        [
          { monster: 'chevalier', owner: 1, at: at(6, 6) },
          { terrain: 'bastion', owner: 1, at: at(8, 8) },
        ],
        { board: BATTLEFIELD_15 },
      ),
      1,
    );
    const html = renderPixi(units, 'iso');
    for (const name of ['class="token', 'crest', 'plaque', 'facing', 'token-shadow']) expect(html, name).not.toContain(name);
    expect(render(units, 'top')).toContain('class="token');
  });

  it('la vue inclinée revient à l’isométrique ; la vue de dessus et les autres plateaux restent en HTML', () => {
    expect(renderPixi(view, 'tilt')).toContain('board--iso');
    expect(renderPixi(view, 'top')).not.toContain('pixi-board');
    expect(renderPixi(getPlayerView(gameWith([], { board: BATTLEFIELD }), 1), 'iso')).not.toContain('pixi-board');
  });
});

describe('plateau : coût des cases d’aller (vue de dessus)', () => {
  it('la mobilité que coûte chaque case d’aller, en évidence sur le chemin', () => {
    const view = getPlayerView(gameWith([{ monster: 'milicien', owner: 1, at: at(4, 4) }], { board: BATTLEFIELD }), 1);
    const zones = {
      unitId: 'u1',
      moves: new Set(['3,4', '2,4']),
      moveCosts: new Map([['3,4', 1], ['2,4', 2]]),
      attacks: new Set<string>(),
      targets: new Set<string>(),
      danger: new Map(),
    };
    const html = renderToStaticMarkup(
      <Board
        view={view}
        highlights={new Map()}
        attacks={new Map()}
        selectedUnitId="u1"
        focused={false}
        path={[at(3, 4), at(2, 4)]}
        zones={zones}
        showArt
        mode="top"
        zoom={1}
        animated={false}
        flipped={false}
        onCellClick={() => {}}
        onCellHover={() => {}}
      />,
    );
    expect(html).toContain('<span class="layer zone-cost zone-cost--lit"><span>1</span></span>');
    expect(html).toContain('<span class="layer zone-cost"><span>2</span></span>');
    expect(html).not.toContain('zone-step'); // le numéro remplace le point du chemin
  });
});
