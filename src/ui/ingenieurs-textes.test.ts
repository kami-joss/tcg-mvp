import { describe, expect, it } from 'vitest';
import { CARDS, getCard } from '../engine';
import type { Trap } from '../engine';
import { ARCHETYPE_NAMES, cardEffectLine, keywordLabel, trapLabel } from './cardText';
import { abilityRules, passiveRules, plainRules } from './rulesText';

// Textes du deck Ingénieurs foudroyants (SPEC.md §6 bis, §10, 2026-11-12) : notation compacte et phrases pour les joueurs.

const rules = (id: 'archi' | 'blitz') => {
  const card = getCard(CARDS, id);
  return card.kind === 'monster' ? plainRules(abilityRules(CARDS, card.activated[0]!)) : '';
};
const spellRules = (id: 'chaines-eclair' | 'onde-de-choc') => {
  const card = getCard(CARDS, id);
  return card.kind === 'spell' ? plainRules(abilityRules(CARDS, card.ability)) : '';
};

describe('textes du deck Ingénieurs foudroyants', () => {
  it('archétype et mot-clé Statik', () => {
    expect(ARCHETYPE_NAMES.ingenieur).toEqual({ title: 'Ingénieurs foudroyants', one: 'ingénieur foudroyant', many: 'ingénieurs foudroyants' });
    expect(keywordLabel({ keyword: 'statik', amount: 2 })).toBe('Statik 2');
    expect(plainRules(passiveRules(getCard(CARDS, 'elek'))[0]!.text)).toMatch(/de proche en proche .* 2 de moins à chaque saut, jamais moins de 1\.$/);
  });

  it('Archi : piège électrique qui reste, relié par des chaînes, 3 à la fois', () => {
    expect(cardEffectLine(CARDS, getCard(CARDS, 'archi'))).toContain('(reste, 3 à la fois, chaîne à 4 cases au plus)');
    const text = rules('archi');
    expect(text).toMatch(/^Pose un piège électrique sur une case libre dans un carré de 1\./);
    expect(text).toContain('déclenche tout le réseau relié');
    expect(text).toContain('subissent 1 dégât et sont immobilisés jusqu’à leur prochain tour');
    expect(text).toContain('se rechargent jusqu’au début de ton prochain tour');
    expect(text).toMatch(/3 au plus à la fois : le plus ancien disparaît\. Sans limite par tour\.$/);
    const trap: Trap = { owner: 1, pos: { row: 0, col: 0 }, effects: [], cardId: 'archi', sourceId: 'u1', expiresAtTurn: null, chain: 4 };
    expect(trapLabel(trap)).toBe('Piège électrique');
  });

  it('Blitz : attire, jamais « repousse »', () => {
    expect(rules('blitz')).toBe('Attire jusqu’à lui un ennemi en ligne, portée 4.');
  });

  it('Champ magnétique : Passage, puis de nouveau au début du tour adverse', () => {
    const [passage] = passiveRules(getCard(CARDS, 'champ-magnetique'));
    expect(plainRules(passage!.text)).toBe(
      'L’ennemi qui entre dans un carré de 1 subit 1 dégât et slow 1 jusqu’à son prochain tour, de nouveau au début du tour adverse s’il y est encore.',
    );
  });

  it('Chaînes d’éclair et Onde de choc', () => {
    expect(spellRules('chaines-eclair')).toBe(
      'Inflige 4 dégâts aux unités ennemies sur les chaînes entre tes monstres. Une chaîne relie deux de tes monstres en ligne droite ; une unité sur deux chaînes les subit deux fois.',
    );
    expect(spellRules('onde-de-choc')).toBe('Inflige 2 dégâts aux ennemis dans un carré de 2 autour d’un allié ingénieur foudroyant de ton choix.');
  });
});
