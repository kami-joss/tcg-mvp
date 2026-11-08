import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { COMMON_CARDS, DECKS, getTerrainCard } from './cards';
import { IllegalActionError } from './errors';
import { getMoveDestinations, getNextTurnOnMoveBonus, getOnMoveBonus } from './movement';
import { at, gameWith, withStatus } from './test-utils';
import type { Action, GameState, MonsterUnit, Position, UnitId } from './types';
import type { UnitSpec } from './test-utils';

// Terrain de chasse (SPEC.md §6 ter, §10) : carte commune, 1 mana, 3 PV. Au déplacement · sa case et adjacents · +1
// mobilité (pour ce tour) : un de ses monstres qui commence un déplacement sur une case de sa zone a +1 mobilité ce
// tour, une fois par tour et par monstre. Plateau classique : Forge en (5, 4), cases X en (3, 4), (4, 4), (6, 4),
// (7, 4) ; sa zone, (5, 4) et ses cases adjacentes jouables : (4, 3), (5, 3), (6, 3), (4, 5), (5, 5), (6, 5).

const FORGE = at(5, 4);
const END_TURN: Action = { type: 'endTurn' };
const move = (unitId: UnitId, to: Position, path?: Position[]): Action => ({ type: 'move', unitId, to, ...(path ? { path } : {}) });
const monster = (state: GameState, id: UnitId) => state.units[id] as MonsterUnit;
const farthest = (state: GameState, id: UnitId) => Math.max(...getMoveDestinations(state, monster(state, id)).map((d) => d.cost));

/** Un Terrain de chasse de J1 sur la Forge (u1), puis les unités données (u2…). */
const hunting = (units: readonly UnitSpec[], owner: 1 | 2 = 1) => gameWith([{ terrain: 'terrain-de-chasse', owner, at: FORGE }, ...units]);

describe('Terrain de chasse : la carte', () => {
  it('terrain commun à 1 mana et 3 PV, « Au déplacement » sur sa case et ses adjacentes : +1 mobilité', () => {
    expect(getTerrainCard('terrain-de-chasse')).toMatchObject({
      name: 'Terrain de chasse',
      cost: 1,
      hp: 3,
      zoneManaBonus: 0,
      passage: null,
      summonPoint: false,
      onMove: { zone: 'cellAndSquare', mobility: 1 },
    });
    expect(COMMON_CARDS).toContain('terrain-de-chasse');
  });

  it('un exemplaire dans le deck Vampire seulement, à la place du Terrain drainant (plus dans Archers impériaux, remaniés le 2026-11-08)', () => {
    for (const deck of DECKS) {
      const count = (id: string) => deck.cards.filter((card) => card === id).length;
      const hunts = deck.id === 'vampire';
      expect(count('terrain-de-chasse'), deck.id).toBe(hunts ? 1 : 0);
      if (hunts) expect(count('terrain-drainant'), deck.id).toBe(0);
      expect(deck.cards, deck.id).toHaveLength(deck.id === 'archers' ? 26 : 25);
    }
  });
});

describe('Terrain de chasse : +1 mobilité au départ de sa zone (§10)', () => {
  it('un allié sur une case adjacente va 1 case plus loin ; le +1 est un bonus du tour, venu du terrain', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]);
    expect(getOnMoveBonus(state, monster(state, 'u2'))).toBe(1);
    expect(farthest(state, 'u2')).toBe(3);
    // Sans le terrain, le Milicien (mobilité 2) n'irait qu'à 2 cases.
    const plain = gameWith([{ monster: 'milicien', owner: 1, at: at(5, 3) }]);
    expect(farthest(plain, 'u1')).toBe(2);

    const after = applyAction(state, move('u2', at(8, 3)));
    expect(monster(after, 'u2')).toMatchObject({ pos: at(8, 3), mobilityLeft: 0, boost: 1, onMoveTaken: true });
    expect(monster(after, 'u2').turnBonuses).toEqual([{ source: { cardId: 'terrain-de-chasse' }, atk: 0, range: 0, mobility: 1 }]);
    expect(after.events.find((e) => e.type === 'mobility')).toEqual({
      type: 'mobility',
      unitId: 'u2',
      pos: at(5, 3),
      amount: 1,
      source: 'terrain-de-chasse',
    });
  });

  it('sur la case même du terrain aussi, dès le tour où on le pose (le monstre dessous compris)', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: FORGE }], {
      players: { 1: { mana: 5, grimoire: ['terrain-de-chasse'] } },
    });
    expect(farthest(state, 'u1')).toBe(2);
    const placed = applyAction(state, { type: 'playCard', cardId: 'terrain-de-chasse', target: { kind: 'cell', pos: FORGE } });
    expect(farthest(placed, 'u1')).toBe(3);
  });

  it('pris au premier déplacement qui part de la zone, même s’il y reste ; pas un deuxième ce tour', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]);
    // Un pas dans la zone : 2 + 1 − 1 = 2 pas restants, et plus de bonus.
    const inside = applyAction(state, move('u2', at(4, 3)));
    expect(monster(inside, 'u2')).toMatchObject({ mobilityLeft: 2, onMoveTaken: true });
    expect(getOnMoveBonus(inside, monster(inside, 'u2'))).toBe(0);
    expect(farthest(inside, 'u2')).toBe(2);
    // Revenir dans la zone ne le redonne pas.
    const back = applyAction(inside, move('u2', at(5, 3)));
    expect(monster(back, 'u2').mobilityLeft).toBe(1);
    expect(back.events.some((e) => e.type === 'mobility')).toBe(false);
  });

  it('un allié arrivé dans la zone en cours de tour en profite en repartant, même à 0 mobilité', () => {
    // Le Milicien arrive en (5, 3) avec ses 2 pas, puis en repart avec le +1.
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(7, 3) }]);
    expect(getOnMoveBonus(state, monster(state, 'u2'))).toBe(0);
    const arrived = applyAction(state, move('u2', at(5, 3)));
    expect(monster(arrived, 'u2').mobilityLeft).toBe(0);
    expect(getLegalActions(arrived)).toContainEqual(move('u2', at(4, 3)));
    expect(monster(applyAction(arrived, move('u2', at(4, 3))), 'u2')).toMatchObject({ pos: at(4, 3), mobilityLeft: 0 });
  });

  it('un chemin donné qui a besoin du +1 est accepté ; un pas de plus est refusé', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]);
    const path = [at(6, 3), at(7, 3), at(8, 3)];
    expect(monster(applyAction(state, move('u2', at(8, 3), path)), 'u2').pos).toEqual(at(8, 3));
    expect(() => applyAction(state, move('u2', at(9, 3), [...path, at(9, 3)]))).toThrow(IllegalActionError);
  });

  it('+1 au plus par monstre et par tour, même dans la zone de deux Terrains de chasse', () => {
    const state = gameWith([
      { terrain: 'terrain-de-chasse', owner: 1, at: FORGE },
      { terrain: 'terrain-de-chasse', owner: 1, at: at(6, 2) },
      { monster: 'milicien', owner: 1, at: at(5, 3) },
    ]);
    expect(farthest(state, 'u3')).toBe(3);
    expect(monster(applyAction(state, move('u3', at(4, 3))), 'u3').mobilityLeft).toBe(2);
  });

  it('rien pour les monstres de l’adversaire', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }], 2);
    expect(getOnMoveBonus(state, monster(state, 'u2'))).toBe(0);
    expect(farthest(state, 'u2')).toBe(2);
  });

  it('rien pour un monstre stun, immobilisé, ou dont le déplacement est fini pour le tour (retour, sablier)', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3), mobilityLeft: 0 }]);
    for (const kind of ['stun', 'immobilise'] as const) {
      const held = withStatus(state, 'u2', kind);
      expect(getOnMoveBonus(held, monster(held, 'u2')), kind).toBe(0);
      expect(getLegalActions(held).some((a) => a.type === 'move'), kind).toBe(false);
    }
    const halted: GameState = { ...state, units: { ...state.units, u2: { ...monster(state, 'u2'), halted: true } } };
    expect(getOnMoveBonus(halted, monster(halted, 'u2'))).toBe(0);
    expect(getLegalActions(halted).some((a) => a.type === 'move')).toBe(false);
  });

  it('le bonus reste si le terrain est détruit ensuite', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]);
    const inside = applyAction(state, move('u2', at(4, 3)));
    const { u1: _terrain, ...rest } = inside.units;
    const destroyed: GameState = { ...inside, units: rest };
    expect(monster(destroyed, 'u2').mobilityLeft).toBe(2);
    expect(farthest(destroyed, 'u2')).toBe(2);
  });

  it('de nouveau disponible à son tour suivant', () => {
    const state = hunting([{ monster: 'milicien', owner: 1, at: at(5, 3) }]);
    const moved = applyAction(state, move('u2', at(4, 3)));
    const next = applyAction(applyAction(moved, END_TURN), END_TURN);
    expect(monster(next, 'u2')).toMatchObject({ mobilityLeft: 2, turnBonuses: [] });
    expect(monster(next, 'u2').onMoveTaken).toBeUndefined();
    expect(farthest(next, 'u2')).toBe(3);
  });

  it('Emma le garde en se transformant, sans en reprendre un sous l’autre forme', () => {
    // Emma (mobilité 3) fait un pas dans la zone : 3 + 1 − 1 = 3 ; chauve-souris (mobilité 8) : 8 + 1 − 1 = 8.
    const state = hunting([{ monster: 'emma', owner: 1, at: at(5, 3) }]);
    const players = { ...state.players, 1: { ...state.players[1], mana: 5 } };
    const moved = applyAction({ ...state, players }, move('u2', at(4, 3)));
    expect(monster(moved, 'u2').mobilityLeft).toBe(3);
    const bat = applyAction(moved, { type: 'activateEffect', unitId: 'u2', target: { kind: 'unit', unitId: 'u2' } });
    expect(monster(bat, 'u2')).toMatchObject({ cardId: 'emma-chauve-souris', mobilityLeft: 8, onMoveTaken: true });
    expect(farthest(bat, 'u2')).toBeLessThanOrEqual(8);
  });
});

describe('Terrain de chasse : menace du prochain tour (survol, IA)', () => {
  it('+1 pour un monstre qui sera dans sa zone ; 0 s’il sera stun ou immobilisé, ou hors de la zone', () => {
    // J2 voit les monstres de J1 : leur prochain tour est le tour 3.
    const state = gameWith(
      [
        { terrain: 'terrain-de-chasse', owner: 1, at: FORGE },
        { monster: 'milicien', owner: 1, at: at(5, 3) },
        { monster: 'milicien', owner: 1, at: at(1, 1) },
      ],
      { activePlayer: 2 },
    );
    expect(getNextTurnOnMoveBonus(state, monster(state, 'u2'), state.turn, 2)).toBe(1);
    expect(getNextTurnOnMoveBonus(state, monster(state, 'u3'), state.turn, 2)).toBe(0);
    const stunned = withStatus(state, 'u2', 'stun');
    expect(getNextTurnOnMoveBonus(stunned, monster(stunned, 'u2'), stunned.turn, 2)).toBe(0);
  });
});
