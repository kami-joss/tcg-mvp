import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { getPlayerView } from './view';
import { at, gameWith, withStatus } from './test-utils';
import type { Action, GameEvent, GameState, PlayerId, Position } from './types';

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const END_TURN: Action = { type: 'endTurn' };

describe('événements des actions (handoff, lot 2)', () => {
  it('un déplacement : un pas par case, puis le piège qui l’arrête', () => {
    const base = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    const state: GameState = { ...base, traps: [{ owner: 2, pos: at(8, 2), effects: [{ type: 'status', kind: 'immobilise', turns: 0 }], cardId: 'poseur-de-piege' }] };
    const after = applyAction(state, { type: 'move', unitId: 'u1', to: at(8, 4), path: [at(8, 2), at(8, 3), at(8, 4)] });
    expect(after.events).toEqual([
      { type: 'step', unitId: 'u1', from: at(8, 1), to: at(8, 2), kind: 'walk' },
      { type: 'trapTriggered', trap: state.traps[0], unitId: 'u1' },
      {
        type: 'status',
        unitId: 'u1',
        pos: at(8, 2),
        status: { kind: 'immobilise', turns: 0, expiresAtTurn: 3 },
      },
    ]);
  });

  it('une attaque qui détruit : attaque, dégâts, destruction, VP sur la case', () => {
    const state = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'eclaireur', owner: 2, at: at(8, 2) },
    ]);
    const after = applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: true });
    expect(types(after.events)).toEqual(['attack', 'damage', 'destroyed', 'vp', 'step']);
    expect(after.events[1]).toMatchObject({ amount: 3, hp: 0, cause: 'attack' });
    expect(after.events[3]).toEqual({ type: 'vp', player: 1, amount: 1, pos: at(8, 2) });
    expect(after.events[4]).toMatchObject({ kind: 'advance', to: at(8, 2) });
  });

  it('une invocation : carte jouée, mana dépensé, unité posée', () => {
    const after = applyAction(gameWith([]), { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } });
    expect(types(after.events)).toEqual(['cardPlayed', 'mana', 'summon']);
    expect(after.events[0]).toEqual({ type: 'cardPlayed', player: 1, cardId: 'milicien', pos: at(0, 4), unitId: 'u1' });
    expect(after.events[1]).toEqual({ type: 'mana', player: 1, amount: -2, pos: null });
  });

  it('un sort : la carte jouée vers le monstre visé ; un sort sans cible n’a pas de case', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(8, 1) }], {
      players: { 1: { mana: 10, grimoire: ['benediction', 'penombre'] } },
    });
    const blessed = applyAction(state, { type: 'playCard', cardId: 'benediction', target: { kind: 'unit', unitId: 'u1' } });
    expect(blessed.events[0]).toEqual({ type: 'cardPlayed', player: 1, cardId: 'benediction', pos: at(8, 1), unitId: 'u1' });
    const shadow = applyAction(state, { type: 'playCard', cardId: 'penombre', target: { kind: 'all' } });
    expect(shadow.events[0]).toEqual({ type: 'cardPlayed', player: 1, cardId: 'penombre', pos: null });
  });

  it('chaque action repart d’une liste vide', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    const moved = applyAction(state, { type: 'move', unitId: 'u1', to: at(8, 2) });
    expect(applyAction(moved, { type: 'move', unitId: 'u1', to: at(8, 3) }).events).toHaveLength(1);
  });

  it('début de tour : mana de base, mana et VP de chaque zone, puis les brûlures', () => {
    const state = gameWith([
      { monster: 'milicien', owner: 2, at: at(5, 4), hp: 3 },
      { monster: 'eclaireur', owner: 2, at: at(8, 1) },
      { terrain: 'bastion', owner: 2, at: at(5, 4) }, // sans terrain, la zone ne rapporte pas de mana
    ]);
    const burning = withStatus(state, 'u2', 'burn', 1);
    const after = applyAction(burning, END_TURN);
    expect(types(after.events)).toEqual(['turnStart', 'mana', 'mana', 'vp', 'damage', 'destroyed', 'vp']);
    expect(after.events[2]).toEqual({ type: 'mana', player: 2, amount: 1, pos: at(5, 4) });
    expect(after.events[4]).toMatchObject({ cause: 'burn', unitId: 'u2' });
  });

  it('la pose d’un piège n’est visible que de son poseur', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(8, 1) }], { players: { 1: { mana: 5 } } });
    const after = applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(8, 2) } });
    expect(types(getPlayerView(after, 1).events)).toEqual(['effect', 'mana', 'trapPlaced']);
    expect(types(getPlayerView(after, 2).events)).toEqual(['effect', 'mana']);
    expect(JSON.stringify(getPlayerView(after, 2).events)).not.toMatch(/root|8,"col":2/);
  });

  it('les pas d’un Farceur invisible ne sont visibles que de son camp', () => {
    const state = gameWith([{ monster: 'farceur', owner: 1, at: at(1, 0) }]);
    const after = applyAction(state, { type: 'move', unitId: 'u1', to: at(1, 2) });
    expect(types(getPlayerView(after, 1).events)).toEqual(['step', 'step']);
    expect(getPlayerView(after, 2).events).toEqual([]);
  });
});

describe('la case d’une unité cachée n’est dans aucun événement adverse (§10)', () => {
  // J2 joue loin du Chevalier de J1 : ses monstres camouflés restent cachés à J1.
  const FAR = at(0, 4);
  const eventsOf = (state: GameState, player: PlayerId) => getPlayerView(state, player).events;
  const cardPlayedOf = (state: GameState, player: PlayerId) => eventsOf(state, player).find((e) => e.type === 'cardPlayed');
  const effectOf = (state: GameState, player: PlayerId) => eventsOf(state, player).find((e) => e.type === 'effect');
  const shows = (state: GameState, player: PlayerId, pos: Position) => JSON.stringify(eventsOf(state, player)).includes(JSON.stringify(pos));
  const summonFarceur = (j1At: Position) =>
    applyAction(
      gameWith([{ monster: 'chevalier', owner: 1, at: j1At }], { activePlayer: 2, players: { 2: { mana: 5, grimoire: ['farceur'] } } }),
      { type: 'playCard', cardId: 'farceur', target: { kind: 'cell', pos: at(10, 4) } },
    );

  it('invocation d’un Farceur caché : J1 voit la carte jouée, sans sa case ; J2, avec', () => {
    const state = summonFarceur(FAR);
    expect(getPlayerView(state, 1).hiddenEnemies).toEqual(['u2']);
    expect(types(eventsOf(state, 1))).toEqual(['cardPlayed', 'mana']);
    expect(cardPlayedOf(state, 1)).toEqual({ type: 'cardPlayed', player: 2, cardId: 'farceur', pos: null, unitId: 'u2' });
    expect(shows(state, 1, at(10, 4))).toBe(false);
    expect(cardPlayedOf(state, 2)).toMatchObject({ pos: at(10, 4), unitId: 'u2' });
  });

  it('invoqué à portée d’une unité de J1, il est visible : sa case reste', () => {
    const state = summonFarceur(at(8, 4));
    expect(getPlayerView(state, 1).hiddenEnemies).toEqual([]);
    expect(cardPlayedOf(state, 1)).toMatchObject({ pos: at(10, 4) });
  });

  it('par l’Invocateur : l’effet garde la case de l’Invocateur, la carte jouée perd celle du Farceur', () => {
    const state = applyAction(
      gameWith(
        [
          { monster: 'chevalier', owner: 1, at: FAR },
          { monster: 'invocateur', owner: 2, at: at(9, 4) },
        ],
        { activePlayer: 2, players: { 2: { mana: 5, grimoire: ['farceur'] } } },
      ),
      { type: 'activateEffect', unitId: 'u2', target: { kind: 'cellAndCard', pos: at(9, 5), cardId: 'farceur' } },
    );
    expect(getPlayerView(state, 1).hiddenEnemies).toEqual(['u3']);
    expect(effectOf(state, 1)).toMatchObject({ unitId: 'u2', pos: at(9, 4) });
    expect(cardPlayedOf(state, 1)).toMatchObject({ cardId: 'farceur', pos: null, unitId: 'u3' });
    expect(shows(state, 1, at(9, 5))).toBe(false);
    expect(cardPlayedOf(state, 2)).toMatchObject({ pos: at(9, 5) });
  });

  it('un sort sur son monstre caché (Charge) : la carte jouée, sans sa case', () => {
    const state = applyAction(
      gameWith(
        [
          { monster: 'chevalier', owner: 1, at: FAR },
          { monster: 'farceur', owner: 2, at: at(9, 3) },
        ],
        { activePlayer: 2, players: { 2: { mana: 5, grimoire: ['charge'] } } },
      ),
      { type: 'playCard', cardId: 'charge', target: { kind: 'unit', unitId: 'u2' } },
    );
    expect(types(eventsOf(state, 1))).toEqual(['cardPlayed', 'mana']);
    expect(cardPlayedOf(state, 1)).toEqual({ type: 'cardPlayed', player: 2, cardId: 'charge', pos: null, unitId: 'u2' });
    expect(shows(state, 1, at(9, 3))).toBe(false);
    expect(cardPlayedOf(state, 2)).toMatchObject({ pos: at(9, 3) });
  });

  it('l’effet d’un monstre visible sur un allié caché (soin du Chaman) : l’effet, sans la case de l’allié', () => {
    const base = gameWith(
      [
        { monster: 'chevalier', owner: 1, at: FAR },
        { monster: 'chaman', owner: 2, at: at(9, 2) },
        { monster: 'milicien', owner: 2, at: at(9, 3), hp: 1 },
      ],
      { activePlayer: 2, players: { 2: { mana: 5 } } },
    );
    const state = applyAction(withStatus(base, 'u3', 'camouflage', 2), {
      type: 'activateEffect',
      unitId: 'u2',
      target: { kind: 'unit', unitId: 'u3' },
    });
    expect(getPlayerView(state, 1).hiddenEnemies).toEqual(['u3']);
    expect(types(eventsOf(state, 1))).toEqual(['effect', 'mana']);
    expect(effectOf(state, 1)).toMatchObject({ unitId: 'u2', pos: null, targetId: 'u3' });
    expect(shows(state, 1, at(9, 3))).toBe(false);
    expect(effectOf(state, 2)).toMatchObject({ pos: at(9, 3), targetId: 'u3' });
  });
});
