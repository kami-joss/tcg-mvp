import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import { HomeScreen } from './HomeScreen';
import { ManaOrb } from './ManaOrb';
import { setupFromQuery, setupToQuery } from './routes';
import { DEFAULT_SETUP, newSession } from './session';

// Option « Économie » de l'accueil (SPEC.md §10, 2026-11-08) : Classique (la règle d'origine) ou Réserve ; dans les deux,
// la génération max et la limite du mana se règlent (5 et 10 par défaut).

describe('option Économie', () => {
  it('l’accueil propose Classique (par défaut) et Réserve, avec la règle en une phrase', () => {
    const html = renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={() => {}} />);
    expect(html).toContain('Économie');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Classique/);
    expect(html).toContain('Le mana non dépensé est perdu à la fin du tour.');
    const reserve = renderToStaticMarkup(<HomeScreen initial={{ ...DEFAULT_SETUP, economy: 'reserve' }} onStart={() => {}} />);
    expect(reserve).toMatch(/aria-pressed="true"[^>]*>Réserve/);
    expect(reserve).toContain('Le mana se garde d’un tour à l’autre.');
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

  it('l’orbe de mana est pleine à la limite', () => {
    const level = (html: string) => html.match(/orb__liquid" style="height:([\d.]+)%/)![1];
    expect(level(renderToStaticMarkup(<ManaOrb player={1} mana={5} active animated={false} />))).toBe('50.0');
    expect(level(renderToStaticMarkup(<ManaOrb player={1} mana={6} active animated={false} limit={12} />))).toBe('50.0');
  });
});

describe('réglages du mana : génération max et limite', () => {
  it('l’accueil les montre avec − et + : 5 et 10 par défaut, la règle en une phrase', () => {
    const html = renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={() => {}} />);
    expect(html).toMatch(/Génération max<\/span>.*?<output[^>]*>5<\/output>/);
    expect(html).toMatch(/Limite<\/span>.*?<output[^>]*>10<\/output>/);
    expect(html).toContain('jusqu’à 5, plus le mana des mana zones. Jamais plus de 10 mana');
  });

  it('les boutons s’arrêtent aux bornes : génération 3 à 10, limite 5 à 20', () => {
    const html = renderToStaticMarkup(<HomeScreen initial={{ ...DEFAULT_SETUP, manaRules: { baseCap: 3, limit: 20 } }} onStart={() => {}} />);
    expect(html).toMatch(/aria-label="Génération max : moins" disabled=""/);
    expect(html).not.toMatch(/aria-label="Génération max : plus" disabled=""/);
    expect(html).toMatch(/aria-label="Limite : plus" disabled=""/);
    expect(html).toContain('jusqu’à 3, plus le mana des mana zones. Jamais plus de 20 mana');
  });

  it('dans l’adresse : `gen` et `lim`, seulement s’ils changent ; une valeur hors des bornes reprend celle par défaut', () => {
    expect(setupToQuery(DEFAULT_SETUP)).not.toMatch(/gen=|lim=/);
    const query = setupToQuery({ ...DEFAULT_SETUP, manaRules: { baseCap: 6, limit: 12 } });
    expect(query).toContain('gen=6');
    expect(query).toContain('lim=12');
    expect(setupFromQuery(query).manaRules).toEqual({ baseCap: 6, limit: 12 });
    expect(setupToQuery({ ...DEFAULT_SETUP, manaRules: { baseCap: 5, limit: 12 } })).not.toContain('gen=');
    expect(setupFromQuery('?gen=6').manaRules).toEqual({ baseCap: 6, limit: 10 });
    expect(setupFromQuery('?gen=42&lim=2').manaRules).toBeUndefined();
    expect(setupFromQuery('?gen=5&lim=10').manaRules).toBeUndefined();
  });

  it('la partie se crée avec ces réglages ; le journal les dit s’ils ne sont pas ceux par défaut, la vue les porte', () => {
    const session = newSession(1, { ...DEFAULT_SETUP, manaRules: { baseCap: 7, limit: 14 } });
    expect(session.game.manaRules).toEqual({ baseCap: 7, limit: 14 });
    expect(getPlayerView(session.game, 1).manaRules).toEqual({ baseCap: 7, limit: 14 });
    expect(session.log[0]!.text).toContain('mana de base jusqu’à 7, limite 14');
    const plain = newSession(1, DEFAULT_SETUP);
    expect(plain.game.manaRules).toEqual({ baseCap: 5, limit: 10 });
    expect(plain.log[0]!.text).not.toContain('limite');
  });
});
