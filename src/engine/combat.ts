// Attaque (SPEC.md §4.7), avec les mots-clés `riposte`, `prime` (§5) et ceux des decks archer et piège (§6 bis).
import { DIRECTION_OFFSETS, directionBetween, distance, getCell, getCliff, isDiagonalOpen, isInSquare } from './board';
import { getMonsterCard } from './cards';
import { dealDamage } from './damage';
import { IllegalActionError } from './errors';
import { emit } from './events';
import { addMana, addVp } from './players';
import { addStatus, canMove, isStunned } from './statuses';
import { perceived, reveal } from './stealth';
import { enterCell } from './traps';
import { applyTriggeredEffects } from './effects';
import { canAttack, getActiveMonster, getAtk, getKeyword, getMonsters, getRange, getUnitsAt, hasKeyword, setUnit } from './units';
import type { Action, BoardState, GameState, MonsterUnit, PlayerId, Position, StatusSpec, Unit } from './types';

type AttackAction = Extract<Action, { type: 'attack' }>;

/**
 * Un pas du tir, de `previous` à sa voisine `pos` : la case se vise (`open`), le tir passe par-dessus sans s'y arrêter
 * (`over` : case X basse, portée 2 ou plus) ou s'arrête avant (`stop` : hors plateau, case X ordinaire ou haute, falaise
 * qu'il ne franchit pas). Une falaise coupe le tir, sauf celle de la Scierie pour une portée de 2 ou plus (§10).
 */
function shotStep(state: BoardState, previous: Position, pos: Position, range: number): 'open' | 'over' | 'stop' {
  const cliff = getCliff(state.board, previous, pos);
  if (cliff && !(cliff.rangedShotsPass && range >= 2)) return 'stop';
  const cell = getCell(state.board, pos);
  if (cell.kind === 'plain') return 'open';
  return cell.kind === 'blocked' && cell.height === 'low' && range >= 2 ? 'over' : 'stop';
}

/**
 * Une case que seules des unités alliées de `owner` occupent, monstres et terrains : elles ne gênent pas le tir (§4.7,
 * §10). Une unité ennemie, monstre ou terrain, l'arrête.
 */
function isAllyTransparent(units: readonly Unit[], owner: PlayerId | undefined): boolean {
  return owner !== undefined && units.length > 0 && units.every((unit) => unit.owner === owner);
}

/**
 * Ligne de vue depuis `from` : dans chaque direction orthogonale, la première case occupée à `range`
 * cases au plus. Les cases traversées doivent être vides, ou n'avoir que des unités alliées de `owner` (monstres et
 * terrains : elles ne gênent pas le tir) ; le tir s'arrête avant une case X, sauf une X basse pour une
 * portée de 2 ou plus, et avant une falaise qu'il ne franchit pas (`shotStep`).
 */
export function getLineOfSightCells(state: BoardState, from: Position, range: number, owner?: PlayerId): Position[] {
  const cells: Position[] = [];
  for (const step of Object.values(DIRECTION_OFFSETS)) {
    for (let d = 1; d <= range; d++) {
      const previous = { row: from.row + step.row * (d - 1), col: from.col + step.col * (d - 1) };
      const pos = { row: from.row + step.row * d, col: from.col + step.col * d };
      const shot = shotStep(state, previous, pos, range);
      if (shot === 'stop') break;
      if (shot === 'over') continue;
      const units = getUnitsAt(state, pos);
      if (units.length > 0) {
        if (isAllyTransparent(units, owner)) continue;
        cells.push(pos);
        break;
      }
    }
  }
  return cells;
}

/** Les 4 diagonales : un pas change la ligne et la colonne de 1. */
const DIAGONAL_STEPS = [
  { row: -1, col: -1 },
  { row: -1, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 1 },
] as const;

/**
 * Attaque en diagonale (§4.7, §10) : une case de diagonale compte pour 2 de portée (distance orthogonale), donc un
 * monstre frappe en diagonale jusqu'à `range ÷ 2` cases (portée 2-3 : 1 case, 4-5 : 2, 6 : 3). Chaque pas doit être dans le
 * carré de 1 de la case d'avant au sens du §10 (jouable, un chemin en L sans falaise ni case X ; les monstres et terrains du
 * coin ne gênent pas) et les cases traversées doivent être vides : la première occupée arrête le tir, comme en ligne.
 * Ce n'est pas un contact : ni riposte, ni avancée, ni bonus de dos.
 */
export function getDiagonalCells(state: BoardState, from: Position, range: number, owner?: PlayerId): Position[] {
  const steps = Math.floor(range / 2);
  const cells: Position[] = [];
  for (const step of DIAGONAL_STEPS) {
    let previous = from;
    for (let k = 1; k <= steps; k++) {
      const pos = { row: previous.row + step.row, col: previous.col + step.col };
      if (!isDiagonalOpen(state.board, previous, pos)) break;
      const units = getUnitsAt(state, pos);
      if (isAllyTransparent(units, owner)) {
        previous = pos; // Un allié sur la diagonale ne gêne pas, mais on ne le vise pas.
        continue;
      }
      cells.push(pos);
      if (units.length > 0) break;
      previous = pos;
    }
  }
  return cells;
}

/**
 * Cases qu'un monstre de portée `range` peut frapper depuis `from` : dans chaque direction, les cases traversées par
 * son tir, jusqu'à la première occupée comprise (mêmes règles que la ligne de vue), et la diagonale. Sert à montrer la
 * menace adverse.
 */
export function getStrikeCells(state: BoardState, from: Position, range: number, owner?: PlayerId): Position[] {
  return [...getLineCells(state, from, range, owner), ...getDiagonalCells(state, from, range, owner)];
}

/**
 * Les mêmes cases, en ligne droite orthogonale seulement : la portée d'un effet « en ligne » (sans diagonale), pour
 * l'afficher.
 */
export function getLineCells(state: BoardState, from: Position, range: number, owner?: PlayerId): Position[] {
  const cells: Position[] = [];
  for (const step of Object.values(DIRECTION_OFFSETS)) {
    for (let d = 1; d <= range; d++) {
      const previous = { row: from.row + step.row * (d - 1), col: from.col + step.col * (d - 1) };
      const pos = { row: from.row + step.row * d, col: from.col + step.col * d };
      const shot = shotStep(state, previous, pos, range);
      if (shot === 'stop') break;
      if (shot === 'over') continue;
      const units = getUnitsAt(state, pos);
      cells.push(pos);
      if (units.length > 0 && !isAllyTransparent(units, owner)) break;
    }
  }
  return cells;
}

/**
 * Unités que `attacker` peut attaquer ce tour : les unités ennemies en ligne de vue, à portée.
 * Sur une case avec un monstre et un terrain, seul le monstre est attaquable.
 */
export function getAttackTargets(state: GameState, attacker: MonsterUnit): Unit[] {
  if (!canAttack(state, attacker)) return [];
  const range = getRange(state, attacker);
  const cells = [
    ...getLineOfSightCells(state, attacker.pos, range, attacker.owner),
    ...getDiagonalCells(state, attacker.pos, range, attacker.owner).filter((pos) => getUnitsAt(state, pos).length > 0),
  ];
  // `no_cac` (Trébuchet des archers) : jamais une cible au contact (1 case en ligne droite) ; la diagonale n'en est pas un.
  const noContact = getMonsterCard(attacker.cardId).noContact === true;
  return cells.flatMap((pos) => {
    if (noContact && distance(attacker.pos, pos) === 1) return [];
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
  return withCarapace(target, rawAttackDamage(state, attacker, target));
}

function rawAttackDamage(state: BoardState, attacker: MonsterUnit, target: Unit): number {
  const base = getAtk(state, attacker);
  if (target.kind === 'terrain') return base * (getKeyword(attacker, 'siege')?.multiplier ?? 1);
  if (!hitsFromBehind(attacker, target)) return base;
  const atk = base + (getKeyword(attacker, 'sournois')?.amount ?? 0);
  return atk * (getKeyword(attacker, 'assassin')?.multiplier ?? 1);
}

/** Carapace (Tibo) : une attaque ou une riposte contre un monstre qui l'a n'inflige que 1 PV (§10). */
function withCarapace(target: Unit, damage: number): number {
  return target.kind === 'monster' && target.statuses.some((s) => s.kind === 'carapace') ? Math.min(damage, 1) : damage;
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
 * Avancée : l'attaquant était au contact, l'attaque détruit la cible, et la case libérée peut être
 * occupée (il n'y reste pas de terrain ennemi, SPEC.md §4.9).
 */
export function canAdvance(state: BoardState, attacker: MonsterUnit, target: Unit): boolean {
  return (
    canMove(attacker) &&
    distance(attacker.pos, target.pos) === 1 &&
    target.hp <= attackDamage(state, attacker, target) &&
    getUnitsAt(state, target.pos).every((u) => u.id === target.id)
  );
}

/** Ce que ferait une attaque, sans la résoudre (bulle d'action, handoff V10 lot 11). */
export interface AttackPreview {
  readonly damage: number;
  /** Frappe par derrière (`assassin`, `sournois`). */
  readonly behind: boolean;
  /** PV de la cible avant et après l'attaque (0 si elle est détruite). */
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly destroys: boolean;
  /** Statuts posés si elle survit (`brulure`, `givre`). */
  readonly statuses: readonly StatusSpec[];
  /** PV que l'attaquant récupère avec `soif` (0 sans, ou s'il a tous ses PV). */
  readonly heal: number;
  /** Dégâts de la riposte que l'attaquant subira (0 sans riposte) et ses PV après (soin de `soif` compris). */
  readonly riposte: number;
  readonly attackerHpAfter: number;
  /** Il peut prendre la case libérée (§4.7). */
  readonly canAdvance: boolean;
}

/**
 * Aperçu d'une attaque sur ce que voit l'attaquant : dégâts, prise de dos, destruction, statuts posés, riposte.
 * Un monstre invisible sur la ligne de tir (qui arrêterait le tir) n'est pas connu, donc pas compté.
 */
export function previewAttack(state: BoardState, attacker: MonsterUnit, target: Unit): AttackPreview {
  const damage = attackDamage(state, attacker, target);
  const hpAfter = Math.max(0, target.hp - damage);
  const destroys = hpAfter === 0;
  const statuses: StatusSpec[] = [];
  const brulure = getKeyword(attacker, 'brulure');
  const givre = getKeyword(attacker, 'givre');
  if (!destroys && target.kind === 'monster') {
    if (brulure) statuses.push({ kind: 'burn', amount: brulure.amount, turns: brulure.turns });
    if (givre) statuses.push({ kind: 'slow', amount: givre.amount, turns: givre.turns });
  }
  const ripostes =
    !destroys &&
    target.kind === 'monster' &&
    hasKeyword(target, 'riposte') &&
    !target.hasRiposted &&
    !isStunned(target) &&
    distance(attacker.pos, target.pos) === 1;
  const riposte = ripostes ? withCarapace(attacker, getAtk(state, target)) : 0;
  const heal = soifHeal(attacker);
  return {
    damage,
    behind: hitsFromBehind(attacker, target),
    hpBefore: target.hp,
    hpAfter,
    destroys,
    statuses,
    heal,
    riposte,
    attackerHpAfter: Math.max(0, attacker.hp + heal - riposte),
    canAdvance: canAdvance(state, attacker, target),
  };
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
  if (!canAttack(state, attacker)) throw new IllegalActionError(`${attacker.id} ne peut plus attaquer ce tour`);
  const seen = perceived(state);
  const target = getAttackTargets(seen, attacker).find((t) => t.id === action.targetId);
  if (!target) throw new IllegalActionError(`${attacker.id} ne peut pas attaquer ${action.targetId}`);
  if (action.advance && !canAdvance(seen, attacker, target)) {
    throw new IllegalActionError(`Avancée impossible pour ${attacker.id} sur ${target.id}`);
  }

  // Armé : l'attaque consomme son bonus (l'ATK et la zone sont lus sur `attacker`, avant ce retrait).
  const { armed, ...unarmed } = attacker;
  const attacked: MonsterUnit = { ...unarmed, hasAttacked: true, attacksMade: attacker.attacksMade + 1 };
  // Un monstre invisible sur la ligne de tir l'arrête : l'attaque est utilisée, sans dégâts, et il se révèle (§10).
  const blocker = getShotBlocker(state, attacker.pos, target.pos, attacker.owner);
  if (blocker) {
    const shot = emit(state, { type: 'shotBlocked', unitId: attacker.id, from: attacker.pos, pos: blocker.pos });
    return reveal(setUnit(shot, attacked), blocker.id);
  }

  const inContact = distance(attacker.pos, target.pos) === 1;
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
  // Armé (Flèche explosive) : 1 dégât aux ennemis du carré de 1 de la cible, cible exclue, que celle-ci survive ou non.
  if (armed && armed.splash > 0) next = splashDamage(next, attacker, target, armed.splash);
  // Soif (Vampire) : il récupère ses PV après les dégâts, avant la riposte et l'avancée, même si la cible est détruite (§10).
  const soif = getKeyword(attacker, 'soif');
  if (soif) next = applyTriggeredEffects(next, [{ type: 'heal', amount: soif.amount }], attacker.id, attacked);
  const survivor = next.units[target.id];

  if (!survivor) {
    if (target.kind === 'monster') next = onMonsterDestroyed(next, attacker, inContact, target.pos);
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
      next = enterCell(next, attacker.id, undefined, attacker.pos).state;
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
    inContact
  ) {
    next = emit(next, { type: 'riposte', unitId: defender.id, targetId: attacker.id, from: defender.pos, to: attacker.pos });
    next = setUnit(next, { ...defender, hasRiposted: true });
    next = dealDamage(next, attacker.id, getAtk(next, defender), defender.owner, 'riposte');
  }
  return next;
}

/**
 * Éclats d'une attaque armée (Flèche explosive) : `amount` dégâts d'effet à chaque monstre ennemi (invisibles compris) dans
 * le carré de 1 de la case de la cible (la cible n'en fait pas partie : elle subit déjà l'attaque). Falaises et cases X
 * coupent la zone ; un monstre détruit rapporte son VP.
 */
function splashDamage(state: GameState, attacker: MonsterUnit, target: Unit, amount: number): GameState {
  // Les ennemis invisibles sont touchés aussi : être caché ne protège de rien (§5.3, 2026-11-08).
  const hit = Object.values(state.units).filter(
    (unit) => unit.kind === 'monster' && unit.owner !== attacker.owner && unit.id !== target.id && isInSquare(state.board, target.pos, unit.pos),
  );
  return hit.reduce((next, unit) => (next.units[unit.id] ? dealDamage(next, unit.id, amount, attacker.owner, 'effect') : next), state);
}

/** PV que l'attaquant récupérera avec `soif`, sans dépasser ses PV max. */
function soifHeal(attacker: MonsterUnit): number {
  return Math.min(getKeyword(attacker, 'soif')?.amount ?? 0, attacker.maxHp - attacker.hp);
}

/**
 * Première unité entre `from` et `to` (alignés), exclus, qui arrête le tir : sur l'état réel, c'est un monstre invisible
 * pour le tireur (ses alliés ne gênent pas).
 */
function getShotBlocker(state: GameState, from: Position, to: Position, owner: PlayerId): Unit | undefined {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const diagonal = dr !== 0 && dc !== 0;
  if (diagonal && Math.abs(dr) !== Math.abs(dc)) return undefined;
  const d = diagonal ? Math.abs(dr) : distance(from, to);
  const step = { row: Math.sign(dr), col: Math.sign(dc) };
  for (let i = 1; i < d; i++) {
    const units = getUnitsAt(state, { row: from.row + step.row * i, col: from.col + step.col * i });
    if (units.length > 0 && !isAllyTransparent(units, owner)) return units[0];
  }
  return undefined;
}

/** Bonus de l'attaquant qui détruit un monstre : `prime` toujours, `trophee` et `pillage` au contact seulement (§5.6). */
function onMonsterDestroyed(state: GameState, attacker: MonsterUnit, inContact: boolean, pos: Position): GameState {
  let next = state;
  const prime = getKeyword(attacker, 'prime');
  if (prime) next = addVp(next, attacker.owner, prime.amount, pos);
  const trophee = getKeyword(attacker, 'trophee');
  if (inContact && trophee) next = addVp(next, attacker.owner, trophee.amount, pos);
  const pillage = getKeyword(attacker, 'pillage');
  if (inContact && pillage) next = addMana(next, attacker.owner, pillage.amount, pos);
  return next;
}
