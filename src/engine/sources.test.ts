import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { at, gameWith } from './test-utils';
import type { Action, CardId, MonsterUnit } from './types';

// Source des bonus du tour (pas des statuts) : la fiche dit d'où vient chaque effet.

const END_TURN: Action = { type: 'endTurn' };
const cast = (cardId: CardId, unitId: string): Action => ({ type: 'playCard', cardId, target: { kind: 'unit', unitId } });
const monster = (state: { units: Record<string, unknown> }, id: string) => state.units[id] as MonsterUnit;

describe('source des bonus du tour', () => {
  it('un effet actif garde la carte et son nom (Dopage de Jean Bon)', () => {
    const state = gameWith([{ monster: 'jean-bon', owner: 1, at: at(8, 1) }], { players: { 1: { mana: 2 } } });
    const after = applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } });
    expect(monster(after, 'u1').turnBonuses).toEqual([{ source: { cardId: 'jean-bon', effect: 'Dopage' }, atk: 2, range: 0, mobility: 0 }]);
  });

  it('deux exemplaires d’un même sort font une seule source, cumulée', () => {
    const state = gameWith([{ monster: 'archer-leger', owner: 1, at: at(9, 0) }], {
      players: { 1: { mana: 10, grimoire: ['fleche-divine', 'fleche-divine'] } },
    });
    const twice = applyAction(applyAction(state, cast('fleche-divine', 'u1')), cast('fleche-divine', 'u1'));
    expect(monster(twice, 'u1').turnBonuses).toEqual([{ source: { cardId: 'fleche-divine' }, atk: 2, range: 2, mobility: 0 }]);
  });

  it('ATK et portée finissent avec le tour ; la mobilité de Charge dure jusqu’au début du prochain tour de son camp', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], {
      players: { 1: { mana: 10, grimoire: ['charge', 'fleche-divine'] } },
    });
    const charged = applyAction(state, cast('charge', 'u1'));
    expect(monster(charged, 'u1').turnBonuses).toEqual([{ source: { cardId: 'charge' }, atk: 0, range: 0, mobility: 2 }]);
    const theirTurn = applyAction(charged, END_TURN);
    expect(monster(theirTurn, 'u1').turnBonuses).toHaveLength(1);
    expect(monster(applyAction(theirTurn, END_TURN), 'u1').turnBonuses).toEqual([]);
  });
});
