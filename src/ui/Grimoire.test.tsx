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
  it('deux boutons d’affichage (refonte du 2026-11-11), celui en cours enfoncé', () => {
    const html = render('grid2');
    for (const label of ['Tuiles', 'Liste']) expect(html).toContain(`aria-label="${label}"`);
    expect(html.match(/aria-pressed="true" aria-label|aria-label="[^"]*" aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="Tuiles" aria-pressed="true"/);
  });

  it('tuiles illustrées, 2 par ligne', () => {
    const html = render('grid2');
    expect(html).toContain('--grimoire-cols:2');
    expect(html).toContain('tile__art');
    expect(html).not.toContain('tile--row');
    expect(GRIMOIRE_DISPLAY.list.width).toBe(300);
  });

  it('vue liste : une ligne par carte avec sa vignette, mêmes cartes cliquables', () => {
    const list = render('list');
    const tiles = render('grid2');
    expect(list).toContain('grimoire--list');
    expect(list).not.toContain('tile__art');
    expect(list.match(/class="tile__thumb"/g)).toHaveLength(tiles.match(/data-card=/g)!.length);
    expect(list.match(/data-card=/g)).toHaveLength(tiles.match(/data-card=/g)!.length);
    expect(list.match(/class="tile tile--\w+ tile--row/g)).toHaveLength(tiles.match(/data-card=/g)!.length);
  });

  it('vue liste : une carte injouable dit pourquoi, à la place de ses stats, monstres compris (la fiche ne le dit plus)', () => {
    const list = render('list');
    const spells = list.split('grimoire__section--spell')[1]!.split('</section>')[0]!;
    expect(spells).toMatch(/class="tile__note tile__reason tone--\w+">[^<]+</);
    const monsters = list.split('grimoire__section--monster')[1]!.split('</section>')[0]!;
    expect(monsters).toMatch(/class="tile__note tile__reason tone--warn">Il te manque \d mana</);
    const tiles = render('grid2').split('grimoire__section--monster')[1]!.split('</section>')[0]!;
    expect(tiles).toContain('tile__stats');
    expect(tiles).toMatch(/class="tile__note tile__reason tone--warn">Il te manque \d mana</);
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
