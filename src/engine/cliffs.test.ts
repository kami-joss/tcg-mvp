import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { BOARD, hasCliff, parseBoard, samePos } from './board';
import { getAttackTargets } from './combat';
import { IllegalActionError } from './errors';
import { getMoveDestinations } from './movement';
import { at, gameWith } from './test-utils';
import type { Action, GameState, UnitId } from './types';

function destinations(state: GameState, unitId: UnitId) {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') throw new Error(`${unitId} n'est pas un monstre`);
  return getMoveDestinations(state, unit);
}

function targetIds(state: GameState, unitId: UnitId): UnitId[] {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') throw new Error(`${unitId} n'est pas un monstre`);
  return getAttackTargets(state, unit).map((t) => t.id);
}

const MANA = { players: { 1: { mana: 10 } } };

describe('falaises (SPEC.md §10)', () => {
  describe('plateau', () => {
    it('la Scierie est fermée côté centre, et en haut et en bas sauf en colonne 1', () => {
      for (const row of [4, 5, 6]) expect(hasCliff(BOARD, at(row, 2), at(row, 3))).toBe(true);
      for (const col of [0, 2]) {
        expect(hasCliff(BOARD, at(3, col), at(4, col))).toBe(true);
        expect(hasCliff(BOARD, at(6, col), at(7, col))).toBe(true);
      }
      expect(hasCliff(BOARD, at(3, 1), at(4, 1))).toBe(false);
      expect(hasCliff(BOARD, at(6, 1), at(7, 1))).toBe(false);
    });

    it('la Mine est fermée côté centre, et en haut et en bas sauf en colonne 7', () => {
      for (const row of [4, 5, 6]) expect(hasCliff(BOARD, at(row, 5), at(row, 6))).toBe(true);
      for (const col of [6, 8]) {
        expect(hasCliff(BOARD, at(3, col), at(4, col))).toBe(true);
        expect(hasCliff(BOARD, at(6, col), at(7, col))).toBe(true);
      }
      expect(hasCliff(BOARD, at(3, 7), at(4, 7))).toBe(false);
      expect(hasCliff(BOARD, at(6, 7), at(7, 7))).toBe(false);
    });

    it('une falaise se lit dans les deux sens ; il n’y en a nulle part ailleurs', () => {
      expect(hasCliff(BOARD, at(5, 3), at(5, 2))).toBe(true);
      expect(BOARD.cliffs).toHaveLength(14);
      expect(hasCliff(BOARD, at(8, 1), at(8, 2))).toBe(false);
    });

    it('une falaise relie deux cases voisines', () => {
      expect(() => parseBoard('test', ['PPP'], [{ between: [at(0, 0), at(0, 2)], rangedShotsPass: false, flyingPasses: false }])).toThrow(/voisines/);
    });
  });

  describe('déplacement', () => {
    it('ne se franchit pas : il faut entrer par l’ouverture', () => {
      // (4,3) → (4,2) : la falaise impose le détour par l'entrée nord de la Scierie (colonne 1).
      const state = gameWith([{ monster: 'golem', owner: 1, at: at(4, 3), mobilityLeft: 5 }]);
      expect(destinations(state, 'u1')).toContainEqual({ pos: at(4, 2), cost: 5 });
      const short = gameWith([{ monster: 'golem', owner: 1, at: at(4, 3), mobilityLeft: 4 }]);
      expect(destinations(short, 'u1').map((d) => d.pos)).not.toContainEqual(at(4, 2));
    });

    it('l’ouverture se franchit normalement', () => {
      const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(3, 1) }]);
      expect(destinations(state, 'u1')).toContainEqual({ pos: at(4, 1), cost: 1 });
      expect(() => applyAction(state, { type: 'move', unitId: 'u1', to: at(4, 0) })).not.toThrow(); // par (4,1)
    });

    it('vol survole les falaises de la Scierie', () => {
      const state = gameWith([{ monster: 'dragonnet', owner: 1, at: at(4, 3) }]);
      expect(destinations(state, 'u1')).toContainEqual({ pos: at(4, 2), cost: 1 });
    });

    it('la Mine est une zone fermée : vol ne survole pas ses falaises, il passe par les ouvertures', () => {
      const outside = gameWith([{ monster: 'dragonnet', owner: 1, at: at(5, 5), mobilityLeft: 6 }]);
      const reach = destinations(outside, 'u1');
      expect(reach.map((d) => d.pos)).not.toContainEqual(at(5, 6)); // juste derrière la falaise
      // Par l'ouverture du haut (colonne 7) : (5,5) → (4,5) → (3,5) → (3,6) → (3,7) → (4,7).
      expect(reach.find((d) => samePos(d.pos, at(4, 7)))?.cost).toBe(5);
      expect(() => applyAction(outside, { type: 'move', unitId: 'u1', to: at(5, 6) })).toThrow(IllegalActionError);
      const inside = gameWith([{ monster: 'dragonnet', owner: 1, at: at(4, 6) }]);
      // (3, 6), juste au-dessus : en ressortant par l'ouverture, 3 pas au lieu d'1 ; (4, 5) : hors d'atteinte.
      expect(destinations(inside, 'u1').find((d) => samePos(d.pos, at(3, 6)))?.cost).toBe(3);
      expect(destinations(inside, 'u1').map((d) => d.pos)).not.toContainEqual(at(4, 5));
    });
  });

  describe('tir', () => {
    it('falaise de la Scierie : un monstre de portée 1 ne frappe pas à travers, même au contact', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) }, // portée 1
        { monster: 'golem', owner: 2, at: at(5, 2) }, // adjacent, derrière la falaise
      ]);
      expect(targetIds(state, 'u1')).toEqual([]);
    });

    it('falaise de la Scierie : les tirs de portée 2 ou plus passent, même sur une cible juste derrière', () => {
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(5, 3) }, // portée 2
        { monster: 'golem', owner: 2, at: at(5, 2) },
        { monster: 'archer', owner: 1, at: at(4, 3) },
        { monster: 'golem', owner: 2, at: at(4, 1) }, // à 2 cases, de l'autre côté
      ]);
      expect(targetIds(state, 'u1')).toEqual(['u2']);
      expect(targetIds(state, 'u3')).toEqual(['u4']);
    });

    it('falaise de la Scierie : l’effet du Mage (portée 2) passe aussi', () => {
      const state = gameWith(
        [
          { monster: 'mage', owner: 1, at: at(5, 3) },
          { monster: 'golem', owner: 2, at: at(5, 1) },
        ],
        MANA,
      );
      const effect: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u2' } };
      expect(applyAction(state, effect).units.u2?.hp).toBe(5);
    });

    it('falaise de la Mine : elle bloque tous les tirs, même de portée 2', () => {
      const state = gameWith(
        [
          { monster: 'archer', owner: 1, at: at(4, 5) },
          { monster: 'golem', owner: 2, at: at(4, 6) }, // adjacent, derrière la falaise
          { monster: 'mage', owner: 1, at: at(5, 5) },
          { monster: 'golem', owner: 2, at: at(5, 7) },
        ],
        MANA,
      );
      expect(targetIds(state, 'u1')).toEqual([]);
      expect(targetIds(state, 'u3')).toEqual([]);
      const effect: Action = { type: 'activateEffect', unitId: 'u3', target: { kind: 'unit', unitId: 'u4' } };
      expect(() => applyAction(state, effect)).toThrow(IllegalActionError);
    });

    it('on tire normalement par l’ouverture', () => {
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(5, 1) },
        { monster: 'golem', owner: 2, at: at(3, 1) },
      ]);
      expect(targetIds(state, 'u1')).toEqual(['u2']);
    });

    it('la falaise de la Scierie reste infranchissable à pied', () => {
      const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(5, 3) }]);
      expect(() => applyAction(state, { type: 'move', unitId: 'u1', to: at(5, 2) })).toThrow(IllegalActionError);
    });
  });

  describe('sorts et effets', () => {
    it('le Chaman (portée 1) ne soigne pas à travers une falaise, même celle de la Scierie', () => {
      const heal = (targetId: UnitId): Action => ({ type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: targetId } });
      const state = gameWith(
        [
          { monster: 'chaman', owner: 1, at: at(5, 3) },
          { monster: 'golem', owner: 1, at: at(5, 2), hp: 1 }, // adjacent, derrière la falaise de la Scierie
          { monster: 'golem', owner: 1, at: at(4, 3), hp: 1 }, // adjacent, même côté
        ],
        MANA,
      );
      expect(() => applyAction(state, heal('u2'))).toThrow(IllegalActionError);
      expect(applyAction(state, heal('u3')).units.u3?.hp).toBe(3);
    });

    it('la Boule de feu (3 pas, sans ligne de vue) ignore les falaises', () => {
      const state = gameWith(
        [
          { monster: 'milicien', owner: 1, at: at(5, 6) }, // dans la Mine
          { monster: 'golem', owner: 2, at: at(5, 4) }, // sur la Forge, de l'autre côté de la falaise
        ],
        MANA,
      );
      const fireball: Action = { type: 'playCard', cardId: 'boule-de-feu', target: { kind: 'unit', unitId: 'u2' } };
      expect(applyAction(state, fireball).units.u2?.hp).toBe(5);
    });
  });

  describe('Bourrasque', () => {
    const gust = (direction: 'up' | 'down' | 'left' | 'right'): Action => ({
      type: 'playCard',
      cardId: 'bourrasque',
      target: { kind: 'unitAndDirection', unitId: 'u1', direction },
    });

    it('le recul s’arrête avant une falaise', () => {
      const state = gameWith([{ monster: 'golem', owner: 2, at: at(2, 0) }], MANA);
      expect(applyAction(state, gust('down')).units.u1?.pos).toEqual(at(3, 0));
    });

    it('interdite si la falaise empêche tout recul, même pour un monstre avec vol', () => {
      const state = gameWith([{ monster: 'dragonnet', owner: 2, at: at(5, 3) }], MANA);
      expect(() => applyAction(state, gust('left'))).toThrow(IllegalActionError);
    });
  });
});
