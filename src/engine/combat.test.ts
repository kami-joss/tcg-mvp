import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { getAttackTargets } from './combat';
import { IllegalActionError } from './errors';
import { at, deepFreeze, gameWith } from './test-utils';
import { getUnitsAt } from './units';
import type { Action, GameState, Position, UnitId } from './types';

const attack = (unitId: UnitId, targetId: UnitId, advance = false): Action => ({
  type: 'attack',
  unitId,
  targetId,
  advance,
});
const move = (unitId: UnitId, to: Position): Action => ({ type: 'move', unitId, to });

/** Ids des cibles attaquables par l'unité. */
function targetIds(state: GameState, unitId: UnitId): UnitId[] {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') throw new Error(`${unitId} n'est pas un monstre`);
  return getAttackTargets(state, unit).map((t) => t.id);
}

describe('attaque (SPEC.md §4.7)', () => {
  describe('dégâts', () => {
    it('retire l’ATK de l’attaquant aux PV de la cible, et les dégâts restent', () => {
      let state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) }, // ATK 2
        { monster: 'archer', owner: 1, at: at(9, 2) }, // ATK 2
        { monster: 'golem', owner: 2, at: at(8, 2) }, // PV 7
      ]);
      state = applyAction(state, attack('u1', 'u3'));
      expect(state.units.u3?.hp).toBe(5);
      state = applyAction(state, attack('u2', 'u3'));
      expect(state.units.u3?.hp).toBe(3);
      expect(state.units.u3?.maxHp).toBe(7);
    });

    it('pas de riposte : l’attaquant ne subit aucun dégât', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2) }, // ATK 4
      ]);
      expect(applyAction(state, attack('u1', 'u2')).units.u1?.hp).toBe(3);
    });

    it('n’utilise pas de mobilité', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2) },
      ]);
      expect(applyAction(state, attack('u1', 'u2')).units.u1).toMatchObject({ mobilityLeft: 2, hasAttacked: true });
    });
  });

  describe('une attaque par monstre et par tour', () => {
    it('une deuxième attaque du même monstre est refusée', () => {
      const state = applyAction(
        gameWith([
          { monster: 'milicien', owner: 1, at: at(8, 1) },
          { monster: 'golem', owner: 2, at: at(8, 2) },
        ]),
        attack('u1', 'u2'),
      );
      expect(() => applyAction(state, attack('u1', 'u2'))).toThrow(/déjà attaqué/);
      expect(getLegalActions(state).filter((a) => a.type === 'attack')).toEqual([]);
    });

    it('la mobilité peut être fractionnée autour de l’attaque (§4.6)', () => {
      let state = gameWith([
        { monster: 'chevalier', owner: 1, at: at(8, 0) }, // mobilité 3
        { monster: 'golem', owner: 2, at: at(8, 3) },
      ]);
      state = applyAction(state, move('u1', at(8, 2)));
      state = applyAction(state, attack('u1', 'u2'));
      state = applyAction(state, move('u1', at(9, 2)));
      expect(state.units.u1).toMatchObject({ pos: at(9, 2), mobilityLeft: 0, hasAttacked: true });
    });
  });

  describe('cible : unité ennemie en ligne droite orthogonale, à distance ≤ portée', () => {
    it('portée 2 : atteint 2 cases en ligne droite, pas au-delà ni en diagonale', () => {
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(8, 1) }, // portée 2
        { monster: 'golem', owner: 2, at: at(8, 3) }, // distance 2
        { monster: 'golem', owner: 2, at: at(7, 2) }, // diagonale
        { monster: 'golem', owner: 2, at: at(5, 1) }, // distance 3
      ]);
      expect(targetIds(state, 'u1')).toEqual(['u2']);
      expect(() => applyAction(state, attack('u1', 'u3'))).toThrow(IllegalActionError);
      expect(() => applyAction(state, attack('u1', 'u4'))).toThrow(IllegalActionError);
    });

    it('portée 1 : seulement les cases adjacentes', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) }, // portée 1
        { monster: 'golem', owner: 2, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(6, 1) },
      ]);
      expect(targetIds(state, 'u1')).toEqual(['u2']);
    });

    it('n’attaque pas un allié', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(8, 2) },
      ]);
      expect(targetIds(state, 'u1')).toEqual([]);
      expect(() => applyAction(state, attack('u1', 'u2'))).toThrow(IllegalActionError);
    });

    it('un terrain ennemi seul est une cible ; le détruire ne rapporte pas de VP', () => {
      let state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) }, // PV 10
      ]);
      state = applyAction(state, attack('u1', 'u2'));
      expect(state.units.u2?.hp).toBe(8);

      const fragile = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) },
        { terrain: 'bastion', owner: 2, at: at(5, 4), hp: 1 },
      ]);
      const after = applyAction(fragile, attack('u1', 'u2'));
      expect(after.units.u2).toBeUndefined();
      expect(after.players[1].vp).toBe(0);
    });
  });

  describe('ligne de vue', () => {
    it('une case intermédiaire occupée par un allié bloque', () => {
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(8, 3) },
      ]);
      expect(targetIds(state, 'u1')).toEqual([]);
    });

    it('une case intermédiaire occupée par un ennemi bloque : seul le plus proche est ciblable', () => {
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(8, 3) },
      ]);
      expect(targetIds(state, 'u1')).toEqual(['u2']);
    });

    it('une case intermédiaire avec un terrain allié bloque', () => {
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(5, 3) },
        { terrain: 'bastion', owner: 1, at: at(5, 4) },
        { monster: 'golem', owner: 2, at: at(5, 5) },
      ]);
      expect(targetIds(state, 'u1')).toEqual([]);
    });

    it('une case intermédiaire avec un terrain ennemi bloque : le terrain reste ciblable', () => {
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(5, 3) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
        { monster: 'golem', owner: 2, at: at(5, 5) },
      ]);
      expect(targetIds(state, 'u1')).toEqual(['u2']);
    });

    it('une case X bloque', () => {
      // (3,3) → (3,5) : la case intermédiaire (3,4) est un X.
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(3, 3) },
        { monster: 'golem', owner: 2, at: at(3, 5) },
      ]);
      expect(targetIds(state, 'u1')).toEqual([]);
    });
  });

  describe('case avec un monstre et un terrain', () => {
    it('l’attaque touche le monstre ; le terrain n’est attaquable que seul', () => {
      let state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) }, // ATK 2
        { monster: 'golem', owner: 2, at: at(5, 4), hp: 2 },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
        { monster: 'chevalier', owner: 1, at: at(5, 5) },
      ]);
      expect(targetIds(state, 'u1')).toEqual(['u2']);
      expect(targetIds(state, 'u4')).toEqual(['u2']);
      expect(() => applyAction(state, attack('u1', 'u3'))).toThrow(IllegalActionError);

      state = applyAction(state, attack('u1', 'u2'));
      expect(state.units.u3?.hp).toBe(10);
      expect(targetIds(state, 'u4')).toEqual(['u3']);
    });
  });

  describe('destruction et VP', () => {
    it('une unité à 0 PV est détruite', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) }, // ATK 2
        { monster: 'golem', owner: 2, at: at(8, 2), hp: 2 },
      ]);
      expect(applyAction(state, attack('u1', 'u2')).units.u2).toBeUndefined();
    });

    it('une unité sous 0 PV est détruite', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) }, // PV 1
      ]);
      expect(applyAction(state, attack('u1', 'u2')).units.u2).toBeUndefined();
    });

    it('une unité à 1 PV ou plus survit', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2), hp: 3 },
      ]);
      expect(applyAction(state, attack('u1', 'u2')).units.u2?.hp).toBe(1);
    });

    it('détruire un monstre rapporte 1 VP au joueur qui l’a détruit', () => {
      const state = gameWith(
        [
          { monster: 'milicien', owner: 1, at: at(8, 1) },
          { monster: 'eclaireur', owner: 2, at: at(8, 2) },
        ],
        { players: { 1: { vp: 4 }, 2: { vp: 7 } } },
      );
      const after = applyAction(state, attack('u1', 'u2'));
      expect(after.players[1].vp).toBe(5);
      expect(after.players[2].vp).toBe(7);
    });

    it('J2 marque aussi quand il détruit un monstre pendant son tour', () => {
      const state = gameWith(
        [
          { monster: 'milicien', owner: 2, at: at(8, 1) },
          { monster: 'eclaireur', owner: 1, at: at(8, 2) },
        ],
        { activePlayer: 2 },
      );
      expect(applyAction(state, attack('u1', 'u2')).players[2].vp).toBe(1);
    });
  });

  describe('avancée', () => {
    it('adjacent et cible détruite : l’attaquant peut prendre sa place, sans dépenser de mobilité', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1), mobilityLeft: 0 },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) },
      ]);
      const after = applyAction(state, attack('u1', 'u2', true));
      expect(after.units.u1).toMatchObject({ pos: at(8, 2), mobilityLeft: 0, hasAttacked: true });
      expect(after.units.u2).toBeUndefined();
      expect(after.players[1].vp).toBe(1);
    });

    it('est optionnelle : sans avancée, l’attaquant reste sur place', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) },
      ]);
      expect(applyAction(state, attack('u1', 'u2', false)).units.u1?.pos).toEqual(at(8, 1));
    });

    it('impossible si la cible survit', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2) },
      ]);
      expect(() => applyAction(state, attack('u1', 'u2', true))).toThrow(/Avancée impossible/);
    });

    it('impossible si l’attaquant n’était pas adjacent', () => {
      const state = gameWith([
        { monster: 'archer', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 3) },
      ]);
      expect(() => applyAction(state, attack('u1', 'u2', true))).toThrow(/Avancée impossible/);
    });

    it('impossible si un terrain ennemi reste sur la case du monstre détruit (§4.9)', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) },
        { monster: 'eclaireur', owner: 2, at: at(5, 4) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
      ]);
      expect(() => applyAction(state, attack('u1', 'u2', true))).toThrow(/Avancée impossible/);
      const after = applyAction(state, attack('u1', 'u2', false));
      expect(getUnitsAt(after, at(5, 4)).map((u) => u.id)).toEqual(['u3']);
    });

    it('possible après la destruction d’un terrain seul', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 1, at: at(5, 3) },
        { terrain: 'bastion', owner: 2, at: at(5, 4), hp: 1 },
      ]);
      expect(applyAction(state, attack('u1', 'u2', true)).units.u1?.pos).toEqual(at(5, 4));
    });
  });

  describe('qui peut attaquer', () => {
    it('seul le joueur actif attaque avec ses monstres', () => {
      const state = gameWith([
        { monster: 'milicien', owner: 2, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(8, 2) },
      ]);
      expect(() => applyAction(state, attack('u1', 'u2'))).toThrow(/joueur actif/);
    });

    it('un terrain n’attaque pas', () => {
      const state = gameWith([
        { terrain: 'bastion', owner: 1, at: at(5, 4) },
        { monster: 'golem', owner: 2, at: at(5, 5) },
      ]);
      expect(() => applyAction(state, attack('u1', 'u2'))).toThrow(/n'est pas un monstre/);
    });

    it('une cible inconnue est refusée', () => {
      const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }]);
      expect(() => applyAction(state, attack('u1', 'u42'))).toThrow(IllegalActionError);
    });
  });

  it('ne mute pas l’état et est déterministe', () => {
    const state = deepFreeze(
      gameWith([
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) },
      ]),
    );
    const snapshot = structuredClone(state);
    const a = applyAction(state, attack('u1', 'u2', true));
    const b = applyAction(state, attack('u1', 'u2', true));
    expect(state).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('getLegalActions — attaques', () => {
  const busyState = () =>
    gameWith([
      { monster: 'milicien', owner: 1, at: at(8, 1) }, // u1 : ATK 2
      { monster: 'archer', owner: 1, at: at(8, 4) }, // u2 : portée 2
      { monster: 'eclaireur', owner: 2, at: at(8, 2) }, // u3 : PV 1, adjacent à u1, à 2 de u2
      { monster: 'golem', owner: 2, at: at(9, 1) }, // u4 : PV 7, adjacent à u1
      { monster: 'milicien', owner: 2, at: at(1, 1) }, // u5 : hors de portée
    ]);
  const attackActions = (state: GameState) => getLegalActions(state).filter((a) => a.type === 'attack');

  it('propose chaque cible à portée, avec avancée seulement si elle est possible', () => {
    const expected = [
      attack('u1', 'u3', false),
      attack('u1', 'u3', true), // adjacent et létal
      attack('u1', 'u4', false), // le Golem survit
      attack('u2', 'u3', false), // létal mais à distance 2
    ];
    const actions = attackActions(busyState());
    expect(actions).toHaveLength(expected.length);
    expect(actions).toEqual(expect.arrayContaining(expected));
  });

  it('toutes les attaques proposées sont acceptées par applyAction', () => {
    const state = busyState();
    for (const action of attackActions(state)) expect(() => applyAction(state, action)).not.toThrow();
  });
});
