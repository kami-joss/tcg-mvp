import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { getPlayerView } from './view';
import { at, gameWith, withStatus } from './test-utils';
import type { Action, GameEvent, GameState } from './types';

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const END_TURN: Action = { type: 'endTurn' };

describe('événements des actions (handoff, lot 2)', () => {
  it('un déplacement : un pas par case, puis le piège qui l’arrête', () => {
    const base = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    const state: GameState = { ...base, traps: [{ owner: 2, pos: at(8, 2), effects: [{ type: 'status', kind: 'immobilise', turns: 0 }], cardId: 'poseur-de-piege' }] };
    const after = applyAction(state, { type: 'move', unitId: 'u1', to: at(8, 4), path: [at(8, 2), at(8, 3), at(8, 4)] });
    expect(after.events).toEqual([
      { type: 'step', unitId: 'u1', from: at(8, 1), to: at(8, 2), kind: 'walk' },
      { type: 'trapTriggered', trap: state.traps[0], unitId: 'u1' },
      {
        type: 'status',
        unitId: 'u1',
        pos: at(8, 2),
        status: { kind: 'immobilise', turns: 0, expiresAtTurn: 3 },
      },
    ]);
  });

  it('une attaque qui détruit : attaque, dégâts, destruction, VP sur la case', () => {
    const state = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'eclaireur', owner: 2, at: at(8, 2) },
    ]);
    const after = applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: true });
    expect(types(after.events)).toEqual(['attack', 'damage', 'destroyed', 'vp', 'step']);
    expect(after.events[1]).toMatchObject({ amount: 3, hp: 0, cause: 'attack' });
    expect(after.events[3]).toEqual({ type: 'vp', player: 1, amount: 1, pos: at(8, 2) });
    expect(after.events[4]).toMatchObject({ kind: 'advance', to: at(8, 2) });
  });

  it('une invocation : carte jouée, mana dépensé, unité posée', () => {
    const after = applyAction(gameWith([]), { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } });
    expect(types(after.events)).toEqual(['cardPlayed', 'mana', 'summon']);
    expect(after.events[1]).toEqual({ type: 'mana', player: 1, amount: -2, pos: null });
  });

  it('chaque action repart d’une liste vide', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    const moved = applyAction(state, { type: 'move', unitId: 'u1', to: at(8, 2) });
    expect(applyAction(moved, { type: 'move', unitId: 'u1', to: at(8, 3) }).events).toHaveLength(1);
  });

  it('début de tour : mana de base, mana et VP de chaque zone, puis les brûlures', () => {
    const state = gameWith([
      { monster: 'milicien', owner: 2, at: at(5, 4), hp: 3 },
      { monster: 'eclaireur', owner: 2, at: at(8, 1) },
    ]);
    const burning = withStatus(state, 'u2', 'burn', 1);
    const after = applyAction(burning, END_TURN);
    expect(types(after.events)).toEqual(['turnStart', 'mana', 'mana', 'vp', 'damage', 'destroyed', 'vp']);
    expect(after.events[2]).toEqual({ type: 'mana', player: 2, amount: 1, pos: at(5, 4) });
    expect(after.events[4]).toMatchObject({ cause: 'burn', unitId: 'u2' });
  });

  it('la pose d’un piège n’est visible que de son poseur', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(8, 1) }], { players: { 1: { mana: 5 } } });
    const after = applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(8, 2) } });
    expect(types(getPlayerView(after, 1).events)).toEqual(['effect', 'mana', 'trapPlaced']);
    expect(types(getPlayerView(after, 2).events)).toEqual(['effect', 'mana']);
    expect(JSON.stringify(getPlayerView(after, 2).events)).not.toMatch(/root|8,"col":2/);
  });

  it('les pas d’un Farceur invisible ne sont visibles que de son camp', () => {
    const state = gameWith([{ monster: 'farceur', owner: 1, at: at(1, 0) }]);
    const after = applyAction(state, { type: 'move', unitId: 'u1', to: at(1, 2) });
    expect(types(getPlayerView(after, 1).events)).toEqual(['step', 'step']);
    expect(getPlayerView(after, 2).events).toEqual([]);
  });
});
