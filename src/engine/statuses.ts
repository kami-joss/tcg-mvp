// Statuts (SPEC.md §5 bis) : stun, slow, immobilisé, burn, requiem. Chacun dure un nombre de tours du camp de l'unité
// touchée (§5.5), et disparaît au début du tour qui suit son échéance ; requiem tue le monstre au début de son N-ième
// prochain tour.
import { getMonsterCard } from './cards';
import { REQUIEM_TURNS } from './config';
import { emit } from './events';
import { setUnit, statTotal } from './units';
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

/**
 * Un malus de mobilité est un slow (SPEC §5 bis, validé le 2026-11-11) : « mobilité −X » n'existe pas, il s'écrit
 * Slow X. Tout statut posé passe par ici (`addStatus`), et les textes aussi : un mot, une notion.
 */
export function normalStatus(spec: StatusSpec): StatusSpec {
  if (spec.kind === 'stat' && spec.stat === 'mobility' && spec.amount < 0) {
    return { kind: 'slow', amount: -spec.amount, turns: spec.turns };
  }
  return spec;
}

/** Stun : plus aucune action (ni déplacement, ni attaque, ni effet, ni riposte). */
export const isStunned = (unit: Unit) => hasStatus(unit, 'stun');

/** Désarmé : ne peut pas attaquer (déplacement et effets restent possibles). */
export const isDisarmed = (unit: Unit) => hasStatus(unit, 'desarme');

/** Silence : plus d'effet actif (l'attaque, le déplacement, les mots-clés et les passifs ne changent pas). */
export const isSilenced = (unit: Unit) => hasStatus(unit, 'silence');

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
export function addStatus(state: GameState, unitId: UnitId, posed: StatusSpec): GameState {
  const spec = normalStatus(posed);
  const unit = state.units[unitId];
  const { kind } = spec;
  if (!unit || (unit.kind === 'terrain' && kind !== 'burn')) return state;
  const expiresAtTurn =
    spec.kind === 'requiem'
      ? requiemTurn(REQUIEM_TURNS, state.turn, state.activePlayer, unit.owner)
      : statusExpiry(spec.turns, state.turn, state.activePlayer, unit.owner);
  // L'effet qui pose le statut porte aussi son `type: 'status'` : il n'entre pas dans le statut.
  const { type: _type, ...bare } = spec as StatusSpec & { type?: 'status' };
  let status = { ...bare, expiresAtTurn } as Status;
  let updated: Unit = { ...unit, statuses: [...unit.statuses, status] };
  if (updated.kind === 'monster') {
    const mine = unit.owner === state.activePlayer;
    if (kind === 'stun' || kind === 'immobilise') updated = { ...updated, mobilityLeft: 0 };
    else if (spec.kind === 'slow' && mine) {
      updated = { ...updated, mobilityLeft: Math.max(0, updated.mobilityLeft - spec.amount), froze: updated.froze + spec.amount };
    } else if (spec.kind === 'stat' && spec.stat === 'mobility' && mine) {
      // Mobilité +X pendant son tour : elle compte aussitôt (un malus de mobilité est un slow, `normalStatus`).
      updated = { ...updated, mobilityLeft: updated.mobilityLeft + spec.amount, boost: updated.boost + spec.amount };
    } else if (spec.kind === 'stat' && spec.stat === 'maxHp') {
      // PV max +X / −X : les PV suivent, sans descendre sous 1 (comme une aura de PV).
      const maxHp = Math.max(1, updated.maxHp + spec.amount);
      status = { ...status, applied: maxHp - updated.maxHp } as Status;
      updated = { ...updated, statuses: [...unit.statuses, status], maxHp, hp: Math.max(1, updated.hp + spec.amount) };
    }
  }
  return setUnit(emit(state, { type: 'status', unitId, pos: unit.pos, status }), updated);
}

/** Début du tour `turn` : les statuts arrivés à échéance disparaissent, pour toutes les unités. */
export function expireStatuses(state: GameState, turn: number): GameState {
  let next = state;
  for (const unit of Object.values(state.units)) {
    const statuses = unit.statuses.filter((status) => status.expiresAtTurn > turn);
    if (statuses.length === unit.statuses.length) continue;
    let updated: Unit = { ...unit, statuses };
    if (updated.kind === 'monster') {
      // PV max +X / −X qui prend fin : les PV max reviennent, les PV sont plafonnés (sans jamais tuer).
      const lost = unit.statuses.filter((s) => s.expiresAtTurn <= turn && s.kind === 'stat' && s.stat === 'maxHp');
      for (const status of lost) {
        const given = status.kind === 'stat' ? (status.applied ?? status.amount) : 0;
        const maxHp = Math.max(1, updated.maxHp - given);
        updated = { ...updated, maxHp, hp: Math.max(1, Math.min(updated.hp, maxHp)) };
      }
    }
    next = setUnit(next, updated);
  }
  return next;
}

/**
 * Mobilité d'un tour, avec les statuts actifs à ce tour-là : 0 si stun ou immobilisé, sinon celle de la carte plus
 * `bonus` (aura d'Origine), moins les slow.
 */
function mobilityWith(monster: MonsterUnit, statuses: readonly Status[], bonus: number): number {
  if (statuses.some((s) => s.kind === 'stun' || s.kind === 'immobilise')) return 0;
  const slow = statuses.filter((s) => s.kind === 'slow').reduce((total, s) => total + statusAmount(s), 0);
  const stat = statTotal({ statuses }, 'mobility'); // mobilité +X
  return Math.max(0, getMonsterCard(monster.cardId).mobility + bonus + stat - slow);
}

/** Mobilité retrouvée au début du tour en cours (les statuts échus ont déjà disparu) ; `bonus` : aura. */
export function turnMobility(monster: MonsterUnit, bonus = 0): number {
  return mobilityWith(monster, monster.statuses, bonus);
}

/**
 * Mobilité qu'aura le monstre à son prochain tour, vu depuis le tour `turn` où `active` joue ; `bonus` : aura
 * s'il reste où il est.
 */
export function getNextTurnMobility(monster: MonsterUnit, turn: number, active: PlayerId, bonus = 0): number {
  const next = ownerNextTurn(turn, active, monster.owner);
  return mobilityWith(monster, monster.statuses.filter((s) => s.expiresAtTurn > next), bonus);
}
