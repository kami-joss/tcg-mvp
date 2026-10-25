import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { IllegalActionError } from './errors';
import { getMoveDestinations } from './movement';
import { statusExpiry } from './statuses';
import { at, gameWith, withStatus } from './test-utils';
import { getUnitsAt } from './units';
import type { Action, CardId, GameState, MonsterUnit, Position, Trap, UnitId } from './types';

// Cartes communes (SPEC.md §6 ter) : Terrain drainant, Terrain piégé, Zone d'invocation, Invocateur, Téléporteur.
// Plateau classique : Forge en (5, 4), cases X en (3, 4), (4, 4), (6, 4), (7, 4). Zone de la Forge (cases adjacentes) :
// (4, 3), (5, 3), (6, 3), (4, 5), (5, 5), (6, 5). La colonne 2 est séparée de la 3 par la falaise de la Scierie.

const FORGE = at(5, 4);
const END_TURN: Action = { type: 'endTurn' };
const move = (unitId: UnitId, to: Position, path?: Position[]): Action => ({ type: 'move', unitId, to, ...(path ? { path } : {}) });
const monster = (state: GameState, id: UnitId) => state.units[id] as MonsterUnit;
const bomb = (owner: 1 | 2, pos: Position): Trap => ({ owner, pos, effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe' });

describe('Passage (SPEC.md §5.2, §10) : Terrain drainant', () => {
  const drained = (units: Parameters<typeof gameWith>[0] = []) =>
    gameWith([{ terrain: 'terrain-drainant', owner: 2, at: FORGE }, ...units]);

  it('1 dégât au monstre ennemi qui entre dans sa zone, une seule fois par mouvement', () => {
    // (4, 3) et (5, 3) sont toutes deux adjacentes à la Forge : un seul dégât pour ce déplacement.
    const state = drained([{ monster: 'chevalier', owner: 1, at: at(3, 3) }]);
    const after = applyAction(state, move('u2', at(5, 3), [at(4, 3), at(5, 3)]));
    expect(monster(after, 'u2')).toMatchObject({ pos: at(5, 3), hp: 3 });
    expect(after.events.filter((e) => e.type === 'passage')).toEqual([{ type: 'passage', sourceId: 'u1', unitId: 'u2', pos: at(4, 3) }]);
    // Un nouveau déplacement est un nouveau mouvement : une case de la zone coûte encore 1 PV.
    expect(monster(applyAction(after, move('u2', at(6, 3))), 'u2').hp).toBe(2);
  });

  it('rien pour ses alliés ; volant compris pour les ennemis', () => {
    const own = gameWith([
      { terrain: 'terrain-drainant', owner: 1, at: FORGE },
      { monster: 'chevalier', owner: 1, at: at(3, 3) },
    ]);
    expect(monster(applyAction(own, move('u2', at(4, 3))), 'u2').hp).toBe(4);
    const flying = drained([{ monster: 'dragonnet', owner: 1, at: at(3, 3) }]);
    expect(monster(applyAction(flying, move('u2', at(4, 3))), 'u2').hp).toBe(5);
  });

  it('une destruction rapporte 1 VP au propriétaire du terrain, et le déplacement s’arrête', () => {
    const state = drained([{ monster: 'eclaireur', owner: 1, at: at(3, 3) }]);
    const after = applyAction(state, move('u2', at(6, 3), [at(4, 3), at(5, 3), at(6, 3)]));
    expect(after.units.u2).toBeUndefined();
    expect(after.players[2].vp).toBe(1);
  });

  it('un recul dans sa zone est un mouvement : un seul dégât même s’il traverse plusieurs cases', () => {
    const state = gameWith(
      [
        { terrain: 'terrain-drainant', owner: 1, at: FORGE },
        { monster: 'golem', owner: 2, at: at(3, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    // Bourrasque vers le bas : (4, 3) puis (5, 3), deux cases de la zone.
    const pushed = applyAction(state, {
      type: 'playCard',
      cardId: 'bourrasque',
      target: { kind: 'unitAndDirection', unitId: 'u2', direction: 'down' },
    });
    expect(monster(pushed, 'u2')).toMatchObject({ pos: at(5, 3), hp: 6 });
  });
});

describe('Passage (SPEC.md §5.2, §5 bis) : Terrain piégé', () => {
  const trapped = (units: Parameters<typeof gameWith>[0] = []) =>
    gameWith([{ terrain: 'terrain-piege', owner: 2, at: FORGE }, ...units]);

  it('slow 1 tout de suite pour ce tour : la mobilité restante baisse, une fois par mouvement', () => {
    const state = trapped([{ monster: 'chevalier', owner: 1, at: at(3, 3) }]);
    const after = applyAction(state, move('u2', at(5, 3), [at(4, 3), at(5, 3)]));
    const knight = monster(after, 'u2');
    expect(knight).toMatchObject({ pos: at(5, 3), mobilityLeft: 0 });
    expect(knight.statuses).toEqual([{ kind: 'slow', amount: 1, turns: 0, expiresAtTurn: statusExpiry(0, 1, 1, 1) }]);
  });

  it('les chemins en tiennent compte : entrer dans la zone coûte 1 mobilité de plus, la première fois', () => {
    const state = trapped([{ monster: 'chevalier', owner: 1, at: at(3, 3) }]);
    const costs = new Map(getMoveDestinations(state, monster(state, 'u2')).map((d) => [`${d.pos.row},${d.pos.col}`, d.cost]));
    expect(costs.get('2,3')).toBe(1);
    expect(costs.get('4,3')).toBe(2);
    expect(costs.get('5,3')).toBe(3);
    // (6, 3) serait à 3 pas sans le terrain : trop loin avec le slow.
    expect(costs.has('6,3')).toBe(false);
    expect(() => applyAction(state, move('u2', at(6, 3), [at(4, 3), at(5, 3), at(6, 3)]))).toThrow(IllegalActionError);
  });

  it('sans effet au tour suivant : le slow ne dure que jusqu’à son prochain tour', () => {
    const state = trapped([{ monster: 'chevalier', owner: 1, at: at(3, 3) }]);
    let next = applyAction(state, move('u2', at(4, 3)));
    next = applyAction(applyAction(next, END_TURN), END_TURN);
    expect(monster(next, 'u2')).toMatchObject({ mobilityLeft: 3, statuses: [] });
  });

  it('pris pendant le tour adverse (recul), il ne retire rien', () => {
    const state = gameWith(
      [
        { terrain: 'terrain-piege', owner: 1, at: FORGE },
        { monster: 'chevalier', owner: 2, at: at(3, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    let next = applyAction(state, {
      type: 'playCard',
      cardId: 'bourrasque',
      target: { kind: 'unitAndDirection', unitId: 'u2', direction: 'down' },
    });
    expect(monster(next, 'u2').statuses).toHaveLength(1);
    next = applyAction(next, END_TURN);
    expect(monster(next, 'u2')).toMatchObject({ mobilityLeft: 3, statuses: [] });
  });
});

describe('Zone d’invocation (Point d’invocation, SPEC.md §4.5)', () => {
  const summonCells = (state: GameState, cardId: CardId) =>
    getLegalActions(state).flatMap((a) =>
      a.type === 'playCard' && a.cardId === cardId && a.target.kind === 'cell' ? [a.target.pos] : [],
    );

  it('sa case est une case d’invocation de son camp, tant qu’aucun monstre ne s’y trouve', () => {
    const state = gameWith([{ terrain: 'zone-invocation', owner: 1, at: FORGE }], { players: { 1: { mana: 10 } } });
    expect(summonCells(state, 'milicien')).toContainEqual(FORGE);
    const after = applyAction(state, { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: FORGE } });
    expect(getUnitsAt(after, FORGE).map((u) => u.cardId)).toEqual(['zone-invocation', 'milicien']);
    expect(summonCells(after, 'eclaireur')).not.toContainEqual(FORGE);
  });

  it('pas pour l’adversaire', () => {
    const state = gameWith([{ terrain: 'zone-invocation', owner: 1, at: FORGE }], { activePlayer: 2, players: { 2: { mana: 10 } } });
    expect(summonCells(state, 'milicien')).not.toContainEqual(FORGE);
  });
});

describe('Invocateur (SPEC.md §5.4, Invocation)', () => {
  const summoner = (mana: number, units: Parameters<typeof gameWith>[0] = []) =>
    gameWith([{ monster: 'invocateur', owner: 1, at: at(2, 2) }, ...units], { players: { 1: { mana } } });
  const targets = (state: GameState) =>
    getLegalActions(state).flatMap((a) => (a.type === 'activateEffect' && a.target.kind === 'cellAndCard' ? [a.target] : []));

  it('une cible par case adjacente libre et par monstre qu’il peut payer, en plus d’1 mana', () => {
    const cards = new Set(targets(summoner(5)).map((t) => t.cardId));
    expect(cards.has('golem')).toBe(true);
    expect(cards.has('dragonnet')).toBe(false);
    expect(new Set(targets(summoner(5)).map((t) => `${t.pos.row},${t.pos.col}`)).size).toBe(8);
  });

  it('paie 1 mana + le coût du monstre, qui arrive sur la case et peut agir aussitôt', () => {
    const after = applyAction(summoner(5), { type: 'activateEffect', unitId: 'u1', target: { kind: 'cellAndCard', pos: at(3, 3), cardId: 'golem' } });
    expect(after.players[1].mana).toBe(0);
    expect(after.players[1].used).toEqual(['golem']);
    expect(monster(after, 'u2')).toMatchObject({ cardId: 'golem', pos: at(3, 3), mobilityLeft: 2, hasAttacked: false, hasUsedEffect: false });
    expect(monster(after, 'u1').hasUsedEffect).toBe(true);
    expect(targets(after)).toEqual([]);
  });

  it('le monstre invoqué entre sur sa case : un piège ennemi s’y déclenche', () => {
    const state = { ...summoner(5), traps: [bomb(2, at(3, 3))] };
    const after = applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'cellAndCard', pos: at(3, 3), cardId: 'golem' } });
    expect(monster(after, 'u2').hp).toBe(4);
  });
});

describe('Téléporteur (SPEC.md §5.4, Téléportation)', () => {
  const teleport = (unitId: UnitId, pos: Position): Action => ({
    type: 'activateEffect',
    unitId: 'u1',
    target: { kind: 'unitAndCell', unitId, pos },
  });

  it('un allié n’importe où (pas lui-même) vers une case adjacente libre ; il garde mobilité, attaque et orientation', () => {
    const state = gameWith(
      [
        { monster: 'teleporteur', owner: 1, at: at(2, 2) },
        { monster: 'golem', owner: 1, at: at(9, 0), mobilityLeft: 1, hasAttacked: true, facing: 'left' },
      ],
      { players: { 1: { mana: 1 } } },
    );
    const targets = getLegalActions(state).flatMap((a) => (a.type === 'activateEffect' && a.target.kind === 'unitAndCell' ? [a.target] : []));
    expect(new Set(targets.map((t) => t.unitId))).toEqual(new Set(['u2']));
    expect(targets).toHaveLength(8);
    const after = applyAction(state, teleport('u2', at(1, 1)));
    expect(monster(after, 'u2')).toMatchObject({ pos: at(1, 1), mobilityLeft: 1, hasAttacked: true, facing: 'left' });
    expect(after.players[1].mana).toBe(0);
    expect(after.events.find((e) => e.type === 'teleport')).toEqual({ type: 'teleport', unitId: 'u2', from: at(9, 0), to: at(1, 1) });
  });

  it('même un allié immobilisé ; la case d’arrivée déclenche pièges et Passage', () => {
    const state = gameWith(
      [
        { monster: 'teleporteur', owner: 1, at: at(3, 3) },
        { monster: 'golem', owner: 1, at: at(9, 0) },
        { terrain: 'terrain-drainant', owner: 2, at: FORGE },
      ],
      { players: { 1: { mana: 1 } } },
    );
    const netted: GameState = {
      ...state,
      traps: [bomb(2, at(4, 3))],
      units: { ...state.units, u2: { ...monster(state, 'u2'), statuses: [{ kind: 'immobilise', turns: 1, expiresAtTurn: 4 }] } },
    };
    const after = applyAction(netted, teleport('u2', at(4, 3)));
    // Bombe (3) puis Terrain drainant (1).
    expect(monster(after, 'u2')).toMatchObject({ pos: at(4, 3), hp: 3 });
  });
});

describe('slow pris pendant son propre tour (SPEC.md §5 bis)', () => {
  it('réduit aussitôt la mobilité restante, sans descendre sous 0 ; pas pendant le tour adverse', () => {
    const state = gameWith([
      { monster: 'eclaireur', owner: 1, at: at(5, 2), mobilityLeft: 1 },
      { monster: 'eclaireur', owner: 2, at: at(9, 2) },
    ]);
    expect(monster(withStatus(state, 'u1', 'slow', 2, 0), 'u1').mobilityLeft).toBe(0);
    expect(monster(withStatus(state, 'u2', 'slow', 2, 0), 'u2').mobilityLeft).toBe(3);
  });
});
