import { describe, expect, it } from 'vitest';
import {
  BOARD,
  allPositions,
  getCell,
  getManaZones,
  getSummonZone,
  isOnBoard,
  adjacentCells,
  isPlayable,
  parseBoard,
} from './board';
import type { Position } from './types';

const pos = (row: number, col: number): Position => ({ row, col });

describe('plateau (SPEC.md §3)', () => {
  it('fait 11 lignes × 9 colonnes', () => {
    expect(BOARD.rows).toBe(11);
    expect(BOARD.cols).toBe(9);
    expect(BOARD.cells).toHaveLength(11);
    for (const line of BOARD.cells) expect(line).toHaveLength(9);
  });

  describe('cases hors plateau', () => {
    const offBoardInGrid = [0, 1, 2, 6, 7, 8].flatMap((col) => [pos(0, col), pos(10, col)]);

    it('les coins des lignes 0 et 10 (colonnes 0-2 et 6-8) n’existent pas', () => {
      for (const p of offBoardInGrid) {
        expect(getCell(BOARD, p).kind, `(${p.row}, ${p.col})`).toBe('offBoard');
        expect(isOnBoard(BOARD, p)).toBe(false);
        expect(isPlayable(BOARD, p)).toBe(false);
      }
    });

    it('ce sont les seules cases hors plateau de la grille', () => {
      const offBoard = allPositions(BOARD).filter((p) => !isOnBoard(BOARD, p));
      expect(offBoard).toHaveLength(offBoardInGrid.length);
      expect(offBoard).toEqual(expect.arrayContaining(offBoardInGrid));
    });

    it('toute position en dehors de la grille est hors plateau', () => {
      for (const p of [pos(-1, 4), pos(4, -1), pos(11, 4), pos(4, 9), pos(-1, -1), pos(99, 99)]) {
        expect(getCell(BOARD, p).kind).toBe('offBoard');
        expect(isOnBoard(BOARD, p)).toBe(false);
        expect(isPlayable(BOARD, p)).toBe(false);
      }
    });
  });

  describe('cases bloquées', () => {
    const blocked = [pos(3, 4), pos(4, 4), pos(6, 4), pos(7, 4)];

    it('sont en (3,4), (4,4), (6,4) et (7,4)', () => {
      expect(allPositions(BOARD).filter((p) => getCell(BOARD, p).kind === 'blocked')).toEqual(blocked);
    });

    it('existent mais ne sont pas jouables', () => {
      for (const p of blocked) {
        expect(isOnBoard(BOARD, p)).toBe(true);
        expect(isPlayable(BOARD, p)).toBe(false);
      }
    });
  });

  describe('zones d’invocation', () => {
    it('J1 : (0,3), (0,4), (0,5)', () => {
      expect(getSummonZone(BOARD, 1)).toEqual([pos(0, 3), pos(0, 4), pos(0, 5)]);
    });

    it('J2 : (10,3), (10,4), (10,5)', () => {
      expect(getSummonZone(BOARD, 2)).toEqual([pos(10, 3), pos(10, 4), pos(10, 5)]);
    });

    it('sont des cases jouables normales', () => {
      for (const p of [...getSummonZone(BOARD, 1), ...getSummonZone(BOARD, 2)]) {
        expect(isPlayable(BOARD, p)).toBe(true);
        expect(getCell(BOARD, p)).toMatchObject({ kind: 'plain', manaZone: null });
      }
    });
  });

  describe('mana zones', () => {
    it('Écurie (2,4), Scierie (5,1), Forge (5,4), Mine (5,7), Ferme (8,4)', () => {
      expect(getManaZones(BOARD)).toEqual([
        { zone: 'ecurie', pos: pos(2, 4) },
        { zone: 'scierie', pos: pos(5, 1) },
        { zone: 'forge', pos: pos(5, 4) },
        { zone: 'mine', pos: pos(5, 7) },
        { zone: 'ferme', pos: pos(8, 4) },
      ]);
    });

    it('sont des cases jouables normales, hors zones d’invocation', () => {
      for (const { pos: p } of getManaZones(BOARD)) {
        expect(isPlayable(BOARD, p)).toBe(true);
        expect(getCell(BOARD, p)).toMatchObject({ kind: 'plain', summonZoneOf: null });
      }
    });
  });

  it('toutes les autres cases sont des plaines simples', () => {
    const plain = allPositions(BOARD).filter((p) => {
      const cell = getCell(BOARD, p);
      return cell.kind === 'plain' && cell.summonZoneOf === null && cell.manaZone === null;
    });
    // 99 cases - 12 hors plateau - 4 bloquées - 6 d'invocation - 5 mana zones
    expect(plain).toHaveLength(72);
  });
});

describe('parseBoard', () => {
  it('rejette un symbole inconnu', () => {
    expect(() => parseBoard('test', ['PP', 'P?'])).toThrow(/Symbole inconnu/);
  });

  it('rejette des lignes de longueurs différentes', () => {
    expect(() => parseBoard('test', ['PPP', 'PP'])).toThrow(/colonnes/);
  });

  it('adjacent = les 8 cases autour ; une falaise sépare, une diagonale passe si un des deux chemins en L est libre', () => {
    const keys = (cells: { row: number; col: number }[]) => cells.map((p) => `${p.row},${p.col}`).sort();
    expect(keys(adjacentCells(BOARD, pos(8, 1)))).toEqual(['7,0', '7,1', '7,2', '8,0', '8,2', '9,0', '9,1', '9,2']);
    // (5,3) touche la falaise de la Scierie à sa gauche : (5,2) et les diagonales (4,2), (6,2) sont de l'autre côté.
    const nearCliff = keys(adjacentCells(BOARD, pos(5, 3)));
    expect(nearCliff).not.toContain('5,2');
    expect(nearCliff).not.toContain('4,2');
    expect(nearCliff).not.toContain('6,2');
    // Les cases X ne sont jamais adjacentes : (5,4) est la Forge entre deux X, (4,4) et (6,4) n'en font pas partie.
    expect(keys(adjacentCells(BOARD, pos(5, 3)))).not.toContain('4,4');
    expect(keys(adjacentCells(BOARD, pos(5, 3)))).toContain('5,4');
  });
});
