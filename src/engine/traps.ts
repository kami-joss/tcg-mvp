// Entrer sur une case : pièges (SPEC.md §6 bis, §10), unités « Passage » (§5.2, §10) et cases brûlées (§10).
// Les pièges sont cachés pour l'adversaire, actifs jusqu'au prochain tour de leur poseur, déclenchés par le premier
// monstre ennemi qui entre sur leur case. Une unité « Passage » (terrain, ou Golem de lave) agit sur chaque monstre
// ennemi qui entre sur une case de sa zone (ses 8 cases adjacentes) : à chaque case en marchant, une fois par recul
// (§10). Une case brûlée, publique, agit sur
// chaque monstre ennemi qui y entre, et reste.
import { isAdjacent, isPlayable, samePos } from './board';
import { getCard } from './cards';
import { dealDamage } from './damage';
import { emit } from './events';
import { addStatus } from './statuses';
import { getUnitsAt, setUnit } from './units';
import type { GameState, PlayerId, TerrainPassage, TrapEffect, Unit, UnitId } from './types';

/**
 * Un mouvement : un déplacement, un recul, une avancée ou une invocation (une téléportation n'entre pas sur sa case :
 * rien ne s'y déclenche, §10). `passages` : les unités « Passage » qui se sont déjà déclenchées sur le monstre pendant
 * ce mouvement (une fois chacune).
 */
export interface Movement {
  readonly passages: readonly UnitId[];
}

export const NEW_MOVEMENT: Movement = { passages: [] };

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
export function getPassage(unit: Unit): TerrainPassage | null {
  const card = getCard(unit.cardId);
  return card.kind === 'spell' ? null : card.passage;
}

/** Unités ennemies « Passage » dont la zone (les 8 cases autour, falaises comprises, §10) contient la case du monstre. */
export function getPassageSources(state: Pick<GameState, 'board' | 'units'>, monster: Unit): (Unit & { passage: TerrainPassage })[] {
  return Object.values(state.units).flatMap((unit) => {
    if (unit.owner === monster.owner || unit.id === monster.id) return [];
    const passage = getPassage(unit);
    return passage && isAdjacent(state.board, unit.pos, monster.pos) ? [{ ...unit, passage }] : [];
  });
}

/**
 * Le monstre `unitId` vient d'entrer sur sa case actuelle (déplacement, recul, avancée ou invocation) :
 * les pièges ennemis de cette case se déclenchent, puis disparaissent ; ensuite les terrains ennemis « Passage » dont
 * il entre dans la zone, s'ils ne se sont pas déjà déclenchés pendant ce mouvement.
 */
export function enterCell(state: GameState, unitId: UnitId, movement: Movement = NEW_MOVEMENT): EnterResult {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') return { state, stopped: false, movement };
  let next = state;
  let stopped = false;

  const triggered = state.traps.filter((trap) => trap.owner !== unit.owner && samePos(trap.pos, unit.pos));
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

  return { state: next, stopped: stopped || next.units[unitId] === undefined, movement: { passages } };
}

/**
 * Remonte N cases (piège de la Chronomancienne) : le monstre revient de `steps` cases en arrière sur son chemin (les cases
 * où il a été depuis le début du tour de son camp), ou à son début s'il est plus court ; une case occupée entre-temps
 * est sautée, vers la case d'où il revient. C'est une téléportation : il garde son orientation, rien ne se déclenche
 * sur la case d'arrivée (ni piège, ni Passage, ni case brûlée, §10) et il n'a plus de mobilité ce tour. Son chemin
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
  if (samePos(to, pos)) return { state: setUnit(state, { ...monster, mobilityLeft: 0 }), stopped: true, movement: NEW_MOVEMENT };
  const moved = setUnit(emit(state, { type: 'rewind', unitId, from: pos, to }), { ...monster, pos: to, trail: kept, mobilityLeft: 0 });
  return { state: moved, stopped: true, movement: NEW_MOVEMENT };
}

/** Au début du tour `turn`, les cases brûlées arrivées à échéance s'éteignent. */
export function expireBurningCells(state: GameState, turn: number): GameState {
  const burningCells = state.burningCells.filter((cell) => cell.expiresAtTurn > turn);
  return burningCells.length === state.burningCells.length ? state : { ...state, burningCells };
}

/** Au début de son tour, les pièges d'un joueur disparaissent : ils n'ont duré qu'un tour adverse. */
export function expireTraps(state: GameState, player: PlayerId): GameState {
  return { ...state, traps: state.traps.filter((trap) => trap.owner !== player) };
}
