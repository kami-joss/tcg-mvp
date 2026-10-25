import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView } from '../../engine';
import type { Action, GameState, PlayerView } from '../../engine';
import { at, gameWith, withStatus } from '../../engine/test-utils';
import { applyEvent } from './patch';

/** Vue d'avant, à laquelle on applique tous les événements de l'action, comparée à la vraie vue d'après. */
function replay(state: GameState, action: Action, viewer = state.activePlayer) {
  const before = getPlayerView(state, viewer);
  const after = getPlayerView(applyAction(state, action), viewer);
  const replayed = after.events.reduce((view: PlayerView, event) => applyEvent(view, event, after), before);
  return { replayed, after };
}

describe('état intermédiaire des animations', () => {
  it('après tous les événements, plateau, mana et VP sont ceux de la vraie vue', () => {
    const state = gameWith(
      [
        { monster: 'chevalier', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) },
        { monster: 'milicien', owner: 1, at: at(9, 5) },
      ],
      { players: { 1: { mana: 6 } } },
    );
    const cases: Action[] = [
      { type: 'attack', unitId: 'u1', targetId: 'u2', advance: true },
      { type: 'move', unitId: 'u3', to: at(8, 6) },
      { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } },
      { type: 'playCard', cardId: 'benediction', target: { kind: 'unit', unitId: 'u3' } },
    ];
    for (const action of cases) {
      const { replayed, after } = replay(state, action);
      expect(replayed.units, action.type).toEqual(after.units);
      expect(replayed.me.mana).toBe(after.me.mana);
      expect(replayed.me.vp).toBe(after.me.vp);
      expect(replayed.me.grimoire).toEqual(after.me.grimoire);
    }
  });

  it('début de tour vu par le joueur qui commence : mana, VP et brûlures', () => {
    const state = gameWith([{ monster: 'milicien', owner: 2, at: at(5, 4) }]);
    const burning = withStatus(state, 'u1', 'burn', 1);
    const before = getPlayerView(burning, 2);
    const after = getPlayerView(applyAction(burning, { type: 'endTurn' }), 2);
    const replayed = after.events.reduce((view: PlayerView, event) => applyEvent(view, event, after), before);
    expect(replayed.me.mana).toBe(after.me.mana);
    expect(replayed.me.vp).toBe(after.me.vp);
    expect(replayed.units.u1?.hp).toBe(after.units.u1?.hp);
  });
});

describe('zone en ligne : le dragon se tourne', () => {
  it('pendant l’animation, il regarde dans la direction choisie, puis les ennemis reculent', () => {
    const state = gameWith(
      [
        { monster: 'dragon-vent', owner: 1, at: at(8, 1), facing: 'up' },
        { monster: 'milicien', owner: 2, at: at(8, 2) },
        { monster: 'milicien', owner: 2, at: at(8, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    const action: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'area', direction: 'right', distance: 2 } };
    const { replayed, after } = replay(state, action);
    expect(replayed.units).toEqual(after.units);
    const effect = after.events.find((e) => e.type === 'effect')!;
    expect(applyEvent(getPlayerView(state, 1), effect, after).units.u1).toMatchObject({ facing: 'right' });
  });
});
