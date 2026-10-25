import { describe, expect, it } from 'vitest';
import { applyAction } from '../../engine';
import type { GameState } from '../../engine';
import { at, gameWith } from '../../engine/test-utils';
import { eventSounds } from './events';
import { RECIPES } from './recipes';

const cardOf = (state: GameState) => (unitId: string) => state.units[unitId]?.cardId;

describe('sons sans animation (handoff, lot 4)', () => {
  it('un tir de l’Archer du feu : flèche enflammée, impact, puis brûlure', () => {
    const state = gameWith([
      { monster: 'archer-du-feu', owner: 1, at: at(8, 1) },
      { monster: 'golem', owner: 2, at: at(8, 3) },
    ]);
    const after = applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false });
    expect(eventSounds(after.events, cardOf(state)).map(([name]) => name)).toEqual(['fire', 'hit', 'burn']);
  });

  it('un déplacement : un pas par case, 0,21 s d’écart', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    const after = applyAction(state, { type: 'move', unitId: 'u1', to: at(8, 3), path: [at(8, 2), at(8, 3)] });
    expect(eventSounds(after.events)).toEqual([
      ['step', 0],
      ['step', 0.21],
    ]);
  });

  it('une bombe déclenchée : explosion, impact fort, mort', () => {
    const state: GameState = {
      ...gameWith([{ monster: 'eclaireur', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      traps: [{ owner: 1, pos: at(8, 2), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe' }],
    };
    const after = applyAction(state, { type: 'move', unitId: 'u1', to: at(8, 2) });
    expect(eventSounds(after.events).map(([name]) => name)).toEqual(['step', 'bomb', 'hitHard', 'death', 'vp']);
  });

  it('chaque son a sa recette de synthèse', () => {
    for (const [name] of eventSounds([{ type: 'turnStart', player: 1, turn: 1 }])) expect(RECIPES[name]).toBeTypeOf('function');
  });
});
