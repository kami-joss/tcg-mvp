import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame, getPlayerView } from '../engine';
import type { GameState } from '../engine';
import { GRIMOIRE_DISPLAY, Grimoire, GrimoireTab } from './Grimoire';
import type { GrimoireLayout } from './settings';

const render = (layout: GrimoireLayout, state: GameState = createGame()) =>
  renderToStaticMarkup(
    <Grimoire
      view={getPlayerView(state, 1)}
      selectedCard={null}
      layout={layout}
      onLayout={() => {}}
      onCardClick={() => {}}
      onCardHover={() => {}}
    />,
  );

describe('grimoire : affichages', () => {
  it('quatre boutons d’affichage, celui en cours enfoncé', () => {
    const html = render('grid3');
    for (const label of ['3 cartes par ligne', '2 cartes par ligne', '1 carte par ligne', 'Liste']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html.match(/aria-pressed="true" aria-label|aria-label="[^"]*" aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="3 cartes par ligne" aria-pressed="true"/);
  });

  it('tuiles à 3, 2 ou 1 par ligne, avec illustration ; la colonne s’élargit avec le nombre de cartes par ligne', () => {
    for (const [layout, columns] of [['grid3', 3], ['grid2', 2], ['grid1', 1]] as const) {
      const html = render(layout);
      expect(html).toContain(`--grimoire-cols:${columns}`);
      expect(html).toContain('tile__art');
      expect(html).not.toContain('tile--row');
    }
    expect(GRIMOIRE_DISPLAY.grid3.width).toBeGreaterThan(GRIMOIRE_DISPLAY.grid2.width);
    expect(GRIMOIRE_DISPLAY.grid2.width).toBeGreaterThan(GRIMOIRE_DISPLAY.grid1.width);
  });

  it('vue liste : une ligne par carte, sans illustration, mêmes cartes cliquables', () => {
    const list = render('list');
    const tiles = render('grid2');
    expect(list).toContain('grimoire--list');
    expect(list).not.toContain('tile__art');
    expect(list.match(/data-card=/g)).toHaveLength(tiles.match(/data-card=/g)!.length);
    expect(list.match(/class="tile tile--\w+ tile--row/g)).toHaveLength(tiles.match(/data-card=/g)!.length);
  });

  it('tuiles teintées selon le type de carte', () => {
    const html = render('grid2');
    expect(html).toContain('tile tile--monster');
    expect(html).toContain('tile tile--spell');
  });
});

describe('grimoire : trois sections', () => {
  it('monstres, sorts, terrains, dans cet ordre, avec le nombre de cartes de chacune ; chaque carte dans la sienne', () => {
    for (const layout of ['grid2', 'list'] as const) {
      const html = render(layout);
      const titles = [...html.matchAll(/<h3 class="grimoire__heading">.*?<\/svg>(\w+)<span class="panel__count">(\d+)<\/span><\/h3>/g)];
      expect(titles.map((m) => [m[1], m[2]])).toEqual([
        ['Monstres', '16'],
        ['Sorts', '4'],
        ['Terrains', '5'],
      ]);
      const section = (kind: string) => html.split(`grimoire__section--${kind}`)[1]!.split('</section>')[0]!;
      expect(section('monster')).toContain('data-card="golem"');
      expect(section('monster')).not.toContain('data-card="charge"');
      expect(section('spell')).toContain('data-card="charge"');
      expect(section('terrain')).toContain('data-card="bastion"');
      expect(section('terrain')).toContain('data-card="zone-invocation"');
    }
  });

  it('une section vide disparaît', () => {
    const state = createGame();
    const spells = ['boule-de-feu', 'charge', 'bourrasque', 'benediction'];
    const player = { ...state.players[1], grimoire: state.players[1].grimoire.filter((id) => !spells.includes(id)) };
    const html = render('grid2', { ...state, players: { ...state.players, 1: player } });
    expect(html).not.toContain('grimoire__section--spell');
    expect(html).toContain('grimoire__section--monster');
    expect(html).toContain('grimoire__section--terrain');
  });
});

describe('onglet du grimoire (handoff V11, lot 13 §4)', () => {
  it('replier ou rouvrir : libellé et état', () => {
    const open = renderToStaticMarkup(<GrimoireTab open onToggle={() => {}} />);
    expect(open).toContain('aria-expanded="true" aria-label="Replier le grimoire"');
    const closed = renderToStaticMarkup(<GrimoireTab open={false} onToggle={() => {}} />);
    expect(closed).toContain('aria-expanded="false" aria-label="Ouvrir le grimoire"');
  });
});
