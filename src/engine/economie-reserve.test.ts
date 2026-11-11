import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { BATTLEFIELD_15 } from './board';
import { createGame } from './game';
import { addMana, getManaLimit } from './players';
import { at, gameWith } from './test-utils';
import { getBaseMana } from './turns';
import { removeUnit } from './units';
import type { GameState } from './types';

// Économies du mana (SPEC.md §4.2, §10) : « Classique », le mana non dépensé est perdu ; « Réserve », il se garde. Dans
// les deux, réglés à l'accueil (validé le 2026-11-08) : la génération max (le mana de base monte de 3 jusqu'à elle,
// 5 par défaut) et la limite (le mana qu'on peut avoir au total, 10 par défaut ; les terrains ne la changent plus).

const END = { type: 'endTurn' } as const;
/** Fin du tour du joueur actif, puis de celui de l'adversaire : le joueur actif recommence un tour. */
const round = (state: GameState) => applyAction(applyAction(state, END), END);

describe('mana de base', () => {
  it('3, 4, puis 5 à chaque tour par défaut, dans les deux économies', () => {
    // Tours globaux 1, 3, 5, 7, 15 : les 1er, 2e, 3e, 4e et 8e tours de J1.
    expect([1, 3, 5, 7, 15].map((turn) => getBaseMana(turn))).toEqual([3, 4, 5, 5, 5]);
    const mana: number[] = [];
    let state = createGame(undefined, undefined, undefined, 'normal', 1, 'classic');
    for (let i = 0; i < 4; i++) {
      mana.push(state.players[1].mana);
      state = round(state);
    }
    expect(mana).toEqual([3, 4, 5, 5]);
  });

  it('génération max réglée à 7 : 3, 4, 5, 6, puis 7', () => {
    let state = createGame(undefined, undefined, undefined, 'normal', 1, 'classic', { baseCap: 7, limit: 10 });
    const mana: number[] = [];
    for (let i = 0; i < 6; i++) {
      mana.push(state.players[1].mana);
      state = round(state);
    }
    expect(mana).toEqual([3, 4, 5, 6, 7, 7]);
    expect(state.manaRules).toEqual({ baseCap: 7, limit: 10 });
  });

  it('des réglages qui ne sont pas des entiers d’au moins 1 sont refusés', () => {
    expect(() => createGame(undefined, undefined, undefined, 'normal', 1, 'classic', { baseCap: 0, limit: 10 })).toThrow();
    expect(() => createGame(undefined, undefined, undefined, 'normal', 1, 'reserve', { baseCap: 5, limit: 2.5 })).toThrow();
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
});

describe('limite : le mana qu’on peut avoir au total', () => {
  it('10 par défaut : les revenus qui la dépassent sont perdus', () => {
    const state = gameWith([], { economy: 'reserve', players: { 1: { mana: 9 } } });
    expect(getManaLimit(state)).toBe(10);
    expect(round(state).players[1].mana).toBe(10);
  });

  it('un gain en cours de tour s’arrête aussi à la limite ; une dépense n’est pas touchée', () => {
    const state = gameWith([], { economy: 'reserve', players: { 1: { mana: 9 } } });
    expect(addMana(state, 1, 5).players[1].mana).toBe(10);
    expect(addMana(state, 1, -4).players[1].mana).toBe(5);
  });

  it('classique aussi : on n’a jamais plus que la limite, revenus et gains compris', () => {
    const classic = gameWith([], { players: { 1: { mana: 9 } } });
    expect(addMana(classic, 1, 5).players[1].mana).toBe(10);
    // Limite réglée à 4 : le mana de base du 3e tour (5) est ramené à 4.
    const low = gameWith([], { manaRules: { baseCap: 5, limit: 4 }, turn: 4, activePlayer: 2 });
    expect(applyAction(low, END).players[1].mana).toBe(4);
  });

  it('limite réglée à 12 : la réserve monte jusqu’à 12', () => {
    const state = gameWith([], { economy: 'reserve', manaRules: { baseCap: 5, limit: 12 }, players: { 1: { mana: 9 } } });
    expect(getManaLimit(state)).toBe(12);
    expect(round(state).players[1].mana).toBe(12);
  });
});

describe('terrains : +1 mana sur leur zone, sans changer la limite', () => {
  const withTerrain = (terrain: 'terrain-piege' | 'autel-de-mana', mana: number) =>
    gameWith([{ terrain, owner: 1, at: at(2, 2) }], { board: BATTLEFIELD_15, economy: 'reserve', activePlayer: 2, turn: 2, players: { 1: { mana } } });

  it('un terrain : sa zone rapporte 1 mana, la limite reste 10', () => {
    const state = withTerrain('terrain-piege', 3);
    expect(getManaLimit(state)).toBe(10);
    // Tour 3 (2e tour de J1) : 3 + 4 de base + 1 de la zone.
    expect(applyAction(state, END).players[1].mana).toBe(8);
    // 9 + 4 + 1 = 14, ramené à 10.
    expect(applyAction(withTerrain('terrain-piege', 9), END).players[1].mana).toBe(10);
  });

  it('l’Autel de mana rapporte 2', () => {
    expect(applyAction(withTerrain('autel-de-mana', 3), END).players[1].mana).toBe(3 + 4 + 2);
  });

  it('terrain détruit : le mana ne bouge pas', () => {
    const state = withTerrain('terrain-piege', 10);
    expect(removeUnit(state, 'u1').players[1].mana).toBe(10);
  });
});
