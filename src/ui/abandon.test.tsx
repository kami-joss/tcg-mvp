import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { concede, createGame, getPlayerView } from '../engine';
import { VictoryOverlay, concessionText } from './VictoryOverlay';

// Écran de victoire d'une partie perdue par abandon ou par absence (parties en ligne, SPEC.md §7 ter).

const noop = () => {};

describe('écran de victoire', () => {
  it('dit pourquoi la partie a fini : abandon ou absence', () => {
    expect(concessionText({ player: 2, reason: 'abandon' })).toBe('Le Joueur 2 abandonne.');
    expect(concessionText({ player: 1, reason: 'absence' })).toBe('Le Joueur 1 a quitté la partie.');
    const html = renderToStaticMarkup(<VictoryOverlay view={getPlayerView(concede(createGame(), 2), 1)} onRestart={noop} onHome={noop} />);
    expect(html).toContain('Le Joueur 1 l’emporte');
    expect(html).toContain('<p class="overlay__reason">Le Joueur 2 abandonne.</p>');
  });

  it('sans « Rejouer » quand la partie ne se rejoue pas d’ici (en ligne)', () => {
    const view = getPlayerView(concede(createGame(), 2), 1);
    expect(renderToStaticMarkup(<VictoryOverlay view={view} onRestart={noop} onHome={noop} />)).toContain('Rejouer');
    expect(renderToStaticMarkup(<VictoryOverlay view={view} onHome={noop} />)).not.toContain('Rejouer');
  });
});
