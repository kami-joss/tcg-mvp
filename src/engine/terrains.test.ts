import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { BASE_MANA_PER_TURN, MANA_PER_CONTROLLED_ZONE, VP_PER_CONTROLLED_ZONE } from './config';
import { IllegalActionError } from './errors';
import { at, gameWith } from './test-utils';
import { getUnitsAt } from './units';
import type { Action, CardId, GameState, Position, UnitId } from './types';

const FORGE = at(5, 4);
const SCIERIE = at(5, 1);
const MINE = at(5, 7);

const place = (cardId: CardId, pos: Position): Action => ({ type: 'playCard', cardId, target: { kind: 'cell', pos } });
const move = (unitId: UnitId, to: Position): Action => ({ type: 'move', unitId, to });
const END_TURN: Action = { type: 'endTurn' };
const MANA = { players: { 1: { mana: 10 } } };
const terrainActions = (state: GameState) =>
  getLegalActions(state).filter(
    (a) => a.type === 'playCard' && (a.cardId === 'bastion' || a.cardId === 'autel-de-mana'),
  );

describe('terrains (SPEC.md §4.9)', () => {
  it('se pose sur une mana zone occupée par un de ses monstres, sur la même case ; sans ATK ni mobilité', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: FORGE }], MANA);
    const after = applyAction(state, place('bastion', FORGE));
    expect(after.units.u2).toEqual({ kind: 'terrain', id: 'u2', cardId: 'bastion', owner: 1, pos: FORGE, hp: 10, maxHp: 10, statuses: [] });
    expect(getUnitsAt(after, FORGE).map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(after.players[1]).toMatchObject({ mana: 8, used: ['bastion'] });
  });

  it('refusé sur une mana zone vide ou occupée par un monstre ennemi', () => {
    const state = gameWith([{ monster: 'golem', owner: 2, at: FORGE }], MANA);
    expect(() => applyAction(state, place('bastion', FORGE))).toThrow(IllegalActionError);
    expect(() => applyAction(state, place('bastion', SCIERIE))).toThrow(IllegalActionError);
  });

  it('refusé hors mana zone, même sous un de ses monstres', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], MANA);
    expect(() => applyAction(state, place('bastion', at(8, 1)))).toThrow(IllegalActionError);
  });

  it('refusé s’il y a déjà un terrain sur la zone (§10)', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: FORGE },
        { terrain: 'autel-de-mana', owner: 1, at: FORGE },
      ],
      MANA,
    );
    expect(() => applyAction(state, place('bastion', FORGE))).toThrow(IllegalActionError);
  });

  it('le monstre peut partir : le terrain reste et tient la zone', () => {
    let state = gameWith([{ monster: 'milicien', owner: 1, at: FORGE }], { players: { 1: { mana: 2, vp: 0 } } });
    state = applyAction(state, place('bastion', FORGE));
    state = applyAction(state, move('u1', at(5, 5)));
    state = applyAction(applyAction(state, END_TURN), END_TURN);
    expect(getUnitsAt(state, FORGE).map((u) => u.id)).toEqual(['u2']);
    expect(state.players[1]).toMatchObject({
      mana: BASE_MANA_PER_TURN + MANA_PER_CONTROLLED_ZONE,
      vp: VP_PER_CONTROLLED_ZONE,
    });
  });

  it('getLegalActions propose les terrains seulement sur les zones valides', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: FORGE }, // zone valide
        { monster: 'golem', owner: 1, at: SCIERIE }, // zone qui a déjà un terrain
        { terrain: 'bastion', owner: 1, at: SCIERIE },
        { monster: 'eclaireur', owner: 1, at: at(8, 1) }, // pas une mana zone
        { monster: 'golem', owner: 2, at: MINE }, // monstre ennemi
      ],
      MANA,
    );
    expect(terrainActions(state)).toEqual([place('autel-de-mana', FORGE), place('bastion', FORGE)]);
  });
});

describe('Autel de mana (SPEC.md §6)', () => {
  it('la zone rapporte 2 mana au lieu de 1 ; le VP reste à 1', () => {
    const state = gameWith([{ terrain: 'autel-de-mana', owner: 1, at: FORGE }], {
      activePlayer: 2,
      players: { 1: { mana: 0, vp: 0 } },
    });
    expect(applyAction(state, END_TURN).players[1]).toMatchObject({ mana: BASE_MANA_PER_TURN + 2, vp: 1 });
  });
});
