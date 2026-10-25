import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { CARDS } from './cards';
import { IllegalActionError } from './errors';
import { at, gameWith } from './test-utils';
import { getPlayerView } from './view';
import type { Action, GameState, Position, UnitId } from './types';

// Deck Sorciers du feu (SPEC.md §6 bis, §10) : Brûlure 1, 2 tours ; Lutin brasier et ses cases brûlées ; Archimage ;
// Golem de lave (Passage).

const END_TURN: Action = { type: 'endTurn' };
const MANA = { players: { 1: { mana: 10 } } };
const move = (unitId: UnitId, to: Position): Action => ({ type: 'move', unitId, to });
const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const burnCell = (pos: Position): Action => ({ type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos } });
const burnTargets = (state: GameState) =>
  getLegalActions(state).flatMap((a) => (a.type === 'activateEffect' && a.target.kind === 'cell' ? [a.target.pos] : []));

describe('cartes du deck Sorciers du feu', () => {
  it('caractéristiques, famille, Brûlure 1, 2 tours', () => {
    expect(CARDS.apprenti).toMatchObject({ cost: 2, atk: 1, hp: 3, mobility: 4, range: 2, family: 'sorcier' });
    expect(CARDS['lutin-brasier']).toMatchObject({ cost: 4, atk: 2, hp: 4, mobility: 4, range: 2, family: 'sorcier' });
    expect(CARDS.archimage).toMatchObject({ cost: 6, atk: 3, hp: 5, mobility: 4, range: 2, family: 'sorcier' });
    expect(CARDS['golem-de-lave']).toMatchObject({ cost: 5, atk: 2, hp: 8, mobility: 2, range: 1, family: 'sorcier' });
    for (const id of ['apprenti', 'lutin-brasier', 'archimage'] as const) {
      expect(CARDS[id], id).toMatchObject({ keywords: [{ keyword: 'brulure', amount: 1, turns: 2 }] });
    }
  });

  it('à l’attaque, la cible est burn 1 pendant 2 tours, terrain compris', () => {
    const state = gameWith([
      { monster: 'apprenti', owner: 1, at: at(1, 1) },
      { monster: 'golem', owner: 2, at: at(1, 3) },
      { terrain: 'bastion', owner: 2, at: at(3, 1) },
    ]);
    const hit = applyAction(state, attack('u1', 'u2'));
    expect(hit.units.u2?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 2 }]);
    const wall = applyAction(state, attack('u1', 'u3'));
    expect(wall.units.u3?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 2 }]);
  });
});

describe('Lutin brasier : case brûlée', () => {
  const state = gameWith(
    [
      { monster: 'lutin-brasier', owner: 1, at: at(2, 2) },
      { monster: 'milicien', owner: 1, at: at(1, 2) },
      { monster: 'chevalier', owner: 2, at: at(2, 6) },
    ],
    MANA,
  );

  it('une case libre parmi ses adjacents, rayon 2 : ni occupée, ni plus loin, ni déjà brûlée', () => {
    const targets = burnTargets(state);
    expect(targets).toContainEqual(at(2, 4));
    expect(targets).toContainEqual(at(0, 3));
    expect(targets).not.toContainEqual(at(1, 2)); // le Milicien y est
    expect(targets).not.toContainEqual(at(2, 5)); // à 3 cases
    const burned = applyAction(state, burnCell(at(2, 4)));
    expect(burned.players[1].mana).toBe(9);
    // Effet utilisé pour ce tour ; au tour suivant, la case déjà brûlée n'est plus proposée.
    const later = applyAction(applyAction(burned, END_TURN), END_TURN);
    expect(burnTargets(later)).not.toContainEqual(at(2, 4));
  });

  it('visible des deux joueurs ; chaque ennemi qui y entre perd 1 PV et est burn 1 pendant 1 tour ; la case reste', () => {
    const burned = applyAction(state, burnCell(at(2, 4)));
    expect(burned.burningCells).toEqual([
      expect.objectContaining({ owner: 1, pos: at(2, 4), cardId: 'lutin-brasier' }),
    ]);
    expect(getPlayerView(burned, 2).burningCells).toHaveLength(1);
    const entered = applyAction(applyAction(burned, END_TURN), move('u3', at(2, 4)));
    expect(entered.units.u3).toMatchObject({ hp: 3, statuses: [expect.objectContaining({ kind: 'burn', amount: 1, turns: 1 })] });
    expect(entered.events).toContainEqual(expect.objectContaining({ type: 'burningCell', unitId: 'u3' }));
    expect(entered.burningCells).toHaveLength(1);
    // Ses propres monstres n'ont rien.
    const own = applyAction(burned, move('u1', at(2, 4)));
    expect(own.units.u1).toMatchObject({ hp: 4, statuses: [] });
  });

  it('elle brûle jusqu’à la fin du 2e prochain tour de son camp', () => {
    let next = applyAction(state, burnCell(at(2, 4)));
    for (let i = 0; i < 4; i++) next = applyAction(next, END_TURN);
    expect(next.turn).toBe(5);
    expect(next.burningCells).toHaveLength(1);
    expect(applyAction(next, END_TURN).burningCells).toEqual([]);
  });

  it('pas sur une case occupée', () => {
    expect(() => applyAction(state, burnCell(at(1, 2)))).toThrow(IllegalActionError);
  });
});

describe('Archimage', () => {
  it('Actif (1 mana) : tous les ennemis adjacents sont burn 2 pendant 2 tours', () => {
    const state = gameWith(
      [
        { monster: 'archimage', owner: 1, at: at(1, 4) },
        { monster: 'golem', owner: 2, at: at(1, 5) },
        { monster: 'golem', owner: 2, at: at(2, 3) },
        { monster: 'golem', owner: 2, at: at(1, 7) },
      ],
      MANA,
    );
    const after = applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'area' } });
    expect(after.players[1].mana).toBe(9);
    for (const id of ['u2', 'u3']) expect(after.units[id]?.statuses, id).toMatchObject([{ kind: 'burn', amount: 2, turns: 2 }]);
    expect(after.units.u4?.statuses).toEqual([]);
  });
});

describe('Golem de lave : Passage · adjacents · burn 1 pendant 1 tour', () => {
  it('un ennemi qui entre à côté de lui est burn, une fois par mouvement', () => {
    const state = gameWith(
      [
        { monster: 'golem-de-lave', owner: 1, at: at(1, 1) },
        { monster: 'eclaireur', owner: 2, at: at(4, 1) },
      ],
      { activePlayer: 2 },
    );
    // (4, 1) → (3, 1) → (2, 1) → (2, 2) : il entre dans la zone en (2, 1) et y reste en (2, 2).
    const after = applyAction(state, { type: 'move', unitId: 'u2', to: at(2, 2), path: [at(3, 1), at(2, 1), at(2, 2)] });
    expect(after.units.u2?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 1 }]);
    expect(after.events).toContainEqual({ type: 'passage', sourceId: 'u1', unitId: 'u2', pos: at(2, 1) });
  });

  it('rien quand c’est le Golem qui s’approche', () => {
    const state = gameWith([
      { monster: 'golem-de-lave', owner: 1, at: at(1, 1) },
      { monster: 'eclaireur', owner: 2, at: at(4, 1) },
    ]);
    const after = applyAction(state, move('u1', at(3, 1)));
    expect(after.units.u2?.statuses).toEqual([]);
  });
});
