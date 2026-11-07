import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, getPlayerView } from '../../engine';
import type { Action } from '../../engine';
import { at, gameWith } from '../../engine/test-utils';
import type { UnitSpec } from '../../engine/test-utils';
import { cameraFocusOf } from './cameraFocus';

function focusFor(action: Action, units: UnitSpec[], viewer: 1 | 2) {
  const state = gameWith(units);
  const before = getPlayerView(state, viewer);
  const { events } = getPlayerView(applyAction(state, action), viewer);
  return cameraFocusOf(events, before, viewer);
}

describe('caméra : l’action d’un monstre adverse', () => {
  it('attaque : la case de l’attaquant ennemi', () => {
    const units: UnitSpec[] = [
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ];
    // J1 attaque : J2 regarde l'attaquant de J1.
    expect(focusFor({ type: 'attack', unitId: 'u1', targetId: 'u2', advance: false }, units, 2)).toEqual(at(8, 1));
  });

  it('attaque de son propre monstre : pas de recentrage', () => {
    const units: UnitSpec[] = [
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ];
    expect(focusFor({ type: 'attack', unitId: 'u1', targetId: 'u2', advance: false }, units, 1)).toBeNull();
  });

  it('déplacement : la case d’arrivée', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    const move = getLegalActions(state).find((a) => a.type === 'move' && a.to.col === 4 && a.to.row === 8);
    expect(move).toBeDefined();
    const before = getPlayerView(state, 2);
    const { events } = getPlayerView(applyAction(state, move!), 2);
    expect(cameraFocusOf(events, before, 2)).toEqual(at(8, 4));
  });

  it('pas d’événement d’un monstre : rien', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    const before = getPlayerView(state, 2);
    const { events } = getPlayerView(applyAction(state, { type: 'endTurn' }), 2);
    expect(cameraFocusOf(events, before, 2)).toBeNull();
  });
});
