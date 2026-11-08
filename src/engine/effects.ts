// Effets des cartes (SPEC.md §5.2 à §5.4) : ciblage et résolution, communs aux sorts et aux effets actifs.
// Un effet complet (`Ability`) vise un monstre, une zone, une case ou sa source, puis applique ses effets dans l'ordre.
// Invocation et téléportation demandent un second choix : le monstre à invoquer, la case où poser le monstre.
import { DIRECTION_OFFSETS, DIRECTIONS, squareCells, distance, hasCliff, isInSquare, isPlayable, samePos } from './board';
import { getLineOfSightCells } from './combat';
import { dealDamage } from './damage';
import { emit } from './events';
import { isShinyCopy, opponent, shine, takeFromGrimoire } from './players';
import { addStatus, canMove, statusExpiry } from './statuses';
import { perceived, perceivedBy, reveal } from './stealth';
import { NEW_MOVEMENT, enterCell, rewindMonster } from './traps';
import { getCard, getMonsterCard } from './cards';
import { payCard, placeSummonedMonster } from './summon';
import { addUnit, canAttack, createMonsterUnit, getMonsterAt, getMonsters, getUnitsAt, removeUnit, setUnit } from './units';
import type {
  EffectSource,
  TurnBonus,
  Ability,
  AreaZone,
  BoardState,
  BurningCell,
  CardId,
  Direction,
  Effect,
  EffectTarget,
  Archetype,
  GameState,
  MonsterUnit,
  PlayerId,
  Position,
  Targeting,
  Trap,
  UnitId,
} from './types';

type PushEffect = Extract<Effect, { type: 'push' }>;

function requireSource(source: MonsterUnit | null): MonsterUnit {
  if (!source) throw new Error('Cette portée se mesure depuis un monstre source : un sort ne peut pas l’utiliser');
  return source;
}

/** Les monstres de `player` d'une famille. */
function alliesOf(state: BoardState, player: PlayerId, archetype: Archetype): MonsterUnit[] {
  return getMonsters(state, player).filter((m) => getMonsterCard(m.cardId).archetype === archetype);
}

/** Monstres que peut viser un effet de `player` ; `source` est le monstre qui active l'effet (`null` pour un sort). */
function getTargetableMonsters(
  state: GameState,
  targeting: Extract<Targeting, { type: 'monster' }>,
  player: PlayerId,
  source: MonsterUnit | null,
): MonsterUnit[] {
  // Une famille, s'il y en a une (« un allié bodybuilder »).
  const candidates = getMonsters(state, targeting.side === 'ally' ? player : opponent(player)).filter(
    (m) => !targeting.archetype || getMonsterCard(m.cardId).archetype === targeting.archetype,
  );
  const { reach } = targeting;
  switch (reach.type) {
    case 'anywhere':
      return candidates;
    case 'nearOwnMonster': {
      const own = getMonsters(state, player);
      return candidates.filter((m) => own.some((o) => distance(o.pos, m.pos) <= reach.steps));
    }
    case 'square1': {
      // Les 8 cases autour ; aucune falaise ne se franchit, même celle de la Scierie (§10).
      const from = requireSource(source).pos;
      return candidates.filter((m) => isInSquare(state.board, from, m.pos));
    }
    case 'line': {
      const cells = getLineOfSightCells(state, requireSource(source).pos, reach.range, requireSource(source).owner);
      return candidates.filter((m) => cells.some((pos) => samePos(pos, m.pos)));
    }
  }
}

/**
 * Case d'arrivée d'un monstre reculé de `pushDistance` cases au plus dans `direction`. Il s'arrête avant
 * une falaise, une case X, hors plateau, avec un monstre ou avec un terrain adverse ; un terrain de son camp ne l'arrête pas (§10).
 */
export function getPushDestination(
  state: BoardState,
  monster: MonsterUnit,
  direction: Direction,
  pushDistance: number,
): Position {
  const step = DIRECTION_OFFSETS[direction];
  let pos = monster.pos;
  for (let i = 0; i < pushDistance; i++) {
    const next = { row: pos.row + step.row, col: pos.col + step.col };
    const blocked =
      !isPlayable(state.board, next) ||
      hasCliff(state.board, pos, next) ||
      getUnitsAt(state, next).some((unit) => unit.kind === 'monster' || unit.owner !== monster.owner);
    if (blocked) break;
    pos = next;
  }
  return pos;
}

/** Longueur de la zone `line3`. */
const LINE_LENGTH = 3;

/**
 * Cases d'une zone autour de la source (§5.3, §10), à partir du carré de 1 (les 8 autour, voir `squareCells`
 * pour les falaises et les cases X). `front3` : la case devant elle (dans le sens où elle regarde) et ses deux voisines
 * de côté ; `square1` : le carré de 1 (les 8) ; `square2` : le carré de 2 ; `line3` :
 * les 3 cases en ligne dans le sens où elle regarde, jusqu'à la première falaise ou case X.
 */
export function getAreaCells(state: BoardState, source: MonsterUnit, zone: AreaZone): Position[] {
  const around = squareCells(state.board, source.pos);
  if (zone === 'square1') return around;
  if (zone === 'square2') {
    const cells = [...around];
    for (const pos of around) {
      for (const next of squareCells(state.board, pos)) {
        if (!samePos(next, source.pos) && !cells.some((cell) => samePos(cell, next))) cells.push(next);
      }
    }
    return cells;
  }
  const step = DIRECTION_OFFSETS[source.facing];
  if (zone === 'line3') {
    const line: Position[] = [];
    let pos = source.pos;
    for (let i = 0; i < LINE_LENGTH; i++) {
      const next = { row: pos.row + step.row, col: pos.col + step.col };
      // Une case en ligne droite est dans le carré de 1 si elle est jouable et sans falaise entre les deux.
      if (!squareCells(state.board, pos).some((cell) => samePos(cell, next))) break;
      line.push(next);
      pos = next;
    }
    return line;
  }
  const front = { row: source.pos.row + step.row, col: source.pos.col + step.col };
  const row = [front, ...[1, -1].map((s) => ({ row: front.row + step.col * s, col: front.col + step.row * s }))];
  return row.filter((pos) => around.some((cell) => samePos(cell, pos)));
}

/** Monstres ennemis de `player` dans une zone autour de la source (jamais un terrain, §10). */
export function getAreaTargets(state: BoardState, zone: AreaZone, player: PlayerId, source: MonsterUnit): MonsterUnit[] {
  return getAreaCells(state, source, zone).flatMap((pos) => {
    const monster = getMonsterAt(state, pos);
    return monster && monster.owner !== player ? [monster] : [];
  });
}

/** Cases libres du carré de 1 de la source (§5.3) : les 8 autour (voir `squareCells`), sans aucune unité. */
export function getEmptySquareCells(state: BoardState, source: MonsterUnit): Position[] {
  return squareCells(state.board, source.pos).filter((pos) => getUnitsAt(state, pos).length === 0);
}

/** Cases où `source` peut poser un piège : libres du carré de 1, sans piège à lui. */
export function getTrapCells(state: GameState, source: MonsterUnit): Position[] {
  return getEmptySquareCells(state, source).filter(
    // Seuls ses propres pièges comptent : ceux de l'adversaire sont cachés, rien ne doit les trahir.
    (pos) => !state.traps.some((trap) => trap.owner === source.owner && samePos(trap.pos, pos)),
  );
}

/** Cases que `source` peut brûler (Lutin brasier) : dans la zone, jouables, sans unité ni case déjà brûlée (§10). */
export function getBurnableCells(state: GameState, source: MonsterUnit, zone: AreaZone): Position[] {
  return getAreaCells(state, source, zone).filter(
    (pos) => getUnitsAt(state, pos).length === 0 && !state.burningCells.some((cell) => samePos(cell.pos, pos)),
  );
}

/**
 * Invocation (Invocateur) : une cible par case libre du carré de 1 et par monstre de son grimoire qu'il peut payer, en plus
 * du coût de l'effet (§5.4).
 */
function getSummonTargets(state: GameState, ability: Ability, player: PlayerId, source: MonsterUnit): EffectTarget[] {
  const effectCost = 'manaCost' in ability && typeof ability.manaCost === 'number' ? ability.manaCost : 0;
  const budget = state.players[player].mana - effectCost;
  const cards = [...new Set(state.players[player].grimoire)].filter((id) => {
    const card = getCard(id);
    return card.kind === 'monster' && card.cost <= budget;
  });
  return getEmptySquareCells(state, source).flatMap((pos) =>
    cards.map((cardId): EffectTarget => ({ kind: 'cellAndCard', pos, cardId })),
  );
}

/**
 * Cases où la source peut revenir (retour) : celles de son chemin du tour, sa case de départ comprise, sauf sa case
 * actuelle ; libres (sans monstre, ni terrain adverse) et jouables.
 */
export function getTrailCells(state: BoardState, source: MonsterUnit): Position[] {
  const cells = new Map<string, Position>();
  for (const pos of source.trail) {
    if (samePos(pos, source.pos) || !isPlayable(state.board, pos)) continue;
    const free = getUnitsAt(state, pos).every((unit) => unit.kind === 'terrain' && unit.owner === source.owner);
    if (free) cells.set(`${pos.row},${pos.col}`, pos);
  }
  return [...cells.values()];
}

/**
 * Brûlure en chaîne : pour chaque unité alliée de `player` (monstre ou terrain), les monstres ennemis qu'il voit sur ses
 * 8 cases de son carré de 1 (§10). Un ennemi à côté de plusieurs unités alliées y est autant de fois.
 */
export function getEnemiesNearAllies(state: GameState, player: PlayerId): MonsterUnit[] {
  const seen = perceivedBy(state, player);
  const enemies = getMonsters(seen, opponent(player));
  return Object.values(state.units)
    .filter((ally) => ally.owner === player)
    .flatMap((ally) => squareCells(state.board, ally.pos).flatMap((pos) => enemies.filter((enemy) => samePos(enemy.pos, pos))));
}

/** Le recul de l'effet, s'il en a un. */
function findPush(effects: readonly Effect[]): PushEffect | undefined {
  return effects.find((effect): effect is PushEffect => effect.type === 'push');
}

/** PV que garde la cible d'un « tous ses PV sauf N » (Zoldik, Sacrifice sanguinaire) ; `null` sans cet effet. */
function hpFloor(effects: readonly Effect[]): number | null {
  for (const effect of effects) {
    if (effect.type === 'loseHp' || (effect.type === 'absorb' && 'downTo' in effect)) return effect.downTo;
  }
  return null;
}

/**
 * Toutes les cibles possibles d'un effet de `player`. Un recul « direction au choix » donne une cible par direction utile ;
 * un recul « de 1 à N au choix » sur une zone, une cible par distance.
 */
export function getEffectTargets(
  state: GameState,
  ability: Ability,
  player: PlayerId,
  source: MonsterUnit | null,
): EffectTarget[] {
  const { targeting, effects } = ability;
  switch (targeting.type) {
    case 'emptySquareCell':
      if (effects.some((effect) => effect.type === 'summon')) return getSummonTargets(state, ability, player, requireSource(source));
      return getTrapCells(state, requireSource(source)).map((pos): EffectTarget => ({ kind: 'cell', pos }));
    case 'emptyCell':
      return getBurnableCells(state, requireSource(source), targeting.zone).map((pos): EffectTarget => ({ kind: 'cell', pos }));
    case 'allies':
      // Pénombre : tous ses monstres de la famille, s'il en a au moins un.
      return alliesOf(state, player, targeting.archetype).length > 0 ? [{ kind: 'all' }] : [];
    case 'enemies':
      // Piège temporel : tous les monstres ennemis qu'il voit, s'il y en a au moins un.
      return getMonsters(state, opponent(player)).length > 0 ? [{ kind: 'all' }] : [];
    case 'enemiesNearAllies':
      return getEnemiesNearAllies(state, player).length > 0 ? [{ kind: 'all' }] : [];
    case 'trail':
      return getTrailCells(state, requireSource(source)).map((pos): EffectTarget => ({ kind: 'cell', pos }));
    case 'self':
      // Évolution : un choix de carte ; sinon (Dopage), la source elle-même.
      if (effects.some((effect) => effect.type === 'evolve')) return getEvolveTargets(state, player, requireSource(source));
      // Armer (Flèche explosive, Carreau perforant) : un seul effet armé à la fois, et seulement s'il lui reste une attaque.
      if (effects.some((effect) => effect.type === 'arm')) {
        const self = requireSource(source);
        return self.armed || !canAttack(state, self) ? [] : [{ kind: 'unit', unitId: self.id }];
      }
      return [{ kind: 'unit', unitId: requireSource(source).id }];
    case 'zone': {
      // Jouable s'il touche au moins un ennemi ; en ligne, dans chaque direction où il en touche un.
      const from = requireSource(source);
      const directions: (Direction | undefined)[] = targeting.zone === 'line3' ? [...DIRECTIONS] : [undefined];
      const push = findPush(effects);
      const distances = push?.chooseDistance ? Array.from({ length: push.distance }, (_, i) => i + 1) : [undefined];
      return directions
        .filter((d) => getAreaTargets(state, targeting.zone, player, d ? { ...from, facing: d } : from).length > 0)
        .flatMap((direction) =>
          distances.map((distance): EffectTarget => ({
            kind: 'area',
            ...(direction ? { direction } : {}),
            ...(distance ? { distance } : {}),
          })),
        );
    }
    case 'monster': {
      const floor = hpFloor(effects);
      const monsters = getTargetableMonsters(state, targeting, player, source).filter(
        // On ne soigne pas un monstre qui a déjà tous ses PV (§10) ; « tous ses PV sauf N » vise un monstre qui en a plus.
        (m) => (!effects.every((effect) => effect.type === 'heal') || m.hp < m.maxHp) && (floor === null || m.hp > floor),
      );
      // Téléportation : un allié autre que la source, puis une case libre du carré de 1 de la source (§5.4).
      if (effects.some((effect) => effect.type === 'teleport')) {
        const from = requireSource(source);
        const cells = getEmptySquareCells(state, from);
        return monsters
          .filter((m) => m.id !== from.id)
          .flatMap((m) => cells.map((pos): EffectTarget => ({ kind: 'unitAndCell', unitId: m.id, pos })));
      }
      const push = findPush(effects);
      if (push?.direction !== 'chosen') return monsters.map((m): EffectTarget => ({ kind: 'unit', unitId: m.id }));
      // Seulement dans une direction où le monstre recule d'au moins une case (§10).
      return monsters.flatMap((m) =>
        DIRECTIONS.filter((d) => !samePos(getPushDestination(state, m, d, push.distance), m.pos)).map(
          (direction): EffectTarget => ({ kind: 'unitAndDirection', unitId: m.id, direction }),
        ),
      );
    }
  }
}

export function sameEffectTarget(a: EffectTarget, b: EffectTarget): boolean {
  if (a.kind === 'cellAndCard' || b.kind === 'cellAndCard') {
    return a.kind === 'cellAndCard' && b.kind === 'cellAndCard' && samePos(a.pos, b.pos) && a.cardId === b.cardId;
  }
  if (a.kind === 'unitAndCell' || b.kind === 'unitAndCell') {
    return a.kind === 'unitAndCell' && b.kind === 'unitAndCell' && samePos(a.pos, b.pos) && a.unitId === b.unitId;
  }
  if (a.kind === 'cell' || b.kind === 'cell') {
    return a.kind === 'cell' && b.kind === 'cell' && samePos(a.pos, b.pos);
  }
  if (a.kind === 'area' || b.kind === 'area') {
    return a.kind === 'area' && b.kind === 'area' && (a.distance ?? 0) === (b.distance ?? 0) && a.direction === b.direction;
  }
  if (a.kind === 'card' || b.kind === 'card') return a.kind === 'card' && b.kind === 'card' && a.cardId === b.cardId;
  if (a.kind === 'all' || b.kind === 'all') return a.kind === b.kind;
  const direction = (t: EffectTarget) => (t.kind === 'unitAndDirection' ? t.direction : null);
  return a.kind === b.kind && a.unitId === b.unitId && direction(a) === direction(b);
}

/** Ce qui accompagne l'application d'un effet à un monstre. */
interface EffectContext {
  /** Le joueur à qui revient une éventuelle destruction. */
  readonly by: PlayerId;
  /** Le monstre qui active l'effet (`null` pour un sort). */
  readonly source: MonsterUnit | null;
  /** Direction choisie pour un recul « direction au choix ». */
  readonly direction?: Direction;
  /** Distance choisie pour un recul « de 1 à N au choix ». */
  readonly distance?: number;
  /** Case choisie pour une téléportation. */
  readonly destination?: Position;
  /** D'où vient l'effet (carte, nom de l'effet) : gardé sur les bonus du tour. */
  readonly origin: EffectSource;
  /** PV perdus par l'effet précédent sur la même cible (« perd tous ses PV sauf N »), pour « +N ATK par PV perdu ». */
  readonly hpLost?: number;
}

/**
 * Contre-coup (SPEC §5.2) : `effects` appliqués au monstre source lui-même, après l'effet, que sa cible ait subi quelque
 * chose ou non. Sans effet s'il a quitté le plateau.
 */
export function applyBacklash(state: GameState, unitId: UnitId, effects: readonly Effect[], by: PlayerId): GameState {
  const source = state.units[unitId];
  if (source?.kind !== 'monster') return state;
  return applyEffects(state, effects, unitId, { by, source, origin: { cardId: source.cardId } });
}

/** Applique un effet complet à une cible déjà validée. */
export function resolveAbility(
  state: GameState,
  ability: Ability,
  target: EffectTarget,
  by: PlayerId,
  source: MonsterUnit | null,
  origin: EffectSource,
): GameState {
  const { targeting, effects } = ability;
  switch (targeting.type) {
    case 'emptySquareCell': {
      if (target.kind === 'cellAndCard') return resolveSummon(state, target, by);
      if (target.kind !== 'cell') throw new Error('Cet effet vise une case');
      let next = state;
      for (const effect of effects) {
        if (effect.type !== 'placeTrap') throw new Error('Sur une case, seul un piège se pose');
        const poster = requireSource(source);
        const trap: Trap = {
          owner: by,
          pos: target.pos,
          effects: effect.effects,
          cardId: poster.cardId,
          sourceId: poster.id,
          // Jusqu'au prochain tour de son poseur, ou au N-ième prochain (tours adverses, §10).
          expiresAtTurn: state.turn + 2 * (effect.turns ?? 1),
        };
        // « Un seul à la fois par monstre » : le précédent disparaît (sans VP, il n'a pas servi).
        const kept = effect.single ? next.traps.filter((old) => old.sourceId !== poster.id) : next.traps;
        next = { ...emit(next, { type: 'trapPlaced', trap }), traps: [...kept, trap] };
      }
      return next;
    }
    case 'emptyCell': {
      if (target.kind !== 'cell') throw new Error('Cet effet vise une case');
      let next = state;
      for (const effect of effects) {
        if (effect.type !== 'burnCell') throw new Error('Sur une case libre, seule une case brûlée se pose');
        // « Pendant N tours » : compté en tours du camp du lanceur (§5.5).
        const cell: BurningCell = {
          owner: by,
          pos: target.pos,
          effects: effect.effects,
          cardId: requireSource(source).cardId,
          expiresAtTurn: statusExpiry(effect.turns, state.turn, state.activePlayer, by),
        };
        next = { ...emit(next, { type: 'cellBurned', cell }), burningCells: [...next.burningCells, cell] };
      }
      return next;
    }
    case 'allies':
      // Ses monstres de la famille au moment où le sort est lancé ; ceux qui arrivent ensuite n'ont rien.
      return alliesOf(state, by, targeting.archetype).reduce((next, m) => applyEffects(next, effects, m.id, { by, source, origin }), state);
    case 'enemies':
      // Les monstres ennemis que voit le lanceur (jamais un monstre invisible pour lui), au moment du sort.
      return getMonsters(perceivedBy(state, by), opponent(by)).reduce((next, m) => applyEffects(next, effects, m.id, { by, source, origin }), state);
    case 'enemiesNearAllies':
      // Au moment du sort : un ennemi à côté de deux unités alliées subit les effets deux fois (ils se cumulent, §5 bis).
      return getEnemiesNearAllies(state, by).reduce((next, m) => applyEffects(next, effects, m.id, { by, source, origin }), state);
    case 'trail': {
      if (target.kind !== 'cell') throw new Error('Le retour vise une case');
      const from = requireSource(source);
      return applyEffects(state, effects, from.id, { by, source: from, destination: target.pos, origin });
    }
    case 'self':
      if (effects.some((effect) => effect.type === 'evolve')) return resolveEvolve(state, target, requireSource(source));
      return applyEffects(state, effects, requireSource(source).id, { by, source, origin });
    case 'zone': {
      // Chaque ennemi de la zone que le lanceur voit (jamais un monstre invisible pour lui) subit les effets, dans l'ordre.
      const from = requireSource(source);
      // Le plus éloigné de la source d'abord : sur une ligne, un recul ne bute pas sur l'ennemi suivant.
      const ids = getAreaTargets(perceivedBy(state, by), targeting.zone, by, from)
        .sort((a, b) => distance(b.pos, from.pos) - distance(a.pos, from.pos))
        .map((m) => m.id);
      const context: EffectContext = { by, source: from, distance: target.kind === 'area' ? target.distance : undefined, origin };
      return ids.reduce((next, id) => applyEffects(next, effects, id, context), state);
    }
    case 'monster': {
      if (target.kind !== 'unit' && target.kind !== 'unitAndDirection' && target.kind !== 'unitAndCell') {
        throw new Error('Cet effet vise un monstre');
      }
      const monster = state.units[target.unitId];
      if (monster?.kind !== 'monster') throw new Error(`Cible d'effet invalide : ${target.unitId}`);
      const direction = target.kind === 'unitAndDirection' ? target.direction : undefined;
      const destination = target.kind === 'unitAndCell' ? target.pos : undefined;
      return applyEffects(state, effects, monster.id, { by, source, direction, destination, origin });
    }
  }
}

/**
 * Les effets, dans l'ordre, sur le monstre `unitId` ; s'arrête s'il quitte le plateau. Les PV perdus par un « perd tous
 * ses PV sauf N » passent à l'effet suivant (Sacrifice sanguinaire).
 */
function applyEffects(state: GameState, effects: readonly Effect[], unitId: string, context: EffectContext): GameState {
  let next = state;
  let hpLost = 0;
  for (const effect of effects) {
    const monster = next.units[unitId];
    if (monster?.kind !== 'monster') break;
    next = applyEffect(next, effect, monster, { ...context, hpLost });
    if (effect.type === 'loseHp') hpLost = monster.hp - (next.units[unitId]?.hp ?? 0);
  }
  return next;
}

/** Rend `amount` PV à `monster`, sans dépasser ses PV max ; rien s'il les a tous. */
function heal(state: GameState, monster: MonsterUnit, amount: number): GameState {
  const hp = Math.min(monster.maxHp, monster.hp + amount);
  if (hp === monster.hp) return state;
  return setUnit(emit(state, { type: 'heal', unitId: monster.id, pos: monster.pos, amount: hp - monster.hp }), { ...monster, hp });
}

function applyEffect(state: GameState, effect: Effect, monster: MonsterUnit, context: EffectContext): GameState {
  const { id: unitId, pos } = monster;
  const cause = context.source ? 'effect' : 'spell';
  switch (effect.type) {
    case 'damage':
      return dealDamage(state, unitId, effect.amount, context.by, cause);
    case 'heal':
      return heal(state, monster, effect.amount);
    case 'absorb': {
      // Les PV retirés (jamais plus que ceux qu'il a) reviennent à la source, sans dépasser ses PV max (§10).
      const removed = 'downTo' in effect ? monster.hp - effect.downTo : Math.min(effect.amount, monster.hp);
      if (removed <= 0) return state;
      const hit = dealDamage(state, unitId, removed, context.by, cause);
      const drinker = hit.units[requireSource(context.source).id];
      return drinker?.kind === 'monster' ? heal(hit, drinker, removed) : hit;
    }
    case 'loseHp': {
      // Il tombe à `downTo` PV, sans être détruit ; ses PV max ne changent pas.
      const lost = monster.hp - effect.downTo;
      return lost > 0 ? dealDamage(state, unitId, lost, context.by, cause) : state;
    }
    case 'transform':
      return transform(state, monster, effect.into);
    case 'status': {
      // Absorbé : le monstre qui absorbe est la source de l'effet.
      const spec = effect.kind === 'absorbe' && !effect.by ? { ...effect, by: context.source?.id } : effect;
      return addStatus(state, unitId, spec);
    }
    case 'addMobility':
      return setUnit(emit(state, { type: 'mobility', unitId, pos, amount: effect.amount }), {
        ...monster,
        mobilityLeft: monster.mobilityLeft + effect.amount,
        boost: monster.boost + effect.amount,
        turnBonuses: addTurnBonus(monster, context.origin, { mobility: effect.amount }),
      });
    case 'addAtkThisTurn': {
      // « +N ATK par PV perdu » : N fois les PV que vient de perdre la cible (Sacrifice sanguinaire).
      const atk = effect.perHpLost ? effect.amount * (context.hpLost ?? 0) : effect.amount;
      return atk > 0 ? boost(state, monster, atk, context.origin) : state;
    }
    case 'arm':
      return setUnit(state, { ...monster, armed: { source: context.origin, atk: effect.atk ?? 0, splash: effect.splash ?? 0 } });
    case 'addRangeThisTurn':
      return setUnit(emit(state, { type: 'reach', unitId, pos, amount: effect.amount }), {
        ...monster,
        rangeBonus: monster.rangeBonus + effect.amount,
        turnBonuses: addTurnBonus(monster, context.origin, { range: effect.amount }),
      });
    case 'multiplyAtkThisTurn':
      // L'ATK du moment, bonus du tour compris (les auras s'ajoutent ensuite, sans être multipliées).
      return boost(state, monster, (monster.atk + monster.atkBonus) * (effect.multiplier - 1), context.origin);
    case 'addStats':
      return setUnit(emit(state, { type: 'buff', unitId, pos, atk: effect.atk, hp: effect.hp }), {
        ...monster,
        atk: monster.atk + effect.atk,
        hp: monster.hp + effect.hp,
        maxHp: monster.maxHp + effect.hp,
      });
    case 'push': {
      // Vers l'avant : le sens où regarde la source ; sinon la direction choisie par le joueur.
      const direction = effect.direction === 'forward' ? requireSource(context.source).facing : context.direction;
      if (!direction) throw new Error('Un recul demande une direction');
      const chosen = effect.chooseDistance && context.distance ? Math.min(context.distance, effect.distance) : effect.distance;
      return push(state, monster, direction, chosen);
    }
    case 'teleport': {
      // Pas un déplacement : il garde sa mobilité, son attaque et son orientation. Mais il entre sur sa nouvelle case :
      // piège, Passage, case brûlée et Zone s'y déclenchent (§10).
      const to = context.destination;
      if (!to) throw new Error('Une téléportation demande une case');
      const moved = setUnit(emit(state, { type: 'teleport', unitId, from: pos, to }), { ...monster, pos: to });
      return enterCell(moved, unitId, NEW_MOVEMENT, pos).state;
    }
    case 'returnOnTrail': {
      // Retour : une téléportation sur une case de son chemin du tour (ce qui est sur cette case se déclenche) ; il garde
      // son attaque et son orientation, mais ne se déplace plus ce tour. Son chemin s'arrête à cette case (ce qui suivait
      // est effacé).
      const to = context.destination;
      if (!to) throw new Error('Un retour demande une case');
      const index = monster.trail.findIndex((cell) => samePos(cell, to));
      const trail = index >= 0 ? monster.trail.slice(0, index + 1) : [...monster.trail, to];
      const moved = setUnit(emit(state, { type: 'rewind', unitId, from: pos, to }), { ...monster, pos: to, trail, mobilityLeft: 0, halted: true });
      return enterCell(moved, unitId, NEW_MOVEMENT, pos).state;
    }
    case 'rewind':
      return rewindMonster(state, unitId, effect.steps).state;
    case 'placeTrap':
    case 'burnCell':
    case 'evolve':
    case 'summon':
      throw new Error(`L'effet « ${effect.type} » ne s'applique pas à un monstre`);
  }
}

/**
 * Transformation (Emma, §10) : le même monstre, sur sa case, prend la forme `into` (stats, mots-clés, effets). Ses
 * bonus définitifs (Bénédiction) passent à la nouvelle forme. Chaque forme garde ses PV perdus : ceux de la forme
 * quittée sont mis de côté, ceux de la forme prise reviennent (la première fois, elle a tous ses PV). Mobilité : celle
 * de la nouvelle forme moins ce qu'il a déjà dépensé ce tour ; rien s'il ne peut plus se déplacer ce tour.
 */
function transform(state: GameState, monster: MonsterUnit, into: CardId): GameState {
  const from = getMonsterCard(monster.cardId);
  const to = getMonsterCard(into);
  const maxHp = to.hp + (monster.maxHp - from.hp);
  const hp = Math.max(1, maxHp - (monster.otherFormDamage ?? 0));
  // Ce qu'il lui reste à marcher, en comptant ce qu'il a dépensé au-delà de sa forme actuelle.
  const balance = monster.mobilityLeft - (monster.mobilityDebt ?? 0) + to.mobility - from.mobility;
  const mobility =
    monster.halted || !canMove(monster) ? { mobilityLeft: 0 } : { mobilityLeft: Math.max(0, balance), mobilityDebt: Math.max(0, -balance) };
  const unit: MonsterUnit = {
    ...monster,
    ...mobility,
    cardId: into,
    atk: to.atk + (monster.atk - from.atk),
    hp,
    maxHp,
    otherFormDamage: monster.maxHp - monster.hp,
  };
  const event = { type: 'transform', unitId: monster.id, pos: monster.pos, from: from.id, to: into, hp, maxHp } as const;
  return setUnit(emit(state, event), unit);
}

/** ATK en plus pour ce tour (remise à 0 au début du prochain tour). */
function boost(state: GameState, monster: MonsterUnit, atk: number, origin: EffectSource): GameState {
  const { id: unitId, pos } = monster;
  return setUnit(emit(state, { type: 'boost', unitId, pos, atk }), {
    ...monster,
    atkBonus: monster.atkBonus + atk,
    turnBonuses: addTurnBonus(monster, origin, { atk }),
  });
}

const sameSource = (a: EffectSource, b: EffectSource) => a.cardId === b.cardId && a.effect === b.effect;

/** Ajoute un bonus du tour à sa source : deux Flèches divines font une seule source, +2 ATK +2 portée. */
export function addTurnBonus(monster: MonsterUnit, source: EffectSource, bonus: Partial<Omit<TurnBonus, 'source'>>): readonly TurnBonus[] {
  const add = (from: TurnBonus): TurnBonus => ({
    source: from.source,
    atk: from.atk + (bonus.atk ?? 0),
    range: from.range + (bonus.range ?? 0),
    mobility: from.mobility + (bonus.mobility ?? 0),
  });
  const known = monster.turnBonuses.some((b) => sameSource(b.source, source));
  return known
    ? monster.turnBonuses.map((b) => (sameSource(b.source, source) ? add(b) : b))
    : [...monster.turnBonuses, add({ source, atk: 0, range: 0, mobility: 0 })];
}

/**
 * Effets déclenchés (« Quand il détruit », « Début de tour ») appliqués à un monstre, dans l'ordre ; `source` est le
 * monstre qui les porte. Un soin sur un monstre qui a tous ses PV ne fait rien.
 */
export function applyTriggeredEffects(state: GameState, effects: readonly Effect[], unitId: string, source: MonsterUnit): GameState {
  const target = state.units[unitId];
  const useful = effects.filter((effect) => effect.type !== 'heal' || (target !== undefined && target.hp < target.maxHp));
  return applyEffects(state, useful, unitId, { by: source.owner, source, origin: { cardId: source.cardId } });
}

/** Invocation (Invocateur) : le joueur paie aussi le coût du monstre, qui arrive sur la case et peut agir aussitôt. */
function resolveSummon(state: GameState, target: Extract<EffectTarget, { kind: 'cellAndCard' }>, by: PlayerId): GameState {
  const card = getCard(target.cardId);
  if (card.kind !== 'monster') throw new Error(`« ${target.cardId} » n'est pas un monstre`);
  const pos = { row: target.pos.row, col: target.pos.col };
  const shiny = isShinyCopy(state, by, card.id);
  const paid = payCard(emit(state, { type: 'cardPlayed', player: by, cardId: card.id, pos, unitId: `u${state.nextUnitId}` }), by, card);
  return placeSummonedMonster(paid, by, card, pos, shiny);
}

/** Recul case par case : un piège sur le chemin se déclenche, même pour un monstre `vol` (§10). */
function push(state: GameState, monster: MonsterUnit, direction: Direction, pushDistance: number): GameState {
  const destination = getPushDestination(state, monster, direction, pushDistance);
  const step = DIRECTION_OFFSETS[direction];
  let next = state;
  // Arrêté plus tôt que prévu par un monstre invisible pour le lanceur : celui-ci se révèle (§10).
  if (!samePos(destination, getPushDestination(perceived(state), monster, direction, pushDistance))) {
    const blocker = getUnitsAt(state, { row: destination.row + step.row, col: destination.col + step.col })[0];
    if (blocker) next = reveal(next, blocker.id);
  }
  let movement = NEW_MOVEMENT;
  for (let i = 1; i <= distance(monster.pos, destination); i++) {
    const current = next.units[monster.id];
    if (current?.kind !== 'monster') break;
    const pos = { row: monster.pos.row + step.row * i, col: monster.pos.col + step.col * i };
    const moved = emit(next, { type: 'step', unitId: monster.id, from: current.pos, to: pos, kind: 'push' });
    const entered = enterCell(setUnit(moved, { ...current, pos }), monster.id, movement, current.pos);
    next = entered.state;
    movement = entered.movement;
    if (entered.stopped) break;
  }
  return next;
}

/**
 * Évolution (§6 bis) : une cible par carte de son grimoire qui évolue de la source. Impossible le tour où la source
 * est arrivée sur le plateau.
 */
function getEvolveTargets(state: GameState, player: PlayerId, source: MonsterUnit): EffectTarget[] {
  if (source.summonedOnTurn === state.turn) return [];
  return [...new Set(state.players[player].grimoire)]
    .filter((id) => {
      const card = getCard(id);
      return card.kind === 'monster' && card.evolvesFrom === source.cardId;
    })
    .map((cardId): EffectTarget => ({ kind: 'card', cardId }));
}

/**
 * La source est sacrifiée (sans être détruite : pas de VP) ; la carte choisie quitte le grimoire sans être payée et
 * son monstre prend sa place, dans le même sens, sans pouvoir agir ce tour.
 */
function resolveEvolve(state: GameState, target: EffectTarget, source: MonsterUnit): GameState {
  if (target.kind !== 'card') throw new Error('L’évolution choisit une carte du grimoire');
  const card = getCard(target.cardId);
  if (card.kind !== 'monster') throw new Error(`« ${target.cardId} » n'est pas un monstre`);
  const { pos, owner, facing } = source;
  const shiny = isShinyCopy(state, owner, card.id);
  let next = removeUnit(emit(state, { type: 'sacrifice', unitId: source.id, pos }), source.id);
  const id = `u${next.nextUnitId}`;
  next = takeFromGrimoire(emit(next, { type: 'cardPlayed', player: owner, cardId: card.id, pos, unitId: id }), card.id);
  const unit = {
    ...shine(createMonsterUnit(id, card, owner, pos, state.turn), shiny),
    facing,
    mobilityLeft: 0,
    hasAttacked: true,
    usedEffects: card.activated.map((_, i) => i),
  };
  return addUnit(emit(next, { type: 'summon', unit }), () => unit);
}
