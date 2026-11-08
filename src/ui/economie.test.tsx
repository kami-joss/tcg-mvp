import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeScreen } from './HomeScreen';
import { ManaOrb } from './ManaOrb';
import { setupFromQuery, setupToQuery } from './routes';
import { DEFAULT_SETUP, newSession } from './session';

// Option « Économie » de l'accueil (SPEC.md §10, 2026-11-08) : Classique (la règle d'origine) ou Réserve.

describe('option Économie', () => {
  it('l’accueil propose Classique (par défaut) et Réserve, avec la règle en une phrase', () => {
    const html = renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={() => {}} />);
    expect(html).toContain('Économie');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Classique/);
    expect(html).toContain('Le mana non dépensé est perdu.');
    const reserve = renderToStaticMarkup(<HomeScreen initial={{ ...DEFAULT_SETUP, economy: 'reserve' }} onStart={() => {}} />);
    expect(reserve).toMatch(/aria-pressed="true"[^>]*>Réserve/);
    expect(reserve).toContain('Réserve limitée à 10, +1 par terrain posé.');
  });

  it('dans l’adresse : `eco=reserve`, rien pour la classique', () => {
    expect(setupToQuery(DEFAULT_SETUP)).not.toContain('eco=');
    const query = setupToQuery({ ...DEFAULT_SETUP, economy: 'reserve' });
    expect(query).toContain('eco=reserve');
    expect(setupFromQuery(query).economy).toBe('reserve');
    expect(setupFromQuery('').economy ?? 'classic').toBe('classic');
  });

  it('la partie se crée avec l’économie choisie, et le journal le dit', () => {
    const session = newSession(1, { ...DEFAULT_SETUP, economy: 'reserve' });
    expect(session.game.economy).toBe('reserve');
    expect(session.log[0]!.text).toContain('économie Réserve');
    expect(newSession(1, DEFAULT_SETUP).game.economy).toBe('classic');
  });

  it('l’orbe de mana est pleine à la limite de la réserve', () => {
    const level = (html: string) => html.match(/orb__liquid" style="height:([\d.]+)%/)![1];
    expect(level(renderToStaticMarkup(<ManaOrb player={1} mana={5} active animated={false} />))).toBe('50.0');
    expect(level(renderToStaticMarkup(<ManaOrb player={1} mana={6} active animated={false} limit={12} />))).toBe('50.0');
  });
});
