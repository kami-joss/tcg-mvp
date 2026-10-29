import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { IllegalActionError } from './errors';
import { at, gameWith } from './test-utils';
import type { GameState, Position, Status } from './types';

// Un monstre ne s'arrête jamais sur un autre (SPEC.md §10) : on ne traverse pas un allié stun ou immobilisé, et un
// arrêt forcé sur la case d'un allié le renvoie à la dernière case libre de son chemin.

const destinations = (state: GameState, unitId: string) =>
  getLegalActions(state).flatMap((a) => (a.type === 'move' && a.unitId === unitId ? [`${a.to.row},${a.to.col}`] : []));
const move = (to: Position, path: Position[]) => ({ type: 'move' as const, unitId: 'u1', to, path });
const IMMOBILISE: Status = { kind: 'immobilise', turns: 0, expiresAtTurn: 3 };

describe('alliés stun ou immobilisés : on ne les traverse pas', () => {
  const base = gameWith([
    { monster: 'eclaireur', owner: 1, at: at(1, 2) },
    { monster: 'golem', owner: 1, at: at(1, 3) },
  ]);
  const blocked = (status: Status): GameState => ({
    ...base,
    units: { ...base.units, u2: { ...base.units.u2!, statuses: [status] } as never },
  });

  it('un allié libre se traverse ; immobilisé ou stun, il bloque le passage', () => {
    expect(destinations(base, 'u1')).toContain('1,4');
    for (const status of [IMMOBILISE, { kind: 'stun', turns: 1, expiresAtTurn: 3 } as Status]) {
      const state = blocked(status);
      expect(() => applyAction(state, move(at(1, 4), [at(1, 3), at(1, 4)])), status.kind).toThrow(IllegalActionError);
    }
  });
});

describe('arrêt forcé sur un allié : retour à la dernière case libre', () => {
  it('immobilisé par la Fissure temporelle en traversant un allié : il revient avant lui, sans mobilité', () => {
    const state = gameWith([
      { monster: 'eclaireur', owner: 1, at: at(1, 2) },
      { monster: 'golem', owner: 1, at: at(1, 4) },
      { terrain: 'fissure-temporelle', owner: 2, at: at(2, 5) },
    ]);
    const after = applyAction(state, move(at(1, 5), [at(1, 3), at(1, 4), at(1, 5)]));
    expect(after.units.u1).toMatchObject({ pos: at(1, 3), mobilityLeft: 0 });
    expect(after.units.u1?.statuses.map((s) => s.kind)).toEqual(['immobilise']);
    expect(after.units.u2?.pos).toEqual(at(1, 4));
    expect(after.events).toContainEqual({ type: 'stopped', unitId: 'u1', pos: at(1, 3) });
  });

  it('le second monstre immobilisé dans la zone ne peut plus passer sur le premier', () => {
    let state = gameWith([
      { monster: 'eclaireur', owner: 1, at: at(1, 2) },
      { monster: 'eclaireur', owner: 1, at: at(0, 4) },
      { terrain: 'fissure-temporelle', owner: 2, at: at(2, 5) },
    ]);
    state = applyAction(state, { type: 'move', unitId: 'u2', to: at(1, 4), path: [at(1, 4)] });
    expect(state.units.u2?.statuses.map((s) => s.kind)).toEqual(['immobilise']);
    expect(destinations(state, 'u1')).not.toContain('1,5');
  });
});
