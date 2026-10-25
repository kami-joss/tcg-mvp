import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { getNextTurnMobility, statusTurnsLeft } from './statuses';
import { at, gameWith, withStatus } from './test-utils';
import type { Action, GameState, MonsterUnit, Trap } from './types';

const END_TURN: Action = { type: 'endTurn' };
const attack = (unitId: string, targetId: string, advance = false): Action => ({ type: 'attack', unitId, targetId, advance });
const actionsOf = (state: GameState, unitId: string) =>
  getLegalActions(state).filter((a) => 'unitId' in a && a.unitId === unitId).map((a) => a.type);

describe('statuts (SPEC.md §5 bis, §5.5)', () => {
  it('stun : plus aucune action, ni riposte, jusqu’à son échéance', () => {
    let state = gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(8, 1), hp: 1 },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    state = withStatus(state, 'u1', 'stun', 0, 0);
    expect(actionsOf(state, 'u1')).toEqual([]);
    expect(state.units.u1).toMatchObject({ mobilityLeft: 0 });
    expect(() => applyAction(state, attack('u1', 'u2'))).toThrow();

    const guard = withStatus(
      gameWith(
        [
          { monster: 'milicien', owner: 1, at: at(8, 1) },
          { monster: 'gardien', owner: 2, at: at(8, 2) },
        ],
        { activePlayer: 1 },
      ),
      'u2',
      'stun',
    );
    expect(applyAction(guard, attack('u1', 'u2')).units.u1?.hp).toBe(3); // pas de riposte
  });

  it('immobilisé : ne bouge plus (ni avancée), mais attaque et active ses effets', () => {
    const state = withStatus(
      gameWith(
        [
          { monster: 'mage', owner: 1, at: at(8, 1) },
          { monster: 'eclaireur', owner: 2, at: at(8, 2) },
        ],
        { players: { 1: { mana: 5 } } },
      ),
      'u1',
      'immobilise',
    );
    const kinds = actionsOf(state, 'u1');
    expect(kinds).not.toContain('move');
    expect(kinds).toContain('attack');
    expect(kinds).toContain('activateEffect');
    expect(getLegalActions(state)).not.toContainEqual(attack('u1', 'u2', true));
  });

  it('le filet du Poseur de piège immobilise jusqu’au début du prochain tour du monstre', () => {
    const trap: Trap = { owner: 1, pos: at(8, 2), effects: [{ type: 'status', kind: 'immobilise', turns: 0 }], cardId: 'poseur-de-piege' };
    let state: GameState = { ...gameWith([{ monster: 'chevalier', owner: 2, at: at(8, 1) }], { activePlayer: 2 }), traps: [trap] };
    state = applyAction(state, { type: 'move', unitId: 'u1', to: at(8, 4), path: [at(8, 2), at(8, 3), at(8, 4)] });
    expect(state.units.u1).toMatchObject({ pos: at(8, 2), mobilityLeft: 0 });
    expect(state.units.u1?.statuses).toEqual([{ kind: 'immobilise', turns: 0, expiresAtTurn: 4 }]);
    state = applyAction(applyAction(state, END_TURN), END_TURN); // son tour suivant
    expect(state.units.u1).toMatchObject({ mobilityLeft: 3, statuses: [] });
  });

  it('slow et burn se cumulent ; le burn touche à chaque tour affecté', () => {
    let state = gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }]); // mobilité 2, PV 7
    state = withStatus(state, 'u1', 'slow', 1);
    state = withStatus(state, 'u1', 'burn', 2);
    state = withStatus(state, 'u1', 'burn', 1);
    const golem = state.units.u1 as MonsterUnit;
    expect(getNextTurnMobility(golem, state.turn, state.activePlayer)).toBe(1);
    state = applyAction(state, END_TURN);
    expect(state.units.u1).toMatchObject({ hp: 4, mobilityLeft: 1 });
  });

  it('un statut « jusqu’au début de son prochain tour » ne compte plus à ce tour-là', () => {
    const state = withStatus(gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }]), 'u1', 'slow', 1, 0);
    expect(getNextTurnMobility(state.units.u1 as MonsterUnit, state.turn, state.activePlayer)).toBe(2);
    expect(applyAction(state, END_TURN).units.u1).toMatchObject({ mobilityLeft: 2, statuses: [] });
  });

  it('sur un terrain, seul burn s’applique', () => {
    let state = gameWith([{ terrain: 'bastion', owner: 2, at: at(5, 4) }]);
    state = withStatus(state, 'u1', 'slow', 1);
    state = withStatus(state, 'u1', 'stun');
    state = withStatus(state, 'u1', 'burn', 1);
    expect(state.units.u1?.statuses.map((s) => s.kind)).toEqual(['burn']);
  });

  it('durée en tours de la cible : burn 1 pendant 2 tours fait perdre 1 PV au début de ses 2 prochains tours', () => {
    let state = withStatus(gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }]), 'u1', 'burn', 1, 2); // PV 7
    expect(state.units.u1?.statuses).toEqual([{ kind: 'burn', amount: 1, turns: 2, expiresAtTurn: 5 }]);
    state = applyAction(state, END_TURN); // tour 2 (J2) : 1er tour affecté
    expect(state.units.u1?.hp).toBe(6);
    state = applyAction(applyAction(state, END_TURN), END_TURN); // tour 4 (J2) : 2e tour affecté
    expect(state.units.u1?.hp).toBe(5);
    expect(state.units.u1?.statuses).toHaveLength(1);
    state = applyAction(state, END_TURN); // tour 5 (J1) : le statut disparaît
    expect(state.units.u1?.statuses).toEqual([]);
    state = applyAction(state, END_TURN); // tour 6 (J2) : plus de perte
    expect(state.units.u1?.hp).toBe(5);
  });

  it('stun pendant 2 tours : aucune action pendant les 2 prochains tours de la cible', () => {
    let state = withStatus(gameWith([{ monster: 'eclaireur', owner: 2, at: at(8, 1) }]), 'u1', 'stun', 0, 2);
    state = applyAction(state, END_TURN); // tour 2 (J2)
    expect(actionsOf(state, 'u1')).toEqual([]);
    state = applyAction(applyAction(state, END_TURN), END_TURN); // tour 4 (J2)
    expect(actionsOf(state, 'u1')).toEqual([]);
    state = applyAction(applyAction(state, END_TURN), END_TURN); // tour 6 (J2) : libre
    expect(actionsOf(state, 'u1')).toContain('move');
  });

  it('tours restants d’un statut, vus depuis le tour en cours', () => {
    const state = withStatus(gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }]), 'u1', 'slow', 1, 2);
    const status = state.units.u1!.statuses[0]!;
    expect(statusTurnsLeft(status, 2, 1, 1)).toBe(2); // tour 1, de J1 : ses 2 prochains tours
    expect(statusTurnsLeft(status, 2, 2, 2)).toBe(2); // tour 2, le sien : celui-ci et le suivant
    expect(statusTurnsLeft(status, 2, 3, 1)).toBe(1);
    expect(statusTurnsLeft(status, 2, 4, 2)).toBe(1);
    const net = withStatus(gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }]), 'u1', 'immobilise', 0, 0);
    expect(statusTurnsLeft(net.units.u1!.statuses[0]!, 2, 1, 1)).toBe(0); // jusqu'à son prochain tour
  });
});
