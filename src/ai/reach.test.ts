import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, getAtk, getMonsterCard, getMoveDestinations, getNextTurnMobility, getStrikeCells, samePos } from '../engine';
import type { GameState, MonsterUnit, PlayerId, Unit } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { getStrikers } from './reach';

// Calcul rapide de l'IA : ce qu'un monstre pourra frapper à son prochain tour, comme le moteur le permettrait.

const mobility = (state: GameState) => (m: MonsterUnit) => getNextTurnMobility(m, state.turn, state.activePlayer, state.board.mobilityBonus);
const strikes = (state: GameState, attacker: PlayerId) =>
  getStrikers(state, attacker, mobility(state), (m) => getAtk(state, m), () => true).map(({ monster, hits }) => ({
    id: monster.id,
    hits: Object.fromEntries(hits.map(({ target, damage }) => [target.id, damage])),
  }));

/** Les cibles du moteur : déplacements (`getMoveDestinations`) puis tirs (`getStrikeCells`) de chaque case. */
function engineTargets(state: GameState, monster: MonsterUnit): string[] {
  const mobile = { ...monster, mobilityLeft: mobility(state)(monster) };
  const { [monster.id]: _self, ...others } = state.units;
  const board = { board: state.board, units: others };
  const range = getMonsterCard(monster.cardId).range;
  const cells = [monster.pos, ...getMoveDestinations(state, mobile).map((d) => d.pos)].flatMap((from) => getStrikeCells(board, from, range));
  return Object.values(state.units)
    .filter((u: Unit) => u.owner !== monster.owner && cells.some((c) => samePos(c, u.pos)))
    .map((u) => u.id)
    .sort();
}

function expectSameAsEngine(state: GameState, attacker: PlayerId) {
  const found = strikes(state, attacker);
  for (const monster of Object.values(state.units)) {
    if (monster.kind !== 'monster' || monster.owner !== attacker) continue;
    const hits = found.find((s) => s.id === monster.id)?.hits ?? {};
    expect(Object.keys(hits).sort(), monster.id).toEqual(engineTargets(state, monster));
  }
}

describe('IA : portée du prochain tour (calcul rapide)', () => {
  it('se déplace puis frappe, comme le moteur ; les ennemis bloquent le chemin, pas les alliés', () => {
    const state = gameWith(
      [
        { monster: 'chevalier', owner: 1, at: at(1, 4) },
        { monster: 'milicien', owner: 1, at: at(2, 4) },
        { monster: 'eclaireur', owner: 2, at: at(5, 4) },
        { monster: 'golem', owner: 2, at: at(9, 8) },
        { monster: 'archer', owner: 2, at: at(1, 7) },
      ],
      { activePlayer: 2 },
    );
    // L'Éclaireur sur la Forge est derrière les X de la colonne 4 : trop loin pour le Chevalier, et pour le Milicien.
    expect(strikes(state, 1)).toEqual([{ id: 'u1', hits: { u5: 3 } }]);
    expectSameAsEngine(state, 1);
  });

  it('les murs et falaises du 13 × 13 font faire le tour ; un tir ne passe pas une falaise de la Mine', () => {
    const state = gameWith(
      [
        { monster: 'dragonnet', owner: 1, at: at(9, 1) },
        { monster: 'archer', owner: 1, at: at(6, 2) },
        { monster: 'milicien', owner: 2, at: at(11, 1) },
        { monster: 'golem', owner: 2, at: at(6, 4) },
      ],
      { board: BATTLEFIELD_13, activePlayer: 2 },
    );
    expectSameAsEngine(state, 1);
  });

  it('un monstre stun au prochain tour ne frappe pas ; un assassin frappe plus fort de dos', () => {
    const state = gameWith(
      [
        { monster: 'clown-assassin', owner: 1, at: at(6, 1) },
        { monster: 'golem', owner: 2, at: at(9, 1), facing: 'down' },
      ],
      { activePlayer: 2 },
    );
    // Le Golem regarde vers le bas : le Clown, au-dessus de lui, le prend de dos (2 × 3).
    expect(strikes(state, 1)).toEqual([{ id: 'u1', hits: { u2: 6 } }]);
    const stunned = getStrikers(state, 1, () => -1, (m) => getAtk(state, m), () => true);
    expect(stunned).toEqual([]);
  });
});
