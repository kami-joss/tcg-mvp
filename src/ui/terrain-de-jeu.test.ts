import { describe, expect, it } from 'vitest';
import { getCard, getPlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { cardEffectLine } from './cardText';
import { passiveRules, plainRules, rulesSegments } from './rulesText';
import { getSheet } from './sheet';

// Terrain de jeu - Maîtres des pièges dans l'interface : notation du lexique, phrase naturelle, puce du monstre couvert.

describe('Terrain de jeu : textes et fiche', () => {
  it('notation et phrase naturelle (camouflage est un mot du lexique)', () => {
    expect(cardEffectLine(getCard('terrain-de-jeu'))).toBe('Aura · maîtres des pièges alliés, sa case et carré de 1 · camouflage 1');
    const items = passiveRules(getCard('terrain-de-jeu'));
    expect(items.map((i) => plainRules(i.text))).toEqual(['Tes maîtres des pièges sur ce terrain ou dans un carré de 1 ont camouflage 1.']);
    expect(rulesSegments(items[0]!.text).flatMap((s) => (s.term ? [s.term] : []))).toEqual(['carre', 'camouflage']);
  });

  it('un de ses maîtres des pièges dans la zone : puces « Camouflé » et aura, comme un Farceur', () => {
    const state = gameWith(
      [
        { terrain: 'terrain-de-jeu', owner: 1, at: at(8, 4) },
        { monster: 'clown-assassin', owner: 1, at: at(8, 5) },
      ],
      { activePlayer: 1 },
    );
    const chips = getSheet(getPlayerView(state, 1), { kind: 'unit', unitId: 'u2' })!.status ?? [];
    expect(chips.map((c) => c.text)).toEqual(expect.arrayContaining(['Camouflé', 'Aura']));
    expect(chips.find((c) => c.text === 'Camouflé')?.detail).toMatch(/carré de 1/);
    expect(chips.find((c) => c.text === 'Aura')?.detail).toMatch(/camouflage 1/);
  });
});
