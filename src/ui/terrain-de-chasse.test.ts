import { describe, expect, it } from 'vitest';
import { applyAction, getCard, getPlayerView } from '../engine';
import type { Action, GameState } from '../engine';
import { at, gameWith as plainGame, withStatus } from '../engine/test-utils';
import { TEST_CARDS } from '../engine/test-cards';
import type { CardSet, MonsterCard } from '../engine';
import type { UnitSpec } from '../engine/test-utils';
import { cardEffectLine, describeCard } from './cardText';
import { getUnitZones } from './zones';
import { logEntry } from './log';
import { passiveRules, plainRules, rulesSegments } from './rulesText';
import { getSheet } from './sheet';
import { getTipAt } from './unitTip';
import { CARDS } from '../engine';

// Terrain de chasse dans l'interface : texte de la carte, journal, fiche (pas restants, puce), menace au survol.
// Plateau classique : Forge en (5, 4) ; (5, 3) lui est adjacente.

const FORGE = at(5, 4);
/** Terrain de l'archétype Vampire (2026-11-10) : le Milicien des tests en devient un vampire (cartes d'essai). */
const VAMPIRE_CARDS: CardSet = { ...TEST_CARDS, milicien: { ...(TEST_CARDS.milicien as MonsterCard), archetype: 'vampire' } };
const gameWith = (...[units, options = {}]: Parameters<typeof plainGame>) => plainGame(units, { ...options, cards: VAMPIRE_CARDS });
const view = (state: GameState, player: 1 | 2 = state.activePlayer) => getPlayerView(state, player);
const hunting = (units: readonly UnitSpec[], options: Parameters<typeof gameWith>[1] = {}) =>
  gameWith([{ terrain: 'terrain-de-chasse', owner: 1, at: FORGE }, ...units], options);
const move: Action = { type: 'move', unitId: 'u2', to: at(4, 3) };

describe('Terrain de chasse : texte de la carte', () => {
  const card = getCard(CARDS, 'terrain-de-chasse');

  it('« Au déplacement », en phrase naturelle ; « déplacement » et « adjacente » sont des mots du lexique', () => {
    const [item] = passiveRules(card);
    expect(item!.name).toBe('Au déplacement');
    expect(plainRules(item!.text)).toBe(
      'Quand un de tes vampires commence un déplacement sur sa case ou dans un carré de 1, il a +1 mobilité ce tour. Une fois par tour par monstre.',
    );
    expect(rulesSegments(item!.text).flatMap((s) => (s.term ? [s.term] : []))).toEqual(['deplacement', 'carre']);
  });

  it('notation du lexique (tableau §6 ter de SPEC.md)', () => {
    expect(cardEffectLine(CARDS, card)).toBe('Au déplacement · vampires alliés, sa case et carré de 1 · +1 mobilité (pour ce tour)');
    expect(describeCard(CARDS, card)).toEqual([
      'PV 3 · se pose sur une mana zone occupée par un de vos monstres.',
      'Passif · Au déplacement · vampires alliés, sa case et carré de 1 · +1 mobilité (pour ce tour) : un de vos vampires qui commence un déplacement sur sa case ou dans un carré de 1 a +1 mobilité ce tour, une fois par tour.',
    ]);
  });
});

describe('Terrain de chasse : journal', () => {
  it('« +1 mobilité ce tour (Terrain de chasse) » dans les conséquences du déplacement', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]);
    const entry = logEntry(view(state), move, view(applyAction(state, move)));
    expect(entry.items).toContainEqual({ icon: 'walking-boot', text: 'Milicien de J1 : +1 mobilité ce tour (Terrain de chasse - Vampire).', tone: 'good' });
  });

  it('pas un mot pour un monstre caché à l’adversaire : ce serait dire où il était', () => {
    const state = withStatus(hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]), 'u2', 'camouflage', 2);
    const after = applyAction(state, move);
    expect(view(after).hiddenFromOpponent).toContain('u2');
    expect(logEntry(view(state), move, view(after)).items.some((i) => i.text.includes('Terrain de chasse'))).toBe(false);
  });

  it('rien quand le bonus est déjà pris ce tour', () => {
    const state = applyAction(hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]), move);
    const again: Action = { type: 'move', unitId: 'u2', to: at(5, 3) };
    expect(logEntry(view(state), again, view(applyAction(state, again))).items).toEqual([]);
  });
});

describe('Terrain de chasse : fiche', () => {
  it('pas restants : le +1 en attente compte déjà ; puce « Terrain de chasse » ; puis le bonus du tour', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]);
    const sheet = getSheet(view(state), { kind: 'cell', pos: at(5, 3) })!;
    expect(sheet.stats.find((s) => s.label === 'Pas rest.')).toMatchObject({ value: '3/3', delta: 1 });
    expect(getTipAt(view(state), at(5, 3))!.chips).toContainEqual(
      expect.objectContaining({ text: 'Terrain de chasse', group: 'effect', detail: '+1 mobilité en commençant un déplacement ici, une fois par tour' }),
    );
    // Parti de la zone : le +1 est pris (2 + 1 − 1), c'est un bonus du tour venu du terrain.
    const after = applyAction(state, move);
    const moved = getSheet(view(after), { kind: 'cell', pos: at(4, 3) })!;
    expect(moved.stats.find((s) => s.label === 'Pas rest.')).toMatchObject({ value: '2/3' });
    expect(getTipAt(view(after), at(4, 3))!.chips.filter((c) => c.text === 'Terrain de chasse')).toEqual([
      expect.objectContaining({ detail: expect.stringContaining('+1 mobilité ce tour') }),
    ]);
  });

  it('hors de la zone, ou pour l’adversaire, rien en attente', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(1, 1) }]);
    const sheet = getSheet(view(state), { kind: 'cell', pos: at(1, 1) })!;
    expect(sheet.stats.find((s) => s.label === 'Pas rest.')).toMatchObject({ value: '2/2' });
    expect(getTipAt(view(state), at(1, 1))!.chips.some((c) => c.text.startsWith('Terrain de chasse'))).toBe(false);
    const theirs = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }], { activePlayer: 2 });
    expect(getTipAt(view(theirs), at(5, 3))!.chips.some((c) => c.text.startsWith('Terrain de chasse'))).toBe(false);
  });
});

describe('Terrain de chasse : menace au survol', () => {
  it('le monstre adverse dans la zone de son Terrain de chasse ira 1 case plus loin à son prochain tour', () => {
    // J2 regarde le Milicien de J1 (mobilité 2) en (5, 3) : il pourra aller en (8, 3), à 3 cases.
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }], { activePlayer: 2 });
    const moves = getUnitZones(view(state, 2), 'u2').moves;
    expect(moves).toContainEqual(at(8, 3));
    const plain = gameWith([{ monster: 'milicien', owner: 1, at: at(5, 3) }], { activePlayer: 2 });
    expect(getUnitZones(view(plain, 2), 'u1').moves).not.toContainEqual(at(8, 3));
  });
});
