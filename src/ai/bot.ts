// IA d'entraînement (SPEC.md §7 bis). Elle joue une action à la fois : elle note chacune de ses actions légales (la
// position après elle, ou après la meilleure action qui la suit pour le même monstre : un sort qui le renforce puis
// son attaque, un déplacement puis une attaque…), puis, pour les meilleures, joue la suite de son tour dans sa tête et
// garde celle qui finit le mieux, dans un budget de calcul fixe ; quand plus rien ne l'améliore, elle finit son tour.
// Elle ne triche pas : elle évalue sur ce que son camp voit (sans les monstres invisibles adverses, ni les pièges
// adverses, ni le grimoire adverse).
// Elle ne fait que consommer le moteur, comme l'interface : `getLegalActions`, `applyAction` et les fonctions publiques.
import {
  applyAction,
  canAdvance,
  canMove,
  getAtk,
  getCell,
  getCliff,
  getAttackTargets,
  getHiddenUnitIds,
  getLegalActions,
  getManaZones,
  getMonsterCard,
  getMoveDestinations,
  getNextTurnMobility,
  getZoneCells,
  getZoneController,
  getZoneMana,
  hasKeyword,
  isHiddenFrom,
  isPlayable,
  isStunned,
  ownerNextTurn,
  statusTotal,
} from '../engine';
import { getStrikers } from './reach';
import type { Striker } from './reach';
import type { Action, Board, GameMode, GameState, ManaZoneId, MonsterUnit, PlayerId, Position, Unit, UnitId } from '../engine';

/**
 * Recherche : les `candidates` meilleures actions (plus celle choisie sans chercher) sont suivies de `depth` actions au
 * plus ; au-delà de `budget` évaluations de position, elle s'arrête (sur le 15 × 15, environ 0,3 s sur un ordinateur).
 * Mesuré en parties IA contre IA : sur la carte classique, 82 % de victoires contre l'IA sans recherche.
 */
export const SEARCH = { candidates: 4, depth: 8, budget: 4000 };

const END_TURN: Action = { type: 'endTurn' };

/** Poids de l'évaluation : un VP vaut 12 ; une mana zone tenue, 6 par mana qu'elle rapporte. */
const W = {
  vp: 12,
  /** Mana en réserve : utile jusqu'à 6, presque rien au-delà (mieux vaut le dépenser). */
  mana: 0.3,
  hoard: 0.05,
  hoardFrom: 6,
  zone: 6,
  /** Par case qui sépare un monstre d'une mana zone qu'il ne tient pas encore. */
  approach: 0.5,
  /** Par case qui sépare un monstre du premier ennemi, quand plus aucune zone n'est à prendre. */
  hunt: 0.2,
  trap: 1.5,
  /** Case brûlée à soi : publique, mais elle reste et gêne les déplacements adverses. */
  burning: 1,
  /** Part des pertes qu'on s'attend à subir au prochain tour adverse (il ne frappera pas partout). */
  threat: 0.4,
  /** Part des dégâts qu'on pourra infliger à son prochain tour : pousse à se placer pour attaquer. */
  opportunity: 0.25,
  win: 100_000,
} as const;

/** Gain minimal pour qu'une action vaille la peine d'être jouée. */
const MIN_GAIN = 0.05;

/**
 * Gain à partir duquel un effet actif passe avant une carte qui lui prendrait son mana : un effet inutilisé est perdu
 * pour ce tour, une carte reste au grimoire.
 */
const EFFECT_FIRST_GAIN = 1;

const isBoardAction = (action: Action) => action.type === 'move' || action.type === 'attack' || action.type === 'activateEffect';

const foe = (player: PlayerId): PlayerId => (player === 1 ? 2 : 1);

/** L'état tel que le connaît `me` : sans les monstres qu'il ne voit pas, ni les pièges et le grimoire adverses. */
export function knownState(state: GameState, me: PlayerId): GameState {
  const hidden = new Set(getHiddenUnitIds(state, me));
  const units = Object.fromEntries(Object.entries(state.units).filter(([id]) => !hidden.has(id)));
  const other = foe(me);
  return {
    ...state,
    units,
    traps: state.traps.filter((trap) => trap.owner === me),
    players: { ...state.players, [other]: { ...state.players[other], grimoire: [] } },
  };
}

/** L'action que l'IA joue maintenant, pour le joueur actif `me`. */
export function chooseAction(state: GameState, me: PlayerId, search = SEARCH): Action {
  if (state.activePlayer !== me || state.winner !== null) return END_TURN;
  const known = knownState(state, me);
  evaluations = 0;
  const ranked = rank(known, me, getLegalActions(state));
  // Recherche : l'action choisie sans chercher, puis les mieux notées, chacune suivie de la fin du tour jouée au plus
  // simple ; on garde celle qui finit le mieux. Au-delà du budget de calcul, on s'arrête là.
  const pick = ranked.candidates.find((c) => c.action === ranked.pick);
  const best = [...ranked.candidates].sort((a, b) => b.score - a.score).slice(0, search.candidates);
  const order = pick ? [pick, ...best.filter((c) => c !== pick)] : best;
  // Finir le tour tout de suite vaut la position actuelle ; à valeur égale, l'action choisie sans chercher l'emporte.
  let choice: Action = END_TURN;
  let bestValue = ranked.base + (ranked.pick.type === 'endTurn' ? MIN_GAIN : 0);
  let pickValue = -Infinity;
  for (const candidate of order) {
    if (evaluations > search.budget) break;
    let current = candidate.next;
    for (let step = 0; step < search.depth && current.winner === null && evaluations <= search.budget; step++) {
      const next = rank(current, me, getLegalActions(current)).pick;
      if (next.type === 'endTurn') break;
      current = tryAction(current, next) ?? current;
    }
    const value = evaluate(current, me) + (candidate === pick ? MIN_GAIN : 0);
    if (candidate === pick) pickValue = value;
    if (value > bestValue) {
      bestValue = value;
      choice = candidate.action;
    }
  }
  // Un monstre ou un terrain se pose après les actions du plateau et les effets utiles, comme sans chercher (`rank`) :
  // la carte ne perd rien à attendre, un effet inutilisé est perdu pour le tour. La recherche le jouera plus tard.
  const waits = (action: Action) => action.type === 'playCard' && action.target.kind === 'cell';
  if (waits(choice) && pick && !waits(pick.action) && (pick.action.type === 'activateEffect' || pickValue >= bestValue - CARD_WAIT)) {
    return pick.action;
  }
  return choice;
}

/** Écart de valeur en dessous duquel une carte à poser attend l'action du plateau choisie sans chercher. */
const CARD_WAIT = 1.5;

/** Évaluations de position faites pour la décision en cours (budget de la recherche). */
let evaluations = 0;

/** Évaluations faites pour la dernière décision (tests du budget). */
export const lastEvaluations = () => evaluations;

interface Scored {
  readonly action: Action;
  readonly score: number;
  readonly next: GameState;
}

/**
 * Chaque action jouée sur ce que l'IA sait (`known`) et notée, et l'action qu'elle choisirait sans chercher plus loin
 * (`pick`). `actions` : les actions légales sur l'état réel ; une action légale sur l'état réel mais pas sur ce que
 * l'IA en sait est ignorée.
 */
function rank(known: GameState, me: PlayerId, actions: readonly Action[]): { base: number; pick: Action; candidates: Scored[] } {
  const base = evaluate(known, me);
  const candidates: Scored[] = [];
  let best = END_TURN;
  let bestScore = base + MIN_GAIN;
  let bestNext: GameState | null = null;
  let effect: { action: Action; score: number } | null = null;
  let board: { action: Action; score: number } | null = null;
  for (const action of actions) {
    if (action.type === 'endTurn') continue;
    const next = tryAction(known, action);
    if (!next) continue;
    // Une action vaut ce que vaut la position après elle, ou après la meilleure action qui la suit pour le même monstre.
    let score = evaluate(next, me);
    for (const followUp of getFollowUps(known, action, next, me)) {
      const after = tryAction(next, followUp);
      if (after) score = Math.max(score, evaluate(after, me));
    }
    candidates.push({ action, score, next });
    if (score > bestScore) {
      best = action;
      bestScore = score;
      bestNext = next;
    }
    if (action.type === 'activateEffect' && score > (effect?.score ?? -Infinity)) effect = { action, score };
    if (isBoardAction(action) && score > (board?.score ?? -Infinity)) board = { action, score };
  }
  const result = (pick: Action) => ({ base, pick, candidates });
  // Les sorts se jouent quand ils sont les meilleurs (Flèche divine avant le tir, Pénombre face à une menace).
  if (best.type !== 'playCard' || best.target.kind !== 'cell') return result(best);
  // Un monstre ou un terrain attend : un effet utile passe d'abord si la carte lui prendrait le mana dont il a besoin.
  if (effect && effect.score - base >= EFFECT_FIRST_GAIN && bestNext && !tryAction(bestNext, effect.action)) {
    return result(effect.action);
  }
  // Et il se pose après les déplacements, attaques et effets utiles : le mana reste disponible pour un effet qui
  // deviendrait possible (un Mage qui s'approche), et la carte ne perd rien à attendre la fin du tour.
  if (board && board.score > base + MIN_GAIN) return result(board.action);
  return result(best);
}

function tryAction(state: GameState, action: Action): GameState | null {
  try {
    return applyAction(state, action);
  } catch {
    return null;
  }
}

/**
 * Le monstre de `me` qu'une action met en jeu : celui qui agit (déplacement, attaque, effet), celui qu'elle vise (sort
 * ou effet sur un de ses monstres : Flèche divine, Charge, Dopage, téléportation) ou celui qu'elle invoque.
 */
function focusOf(before: GameState, action: Action, after: GameState, me: PlayerId): UnitId | null {
  const mine = (id: UnitId | undefined) => (id && after.units[id]?.kind === 'monster' && after.units[id]?.owner === me ? id : null);
  switch (action.type) {
    case 'move':
    case 'attack':
      return mine(action.unitId);
    case 'activateEffect': {
      const target = 'unitId' in action.target ? action.target.unitId : undefined;
      return mine(target) ?? mine(action.unitId);
    }
    case 'playCard': {
      if ('unitId' in action.target) return mine(action.target.unitId);
      // Une invocation : le monstre arrivé sur le plateau.
      const summoned = Object.keys(after.units).find((id) => !before.units[id]);
      return mine(summoned);
    }
    case 'endTurn':
      return null;
  }
}

/**
 * Les actions à essayer juste après `action`, pour le même monstre : ses attaques (et son effet actif, s'il dépend de
 * sa place) après un déplacement ou une invocation ; toutes ses actions (déplacements, attaques, effets) après une
 * attaque, un sort ou un effet.
 */
function getFollowUps(before: GameState, action: Action, after: GameState, me: PlayerId): Action[] {
  if (after.winner !== null) return [];
  const focus = focusOf(before, action, after, me);
  if (!focus) return [];
  const monster = after.units[focus] as MonsterUnit;
  const quick = action.type === 'move' || (action.type === 'playCard' && action.target.kind === 'cell');
  const effects = getMonsterCard(monster.cardId).activated.flatMap((ability, i) =>
    // Après un déplacement ou une invocation, son effet seulement s'il dépend de l'endroit où il se trouve (Mage,
    // Chaman, dragons) : poser un piège ou évoluer vaut autant d'ici que d'ailleurs.
    !monster.usedEffects.includes(i) &&
    ability.manaCost <= after.players[me].mana &&
    (!quick || ability.targeting.type === 'zone' || (ability.targeting.type === 'monster' && ability.targeting.reach.type !== 'anywhere'))
      ? [i]
      : [],
  );
  return monsterActions(after, monster, !quick, effects);
}

/**
 * Les actions d'un monstre (plus rapide que de filtrer `getLegalActions`) : ses attaques, ses déplacements si
 * `moves`, et ses effets actifs de rangs `effects`.
 */
function monsterActions(state: GameState, monster: MonsterUnit, moves: boolean, effects: readonly number[]): Action[] {
  const actions: Action[] = [];
  for (const target of getAttackTargets(state, monster)) {
    actions.push({ type: 'attack', unitId: monster.id, targetId: target.id, advance: false });
    if (canAdvance(state, monster, target)) actions.push({ type: 'attack', unitId: monster.id, targetId: target.id, advance: true });
  }
  if (moves && monster.mobilityLeft > 0 && canMove(monster)) {
    for (const { pos } of getMoveDestinations(state, monster)) actions.push({ type: 'move', unitId: monster.id, to: pos });
  }
  if (effects.length > 0 && !isStunned(monster)) {
    for (const action of getLegalActions(state)) {
      if (action.type === 'activateEffect' && action.unitId === monster.id && effects.includes(action.effect ?? 0)) actions.push(action);
    }
  }
  return actions;
}

/** Valeur d'une position pour `me` (plus c'est haut, mieux c'est). */
export function evaluate(state: GameState, me: PlayerId): number {
  evaluations++;
  if (state.winner !== null) return state.winner === me ? W.win : -W.win;
  const other = foe(me);
  const mana = state.players[me].mana;
  let score =
    (state.players[me].vp - state.players[other].vp) * W.vp +
    Math.min(mana, W.hoardFrom) * W.mana +
    Math.max(0, mana - W.hoardFrom) * W.hoard;

  for (const unit of Object.values(state.units)) {
    const sign = unit.owner === me ? 1 : -1;
    score += sign * unitValue(state, unit);
  }

  const zones = getManaZones(state.board);
  for (const { pos } of zones) {
    const controller = getZoneController(state, pos);
    if (controller !== null) score += (controller === me ? 1 : -1) * W.zone * getZoneMana(state, pos);
  }

  // Avancer vers les mana zones qu'on ne tient pas (une de leurs cases en mode contestation) ; sinon, vers l'ennemi. En
  // cases de marche : murs et falaises font faire le tour. Un seul monstre garde chaque zone : en mode contestation,
  // les autres de la même zone repartent vers les suivantes.
  const cellsOf = (pos: Position) => getZoneCells(state.board, state.mode, pos).filter((cell) => isPlayable(state.board, cell));
  const open = zones.filter(({ pos }) => getZoneController(state, pos) !== me);
  const guarded = new Set<ManaZoneId>();
  const enemies = monstersOf(state, other);
  let hunt: Int16Array | null = null;
  for (const monster of monstersOf(state, me)) {
    const zone = zones.find(({ pos }) => cellsOf(pos).some((cell) => samePlace(cell, monster.pos)));
    if (zone && !guarded.has(zone.zone)) {
      guarded.add(zone.zone);
      continue;
    }
    const here = index(state.board, monster.pos);
    if (open.length > 0) {
      const flying = hasKeyword(monster, 'vol');
      score -= W.approach * Math.min(...open.map(({ pos }) => zoneDistances(state.board, state.mode, pos, flying)[here]!));
    } else if (enemies.length > 0) {
      hunt ??= walkDistances(state.board, enemies.map((e) => e.pos), false);
      score -= W.hunt * hunt[here]!;
    }
  }

  score += state.traps.filter((trap) => trap.owner === me).length * W.trap;
  score += (state.burningCells.filter((cell) => cell.owner === me).length - state.burningCells.filter((cell) => cell.owner !== me).length) * W.burning;
  score -= strikeLosses(state, other) * W.threat;
  score += strikeLosses(state, me) * W.opportunity;
  return score;
}

function monstersOf(state: GameState, player: PlayerId): MonsterUnit[] {
  return Object.values(state.units).filter((u): u is MonsterUnit => u.kind === 'monster' && u.owner === player);
}

const samePlace = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

const index = (board: Board, pos: Position) => pos.row * board.cols + pos.col;

/** Distance de marche quand aucun chemin n'existe. */
const FAR = 99;

/**
 * Distances de marche (en cases) de chaque case du plateau à la plus proche des cases `targets`, sans tenir compte des
 * unités : les cases X et les falaises font faire le tour (`vol` passe au-dessus des basses, comme pour se déplacer).
 */
function walkDistances(board: Board, targets: readonly Position[], flying: boolean): Int16Array {
  const dist = new Int16Array(board.rows * board.cols).fill(FAR);
  const queue: Position[] = [];
  for (const pos of targets) {
    if (dist[index(board, pos)] === 0) continue;
    dist[index(board, pos)] = 0;
    queue.push(pos);
  }
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head]!;
    const next = dist[index(board, from)]! + 1;
    for (const [dr, dc] of STEPS) {
      const to = { row: from.row + dr, col: from.col + dc };
      if (to.row < 0 || to.col < 0 || to.row >= board.rows || to.col >= board.cols || dist[index(board, to)]! <= next) continue;
      const cell = getCell(board, to);
      if (cell.kind === 'offBoard' || (cell.kind === 'blocked' && (!flying || cell.height === 'high'))) continue;
      const cliff = getCliff(board, from, to);
      if (cliff && !(flying && cliff.flyingPasses)) continue;
      dist[index(board, to)] = next;
      queue.push(to);
    }
  }
  return dist;
}

const STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** Distances de marche vers une mana zone (ses cases jouables en mode contestation), calculées une fois par plateau. */
const zoneDistanceCache = new WeakMap<Board, Map<string, Int16Array>>();

function zoneDistances(board: Board, mode: GameMode, pos: Position, flying: boolean): Int16Array {
  let cache = zoneDistanceCache.get(board);
  if (!cache) zoneDistanceCache.set(board, (cache = new Map()));
  const key = `${mode}|${pos.row},${pos.col}|${flying}`;
  let dist = cache.get(key);
  if (!dist) {
    dist = walkDistances(board, getZoneCells(board, mode, pos).filter((cell) => isPlayable(board, cell)), flying);
    cache.set(key, dist);
  }
  return dist;
}


/** Valeur d'une unité : ses caractéristiques durables (le bonus d'ATK du tour n'en fait pas partie). */
function unitValue(state: GameState, unit: Unit): number {
  if (unit.kind === 'terrain') return 2 + unit.hp * 0.5;
  const card = getMonsterCard(unit.cardId);
  const atk = getAtk(state, unit) - unit.atkBonus;
  let value = 1 + 1.5 * atk + unit.hp + 0.4 * card.mobility + 0.8 * (card.range - 1);
  value -= 1.5 * statusTotal(unit, 'burn');
  if (unit.statuses.some((s) => s.kind === 'requiem')) value *= 0.3;
  return value;
}


/**
 * Ce que `attacker` peut faire perdre à l'autre camp à son prochain tour (portées calculées par `reach.ts`) : chaque
 * monstre ne frappe qu'une fois ; ils détruisent d'abord ce qui rapporte le plus par attaquant engagé (la valeur de
 * l'unité, plus un VP pour un monstre), puis ceux qui restent entament la cible la plus abîmée qu'ils atteignent.
 */
export function strikeLosses(state: GameState, attacker: PlayerId): number {
  const strikers = getStrikers(
    state,
    attacker,
    (monster) => {
      const next = ownerNextTurn(state.turn, state.activePlayer, monster.owner);
      if (monster.statuses.some((s) => s.kind === 'stun' && s.expiresAtTurn > next)) return -1;
      return getNextTurnMobility(monster, state.turn, state.activePlayer, state.board.mobilityBonus);
    },
    (monster) => getAtk(state, monster) - monster.atkBonus,
    // Il ne frappe pas ce qu'il ne voit pas (Farceur, Pénombre).
    (unit) => !isHiddenFrom(state, unit, attacker),
  );
  const lossOf = (unit: Unit) => unitValue(state, unit) + (unit.kind === 'monster' ? W.vp : 0);
  const free = new Set(strikers);
  const hp = new Map<Unit, number>();
  const hpOf = (unit: Unit) => hp.get(unit) ?? unit.hp;
  let losses = 0;
  for (;;) {
    let best: { target: Unit; team: Striker[]; gain: number } | null = null;
    const targets = new Set<Unit>();
    for (const striker of free) for (const { target } of striker.hits) targets.add(target);
    for (const target of targets) {
      if (hpOf(target) <= 0) continue;
      const team = [...free]
        .map((striker) => ({ striker, damage: striker.hits.find((h) => h.target === target)?.damage ?? 0 }))
        .filter((s) => s.damage > 0)
        .sort((a, b) => b.damage - a.damage);
      let total = 0;
      const used: Striker[] = [];
      for (const { striker, damage } of team) {
        if (total >= hpOf(target)) break;
        total += damage;
        used.push(striker);
      }
      if (total < hpOf(target)) continue;
      const gain = lossOf(target) / used.length;
      if (!best || gain > best.gain) best = { target, team: used, gain };
    }
    if (!best) break;
    losses += lossOf(best.target);
    hp.set(best.target, 0);
    for (const striker of best.team) free.delete(striker);
  }
  for (const striker of free) {
    let chip = 0;
    for (const { target, damage } of striker.hits) if (hpOf(target) > 0) chip = Math.max(chip, Math.min(damage, hpOf(target)));
    losses += chip;
  }
  return losses;
}
