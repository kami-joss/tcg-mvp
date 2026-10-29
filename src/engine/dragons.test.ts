import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { CARDS, DECKS, TEST_GRIMOIRE } from './cards';
import { at, gameWith } from './test-utils';
import type { Action, CardId, Direction, GameState } from './types';

const END_TURN: Action = { type: 'endTurn' };
const evolveInto = (cardId: CardId, unitId = 'u1'): Action => ({ type: 'activateEffect', unitId, target: { kind: 'card', cardId } });
const effect = (unitId: string, distance?: number, direction?: Direction): Action => ({
  type: 'activateEffect',
  unitId,
  target: { kind: 'area', ...(direction ? { direction } : {}), ...(distance ? { distance } : {}) },
});
const areaChoices = (state: GameState) =>
  getLegalActions(state).flatMap((a) =>
    a.type === 'activateEffect' && a.target.kind === 'area' ? [`${a.target.direction ?? '-'}:${a.target.distance ?? '-'}`] : [],
  );
const DRAGONS: CardId[] = ['dragon-feu', 'dragon-eau', 'dragon-vent', 'dragon-terre'];
const GRIMOIRE = { grimoire: ['jeune-dragon', ...DRAGONS] as CardId[] };

describe('deck Dragons (SPEC.md §6 bis)', () => {
  it('25 cartes : 3 jeunes dragons, chaque dragon élémentaire ×2, une Origine, complétés par le grimoire de test', () => {
    const deck = DECKS.find((d) => d.id === 'dragons')!;
    const count = (id: CardId) => deck.cards.filter((c) => c === id).length;
    expect(deck.cards).toHaveLength(25);
    expect(count('jeune-dragon')).toBe(3);
    expect(count('dragon-origine')).toBe(1);
    for (const id of DRAGONS) expect(count(id), id).toBe(2);
    const own = (c: CardId) => c === 'jeune-dragon' || c === 'dragon-origine' || DRAGONS.includes(c);
    for (const id of deck.cards.filter((c) => !own(c))) expect(TEST_GRIMOIRE).toContain(id);
  });

  it('caractéristiques', () => {
    expect(CARDS['jeune-dragon']).toMatchObject({ cost: 2, atk: 3, range: 1, mobility: 4, hp: 2, keywords: [] });
    expect(CARDS['jeune-dragon']).toMatchObject({ activated: [{ name: 'Évolution', manaCost: 2, targeting: { type: 'self' }, effects: [{ type: 'evolve' }] }] });
    expect(CARDS['dragon-feu']).toMatchObject({ cost: 7, atk: 5, mobility: 5, hp: 5, keywords: [{ keyword: 'vol' }], evolvesFrom: 'jeune-dragon' });
    expect(CARDS['dragon-eau']).toMatchObject({ cost: 7, atk: 4, mobility: 4, hp: 7 });
    expect(CARDS['dragon-vent']).toMatchObject({ cost: 7, atk: 4, mobility: 7, hp: 4 });
    expect(CARDS['dragon-terre']).toMatchObject({ cost: 7, atk: 6, mobility: 4, hp: 5 });
    for (const id of DRAGONS) expect(CARDS[id], id).toMatchObject({ activated: [{ manaCost: 3 }] });
  });
});

describe('Jeune dragon : évolution (effet actif, 2 mana)', () => {
  const young = (turn?: number) =>
    gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 2), facing: 'right' }], {
      turn: turn ?? 3,
      players: { 1: { mana: 2, ...GRIMOIRE } },
    });

  it('un choix par dragon élémentaire du grimoire', () => {
    const choices = getLegalActions(young()).filter((a) => a.type === 'activateEffect');
    expect(choices.map((a) => (a.type === 'activateEffect' && a.target.kind === 'card' ? a.target.cardId : null))).toEqual(DRAGONS);
  });

  it('le jeune dragon est sacrifié (sans VP) ; le dragon prend sa place, sans payer ses 7 mana, et n’agit pas ce tour', () => {
    const after = applyAction(young(), evolveInto('dragon-terre'));
    expect(after.units.u1).toBeUndefined();
    expect(after.units.u2).toMatchObject({
      cardId: 'dragon-terre',
      pos: at(5, 2),
      facing: 'right',
      mobilityLeft: 0,
      hasAttacked: true,
      usedEffects: [0],
    });
    expect(after.players[1]).toMatchObject({ mana: 0, vp: 0, grimoire: ['jeune-dragon', 'dragon-feu', 'dragon-eau', 'dragon-vent'] });
    expect(after.players[1].grimoire).not.toContain('dragon-terre');
    // Le Jeune dragon sacrifié va au cimetière, pas le dragon qui le remplace (§4.3).
    expect(after.players[1].graveyard).toEqual(['jeune-dragon']);
    expect(after.players[2].vp).toBe(0);
    expect(after.events.map((e) => e.type)).toEqual(['effect', 'mana', 'sacrifice', 'cardPlayed', 'summon']);
    expect(getLegalActions(after).filter((a) => 'unitId' in a && a.unitId === 'u2')).toEqual([]);
    const next = applyAction(applyAction(after, END_TURN), END_TURN);
    expect(next.units.u2).toMatchObject({ mobilityLeft: 4, hasAttacked: false });
  });

  it('pas le tour où le jeune dragon est invoqué ; pas sans dragon dans le grimoire ni sans 2 mana', () => {
    let state = gameWith([], { players: { 1: { mana: 4, ...GRIMOIRE } } });
    state = applyAction(state, { type: 'playCard', cardId: 'jeune-dragon', target: { kind: 'cell', pos: at(0, 4) } });
    expect(getLegalActions(state).some((a) => a.type === 'activateEffect')).toBe(false);
    const empty = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 2) }], { turn: 3, players: { 1: { mana: 2, grimoire: [] } } });
    expect(getLegalActions(empty).some((a) => a.type === 'activateEffect')).toBe(false);
    const poor = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 2) }], { turn: 3, players: { 1: { mana: 1, ...GRIMOIRE } } });
    expect(getLegalActions(poor).some((a) => a.type === 'activateEffect')).toBe(false);
  });

  it('un dragon élémentaire s’invoque aussi normalement, pour 7 mana, sans sacrifice', () => {
    const state = gameWith([], { players: { 1: { mana: 7, ...GRIMOIRE } } });
    const after = applyAction(state, { type: 'playCard', cardId: 'dragon-feu', target: { kind: 'cell', pos: at(0, 4) } });
    expect(after.units.u1).toMatchObject({ cardId: 'dragon-feu', mobilityLeft: 5 });
    expect(after.players[1].mana).toBe(0);
  });
});

describe('effets actifs des dragons (3 mana)', () => {
  // Dragon de J1 en (8,2), regardant vers le bas : sa zone est (9,2), (9,1), (9,3).
  const around = (cardId: CardId) =>
    gameWith(
      [
        { monster: cardId, owner: 1, at: at(8, 2), facing: 'down' },
        { monster: 'golem', owner: 2, at: at(9, 2) },
        { monster: 'milicien', owner: 2, at: at(9, 1) },
        { monster: 'milicien', owner: 1, at: at(9, 3) }, // allié : épargné
        { monster: 'milicien', owner: 2, at: at(8, 3) }, // hors zone
      ],
      { players: { 1: { mana: 5 } } },
    );

  it('Déflagration : 2 dégâts et burn 1 aux ennemis des 3 cases de devant', () => {
    const after = applyAction(around('dragon-feu'), effect('u1'));
    expect(after.units.u2).toMatchObject({ hp: 5 });
    expect(after.units.u3).toMatchObject({ hp: 1 });
    expect(after.units.u2?.statuses).toEqual([{ kind: 'burn', amount: 1, turns: 1, expiresAtTurn: 3 }]);
    expect(after.units.u4).toMatchObject({ hp: 3, statuses: [] });
    expect(after.units.u5).toMatchObject({ hp: 3 });
    expect(after.players[1].mana).toBe(2);
    expect(after.events[0]).toMatchObject({ type: 'effect', cells: [at(9, 2), at(9, 3), at(9, 1)] });
  });

  it('Raz de marée : stun des ennemis sur 3 cases en ligne, dans la direction choisie ; le dragon se tourne', () => {
    const state = gameWith(
      [
        { monster: 'dragon-eau', owner: 1, at: at(8, 2), facing: 'up' },
        { monster: 'golem', owner: 2, at: at(8, 3) },
        { monster: 'milicien', owner: 2, at: at(8, 5) }, // 3e case de la ligne
        { monster: 'milicien', owner: 2, at: at(8, 6) }, // 4e case : épargné
        { monster: 'milicien', owner: 2, at: at(9, 2) }, // autre direction
      ],
      { players: { 1: { mana: 5 } } },
    );
    // Une direction par côté où se trouve au moins un ennemi.
    expect(areaChoices(state)).toEqual(['down:-', 'right:-']);
    let after = applyAction(state, effect('u1', undefined, 'right'));
    expect(after.units.u2?.statuses.map((s) => s.kind)).toEqual(['stun']);
    expect(after.units.u3?.statuses.map((s) => s.kind)).toEqual(['stun']);
    expect(after.units.u4?.statuses).toEqual([]);
    expect(after.units.u5?.statuses).toEqual([]);
    expect(after.units.u1).toMatchObject({ facing: 'right' });
    expect(after.events[0]).toMatchObject({ type: 'effect', cells: [at(8, 3), at(8, 4), at(8, 5)], facing: 'right' });
    after = applyAction(after, END_TURN);
    const own = (id: string) => getLegalActions(after).filter((a) => 'unitId' in a && a.unitId === id);
    expect(own('u2')).toEqual([]);
    expect(own('u4').length).toBeGreaterThan(0);
  });

  it('la ligne s’arrête avant la première falaise ou case X ; les monstres ne l’arrêtent pas', () => {
    const state = gameWith(
      [
        { monster: 'dragon-eau', owner: 1, at: at(2, 2), facing: 'right' },
        { monster: 'milicien', owner: 2, at: at(3, 2) },
        { monster: 'milicien', owner: 2, at: at(4, 2) }, // derrière la falaise de la Scierie
        { monster: 'milicien', owner: 2, at: at(2, 3) },
        { monster: 'milicien', owner: 2, at: at(2, 4) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    const down = applyAction(state, effect('u1', undefined, 'down'));
    expect(down.events[0]).toMatchObject({ cells: [at(3, 2)] });
    expect(down.units.u3?.statuses).toEqual([]);
    const right = applyAction(state, effect('u1', undefined, 'right'));
    expect(right.units.u4?.statuses.map((s) => s.kind)).toEqual(['stun']);
    expect(right.units.u5?.statuses.map((s) => s.kind)).toEqual(['stun']);
    // (1, 4) : la ligne vers le bas s'arrête sur la case X (3, 4).
    const blocked = gameWith(
      [
        { monster: 'dragon-eau', owner: 1, at: at(1, 4), facing: 'down' },
        { monster: 'milicien', owner: 2, at: at(2, 4) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(applyAction(blocked, effect('u1', undefined, 'down')).events[0]).toMatchObject({ cells: [at(2, 4)] });
  });

  it('Vent violent : direction puis distance (1 à 3) ; les ennemis de la ligne reculent dans ce sens, le plus éloigné d’abord', () => {
    const state = gameWith(
      [
        { monster: 'dragon-vent', owner: 1, at: at(8, 1), facing: 'up' },
        { monster: 'milicien', owner: 2, at: at(8, 2) },
        { monster: 'milicien', owner: 2, at: at(8, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(areaChoices(state)).toEqual(['right:1', 'right:2', 'right:3']);
    const after = applyAction(state, effect('u1', 2, 'right'));
    expect(after.units.u3?.pos).toEqual(at(8, 5));
    expect(after.units.u2?.pos).toEqual(at(8, 4));
    expect(after.units.u1).toMatchObject({ facing: 'right' });
  });

  it('Tremblement de terre : 3 dégâts aux ennemis adjacents, pas à travers une falaise (même en rayon 2)', () => {
    const state = gameWith(
      [
        { monster: 'dragon-terre', owner: 1, at: at(5, 3) },
        { monster: 'golem', owner: 2, at: at(6, 3) },
        { monster: 'golem', owner: 2, at: at(5, 2) }, // derrière la falaise de la Scierie
      ],
      { players: { 1: { mana: 5 } } },
    );
    const after = applyAction(state, effect('u1'));
    expect(after.units.u2).toMatchObject({ hp: 4 });
    expect(after.units.u3).toMatchObject({ hp: 7 });
  });

  it('Tremblement de terre : rayon 2, diagonales comprises (carré 5 × 5 sur terrain dégagé)', () => {
    const state = gameWith(
      [
        { monster: 'dragon-terre', owner: 1, at: at(8, 2) },
        { monster: 'milicien', owner: 2, at: at(7, 1) },
        { monster: 'milicien', owner: 2, at: at(8, 4) }, // à 2 cases
        { monster: 'milicien', owner: 2, at: at(10, 4) }, // coin du carré 5 × 5
        { monster: 'milicien', owner: 2, at: at(8, 5) }, // à 3 cases : épargné
      ],
      { players: { 1: { mana: 5 } } },
    );
    const after = applyAction(state, effect('u1'));
    expect(after.units.u2).toBeUndefined();
    expect(after.units.u3).toBeUndefined();
    expect(after.units.u4).toBeUndefined();
    expect(after.units.u5).toMatchObject({ hp: 3 });
  });

  it('pas d’effet sans ennemi dans la zone, ni sans 3 mana', () => {
    const alone = gameWith([{ monster: 'dragon-feu', owner: 1, at: at(8, 2) }], { players: { 1: { mana: 5 } } });
    expect(getLegalActions(alone).some((a) => a.type === 'activateEffect')).toBe(false);
    const poor = { ...around('dragon-feu'), players: { ...around('dragon-feu').players, 1: { ...around('dragon-feu').players[1], mana: 2 } } };
    expect(getLegalActions(poor).some((a) => a.type === 'activateEffect')).toBe(false);
  });
});
