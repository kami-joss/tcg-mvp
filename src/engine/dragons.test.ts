import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { CARDS } from './cards';
import { at, gameWith } from './test-utils';
import type { Action, CardId, Direction, GameState } from './types';

// Deck Dragons élémentaires (SPEC.md §6 bis, refait le 2026-11-08). Les noms, stats, Hurlements, le Nid de dragons, la
// composition et les ennemis invisibles sont dans `dragons-elementaires.test.ts` ; ici, l'évolution pas à pas et les
// règles générales des zones (direction au choix, falaises, cases X, recul vers l'avant, carré de 2).

const END_TURN: Action = { type: 'endTurn' };
const evolveInto = (cardId: CardId, unitId = 'u1'): Action => ({ type: 'activateEffect', unitId, target: { kind: 'card', cardId } });
const effect = (unitId: string, direction?: Direction): Action => ({
  type: 'activateEffect',
  unitId,
  target: { kind: 'area', ...(direction ? { direction } : {}) },
});
const areaChoices = (state: GameState) =>
  getLegalActions(state).flatMap((a) =>
    a.type === 'activateEffect' && a.target.kind === 'area' ? [`${a.target.direction ?? '-'}:${a.target.distance ?? '-'}`] : [],
  );
const DRAGONS: CardId[] = ['dragon-feu', 'dragon-eau', 'dragon-vent', 'dragon-terre'];
const GRIMOIRE = { grimoire: ['jeune-dragon', ...DRAGONS] as CardId[] };

describe('deck Dragons élémentaires (SPEC.md §6 bis)', () => {
  it('caractéristiques : les dragons coûtent 7 mana, ont Vol, évoluent du Jeune dragon, effet actif à 3 mana', () => {
    expect(CARDS['jeune-dragon']).toMatchObject({ keywords: [], archetype: 'dragon' });
    expect(CARDS['jeune-dragon']).toMatchObject({ activated: [{ targeting: { type: 'self' }, effects: [{ type: 'evolve' }] }] });
    for (const id of DRAGONS) {
      expect(CARDS[id], id).toMatchObject({
        cost: 7,
        keywords: [{ keyword: 'vol' }],
        evolvesFrom: 'jeune-dragon',
        archetype: 'dragon',
        activated: [{ manaCost: 3 }],
      });
    }
    for (const id of ['dragon-feu', 'dragon-eau', 'dragon-vent'] as const) {
      expect(CARDS[id], id).toMatchObject({ activated: [{ targeting: { type: 'zone', zone: 'line3Diagonals' } }] });
    }
    expect(CARDS['dragon-terre']).toMatchObject({ activated: [{ name: 'Séisme', targeting: { type: 'zone', zone: 'square2' } }] });
  });
});

describe('Jeune dragon : Évolution draconique (effet actif, 3 mana)', () => {
  const young = (turn?: number) =>
    gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 2), facing: 'right' }], {
      turn: turn ?? 3,
      players: { 1: { mana: 3, ...GRIMOIRE } },
    });

  it('un choix par dragon élémentaire du grimoire', () => {
    const choices = getLegalActions(young()).filter((a) => a.type === 'activateEffect');
    expect(choices.map((a) => (a.type === 'activateEffect' && a.target.kind === 'card' ? a.target.cardId : null))).toEqual(DRAGONS);
  });

  it('le jeune dragon est sacrifié (sans VP) ; le dragon prend sa place, sans payer ses 7 mana, stun jusqu’à son prochain tour', () => {
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
    expect(after.units.u2?.statuses.map((s) => s.kind)).toEqual(['stun']);
    expect(after.players[1]).toMatchObject({ mana: 0, vp: 0, grimoire: ['jeune-dragon', 'dragon-feu', 'dragon-eau', 'dragon-vent'] });
    expect(after.players[1].grimoire).not.toContain('dragon-terre');
    // Le Jeune dragon sacrifié va au cimetière, pas le dragon qui le remplace (§4.3).
    expect(after.players[1].graveyard).toEqual([{ cardId: 'jeune-dragon' }]);
    expect(after.players[2].vp).toBe(0);
    expect(after.events.map((e) => e.type)).toEqual(['effect', 'mana', 'sacrifice', 'cardPlayed', 'summon', 'status']);
    expect(getLegalActions(after).filter((a) => 'unitId' in a && a.unitId === 'u2')).toEqual([]);
    // Au début de son prochain tour, le stun a disparu : il agit normalement.
    const next = applyAction(applyAction(after, END_TURN), END_TURN);
    expect(next.units.u2).toMatchObject({ mobilityLeft: 4, hasAttacked: false, statuses: [] });
  });

  it('pas le tour où le jeune dragon est invoqué ; pas sans dragon dans le grimoire ni sans 3 mana', () => {
    let state = gameWith([], { players: { 1: { mana: 5, ...GRIMOIRE } } });
    state = applyAction(state, { type: 'playCard', cardId: 'jeune-dragon', target: { kind: 'cell', pos: at(0, 4) } });
    expect(state.players[1].mana).toBe(3);
    expect(getLegalActions(state).some((a) => a.type === 'activateEffect')).toBe(false);
    const empty = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 2) }], { turn: 3, players: { 1: { mana: 3, grimoire: [] } } });
    expect(getLegalActions(empty).some((a) => a.type === 'activateEffect')).toBe(false);
    const poor = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 2) }], { turn: 3, players: { 1: { mana: 2, ...GRIMOIRE } } });
    expect(getLegalActions(poor).some((a) => a.type === 'activateEffect')).toBe(false);
  });

  it('un dragon élémentaire s’invoque aussi normalement, pour 7 mana, sans sacrifice', () => {
    const state = gameWith([], { players: { 1: { mana: 7, ...GRIMOIRE } } });
    const after = applyAction(state, { type: 'playCard', cardId: 'dragon-feu', target: { kind: 'cell', pos: at(0, 4) } });
    expect(after.units.u1).toMatchObject({ cardId: 'dragon-feu', mobilityLeft: 5, statuses: [] });
    expect(after.players[1].mana).toBe(0);
  });
});

describe('effets actifs des dragons (3 mana)', () => {
  it('Lance-flamme : une direction par côté où la zone touche un ennemi ; le dragon se tourne ; alliés épargnés', () => {
    // Ignis en (8, 1) : vers la droite, la ligne (8, 2), (8, 3), (8, 4) et les diagonales devant (9, 2), (7, 2).
    const state = gameWith(
      [
        { monster: 'dragon-feu', owner: 1, at: at(8, 1), facing: 'up' },
        { monster: 'golem', owner: 2, at: at(8, 4) }, // 3e case de la ligne
        { monster: 'milicien', owner: 2, at: at(7, 2) }, // diagonale devant (aussi vers le haut)
        { monster: 'milicien', owner: 1, at: at(8, 2) }, // allié : épargné, ne coupe pas la ligne
        { monster: 'milicien', owner: 2, at: at(8, 5) }, // 4e case : épargné
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(areaChoices(state)).toEqual(['up:-', 'right:-']);
    const after = applyAction(state, effect('u1', 'right'));
    expect(after.units.u2).toMatchObject({ hp: 5 });
    expect(after.units.u3).toMatchObject({ hp: 1 });
    expect(after.units.u2?.statuses).toEqual([{ kind: 'burn', amount: 2, turns: 1, expiresAtTurn: 3 }]);
    expect(after.units.u4).toMatchObject({ hp: 3, statuses: [] });
    expect(after.units.u5).toMatchObject({ hp: 3, statuses: [] });
    expect(after.units.u1).toMatchObject({ facing: 'right' });
    expect(after.players[1].mana).toBe(2);
    expect(after.events[0]).toMatchObject({
      type: 'effect',
      cells: [at(8, 2), at(8, 3), at(8, 4), at(9, 2), at(7, 2)],
      facing: 'right',
    });
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
    const down = applyAction(state, effect('u1', 'down'));
    expect(down.events[0]).toMatchObject({ cells: [at(3, 2), at(3, 3), at(3, 1)] });
    expect(down.units.u3?.statuses).toEqual([]);
    const right = applyAction(state, effect('u1', 'right'));
    expect(right.units.u4?.statuses.map((s) => s.kind)).toEqual(['slow']);
    expect(right.units.u5?.statuses.map((s) => s.kind)).toEqual(['slow']);
    // (1, 4) : la ligne vers le bas s'arrête sur la case X (3, 4) ; les diagonales devant restent.
    const blocked = gameWith(
      [
        { monster: 'dragon-eau', owner: 1, at: at(1, 4), facing: 'down' },
        { monster: 'milicien', owner: 2, at: at(2, 4) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(applyAction(blocked, effect('u1', 'down')).events[0]).toMatchObject({ cells: [at(2, 4), at(2, 5), at(2, 3)] });
  });

  it('une diagonale derrière une falaise n’est pas dans la zone', () => {
    // Aqua en (5, 3), contre l'enclave de la Scierie : (5, 2), (4, 2) et (6, 2) sont derrière ses falaises.
    const state = gameWith(
      [
        { monster: 'dragon-eau', owner: 1, at: at(5, 3) },
        { monster: 'milicien', owner: 2, at: at(5, 2) },
        { monster: 'milicien', owner: 2, at: at(4, 2) },
        { monster: 'milicien', owner: 2, at: at(6, 2) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(areaChoices(state)).toEqual([]);
  });

  it('Tempête : un choix par direction, sans distance ; les ennemis reculent de 2 vers l’avant, le plus éloigné d’abord', () => {
    const state = gameWith(
      [
        { monster: 'dragon-vent', owner: 1, at: at(8, 1), facing: 'up' },
        { monster: 'milicien', owner: 2, at: at(8, 2) },
        { monster: 'milicien', owner: 2, at: at(8, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    expect(areaChoices(state)).toEqual(['right:-']);
    const after = applyAction(state, effect('u1', 'right'));
    expect(after.units.u3).toMatchObject({ hp: 1, pos: at(8, 5) });
    expect(after.units.u2).toMatchObject({ hp: 1, pos: at(8, 4) });
    expect(after.units.u1).toMatchObject({ facing: 'right' });
  });

  it('Séisme : 3 dégâts aux ennemis du carré de 2, pas à travers une falaise', () => {
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

  it('Séisme : carré de 2, diagonales comprises (5 × 5 sur terrain dégagé)', () => {
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
    const units = [
      { monster: 'dragon-feu', owner: 1, at: at(8, 2) },
      { monster: 'golem', owner: 2, at: at(9, 2) },
    ] as const;
    expect(getLegalActions(gameWith(units, { players: { 1: { mana: 3 } } })).some((a) => a.type === 'activateEffect')).toBe(true);
    expect(getLegalActions(gameWith(units, { players: { 1: { mana: 2 } } })).some((a) => a.type === 'activateEffect')).toBe(false);
  });
});
