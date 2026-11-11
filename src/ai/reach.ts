// Calculs rapides pour l'IA, sur des tableaux : où un monstre peut aller à son prochain tour, et ce qu'il peut frapper
// de là. Mêmes règles que le moteur (déplacement §4.6 avec les zones qui ralentissent, ligne de vue §4.7, X et
// falaises §10), sans les pièges (cachés) : appelé des milliers de fois par décision, là où le moteur prendrait des
// secondes.
import { squareCells, getCell, getCliff, getKeyword, getMonsterCard, getTerrainCard } from '../engine';
import type { AllyZone, Archetype, Board, CardSet, Direction, GameState, MonsterUnit, PlayerId, Position, TrapEffect, Unit } from '../engine';

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
  /** La case en diagonale que `squareCells` donne (§10), -1 sinon : `index * 4 + (haut-gauche, haut-droite, bas-gauche, bas-droite)`. */
  readonly diagonal: Int16Array;
}

/** Les 4 diagonales dans l'ordre de `Grid.diagonal`. */
const DIAGONALS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

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
  const diagonal = new Int16Array(size * 4).fill(-1);
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      const i = row * board.cols + col;
      const cell = getCell(board, { row, col });
      kind[i] = cell.kind === 'plain' ? PLAIN : cell.kind === 'offBoard' ? HIGH_X : cell.height === 'low' ? LOW_X : cell.height === 'high' ? HIGH_X : X;
      if (kind[i] === PLAIN) {
        for (const pos of squareCells(board, { row, col })) {
          const k = DIAGONALS.findIndex(([dr, dc]) => pos.row === row + dr && pos.col === col + dc);
          if (k >= 0) diagonal[i * 4 + k] = pos.row * board.cols + pos.col;
        }
      }
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
  const grid = { cols: board.cols, size, kind, next, cliff, noFly, noShot, diagonal };
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
  /** Brûlure N, T tours : la cible perdra encore N PV au début de chacun de ses T prochains tours (§5 bis). */
  readonly burn: number;
  /**
   * « Zone » (Golem de lave, §10) : l'ennemi à côté duquel il arrive en subit les effets (dégâts, et PV que ses burn lui
   * feront perdre), en plus de l'attaque.
   */
  readonly zone: number;
  /** `no_cac` (Trébuchet des archers) : jamais une cible au contact (1 case en ligne droite). */
  readonly noContact: boolean;
  readonly archetype: Archetype | null;
}

/** Profils gardés par jeu de cartes, puis par carte : deux parties aux cartes différentes ne se mêlent pas. */
const profiles = new WeakMap<CardSet, Map<string, StrikeProfile>>();

function profileOf(cards: CardSet, monster: MonsterUnit): StrikeProfile {
  let byCard = profiles.get(cards);
  if (!byCard) profiles.set(cards, (byCard = new Map()));
  let profile = byCard.get(monster.cardId);
  if (!profile) {
    const card = getMonsterCard(cards, monster.cardId);
    const brulure = getKeyword(cards, monster, 'brulure');
    profile = {
      range: card.range,
      flying: getKeyword(cards, monster, 'vol') !== undefined,
      siege: getKeyword(cards, monster, 'siege')?.multiplier ?? 1,
      sournois: getKeyword(cards, monster, 'sournois')?.amount ?? 0,
      assassin: getKeyword(cards, monster, 'assassin')?.multiplier ?? 1,
      // Posé pendant le tour de l'attaquant, un burn de T tours agit au début de T tours de la cible.
      burn: brulure ? brulure.amount * brulure.turns : 0,
      zone: card.passage?.lingering ? effectsDamage(card.passage.effects) : 0,
      noContact: card.noContact === true,
      archetype: card.archetype,
    };
    byCard.set(monster.cardId, profile);
  }
  return profile;
}

/**
 * Pour chaque archétype qui en profite, la portée en plus que donnent les auras de portée des unités de `attacker`
 * (Camps de tir : sa case et son carré de 1) à un monstre qui tire de chaque case ; rien sans aura de portée.
 */
function rangeAurasOf(state: GameState, attacker: PlayerId, grid: Grid): Map<Archetype, Uint8Array> {
  const byArchetype = new Map<Archetype, Uint8Array>();
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== attacker) continue;
    const aura = unit.kind === 'monster' ? getMonsterCard(state.cards, unit.cardId).aura : getTerrainCard(state.cards, unit.cardId).aura;
    if (!aura?.range) continue;
    let cells = byArchetype.get(aura.archetype);
    if (!cells) byArchetype.set(aura.archetype, (cells = new Uint8Array(grid.size)));
    for (const pos of auraCells(state.board, unit.pos, aura.zone)) cells[pos.row * grid.cols + pos.col]! += aura.range;
  }
  return byArchetype;
}

/**
 * Les cases que couvre une aura posée en `pos` (§10). La source elle-même n'en profite pas : sur sa propre case, seul un
 * terrain (zone `cellAndSquare`) couvre un monstre, et aucun monstre à aura de portée n'existe encore.
 */
function auraCells(board: Board, pos: Position, zone: AllyZone): Position[] {
  if (zone === 'cellAndSquare') return [pos, ...squareCells(board, pos)];
  return squareCells(board, pos, zone === 'square2' ? 2 : 1);
}

/** PV que des effets de Passage ou de Zone font perdre : leurs dégâts, et ce que leurs burn infligeront ensuite. */
function effectsDamage(effects: readonly TrapEffect[]): number {
  let total = 0;
  for (const effect of effects) {
    if (effect.type === 'damage') total += effect.amount;
    else if (effect.type === 'status' && effect.kind === 'burn') total += effect.amount * effect.turns;
  }
  return total;
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
      for (const effect of getTerrainCard(state.cards, unit.cardId).passage?.effects ?? []) if (effect.type === 'status' && effect.kind === 'slow') slow += effect.amount;
      if (slow > 0) for (const pos of squareCells(state.board, unit.pos)) extra[pos.row * grid.cols + pos.col]! += slow;
    }
  }
  // Portée en plus selon la case d'où il tire : les auras de portée de ses alliés (Camps de tir), par archétype.
  const rangeAuras = rangeAurasOf(state, attacker, grid);
  const strikers: Striker[] = [];
  for (const monster of units) {
    if (monster.kind !== 'monster' || monster.owner !== attacker) continue;
    const mobility = mobilityOf(monster);
    if (mobility < 0) continue; // Ne pourra pas agir.
    const profile = profileOf(state.cards, monster);
    const { range: cardRange, siege, sournois, assassin, burn, zone, noContact, archetype } = profile;
    const rangeAt = archetype ? rangeAuras.get(archetype) : undefined;
    // Le profil est gardé par carte : le statut Vol, lui, est propre au monstre.
    const flying = profile.flying || monster.statuses.some((s) => s.kind === 'vol');
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
    let best: Map<Unit, number> | null = null;
    for (let r = 0; r < count; r++) {
      const from = reached[r]!;
      if (from !== start && (grid.kind[from] !== PLAIN || monsterAt[from] || (owner[from] !== 0 && owner[from] !== attacker))) continue;
      const range = cardRange + (rangeAt?.[from] ?? 0);
      const shotWalls = range >= 2 ? grid.noShot : grid.cliff;
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
          if (owner[cell] === attacker) continue; // Une unité alliée (monstre ou terrain) ne gêne pas le tir (§4.7).
          const target = targetAt.get(cell);
          if (target && !(noContact && k === 1)) {
            let damage = atk;
            if (target.kind === 'terrain') damage *= siege;
            else if (behindBonus && DIRECTIONS[d] === target.facing) damage = (atk + sournois) * assassin;
            // Brûlure (terrains compris) ; au contact, la Zone de l'attaquant touche aussi le monstre (§10).
            damage += burn + (k === 1 && target.kind === 'monster' ? zone : 0);
            best ??= new Map();
            if (damage > (best.get(target) ?? 0)) best.set(target, damage);
          }
          break;
        }
      }
      // Attaque en diagonale (§4.7, §10) : jusqu'à portée ÷ 2 cases, la première case occupée arrête le tir, sans bonus de dos.
      const diagonalSteps = Math.floor(range / 2);
      for (let k = 0; k < 4; k++) {
        let cell = from;
        for (let step = 1; step <= diagonalSteps; step++) {
          cell = grid.diagonal[cell * 4 + k]!;
          if (cell < 0) break;
          if (cell === start || owner[cell] === 0) continue;
          if (owner[cell] === attacker) continue; // Une unité alliée ne gêne pas le tir.
          const target = targetAt.get(cell);
          if (target) {
            const damage = (target.kind === 'terrain' ? atk * siege : atk) + burn + (step === 1 && target.kind === 'monster' ? zone : 0);
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
