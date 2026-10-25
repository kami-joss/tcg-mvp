// Entrer sur une case : pièges (SPEC.md §6 bis, §10), unités « Passage » (§5.2, §10) et cases brûlées (§10).
// Les pièges sont cachés pour l'adversaire, actifs jusqu'au prochain tour de leur poseur, déclenchés par le premier
// monstre ennemi qui entre sur leur case. Une unité « Passage » (terrain, ou Golem de lave) agit sur chaque monstre
// ennemi qui entre dans sa zone (ses 8 cases adjacentes), une fois par mouvement. Une case brûlée, publique, agit sur
// chaque monstre ennemi qui y entre, et reste.
import { isAdjacent, samePos } from './board';
import { getCard } from './cards';
import { dealDamage } from './damage';
import { emit } from './events';
import { addStatus } from './statuses';
import type { GameState, PlayerId, TerrainPassage, TrapEffect, Unit, UnitId } from './types';

/**
 * Un mouvement : un déplacement, un recul, une avancée, une invocation ou une téléportation. `passages` : les unités
 * « Passage » qui se sont déjà déclenchées sur le monstre pendant ce mouvement (une fois chacune, §10).
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

const stops = (effect: TrapEffect) => effect.type === 'status' && (effect.kind === 'immobilise' || effect.kind === 'stun');

/** Les effets d'un piège ou d'un terrain, dans l'ordre (§5.4) ; le VP d'une destruction revient à `by`. */
function applyEnterEffects(state: GameState, unitId: UnitId, effects: readonly TrapEffect[], by: PlayerId, trap: boolean): GameState {
  let next = state;
  for (const effect of effects) {
    if (!next.units[unitId]) break;
    next =
      effect.type === 'damage'
        ? dealDamage(next, unitId, effect.amount, by, trap ? 'trap' : 'passage')
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
 * Le monstre `unitId` vient d'entrer sur sa case actuelle (déplacement, recul, avancée, invocation ou téléportation) :
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

/** Au début du tour `turn`, les cases brûlées arrivées à échéance s'éteignent. */
export function expireBurningCells(state: GameState, turn: number): GameState {
  const burningCells = state.burningCells.filter((cell) => cell.expiresAtTurn > turn);
  return burningCells.length === state.burningCells.length ? state : { ...state, burningCells };
}

/** Au début de son tour, les pièges d'un joueur disparaissent : ils n'ont duré qu'un tour adverse. */
export function expireTraps(state: GameState, player: PlayerId): GameState {
  return { ...state, traps: state.traps.filter((trap) => trap.owner !== player) };
}
