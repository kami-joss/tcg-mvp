import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, applyAction, getPlayerView } from '../engine';
import type { PlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { Board, dropPath, statsAbove } from './Board';
import { ALL_TOKEN_STATS, DEFAULT_TOKEN_STATS } from './settings';
import type { BoardView, TokenStats } from './settings';

// Jetons lisibles (handoff, lot 6) : goutte orientée, stats au choix du joueur, menu « Stats ».

interface RenderOptions {
  mode?: BoardView;
  stats?: TokenStats;
  flipped?: boolean;
}

const render = (view: PlayerView, { mode = 'top', stats = DEFAULT_TOKEN_STATS, flipped = false }: RenderOptions = {}) =>
  renderToStaticMarkup(
    <Board
      view={view}
      highlights={new Map()}
      attacks={new Map()}
      selectedUnitId={null}
      focused={false}
      path={[]}
      showArt
      mode={mode}
      zoom={1}
      animated={false}
      flipped={flipped}
      stats={stats}
      onCellClick={() => {}}
      onCellHover={() => {}}
    />,
  );

/** Un Apprenti a brûlé le Golem (burn 1). */
const applyBurn = () => {
  const state = gameWith([
    { monster: 'apprenti', owner: 1, at: at(1, 1) },
    { monster: 'golem', owner: 2, at: at(1, 3) },
  ]);
  return getPlayerView(applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false }), 1);
};

/** Coordonnées de la pointe de la (première) goutte. */
const tipOf = (html: string) => html.match(/class="token__rim" d="M([-\d.]+) ([-\d.]+)/)!.slice(1).map(Number);

describe('goutte : la pointe donne l’orientation', () => {
  it('pointe en haut, à droite, en bas, à gauche', () => {
    expect(dropPath(0).startsWith('M50.00 -20.71')).toBe(true);
    expect(dropPath(90).startsWith('M120.71 50.00')).toBe(true);
    expect(dropPath(180).startsWith('M50.00 120.71')).toBe(true);
    expect(dropPath(270).startsWith('M-20.71 50.00')).toBe(true);
  });

  it('les stats passent au-dessus quand la pointe descend', () => {
    for (const angle of [0, 60, 90, 270, 300]) expect(statsAbove(angle), String(angle)).toBe(false);
    for (const angle of [120, 180, 240]) expect(statsAbove(angle), String(angle)).toBe(true);
  });

  it('sur le plateau : sens du monstre, inversé avec le plateau, angles propres à la vue iso', () => {
    const view = getPlayerView(gameWith([{ monster: 'chevalier', owner: 1, at: at(2, 2), facing: 'down' }]), 1);
    expect(tipOf(render(view))).toEqual([50, 120.71]);
    expect(render(view)).toContain('class="token__stats is-above"');
    expect(tipOf(render(view, { flipped: true }))).toEqual([50, -20.71]);
    // Iso (Champ de bataille) : « bas » est à 240°.
    const field = getPlayerView(
      gameWith([{ monster: 'chevalier', owner: 1, at: at(2, 2), facing: 'down' }], { board: BATTLEFIELD }),
      1,
    );
    expect(tipOf(render(field, { mode: 'iso' }))).toEqual([-11.24, 85.36]);
  });
});

describe('stats sur les jetons', () => {
  const view = getPlayerView(
    gameWith([
      { monster: 'chevalier', owner: 1, at: at(2, 2), facing: 'up' },
      { monster: 'golem', owner: 2, at: at(2, 6) },
    ]),
    1,
  );
  const count = (html: string, kind: string) => html.match(new RegExp(`class="stat stat--${kind}[ "]`, 'g'))?.length ?? 0;

  it('par défaut : PV partout, mobilité restante de mes monstres seulement, pas d’attaque', () => {
    const html = render(view);
    expect(count(html, 'hp')).toBe(2);
    expect(count(html, 'mob')).toBe(1);
    expect(html).toContain('class="stat stat--mob is-mine"');
    expect(count(html, 'atk')).toBe(0);
    expect(html).not.toContain('is-arc');
  });

  it('tout affiché (Alt) : trois pastilles en arc sur chaque jeton', () => {
    const html = render(view, { stats: ALL_TOKEN_STATS });
    for (const kind of ['hp', 'mob', 'atk']) expect(count(html, kind), kind).toBe(2);
    expect(html.match(/is-arc/g)).toHaveLength(2);
  });

  it('rien de coché : aucune pastille ni statut', () => {
    const burnt = applyBurn();
    expect(render(burnt)).toContain('status--burn');
    const none: TokenStats = { hp: false, mobility: false, enemyMobility: false, atk: false, statuses: false };
    const html = render(burnt, { stats: none });
    expect(html).not.toContain('class="stat ');
    expect(html).not.toContain('status--burn');
  });
});

describe('pastille « encore possible ce tour » (option J du 2026-11-11)', () => {
  it('au-dessus de ses jetons qui peuvent encore attaquer ou lancer un effet, jamais sur ceux de l’adversaire', () => {
    const state = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'golem', owner: 2, at: at(8, 2) },
    ]);
    const html = render(getPlayerView(state, 1));
    expect(html.match(/class="token__ready( is-high)?"/g)).toHaveLength(1);
    expect(html).toMatch(/class="token__ready[^"]*"[^>]*>.*?token__ready-attack/);
    const done = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1), hasAttacked: true },
      { monster: 'golem', owner: 2, at: at(8, 2) },
    ]);
    expect(render(getPlayerView(done, 1))).not.toContain('token__ready');
  });
});
