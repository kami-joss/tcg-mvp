// IA d'entraînement (SPEC.md §7 bis) : un adversaire simple, pour tester le jeu seul. Elle joue une action à la fois :
// parmi ses actions légales, celle qui améliore le plus l'évaluation de la position, vue deux coups à l'avance pour un
// même monstre (un sort ou un effet qui le renforce puis son attaque, un déplacement puis une attaque…) ; quand plus
// rien ne l'améliore, elle finit son tour. Elle ne triche pas : elle évalue sur ce que son camp voit (sans les monstres
// invisibles adverses, ni les pièges adverses, ni le grimoire adverse).
// Elle ne fait que consommer le moteur, comme l'interface : `getLegalActions`, `applyAction` et les fonctions publiques.
import {
  applyAction,
  distance,
  getAtk,
  getAttackTargets,
  getHiddenUnitIds,
  getLegalActions,
  getManaZones,
  getMonsterCard,
  getMoveDestinations,
  getNextTurnMobility,
  getStrikeCells,
  getZoneController,
  getZoneMana,
  isHiddenFrom,
  ownerNextTurn,
  statusTotal,
} from '../engine';
import type { Action, GameState, MonsterUnit, PlayerId, Position, Unit, UnitId } from '../engine';

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
export function chooseAction(state: GameState, me: PlayerId): Action {
  if (state.activePlayer !== me || state.winner !== null) return END_TURN;
  const known = knownState(state, me);
  const base = evaluate(known, me);
  let best = END_TURN;
  let bestScore = base + MIN_GAIN;
  let bestNext: GameState | null = null;
  let effect: { action: Action; score: number } | null = null;
  let board: { action: Action; score: number } | null = null;
  for (const action of getLegalActions(state)) {
    if (action.type === 'endTurn') continue;
    const next = tryAction(known, action); // Légale sur l'état réel, mais pas sur ce que l'IA en sait : ignorée.
    if (!next) continue;
    // Une action vaut ce que vaut la position après elle, ou après la meilleure action qui la suit pour le même monstre.
    let score = evaluate(next, me);
    for (const followUp of getFollowUps(known, action, next, me)) {
      const after = tryAction(next, followUp);
      if (after) score = Math.max(score, evaluate(after, me));
    }
    if (score > bestScore) {
      best = action;
      bestScore = score;
      bestNext = next;
    }
    if (action.type === 'activateEffect' && score > (effect?.score ?? -Infinity)) effect = { action, score };
    if (isBoardAction(action) && score > (board?.score ?? -Infinity)) board = { action, score };
  }
  // Les sorts se jouent quand ils sont les meilleurs (Flèche divine avant le tir, Pénombre face à une menace).
  if (best.type !== 'playCard' || best.target.kind !== 'cell') return best;
  // Un monstre ou un terrain attend : un effet utile passe d'abord si la carte lui prendrait le mana dont il a besoin.
  if (effect && effect.score - base >= EFFECT_FIRST_GAIN && bestNext && !tryAction(bestNext, effect.action)) {
    return effect.action;
  }
  // Et il se pose après les déplacements, attaques et effets utiles : le mana reste disponible pour un effet qui
  // deviendrait possible (un Mage qui s'approche), et la carte ne perd rien à attendre la fin du tour.
  if (board && board.score > base + MIN_GAIN) return board.action;
  return best;
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
  if (quick) {
    const attacks = getAttackTargets(after, monster).map(
      (target): Action => ({ type: 'attack', unitId: focus, targetId: target.id, advance: false }),
    );
    // Son effet, seulement s'il dépend de l'endroit où il se trouve (Mage, Chaman, dragons) : poser un piège ou évoluer
    // vaut autant d'ici que d'ailleurs.
    const placed = getMonsterCard(monster.cardId).activated.flatMap((ability, i) =>
      ability.targeting.type === 'zone' || (ability.targeting.type === 'monster' && ability.targeting.reach.type !== 'anywhere') ? [i] : [],
    );
    const effects = getLegalActions(after).filter(
      (a) => a.type === 'activateEffect' && a.unitId === focus && placed.includes(a.effect ?? 0) && !monster.usedEffects.includes(a.effect ?? 0),
    );
    return [...attacks, ...effects];
  }
  return getLegalActions(after).filter((a) => 'unitId' in a && a.unitId === focus);
}

/** Valeur d'une position pour `me` (plus c'est haut, mieux c'est). */
export function evaluate(state: GameState, me: PlayerId): number {
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

  // Avancer vers les mana zones qu'on ne tient pas ; sinon, vers l'ennemi.
  const targets = zones.filter(({ pos }) => getZoneController(state, pos) !== me).map(({ pos }) => pos);
  const enemies = monstersOf(state, other);
  for (const monster of monstersOf(state, me)) {
    if (zones.some(({ pos }) => samePlace(pos, monster.pos))) continue;
    if (targets.length > 0) score -= W.approach * nearest(monster.pos, targets);
    else if (enemies.length > 0) score -= W.hunt * nearest(monster.pos, enemies.map((e) => e.pos));
  }

  score += state.traps.filter((trap) => trap.owner === me).length * W.trap;
  score += (state.burningCells.filter((cell) => cell.owner === me).length - state.burningCells.filter((cell) => cell.owner !== me).length) * W.burning;
  score -= reachLosses(state, other) * W.threat;
  score += reachLosses(state, me) * W.opportunity;
  return score;
}

function monstersOf(state: GameState, player: PlayerId): MonsterUnit[] {
  return Object.values(state.units).filter((u): u is MonsterUnit => u.kind === 'monster' && u.owner === player);
}

const samePlace = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

function nearest(from: Position, cells: readonly Position[]): number {
  return Math.min(...cells.map((pos) => distance(from, pos)));
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
 * Ce que `attacker` peut faire perdre à l'autre camp à son prochain tour : pour chaque unité adverse à portée d'attaque
 * d'un de ses monstres (après déplacement), les dégâts cumulés ; une unité qui y passerait compte pour sa valeur entière,
 * plus un VP si c'est un monstre.
 */
function reachLosses(state: GameState, attacker: PlayerId): number {
  const damage = new Map<string, number>();
  for (const monster of monstersOf(state, attacker)) {
    const next = ownerNextTurn(state.turn, state.activePlayer, monster.owner);
    if (monster.statuses.some((s) => s.kind === 'stun' && s.expiresAtTurn > next)) continue;
    const mobile = { ...monster, mobilityLeft: getNextTurnMobility(monster, state.turn, state.activePlayer, state.board.mobilityBonus) };
    const { [monster.id]: _self, ...others } = state.units;
    const board = { board: state.board, units: others };
    const froms = [monster.pos, ...getMoveDestinations(state, mobile).map((d) => d.pos)];
    const range = getMonsterCard(monster.cardId).range;
    const hit = new Set(froms.flatMap((from) => getStrikeCells(board, from, range)).map((p) => `${p.row},${p.col}`));
    const atk = getAtk(state, monster) - monster.atkBonus;
    for (const unit of Object.values(state.units)) {
      if (unit.owner === attacker || !hit.has(`${unit.pos.row},${unit.pos.col}`)) continue;
      // Il ne frappe pas ce qu'il ne voit pas (Farceur, Pénombre).
      if (isHiddenFrom(state, unit, attacker)) continue;
      damage.set(unit.id, (damage.get(unit.id) ?? 0) + atk);
    }
  }
  let losses = 0;
  for (const [id, dmg] of damage) {
    const unit = state.units[id]!;
    if (dmg >= unit.hp) losses += unitValue(state, unit) + (unit.kind === 'monster' ? W.vp : 0);
    else losses += dmg;
  }
  return losses;
}
