import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { GuideBanner } from './GuideBanner';
import { getHighlights } from './interaction';
import type { Selection } from './interaction';

// Bandeau guide : choix de la direction, puis de la distance, pour une zone en ligne (Raz de marée, Vent violent).

const view = getPlayerView(
  gameWith(
    [
      { monster: 'dragon-vent', owner: 1, at: at(8, 1), facing: 'up' },
      { monster: 'golem', owner: 2, at: at(8, 3) },
      { monster: 'golem', owner: 2, at: at(9, 1) },
    ],
    { players: { 1: { mana: 5 } } },
  ),
  1,
);
const render = (selection: Selection, flipped = false) =>
  renderToStaticMarkup(
    <GuideBanner
      view={view}
      selection={selection}
      highlights={getHighlights(view, selection)}
      helpOpen={false}
      onToggleHelp={() => {}}
      onToggleArt={null}
      onAction={() => {}}
      onSelect={() => {}}
      flipped={flipped}
      busy={false}
    />,
  );

describe('bandeau : zone en ligne', () => {
  it('d’abord la direction : un bouton par direction utile, à l’écran (plateau retourné compris)', () => {
    const html = render({ kind: 'unit', unitId: 'u1', mode: 'effect' });
    expect(html).toContain('Vent violent · 3 mana : choisis la direction.');
    expect(html).toContain('↓ Bas');
    expect(html).toContain('→ Droite');
    expect(html).not.toContain('↑ Haut');
    const flipped = render({ kind: 'unit', unitId: 'u1', mode: 'effect' }, true);
    expect(flipped).toContain('↑ Haut');
    expect(flipped).toContain('← Gauche');
  });

  it('puis la distance du recul, avec un retour au choix de la direction', () => {
    const html = render({ kind: 'areaDirection', unitId: 'u1', direction: 'right' });
    expect(html).toContain('Vent violent vers la droite : choisis la distance du recul.');
    for (const n of [1, 2, 3]) expect(html).toContain(`Recul de ${n}`);
    expect(html).toContain('Autre direction');
  });
});

describe('bandeau : tour de l’IA', () => {
  it('on la regarde jouer, sans bouton', () => {
    const watching = getPlayerView(gameWith([], { activePlayer: 2 }), 1);
    const html = renderToStaticMarkup(
      <GuideBanner
        view={watching}
        selection={{ kind: 'none' }}
        highlights={new Map()}
        helpOpen={false}
        onToggleHelp={() => {}}
        onToggleArt={null}
        onAction={() => {}}
        onSelect={() => {}}
        flipped={false}
        busy={false}
      />,
    );
    expect(html).toContain('Le Joueur 2 joue…');
    expect(html).not.toContain('<button');
  });
});
