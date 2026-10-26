import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import {
  BATTLEFIELD,
  BOARD,
  BOARDS,
  allPositions,
  getCell,
  getCliff,
  getManaZones,
  getSummonZone,
  isOnBoard,
} from './board';
import { IllegalActionError } from './errors';
import { createGame } from './game';
import { getMoveDestinations } from './movement';
import { at, gameWith } from './test-utils';
import type { Cell, ManaZoneId, Position } from './types';

/** Case symétrique par rapport au centre (5, 5). */
const mirror = (pos: Position): Position => at(10 - pos.row, 10 - pos.col);
const MIRROR_ZONES: Record<ManaZoneId, ManaZoneId> = {
  ecurie: 'ferme',
  ferme: 'ecurie',
  scierie: 'mine',
  mine: 'scierie',
  forge: 'forge',
};

describe('carte « Champ de bataille » 11 × 11 (SPEC.md §3)', () => {
  it('fait 11 × 11, sans case hors plateau', () => {
    expect(BATTLEFIELD).toMatchObject({ rows: 11, cols: 11 });
    expect(allPositions(BATTLEFIELD).every((pos) => isOnBoard(BATTLEFIELD, pos))).toBe(true);
  });

  it('cases bloquées, zones d’invocation et mana zones', () => {
    const blocked = allPositions(BATTLEFIELD).filter((pos) => getCell(BATTLEFIELD, pos).kind === 'blocked');
    expect(blocked).toEqual([at(0, 5), at(4, 4), at(4, 6), at(5, 0), at(5, 10), at(6, 4), at(6, 6), at(10, 5)]);
    expect(getSummonZone(BATTLEFIELD, 1)).toEqual([at(0, 0), at(0, 1), at(1, 0)]);
    expect(getSummonZone(BATTLEFIELD, 2)).toEqual([at(9, 10), at(10, 9), at(10, 10)]);
    expect(getManaZones(BATTLEFIELD)).toEqual([
      { zone: 'scierie', pos: at(1, 9) },
      { zone: 'ecurie', pos: at(2, 2) },
      { zone: 'forge', pos: at(5, 5) },
      { zone: 'ferme', pos: at(8, 8) },
      { zone: 'mine', pos: at(9, 1) },
    ]);
  });

  it('couloirs libres : lignes 3 et 7, colonnes 3 et 7', () => {
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      for (const pos of [at(3, i), at(7, i), at(i, 3), at(i, 7)]) {
        expect(getCell(BATTLEFIELD, pos), `(${pos.row}, ${pos.col})`).toEqual({
          kind: 'plain',
          summonZoneOf: null,
          manaZone: null,
        });
      }
    }
  });

  it('falaises : 4 autour de la Scierie (tirs à distance possibles), 4 autour de la Mine', () => {
    expect(BATTLEFIELD.cliffs).toHaveLength(8);
    expect(getCliff(BATTLEFIELD, at(0, 7), at(0, 8))?.rangedShotsPass).toBe(true);
    expect(getCliff(BATTLEFIELD, at(2, 10), at(3, 10))?.rangedShotsPass).toBe(true);
    expect(getCliff(BATTLEFIELD, at(8, 2), at(8, 3))?.rangedShotsPass).toBe(false);
    expect(getCliff(BATTLEFIELD, at(7, 0), at(8, 0))?.rangedShotsPass).toBe(false);
    expect(getCliff(BATTLEFIELD, at(0, 7), at(0, 8))?.flyingPasses).toBe(true);
    expect(getCliff(BATTLEFIELD, at(8, 2), at(8, 3))?.flyingPasses).toBe(false);
    // Entrées laissées ouvertes.
    expect(getCliff(BATTLEFIELD, at(1, 7), at(1, 8))).toBeUndefined();
    expect(getCliff(BATTLEFIELD, at(2, 9), at(3, 9))).toBeUndefined();
  });

  it('est symétrique par rapport au centre : J1 et J2 ont les mêmes chances', () => {
    const swap = (cell: Cell): Cell =>
      cell.kind !== 'plain'
        ? cell
        : {
            kind: 'plain',
            summonZoneOf: cell.summonZoneOf === null ? null : cell.summonZoneOf === 1 ? 2 : 1,
            manaZone: cell.manaZone === null ? null : MIRROR_ZONES[cell.manaZone],
          };
    for (const pos of allPositions(BATTLEFIELD)) {
      expect(swap(getCell(BATTLEFIELD, pos)), `(${pos.row}, ${pos.col})`).toEqual(getCell(BATTLEFIELD, mirror(pos)));
    }
    for (const { between: [a, b] } of BATTLEFIELD.cliffs) {
      expect(getCliff(BATTLEFIELD, mirror(a), mirror(b))).toBeDefined();
    }
  });

  it('createGame accepte une carte ; le plateau classique reste celui par défaut', () => {
    expect(createGame().board).toBe(BOARD);
    expect(createGame(BATTLEFIELD)).toMatchObject({ board: BATTLEFIELD, activePlayer: 1, players: { 1: { mana: 3 } } });
    expect(BOARDS.slice(0, 2)).toEqual([BOARD, BATTLEFIELD]);
  });

  it('on entre dans la Scierie par la gauche en ligne 1, pas par-dessus la falaise', () => {
    const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(0, 7) }], { board: BATTLEFIELD });
    expect(() => applyAction(state, { type: 'move', unitId: 'u1', to: at(0, 8) })).not.toThrow(); // par (1,7) puis (1,8)
    const blocked = gameWith([{ monster: 'eclaireur', owner: 1, at: at(0, 7), mobilityLeft: 1 }], { board: BATTLEFIELD });
    expect(() => applyAction(blocked, { type: 'move', unitId: 'u1', to: at(0, 8) })).toThrow(IllegalActionError);
  });

  it('on longe les falaises par le couloir, d’une entrée de la Scierie à l’autre', () => {
    // (1,7) → (3,9) : (2,7), (3,7), (3,8), (3,9), sans traverser de falaise.
    const state = gameWith([{ monster: 'golem', owner: 1, at: at(1, 7), mobilityLeft: 4 }], { board: BATTLEFIELD });
    const unit = state.units.u1;
    if (unit?.kind !== 'monster') throw new Error('monstre attendu');
    expect(getMoveDestinations(state, unit)).toContainEqual({ pos: at(3, 9), cost: 4 });
  });

  it('on invoque sur ses propres cases d’invocation', () => {
    const state = createGame(BATTLEFIELD);
    const summon = { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(1, 0) } } as const;
    expect(applyAction(state, summon).units.u1?.pos).toEqual(at(1, 0));
  });
});
