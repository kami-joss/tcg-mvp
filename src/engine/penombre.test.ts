import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { CARDS } from './cards';
import { at, gameWith } from './test-utils';
import { isHiddenFrom } from './stealth';
import { getPlayerView } from './view';
import type { Action, CardId, GameState, UnitId } from './types';

// Pénombre (SPEC.md §6 bis, §10) : Tous les monstres piège alliés · invisible 2 pendant 1 tour.

const PENOMBRE: Action = { type: 'playCard', cardId: 'penombre', target: { kind: 'all' } };
const END_TURN: Action = { type: 'endTurn' };
const GRIMOIRE = { players: { 1: { mana: 10, grimoire: ['penombre', 'poseur-de-bombe'] as CardId[] } } };
const hidden = (state: GameState, id: UnitId) => isHiddenFrom(state, state.units[id]!, 2);

const state = gameWith(
  [
    { monster: 'poseur-de-piege', owner: 1, at: at(1, 1) },
    { monster: 'clown-assassin', owner: 1, at: at(2, 7) },
    { monster: 'milicien', owner: 1, at: at(1, 4) },
    { monster: 'golem', owner: 2, at: at(8, 1) },
  ],
  GRIMOIRE,
);

describe('Pénombre', () => {
  it('sort à 5 mana ; famille Piège = les 4 monstres du deck Pièges ; injouable sans monstre piège', () => {
    expect(CARDS.penombre).toMatchObject({ kind: 'spell', cost: 5 });
    for (const id of ['poseur-de-piege', 'farceur', 'poseur-de-bombe', 'clown-assassin'] as const) {
      expect(CARDS[id], id).toMatchObject({ family: 'piege' });
    }
    const none = gameWith([{ monster: 'milicien', owner: 1, at: at(1, 4) }], GRIMOIRE);
    expect(getLegalActions(none).some((a) => a.type === 'playCard' && a.cardId === 'penombre')).toBe(false);
    expect(getLegalActions(state)).toContainEqual(PENOMBRE);
  });

  it('tous ses monstres piège deviennent invisibles (Invisible 2), les autres non', () => {
    const after = applyAction(state, PENOMBRE);
    expect(after.players[1].mana).toBe(5);
    expect(after.units.u1?.statuses).toMatchObject([{ kind: 'invisible', amount: 2, turns: 1 }]);
    expect(after.units.u2?.statuses).toMatchObject([{ kind: 'invisible', amount: 2, turns: 1 }]);
    expect(after.units.u3?.statuses).toEqual([]);
    expect(Object.keys(getPlayerView(after, 2).units).sort()).toEqual(['u3', 'u4']);
    expect(Object.keys(getPlayerView(after, 1).units).sort()).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('comme Invisible 2 : vu dès qu’une unité adverse est à 2 cases ou moins', () => {
    const near: GameState = {
      ...applyAction(state, PENOMBRE),
    };
    const golem = near.units.u4!;
    const close: GameState = { ...near, units: { ...near.units, u4: { ...golem, pos: at(3, 1) } } };
    expect(hidden(close, 'u1')).toBe(false);
    expect(hidden(close, 'u2')).toBe(true);
  });

  it('jusqu’à la fin de son prochain tour ; un monstre piège invoqué ensuite n’en profite pas', () => {
    const cast = applyAction(state, PENOMBRE);
    const summoned = applyAction(cast, { type: 'playCard', cardId: 'poseur-de-bombe', target: { kind: 'cell', pos: at(0, 3) } });
    expect(summoned.units.u5?.statuses).toEqual([]);
    const theirTurn = applyAction(summoned, END_TURN);
    expect(hidden(theirTurn, 'u1')).toBe(true);
    const myNextTurn = applyAction(theirTurn, END_TURN);
    expect(hidden(myNextTurn, 'u1')).toBe(true);
    const after = applyAction(myNextTurn, END_TURN);
    expect(hidden(after, 'u1')).toBe(false);
    expect(after.units.u1?.statuses).toEqual([]);
  });
});
