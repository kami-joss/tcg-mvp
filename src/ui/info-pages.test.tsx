import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DECKS, getCard } from '../engine';
import { VICTORY_VP } from '../engine/config';
import { DecksScreen } from './DecksScreen';
import { deckSections, deckSummary } from './decks';
import { HomeScreen } from './HomeScreen';
import { deckFromQuery, decksUrl, pageOf, pageUrl } from './routes';
import { KEYWORD_RULES, LEXICON_TERMS, RULES_SECTIONS, STATUS_TERMS, glossaryEntry } from './rulesPage';
import { RulesScreen } from './RulesScreen';
import { GLOSSARY } from './rulesText';
import type { GlossaryTerm } from './rulesText';
import { DEFAULT_SETUP } from './session';
import { cardSheetOf } from './sheet';

// Pages de consultation, ouvertes depuis l'accueil : la composition des decks (`/decks`) et les règles (`/regles`).

const archers = DECKS.find((d) => d.id === 'archers')!;

describe('adresses des pages de consultation', () => {
  it('/decks et /regles, sous la base de l’application', () => {
    expect(pageOf('/decks')).toBe('decks');
    expect(pageOf('/regles/')).toBe('rules');
    expect(pageOf('/tcg/regles', '/tcg/')).toBe('rules');
    expect(pageUrl('decks')).toBe('/decks');
    expect(pageUrl('rules', null, '/tcg/')).toBe('/tcg/regles');
  });

  it('le deck montré est dans l’adresse ; le premier s’il manque ou n’existe pas', () => {
    expect(decksUrl(archers)).toBe('/decks?deck=archers');
    expect(deckFromQuery('?deck=archers')).toBe(archers);
    expect(deckFromQuery('?deck=inconnu')).toBe(DECKS[0]);
    expect(deckFromQuery('')).toBe(DECKS[0]);
  });

  it('l’accueil a un lien vers chaque page', () => {
    const html = renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={() => {}} />);
    expect(html).toContain('Voir les decks');
    expect(html).toContain('Règles du jeu');
  });
});

describe('composition des decks', () => {
  it('les sections reprennent tous les exemplaires du deck, chaque carte dans la section de son type', () => {
    for (const deck of DECKS) {
      const sections = deckSections(deck);
      expect(sections.reduce((sum, s) => sum + s.total, 0)).toBe(deck.cards.length);
      for (const section of sections) {
        for (const { cardId, count } of section.cards) {
          expect(getCard(cardId).kind).toBe(section.kind);
          expect(count).toBe(deck.cards.filter((id) => id === cardId).length);
        }
      }
    }
  });

  it('résumé : nombre de cartes, courbe de mana, archétype', () => {
    const summary = deckSummary(archers);
    expect(summary.total).toBe(26);
    expect(summary.curve.reduce((a, b) => a + b, 0)).toBe(26);
    expect(summary.archetype).toBe('Archers impériaux');
    expect(deckSummary(DECKS[0]!).archetype).toBeNull();
  });

  it('la page montre le deck, ses cartes avec leurs exemplaires, et la fiche de la première carte', () => {
    const html = renderToStaticMarkup(<DecksScreen initial={archers} onDeck={() => {}} onNavigate={() => {}} />);
    for (const deck of DECKS) expect(html).toContain(`>${deck.name}<`);
    expect(html).toContain('26 cartes');
    expect(html).toContain('×3');
    expect(html).toContain('Écuyer');
    expect(html).toContain('class="sheet');
  });

  it('fiche d’une carte hors partie : sans ligne pour la jouer', () => {
    const sheet = cardSheetOf('ecuyer-archers');
    expect(sheet.lines).toEqual([]);
    expect(sheet.stats.map((s) => s.label)).toEqual(['ATK', 'PV', 'Mobilité', 'Portée']);
    expect(cardSheetOf('ecuyer-archers', true).shiny).toBe(true);
  });
});

describe('règles du jeu', () => {
  const html = renderToStaticMarkup(<RulesScreen onNavigate={() => {}} />);

  it('chaque section des règles, avec les nombres de config.ts', () => {
    for (const { title } of RULES_SECTIONS) expect(html).toContain(title.replace(/’/g, '’'));
    expect(html).toContain(`${VICTORY_VP} VP`);
    expect(html).toContain('Mode contestation');
  });

  it('un mot-clé de chaque sorte, les statuts et tout le lexique des cartes', () => {
    for (const { name } of Object.values(KEYWORD_RULES)) expect(html).toContain(`<dt>${name}</dt>`);
    const listed = [...STATUS_TERMS, ...LEXICON_TERMS].flatMap((group) => group.terms);
    expect(new Set(listed)).toEqual(new Set(Object.keys(GLOSSARY) as GlossaryTerm[]));
    expect(listed).toHaveLength(Object.keys(GLOSSARY).length);
  });

  it('une entrée du lexique : son nom, puis sa définition', () => {
    expect(glossaryEntry('slow')).toEqual({ name: 'Slow N', text: '−N mobilité. Les slow se cumulent.' });
    expect(glossaryEntry('carre').name).toBe('Carré de N');
  });

  it('les mots du lexique sont en gras, définis au survol', () => {
    expect(html).toContain('<b class="term" title="Au contact');
  });
});
