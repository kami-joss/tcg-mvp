import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_15, allPositions, getCell, getPlayerView } from '../../engine';
import type { Position } from '../../engine';
import { at, gameWith } from '../../engine/test-utils';
import type { UnitSpec } from '../../engine/test-utils';
import type { Highlight } from '../interaction';
import { CELL_COLORS, cellVisuals } from './cellModel';
import type { CellInputs, CellVisual } from './cellModel';

// Le dessin des cases du plateau PixiJS reprend les règles de `BoardCell` en vue isométrique. 15 × 15 : la Forge en
// (7, 7), mana zones aux coins (2, 2), (2, 12), (12, 2), (12, 12) ; (6, 6), (6, 7), (6, 8), (8, 8) et (3, 3) libres.

const FORGE = at(7, 7);
const view = (units: readonly UnitSpec[] = []) => getPlayerView(gameWith(units, { board: BATTLEFIELD_15 }), 1);
const visuals = (overrides: Partial<CellInputs> = {}) =>
  cellVisuals({
    view: view(),
    highlights: new Map(),
    attacks: new Map(),
    selectedUnitId: null,
    focused: false,
    path: [],
    reach: new Map(),
    flipped: false,
    animated: true,
    ...overrides,
  });
const cellAt = (list: readonly CellVisual[], pos: Position) => list.find((v) => v.key === `${pos.row},${pos.col}`)!;
const summonCell = (player: 1 | 2) =>
  allPositions(BATTLEFIELD_15).find((pos) => {
    const cell = getCell(BATTLEFIELD_15, pos);
    return cell.kind === 'plain' && cell.summonZoneOf === player;
  })!;

describe('cases du plateau PixiJS : fond et repères', () => {
  it('une case par case du plateau, au pas de 72 px, la case (0, 0) en (14, 14)', () => {
    const list = visuals();
    expect(list).toHaveLength(15 * 15);
    expect(cellAt(list, at(0, 0))).toMatchObject({ x: 14, y: 14 });
    expect(cellAt(list, at(2, 5))).toMatchObject({ x: 14 + 5 * 72, y: 14 + 2 * 72 });
    // Plateau retourné : la case (0, 0) s'affiche en bas à droite.
    expect(cellAt(visuals({ flipped: true }), at(0, 0))).toMatchObject({ x: 14 + 14 * 72, y: 14 + 14 * 72 });
  });

  it('damier : cases paires et impaires', () => {
    const list = visuals();
    expect(cellAt(list, at(6, 6)).base).toBe('plain');
    expect(cellAt(list, at(6, 7)).base).toBe('odd');
  });

  it('mana zone : bord de 3 px et nom à la couleur de celui qui la tient, lueur seulement avec les animations', () => {
    const neutral = cellAt(visuals(), FORGE);
    expect(neutral).toMatchObject({
      base: 'mana',
      edge: { color: CELL_COLORS.zone, width: 3 },
      glow: CELL_COLORS.zone,
      zoneLabel: { text: 'Forge', color: CELL_COLORS.zoneLabel },
    });
    expect(cellAt(visuals({ animated: false }), FORGE).glow).toBeNull();
    const held = cellAt(visuals({ view: view([{ monster: 'chevalier', owner: 1, at: FORGE }]) }), FORGE);
    expect(held).toMatchObject({ edge: { color: CELL_COLORS.j1 }, glow: CELL_COLORS.j1, zoneLabel: { text: 'J1 · Forge', color: CELL_COLORS.j1 } });
  });

  it('cases d’invocation : fond et bord de 2 px du joueur, « J1 » ou « J2 »', () => {
    const list = visuals();
    expect(cellAt(list, summonCell(1))).toMatchObject({ base: 'summon1', summon: 1, edge: { color: CELL_COLORS.j1, width: 2 } });
    expect(cellAt(list, summonCell(2))).toMatchObject({ base: 'summon2', summon: 2, edge: { color: CELL_COLORS.j2, width: 2 } });
  });

  it('cases bloquées : l’eau ne se dessine pas (le sol peint la montre), les autres si', () => {
    const blocked = visuals().filter((v) => v.base === 'blocked' || v.base === 'water');
    expect(blocked.some((v) => v.base === 'water')).toBe(true);
    expect(blocked.some((v) => v.base === 'blocked')).toBe(true);
  });
});

describe('cases du plateau PixiJS : sélection et surbrillances', () => {
  const hl = (entries: [Position, Highlight][]) => new Map(entries.map(([pos, h]) => [`${pos.row},${pos.col}`, h]));

  it('déplacement : cases atteignables, chemin numéroté sous la souris (le chemin remplace la marque de déplacement)', () => {
    const list = visuals({ highlights: hl([[at(6, 6), 'move'], [at(6, 7), 'move']]), path: [at(6, 7)] });
    expect(cellAt(list, at(6, 6))).toMatchObject({ move: true, step: null });
    expect(cellAt(list, at(6, 7))).toMatchObject({ move: false, step: 1 });
  });

  it('atténuation : les cases qui ne sont pas des cibles, sauf le monstre sélectionné', () => {
    const units: UnitSpec[] = [{ monster: 'chevalier', owner: 1, at: at(3, 3) }];
    const list = visuals({ view: view(units), focused: true, selectedUnitId: 'u1', highlights: hl([[at(6, 6), 'move']]) });
    expect(cellAt(list, at(6, 6)).dim).toBe(false);
    expect(cellAt(list, at(3, 3)).dim).toBe(false);
    expect(cellAt(list, at(8, 8)).dim).toBe(true);
  });

  it('cible d’une carte : un « + » sur une case vide ; sur un monstre, elle va sur son jeton', () => {
    const units: UnitSpec[] = [{ monster: 'chevalier', owner: 2, at: at(8, 8) }];
    const list = visuals({ view: view(units), highlights: hl([[at(6, 6), 'target'], [at(8, 8), 'target']]) });
    expect(cellAt(list, at(6, 6)).target).toBe(true);
    expect(cellAt(list, at(8, 8)).target).toBe(false);
  });

  it('attaque : cadre et dégâts sur la case d’un terrain seul ; sur un monstre, sur son jeton', () => {
    const units: UnitSpec[] = [
      { terrain: 'bastion', owner: 2, at: at(8, 8) },
      { monster: 'chevalier', owner: 2, at: at(6, 8) },
    ];
    const attacks = new Map([
      ['8,8', { damage: 3, behind: false }],
      ['6,8', { damage: 2, behind: true }],
    ] as const) as unknown as CellInputs['attacks'];
    const list = visuals({ view: view(units), attacks });
    expect(cellAt(list, at(8, 8)).attack).toEqual({ damage: '−3' });
    expect(cellAt(list, at(6, 8)).attack).toBeNull();
    expect(cellAt(visuals({ view: view(units), highlights: hl([[at(8, 8), 'attack']]) }), at(8, 8)).attack).toEqual({ damage: null });
  });

  it('menace d’un ennemi survolé : cases où il ira, cases qu’il frappera', () => {
    const list = visuals({ reach: new Map([['6,6', 'move'], ['6,7', 'strike']]) });
    expect(cellAt(list, at(6, 6)).reach).toBe('move');
    expect(cellAt(list, at(6, 7)).reach).toBe('strike');
  });

  it('piège : visible sur sa case vide, avec son nom court', () => {
    const state = gameWith([], { board: BATTLEFIELD_15 });
    const trapped = { ...state, traps: [{ owner: 1 as const, pos: at(6, 6), effects: [{ type: 'damage' as const, amount: 3 }], cardId: 'poseur-de-bombe' as const }] };
    expect(cellAt(visuals({ view: getPlayerView(trapped, 1) }), at(6, 6)).trap).toBe('Bombe');
  });
});
