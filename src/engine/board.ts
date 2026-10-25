// Plateau (SPEC.md §3).
import type { Board, Cell, Cliff, Direction, ManaZoneId, PlayerId, Position } from './types';

/** Plateau du MVP, recopié tel quel depuis SPEC.md §3 (une chaîne par ligne, un caractère par colonne). */
export const BOARD_LAYOUT: readonly string[] = [
  '...111...',
  'PPPPPPPPP',
  'PPPPEPPPP',
  'PPPPXPPPP',
  'PPPPXPPPP',
  'PSPPFPPMP',
  'PPPPXPPPP',
  'PPPPXPPPP',
  'PPPPRPPPP',
  'PPPPPPPPP',
  '...222...',
];

export const MANA_ZONE_NAMES: Readonly<Record<ManaZoneId, string>> = {
  ecurie: 'Écurie',
  ferme: 'Ferme',
  forge: 'Forge',
  scierie: 'Scierie',
  mine: 'Mine',
};

const OFF_BOARD: Cell = { kind: 'offBoard' };

const SYMBOLS: Readonly<Record<string, Cell>> = {
  '.': OFF_BOARD,
  X: { kind: 'blocked' },
  P: { kind: 'plain', summonZoneOf: null, manaZone: null },
  '1': { kind: 'plain', summonZoneOf: 1, manaZone: null },
  '2': { kind: 'plain', summonZoneOf: 2, manaZone: null },
  E: { kind: 'plain', summonZoneOf: null, manaZone: 'ecurie' },
  R: { kind: 'plain', summonZoneOf: null, manaZone: 'ferme' },
  F: { kind: 'plain', summonZoneOf: null, manaZone: 'forge' },
  S: { kind: 'plain', summonZoneOf: null, manaZone: 'scierie' },
  M: { kind: 'plain', summonZoneOf: null, manaZone: 'mine' },
};

/** Falaise de la Scierie : les tirs de portée 2 ou plus passent par-dessus, et `vol` la survole (§10). */
const scierieCliff = (r1: number, c1: number, r2: number, c2: number): Cliff => ({
  between: [{ row: r1, col: c1 }, { row: r2, col: c2 }],
  rangedShotsPass: true,
  flyingPasses: true,
});

/** Falaise de la Mine, zone fermée : rien ne la franchit, ni les tirs, ni `vol` (§10). */
const mineCliff = (r1: number, c1: number, r2: number, c2: number): Cliff => ({
  between: [{ row: r1, col: c1 }, { row: r2, col: c2 }],
  rangedShotsPass: false,
  flyingPasses: false,
});

/**
 * Falaises du plateau classique (SPEC.md §3, §10) : la Scierie (lignes 4 à 6, colonnes 0 à 2) et la Mine
 * (colonnes 6 à 8) sont fermées côté centre, et en haut et en bas sauf au milieu (colonnes 1 et 7).
 */
export const BOARD_CLIFFS: readonly Cliff[] = [
  scierieCliff(3, 0, 4, 0),
  scierieCliff(3, 2, 4, 2),
  scierieCliff(6, 0, 7, 0),
  scierieCliff(6, 2, 7, 2),
  scierieCliff(4, 2, 4, 3),
  scierieCliff(5, 2, 5, 3),
  scierieCliff(6, 2, 6, 3),
  mineCliff(3, 6, 4, 6),
  mineCliff(3, 8, 4, 8),
  mineCliff(6, 6, 7, 6),
  mineCliff(6, 8, 7, 8),
  mineCliff(4, 5, 4, 6),
  mineCliff(5, 5, 5, 6),
  mineCliff(6, 5, 6, 6),
];

export function parseBoard(name: string, layout: readonly string[], cliffs: readonly Cliff[] = []): Board {
  const cols = layout[0]?.length ?? 0;
  const cells = layout.map((line, row) => {
    if (line.length !== cols) {
      throw new Error(`Ligne ${row} du plateau : ${line.length} colonnes au lieu de ${cols}`);
    }
    return [...line].map((symbol, col) => {
      const cell = SYMBOLS[symbol];
      if (!cell) throw new Error(`Symbole inconnu « ${symbol} » en (${row}, ${col})`);
      return cell;
    });
  });
  for (const { between: [a, b] } of cliffs) {
    if (distance(a, b) !== 1) {
      throw new Error(`Falaise entre (${a.row}, ${a.col}) et (${b.row}, ${b.col}) : les cases doivent être voisines`);
    }
  }
  return { name, rows: layout.length, cols, cells, cliffs };
}

/** Plateau classique du MVP (11 × 9). */
export const BOARD: Board = parseBoard('Classique (11 × 9)', BOARD_LAYOUT, BOARD_CLIFFS);

/**
 * Carte de test 11 × 11 (SPEC.md §3) : mêmes cinq mana zones, invocations dans les coins opposés. Un couloir libre
 * (lignes 3 et 7, colonnes 3 et 7) sépare la Scierie et la Mine du centre, pour pouvoir longer leurs falaises.
 */
export const BATTLEFIELD_LAYOUT: readonly string[] = [
  '11PPPXPPPPP',
  '1PPPPPPPPSP',
  'PPEPPPPPPPP',
  'PPPPPPPPPPP',
  'PPPPXPXPPPP',
  'XPPPPFPPPPX',
  'PPPPXPXPPPP',
  'PPPPPPPPPPP',
  'PPPPPPPPRPP',
  'PMPPPPPPPP2',
  'PPPPPXPPP22',
];

/** Scierie en haut à droite (entrées par la gauche en ligne 1 et par le bas en colonne 9), Mine à l'opposé. */
export const BATTLEFIELD_CLIFFS: readonly Cliff[] = [
  scierieCliff(0, 7, 0, 8),
  scierieCliff(2, 7, 2, 8),
  scierieCliff(2, 8, 3, 8),
  scierieCliff(2, 10, 3, 10),
  mineCliff(7, 0, 8, 0),
  mineCliff(7, 2, 8, 2),
  mineCliff(8, 2, 8, 3),
  mineCliff(10, 2, 10, 3),
];

export const BATTLEFIELD: Board = parseBoard('Champ de bataille (11 × 11)', BATTLEFIELD_LAYOUT, BATTLEFIELD_CLIFFS);

/** Cartes proposées au lancement d'une partie. */
export const BOARDS: readonly Board[] = [BOARD, BATTLEFIELD];

/** Renvoie la case en `pos` ; toute position hors de la grille est hors plateau. */
export function getCell(board: Board, pos: Position): Cell {
  return board.cells[pos.row]?.[pos.col] ?? OFF_BOARD;
}

/** La case existe (elle peut être bloquée). */
export function isOnBoard(board: Board, pos: Position): boolean {
  return getCell(board, pos).kind !== 'offBoard';
}

/** La case existe et n'est pas bloquée : une unité peut s'y trouver. */
export function isPlayable(board: Board, pos: Position): boolean {
  return getCell(board, pos).kind === 'plain';
}

/** Toutes les positions de la grille, ligne par ligne. */
export function allPositions(board: Board): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) positions.push({ row, col });
  }
  return positions;
}

export function getSummonZone(board: Board, player: PlayerId): Position[] {
  return allPositions(board).filter((pos) => {
    const cell = getCell(board, pos);
    return cell.kind === 'plain' && cell.summonZoneOf === player;
  });
}

export function getManaZones(board: Board): { zone: ManaZoneId; pos: Position }[] {
  return allPositions(board).flatMap((pos) => {
    const cell = getCell(board, pos);
    return cell.kind === 'plain' && cell.manaZone ? [{ zone: cell.manaZone, pos }] : [];
  });
}

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export const DIRECTION_OFFSETS: Readonly<Record<Direction, Position>> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

export function samePos(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

/** Distance orthogonale (pas de diagonale, SPEC.md §3). */
export function distance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/** La falaise qui sépare les deux cases voisines `a` et `b` (dans un sens ou dans l'autre), s'il y en a une. */
export function getCliff(board: Board, a: Position, b: Position): Cliff | undefined {
  return cliffIndex(board.cliffs).get(cliffKey(a, b));
}

/** Clé d'une paire de cases voisines, la même dans les deux sens. */
function cliffKey(a: Position, b: Position): string {
  const [p, q] = a.row < b.row || (a.row === b.row && a.col <= b.col) ? [a, b] : [b, a];
  return `${p.row},${p.col}|${q.row},${q.col}`;
}

/** Falaises d'un plateau indexées par paire de cases, calculées une fois par plateau. */
const cliffsByPair = new WeakMap<readonly Cliff[], Map<string, Cliff>>();

function cliffIndex(cliffs: readonly Cliff[]): Map<string, Cliff> {
  let index = cliffsByPair.get(cliffs);
  if (!index) {
    index = new Map();
    // La première falaise déclarée pour une paire l'emporte, comme avec une recherche dans la liste.
    for (const cliff of cliffs) {
      const key = cliffKey(...cliff.between);
      if (!index.has(key)) index.set(key, cliff);
    }
    cliffsByPair.set(cliffs, index);
  }
  return index;
}

export function hasCliff(board: Board, a: Position, b: Position): boolean {
  return getCliff(board, a, b) !== undefined;
}

/** Direction d'un pas entre deux cases voisines. */
export function directionBetween(from: Position, to: Position): Direction {
  const found = DIRECTIONS.find((d) => {
    const step = DIRECTION_OFFSETS[d];
    return from.row + step.row === to.row && from.col + step.col === to.col;
  });
  if (!found) throw new Error(`(${from.row}, ${from.col}) et (${to.row}, ${to.col}) ne sont pas voisines`);
  return found;
}

/** Les 4 voisins orthogonaux (pas de diagonale), qu'ils existent ou non. */
export function orthogonalNeighbors(pos: Position): Position[] {
  return Object.values(DIRECTION_OFFSETS).map((d) => ({ row: pos.row + d.row, col: pos.col + d.col }));
}

/**
 * Les cases adjacentes (SPEC.md §10) : les 8 cases autour, diagonales comprises, qui existent et ne sont pas des cases X.
 * Une falaise sépare : une case orthogonale derrière une falaise n'est pas adjacente ; une case en diagonale l'est si au
 * moins un des deux chemins en L qui y mènent passe (case de coin jouable, aucune falaise sur le chemin).
 */
export function adjacentCells(board: Board, from: Position): Position[] {
  const cells: Position[] = [];
  for (const dr of [-1, 0, 1]) {
    for (const dc of [-1, 0, 1]) {
      if (dr === 0 && dc === 0) continue;
      const pos = { row: from.row + dr, col: from.col + dc };
      if (!isPlayable(board, pos)) continue;
      if (dr === 0 || dc === 0) {
        if (!hasCliff(board, from, pos)) cells.push(pos);
        continue;
      }
      const corners = [
        { row: from.row + dr, col: from.col },
        { row: from.row, col: from.col + dc },
      ];
      const open = corners.some(
        (corner) => isPlayable(board, corner) && !hasCliff(board, from, corner) && !hasCliff(board, corner, pos),
      );
      if (open) cells.push(pos);
    }
  }
  return cells;
}

export function isAdjacent(board: Board, a: Position, b: Position): boolean {
  return adjacentCells(board, a).some((pos) => samePos(pos, b));
}
