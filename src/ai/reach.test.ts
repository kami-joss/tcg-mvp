import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, getAtk, getMonsterCard, getMoveDestinations, getNextTurnMobility, getStrikeCells, samePos } from '../engine';
import type { GameState, MonsterUnit, PlayerId, Unit } from '../engine';
import { at, gameWith, withStatus } from '../engine/test-utils';
import { getStrikers } from './reach';
import { CARDS } from '../engine';

// Calcul rapide de l'IA : ce qu'un monstre pourra frapper à son prochain tour, comme le moteur le permettrait.

const mobility = (state: GameState) => (m: MonsterUnit) => getNextTurnMobility(state.cards, m, state.turn, state.activePlayer);
const strikes = (state: GameState, attacker: PlayerId) =>
  getStrikers(state, attacker, mobility(state), (m) => getAtk(state, m), () => true).map(({ monster, hits }) => ({
    id: monster.id,
    hits: Object.fromEntries(hits.map(({ target, damage }) => [target.id, damage])),
  }));

/** Les cibles du moteur : déplacements (`getMoveDestinations`) puis tirs (`getStrikeCells`) de chaque case. */
function engineTargets(state: GameState, monster: MonsterUnit): string[] {
  const mobile = { ...monster, mobilityLeft: mobility(state)(monster) };
  const { [monster.id]: _self, ...others } = state.units;
  const board = { board: state.board, units: others, cards: state.cards };
  const range = getMonsterCard(CARDS, monster.cardId).range;
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
    // Le Golem regarde vers le bas : le Clown, au-dessus de lui, le prend de dos (3 × 3).
    expect(strikes(state, 1)).toEqual([{ id: 'u1', hits: { u2: 9 } }]);
    const stunned = getStrikers(state, 1, () => -1, (m) => getAtk(state, m), () => true);
    expect(stunned).toEqual([]);
  });
});

describe('IA : attaque en diagonale (§10)', () => {
  it('un monstre de portée 2 frappe aussi en diagonale, comme le moteur', () => {
    const state = gameWith(
      [
        { monster: 'archer', owner: 1, at: at(8, 2) },
        { monster: 'milicien', owner: 1, at: at(9, 2) },
        { monster: 'golem', owner: 2, at: at(7, 3) },
      ],
      { activePlayer: 2 },
    );
    expect(strikes(state, 1).find((s) => s.id === 'u1')?.hits.u3).toBe(2);
    expectSameAsEngine(state, 1);
  });
});

describe('IA : ce que la cible perdra ensuite (Sorciers du feu)', () => {
  it('Brûlure : les PV que le burn fera perdre comptent avec l’attaque ; Zone : au contact, en plus', () => {
    const state = gameWith(
      [
        // Feria : 1 ATK, Brûlure 1 pendant 2 tours ; Golem de lave : 2 ATK, Zone burn 1 pendant 1 tour.
        { monster: 'apprenti', owner: 1, at: at(1, 0) },
        { monster: 'golem-de-lave', owner: 1, at: at(1, 6) },
        { monster: 'chevalier', owner: 2, at: at(1, 3) },
        { monster: 'milicien', owner: 2, at: at(1, 8) },
      ],
      { activePlayer: 2 },
    );
    const found = strikes(state, 1);
    expect(found.find((s) => s.id === 'u1')?.hits.u3).toBe(1 + 2);
    expect(found.find((s) => s.id === 'u2')?.hits.u4).toBe(2 + 1);
    expectSameAsEngine(state, 1);
  });
});

describe('IA : Archers impériaux', () => {
  it('Camps de tir : un archer qui tire depuis sa case ou son carré de 1 porte une case plus loin', () => {
    // L'Archer impérial (portée 4, mobilité 3) va en (4, 3) au plus près : le Milicien en (9, 3) est à 5 cases.
    const units = [
      { monster: 'archer-imperial', owner: 1, at: at(1, 3) },
      { monster: 'milicien', owner: 2, at: at(9, 3) },
    ] as const;
    const without = gameWith(units, { activePlayer: 2 });
    const camp = gameWith([...units, { terrain: 'camps-de-tir', owner: 1, at: at(4, 3) }], { activePlayer: 2 });
    expect(strikes(without, 1).find((s) => s.id === 'u1')).toBeUndefined();
    expect(strikes(camp, 1).find((s) => s.id === 'u1')?.hits.u2).toBe(2);
  });

  it('Trébuchet : jamais une cible au contact ; à 2 cases, oui', () => {
    const stuck = (enemy: number) =>
      withStatus(
        gameWith(
          [
            { monster: 'trebuchet-archers', owner: 1, at: at(1, 4) },
            { monster: 'milicien', owner: 2, at: at(1, enemy) },
          ],
          { activePlayer: 2 },
        ),
        'u1',
        'immobilise',
        0,
        1,
      );
    expect(strikes(stuck(5), 1).find((s) => s.id === 'u1')).toBeUndefined();
    expect(strikes(stuck(6), 1).find((s) => s.id === 'u1')?.hits.u2).toBe(5);
  });
});
