import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { CARDS } from './cards';
import { at, gameWith } from './test-utils';
import { getAtk, hasKeyword } from './units';
import type { Action, CardId, GameState, MonsterUnit, UnitId } from './types';

// Dragon élémentaire - Origine (SPEC.md §6 bis, §10) : Vol ; Aura · dragons élémentaires alliés adjacents ·
// +1 ATK +1 PV +1 mobilité.

const END_TURN: Action = { type: 'endTurn' };
const monster = (state: GameState, id: UnitId) => state.units[id] as MonsterUnit;
const move = (unitId: UnitId, to: { row: number; col: number }): Action => ({ type: 'move', unitId, to });

describe('Dragon élémentaire - Origine', () => {
  it('10 mana, 7/7/7, portée 1, Vol, famille Dragon élémentaire, sans évolution', () => {
    expect(CARDS['dragon-origine']).toMatchObject({ cost: 10, atk: 7, hp: 7, mobility: 7, range: 1, archetype: 'dragon', evolvesFrom: null });
    for (const id of ['jeune-dragon', 'dragon-feu', 'dragon-eau', 'dragon-vent', 'dragon-terre'] as const) {
      expect(CARDS[id], id).toMatchObject({ archetype: 'dragon' });
    }
    const state = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(1, 4) }], {
      players: { 1: { mana: 20, grimoire: ['dragon-origine', 'dragon-feu'] as CardId[] } },
    });
    const origine = gameWith([{ monster: 'dragon-origine', owner: 1, at: at(1, 4) }]);
    expect(hasKeyword(monster(origine, 'u1'), 'vol')).toBe(true);
    const evolutions = getLegalActions(state).flatMap((a) =>
      a.type === 'activateEffect' && a.target.kind === 'card' ? [a.target.cardId] : [],
    );
    expect(evolutions).toEqual(['dragon-feu']);
  });

  it('+1 ATK aux dragons élémentaires alliés adjacents (Jeune dragon compris), pas à elle-même, ni aux autres', () => {
    const state = gameWith([
      { monster: 'dragon-origine', owner: 1, at: at(1, 4) },
      { monster: 'dragon-feu', owner: 1, at: at(1, 5) },
      { monster: 'jeune-dragon', owner: 1, at: at(2, 3) },
      { monster: 'milicien', owner: 1, at: at(0, 4) },
      { monster: 'dragon-terre', owner: 2, at: at(2, 5) },
      { monster: 'dragon-eau', owner: 1, at: at(1, 0) },
    ]);
    const atk = (id: UnitId) => getAtk(state, monster(state, id));
    expect([atk('u1'), atk('u2'), atk('u3'), atk('u4'), atk('u5'), atk('u6')]).toEqual([7, 6, 4, 2, 6, 4]);
  });

  it('+1 PV et +1 PV max en entrant dans l’aura ; en la quittant, il les perd, sans descendre sous 1 PV', () => {
    const state = gameWith([{ monster: 'dragon-origine', owner: 1, at: at(1, 4) }], {
      players: { 1: { mana: 10, grimoire: ['dragon-feu'] as CardId[] } },
    });
    const summoned = applyAction(state, { type: 'playCard', cardId: 'dragon-feu', target: { kind: 'cell', pos: at(0, 4) } });
    expect(monster(summoned, 'u2')).toMatchObject({ hp: 6, maxHp: 6, auraHp: 1 });
    expect(summoned.events).toContainEqual({ type: 'auraHp', unitId: 'u2', pos: at(0, 4), amount: 1, hp: 6 });
    const away = applyAction(summoned, move('u1', at(1, 7)));
    expect(monster(away, 'u2')).toMatchObject({ hp: 5, maxHp: 5, auraHp: 0 });
    // Blessé à 1 PV dans l'aura : il reste à 1 PV en la quittant.
    const hurt: GameState = { ...summoned, units: { ...summoned.units, u2: { ...monster(summoned, 'u2'), hp: 1 } } };
    expect(monster(applyAction(hurt, move('u1', at(1, 7))), 'u2')).toMatchObject({ hp: 1, maxHp: 5 });
  });

  it('+1 mobilité au début de son tour, s’il est adjacent à Origine à ce moment-là', () => {
    const state = gameWith([
      { monster: 'dragon-origine', owner: 1, at: at(1, 4) },
      { monster: 'dragon-feu', owner: 1, at: at(1, 3) },
      { monster: 'dragon-vent', owner: 1, at: at(1, 0) },
    ]);
    const next = applyAction(applyAction(state, END_TURN), END_TURN);
    expect(monster(next, 'u2').mobilityLeft).toBe(6);
    expect(monster(next, 'u3').mobilityLeft).toBe(7);
  });
});
