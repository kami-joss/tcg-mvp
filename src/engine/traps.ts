// Entrer sur une case : pièges (SPEC.md §6 bis, §10), unités « Passage » (§5.2, §10) et cases brûlées (§10).
// Les pièges sont cachés pour l'adversaire, actifs jusqu'au prochain tour de leur poseur, déclenchés par le premier
// monstre ennemi qui entre sur leur case. Une unité « Passage » (terrain, ou Golem de lave) agit sur chaque monstre
// ennemi qui entre sur une case de sa zone (son carré de 1) : à chaque case en marchant, une fois par recul
// (§10). Une case brûlée, publique, agit sur
// chaque monstre ennemi qui y entre, et reste.
import { hasCliff, isInSquare, isPlayable, samePos, squareCells } from './board';
import { getCard } from './cards';
import { dealDamage } from './damage';
import { emit } from './events';
import { addStatus } from './statuses';
import { getUnitsAt, setUnit } from './units';
import type { Board, BoardState, CardSet, GameState, PlayerId, Position, TerrainPassage, Trap, TrapEffect, Unit, UnitId } from './types';

/**
 * Un mouvement : un déplacement, un recul, une avancée, une invocation ou une téléportation (§10). `passages` : les
 * unités « Passage » qui se sont déjà déclenchées sur le monstre pendant ce mouvement (une fois chacune) ; `swept` : les ennemis déjà touchés par la zone du monstre lui-même (« Zone »), une
 * fois chacun.
 */
export interface Movement {
  readonly passages: readonly UnitId[];
  readonly swept: readonly UnitId[];
}

export const NEW_MOVEMENT: Movement = { passages: [], swept: [] };

export interface EnterResult {
  readonly state: GameState;
  /** Le monstre ne va pas plus loin : détruit, ou immobilisé (ou stun) par un piège ou un terrain. */
  readonly stopped: boolean;
  /** Le mouvement en cours, à repasser au pas suivant. */
  readonly movement: Movement;
}

const stops = (effect: TrapEffect) =>
  effect.type === 'rewind' || (effect.type === 'status' && (effect.kind === 'immobilise' || effect.kind === 'stun'));

/** Les effets d'un piège ou d'un terrain, dans l'ordre (§5.4) ; le VP d'une destruction revient à `by`. */
function applyEnterEffects(state: GameState, unitId: UnitId, effects: readonly TrapEffect[], by: PlayerId, trap: boolean): GameState {
  let next = state;
  for (const effect of effects) {
    if (!next.units[unitId]) break;
    next =
      effect.type === 'damage'
        ? dealDamage(next, unitId, effect.amount, by, trap ? 'trap' : 'passage')
        : effect.type === 'rewind'
          ? rewindMonster(next, unitId, effect.steps).state
          : addStatus(next, unitId, effect);
  }
  return next;
}

/** L'effet « Passage » d'une unité (terrain ou monstre), s'il en a un. */
export function getPassage(cards: CardSet, unit: Unit): TerrainPassage | null {
  const card = getCard(cards, unit.cardId);
  return card.kind === 'monster' || card.kind === 'terrain' ? card.passage : null;
}

/** Unités ennemies « Passage » dont la zone (le carré de 1, falaises comprises, §10) contient la case du monstre. */
export function getPassageSources(state: BoardState, monster: Unit): (Unit & { passage: TerrainPassage })[] {
  return Object.values(state.units).flatMap((unit) => {
    if (unit.owner === monster.owner || unit.id === monster.id) return [];
    const passage = getPassage(state.cards, unit);
    return passage && isInSquare(state.board, unit.pos, monster.pos) ? [{ ...unit, passage }] : [];
  });
}

/** Les monstres ennemis de la source dans sa zone (le carré de 1, falaises comprises, §10). */
function getZoneEnemies(state: GameState, source: Unit): Unit[] {
  return Object.values(state.units).filter(
    (unit) => unit.kind === 'monster' && unit.owner !== source.owner && isInSquare(state.board, source.pos, unit.pos),
  );
}

/** La zone de `sourceId` (« Zone », §10) frappe ces ennemis : les effets de son Passage, comme s'ils y entraient. */
function sweepZone(state: GameState, sourceId: UnitId, targetIds: readonly UnitId[]): GameState {
  let next = state;
  for (const id of targetIds) {
    const source = next.units[sourceId];
    const target = next.units[id];
    const passage = source && getPassage(state.cards, source);
    if (!source || !passage || target?.kind !== 'monster') continue;
    next = emit(next, { type: 'passage', sourceId, unitId: id, pos: target.pos });
    next = applyEnterEffects(next, id, passage.effects, source.owner, false);
  }
  return next;
}

/**
 * Début du tour de `player` : les unités adverses « Début du tour adverse » (Champ magnétique) frappent de nouveau, par
 * leur Passage, chacun de ses monstres qui est dans leur zone (§10).
 */
export function sweepFieldsAtEnemyTurnStart(state: GameState, player: PlayerId): GameState {
  let next = state;
  for (const source of Object.values(state.units)) {
    const current = next.units[source.id];
    if (!current || current.owner === player || !getPassage(state.cards, current)?.enemyTurnStart) continue;
    next = sweepZone(next, current.id, getZoneEnemies(next, current).map((enemy) => enemy.id));
  }
  return next;
}

// ---------------------------------------------------------------------------
// Pièges électriques (Archi, §10)
// ---------------------------------------------------------------------------

/** Piège électrique armé : pas en train de se recharger. */
const isArmed = (trap: Trap, turn: number) => trap.rearmsAtTurn === undefined || trap.rearmsAtTurn <= turn;

/**
 * Les cases de la chaîne entre deux pièges électriques, sans leurs propres cases, s'ils sont reliés : alignés en ligne
 * droite orthogonale, à `length` cases au plus, sans case X ni falaise entre eux ; `null` sinon.
 */
export function chainBetween(board: Board, a: Position, b: Position, length: number): Position[] | null {
  if ((a.row !== b.row && a.col !== b.col) || samePos(a, b)) return null;
  const gap = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  if (gap > length) return null;
  const step = { row: Math.sign(b.row - a.row), col: Math.sign(b.col - a.col) };
  const cells: Position[] = [];
  let previous = a;
  for (let i = 1; i <= gap; i++) {
    const pos = { row: a.row + step.row * i, col: a.col + step.col * i };
    if (!isPlayable(board, pos) || hasCliff(board, previous, pos)) return null;
    if (i < gap) cells.push(pos);
    previous = pos;
  }
  return cells;
}

/** Une chaîne entre deux pièges électriques reliés : ses deux pièges et les cases entre eux. */
export interface TrapChain {
  readonly ends: readonly [Trap, Trap];
  readonly cells: readonly Position[];
}

/** Les chaînes entre ces pièges électriques (d'un même joueur et d'une même carte). */
export function getTrapChains(board: Board, traps: readonly Trap[]): TrapChain[] {
  const chains: TrapChain[] = [];
  traps.forEach((a, i) =>
    traps.slice(i + 1).forEach((b) => {
      const cells = chainBetween(board, a.pos, b.pos, Math.min(a.chain ?? 0, b.chain ?? 0));
      if (cells) chains.push({ ends: [a, b], cells });
    }),
  );
  return chains;
}

/** Les réseaux de pièges électriques armés des adversaires de `player` : par poseur et par carte. */
function armedNetworks(state: GameState, player: PlayerId): Trap[][] {
  const groups = new Map<string, Trap[]>();
  for (const trap of state.traps) {
    if (trap.chain === undefined || trap.owner === player || !isArmed(trap, state.turn)) continue;
    const key = `${trap.owner}:${trap.cardId}`;
    groups.set(key, [...(groups.get(key) ?? []), trap]);
  }
  return [...groups.values()];
}

/**
 * Ce que déclenche un monstre de `player` qui entre sur `pos` : pour chaque réseau armé, le piège de cette case ou les
 * deux pièges de la chaîne qui y passe, et tout ce qui leur est relié (§10) ; avec les chaînes de ce réseau.
 */
function triggeredNetworks(state: GameState, player: PlayerId, pos: Position): { traps: Trap[]; chains: TrapChain[] }[] {
  return armedNetworks(state, player).flatMap((traps) => {
    const chains = getTrapChains(state.board, traps);
    const seeds = new Set<Trap>(traps.filter((trap) => samePos(trap.pos, pos)));
    for (const chain of chains) if (chain.cells.some((cell) => samePos(cell, pos))) chain.ends.forEach((end) => seeds.add(end));
    if (seeds.size === 0) return [];
    // Tout le réseau relié : de proche en proche, par les chaînes.
    const fired = new Set(seeds);
    let grew = true;
    while (grew) {
      grew = false;
      for (const { ends } of chains) {
        if (fired.has(ends[0]) !== fired.has(ends[1])) {
          ends.forEach((end) => fired.add(end));
          grew = true;
        }
      }
    }
    return [{ traps: [...fired], chains: chains.filter((chain) => fired.has(chain.ends[0])) }];
  });
}

/**
 * Le réseau électrique se déclenche sur le monstre `unitId` qui vient d'entrer : lui, puis chaque autre ennemi du poseur
 * sur un de ses pièges, dans le carré de 1 d'un de ses pièges ou sur une de ses chaînes, subit une fois les effets du
 * piège ; puis ses pièges se rechargent jusqu'au début du prochain tour de leur poseur (§10).
 */
function fireNetwork(state: GameState, unitId: UnitId, traps: readonly Trap[], chains: readonly TrapChain[]): GameState {
  const owner = traps[0]!.owner;
  const effects = traps[0]!.effects;
  const cells = [
    ...traps.flatMap((trap) => [trap.pos, ...squareCells(state.board, trap.pos)]),
    ...chains.flatMap((chain) => chain.cells),
  ];
  const others = Object.values(state.units)
    .filter((unit) => unit.kind === 'monster' && unit.owner !== owner && unit.id !== unitId && cells.some((pos) => samePos(pos, unit.pos)))
    .map((unit) => unit.id);
  // Rechargés jusqu'au début du prochain tour de leur poseur (pendant son propre tour : celui d'après).
  const rearmsAtTurn = state.activePlayer === owner ? state.turn + 2 : state.turn + 1;
  let next: GameState = {
    ...state,
    traps: state.traps.map((trap) => (traps.includes(trap) ? { ...trap, rearmsAtTurn } : trap)),
  };
  for (const trap of traps) next = emit(next, { type: 'trapTriggered', trap, unitId });
  // L'animation : le courant d'un piège à l'autre par les chaînes, puis du piège le plus proche à chaque ennemi touché.
  const nearest = (pos: Position) =>
    traps.reduce((best, trap) => (Math.abs(trap.pos.row - pos.row) + Math.abs(trap.pos.col - pos.col) < Math.abs(best.pos.row - pos.row) + Math.abs(best.pos.col - pos.col) ? trap : best));
  const arcs = [
    ...chains.map((chain) => ({ from: chain.ends[0].pos, to: chain.ends[1].pos })),
    ...[unitId, ...others].flatMap((id) => {
      const unit = next.units[id];
      return unit ? [{ from: nearest(unit.pos).pos, to: unit.pos, toId: id }] : [];
    }),
  ];
  next = emit(next, { type: 'arcs', cardId: traps[0]!.cardId, arcs });
  for (const id of [unitId, ...others]) {
    if (next.units[id]?.kind === 'monster') next = applyEnterEffects(next, id, effects, owner, true);
  }
  return next;
}

/** Début du tour de `player` : sa « Zone » frappe de nouveau chaque ennemi qui y est resté (§4.2, §10). */
export function sweepZonesAtTurnStart(state: GameState, player: PlayerId): GameState {
  let next = state;
  for (const source of Object.values(state.units)) {
    const current = next.units[source.id];
    if (!current || current.owner !== player || current.kind !== 'monster' || !getPassage(state.cards, current)?.lingering) continue;
    next = sweepZone(next, current.id, getZoneEnemies(next, current).map((enemy) => enemy.id));
  }
  return next;
}

/**
 * Le monstre `unitId` vient d'entrer sur sa case actuelle (déplacement, recul, avancée ou invocation) :
 * les pièges ennemis de cette case se déclenchent, puis disparaissent ; ensuite les terrains ennemis « Passage » dont
 * il entre dans la zone, s'ils ne se sont pas déjà déclenchés pendant ce mouvement ; enfin, si le monstre a lui-même
 * une « Zone » (Golem de lave), elle frappe les ennemis qui y sont désormais et n'y étaient pas depuis `from` (sa case
 * d'avant ; absent : tous, à l'invocation).
 */
export function enterCell(state: GameState, unitId: UnitId, movement: Movement = NEW_MOVEMENT, from?: Position): EnterResult {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') return { state, stopped: false, movement };
  let next = state;
  let stopped = false;

  const triggered = state.traps.filter((trap) => trap.chain === undefined && trap.owner !== unit.owner && samePos(trap.pos, unit.pos));
  if (triggered.length > 0) {
    next = { ...next, traps: next.traps.filter((trap) => !triggered.includes(trap)) };
    for (const trap of triggered) {
      if (next.units[unitId]?.kind !== 'monster') break;
      next = applyEnterEffects(emit(next, { type: 'trapTriggered', trap, unitId }), unitId, trap.effects, trap.owner, true);
      // Un statut qui empêche de bouger arrête le monstre sur la case piégée (filet du Poseur de piège).
      stopped ||= trap.effects.some(stops);
    }
    // Renvoyé en arrière par un piège (Chronomancienne) : il n'est plus sur cette case, rien d'autre ne s'y déclenche.
    const after = next.units[unitId];
    if (!after || !samePos(after.pos, unit.pos)) return { state: next, stopped: true, movement };
  }

  // Pièges électriques (Archi) : un piège ou une chaîne sur cette case déclenche tout son réseau relié, qui reste.
  for (const network of triggeredNetworks(next, unit.owner, unit.pos)) {
    if (next.units[unitId]?.kind !== 'monster') break;
    next = fireNetwork(next, unitId, network.traps, network.chains);
    stopped ||= network.traps[0]!.effects.some(stops);
  }

  let passages = movement.passages;
  for (const source of getPassageSources(next, unit)) {
    const current = next.units[unitId];
    if (current?.kind !== 'monster') break;
    if (passages.includes(source.id) || !next.units[source.id]) continue;
    passages = [...passages, source.id];
    next = emit(next, { type: 'passage', sourceId: source.id, unitId, pos: current.pos });
    next = applyEnterEffects(next, unitId, source.passage.effects, source.owner, false);
    stopped ||= source.passage.effects.some(stops);
  }

  // Cases brûlées ennemies : à chaque entrée, et elles restent.
  for (const cell of next.burningCells.filter((c) => c.owner !== unit.owner && samePos(c.pos, unit.pos))) {
    if (next.units[unitId]?.kind !== 'monster') break;
    next = applyEnterEffects(emit(next, { type: 'burningCell', cell, unitId }), unitId, cell.effects, cell.owner, false);
    stopped ||= cell.effects.some(stops);
  }

  // Sa propre zone, sur les ennemis qu'il vient d'approcher : une fois chacun par mouvement.
  let swept = movement.swept;
  const self = next.units[unitId];
  if (self?.kind === 'monster' && getPassage(state.cards, self)?.lingering) {
    const approached = getZoneEnemies(next, self).filter(
      (enemy) => !swept.includes(enemy.id) && !(from && isInSquare(next.board, from, enemy.pos)),
    );
    swept = [...swept, ...approached.map((enemy) => enemy.id)];
    next = sweepZone(next, unitId, approached.map((enemy) => enemy.id));
  }

  return { state: next, stopped: stopped || next.units[unitId] === undefined, movement: { passages, swept } };
}

/**
 * Remonte N cases (piège de la Chronomancienne) : le monstre revient de `steps` cases en arrière sur son chemin (les cases
 * où il a été depuis le début du tour de son camp), ou à son début s'il est plus court ; une case occupée entre-temps
 * est sautée, vers la case d'où il revient. C'est une téléportation : il garde son orientation et entre sur la case
 * d'arrivée (piège, Passage, case brûlée et Zone s'y déclenchent, §10) ; il n'a plus de mobilité ce tour. Son chemin
 * s'arrête à cette case.
 */
export function rewindMonster(state: GameState, unitId: UnitId, steps: number): EnterResult {
  const monster = state.units[unitId];
  if (monster?.kind !== 'monster') return { state, stopped: true, movement: NEW_MOVEMENT };
  const { trail, pos } = monster;
  const last = trail.length - 1;
  const free = (cell: (typeof trail)[number]) =>
    isPlayable(state.board, cell) &&
    getUnitsAt(state, cell).every((unit) => unit.id === unitId || (unit.kind === 'terrain' && unit.owner === monster.owner));
  let index = Math.max(0, last - steps);
  while (index < last && !free(trail[index]!)) index++;
  const to = trail[index] ?? pos;
  const kept = trail.slice(0, index + 1);
  if (samePos(to, pos)) return { state: setUnit(state, { ...monster, mobilityLeft: 0, halted: true }), stopped: true, movement: NEW_MOVEMENT };
  const moved = setUnit(emit(state, { type: 'rewind', unitId, from: pos, to }), { ...monster, pos: to, trail: kept, mobilityLeft: 0, halted: true });
  return { state: enterCell(moved, unitId, NEW_MOVEMENT, pos).state, stopped: true, movement: NEW_MOVEMENT };
}

/** Au début du tour `turn`, les cases brûlées arrivées à échéance s'éteignent. */
export function expireBurningCells(state: GameState, turn: number): GameState {
  const burningCells = state.burningCells.filter((cell) => cell.expiresAtTurn > turn);
  return burningCells.length === state.burningCells.length ? state : { ...state, burningCells };
}

/**
 * Au début de son tour, ses pièges arrivés à échéance disparaissent : un tour adverse, ou plus (Sablier du temps : 3) ;
 * un piège électrique reste.
 */
export function expireTraps(state: GameState, player: PlayerId): GameState {
  return {
    ...state,
    traps: state.traps.filter((trap) => trap.owner !== player || trap.expiresAtTurn === null || trap.expiresAtTurn > state.turn),
  };
}
