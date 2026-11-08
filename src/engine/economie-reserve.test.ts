import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { BATTLEFIELD_15 } from './board';
import { createGame } from './game';
import { addMana, getManaLimit } from './players';
import { at, gameWith } from './test-utils';
import { getBaseMana } from './turns';
import { removeUnit } from './units';
import type { GameState } from './types';

// Économie « Réserve » (option de l'accueil, SPEC.md §4.2, §10, validée le 2026-11-08) : mana de base 3, 4, 5 puis 6,
// le mana se garde d'un tour à l'autre, réserve limitée à 10 + 1 par terrain ; l'économie classique ne change pas.

const END = { type: 'endTurn' } as const;
/** Fin du tour du joueur actif, puis de celui de l'adversaire : le joueur actif recommence un tour. */
const round = (state: GameState) => applyAction(applyAction(state, END), END);

describe('mana de base', () => {
  it('classique : 3, 4, 5… jusqu’à 10 ; réserve : 3, 4, 5, puis 6 à chaque tour', () => {
    // Tours globaux 1, 3, 5, 7, 15 : les 1er, 2e, 3e, 4e et 8e tours de J1.
    expect([1, 3, 5, 7, 15].map((turn) => getBaseMana(turn))).toEqual([3, 4, 5, 6, 10]);
    expect([1, 3, 5, 7, 15].map((turn) => getBaseMana(turn, 'reserve'))).toEqual([3, 4, 5, 6, 6]);
  });
});

describe('réserve : le mana se garde', () => {
  it('classique par défaut : le mana non dépensé est perdu', () => {
    const state = createGame();
    expect(state.economy).toBe('classic');
    expect(round(state).players[1].mana).toBe(4);
  });

  it('réserve : 3 gardés au premier tour + 4 au deuxième = 7 (un dragon dès son 2e tour, voulu)', () => {
    const state = createGame(undefined, undefined, undefined, 'normal', 1, 'reserve');
    expect(state.players[1].mana).toBe(3);
    expect(round(state).players[1].mana).toBe(7);
  });

  it('limite 10 : les revenus qui la dépassent sont perdus', () => {
    const state = gameWith([], { economy: 'reserve', players: { 1: { mana: 9 } } });
    expect(getManaLimit(state, 1)).toBe(10);
    expect(round(state).players[1].mana).toBe(10);
  });

  it('un gain en cours de tour s’arrête aussi à la limite ; une dépense n’est pas touchée', () => {
    const state = gameWith([], { economy: 'reserve', players: { 1: { mana: 9 } } });
    expect(addMana(state, 1, 5).players[1].mana).toBe(10);
    expect(addMana(state, 1, -4).players[1].mana).toBe(5);
    // Classique : pas de limite.
    expect(addMana(gameWith([], { players: { 1: { mana: 9 } } }), 1, 5).players[1].mana).toBe(14);
  });
});

describe('terrains : +1 mana sur leur zone et +1 de limite chacun', () => {
  const withTerrain = (terrain: 'terrain-piege' | 'autel-de-mana', mana: number) =>
    gameWith([{ terrain, owner: 1, at: at(2, 2) }], { board: BATTLEFIELD_15, economy: 'reserve', activePlayer: 2, turn: 2, players: { 1: { mana } } });

  it('un terrain : limite 11, et sa zone rapporte 1 mana', () => {
    const state = withTerrain('terrain-piege', 9);
    expect(getManaLimit(state, 1)).toBe(11);
    expect(getManaLimit(state, 2)).toBe(10);
    // Tour 3 (2e tour de J1) : 9 + 4 de base + 1 de la zone = 14, ramené à 11.
    expect(applyAction(state, END).players[1].mana).toBe(11);
  });

  it('l’Autel de mana rapporte 2 mais ne monte la limite que de 1, comme tout terrain', () => {
    const state = withTerrain('autel-de-mana', 3);
    expect(getManaLimit(state, 1)).toBe(11);
    expect(applyAction(state, END).players[1].mana).toBe(3 + 4 + 2);
  });

  it('terrain détruit : la limite baisse, l’excédent est perdu tout de suite', () => {
    const state = withTerrain('terrain-piege', 11);
    const after = removeUnit(state, 'u1');
    expect(getManaLimit(after, 1)).toBe(10);
    expect(after.players[1].mana).toBe(10);
    expect(after.events.at(-1)).toMatchObject({ type: 'mana', player: 1, amount: -1 });
    // Classique : rien ne bouge.
    const classic = gameWith([{ terrain: 'terrain-piege', owner: 1, at: at(2, 2) }], { board: BATTLEFIELD_15, players: { 1: { mana: 11 } } });
    expect(removeUnit(classic, 'u1').players[1].mana).toBe(11);
  });
});
