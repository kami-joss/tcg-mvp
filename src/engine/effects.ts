// Effets des cartes (SPEC.md §5.2 à §5.4) : ciblage et résolution, communs aux sorts et aux effets actifs.
// Un effet complet (`Ability`) vise un monstre, une zone, une case ou sa source, puis applique ses effets dans l'ordre.
// Invocation et téléportation demandent un second choix : le monstre à invoquer, la case où poser le monstre.
import { DIRECTION_OFFSETS, DIRECTIONS, adjacentCells, distance, hasCliff, isAdjacent, isPlayable, samePos } from './board';
import { getLineOfSightCells } from './combat';
import { dealDamage } from './damage';
import { emit } from './events';
import { opponent, takeFromGrimoire } from './players';
import { addStatus, statusExpiry } from './statuses';
import { perceived, perceivedBy, reveal } from './stealth';
import { NEW_MOVEMENT, enterCell } from './traps';
import { getCard, getMonsterCard } from './cards';
import { payCard, placeSummonedMonster } from './summon';
import { addUnit, createMonsterUnit, getMonsterAt, getMonsters, getUnitsAt, removeUnit, setUnit } from './units';
import type {
  Ability,
  AreaZone,
  BoardState,
  BurningCell,
  Direction,
  Effect,
  EffectTarget,
  Family,
  GameState,
  MonsterUnit,
  PlayerId,
  Position,
  Targeting,
  Trap,
} from './types';

type PushEffect = Extract<Effect, { type: 'push' }>;

function requireSource(source: MonsterUnit | null): MonsterUnit {
  if (!source) throw new Error('Cette portée se mesure depuis un monstre source : un sort ne peut pas l’utiliser');
  return source;
}

/** Les monstres de `player` d'une famille. */
function alliesOf(state: BoardState, player: PlayerId, family: Family): MonsterUnit[] {
  return getMonsters(state, player).filter((m) => getMonsterCard(m.cardId).family === family);
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
    (m) => !targeting.family || getMonsterCard(m.cardId).family === targeting.family,
  );
  const { reach } = targeting;
  switch (reach.type) {
    case 'anywhere':
      return candidates;
    case 'nearOwnMonster': {
      const own = getMonsters(state, player);
      return candidates.filter((m) => own.some((o) => distance(o.pos, m.pos) <= reach.steps));
    }
    case 'adjacent': {
      // Les 8 cases autour ; aucune falaise ne se franchit, même celle de la Scierie (§10).
      const from = requireSource(source).pos;
      return candidates.filter((m) => isAdjacent(state.board, from, m.pos));
    }
    case 'line': {
      const cells = getLineOfSightCells(state, requireSource(source).pos, reach.range);
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
 * Cases d'une zone autour de la source (§5.3, §10), à partir des cases adjacentes (les 8 autour, voir `adjacentCells`
 * pour les falaises et les cases X). `front3` : la case devant elle (dans le sens où elle regarde) et ses deux voisines
 * de côté ; `adjacent` : les 8 ; `adjacent2` : les adjacentes et les cases adjacentes à celles-ci (rayon 2) ; `line3` :
 * les 3 cases en ligne dans le sens où elle regarde, jusqu'à la première falaise ou case X.
 */
export function getAreaCells(state: BoardState, source: MonsterUnit, zone: AreaZone): Position[] {
  const around = adjacentCells(state.board, source.pos);
  if (zone === 'adjacent') return around;
  if (zone === 'adjacent2') {
    const cells = [...around];
    for (const pos of around) {
      for (const next of adjacentCells(state.board, pos)) {
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
      // Une case en ligne droite est adjacente si elle est jouable et sans falaise entre les deux.
      if (!adjacentCells(state.board, pos).some((cell) => samePos(cell, next))) break;
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

/** Cases adjacentes libres de la source (§5.3) : les 8 autour (voir `adjacentCells`), sans aucune unité. */
export function getEmptyAdjacentCells(state: BoardState, source: MonsterUnit): Position[] {
  return adjacentCells(state.board, source.pos).filter((pos) => getUnitsAt(state, pos).length === 0);
}

/** Cases où `source` peut poser un piège : adjacentes libres, sans piège à lui. */
export function getTrapCells(state: GameState, source: MonsterUnit): Position[] {
  return getEmptyAdjacentCells(state, source).filter(
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
 * Invocation (Invocateur) : une cible par case adjacente libre et par monstre de son grimoire qu'il peut payer, en plus
 * du coût de l'effet (§5.4).
 */
function getSummonTargets(state: GameState, ability: Ability, player: PlayerId, source: MonsterUnit): EffectTarget[] {
  const effectCost = 'manaCost' in ability && typeof ability.manaCost === 'number' ? ability.manaCost : 0;
  const budget = state.players[player].mana - effectCost;
  const cards = [...new Set(state.players[player].grimoire)].filter((id) => {
    const card = getCard(id);
    return card.kind === 'monster' && card.cost <= budget;
  });
  return getEmptyAdjacentCells(state, source).flatMap((pos) =>
    cards.map((cardId): EffectTarget => ({ kind: 'cellAndCard', pos, cardId })),
  );
}

/** Le recul de l'effet, s'il en a un. */
function findPush(effects: readonly Effect[]): PushEffect | undefined {
  return effects.find((effect): effect is PushEffect => effect.type === 'push');
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
    case 'emptyAdjacentCell':
      if (effects.some((effect) => effect.type === 'summon')) return getSummonTargets(state, ability, player, requireSource(source));
      return getTrapCells(state, requireSource(source)).map((pos): EffectTarget => ({ kind: 'cell', pos }));
    case 'emptyCell':
      return getBurnableCells(state, requireSource(source), targeting.zone).map((pos): EffectTarget => ({ kind: 'cell', pos }));
    case 'allies':
      // Pénombre : tous ses monstres de la famille, s'il en a au moins un.
      return alliesOf(state, player, targeting.family).length > 0 ? [{ kind: 'all' }] : [];
    case 'self':
      // Évolution : un choix de carte ; sinon (Dopage), la source elle-même.
      if (effects.some((effect) => effect.type === 'evolve')) return getEvolveTargets(state, player, requireSource(source));
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
      const monsters = getTargetableMonsters(state, targeting, player, source).filter(
        // On ne soigne pas un monstre qui a déjà tous ses PV (§10).
        (m) => !effects.every((effect) => effect.type === 'heal') || m.hp < m.maxHp,
      );
      // Téléportation : un allié autre que la source, puis une case adjacente libre de la source (§5.4).
      if (effects.some((effect) => effect.type === 'teleport')) {
        const from = requireSource(source);
        const cells = getEmptyAdjacentCells(state, from);
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
}

/** Applique un effet complet à une cible déjà validée. */
export function resolveAbility(
  state: GameState,
  ability: Ability,
  target: EffectTarget,
  by: PlayerId,
  source: MonsterUnit | null,
): GameState {
  const { targeting, effects } = ability;
  switch (targeting.type) {
    case 'emptyAdjacentCell': {
      if (target.kind === 'cellAndCard') return resolveSummon(state, target, by);
      if (target.kind !== 'cell') throw new Error('Cet effet vise une case');
      let next = state;
      for (const effect of effects) {
        if (effect.type !== 'placeTrap') throw new Error('Sur une case, seul un piège se pose');
        const trap: Trap = { owner: by, pos: target.pos, effects: effect.effects, cardId: requireSource(source).cardId };
        next = { ...emit(next, { type: 'trapPlaced', trap }), traps: [...next.traps, trap] };
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
      return alliesOf(state, by, targeting.family).reduce((next, m) => applyEffects(next, effects, m.id, { by, source }), state);
    case 'self':
      if (effects.some((effect) => effect.type === 'evolve')) return resolveEvolve(state, target, requireSource(source));
      return applyEffects(state, effects, requireSource(source).id, { by, source });
    case 'zone': {
      // Chaque ennemi de la zone que le lanceur voit (jamais un monstre invisible pour lui) subit les effets, dans l'ordre.
      const from = requireSource(source);
      // Le plus éloigné de la source d'abord : sur une ligne, un recul ne bute pas sur l'ennemi suivant.
      const ids = getAreaTargets(perceivedBy(state, by), targeting.zone, by, from)
        .sort((a, b) => distance(b.pos, from.pos) - distance(a.pos, from.pos))
        .map((m) => m.id);
      const context: EffectContext = { by, source: from, distance: target.kind === 'area' ? target.distance : undefined };
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
      return applyEffects(state, effects, monster.id, { by, source, direction, destination });
    }
  }
}

/** Les effets, dans l'ordre, sur le monstre `unitId` ; s'arrête s'il quitte le plateau. */
function applyEffects(state: GameState, effects: readonly Effect[], unitId: string, context: EffectContext): GameState {
  let next = state;
  for (const effect of effects) {
    const monster = next.units[unitId];
    if (monster?.kind !== 'monster') break;
    next = applyEffect(next, effect, monster, context);
  }
  return next;
}

function applyEffect(state: GameState, effect: Effect, monster: MonsterUnit, context: EffectContext): GameState {
  const { id: unitId, pos } = monster;
  switch (effect.type) {
    case 'damage':
      return dealDamage(state, unitId, effect.amount, context.by, context.source ? 'effect' : 'spell');
    case 'heal': {
      const hp = Math.min(monster.maxHp, monster.hp + effect.amount);
      return setUnit(emit(state, { type: 'heal', unitId, pos, amount: hp - monster.hp }), { ...monster, hp });
    }
    case 'status':
      return addStatus(state, unitId, effect);
    case 'addMobility':
      return setUnit(emit(state, { type: 'mobility', unitId, pos, amount: effect.amount }), {
        ...monster,
        mobilityLeft: monster.mobilityLeft + effect.amount,
      });
    case 'addAtkThisTurn':
      return boost(state, monster, effect.amount);
    case 'addRangeThisTurn':
      return setUnit(emit(state, { type: 'reach', unitId, pos, amount: effect.amount }), {
        ...monster,
        rangeBonus: monster.rangeBonus + effect.amount,
      });
    case 'multiplyAtkThisTurn':
      // L'ATK du moment, bonus du tour compris (les auras s'ajoutent ensuite, sans être multipliées).
      return boost(state, monster, (monster.atk + monster.atkBonus) * (effect.multiplier - 1));
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
      // Pas un déplacement : il garde sa mobilité, son attaque et son orientation ; il entre sur sa nouvelle case.
      const to = context.destination;
      if (!to) throw new Error('Une téléportation demande une case');
      const moved = setUnit(emit(state, { type: 'teleport', unitId, from: pos, to }), { ...monster, pos: to });
      return enterCell(moved, unitId, NEW_MOVEMENT).state;
    }
    case 'placeTrap':
    case 'burnCell':
    case 'evolve':
    case 'summon':
      throw new Error(`L'effet « ${effect.type} » ne s'applique pas à un monstre`);
  }
}

/** ATK en plus pour ce tour (remise à 0 au début du prochain tour). */
function boost(state: GameState, monster: MonsterUnit, atk: number): GameState {
  const { id: unitId, pos } = monster;
  return setUnit(emit(state, { type: 'boost', unitId, pos, atk }), { ...monster, atkBonus: monster.atkBonus + atk });
}

/**
 * Effets déclenchés (« Quand il détruit », « Début de tour ») appliqués à un monstre, dans l'ordre ; `source` est le
 * monstre qui les porte. Un soin sur un monstre qui a tous ses PV ne fait rien.
 */
export function applyTriggeredEffects(state: GameState, effects: readonly Effect[], unitId: string, source: MonsterUnit): GameState {
  const target = state.units[unitId];
  const useful = effects.filter((effect) => effect.type !== 'heal' || (target !== undefined && target.hp < target.maxHp));
  return applyEffects(state, useful, unitId, { by: source.owner, source });
}

/** Invocation (Invocateur) : le joueur paie aussi le coût du monstre, qui arrive sur la case et peut agir aussitôt. */
function resolveSummon(state: GameState, target: Extract<EffectTarget, { kind: 'cellAndCard' }>, by: PlayerId): GameState {
  const card = getCard(target.cardId);
  if (card.kind !== 'monster') throw new Error(`« ${target.cardId} » n'est pas un monstre`);
  const pos = { row: target.pos.row, col: target.pos.col };
  const paid = payCard(emit(state, { type: 'cardPlayed', player: by, cardId: card.id, pos }), by, card);
  return placeSummonedMonster(paid, by, card, pos);
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
    const entered = enterCell(setUnit(moved, { ...current, pos }), monster.id, movement);
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
  let next = removeUnit(emit(state, { type: 'sacrifice', unitId: source.id, pos }), source.id);
  next = takeFromGrimoire(emit(next, { type: 'cardPlayed', player: owner, cardId: card.id, pos }), card.id);
  const id = `u${next.nextUnitId}`;
  const unit = {
    ...createMonsterUnit(id, card, owner, pos, state.turn),
    facing,
    mobilityLeft: 0,
    hasAttacked: true,
    hasUsedEffect: true,
  };
  return addUnit(emit(next, { type: 'summon', unit }), () => unit);
}
