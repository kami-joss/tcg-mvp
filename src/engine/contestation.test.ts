import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { BATTLEFIELD, BATTLEFIELD_13, BATTLEFIELD_15, BOARD, BOARDS, isPlayable } from './board';
import { BASE_MANA_PER_TURN } from './config';
import { createGame } from './game';
import { isHiddenFrom } from './stealth';
import { at, gameWith, type UnitSpec } from './test-utils';
import { getPlayerView } from './view';
import { getControlledZones, getZoneCells, getZoneMana, getZoneOf, getZoneStatus } from './zones';
import type { Action, GameState, PlayerId, PlayerState } from './types';

// Champ de bataille 13 × 13 : la Forge est en (6, 6), sa zone couvre les lignes et colonnes 5 à 7.
const FORGE = at(6, 6);
const contest = (units: readonly UnitSpec[], activePlayer: PlayerId = 1, players: Partial<Record<PlayerId, Partial<PlayerState>>> = {}) =>
  gameWith(units, { board: BATTLEFIELD_13, mode: 'contestation', activePlayer, players });
const status = (state: GameState) => getZoneStatus(state, FORGE);
const playBastion = (pos = FORGE): Action => ({ type: 'playCard', cardId: 'bastion', target: { kind: 'cell', pos } });

describe('mode contestation : plateaux (SPEC.md §4.4 bis)', () => {
  it('ne se joue que sur le 13 × 13 et le 15 × 15', () => {
    expect(BOARDS.filter((board) => board.contestation)).toEqual([BATTLEFIELD_13, BATTLEFIELD_15]);
    expect(createGame(BATTLEFIELD_13, undefined, undefined, 'contestation').mode).toBe('contestation');
    expect(createGame(BATTLEFIELD_15, undefined, undefined, 'contestation').mode).toBe('contestation');
    expect(() => createGame(BOARD, undefined, undefined, 'contestation')).toThrow();
    expect(() => createGame(BATTLEFIELD, undefined, undefined, 'contestation')).toThrow();
  });

  it('le mode Normal reste celui par défaut', () => {
    expect(createGame().mode).toBe('normal');
    expect(createGame(BATTLEFIELD_13).mode).toBe('normal');
  });
});

describe('mode contestation : zone de 9 cases (SPEC.md §4.4 bis)', () => {
  it('la mana zone et les 8 cases autour', () => {
    expect(getZoneCells(BATTLEFIELD_13, 'contestation', FORGE)).toHaveLength(9);
    expect(getZoneCells(BATTLEFIELD_13, 'contestation', FORGE)).toContainEqual(at(5, 5));
    expect(getZoneCells(BATTLEFIELD_13, 'contestation', FORGE)).toContainEqual(at(7, 7));
    expect(getZoneOf(BATTLEFIELD_13, 'contestation', at(7, 5))).toEqual({ zone: 'forge', pos: FORGE });
    expect(getZoneOf(BATTLEFIELD_13, 'contestation', at(8, 6))).toBeNull();
  });

  it('en mode Normal, la zone est la mana zone seule', () => {
    expect(getZoneCells(BATTLEFIELD_13, 'normal', FORGE)).toEqual([FORGE]);
    expect(getZoneOf(BATTLEFIELD_13, 'normal', at(7, 5))).toBeNull();
  });

  it('ses cases X en font partie, mais personne ne s’y tient (Mine du 15 × 15 : 7 cases utiles)', () => {
    const cells = getZoneCells(BATTLEFIELD_15, 'contestation', at(2, 12));
    expect(cells).toHaveLength(9);
    expect(cells.filter((cell) => isPlayable(BATTLEFIELD_15, cell))).toHaveLength(7);
  });
});

describe('mode contestation : contrôle (SPEC.md §4.4 bis)', () => {
  it('personne dans la zone : neutre', () => {
    expect(status(contest([]))).toEqual({ pos: FORGE, controller: null, contested: false });
  });

  it('un monstre sur n’importe quelle case de la zone la tient pour son camp', () => {
    expect(status(contest([{ monster: 'golem', owner: 2, at: at(5, 5) }])).controller).toBe(2);
    expect(status(contest([{ monster: 'golem', owner: 2, at: at(8, 6) }])).controller).toBeNull();
  });

  it('les deux joueurs y ont des monstres : contestée, personne ne la tient', () => {
    const state = contest([
      { monster: 'golem', owner: 1, at: FORGE },
      { monster: 'eclaireur', owner: 2, at: at(7, 7) },
    ]);
    expect(status(state)).toEqual({ pos: FORGE, controller: null, contested: true });
    expect(getControlledZones(state, 1)).toEqual([]);
    expect(getControlledZones(state, 2)).toEqual([]);
  });

  it('un terrain seul suffit à la tenir', () => {
    expect(status(contest([{ terrain: 'bastion', owner: 1, at: FORGE }])).controller).toBe(1);
  });

  it('un terrain la tient pour son propriétaire tant qu’il n’est pas détruit, quels que soient les monstres', () => {
    const alone = contest([
      { terrain: 'bastion', owner: 1, at: FORGE },
      { monster: 'golem', owner: 2, at: at(5, 6) },
    ]);
    expect(status(alone)).toEqual({ pos: FORGE, controller: 1, contested: false });
    const withOwnMonster = contest([
      { terrain: 'bastion', owner: 1, at: FORGE },
      { monster: 'milicien', owner: 1, at: FORGE },
      { monster: 'golem', owner: 2, at: at(5, 6) },
    ]);
    expect(status(withOwnMonster)).toEqual({ pos: FORGE, controller: 1, contested: false });
  });

  it('le terrain détruit, la zone se juge sur les monstres', () => {
    const state = contest([
      { monster: 'golem', owner: 2, at: at(6, 5) },
      { terrain: 'bastion', owner: 1, at: FORGE, hp: 1 },
    ], 2);
    const after = applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false });
    expect(status(after).controller).toBe(2);
  });

  it('en mode Normal sur la même carte, un monstre à côté de la mana zone ne la tient pas', () => {
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(5, 5) }], { board: BATTLEFIELD_13 });
    expect(getZoneStatus(state, FORGE)).toEqual({ pos: FORGE, controller: null, contested: false });
  });
});

describe('mode contestation : revenus (SPEC.md §4.4 bis)', () => {
  /** J2 finit son tour : début du tour de J1, qui part de 0 mana et 0 VP. */
  const j1TurnStart = (units: readonly UnitSpec[]) => applyAction(contest(units, 2, { 1: { mana: 0, vp: 0 } }), { type: 'endTurn' });

  it('une zone tenue rapporte +1 mana et +1 VP', () => {
    const next = j1TurnStart([{ monster: 'golem', owner: 1, at: at(7, 5) }]);
    expect(next.players[1]).toMatchObject({ mana: BASE_MANA_PER_TURN + 1, vp: 1 });
  });

  it('une zone contestée ne rapporte rien à personne, ni mana ni VP', () => {
    const next = j1TurnStart([
      { monster: 'golem', owner: 1, at: at(7, 5) },
      { monster: 'eclaireur', owner: 2, at: at(5, 7) },
    ]);
    expect(next.players[1]).toMatchObject({ mana: BASE_MANA_PER_TURN, vp: 0 });
  });

  it('l’Autel de mana de la zone rapporte son bonus', () => {
    const next = j1TurnStart([{ terrain: 'autel-de-mana', owner: 1, at: FORGE }]);
    expect(next.players[1]).toMatchObject({ mana: BASE_MANA_PER_TURN + 2, vp: 1 });
  });

  it('le Porte-étendard donne son bonus sur n’importe quelle case de la zone, si son camp la tient', () => {
    const held = contest([{ monster: 'porte-etendard', owner: 1, at: at(5, 7) }]);
    expect(getZoneMana(held, FORGE)).toBe(2);
    expect(j1TurnStart([{ monster: 'porte-etendard', owner: 1, at: at(5, 7) }]).players[1].mana).toBe(BASE_MANA_PER_TURN + 2);
    // La zone tenue par un terrain adverse : son étendard ne compte pas, et la zone ne lui rapporte rien.
    const enemyTerrain = contest([
      { terrain: 'bastion', owner: 2, at: FORGE },
      { monster: 'porte-etendard', owner: 1, at: at(5, 7) },
    ]);
    expect(getZoneMana(enemyTerrain, FORGE)).toBe(1);
    expect(getControlledZones(enemyTerrain, 1)).toEqual([]);
  });
});

describe('mode contestation : terrains (SPEC.md §4.4 bis)', () => {
  const grimoire = { 1: { mana: 10, grimoire: ['bastion' as const] } };
  const terrainTargets = (state: GameState) =>
    getLegalActions(state).flatMap((a) => (a.type === 'playCard' && a.target.kind === 'cell' ? [a.target.pos] : []));

  it('se posent sur la mana zone, sous un de ses monstres, comme en mode Normal', () => {
    const state = contest([{ monster: 'golem', owner: 1, at: FORGE }], 1, grimoire);
    expect(terrainTargets(state)).toEqual([FORGE]);
    const next = applyAction(state, playBastion());
    expect(Object.values(next.units).some((u) => u.kind === 'terrain' && u.pos.row === 6 && u.pos.col === 6)).toBe(true);
  });

  it('jamais sur une autre case de la zone', () => {
    const state = contest([{ monster: 'golem', owner: 1, at: at(5, 5) }], 1, grimoire);
    expect(terrainTargets(state)).toEqual([]);
    expect(() => applyAction(state, playBastion(at(5, 5)))).toThrow();
  });

  it('jamais dans une zone contestée', () => {
    const state = contest(
      [
        { monster: 'golem', owner: 1, at: FORGE },
        { monster: 'eclaireur', owner: 2, at: at(7, 7) },
      ],
      1,
      grimoire,
    );
    expect(terrainTargets(state)).toEqual([]);
    expect(() => applyAction(state, playBastion())).toThrow();
  });
});

describe('mode contestation : monstre camouflé (SPEC.md §4.4 bis, §10)', () => {
  // Mine du 15 × 15 en (2, 12) : les tas de minerai (2, 11) et (3, 12) coupent le rayon du Farceur caché en (3, 11).
  const MINE = at(2, 12);
  const state = gameWith(
    [
      { monster: 'golem', owner: 1, at: MINE },
      { monster: 'farceur', owner: 2, at: at(3, 11) },
    ],
    { board: BATTLEFIELD_15, mode: 'contestation', players: { 1: { mana: 10, grimoire: ['bastion'] } } },
  );

  it('il compte, et l’état de la zone reste public', () => {
    expect(isHiddenFrom(state, state.units.u2!, 1)).toBe(true);
    const view = getPlayerView(state, 1);
    expect(view.units.u2).toBeUndefined();
    expect(view.mode).toBe('contestation');
    expect(view.zoneControl.find((z) => z.pos.row === 2 && z.pos.col === 12)).toEqual({ pos: MINE, controller: null, contested: true });
  });

  it('la zone contestée interdit le terrain, même si l’ennemi est invisible', () => {
    expect(getLegalActions(state).some((a) => a.type === 'playCard')).toBe(false);
    expect(() => applyAction(state, playBastion(MINE))).toThrow();
  });
});
