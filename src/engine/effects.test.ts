import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { IllegalActionError } from './errors';
import { at, deepFreeze, gameWith } from './test-utils';
import type { Action, GameState, UnitId } from './types';

const activate = (unitId: UnitId, targetId: UnitId): Action => ({
  type: 'activateEffect',
  unitId,
  target: { kind: 'unit', unitId: targetId },
});
const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const END_TURN: Action = { type: 'endTurn' };
const MANA = { players: { 1: { mana: 10 } } };
const effectActions = (state: GameState) => getLegalActions(state).filter((a) => a.type === 'activateEffect');

describe('effets activés (SPEC.md §4.8)', () => {
  const chamanWithWoundedGolem = () =>
    gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(8, 2), hp: 1 },
      ],
      MANA,
    );

  it('coûtent leur mana et ne servent qu’une fois par tour', () => {
    const state = applyAction(chamanWithWoundedGolem(), activate('u1', 'u2'));
    expect(state.players[1].mana).toBe(9);
    expect(state.units.u1).toMatchObject({ hasUsedEffect: true });
    expect(() => applyAction(state, activate('u1', 'u2'))).toThrow(/déjà utilisé/);
    expect(effectActions(state)).toEqual([]);
  });

  it('redeviennent disponibles au début du tour suivant du joueur', () => {
    let state = applyAction(chamanWithWoundedGolem(), activate('u1', 'u2'));
    state = applyAction(applyAction(state, END_TURN), END_TURN);
    expect(applyAction(state, activate('u1', 'u2')).units.u2?.hp).toBe(5);
  });

  it('n’utilisent pas l’attaque : le monstre peut attaquer et utiliser son effet dans le même tour', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(8, 1) }, // ATK 3, effet : 2 dégâts
        { monster: 'golem', owner: 2, at: at(8, 2) }, // PV 7
      ],
      MANA,
    );
    const attackFirst = applyAction(applyAction(state, attack('u1', 'u2')), activate('u1', 'u2'));
    const effectFirst = applyAction(applyAction(state, activate('u1', 'u2')), attack('u1', 'u2'));
    expect(attackFirst.units.u2?.hp).toBe(2);
    expect(effectFirst.units.u2?.hp).toBe(2);
  });

  it('Chaman : « adjacent » = les 8 cases autour, diagonales comprises', () => {
    const state = gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(7, 2), hp: 1 }, // en diagonale
        { monster: 'golem', owner: 1, at: at(8, 3), hp: 1 }, // à 2 cases
      ],
      MANA,
    );
    const targets = effectActions(state).map((a) => (a.type === 'activateEffect' && a.target.kind === 'unit' ? a.target.unitId : null));
    expect(targets).toEqual(['u2']);
    expect(applyAction(state, activate('u1', 'u2')).units.u2?.hp).toBe(3);
  });

  it('sont refusés si le mana est insuffisant', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(8, 1) }, // effet : 2 mana
        { monster: 'golem', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { mana: 1 } } },
    );
    expect(() => applyAction(state, activate('u1', 'u2'))).toThrow(/Mana insuffisant/);
    expect(effectActions(state)).toEqual([]);
  });

  it('un monstre sans effet activé ne peut pas en utiliser', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(8, 2), hp: 1 },
      ],
      MANA,
    );
    expect(() => applyAction(state, activate('u1', 'u2'))).toThrow(/pas d'effet activé/);
  });

  it('seul le joueur actif utilise les effets de ses monstres', () => {
    const state = gameWith(
      [
        { monster: 'chaman', owner: 2, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2), hp: 1 },
      ],
      { players: { 2: { mana: 10 } } },
    );
    expect(() => applyAction(state, activate('u1', 'u2'))).toThrow(/joueur actif/);
  });

  it('un monstre tout juste invoqué peut utiliser son effet (§4.5)', () => {
    let state = gameWith([{ monster: 'milicien', owner: 1, at: at(1, 4), hp: 1 }], { players: { 1: { mana: 3 } } });
    state = applyAction(state, { type: 'playCard', cardId: 'chaman', target: { kind: 'cell', pos: at(0, 4) } });
    state = applyAction(state, activate('u2', 'u1'));
    expect(state.units.u1?.hp).toBe(3);
    expect(state.players[1].mana).toBe(0);
  });

  it('ne mute pas l’état et est déterministe', () => {
    const state = deepFreeze(chamanWithWoundedGolem());
    const snapshot = structuredClone(state);
    const a = applyAction(state, activate('u1', 'u2'));
    const b = applyAction(state, activate('u1', 'u2'));
    expect(state).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('Chaman : rend 2 PV à un allié adjacent (SPEC.md §6)', () => {
  it('rend 2 PV à un monstre allié adjacent', () => {
    const state = gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 1, at: at(8, 2), hp: 1 },
      ],
      MANA,
    );
    expect(applyAction(state, activate('u1', 'u2')).units.u2?.hp).toBe(3);
  });

  it('sans dépasser ses PV max', () => {
    const state = gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(8, 2), hp: 6 },
      ],
      MANA,
    );
    expect(applyAction(state, activate('u1', 'u2')).units.u2?.hp).toBe(7);
  });

  it('ne soigne pas un allié qui a déjà tous ses PV (§10)', () => {
    const state = gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(8, 2) },
      ],
      MANA,
    );
    expect(() => applyAction(state, activate('u1', 'u2'))).toThrow(IllegalActionError);
    expect(effectActions(state)).toEqual([]);
  });

  it('ne vise ni un allié à distance, ni un ennemi, ni lui-même, ni un terrain (§10)', () => {
    const state = gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(5, 3), hp: 1 }, // blessé lui-même
        { monster: 'milicien', owner: 1, at: at(5, 1), hp: 1 }, // allié à 2 cases
        { monster: 'milicien', owner: 2, at: at(6, 3), hp: 1 }, // ennemi adjacent
        { terrain: 'bastion', owner: 1, at: at(5, 4), hp: 1 }, // terrain allié adjacent
      ],
      MANA,
    );
    for (const target of ['u1', 'u2', 'u3', 'u4']) {
      expect(() => applyAction(state, activate('u1', target)), target).toThrow(IllegalActionError);
    }
    expect(effectActions(state)).toEqual([]);
  });
});

describe('Mage : 2 dégâts à un ennemi à portée 2 (SPEC.md §6)', () => {
  it('inflige 2 dégâts à un monstre ennemi en ligne droite, à 1 ou 2 cases', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 3) }, // à 2 cases
        { monster: 'golem', owner: 2, at: at(9, 1) }, // adjacent
      ],
      MANA,
    );
    expect(applyAction(state, activate('u1', 'u2')).units.u2?.hp).toBe(5);
    expect(applyAction(state, activate('u1', 'u3')).units.u3?.hp).toBe(5);
  });

  it('ne vise ni en diagonale, ni au-delà de 2 cases', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(7, 2) },
        { monster: 'golem', owner: 2, at: at(5, 1) },
      ],
      MANA,
    );
    expect(effectActions(state)).toEqual([]);
    expect(() => applyAction(state, activate('u1', 'u2'))).toThrow(IllegalActionError);
    expect(() => applyAction(state, activate('u1', 'u3'))).toThrow(IllegalActionError);
  });

  it('même ligne de vue qu’une attaque : bloquée par une unité ou une case X', () => {
    const blockedByUnit = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(8, 3) },
      ],
      MANA,
    );
    expect(() => applyAction(blockedByUnit, activate('u1', 'u3'))).toThrow(IllegalActionError);

    // (3,3) → (3,5) : la case intermédiaire (3,4) est un X.
    const blockedByX = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(3, 3) },
        { monster: 'golem', owner: 2, at: at(3, 5) },
      ],
      MANA,
    );
    expect(() => applyAction(blockedByX, activate('u1', 'u2'))).toThrow(IllegalActionError);
  });

  it('ne vise pas un terrain (§10), qui bloque aussi la ligne de vue', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(5, 3) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
        { monster: 'golem', owner: 2, at: at(5, 5) },
      ],
      MANA,
    );
    expect(effectActions(state)).toEqual([]);
  });

  it('sur une case avec un monstre et un terrain, vise le monstre', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(5, 3) },
        { monster: 'golem', owner: 2, at: at(5, 4) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
      ],
      MANA,
    );
    const after = applyAction(state, activate('u1', 'u2'));
    expect(after.units.u2?.hp).toBe(5);
    expect(after.units.u3?.hp).toBe(10);
  });

  it('détruire un monstre avec l’effet rapporte 1 VP (§4.7)', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 3) },
      ],
      MANA,
    );
    const after = applyAction(state, activate('u1', 'u2'));
    expect(after.units.u2).toBeUndefined();
    expect(after.players[1].vp).toBe(1);
  });

  it('ne déclenche pas la riposte, même depuis une case adjacente (§10)', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(8, 1) },
        { monster: 'gardien', owner: 2, at: at(8, 2) },
      ],
      MANA,
    );
    const after = applyAction(state, activate('u1', 'u2'));
    expect(after.units.u2?.hp).toBe(4);
    expect(after.units.u1?.hp).toBe(3);
  });
});

describe('getLegalActions — effets activés', () => {
  it('propose chaque cible valide, et toutes sont acceptées', () => {
    const state = gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(8, 1) }, // u1
        { monster: 'milicien', owner: 1, at: at(8, 2), hp: 1 }, // u2 : blessé, adjacent au Chaman
        { monster: 'mage', owner: 1, at: at(9, 2) }, // u3
        { monster: 'golem', owner: 2, at: at(9, 4) }, // u4 : à 2 cases du Mage
      ],
      MANA,
    );
    const actions = effectActions(state);
    expect(actions).toHaveLength(2);
    expect(actions).toEqual(expect.arrayContaining([activate('u1', 'u2'), activate('u3', 'u4')]));
    for (const action of actions) expect(() => applyAction(state, action)).not.toThrow();
  });
});
