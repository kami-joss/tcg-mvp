import { describe, expect, it } from 'vitest';
import { chooseAction } from '../ai/bot';
import { getStrikers } from '../ai/reach';
import { applyAction, getLegalActions } from './actions';
import { CARDS, getMonsterCard, getTerrainCard } from './cards';
import { createGame } from './game';
import { getMoveDestinations } from './movement';
import { at, gameWith } from './test-utils';
import type { Action, Card, CardId, CardSet, GameState, MonsterUnit } from './types';
import { getAtk } from './units';
import { getPlayerView } from './view';

// Les cartes de la partie (étape 1 de l'atelier) : chaque partie garde son jeu de cartes, `CARDS` par défaut, et le
// moteur et l'IA ne lisent que celui-là. Une carte modifiée change donc la partie, et rien d'autre.

/** Les cartes d'origine, avec une carte changée. */
const withCard = (id: CardId, change: Partial<Card>): CardSet => ({ ...CARDS, [id]: { ...CARDS[id], ...change } as Card });

const custom = (cards: CardSet) => createGame(undefined, undefined, undefined, 'normal', 1, 'classic', undefined, cards);

describe('les cartes de la partie', () => {
  it('une partie garde ses cartes, celles de CARDS par défaut ; sa vue les montre, d’une action à l’autre', () => {
    expect(createGame().cards).toBe(CARDS);
    const cards = withCard('eclaireur', { cost: 9 });
    const state = custom(cards);
    expect(state.cards).toBe(cards);
    expect(getPlayerView(state, 1).cards).toBe(cards);
    expect(getPlayerView(state, 2).cards).toBe(cards);
    const next = applyAction(state, { type: 'endTurn' });
    expect(next.cards).toBe(cards);
  });

  it('refuse des cartes où manque une carte des decks', () => {
    const { eclaireur: _missing, ...rest } = CARDS;
    expect(() => custom(rest as CardSet)).toThrow(/eclaireur/);
  });

  it('le coût de la carte de la partie décide de ce qu’on peut jouer', () => {
    const players = { 1: { grimoire: ['chevalier'] as CardId[], mana: 3 } };
    const playable = (state: GameState) => getLegalActions(state).some((a) => a.type === 'playCard' && a.cardId === 'chevalier');
    expect(playable(gameWith([], { players }))).toBe(true);
    expect(playable(gameWith([], { players, cards: withCard('chevalier', { cost: 4 }) }))).toBe(false);
  });

  it('l’ATK de la carte de la partie frappe, ses mots-clés comptent (riposte)', () => {
    const units = [
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ] as const;
    const attack: Action = { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false };
    const after = (cards?: CardSet) => applyAction(gameWith([...units], { cards }), attack).units;
    expect(after().u2?.hp).toBe(3); // 6 PV − 3 ATK
    expect(after().u1?.hp).toBe(3); // riposte du Gardien : 4 PV − 1
    expect(after(withCard('chevalier', { atk: 5 })).u2?.hp).toBe(1);
    expect(after(withCard('gardien', { keywords: [] })).u1?.hp).toBe(4); // plus de riposte
  });

  it('la mobilité de la carte de la partie revient au début de son tour', () => {
    const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1) }], { cards: withCard('eclaireur', { mobility: 5 }) });
    const back = applyAction(applyAction(state, { type: 'endTurn' }), { type: 'endTurn' });
    expect((back.units.u1 as MonsterUnit).mobilityLeft).toBe(5);
  });

  it('les effets de la carte de la partie s’appliquent avec ses valeurs', () => {
    const mage = getMonsterCard(CARDS, 'mage');
    const stronger = withCard('mage', { activated: [{ ...mage.activated[0]!, effects: [{ type: 'damage', amount: 4 }] }] });
    const units = [
      { monster: 'mage', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 3) },
    ] as const;
    const hit = (cards?: CardSet) => {
      const state = gameWith([...units], { cards, players: { 1: { mana: 5 } } });
      const action = getLegalActions(state).find(
        (a) => a.type === 'activateEffect' && a.unitId === 'u1' && JSON.stringify(a.target).includes('"u2"'),
      );
      return applyAction(state, action!).units.u2?.hp;
    };
    expect(hit()).toBe(4); // 6 − 2
    expect(hit(stronger)).toBe(2); // 6 − 4
  });

  it('les parcours gardés en mémoire tiennent compte des cartes : mêmes unités, autres cartes, autre résultat', () => {
    // Le Terrain piégé adverse ralentit qui entre dans son carré de 1 ; sans effet, il ne ralentit plus.
    const state = gameWith([
      { monster: 'eclaireur', owner: 1, at: at(8, 4) },
      { terrain: 'terrain-piege', owner: 2, at: at(6, 4) },
    ]);
    const harmless = withCard('terrain-piege', { passage: { ...getTerrainCard(CARDS, 'terrain-piege').passage!, effects: [] } });
    const reach = (s: GameState) => getMoveDestinations(s, s.units.u1 as MonsterUnit).length;
    const slowed = reach(state); // remplit la mémoire pour les cartes d'origine
    const free = reach({ ...state, cards: harmless }); // même objet `units`
    expect(free).toBeGreaterThan(slowed);
  });
});

describe('personne ne lit les cartes d’origine en partie', () => {
  // Le code, sans ses commentaires : seuls la définition des cartes, la création de la partie (valeur par défaut) et les
  // pages hors partie (decks, barèmes, atelier et son enregistrement) nomment `CARDS`.
  const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!./test-utils.ts'], {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const ALLOWED = [
    './cards.ts',
    './game.ts',
    // Cartes d'essai des tests : celles du jeu, chiffres figés.
    './test-cards.ts',
    '../ui/decks.ts',
    '../ui/DecksScreen.tsx',
    '../ui/costScales.ts',
    '../ui/workshop.ts',
    '../ui/WorkshopScreen.tsx',
    '../ui/workshopSave.ts',
  ];

  it('le moteur, l’IA et l’écran de jeu ne nomment jamais CARDS', () => {
    const readers = Object.entries(sources)
      .filter(([path, text]) => !ALLOWED.includes(path) && /\bCARDS\b/.test(code(text)))
      .map(([path]) => path);
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(readers).toEqual([]);
  });
});

describe('l’IA lit les cartes de la partie', () => {
  it('portée de frappe : celle de la carte de la partie', () => {
    const units = [
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 4) },
    ] as const;
    const hits = (cards?: CardSet) => {
      const state = gameWith([...units], { cards });
      return getStrikers(state, 1, () => 0, (m) => getAtk(state, m), () => true).flatMap((s) => s.hits).length;
    };
    expect(hits()).toBe(0); // portée 1, à 3 cases
    expect(hits(withCard('chevalier', { range: 3 }))).toBe(1);
  });

  it('elle choisit une action légale avec des cartes modifiées', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }], {
      cards: withCard('chevalier', { atk: 7, mobility: 1 }),
      players: { 1: { mana: 3 } },
    });
    const action = chooseAction(state, 1);
    expect(() => applyAction(state, action)).not.toThrow();
  });
});
