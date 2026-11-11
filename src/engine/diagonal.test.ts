import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { getAttackTargets, getDiagonalCells, getStrikeCells } from './combat';
import { BOARD } from './board';
import { CARDS } from './cards';
import { at, gameWith } from './test-utils';
import type { Action, GameState, UnitId } from './types';

// Attaque en diagonale (SPEC.md §4.7, §10) : une case de diagonale compte pour 2 de portée, donc jusqu'à portée ÷ 2 cases
// (portée 2-3 : 1 case, 4-5 : 2, 6 : 3), les cases entre les deux libres.

const attack = (unitId: UnitId, targetId: UnitId, advance = false): Action => ({ type: 'attack', unitId, targetId, advance });

function targetIds(state: GameState, unitId: UnitId): UnitId[] {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') throw new Error(`${unitId} n'est pas un monstre`);
  return getAttackTargets(state, unit).map((t) => t.id);
}

describe('attaque en diagonale (§10)', () => {
  it('un monstre de portée 2 frappe un ennemi en diagonale, à 1 case', () => {
    const state = gameWith([
      { monster: 'archer', owner: 1, at: at(8, 2) }, // portée 2, ATK 2
      { monster: 'golem', owner: 2, at: at(7, 3) },
    ]);
    expect(targetIds(state, 'u1')).toEqual(['u2']);
    expect(applyAction(state, attack('u1', 'u2')).units.u2?.hp).toBe(5);
  });

  it('les 4 diagonales comptent', () => {
    const state = gameWith([
      { monster: 'archer', owner: 1, at: at(8, 6) },
      { monster: 'golem', owner: 2, at: at(7, 5) },
      { monster: 'golem', owner: 2, at: at(7, 7) },
      { monster: 'golem', owner: 2, at: at(9, 5) },
      { monster: 'golem', owner: 2, at: at(9, 7) },
    ]);
    expect(targetIds(state, 'u1').sort()).toEqual(['u2', 'u3', 'u4', 'u5']);
  });

  it('une portée de 2 ou 3 ne frappe pas à 2 cases en diagonale, une portée de 1 pas du tout', () => {
    const far = gameWith([
      { monster: 'archer', owner: 1, at: at(8, 2) },
      { monster: 'golem', owner: 2, at: at(6, 4) },
    ]);
    expect(targetIds(far, 'u1')).toEqual([]);
    const melee = gameWith([
      { monster: 'milicien', owner: 1, at: at(8, 2) },
      { monster: 'golem', owner: 2, at: at(7, 3) },
    ]);
    expect(targetIds(melee, 'u1')).toEqual([]);
  });

  it('un bonus de portée du tour ouvre la diagonale (portée effective)', () => {
    const base = gameWith([
      { monster: 'milicien', owner: 1, at: at(8, 2) },
      { monster: 'golem', owner: 2, at: at(7, 3) },
    ]);
    const milicien = base.units.u1;
    if (milicien?.kind !== 'monster') throw new Error('milicien attendu');
    const boosted = { ...base, units: { ...base.units, u1: { ...milicien, rangeBonus: 1 } } };
    expect(targetIds(boosted, 'u1')).toEqual(['u2']);
  });

  it('n’est pas un contact : pas de riposte, pas d’avancée', () => {
    const riposte = gameWith([
      { monster: 'archer', owner: 1, at: at(8, 2) },
      { monster: 'gardien', owner: 2, at: at(7, 3) }, // riposte
    ]);
    expect(applyAction(riposte, attack('u1', 'u2')).units.u1?.hp).toBe(1); // intact

    const kill = gameWith([
      { monster: 'archer', owner: 1, at: at(8, 2) },
      { monster: 'milicien', owner: 2, at: at(7, 3), hp: 1 },
    ]);
    const attacks = getLegalActions(kill).filter((a) => a.type === 'attack');
    expect(attacks).toEqual([attack('u1', 'u2', false)]);
    const after = applyAction(kill, attack('u1', 'u2'));
    expect(after.units.u2).toBeUndefined();
    expect(after.units.u1?.pos).toEqual(at(8, 2));
  });

  it('les monstres du coin ne gênent pas le tir', () => {
    const state = gameWith([
      { monster: 'archer', owner: 1, at: at(8, 2) },
      { monster: 'golem', owner: 2, at: at(7, 3) },
      { monster: 'milicien', owner: 2, at: at(7, 2) },
      { monster: 'milicien', owner: 1, at: at(8, 3) },
    ]);
    expect(targetIds(state, 'u1')).toContain('u2');
  });

  it('une case X coupe : la diagonale doit être adjacente (§10)', () => {
    // (3, 4) est une case X : jamais adjacente ; on ne frappe pas dessus.
    expect(getDiagonalCells({ board: BOARD, units: {}, cards: CARDS }, at(2, 3), 2)).not.toContainEqual(at(3, 4));
    expect(getDiagonalCells({ board: BOARD, units: {}, cards: CARDS }, at(2, 3), 2)).toContainEqual(at(1, 2));
    expect(getDiagonalCells({ board: BOARD, units: {}, cards: CARDS }, at(2, 3), 1)).toEqual([]);
  });

  it('une falaise coupe la diagonale si aucun des deux chemins en L ne passe (§10)', () => {
    // Le mur de la Scierie (colonnes 2 et 3) : de (5, 2), (4, 3) n'est pas adjacente, (4, 1) l'est.
    const state = gameWith([
      { monster: 'archer', owner: 1, at: at(5, 2) },
      { monster: 'golem', owner: 2, at: at(4, 3) },
      { monster: 'golem', owner: 2, at: at(4, 1) },
    ]);
    expect(targetIds(state, 'u1')).toEqual(['u3']);
  });

  it('la menace montre les diagonales d’un monstre de portée 2', () => {
    const board = { board: BOARD, units: {}, cards: CARDS };
    expect(getStrikeCells(board, at(8, 2), 2)).toContainEqual(at(7, 3));
    expect(getStrikeCells(board, at(8, 2), 1)).not.toContainEqual(at(7, 3));
  });

  it('les effets « en ligne » ne changent pas : le Mage ne vise pas en diagonale', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(7, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(getLegalActions(state).filter((a) => a.type === 'activateEffect')).toEqual([]);
    expect(targetIds(state, 'u1')).toEqual(['u2']); // mais son attaque, oui
  });

  it('portée 4 : un ennemi à 2 cases en diagonale est attaquable ; portée 6 : à 3 cases (distance orthogonale ≤ portée)', () => {
    const two = gameWith([
      { monster: 'archer-imperial', owner: 1, at: at(9, 0) }, // portée 4
      { monster: 'golem', owner: 2, at: at(7, 2) },
    ]);
    expect(targetIds(two, 'u1')).toEqual(['u2']);
    expect(applyAction(two, attack('u1', 'u2')).units.u2?.hp).toBe(5);
    expect(getDiagonalCells(two, at(9, 0), 4)).toContainEqual(at(7, 2));
    expect(getDiagonalCells(two, at(9, 0), 3)).not.toContainEqual(at(7, 2));
    const three = gameWith([
      { monster: 'trebuchet-archers', owner: 1, at: at(10, 3) }, // portée 6
      { monster: 'golem', owner: 2, at: at(7, 6) },
    ]);
    expect(targetIds(three, 'u1')).toEqual(['u2']);
    // Une case de plus : hors de portée.
    const four = gameWith([
      { monster: 'trebuchet-archers', owner: 1, at: at(10, 3) },
      { monster: 'golem', owner: 2, at: at(6, 7) },
    ]);
    expect(targetIds(four, 'u1')).toEqual([]);
  });

  it('seules les diagonales pures comptent, pas les cases en L (1, 2)', () => {
    const state = gameWith([
      { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
      { monster: 'golem', owner: 2, at: at(8, 2) },
    ]);
    expect(targetIds(state, 'u1')).toEqual([]);
  });

  it('un allié (monstre ou terrain) sur la diagonale ne gêne pas ; un ennemi ou un terrain ennemi la bloque, comme en ligne droite', () => {
    const state = gameWith([
      { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
      { monster: 'milicien', owner: 1, at: at(8, 1) }, // allié sur la diagonale
      { monster: 'golem', owner: 2, at: at(7, 2) },
    ]);
    expect(targetIds(state, 'u1')).toEqual(['u3']);
    const wall = gameWith([
      { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
      { terrain: 'bastion', owner: 1, at: at(8, 1) }, // terrain allié : il ne gêne pas
      { monster: 'golem', owner: 2, at: at(7, 2) },
    ]);
    expect(targetIds(wall, 'u1')).toEqual(['u3']);
    const enemyWall = gameWith([
      { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
      { terrain: 'bastion', owner: 2, at: at(8, 1) }, // terrain ennemi : il arrête le tir, et se vise
      { monster: 'golem', owner: 2, at: at(7, 2) },
    ]);
    expect(targetIds(enemyWall, 'u1')).toEqual(['u2']);
    const enemyFirst = gameWith([
      { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
      { monster: 'milicien', owner: 2, at: at(8, 1) },
      { monster: 'golem', owner: 2, at: at(7, 2) },
    ]);
    expect(targetIds(enemyFirst, 'u1')).toEqual(['u2']); // le plus proche seulement
  });

  it('une falaise ou une case X coupe la diagonale longue (chaque pas doit être dans le carré de 1)', () => {
    // Le mur de la Scierie : de (5, 3), la diagonale vers (4, 2) puis (3, 1) est coupée dès le premier pas.
    const state = gameWith([
      { monster: 'archer-imperial', owner: 1, at: at(5, 3) },
      { monster: 'golem', owner: 2, at: at(3, 1) },
    ]);
    expect(targetIds(state, 'u1')).toEqual([]);
  });

  it('la menace montre les diagonales jusqu’à portée ÷ 2 (portée 4 : 2 cases)', () => {
    const board = { board: BOARD, units: {}, cards: CARDS };
    expect(getStrikeCells(board, at(9, 0), 4)).toContainEqual(at(7, 2));
    expect(getStrikeCells(board, at(9, 0), 3)).not.toContainEqual(at(7, 2));
  });
});
