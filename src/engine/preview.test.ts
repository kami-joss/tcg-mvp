import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { previewAttack } from './combat';
import { at, gameWith } from './test-utils';
import type { Action, GameState, MonsterUnit, Unit } from './types';

// Aperçu d'une attaque sans la résoudre (handoff V10, lot 11 : bulle d'action).

const monster = (state: GameState, id: string) => state.units[id] as MonsterUnit;
const preview = (state: GameState, attackerId = 'u1', targetId = 'u2') =>
  previewAttack(state, monster(state, attackerId), state.units[targetId] as Unit);
const attack = (advance = false): Action => ({ type: 'attack', unitId: 'u1', targetId: 'u2', advance });

describe('aperçu d’attaque', () => {
  it('dégâts et PV après : ceux de l’attaque résolue', () => {
    const state = gameWith([
      { monster: 'golem', owner: 1, at: at(5, 4) },
      { monster: 'chevalier', owner: 2, at: at(5, 5) },
    ]);
    expect(preview(state)).toMatchObject({ damage: 4, hpBefore: 4, hpAfter: 0, destroys: true, riposte: 0 });
    const after = applyAction(state, attack());
    expect(after.units.u2).toBeUndefined();
  });

  it('avancée possible si l’attaque détruit au contact ; jamais à distance (§4.7)', () => {
    const melee = gameWith([
      { monster: 'golem', owner: 1, at: at(5, 4) },
      { monster: 'eclaireur', owner: 2, at: at(5, 5) },
    ]);
    expect(preview(melee).canAdvance).toBe(true);
    const advanced = applyAction(melee, attack(true));
    expect(advanced.units.u1).toMatchObject({ pos: at(5, 5) });
    const ranged = gameWith([
      { monster: 'archer', owner: 1, at: at(5, 3) },
      { monster: 'eclaireur', owner: 2, at: at(5, 5) },
    ]);
    expect(preview(ranged)).toMatchObject({ destroys: true, canAdvance: false });
    const survives = gameWith([
      { monster: 'milicien', owner: 1, at: at(5, 4) },
      { monster: 'golem', owner: 2, at: at(5, 5) },
    ]);
    expect(preview(survives)).toMatchObject({ destroys: false, hpAfter: 5, canAdvance: false });
  });

  it('statuts posés sur une cible qui survit (Givre), pas sur une cible détruite', () => {
    const state = gameWith([
      { monster: 'archer-de-glace', owner: 1, at: at(5, 3) },
      { monster: 'golem', owner: 2, at: at(5, 5) },
    ]);
    expect(preview(state).statuses).toEqual([{ kind: 'slow', amount: 1, turns: 1 }]);
    expect(applyAction(state, attack()).units.u2?.statuses.map((s) => s.kind)).toEqual(['slow']);
    const kill = gameWith([
      { monster: 'archer-de-glace', owner: 1, at: at(5, 3) },
      { monster: 'eclaireur', owner: 2, at: at(5, 5) },
    ]);
    expect(preview(kill).statuses).toEqual([]);
  });

  it('riposte au contact d’un monstre qui survit, pas à distance ni déjà utilisée', () => {
    const state = gameWith([
      { monster: 'milicien', owner: 1, at: at(5, 4) },
      { monster: 'gardien', owner: 2, at: at(5, 5) },
    ]);
    expect(preview(state)).toMatchObject({ riposte: 1, attackerHpAfter: 2 });
    expect(applyAction(state, attack()).units.u1?.hp).toBe(2);
    const used = gameWith([
      { monster: 'milicien', owner: 1, at: at(5, 4) },
      { monster: 'gardien', owner: 2, at: at(5, 5), hasRiposted: true },
    ]);
    expect(preview(used).riposte).toBe(0);
    const ranged = gameWith([
      { monster: 'archer', owner: 1, at: at(5, 3) },
      { monster: 'gardien', owner: 2, at: at(5, 5) },
    ]);
    expect(preview(ranged).riposte).toBe(0);
  });

  it('par derrière : le bonus du Clown assassin', () => {
    // Le golem regarde vers la droite : le clown, à sa gauche, frappe dans son dos.
    const state = gameWith([
      { monster: 'clown-assassin', owner: 1, at: at(5, 4) },
      { monster: 'golem', owner: 2, at: at(5, 5), facing: 'right' },
    ]);
    expect(preview(state)).toMatchObject({ behind: true, damage: 6, hpAfter: 1 });
    expect(applyAction(state, attack()).units.u2?.hp).toBe(1);
  });
});
