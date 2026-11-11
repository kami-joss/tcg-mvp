import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import { HomeScreen } from './HomeScreen';
import { setupFromQuery, setupToQuery } from './routes';
import { DEFAULT_SETUP, isVictoryChoice, newSession, startLog } from './session';
import { ScoreBox } from './ScoreBox';

// VP pour gagner, choisis à l'accueil (SPEC.md §4.10, §10, 2026-11-10) : de 10 à 50, de 5 en 5, 30 par défaut.

describe('VP pour gagner', () => {
  it('l’accueil les règle avec − et +, dans la section Mode', () => {
    const html = renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={() => {}} />);
    expect(html).toContain('Victoire');
    expect(html).toContain('Le premier à 30 VP gagne la partie.');
    const low = renderToStaticMarkup(<HomeScreen initial={{ ...DEFAULT_SETUP, victoryVp: 10 }} onStart={() => {}} />);
    expect(low).toMatch(/aria-label="VP pour gagner : moins" disabled=""/);
    expect(low).toContain('Le premier à 10 VP gagne la partie.');
  });

  it('de 10 à 50, de 5 en 5', () => {
    expect([10, 15, 30, 50].every(isVictoryChoice)).toBe(true);
    expect([5, 12, 55, 30.5, '30'].some(isVictoryChoice)).toBe(false);
  });

  it('dans l’adresse seulement s’ils ne sont pas 30 ; une valeur hors des choix est ignorée', () => {
    expect(setupToQuery(DEFAULT_SETUP)).not.toContain('vp=');
    const query = setupToQuery({ ...DEFAULT_SETUP, victoryVp: 20 });
    expect(query).toContain('vp=20');
    expect(setupFromQuery(query).victoryVp).toBe(20);
    expect(setupFromQuery('?vp=12').victoryVp).toBeUndefined();
  });

  it('la partie les prend ; la barre du haut et le journal du début les disent', () => {
    const session = newSession(1, { ...DEFAULT_SETUP, victoryVp: 20 });
    expect(session.game.victoryVp).toBe(20);
    const view = getPlayerView(session.game, 1);
    expect(renderToStaticMarkup(<ScoreBox view={view} player={1} deckName="Classique" ai={false} animated={false} pile={null} onPile={() => {}} />)).toContain('/20 VP');
    expect(startLog({ ...DEFAULT_SETUP, victoryVp: 20 }, session.game, null, 1)[0]!.text).toContain(', 20 VP pour gagner');
    expect(startLog(DEFAULT_SETUP, newSession(1).game, null, 1)[0]!.text).not.toContain('VP pour gagner');
  });
});
