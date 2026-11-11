import { describe, expect, it } from 'vitest';
import cardsFile from '../engine/cards.data.ts?raw';
import spec from '../../SPEC.md?raw';
import { CARDS, getMonsterCard } from '../engine';
import { cardsModuleSource } from '../engine/cardsSource';
import { exportPatches, setField, workshopCards } from './workshop';
import { CARDS_FILE, SPEC_FILE, saveToProject, specWithCards } from './workshopSave';

// Enregistrer dans le projet (étape 4 de l'atelier) : le fichier des cartes, qui fait foi, réécrit avec les cartes
// réglées, et leurs lignes dans SPEC.md.

const patches = setField(setField(setField({}, 'delta', 'atk', 7), 'delta', 'cost', 1), 'clown-assassin', 'assassin.multiplier', 2);

/** Les lignes qui diffèrent entre deux textes de même nombre de lignes. */
const diff = (a: string, b: string) => {
  const left = a.split('\n');
  const right = b.split('\n');
  expect(right).toHaveLength(left.length);
  return right.filter((line, i) => line !== left[i]);
};

describe('le fichier des cartes', () => {
  it('le fichier versionné est exactement celui que l’atelier écrirait : enregistrer sans changement ne change rien', () => {
    expect(cardsModuleSource(CARDS)).toBe(cardsFile);
  });

  it('écrit les cartes réglées, et seulement elles changent', () => {
    const source = cardsModuleSource(workshopCards(patches));
    const changed = diff(cardsFile, source);
    // Le Clown assassin vient avant Delta dans le fichier.
    expect(changed).toEqual(["    keywords: [{ keyword: 'assassin', multiplier: 2 }],", '    cost: 1,', '    atk: 7,']);
  });
});

describe('SPEC.md', () => {
  it('les lignes des cartes réglées : coût, stats et colonne « Effet » ; aucune autre ligne ne bouge', () => {
    const after = workshopCards(patches);
    const updated = specWithCards(spec, CARDS, after, ['delta', 'clown-assassin']);
    const changed = diff(spec, updated);
    expect(changed).toHaveLength(2);
    const delta = changed.find((line) => line.startsWith('| Delta - Vampire |'))!;
    const { hp, mobility, range } = getMonsterCard(CARDS, 'delta');
    expect(delta).toMatch(new RegExp(`^\\| Delta - Vampire \\| 1 \\| 7 \\| ${hp} \\| ${mobility} \\| ${range} \\| `));
    expect(changed.find((line) => line.startsWith('| Clown assassin'))).toContain('Attaque par surprise ×2');
  });
});

describe('coût des effets actifs', () => {
  it('le fichier des cartes et la ligne de SPEC.md (« Actif (N mana) ») suivent le coût réglé', () => {
    const effect = setField({}, 'archimage', 'activated.0.manaCost', 3);
    const after = workshopCards(effect);
    expect(diff(cardsFile, cardsModuleSource(after))).toEqual(['        manaCost: 3,']);
    const changed = diff(spec, specWithCards(spec, CARDS, after, ['archimage']));
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatch(/^\| Archimage - Sorciers du feu \|.*Actif \(3 mana\)/);
    expect(changed[0]).not.toContain('Actif (1 mana)');
  });
});

describe('enregistrer', () => {
  it('le fichier des cartes et SPEC.md, à partir des réglages exportés', () => {
    const result = saveToProject(exportPatches(patches), spec);
    expect('files' in result && Object.keys(result.files)).toEqual([CARDS_FILE, SPEC_FILE]);
    expect('cards' in result && result.cards).toEqual(['delta', 'clown-assassin']);
    expect('files' in result && result.files[CARDS_FILE]).toBe(cardsModuleSource(workshopCards(patches)));
  });

  it('refuse des réglages invalides ou vides, avec la raison', () => {
    expect(saveToProject('pas du json', spec)).toEqual({ error: expect.stringContaining('JSON') });
    expect(saveToProject(exportPatches({}), spec)).toEqual({ error: 'Aucun réglage à enregistrer.' });
  });
});
