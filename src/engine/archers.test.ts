import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { IllegalActionError } from './errors';
import { at, gameWith } from './test-utils';
import { getAtk, getRange } from './units';
import type { Action, CardId, GameState, MonsterUnit, UnitId } from './types';

// Flèche divine (SPEC.md §6 bis, §10) : un allié archer · +1 ATK +1 portée (pour ce tour).

const arrow = (unitId: UnitId): Action => ({ type: 'playCard', cardId: 'fleche-divine', target: { kind: 'unit', unitId } });
const END_TURN: Action = { type: 'endTurn' };
const ARROWS = { players: { 1: { mana: 10, grimoire: ['fleche-divine', 'fleche-divine'] as CardId[] } } };
const monster = (state: GameState, id: UnitId) => state.units[id] as MonsterUnit;
const canAttack = (state: GameState, unitId: UnitId, targetId: UnitId) =>
  getLegalActions(state).some((a) => a.type === 'attack' && a.unitId === unitId && a.targetId === targetId);

describe('Flèche divine', () => {
  it('vise un de ses archers (famille Archer) : ni le Trébuchet, ni l’Archer de base, ni un archer adverse', () => {
    const state = gameWith(
      [
        { monster: 'archer-leger', owner: 1, at: at(9, 0) },
        { monster: 'archer-lourd', owner: 1, at: at(9, 2) },
        { monster: 'archer-de-glace', owner: 1, at: at(9, 3) },
        { monster: 'archer-du-feu', owner: 1, at: at(9, 5) },
        { monster: 'trebuchet', owner: 1, at: at(9, 6) },
        { monster: 'archer', owner: 1, at: at(9, 7) },
        { monster: 'archer-leger', owner: 2, at: at(1, 0) },
      ],
      ARROWS,
    );
    const targets = getLegalActions(state).flatMap((a) =>
      a.type === 'playCard' && a.cardId === 'fleche-divine' && a.target.kind === 'unit' ? [a.target.unitId] : [],
    );
    expect(targets.sort()).toEqual(['u1', 'u2', 'u3', 'u4']);
    for (const id of ['u5', 'u6', 'u7']) expect(() => applyAction(state, arrow(id)), id).toThrow(IllegalActionError);
  });

  it('+1 ATK et +1 portée pour ce tour : l’archer tire à 3 cases', () => {
    const state = gameWith(
      [
        { monster: 'archer-leger', owner: 1, at: at(9, 0) },
        { monster: 'golem', owner: 2, at: at(6, 0) },
      ],
      ARROWS,
    );
    expect(canAttack(state, 'u1', 'u2')).toBe(false);
    const after = applyAction(state, arrow('u1'));
    expect(after.players[1].mana).toBe(8);
    expect(getAtk(after, monster(after, 'u1'))).toBe(2);
    expect(getRange(monster(after, 'u1'))).toBe(3);
    expect(after.events).toContainEqual({ type: 'boost', unitId: 'u1', pos: at(9, 0), atk: 1 });
    expect(after.events).toContainEqual({ type: 'reach', unitId: 'u1', pos: at(9, 0), amount: 1 });
    expect(canAttack(after, 'u1', 'u2')).toBe(true);
    const shot = applyAction(after, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false });
    expect(shot.units.u2?.hp).toBe(5);
    // Comme tout sort : une fois par tour.
    expect(() => applyAction(after, arrow('u1'))).toThrow(IllegalActionError);
  });

  it('les bonus s’arrêtent à la fin du tour', () => {
    const state = gameWith(
      [
        { monster: 'archer-leger', owner: 1, at: at(9, 0) },
        { monster: 'golem', owner: 2, at: at(6, 0) },
      ],
      ARROWS,
    );
    const later = applyAction(applyAction(applyAction(state, arrow('u1')), END_TURN), END_TURN);
    expect(monster(later, 'u1')).toMatchObject({ atkBonus: 0, rangeBonus: 0 });
    expect(getRange(monster(later, 'u1'))).toBe(2);
    expect(canAttack(later, 'u1', 'u2')).toBe(false);
  });
});
