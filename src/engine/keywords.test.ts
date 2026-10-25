import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { isPlayable } from './board';
import { BASE_MANA_PER_TURN, MANA_PER_CONTROLLED_ZONE, VICTORY_VP } from './config';
import { getMoveDestinations } from './movement';
import { at, gameWith } from './test-utils';
import type { Action, GameState, UnitId } from './types';

const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const END_TURN: Action = { type: 'endTurn' };
const FORGE = at(5, 4);

function destinations(state: GameState, unitId: UnitId) {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') throw new Error(`${unitId} n'est pas un monstre`);
  return getMoveDestinations(state, unit);
}
const destinationCells = (state: GameState, unitId: UnitId) => destinations(state, unitId).map((d) => d.pos);

describe('riposte (SPEC.md §5, Gardien)', () => {
  it('attaqué par un ennemi adjacent et encore en vie, il inflige son ATK à l’attaquant', () => {
    const state = gameWith([
      { monster: 'milicien', owner: 1, at: at(8, 1) }, // ATK 2, PV 3
      { monster: 'gardien', owner: 2, at: at(8, 2) }, // ATK 1, PV 6
    ]);
    const after = applyAction(state, attack('u1', 'u2'));
    expect(after.units.u2?.hp).toBe(4);
    expect(after.units.u1?.hp).toBe(2);
  });

  it('pas de riposte contre une attaque à distance', () => {
    const state = gameWith([
      { monster: 'archer', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 3) },
    ]);
    expect(applyAction(state, attack('u1', 'u2')).units.u1?.hp).toBe(1);
  });

  it('pas de riposte si le Gardien est détruit', () => {
    const state = gameWith([
      { monster: 'milicien', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 2), hp: 2 },
    ]);
    const after = applyAction(state, attack('u1', 'u2'));
    expect(after.units.u2).toBeUndefined();
    expect(after.units.u1?.hp).toBe(3);
  });

  it('une seule fois par tour : seule la première attaque adjacente la déclenche (§10)', () => {
    let state = gameWith([
      { monster: 'milicien', owner: 1, at: at(8, 1) },
      { monster: 'milicien', owner: 1, at: at(9, 2) },
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ]);
    state = applyAction(state, attack('u1', 'u3'));
    state = applyAction(state, attack('u2', 'u3'));
    expect(state.units.u1?.hp).toBe(2);
    expect(state.units.u2?.hp).toBe(3);
    expect(state.units.u3?.hp).toBe(2);
  });

  it('une attaque à distance ne consomme pas la riposte du tour', () => {
    let state = gameWith([
      { monster: 'archer', owner: 1, at: at(8, 4) }, // à 2 cases du Gardien
      { monster: 'milicien', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ]);
    state = applyAction(state, attack('u1', 'u3'));
    state = applyAction(state, attack('u2', 'u3'));
    expect(state.units.u1?.hp).toBe(1);
    expect(state.units.u2?.hp).toBe(2);
  });

  it('redevient disponible au tour suivant', () => {
    let state = gameWith([
      { monster: 'milicien', owner: 1, at: at(8, 1) }, // PV 3
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ]);
    state = applyAction(state, attack('u1', 'u2'));
    state = applyAction(applyAction(state, END_TURN), END_TURN);
    state = applyAction(state, attack('u1', 'u2'));
    expect(state.units.u1?.hp).toBe(1);
  });

  it('utilise l’ATK actuelle du Gardien', () => {
    const state = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1) }, // PV 4
      { monster: 'gardien', owner: 2, at: at(8, 2), atk: 3 },
    ]);
    expect(applyAction(state, attack('u1', 'u2')).units.u1?.hp).toBe(1);
  });

  it('si elle détruit l’attaquant, le propriétaire du Gardien gagne 1 VP', () => {
    const state = gameWith([
      { monster: 'eclaireur', owner: 1, at: at(8, 1) }, // PV 1
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ]);
    const after = applyAction(state, attack('u1', 'u2'));
    expect(after.units.u1).toBeUndefined();
    expect(after.players[2].vp).toBe(1);
    expect(after.players[1].vp).toBe(0);
  });

  it('peut faire gagner l’adversaire pendant mon tour (§4.10)', () => {
    const state = gameWith(
      [
        { monster: 'eclaireur', owner: 1, at: at(8, 1) },
        { monster: 'gardien', owner: 2, at: at(8, 2) },
      ],
      { players: { 2: { vp: VICTORY_VP - 1 } } },
    );
    expect(applyAction(state, attack('u1', 'u2')).winner).toBe(2);
  });
});

describe('vol (SPEC.md §5, précisé en §10 ; Dragonnet)', () => {
  it('traverse les cases X', () => {
    const state = gameWith([{ monster: 'dragonnet', owner: 1, at: at(4, 3) }]);
    expect(destinations(state, 'u1')).toContainEqual({ pos: at(4, 5), cost: 2 });
  });

  it('ne traverse pas les monstres ennemis : il doit les contourner (§10)', () => {
    // (9,0) → (9,2) : le Golem ennemi en (9,1) impose le détour par la ligne 8.
    const state = gameWith([
      { monster: 'dragonnet', owner: 1, at: at(9, 0) },
      { monster: 'golem', owner: 2, at: at(9, 1) },
    ]);
    expect(destinations(state, 'u1')).toContainEqual({ pos: at(9, 2), cost: 4 });
  });

  it('ne traverse pas les terrains ennemis : il doit les contourner (§10)', () => {
    // (5,3) → (5,5) : le Bastion ennemi sur la Forge impose le détour, ici par-dessus le X (4,4).
    const state = gameWith([
      { monster: 'dragonnet', owner: 1, at: at(5, 3) },
      { terrain: 'bastion', owner: 2, at: at(5, 4) },
    ]);
    expect(destinations(state, 'u1')).toContainEqual({ pos: at(5, 5), cost: 4 });
  });

  it('ne termine ni sur une case X, ni sur un monstre, ni sur un terrain ennemi', () => {
    const state = gameWith([
      { monster: 'dragonnet', owner: 1, at: at(4, 3) },
      { monster: 'golem', owner: 2, at: at(5, 3) },
      { monster: 'golem', owner: 1, at: at(4, 2) },
      { terrain: 'bastion', owner: 2, at: at(5, 4) },
    ]);
    const cells = destinationCells(state, 'u1');
    for (const pos of [at(4, 4), at(3, 4), at(5, 3), at(4, 2), at(5, 4)]) expect(cells).not.toContainEqual(pos);
  });

  it('peut terminer sur un terrain allié seul (§10)', () => {
    const state = gameWith([
      { monster: 'dragonnet', owner: 1, at: at(5, 3) },
      { terrain: 'bastion', owner: 1, at: at(5, 4) },
    ]);
    expect(destinationCells(state, 'u1')).toContainEqual(at(5, 4));
  });

  it('ne termine jamais hors plateau : avec assez de mobilité, il atteint toutes les cases jouables', () => {
    const state = gameWith([{ monster: 'dragonnet', owner: 1, at: at(1, 1), mobilityLeft: 20 }]);
    const cells = destinationCells(state, 'u1');
    for (const pos of cells) expect(isPlayable(state.board, pos)).toBe(true);
    expect(cells).toHaveLength(83 - 1); // 83 cases jouables, moins la sienne
  });
});

describe('prime (SPEC.md §5, Chasseur de primes)', () => {
  it('détruire un monstre par son attaque rapporte 1 VP supplémentaire', () => {
    const state = gameWith([
      { monster: 'chasseur-de-primes', owner: 1, at: at(8, 1) }, // ATK 3
      { monster: 'milicien', owner: 2, at: at(8, 2) }, // PV 3
    ]);
    expect(applyAction(state, attack('u1', 'u2')).players[1].vp).toBe(2);
  });

  it('aucun bonus si la cible survit ou si c’est un terrain', () => {
    const survivor = gameWith([
      { monster: 'chasseur-de-primes', owner: 1, at: at(8, 1) },
      { monster: 'golem', owner: 2, at: at(8, 2) },
    ]);
    expect(applyAction(survivor, attack('u1', 'u2')).players[1].vp).toBe(0);

    const terrain = gameWith([
      { monster: 'chasseur-de-primes', owner: 1, at: at(5, 3) },
      { terrain: 'bastion', owner: 2, at: at(5, 4), hp: 3 },
    ]);
    const after = applyAction(terrain, attack('u1', 'u2'));
    expect(after.units.u2).toBeUndefined();
    expect(after.players[1].vp).toBe(0);
  });

  it('le bonus compte pour la victoire (§4.10)', () => {
    const state = gameWith(
      [
        { monster: 'chasseur-de-primes', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { vp: VICTORY_VP - 2 } } },
    );
    expect(applyAction(state, attack('u1', 'u2')).winner).toBe(1);
  });
});

describe('etendard (SPEC.md §5, Porte-étendard)', () => {
  const atStartOfMyTurn = (state: GameState) => applyAction(state, END_TURN).players[1];

  it('la mana zone qu’il occupe rapporte +1 mana ; le VP reste à 1', () => {
    const state = gameWith([{ monster: 'porte-etendard', owner: 1, at: FORGE }], {
      activePlayer: 2,
      players: { 1: { mana: 0, vp: 0 } },
    });
    expect(atStartOfMyTurn(state)).toMatchObject({
      mana: BASE_MANA_PER_TURN + MANA_PER_CONTROLLED_ZONE + 1, // Étendard 1
      vp: 1,
    });
  });

  it('hors mana zone, aucun bonus', () => {
    const state = gameWith([{ monster: 'porte-etendard', owner: 1, at: at(8, 1) }], {
      activePlayer: 2,
      players: { 1: { mana: 0, vp: 0 } },
    });
    expect(atStartOfMyTurn(state)).toMatchObject({ mana: BASE_MANA_PER_TURN, vp: 0 });
  });

  it('se cumule avec l’Autel de mana : la zone rapporte 3 mana (§10)', () => {
    const state = gameWith(
      [
        { monster: 'porte-etendard', owner: 1, at: FORGE },
        { terrain: 'autel-de-mana', owner: 1, at: FORGE },
      ],
      { activePlayer: 2, players: { 1: { mana: 0, vp: 0 } } },
    );
    expect(atStartOfMyTurn(state)).toMatchObject({ mana: BASE_MANA_PER_TURN + 3, vp: 1 });
  });
});
