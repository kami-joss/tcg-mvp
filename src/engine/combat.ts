// Attaque (SPEC.md §4.7), avec les mots-clés `riposte`, `prime` (§5) et ceux des decks archer et piège (§6 bis).
import { DIRECTION_OFFSETS, directionBetween, distance, getCliff, isPlayable } from './board';
import { getMonsterCard } from './cards';
import { dealDamage } from './damage';
import { IllegalActionError } from './errors';
import { emit } from './events';
import { addMana, addVp } from './players';
import { addStatus, canMove, isStunned } from './statuses';
import { perceived, reveal } from './stealth';
import { enterCell } from './traps';
import { applyTriggeredEffects } from './effects';
import { getActiveMonster, getAtk, getKeyword, getMonsters, getRange, getUnitsAt, hasKeyword, setUnit } from './units';
import type { Action, BoardState, GameState, MonsterUnit, Position, Unit } from './types';

type AttackAction = Extract<Action, { type: 'attack' }>;

/**
 * Ligne de vue depuis `from` : dans chaque direction orthogonale, la première case occupée à `range`
 * cases au plus. Les cases traversées doivent exister, ne pas être `X` et être vides. Une falaise coupe la ligne de vue,
 * sauf celle de la Scierie pour un tir de portée 2 ou plus (§10).
 */
export function getLineOfSightCells(state: BoardState, from: Position, range: number): Position[] {
  const cells: Position[] = [];
  for (const step of Object.values(DIRECTION_OFFSETS)) {
    for (let d = 1; d <= range; d++) {
      const previous = { row: from.row + step.row * (d - 1), col: from.col + step.col * (d - 1) };
      const pos = { row: from.row + step.row * d, col: from.col + step.col * d };
      const cliff = getCliff(state.board, previous, pos);
      if (!isPlayable(state.board, pos) || (cliff && !(cliff.rangedShotsPass && range >= 2))) break;
      if (getUnitsAt(state, pos).length > 0) {
        cells.push(pos);
        break;
      }
    }
  }
  return cells;
}

/**
 * Cases qu'un monstre de portée `range` peut frapper depuis `from` : dans chaque direction, les cases traversées par
 * son tir, jusqu'à la première occupée comprise (mêmes règles que la ligne de vue). Sert à montrer la menace adverse.
 */
export function getStrikeCells(state: BoardState, from: Position, range: number): Position[] {
  const cells: Position[] = [];
  for (const step of Object.values(DIRECTION_OFFSETS)) {
    for (let d = 1; d <= range; d++) {
      const previous = { row: from.row + step.row * (d - 1), col: from.col + step.col * (d - 1) };
      const pos = { row: from.row + step.row * d, col: from.col + step.col * d };
      const cliff = getCliff(state.board, previous, pos);
      if (!isPlayable(state.board, pos) || (cliff && !(cliff.rangedShotsPass && range >= 2))) break;
      cells.push(pos);
      if (getUnitsAt(state, pos).length > 0) break;
    }
  }
  return cells;
}

/**
 * Unités que `attacker` peut attaquer ce tour : les unités ennemies en ligne de vue, à portée.
 * Sur une case avec un monstre et un terrain, seul le monstre est attaquable.
 */
export function getAttackTargets(state: GameState, attacker: MonsterUnit): Unit[] {
  if (attacker.hasAttacked || isStunned(attacker)) return [];
  return getLineOfSightCells(state, attacker.pos, getRange(attacker)).flatMap((pos) => {
    const units = getUnitsAt(state, pos);
    const target = units.find((u) => u.kind === 'monster') ?? units[0];
    return target && target.owner !== attacker.owner ? [target] : [];
  });
}

/** L'attaque profite d'un bonus « par derrière » (`assassin`, `sournois`) : la cible est un monstre pris de dos. */
export function hitsFromBehind(attacker: MonsterUnit, target: Unit): boolean {
  return (
    target.kind === 'monster' &&
    (hasKeyword(attacker, 'assassin') || hasKeyword(attacker, 'sournois')) &&
    isBehind(attacker, target)
  );
}

/**
 * Dégâts d'une attaque : l'ATK actuelle de l'attaquant (bonus du tour et auras compris), multipliée contre un terrain
 * avec `siege` (Trébuchet). Contre un monstre pris de dos : + le bonus de `sournois` (Farceur), puis × celui
 * d'`assassin` (Clown assassin, §10).
 */
export function attackDamage(state: BoardState, attacker: MonsterUnit, target: Unit): number {
  const base = getAtk(state, attacker);
  if (target.kind === 'terrain') return base * (getKeyword(attacker, 'siege')?.multiplier ?? 1);
  if (!hitsFromBehind(attacker, target)) return base;
  const atk = base + (getKeyword(attacker, 'sournois')?.amount ?? 0);
  return atk * (getKeyword(attacker, 'assassin')?.multiplier ?? 1);
}

/** L'attaquant est derrière la cible : il frappe dans le sens où elle regarde. */
export function isBehind(attacker: MonsterUnit, target: MonsterUnit): boolean {
  const step = DIRECTION_OFFSETS[target.facing];
  const dr = target.pos.row - attacker.pos.row;
  const dc = target.pos.col - attacker.pos.col;
  const d = Math.abs(dr) + Math.abs(dc);
  return d > 0 && dr === step.row * d && dc === step.col * d;
}

/**
 * Avancée : l'attaquant était adjacent, l'attaque détruit la cible, et la case libérée peut être
 * occupée (il n'y reste pas de terrain ennemi, SPEC.md §4.9).
 */
export function canAdvance(state: GameState, attacker: MonsterUnit, target: Unit): boolean {
  return (
    canMove(attacker) &&
    distance(attacker.pos, target.pos) === 1 &&
    target.hp <= attackDamage(state, attacker, target) &&
    getUnitsAt(state, target.pos).every((u) => u.id === target.id)
  );
}

export function getAttackActions(state: GameState): Action[] {
  return getMonsters(state, state.activePlayer).flatMap((attacker) =>
    getAttackTargets(state, attacker).flatMap((target): Action[] => {
      const attack = { type: 'attack', unitId: attacker.id, targetId: target.id } as const;
      return canAdvance(state, attacker, target)
        ? [
            { ...attack, advance: false },
            { ...attack, advance: true },
          ]
        : [{ ...attack, advance: false }];
    }),
  );
}

export function applyAttack(state: GameState, action: AttackAction): GameState {
  const attacker = getActiveMonster(state, action.unitId);
  if (attacker.hasAttacked) throw new IllegalActionError(`${attacker.id} a déjà attaqué ce tour`);
  const seen = perceived(state);
  const target = getAttackTargets(seen, attacker).find((t) => t.id === action.targetId);
  if (!target) throw new IllegalActionError(`${attacker.id} ne peut pas attaquer ${action.targetId}`);
  if (action.advance && !canAdvance(seen, attacker, target)) {
    throw new IllegalActionError(`Avancée impossible pour ${attacker.id} sur ${target.id}`);
  }

  const attacked: MonsterUnit = { ...attacker, hasAttacked: true };
  // Un monstre invisible sur la ligne de tir l'arrête : l'attaque est utilisée, sans dégâts, et il se révèle (§10).
  const blocker = getShotBlocker(state, attacker.pos, target.pos);
  if (blocker) {
    const shot = emit(state, { type: 'shotBlocked', unitId: attacker.id, from: attacker.pos, pos: blocker.pos });
    return reveal(setUnit(shot, attacked), blocker.id);
  }

  const adjacent = distance(attacker.pos, target.pos) === 1;
  const behind = hitsFromBehind(attacker, target);
  const declared = emit(state, {
    type: 'attack',
    unitId: attacker.id,
    targetId: target.id,
    from: attacker.pos,
    to: target.pos,
    behind,
  });
  let next = dealDamage(setUnit(declared, attacked), target.id, attackDamage(state, attacker, target), attacker.owner, 'attack');
  const survivor = next.units[target.id];

  if (!survivor) {
    if (target.kind === 'monster') next = onMonsterDestroyed(next, attacker, adjacent, target.pos);
    // « Quand il détruit une unité » (Jeune Gomuscu) : monstre ou terrain, avant l'avancée.
    const onKill = getMonsterCard(attacker.cardId).onKill;
    if (onKill) next = applyTriggeredEffects(next, onKill, attacker.id, attacked);
    if (action.advance) {
      // Avancée gratuite, dans le sens de l'attaque ; la case libérée peut cacher un piège.
      next = emit(next, { type: 'step', unitId: attacker.id, from: attacker.pos, to: target.pos, kind: 'advance' });
      // L'attaquant tel qu'il est maintenant (ses bonus de destruction compris).
      const current = next.units[attacker.id];
      const mover = current?.kind === 'monster' ? current : attacked;
      next = setUnit(next, { ...mover, pos: target.pos, facing: directionBetween(attacker.pos, target.pos) });
      next = enterCell(next, attacker.id).state;
    }
    return next;
  }

  // La cible survit : marques de l'attaquant, puis riposte éventuelle.
  // Statuts posés par l'attaque (« à l'attaque », §5.6) : burn pour Brûlure, slow pour Givre.
  const brulure = getKeyword(attacker, 'brulure');
  if (brulure) next = addStatus(next, target.id, { kind: 'burn', amount: brulure.amount, turns: brulure.turns });
  const givre = getKeyword(attacker, 'givre');
  if (givre) next = addStatus(next, target.id, { kind: 'slow', amount: givre.amount, turns: givre.turns });
  const defender = next.units[target.id];
  if (
    defender?.kind === 'monster' &&
    hasKeyword(defender, 'riposte') &&
    !defender.hasRiposted &&
    !isStunned(defender) &&
    adjacent
  ) {
    next = emit(next, { type: 'riposte', unitId: defender.id, targetId: attacker.id, from: defender.pos, to: attacker.pos });
    next = setUnit(next, { ...defender, hasRiposted: true });
    next = dealDamage(next, attacker.id, getAtk(next, defender), defender.owner, 'riposte');
  }
  return next;
}

/** Première unité entre `from` et `to` (alignés), exclus : sur l'état réel, c'est un monstre invisible pour le tireur. */
function getShotBlocker(state: GameState, from: Position, to: Position): Unit | undefined {
  const d = distance(from, to);
  const step = { row: Math.sign(to.row - from.row), col: Math.sign(to.col - from.col) };
  for (let i = 1; i < d; i++) {
    const unit = getUnitsAt(state, { row: from.row + step.row * i, col: from.col + step.col * i })[0];
    if (unit) return unit;
  }
  return undefined;
}

/** Bonus de l'attaquant qui détruit un monstre : `prime` toujours, `trophee` et `pillage` au contact seulement (§5.6). */
function onMonsterDestroyed(state: GameState, attacker: MonsterUnit, adjacent: boolean, pos: Position): GameState {
  let next = state;
  const prime = getKeyword(attacker, 'prime');
  if (prime) next = addVp(next, attacker.owner, prime.amount, pos);
  const trophee = getKeyword(attacker, 'trophee');
  if (adjacent && trophee) next = addVp(next, attacker.owner, trophee.amount, pos);
  const pillage = getKeyword(attacker, 'pillage');
  if (adjacent && pillage) next = addMana(next, attacker.owner, pillage.amount, pos);
  return next;
}
