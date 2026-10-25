// Statuts (SPEC.md §5 bis) : stun, slow, immobilisé, burn, requiem. Chacun dure un nombre de tours du camp de l'unité
// touchée (§5.5), et disparaît au début du tour qui suit son échéance ; requiem tue le monstre au début de son N-ième
// prochain tour.
import { getMonsterCard } from './cards';
import { emit } from './events';
import { setUnit } from './units';
import type { GameState, MonsterUnit, PlayerId, Status, StatusKind, StatusSpec, Unit, UnitId } from './types';

export function hasStatus(unit: Unit, kind: StatusKind): boolean {
  return unit.statuses.some((status) => status.kind === kind);
}

/** Valeur d'un statut : la mobilité en moins d'un slow, les PV perdus par tour d'un burn ; 0 pour stun et immobilisé. */
export function statusAmount(status: StatusSpec): number {
  return 'amount' in status ? status.amount : 0;
}

/** Somme des valeurs d'un statut (les statuts du même type se cumulent). */
export function statusTotal(unit: Unit, kind: StatusKind): number {
  return unit.statuses.filter((status) => status.kind === kind).reduce((total, status) => total + statusAmount(status), 0);
}

/** Stun : plus aucune action (ni déplacement, ni attaque, ni effet, ni riposte). */
export const isStunned = (unit: Unit) => hasStatus(unit, 'stun');

/** Le monstre peut se déplacer : ni stun, ni immobilisé. */
export const canMove = (monster: MonsterUnit) => !isStunned(monster) && !hasStatus(monster, 'immobilise');

/** Numéro du prochain tour du camp `owner`, vu depuis le tour `turn` où `active` joue. */
export function ownerNextTurn(turn: number, active: PlayerId, owner: PlayerId): number {
  return turn + (owner === active ? 2 : 1);
}

/**
 * Tour au début duquel disparaît un statut de `turns` tours posé au tour `turn` (où joue `active`) sur une unité de
 * `owner` : après la fin de son `turns`-ième prochain tour, ou dès le début du prochain si `turns` vaut 0 (§5.5).
 */
export function statusExpiry(turns: number, turn: number, active: PlayerId, owner: PlayerId): number {
  const next = ownerNextTurn(turn, active, owner);
  return turns === 0 ? next : next + 2 * turns - 1;
}

/** Tour au début duquel meurt un monstre « requiem N » posé au tour `turn` : son N-ième prochain tour (§5 bis). */
export function requiemTurn(turns: number, turn: number, active: PlayerId, owner: PlayerId): number {
  return ownerNextTurn(turn, active, owner) + 2 * (Math.max(1, turns) - 1);
}

/**
 * Compte à rebours du requiem le plus proche, vu depuis le tour `turn` où joue `active` : 1 si le monstre meurt au début
 * de son prochain tour, 2 au début du suivant… ; `null` sans requiem.
 */
export function requiemCountdown(unit: Unit, turn: number, active: PlayerId): number | null {
  const next = ownerNextTurn(turn, active, unit.owner);
  const counts = unit.statuses.filter((s) => s.kind === 'requiem').map((s) => Math.max(1, (s.expiresAtTurn - next) / 2 + 1));
  return counts.length === 0 ? null : Math.min(...counts);
}

/**
 * Nombre de tours du camp de l'unité où le statut agit encore, vu depuis le tour `turn` où joue `active` : le tour en
 * cours compte s'il est le sien. 0 : il disparaît au début de son prochain tour.
 */
export function statusTurnsLeft(status: Status, owner: PlayerId, turn: number, active: PlayerId): number {
  const first = owner === active ? turn : turn + 1;
  return Math.max(0, Math.ceil((status.expiresAtTurn - first) / 2));
}

/**
 * Pose un statut. Un monstre stun ou immobilisé perd aussitôt sa mobilité restante ; un slow pris pendant le tour de
 * son camp la réduit aussitôt, sans descendre sous 0 (Terrain piégé, §5 bis) ; sur un terrain, seul burn compte (un
 * terrain ne bouge ni n'agit).
 */
export function addStatus(state: GameState, unitId: UnitId, spec: StatusSpec): GameState {
  const unit = state.units[unitId];
  const { kind, turns } = spec;
  if (!unit || (unit.kind === 'terrain' && kind !== 'burn')) return state;
  const expiresAtTurn =
    kind === 'requiem'
      ? requiemTurn(turns, state.turn, state.activePlayer, unit.owner)
      : statusExpiry(turns, state.turn, state.activePlayer, unit.owner);
  const status: Status =
    spec.kind === 'slow' || spec.kind === 'burn' || spec.kind === 'invisible'
      ? { kind: spec.kind, amount: spec.amount, turns, expiresAtTurn }
      : { kind: spec.kind, turns, expiresAtTurn };
  const statuses = [...unit.statuses, status];
  let updated: Unit = { ...unit, statuses };
  if (updated.kind === 'monster') {
    if (kind === 'stun' || kind === 'immobilise') updated = { ...updated, mobilityLeft: 0 };
    else if (spec.kind === 'slow' && unit.owner === state.activePlayer) {
      updated = { ...updated, mobilityLeft: Math.max(0, updated.mobilityLeft - spec.amount) };
    }
  }
  return setUnit(emit(state, { type: 'status', unitId, pos: unit.pos, status }), updated);
}

/** Début du tour `turn` : les statuts arrivés à échéance disparaissent, pour toutes les unités. */
export function expireStatuses(state: GameState, turn: number): GameState {
  let next = state;
  for (const unit of Object.values(state.units)) {
    const statuses = unit.statuses.filter((status) => status.expiresAtTurn > turn);
    if (statuses.length !== unit.statuses.length) next = setUnit(next, { ...unit, statuses });
  }
  return next;
}

/**
 * Mobilité d'un tour, avec les statuts actifs à ce tour-là : 0 si stun ou immobilisé, sinon celle de la carte plus
 * `aura` (Origine), moins les slow.
 */
function mobilityWith(monster: MonsterUnit, statuses: readonly Status[], aura: number): number {
  if (statuses.some((s) => s.kind === 'stun' || s.kind === 'immobilise')) return 0;
  const slow = statuses.filter((s) => s.kind === 'slow').reduce((total, s) => total + statusAmount(s), 0);
  return Math.max(0, getMonsterCard(monster.cardId).mobility + aura - slow);
}

/** Mobilité retrouvée au début du tour en cours (les statuts échus ont déjà disparu) ; `aura` : bonus d'aura. */
export function turnMobility(monster: MonsterUnit, aura = 0): number {
  return mobilityWith(monster, monster.statuses, aura);
}

/**
 * Mobilité qu'aura le monstre à son prochain tour, vu depuis le tour `turn` où `active` joue ; `aura` : bonus d'aura
 * s'il reste où il est.
 */
export function getNextTurnMobility(monster: MonsterUnit, turn: number, active: PlayerId, aura = 0): number {
  const next = ownerNextTurn(turn, active, monster.owner);
  return mobilityWith(monster, monster.statuses.filter((s) => s.expiresAtTurn > next), aura);
}
