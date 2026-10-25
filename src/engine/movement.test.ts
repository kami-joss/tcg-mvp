import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { isPlayable } from './board';
import { IllegalActionError } from './errors';
import { getMoveDestinations } from './movement';
import { at, deepFreeze, gameWith } from './test-utils';
import { getUnitsAt } from './units';
import type { Action, GameState, Position, UnitId } from './types';

const move = (unitId: UnitId, to: Position): Action => ({ type: 'move', unitId, to });

/** Destinations de l'unité, avec leur coût. */
function destinations(state: GameState, unitId: UnitId) {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') throw new Error(`${unitId} n'est pas un monstre`);
  return getMoveDestinations(state, unit);
}
const destinationCells = (state: GameState, unitId: UnitId) => destinations(state, unitId).map((d) => d.pos);

describe('déplacement (SPEC.md §4.6)', () => {
  describe('orthogonal, 1 point de mobilité par case', () => {
    it('dépense la longueur du plus court chemin', () => {
      const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1) }]); // mobilité 3
      const after = applyAction(state, move('u1', at(8, 3)));
      expect(after.units.u1).toMatchObject({ pos: at(8, 3), mobilityLeft: 1 });
    });

    it('pas de diagonale : avec 1 de mobilité, seuls les 4 voisins orthogonaux sont atteignables', () => {
      const state = gameWith([{ monster: 'gardien', owner: 1, at: at(8, 1) }]); // mobilité 1
      expect(destinations(state, 'u1')).toEqual(
        expect.arrayContaining([
          { pos: at(7, 1), cost: 1 },
          { pos: at(9, 1), cost: 1 },
          { pos: at(8, 0), cost: 1 },
          { pos: at(8, 2), cost: 1 },
        ]),
      );
      expect(destinations(state, 'u1')).toHaveLength(4);
      expect(() => applyAction(state, move('u1', at(7, 2)))).toThrow(IllegalActionError);
    });

    it('ne peut pas dépasser la mobilité restante', () => {
      const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1) }]); // mobilité 3
      expect(() => applyAction(state, move('u1', at(6, 2)))).not.toThrow(); // distance 3
      expect(() => applyAction(state, move('u1', at(6, 3)))).toThrow(IllegalActionError); // distance 4
    });

    it('sans mobilité restante, aucun déplacement', () => {
      const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1), mobilityLeft: 0 }]);
      expect(destinations(state, 'u1')).toEqual([]);
    });

    it('la mobilité peut être fractionnée en plusieurs déplacements', () => {
      let state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1) }]); // mobilité 3
      state = applyAction(state, move('u1', at(8, 2)));
      expect(state.units.u1).toMatchObject({ mobilityLeft: 2 });
      state = applyAction(state, move('u1', at(9, 3)));
      expect(state.units.u1).toMatchObject({ pos: at(9, 3), mobilityLeft: 0 });
      expect(() => applyAction(state, move('u1', at(9, 2)))).toThrow(IllegalActionError);
    });

    it('rester sur place n’est pas un déplacement', () => {
      const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1) }]);
      expect(() => applyAction(state, move('u1', at(8, 1)))).toThrow(IllegalActionError);
    });
  });

  describe('cases X et hors plateau', () => {
    it('ne traverse pas une case X : il faut la contourner', () => {
      // (4,3) → (4,5) : le chemin direct passe par (4,4) = X ; détour par la Forge (5,4) = 4 cases.
      const withFour = gameWith([{ monster: 'golem', owner: 1, at: at(4, 3), mobilityLeft: 4 }]);
      expect(destinations(withFour, 'u1')).toContainEqual({ pos: at(4, 5), cost: 4 });
      const withThree = gameWith([{ monster: 'golem', owner: 1, at: at(4, 3), mobilityLeft: 3 }]);
      expect(destinationCells(withThree, 'u1')).not.toContainEqual(at(4, 5));
    });

    it('ne s’arrête jamais sur une case X ni hors plateau', () => {
      const state = gameWith([{ monster: 'golem', owner: 1, at: at(1, 4), mobilityLeft: 20 }]);
      const cells = destinationCells(state, 'u1');
      expect(cells.length).toBeGreaterThan(0);
      for (const pos of cells) expect(isPlayable(state.board, pos), `(${pos.row}, ${pos.col})`).toBe(true);
      for (const pos of [at(3, 4), at(4, 4), at(0, 2), at(0, 6), at(-1, 4)]) {
        expect(() => applyAction(state, move('u1', pos))).toThrow(IllegalActionError);
      }
    });

    it('ne traverse pas les cases hors plateau', () => {
      // (1,1) → (0,3) : pas de raccourci par (0,1) et (0,2), qui n'existent pas → 3 cases.
      const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(1, 1) }]);
      expect(destinations(state, 'u1')).toContainEqual({ pos: at(0, 3), cost: 3 });
    });
  });

  describe('monstres', () => {
    it('traverse ses alliés', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(9, 0) }, // mobilité 2
        { monster: 'golem', owner: 1, at: at(9, 1) },
      ]);
      expect(destinations(state, 'u1')).toContainEqual({ pos: at(9, 2), cost: 2 });
    });

    it('ne traverse pas les ennemis', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(9, 0) }, // mobilité 2
        { monster: 'golem', owner: 2, at: at(9, 1) },
      ]);
      expect(destinationCells(state, 'u1')).not.toContainEqual(at(9, 2));
    });

    it('ne s’arrête pas sur une case occupée par un monstre, allié ou ennemi', () => {
      const state = gameWith([
        { monster: 'eclaireur', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(7, 1) },
      ]);
      expect(destinationCells(state, 'u1')).not.toContainEqual(at(8, 2));
      expect(destinationCells(state, 'u1')).not.toContainEqual(at(7, 1));
      expect(() => applyAction(state, move('u1', at(8, 2)))).toThrow(IllegalActionError);
      expect(() => applyAction(state, move('u1', at(7, 1)))).toThrow(IllegalActionError);
    });
  });

  describe('terrains (§10)', () => {
    // La Forge (5,4) n'est accessible que par (5,3) et (5,5) : (4,4) et (6,4) sont des X.

    it('traverse ses terrains alliés et peut s’arrêter sur un terrain allié seul', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) }, // mobilité 2
        { terrain: 'bastion', owner: 1, at: at(5, 4) },
      ]);
      expect(destinations(state, 'u1')).toContainEqual({ pos: at(5, 5), cost: 2 });
      const after = applyAction(state, move('u1', at(5, 4)));
      expect(getUnitsAt(after, at(5, 4)).map((u) => u.id)).toEqual(['u1', 'u2']);
    });

    it('ne s’arrête pas sur un terrain allié déjà occupé par un monstre, mais le traverse', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) },
        { terrain: 'bastion', owner: 1, at: at(5, 4) },
        { monster: 'golem', owner: 1, at: at(5, 4) },
      ]);
      expect(destinationCells(state, 'u1')).not.toContainEqual(at(5, 4));
      expect(destinations(state, 'u1')).toContainEqual({ pos: at(5, 5), cost: 2 });
    });

    it('ne traverse pas un terrain ennemi et ne peut pas y entrer', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
      ]);
      expect(destinationCells(state, 'u1')).not.toContainEqual(at(5, 4));
      expect(destinationCells(state, 'u1')).not.toContainEqual(at(5, 5));
    });

    it('quand le monstre part, le terrain reste sur la case (§4.9)', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 4) },
        { terrain: 'bastion', owner: 1, at: at(5, 4) },
      ]);
      const after = applyAction(state, move('u1', at(5, 5)));
      expect(after.units.u2?.pos).toEqual(at(5, 4));
      expect(getUnitsAt(after, at(5, 4)).map((u) => u.id)).toEqual(['u2']);
    });
  });

  describe('qui peut se déplacer', () => {
    it('seul le joueur actif déplace ses monstres', () => {
      const state = gameWith([{ monster: 'eclaireur', owner: 2, at: at(8, 1) }]); // tour de J1
      expect(() => applyAction(state, move('u1', at(8, 2)))).toThrow(/joueur actif/);
    });

    it('un terrain ne se déplace pas', () => {
      const state = gameWith([{ terrain: 'bastion', owner: 1, at: at(5, 4) }]);
      expect(() => applyAction(state, move('u1', at(5, 5)))).toThrow(IllegalActionError);
    });

    it('une unité inconnue ne se déplace pas', () => {
      expect(() => applyAction(gameWith([]), move('u42', at(1, 1)))).toThrow(/inconnue/);
    });
  });

  it('ne mute pas l’état et est déterministe', () => {
    const state = deepFreeze(gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1) }]));
    const snapshot = structuredClone(state);
    const a = applyAction(state, move('u1', at(8, 3)));
    const b = applyAction(state, move('u1', at(8, 3)));
    expect(state).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('getLegalActions — déplacements', () => {
  const busyState = () =>
    gameWith([
      { monster: 'gardien', owner: 1, at: at(8, 1) },
      { monster: 'milicien', owner: 1, at: at(5, 3) },
      { terrain: 'bastion', owner: 1, at: at(5, 4) },
      { monster: 'golem', owner: 2, at: at(8, 2) },
      { monster: 'eclaireur', owner: 2, at: at(5, 2) },
    ]);
  const moveActions = (state: GameState) =>
    getLegalActions(state).filter((a): a is Extract<Action, { type: 'move' }> => a.type === 'move');

  it('propose exactement les destinations de chaque monstre du joueur actif', () => {
    const state = busyState();
    const actions = moveActions(state);
    expect(new Set(actions.map((a) => a.unitId))).toEqual(new Set(['u1', 'u2']));
    expect(actions.filter((a) => a.unitId === 'u1').map((a) => a.to)).toEqual(destinationCells(state, 'u1'));
    expect(actions.filter((a) => a.unitId === 'u2').map((a) => a.to)).toEqual(destinationCells(state, 'u2'));
  });

  it('tous les déplacements proposés sont acceptés par applyAction', () => {
    const state = busyState();
    for (const action of moveActions(state)) expect(() => applyAction(state, action)).not.toThrow();
  });
});
