// Calculs rapides pour l'IA, sur des tableaux : où un monstre peut aller à son prochain tour, et ce qu'il peut frapper
// de là. Mêmes règles que le moteur (déplacement §4.6 avec les zones qui ralentissent, ligne de vue §4.7, X et
// falaises §10), sans les pièges (cachés) : appelé des milliers de fois par décision, là où le moteur prendrait des
// secondes.
import { adjacentCells, getCell, getCliff, getKeyword, getMonsterCard, getTerrainCard } from '../engine';
import type { Board, Direction, GameState, MonsterUnit, PlayerId, Position, Unit } from '../engine';

/** Ordre des directions dans les tableaux : haut, bas, gauche, droite. */
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];
const DR = [-1, 1, 0, 0] as const;
const DC = [0, 0, -1, 1] as const;

/** Nature d'une case : jouable, X ordinaire, X basse, X haute (ou hors plateau). */
const PLAIN = 0;
const X = 1;
const LOW_X = 2;
const HIGH_X = 3;

/** Le plateau en tableaux, calculé une fois par plateau. */
interface Grid {
  readonly cols: number;
  readonly size: number;
  readonly kind: Uint8Array;
  /** Case voisine dans chaque direction (`index * 4 + direction`), -1 hors de la grille. */
  readonly next: Int16Array;
  /** Une falaise vers la voisine dans la direction d (bit d). */
  readonly cliff: Uint8Array;
  /** Une falaise que `vol` ne survole pas (Mine). */
  readonly noFly: Uint8Array;
  /** Une falaise qui arrête aussi les tirs de portée 2 ou plus (Mine). */
  readonly noShot: Uint8Array;
}

const grids = new WeakMap<Board, Grid>();

function gridOf(board: Board): Grid {
  const cached = grids.get(board);
  if (cached) return cached;
  const size = board.rows * board.cols;
  const kind = new Uint8Array(size);
  const next = new Int16Array(size * 4).fill(-1);
  const cliff = new Uint8Array(size);
  const noFly = new Uint8Array(size);
  const noShot = new Uint8Array(size);
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      const i = row * board.cols + col;
      const cell = getCell(board, { row, col });
      kind[i] = cell.kind === 'plain' ? PLAIN : cell.kind === 'offBoard' ? HIGH_X : cell.height === 'low' ? LOW_X : cell.height === 'high' ? HIGH_X : X;
      for (let d = 0; d < 4; d++) {
        const to = { row: row + DR[d]!, col: col + DC[d]! };
        if (to.row < 0 || to.col < 0 || to.row >= board.rows || to.col >= board.cols) continue;
        next[i * 4 + d] = to.row * board.cols + to.col;
        const found = getCliff(board, { row, col }, to);
        if (!found) continue;
        cliff[i]! |= 1 << d;
        if (!found.flyingPasses) noFly[i]! |= 1 << d;
        if (!found.rangedShotsPass) noShot[i]! |= 1 << d;
      }
    }
  }
  const grid = { cols: board.cols, size, kind, next, cliff, noFly, noShot };
  grids.set(board, grid);
  return grid;
}

/** Une attaque possible au prochain tour : la cible et les dégâts (pris de dos si c'est possible). */
export interface Hit {
  readonly target: Unit;
  readonly damage: number;
}

/** Ce qu'un monstre peut frapper à son prochain tour. */
export interface Striker {
  readonly monster: MonsterUnit;
  readonly hits: readonly Hit[];
}

/** Ce qui compte d'une carte de monstre pour frapper, lu une fois par carte. */
interface StrikeProfile {
  readonly range: number;
  readonly flying: boolean;
  readonly siege: number;
  readonly sournois: number;
  readonly assassin: number;
}

const profiles = new Map<string, StrikeProfile>();

function profileOf(monster: MonsterUnit): StrikeProfile {
  let profile = profiles.get(monster.cardId);
  if (!profile) {
    profile = {
      range: getMonsterCard(monster.cardId).range,
      flying: getKeyword(monster, 'vol') !== undefined,
      siege: getKeyword(monster, 'siege')?.multiplier ?? 1,
      sournois: getKeyword(monster, 'sournois')?.amount ?? 0,
      assassin: getKeyword(monster, 'assassin')?.multiplier ?? 1,
    };
    profiles.set(monster.cardId, profile);
  }
  return profile;
}

/** Tableaux de travail, réutilisés d'un appel à l'autre (un seul calcul à la fois). */
interface Scratch {
  readonly owner: Uint8Array;
  readonly monsterAt: Uint8Array;
  readonly stuck: Uint8Array;
  readonly extra: Uint8Array;
  readonly dist: Int16Array;
  /** Numéro du parcours qui a écrit `dist` pour cette case : les autres valeurs sont périmées. */
  readonly seen: Uint32Array;
  readonly queue: Int32Array;
  readonly reached: Int32Array;
  stamp: number;
}

const scratches = new WeakMap<Grid, Scratch>();

function scratchOf(grid: Grid): Scratch {
  let scratch = scratches.get(grid);
  if (!scratch) {
    scratch = {
      owner: new Uint8Array(grid.size),
      monsterAt: new Uint8Array(grid.size),
      stuck: new Uint8Array(grid.size),
      extra: new Uint8Array(grid.size),
      dist: new Int16Array(grid.size),
      seen: new Uint32Array(grid.size),
      // Une case peut repasser dans la file à chaque baisse de son coût, au plus une fois par point de mobilité.
      queue: new Int32Array(grid.size * 32),
      reached: new Int32Array(grid.size),
      stamp: 0,
    };
    scratches.set(grid, scratch);
  }
  return scratch;
}

/**
 * Pour chaque monstre de `attacker` qui pourra agir à son prochain tour : les unités adverses qu'il pourra frapper, en
 * se déplaçant d'abord (mobilité de son prochain tour), avec ses dégâts. `visible` écarte les cibles qu'il ne voit pas.
 */
export function getStrikers(
  state: GameState,
  attacker: PlayerId,
  mobilityOf: (monster: MonsterUnit) => number,
  atkOf: (monster: MonsterUnit) => number,
  visible: (unit: Unit) => boolean,
): Striker[] {
  const grid = gridOf(state.board);
  const { owner, monsterAt, stuck, extra, dist, seen, queue, reached } = scratchOf(grid);
  const scratch = scratchOf(grid);
  // Les unités par case : propriétaire, un monstre, un monstre qui ne peut pas bouger (stun, immobilisé).
  owner.fill(0);
  monsterAt.fill(0);
  stuck.fill(0);
  extra.fill(0);
  const units = Object.values(state.units);
  const targetAt = new Map<number, Unit>();
  for (const unit of units) {
    const i = unit.pos.row * grid.cols + unit.pos.col;
    owner[i] = unit.owner;
    if (unit.kind === 'monster') {
      monsterAt[i] = 1;
      if (unit.statuses.some((s) => s.kind === 'stun' || s.kind === 'immobilise')) stuck[i] = 1;
    }
    // Sur une case avec un monstre et un terrain, l'attaque touche le monstre.
    if (unit.owner !== attacker && visible(unit) && (unit.kind === 'monster' || !targetAt.has(i))) targetAt.set(i, unit);
    // Mobilité en plus pour entrer sur une case : les zones des terrains adverses qui ralentissent (Terrain piégé).
    if (unit.kind === 'terrain' && unit.owner !== attacker) {
      let slow = 0;
      for (const effect of getTerrainCard(unit.cardId).passage?.effects ?? []) if (effect.type === 'status' && effect.kind === 'slow') slow += effect.amount;
      if (slow > 0) for (const pos of adjacentCells(state.board, unit.pos)) extra[pos.row * grid.cols + pos.col]! += slow;
    }
  }
  const strikers: Striker[] = [];
  for (const monster of units) {
    if (monster.kind !== 'monster' || monster.owner !== attacker) continue;
    const mobility = mobilityOf(monster);
    if (mobility < 0) continue; // Ne pourra pas agir.
    const { range, flying, siege, sournois, assassin } = profileOf(monster);
    const start = monster.pos.row * grid.cols + monster.pos.col;
    // Les cases où il peut aller : traverser ses alliés (sauf stun ou immobilisé), jamais un ennemi ; plus court chemin
    // en mobilité (une case ralentie coûte plus), une case pouvant être revue avec un coût plus bas.
    const stamp = ++scratch.stamp;
    seen[start] = stamp;
    dist[start] = 0;
    queue[0] = start;
    reached[0] = start;
    let tail = 1;
    let count = 1;
    for (let head = 0; head < tail; head++) {
      const from = queue[head]!;
      const walls = flying ? grid.noFly[from]! : grid.cliff[from]!;
      for (let d = 0; d < 4; d++) {
        const to = grid.next[from * 4 + d]!;
        if (to < 0 || walls & (1 << d)) continue;
        const cost = dist[from]! + 1 + extra[to]!;
        const fresh = seen[to] !== stamp;
        if (cost > mobility || (!fresh && cost >= dist[to]!)) continue;
        const kind = grid.kind[to]!;
        if (kind !== PLAIN && (!flying || kind === HIGH_X)) continue;
        if (owner[to] !== 0 && (owner[to] !== attacker || stuck[to])) continue;
        if (fresh) {
          seen[to] = stamp;
          reached[count++] = to;
        }
        dist[to] = cost;
        queue[tail++] = to;
      }
    }
    // De chaque case où il peut s'arrêter (jouable, sans monstre, sans terrain ennemi), ses tirs.
    const atk = atkOf(monster);
    const behindBonus = sournois > 0 || assassin > 1;
    const shotWalls = range >= 2 ? grid.noShot : grid.cliff;
    let best: Map<Unit, number> | null = null;
    for (let r = 0; r < count; r++) {
      const from = reached[r]!;
      if (from !== start && (grid.kind[from] !== PLAIN || monsterAt[from] || (owner[from] !== 0 && owner[from] !== attacker))) continue;
      for (let d = 0; d < 4; d++) {
        let previous = from;
        for (let k = 1; k <= range; k++) {
          const cell = grid.next[previous * 4 + d]!;
          if (cell < 0 || shotWalls[previous]! & (1 << d)) break;
          previous = cell;
          const kind = grid.kind[cell]!;
          if (kind === LOW_X && range >= 2) continue;
          if (kind !== PLAIN) break;
          if (cell === start || owner[cell] === 0) continue;
          const target = targetAt.get(cell);
          if (target) {
            let damage = atk;
            if (target.kind === 'terrain') damage *= siege;
            else if (behindBonus && DIRECTIONS[d] === target.facing) damage = (atk + sournois) * assassin;
            best ??= new Map();
            if (damage > (best.get(target) ?? 0)) best.set(target, damage);
          }
          break;
        }
      }
    }
    if (best) strikers.push({ monster, hits: [...best].map(([target, damage]) => ({ target, damage })) });
  }
  return strikers;
}

/** Index d'une case dans les tableaux. */
export const cellIndex = (board: Board, pos: Position) => pos.row * board.cols + pos.col;
