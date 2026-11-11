import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_15, getPlayerView } from '../../engine';
import { at, gameWith, withStatus } from '../../engine/test-utils';
import type { UnitSpec } from '../../engine/test-utils';
import { DEFAULT_TOKEN_STATS } from '../settings';
import { ISO_ANGLES, TOKEN_FOOT, statsAbove, statusPills, unitVisuals } from './tokenModel';
import type { TokenInputs } from './tokenModel';

// Les unités du plateau PixiJS reprennent `MonsterToken`, `TerrainPlaque` et `TerrainCrest` en vue isométrique.
// 15 × 15 : (6, 6), (6, 7), (8, 8) sont libres.

const ALL = { hp: true, mobility: true, enemyMobility: true, atk: true, statuses: true };
const visuals = (units: readonly UnitSpec[], overrides: Partial<TokenInputs> = {}, state = gameWith(units, { board: BATTLEFIELD_15 })) =>
  unitVisuals({
    view: getPlayerView(state, 1),
    highlights: new Map(),
    attacks: new Map(),
    selectedUnitId: null,
    flipped: false,
    stats: DEFAULT_TOKEN_STATS,
    ...overrides,
  });

describe('jetons du plateau PixiJS', () => {
  it('le pied avancé vers l’avant de sa case (19 px), la pointe vers son orientation', () => {
    const [token] = visuals([{ monster: 'chevalier', owner: 1, at: at(6, 6), facing: 'right' }]).tokens;
    expect(token).toMatchObject({ x: 14 + 6 * 72 + TOKEN_FOOT, y: 14 + 6 * 72 + TOKEN_FOOT, facing: 'right', angle: ISO_ANGLES.right });
    // Plateau retourné : la case et le sens affichés le sont aussi.
    const [flipped] = visuals([{ monster: 'chevalier', owner: 1, at: at(6, 6), facing: 'right' }], { flipped: true }).tokens;
    expect(flipped).toMatchObject({ x: 14 + 8 * 72 + TOKEN_FOOT, facing: 'left', angle: ISO_ANGLES.left });
  });

  it('pastille de ce qu’il peut encore faire ce tour : attaque et effet actif ; rien pour l’adversaire ni une fois tout fait', () => {
    const units: UnitSpec[] = [
      { monster: 'chevalier', owner: 1, at: at(6, 6) },
      { monster: 'golem', owner: 2, at: at(6, 7) },
      { monster: 'invocateur', owner: 1, at: at(8, 8), hasAttacked: true },
    ];
    const { tokens } = visuals(units, {}, gameWith(units, { board: BATTLEFIELD_15, players: { 1: { mana: 3 } } }));
    expect(tokens.map((t) => [t.id, t.ready])).toEqual([
      ['u1', { attack: true, effect: false }],
      ['u2', null],
      ['u3', { attack: false, effect: true }],
    ]);
    const done = gameWith([{ ...units[0]!, hasAttacked: true }, units[1]!], { board: BATTLEFIELD_15 });
    expect(visuals([], {}, done).tokens[0]!.ready).toBeNull();
  });

  it('stats sous la goutte, au-dessus quand la pointe descend', () => {
    expect(statsAbove(ISO_ANGLES.down)).toBe(true);
    expect(statsAbove(ISO_ANGLES.up)).toBe(false);
  });

  it('stats choisies : mobilité restante (les siens), PV, ATK ; l’arc quand les trois y sont', () => {
    const units: UnitSpec[] = [
      { monster: 'chevalier', owner: 1, at: at(6, 6), hp: 2, hasAttacked: true },
      { monster: 'chevalier', owner: 2, at: at(8, 8) },
    ];
    const { tokens } = visuals(units, { stats: ALL });
    const mine = tokens.find((t) => t.owner === 1)!;
    expect(mine.stats).toEqual([
      { kind: 'mob', value: mine.stats[0]!.value, mine: true, empty: mine.stats[0]!.value === 0 },
      { kind: 'hp', value: 2, hurt: true },
      { kind: 'atk', value: 3, spent: true, boosted: false },
    ]);
    expect(mine.arc).toBe(true);
    const theirs = tokens.find((t) => t.owner === 2)!;
    expect(theirs.stats[0]).toMatchObject({ kind: 'mob', mine: false });
    // Réglage par défaut : PV et mobilité des siens, pas l'ATK.
    expect(visuals(units).tokens.find((t) => t.owner === 1)!.stats.map((s) => s.kind)).toEqual(['mob', 'hp']);
  });

  it('statuts en pastilles, dans l’ordre ; requiem compte les tours', () => {
    expect(statusPills([])).toEqual([]);
    const state = withStatus(withStatus(gameWith([{ monster: 'chevalier', owner: 1, at: at(6, 6) }], { board: BATTLEFIELD_15 }), 'u1', 'slow', 2), 'u1', 'stun');
    const [token] = visuals([], { stats: ALL }, state).tokens;
    expect(token!.statuses.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: 'stun', text: null },
      { kind: 'slow', text: '2' },
    ]);
  });

  it('cible et dégâts annoncés sur le jeton ; sélection', () => {
    const units: UnitSpec[] = [{ monster: 'chevalier', owner: 2, at: at(8, 8) }];
    const attacks = new Map([['8,8', { damage: 3, behind: true }]]) as unknown as TokenInputs['attacks'];
    expect(visuals(units, { attacks }).tokens[0]).toMatchObject({ target: 'attack', damage: '−3 dos' });
    expect(visuals(units, { highlights: new Map([['8,8', 'target']]) }).tokens[0]).toMatchObject({ target: 'card', damage: null });
    expect(visuals(units, { selectedUnitId: 'u1' }).tokens[0]!.selected).toBe(true);
  });
});

describe('terrains du plateau PixiJS', () => {
  it('seul : blason au centre de la case, avec ses PV ; cible d’une carte', () => {
    const { terrains } = visuals([{ terrain: 'bastion', owner: 1, at: at(6, 6), hp: 7 }], { highlights: new Map([['6,6', 'target']]) });
    expect(terrains[0]).toMatchObject({ small: false, hp: 7, hurt: true, target: true, x: 14 + 6 * 72, y: 14 + 6 * 72 });
  });

  it('sous un monstre : petit blason, l’ombre du monstre plus claire', () => {
    const { terrains, tokens } = visuals([
      { terrain: 'bastion', owner: 1, at: at(6, 6) },
      { monster: 'chevalier', owner: 1, at: at(6, 6) },
    ]);
    expect(terrains[0]!.small).toBe(true);
    expect(tokens[0]!.onTerrain).toBe(true);
    // Le petit blason passe devant la goutte (avancé de 12 contre 10).
    expect(terrains[0]!.depth).toBeGreaterThan(tokens[0]!.depth);
  });
});
