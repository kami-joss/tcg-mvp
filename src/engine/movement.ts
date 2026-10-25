// Déplacement (SPEC.md §4.6), avec le mot-clé `vol` (§5) ; tous deux précisés en §10.
// Le monstre suit un chemin case par case : les pièges ennemis se déclenchent sur son passage (§6 bis), ainsi que les
// terrains ennemis « Passage » dont il traverse la zone (§10). Le slow d'un Terrain piégé, pris aussitôt, coûte de la
// mobilité : les chemins en tiennent compte (le terrain est public).
import { adjacentCells, directionBetween, distance, getCell, getCliff, isPlayable, orthogonalNeighbors, samePos } from './board';
import { getTerrainCard } from './cards';
import { IllegalActionError } from './errors';
import { emit } from './events';
import { canMove } from './statuses';
import { perceived, reveal } from './stealth';
import { NEW_MOVEMENT, enterCell } from './traps';
import { getActiveMonster, getMonsters, getUnitsAt, hasKeyword, setUnit } from './units';
import type { Action, BoardState, GameState, MonsterUnit, Position } from './types';

type MoveAction = Extract<Action, { type: 'move' }>;

export interface Destination {
  readonly pos: Position;
  /** Mobilité dépensée : longueur du plus court chemin orthogonal. */
  readonly cost: number;
}

/**
 * Case traversable : les alliés (monstres et terrains) se traversent, jamais les ennemis ni les cases
 * hors plateau. Les cases X ne se traversent qu'avec `vol` (§10).
 */
function canCross(state: BoardState, monster: MonsterUnit, flying: boolean, pos: Position): boolean {
  const cell = getCell(state.board, pos);
  if (cell.kind === 'offBoard') return false;
  if (cell.kind === 'blocked') return flying;
  return getUnitsAt(state, pos).every((unit) => unit.owner === monster.owner);
}

/** Case où terminer : jouable, sans monstre ni terrain ennemi. Un terrain allié seul est permis (§10). */
function canStop(state: BoardState, monster: MonsterUnit, pos: Position): boolean {
  return (
    isPlayable(state.board, pos) &&
    getUnitsAt(state, pos).every((unit) => unit.kind === 'terrain' && unit.owner === monster.owner)
  );
}

/** Un pas d'une case vers une voisine : une falaise ne se franchit pas, sauf en volant, et jamais celle de la Mine (§10). */
function canStep(state: BoardState, monster: MonsterUnit, flying: boolean, from: Position, to: Position): boolean {
  const cliff = getCliff(state.board, from, to);
  return distance(from, to) === 1 && (!cliff || (flying && cliff.flyingPasses)) && canCross(state, monster, flying, to);
}

/**
 * Zone d'un terrain ennemi « Passage » qui ralentit (Terrain piégé) : y entrer coûte `extra` mobilité de plus, la
 * première fois de chaque déplacement (§10).
 */
interface SlowZone {
  readonly cells: readonly Position[];
  readonly extra: number;
}

function getSlowZones(state: BoardState, monster: MonsterUnit): SlowZone[] {
  return Object.values(state.units).flatMap((unit) => {
    if (unit.kind !== 'terrain' || unit.owner === monster.owner) return [];
    const slows = (getTerrainCard(unit.cardId).passage?.effects ?? []).flatMap((effect) =>
      effect.type === 'status' && effect.kind === 'slow' ? [effect.amount] : [],
    );
    if (slows.length === 0) return [];
    return [{ cells: adjacentCells(state.board, unit.pos), extra: slows.reduce((a, b) => a + b, 0) }];
  });
}

/** Mobilité en plus pour entrer sur `pos`, et les zones de ralentissement déjà franchies après ce pas. */
function slowStep(zones: readonly SlowZone[], crossed: number, pos: Position): { extra: number; crossed: number } {
  let extra = 0;
  let next = crossed;
  zones.forEach((zone, i) => {
    if (!(crossed & (1 << i)) && zone.cells.some((cell) => samePos(cell, pos))) {
      next |= 1 << i;
      extra += zone.extra;
    }
  });
  return { extra, crossed: next };
}

interface Reached extends Destination {
  /** Zones de ralentissement déjà franchies (un bit par zone). */
  readonly crossed: number;
  /** Indice de la case précédente dans le parcours, pour retrouver le chemin. */
  readonly from: number;
}

/**
 * Parcours depuis le monstre, par coût croissant : chaque case coûte 1 point de mobilité, plus le slow d'une zone de
 * Terrain piégé la première fois qu'il y entre. Sans Terrain piégé, c'est un parcours en largeur. Les pièges n'y jouent
 * aucun rôle : ils sont cachés, et le calcul ne doit rien en révéler.
 */
function explore(state: BoardState, monster: MonsterUnit): { reached: Reached[]; best: Map<string, number> } {
  const flying = hasKeyword(monster, 'vol');
  const zones = getSlowZones(state, monster);
  const key = (pos: Position, crossed: number) => `${pos.row},${pos.col},${crossed}`;
  const reached: Reached[] = [{ pos: monster.pos, cost: 0, crossed: 0, from: -1 }];
  const best = new Map<string, number>([[key(monster.pos, 0), 0]]);
  const buckets: number[][] = [[0]];
  for (let cost = 0; cost < buckets.length; cost++) {
    for (const i of buckets[cost] ?? []) {
      const here = reached[i]!;
      if (best.get(key(here.pos, here.crossed)) !== i) continue;
      for (const next of orthogonalNeighbors(here.pos)) {
        if (!canStep(state, monster, flying, here.pos, next)) continue;
        const step = slowStep(zones, here.crossed, next);
        const nextCost = here.cost + 1 + step.extra;
        if (nextCost > monster.mobilityLeft) continue;
        const k = key(next, step.crossed);
        const known = best.get(k);
        if (known !== undefined && reached[known]!.cost <= nextCost) continue;
        best.set(k, reached.length);
        (buckets[nextCost] ??= []).push(reached.length);
        reached.push({ pos: next, cost: nextCost, crossed: step.crossed, from: i });
      }
    }
  }
  return { reached, best };
}

/** Pour chaque case atteinte, l'indice du parcours le moins cher (le premier trouvé à coût égal). */
function cheapest(state: BoardState, monster: MonsterUnit): { reached: Reached[]; byPos: Map<string, number> } {
  const { reached, best } = explore(state, monster);
  const byPos = new Map<string, number>();
  reached.forEach((r, i) => {
    if (i === 0 || best.get(`${r.pos.row},${r.pos.col},${r.crossed}`) !== i) return;
    const k = `${r.pos.row},${r.pos.col}`;
    const known = byPos.get(k);
    if (known === undefined || reached[known]!.cost > r.cost) byPos.set(k, i);
  });
  return { reached, byPos };
}

/** Coût en mobilité d'un chemin donné, slow des Terrains piégés compris. */
function pathCost(state: BoardState, monster: MonsterUnit, path: readonly Position[]): number {
  const zones = getSlowZones(state, monster);
  let crossed = 0;
  let cost = 0;
  for (const pos of path) {
    const step = slowStep(zones, crossed, pos);
    crossed = step.crossed;
    cost += 1 + step.extra;
  }
  return cost;
}

/** Cases où `monster` peut terminer un déplacement avec sa mobilité restante, et leur coût minimal. */
export function getMoveDestinations(state: BoardState, monster: MonsterUnit): Destination[] {
  const { reached, byPos } = cheapest(state, monster);
  return [...byPos.values()]
    .sort((a, b) => a - b)
    .map((i) => reached[i]!)
    .filter((d) => canStop(state, monster, d.pos))
    .map(({ pos, cost }) => ({ pos, cost }));
}

/** Chemin par défaut vers `to` (un des plus courts), sans la case de départ ; `null` si `to` est inaccessible. */
export function getMovePath(state: BoardState, monster: MonsterUnit, to: Position): Position[] | null {
  const { reached, byPos } = cheapest(state, monster);
  let index = byPos.get(`${to.row},${to.col}`) ?? -1;
  if (index <= 0 || !canStop(state, monster, to)) return null;
  const path: Position[] = [];
  while (index > 0) {
    const step = reached[index]!;
    path.unshift(step.pos);
    index = step.from;
  }
  return path;
}

export function getMoveActions(state: GameState): Action[] {
  return getMonsters(state, state.activePlayer)
    .filter(canMove)
    .flatMap((monster) =>
    getMoveDestinations(state, monster).map((d): Action => ({ type: 'move', unitId: monster.id, to: d.pos })),
  );
}

/** Le chemin demandé, ou le chemin par défaut, après vérification. */
function resolvePath(state: GameState, monster: MonsterUnit, action: MoveAction): Position[] {
  const refuse = () =>
    new IllegalActionError(`${monster.id} ne peut pas se déplacer en (${action.to.row}, ${action.to.col})`);
  if (!action.path) {
    const path = getMovePath(state, monster, action.to);
    if (!path) throw refuse();
    return path;
  }

  const path = action.path.map(({ row, col }) => ({ row, col }));
  const last = path.at(-1);
  if (!last || !samePos(last, action.to) || pathCost(state, monster, path) > monster.mobilityLeft) throw refuse();
  const flying = hasKeyword(monster, 'vol');
  path.forEach((pos, i) => {
    if (!canStep(state, monster, flying, i === 0 ? monster.pos : path[i - 1]!, pos)) throw refuse();
  });
  if (!canStop(state, monster, last)) throw refuse();
  return path;
}

export function applyMove(state: GameState, action: MoveAction): GameState {
  const monster = getActiveMonster(state, action.unitId);
  if (!canMove(monster)) throw new IllegalActionError(`${monster.id} ne peut pas se déplacer (stun ou immobilisé)`);
  // Le chemin se choisit sur ce que voit le joueur ; les monstres invisibles pour lui l'interrompent en route.
  const path = resolvePath(perceived(state), monster, action);

  // Case par case : la mobilité baisse à chaque pas, et le monstre regarde dans le sens de sa marche.
  let next = state;
  let from = monster.pos;
  let movement = NEW_MOVEMENT;
  for (const [i, pos] of path.entries()) {
    const current = next.units[monster.id];
    if (current?.kind !== 'monster' || current.mobilityLeft < 1) break;
    const blocker = getUnitsAt(next, pos).find((unit) => unit.owner !== monster.owner);
    if (blocker) return stopBefore(reveal(next, blocker.id), monster.id, [monster.pos, ...path.slice(0, i)]);
    next = setUnit(emit(next, { type: 'step', unitId: monster.id, from, to: pos, kind: 'walk' }), {
      ...current,
      pos,
      facing: directionBetween(from, pos),
      mobilityLeft: current.mobilityLeft - 1,
    });
    from = pos;
    // Chaque case entrée peut déclencher un piège ou un terrain « Passage », même pour un monstre `vol` (§10).
    const entered = enterCell(next, monster.id, movement);
    next = entered.state;
    movement = entered.movement;
    if (entered.stopped) break;
  }
  return next;
}

/**
 * Déplacement interrompu par un monstre invisible (§10) : le monstre revient sur la dernière case parcourue où il
 * peut s'arrêter (au pire sa case de départ) et perd le reste de sa mobilité. Les pièges traversés restent déclenchés.
 */
function stopBefore(state: GameState, unitId: string, walked: readonly Position[]): GameState {
  const current = state.units[unitId];
  if (current?.kind !== 'monster') return state;
  const others: BoardState = { ...state, units: Object.fromEntries(Object.entries(state.units).filter(([id]) => id !== unitId)) };
  const stop = [...walked].reverse().find((pos) => canStop(others, current, pos)) ?? walked[0]!;
  const back = samePos(stop, current.pos) ? state : emit(state, { type: 'stopped', unitId, pos: stop });
  return setUnit(back, { ...current, pos: stop, mobilityLeft: 0 });
}
