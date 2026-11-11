// IA d'entraînement (SPEC.md §7 bis). Elle joue une action à la fois : elle note chacune de ses actions légales (la
// position après elle, ou après la meilleure action qui la suit pour le même monstre : un sort qui le renforce puis
// son attaque, un déplacement puis une attaque…), puis, pour les meilleures, joue la suite de son tour dans sa tête et
// garde celle qui finit le mieux, dans un budget de calcul fixe ; quand plus rien ne l'améliore, elle finit son tour.
// Elle ne triche pas : elle évalue sur ce que son camp voit (sans les monstres invisibles adverses, ni les pièges
// adverses, ni le grimoire adverse).
// Elle ne fait que consommer le moteur, comme l'interface : `getLegalActions`, `applyAction` et les fonctions publiques.
import {
  applyAction,
  attackLimit,
  canAdvance,
  canMove,
  getAtk,
  getCell,
  getCliff,
  getAttackCells,
  isInSquare,
  getAttackTargets,
  getCard,
  getHiddenUnitIds,
  getLegalActions,
  getManaZones,
  getMonsterCard,
  getMoveDestinations,
  getNextTurnMobility,
  getNextTurnOnMoveBonus,
  getOnMoveBonus,
  getUnitsAt,
  getZoneCells,
  getZoneController,
  getZoneMana,
  canFly,
  getEffectCost,
  hasCarapace,
  isHiddenFrom,
  isPlayable,
  isStunned,
  ownerNextTurn,
  samePos,
} from '../engine';
import { getStrikers } from './reach';
import type { Striker } from './reach';
import type { Action, Board, CardId, CardSet, GameMode, GameState, ManaZoneId, MonsterCard, MonsterUnit, PlayerId, Position, Unit, UnitId } from '../engine';

/**
 * Recherche : les `candidates` meilleures actions (plus celle choisie sans chercher) sont suivies de `depth` actions au
 * plus ; au-delà de `budget` évaluations de position, elle s'arrête (sur le 15 × 15, environ 0,3 s sur un ordinateur).
 * Mesuré en parties IA contre IA : sur la carte classique, 82 % de victoires contre l'IA sans recherche.
 */
export const SEARCH: Search = { candidates: 4, depth: 8, budget: 4000, reply: 0, replyBudget: 6000 };

export interface Search {
  readonly candidates: number;
  readonly depth: number;
  readonly budget: number;
  /**
   * Riposte : après la fin de son tour simulé, l'adversaire joue au plus `reply` actions (choisies sans chercher) et on
   * note la position où il finit. 0 = pas de riposte (réglage par défaut : mesurée en parties IA contre IA, elle double
   * le temps de décision sans gagner en force). `replyBudget` : évaluations qu'elle peut coûter en tout.
   */
  readonly reply?: number;
  readonly replyBudget?: number;
}

const END_TURN: Action = { type: 'endTurn' };

/** Poids de l'évaluation : un VP vaut 12. */
export const W = {
  vp: 12,
  /** Mana en réserve : utile jusqu'à 6, presque rien au-delà (mieux vaut le dépenser). */
  mana: 0.3,
  hoard: 0.05,
  hoardFrom: 6,
  /** Mana zone : son revenu vaut son VP, plus ceci par mana qu'elle rapporte. */
  zoneMana: 2,
  /**
   * Part de son revenu que vaut une mana zone qu'on tient en fin de tour : il ne tombe qu'au début de son tour suivant,
   * si l'adversaire ne vient pas la contester d'ici là (`holdThreatened` : un de ses monstres peut y entrer).
   */
  hold: 0.9,
  holdThreatened: 0.5,
  /** Par case qui sépare un monstre d'une mana zone qu'il ne tient pas encore. */
  approach: 0.5,
  /** Gain qu'un effet actif ou un sort doit apporter, en plus de son mana, pour valoir d'être joué. */
  useGain: 0.6,
  /**
   * Un sort gardé au grimoire, par mana qu'il coûte : il servira à un moment décisif. Il ne se lance donc que s'il
   * rapporte plus (une destruction, une zone prise ou contestée, une unité sauvée), pas pour un bonus sans suite.
   */
  spellHeld: 2,
  /** Par case qui sépare un monstre du premier ennemi, quand plus aucune zone n'est à prendre. */
  hunt: 0.2,
  trap: 1.5,
  /** Un piège loin de toute mana zone ne sert presque à rien : sa valeur va de ce quart à 1,75 fois `trap`, sur une zone. */
  trapFar: 0.25,
  /** Distance (en cases de marche) d'une mana zone à partir de laquelle un piège ne vaut plus que `trapFar`. */
  trapReach: 8,
  /**
   * Case brûlée à soi : publique, mais elle reste et blesse l'ennemi qui y entre. Elle ne vaut que `burningFar` de ceci si
   * aucun ennemi ne peut y arriver à son prochain tour, `burningZone` fois ceci dans la zone d'une mana zone (l'ennemi
   * doit y entrer pour la prendre ou la contester).
   */
  burning: 1,
  burningFar: 0.3,
  burningZone: 1.5,
  /**
   * Un monstre que ses burn vont détruire (`pendingBurn`) : le VP de sa destruction ira à l'autre camp (§4.2) ; on n'en
   * compte que cette part, un soin pouvant encore le sauver.
   */
  doomed: 0.85,
  /** Part de sa valeur que garde un monstre condamné par ses burn qui pourra encore agir un tour avant de mourir. */
  doomedActs: 0.3,
  /** Part des pertes qu'on s'attend à subir au prochain tour adverse (il ne frappera pas partout). */
  threat: 0.4,
  /** Part des dégâts qu'on pourra infliger à son prochain tour : pousse à se placer pour attaquer. */
  opportunity: 0.25,
  /** Part de la valeur d'un tueur qu'on compte reprendre en le détruisant à son tour (voir `revenge`). */
  revenge: 0.5,
  win: 100_000,
} as const;

/** Gain minimal pour qu'une action vaille la peine d'être jouée. */
const MIN_GAIN = 0.05;

/**
 * Gain à partir duquel un effet actif passe avant une carte qui lui prendrait son mana : un effet inutilisé est perdu
 * pour ce tour, une carte reste au grimoire.
 */
const EFFECT_FIRST_GAIN = 1;

const isBoardAction = (action: Action) => action.type === 'move' || action.type === 'attack' || action.type === 'attackCell' || action.type === 'activateEffect';

/** Un effet actif ou un sort (pas un monstre ni un terrain posés : ils restent en jeu). */
const isUse = (action: Action) => action.type === 'activateEffect' || (action.type === 'playCard' && action.target.kind !== 'cell');

/**
 * Un sort ou un effet qui touche plusieurs monstres à la fois (cible `all` : Appel du sang, Pénombre, Piège temporel,
 * Brûlure en chaîne). Il ne rapporte souvent qu'après les actions de plusieurs monstres (+2 mobilité ce tour-ci ne
 * change rien tant qu'ils n'ont pas bougé) : aucune action suivante d'un seul monstre ne le montre, la recherche
 * l'essaie avec la suite du tour (`decide`).
 */
const isWide = (action: Action) => (action.type === 'playCard' || action.type === 'activateEffect') && action.target.kind === 'all';

/** Sorts et effets à plusieurs cibles essayés par la recherche à chaque décision, au plus. */
const WIDE_SEARCHED = 2;

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
export function chooseAction(state: GameState, me: PlayerId, search: Search = SEARCH): Action {
  if (state.activePlayer !== me || state.winner !== null) return END_TURN;
  const known = knownState(state, me);
  targets = { 1: openZones(known, 1), 2: openZones(known, 2) };
  try {
    return decide(state, known, me, search);
  } finally {
    targets = {};
  }
}

/**
 * Les mana zones que chaque camp ne tenait pas au début de la décision en cours : les seules vers lesquelles marchent
 * ses monstres (`evaluate`). Sinon, un gardien qui sort de sa zone la rendrait « à prendre », les monstres qui en sont
 * proches se retrouveraient d'un coup près d'un but, et lâcher une zone paraîtrait rapporter.
 */
let targets: Partial<Record<PlayerId, ReadonlySet<ManaZoneId>>> = {};

function openZones(state: GameState, player: PlayerId): Set<ManaZoneId> {
  return new Set(getManaZones(state.board).filter(({ pos }) => getZoneController(state, pos) !== player).map(({ zone }) => zone));
}

function decide(state: GameState, known: GameState, me: PlayerId, search: Search): Action {
  evaluations = 0;
  replySpent = 0;
  const ranked = rank(known, me, getLegalActions(state));
  // Recherche : l'action choisie sans chercher, puis les mieux notées, chacune suivie de la fin du tour jouée au plus
  // simple ; on garde celle qui finit le mieux. Au-delà du budget de calcul, on s'arrête là.
  const pick = ranked.candidates.find((c) => c.action === ranked.pick);
  const best = [...ranked.candidates].sort((a, b) => b.score - a.score).slice(0, search.candidates);
  // Les sorts et effets à plusieurs cibles passent juste après l'action choisie sans chercher, même mal notés : leur note
  // immédiate ne dit pas ce qu'ils permettent ensuite (`isWide`).
  const wide = ranked.wide.filter((c) => c !== pick && !best.includes(c)).slice(0, WIDE_SEARCHED);
  const order = pick ? [pick, ...wide, ...best.filter((c) => c !== pick)] : [...wide, ...best];
  // Finir le tour tout de suite vaut la position actuelle (après la riposte adverse) ; à valeur égale, l'action choisie
  // sans chercher l'emporte.
  let choice: Action = END_TURN;
  let bestValue = valueAfterReply(known, me, search, ranked.base) + (ranked.pick.type === 'endTurn' ? MIN_GAIN : 0);
  let pickValue = -Infinity;
  for (const candidate of order) {
    if (evaluations - replySpent > search.budget) break;
    // La riposte coûte cher : une fois son budget dépensé, on ne compare plus que ce qui a déjà été noté.
    if (replyOf(search) > 0 && replySpent > (search.replyBudget ?? 0)) break;
    let current = candidate.next;
    for (let step = 0; step < search.depth && current.winner === null && evaluations - replySpent <= search.budget; step++) {
      const next = rank(current, me, getLegalActions(current)).pick;
      if (next.type === 'endTurn') break;
      current = tryAction(current, next) ?? current;
    }
    const value = valueAfterReply(current, me, search) + (candidate === pick ? MIN_GAIN : 0);
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

/** Évaluations dépensées par les ripostes de la décision en cours (hors du budget de la recherche). */
let replySpent = 0;

const replyOf = (search: Search) => search.reply ?? 0;

/**
 * La valeur, pour `me`, de la position `state` en fin de son tour, une fois la riposte adverse jouée : l'adversaire
 * finit son tour (revenus compris) puis joue au plus `reply` actions, chacune choisie sans chercher. Il voit toute la
 * position (prudent : l'IA suppose qu'il ne se trompe pas). `plain` : la valeur sans riposte, si on la connaît déjà.
 */
function valueAfterReply(state: GameState, me: PlayerId, search: Search, plain?: number): number {
  const steps = replyOf(search);
  if (steps === 0 || state.winner !== null || state.activePlayer !== me) return plain ?? evaluate(state, me);
  const start = evaluations;
  const other = foe(me);
  let current = tryAction(state, END_TURN);
  if (!current) return plain ?? evaluate(state, me);
  for (let step = 0; step < steps && current.winner === null && current.activePlayer === other; step++) {
    const pick = rank(current, other, getLegalActions(current)).pick;
    if (pick.type === 'endTurn') break;
    const next = tryAction(current, pick);
    if (!next) break;
    current = next;
  }
  const value = evaluate(current, me);
  replySpent += evaluations - start;
  return value;
}

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
 * l'IA en sait est ignorée. `wide` : les sorts et effets à plusieurs cibles, même mal notés, pour la recherche.
 */
function rank(known: GameState, me: PlayerId, actions: readonly Action[]): { base: number; pick: Action; candidates: Scored[]; wide: Scored[] } {
  const base = evaluate(known, me);
  const candidates: Scored[] = [];
  const wide: Scored[] = [];
  let best = END_TURN;
  let bestScore = base + MIN_GAIN;
  let bestNext: GameState | null = null;
  let effect: { action: Action; score: number } | null = null;
  let board: { action: Action; score: number } | null = null;
  // Les déplacements, attaques et cartes posées d'abord, puis les effets et les sorts : ceux-ci se comparent à ce que
  // l'action qui les suit aurait donné seule (`plain`).
  const plain = new Map<string, number>();
  const ordered = [...actions.filter((a) => !isUse(a)), ...actions.filter(isUse)];
  for (const action of ordered) {
    if (action.type === 'endTurn') continue;
    const next = tryAction(known, action);
    if (!next) continue;
    // Une action vaut ce que vaut la position après elle, ou après la meilleure action qui la suit pour le même monstre.
    const own = evaluate(next, me);
    if (!isUse(action)) plain.set(actionKey(action), own);
    let score = own;
    for (const followUp of getFollowUps(known, action, next, me)) {
      const after = tryAction(next, followUp);
      if (!after) continue;
      const value = evaluate(after, me);
      // Un effet qui suit ne compte que s'il serait joué : sinon un déplacement serait noté avec un piège qu'elle ne
      // posera pas, et elle ferait des allers-retours.
      if (isUse(followUp) && value < own + W.useGain) continue;
      // Un effet ou un sort ne prend pas à son compte ce que l'action suivante rapporterait sans lui (un piège posé
      // avant d'aller prendre une zone, un buff avant un déplacement).
      const alone = isUse(action) ? plain.get(actionKey(followUp)) : undefined;
      if (alone !== undefined && value < alone + W.useGain) continue;
      // Deux actions pour le résultat d'une seule valent un peu moins : poser son piège d'ici plutôt que d'aller le
      // poser d'à côté (sans quoi, à égalité, elle irait d'une case à l'autre).
      score = Math.max(score, value - MIN_GAIN);
    }
    const scored = { action, score, next };
    if (isWide(action)) wide.push(scored);
    // Un effet ou un sort qui n'apporte presque rien (un piège loin de tout, un buff sans cible) ne vaut pas son mana.
    if (isUse(action) && score < base + W.useGain) continue;
    candidates.push(scored);
    if (score > bestScore) {
      best = action;
      bestScore = score;
      bestNext = next;
    }
    if (action.type === 'activateEffect' && score > (effect?.score ?? -Infinity)) effect = { action, score };
    if (isBoardAction(action) && score > (board?.score ?? -Infinity)) board = { action, score };
  }
  wide.sort((a, b) => b.score - a.score);
  const result = (pick: Action) => ({ base, pick, candidates, wide });
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

/** Clé d'une action, pour retrouver la même action jouée sans l'effet ou le sort qui la précède. */
function actionKey(action: Action): string {
  switch (action.type) {
    case 'move':
      return `move ${action.unitId} ${action.to.row},${action.to.col}`;
    case 'attack':
      return `attack ${action.unitId} ${action.targetId} ${action.advance}`;
    default:
      return JSON.stringify(action);
  }
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
    case 'attackCell':
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
  const effects = getMonsterCard(after.cards, monster.cardId).activated.flatMap((ability, i) =>
    // Après un déplacement ou une invocation, son effet seulement s'il dépend de l'endroit où il se trouve (Mage,
    // Chaman, dragons) ou de la case des pièges à poser ; évoluer vaut autant d'ici que d'ailleurs.
    !monster.usedEffects.includes(i) &&
    getEffectCost(after, monster, ability) <= after.players[me].mana &&
    (!quick ||
      ability.targeting.type === 'zone' ||
      ability.effects.some((effect) => effect.type === 'placeTrap') ||
      (ability.targeting.type === 'monster' && ability.targeting.reach.type !== 'anywhere'))
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
  // Flèche explosive armée : un tir sur une case vide, seulement là où ses éclats touchent un ennemi qu'il voit.
  for (const pos of getAttackCells(state, monster)) {
    if (monstersOf(state, monster.owner === 1 ? 2 : 1).some((enemy) => isInSquare(state.board, pos, enemy.pos))) actions.push({ type: 'attackCell', unitId: monster.id, pos });
  }
  if (moves && monster.mobilityLeft + getOnMoveBonus(state, monster) > 0 && canMove(monster)) {
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
  // Économie classique : le mana non dépensé est perdu au début du tour suivant, il ne vaut que tant que c'est son tour.
  // « Réserve » : il se garde, et vaut autant une fois le tour fini (grosse carte au tour suivant).
  const mana = state.activePlayer === me || state.economy === 'reserve' ? state.players[me].mana : 0;
  let score =
    (state.players[me].vp - state.players[other].vp) * W.vp +
    Math.min(mana, W.hoardFrom) * W.mana +
    Math.max(0, mana - W.hoardFrom) * W.hoard +
    heldSpells(state.cards, state.players[me].grimoire) * W.spellHeld;

  for (const unit of Object.values(state.units)) {
    const sign = unit.owner === me ? 1 : -1;
    score += sign * unitValue(state, unit);
    // Un monstre que ses burn vont détruire : le VP en ira à l'autre camp (§4.2).
    if (unit.kind === 'monster' && pendingBurn(state, unit) >= unit.hp) score -= sign * W.vp * W.doomed;
  }

  const enemies = monstersOf(state, other);
  // Où les monstres de chaque camp peuvent aller à leur prochain tour : calculé une fois, s'il le faut.
  const walkersOf = (monsters: readonly MonsterUnit[]) =>
    monsters.map((monster) => ({ monster, mobility: nextMobility(state, monster), flying: canFly(state.cards, monster) }));
  let enemyWalkers: Walker[] | null = null;
  let ownWalkers: Walker[] | null = null;
  const walkers = () => (enemyWalkers ??= walkersOf(enemies));
  // Mana zones, quand l'IA finit son tour : l'adversaire touche aussitôt, au début du sien, le VP et le mana de celles
  // qu'il tient ; celles de l'IA ne lui rapportent qu'au début de son tour suivant, si l'adversaire ne vient pas les
  // contester d'ici là. Une zone contestée ne rapporte rien à personne : y entrer prive l'adversaire de son revenu.
  const zones = getManaZones(state.board);
  const control = zones.map(({ pos }) => getZoneController(state, pos));
  zones.forEach(({ pos }, i) => {
    const controller = control[i]!;
    if (controller === null) return;
    const income = W.vp + W.zoneMana * getZoneMana(state, pos, controller);
    if (controller !== me || state.activePlayer !== me) score += (controller === me ? 1 : -1) * income;
    else score += income * (zoneThreatened(state, pos, walkers()) ? W.holdThreatened : W.hold);
  });

  // Avancer vers les mana zones qu'on ne tient pas, ni ne tenait au début de la décision (`targets`), une de leurs cases
  // en mode contestation ; sinon, vers l'ennemi. En cases de marche : murs et falaises font faire le tour. Un seul
  // monstre garde chaque zone : en mode contestation, les autres de la même zone repartent vers les suivantes.
  const open = zones.filter(({ zone }, i) => control[i] !== me && (targets[me]?.has(zone) ?? true));
  const guarded = new Set<number>();
  const zoneOf = zoneAt(state.board, state.mode);
  let hunt: Int16Array | null = null;
  for (const monster of monstersOf(state, me)) {
    const here = index(state.board, monster.pos);
    const zone = zoneOf[here]!;
    if (zone >= 0 && !guarded.has(zone)) {
      guarded.add(zone);
      continue;
    }
    if (open.length > 0) {
      const flying = canFly(state.cards, monster);
      score -= W.approach * Math.min(...open.map(({ pos }) => zoneDistances(state.board, state.mode, pos, flying)[here]!));
    } else if (enemies.length > 0) {
      hunt ??= walkDistances(state.board, enemies.map((e) => e.pos), false);
      score -= W.hunt * hunt[here]!;
    }
  }

  // Un piège ne dure que jusqu'au prochain tour de son poseur : il ne vaut rien si aucun ennemi ne peut marcher dessus
  // d'ici là (avec la mobilité de son prochain tour), et d'autant plus qu'il est près des mana zones qu'il vient prendre.
  for (const trap of state.traps) {
    if (trap.owner !== me || !canReach(state, walkers(), trap.pos)) continue;
    const here = index(state.board, trap.pos);
    const near = Math.min(...zones.map(({ pos }) => zoneDistances(state.board, state.mode, pos, false)[here]!));
    score += W.trap * (W.trapFar + (1.75 - W.trapFar) * Math.max(0, 1 - near / W.trapReach));
  }
  // Une case brûlée ne blesse que l'ennemi qui y entre : elle vaut surtout là où il peut aller, et dans les zones des mana
  // zones, où il doit entrer.
  for (const cell of state.burningCells) {
    const mine = cell.owner === me;
    const reachable = canReach(state, mine ? walkers() : (ownWalkers ??= walkersOf(monstersOf(state, me))), cell.pos);
    const value = W.burning * (!reachable ? W.burningFar : zoneOf[index(state.board, cell.pos)]! >= 0 ? W.burningZone : 1);
    score += mine ? value : -value;
  }
  score -= strikeLosses(state, other) * W.threat;
  score += strikeLosses(state, me) * W.opportunity;
  return score;
}

/** Mobilité d'un monstre à son prochain tour, avec le +1 d'un Terrain de chasse s'il part de sa zone ; -1 s'il ne pourra pas agir. */
function nextMobility(state: GameState, monster: MonsterUnit): number {
  const next = ownerNextTurn(state.turn, state.activePlayer, monster.owner);
  if (monster.statuses.some((s) => s.kind === 'stun' && s.expiresAtTurn > next)) return -1;
  return (
    getNextTurnMobility(state.cards, monster, state.turn, state.activePlayer) +
    getNextTurnOnMoveBonus(state, monster, state.turn, state.activePlayer)
  );
}

/** Un monstre et sa mobilité au prochain tour (-1 : il ne pourra pas agir). */
interface Walker {
  readonly monster: MonsterUnit;
  readonly mobility: number;
  readonly flying: boolean;
}

/** Un des `walkers` peut marcher jusqu'à `pos` à son prochain tour (en cases de marche, sans les unités). */
function canReach(state: GameState, walkers: readonly Walker[], pos: Position): boolean {
  return walkers.some(({ monster, mobility, flying }) => cellDistances(state.board, pos, flying)[index(state.board, monster.pos)]! <= mobility);
}

/**
 * En mode contestation, les ennemis qui peuvent entrer dans la zone de la mana zone en `pos` à leur prochain tour
 * l'égaliseraient (elle serait contestée, sans revenu) ou la prendraient : leurs unités, celles déjà dedans et celles qui
 * arrivent (1 chacune), rejoignent ou dépassent les nôtres, terrain compris (§4.4 bis).
 */
function zoneThreatened(state: GameState, pos: Position, walkers: readonly Walker[]): boolean {
  if (state.mode === 'normal') return false;
  const me = state.activePlayer;
  let mine = 0;
  let theirs = 0;
  for (const cell of getZoneCells(state.board, state.mode, pos)) {
    for (const unit of getUnitsAt(state, cell)) {
      // Un de mes terrains tient la zone quoi qu'il arrive (§4.4 bis) ; seuls les monstres se comptent.
      if (unit.kind === 'terrain') {
        if (unit.owner === me) return false;
      } else if (unit.owner === me) mine++;
      else theirs++;
    }
  }
  const inZone = (monster: MonsterUnit) => getZoneCells(state.board, state.mode, pos).some((cell) => samePos(cell, monster.pos));
  for (const { monster, mobility, flying } of walkers) {
    if (!inZone(monster) && zoneDistances(state.board, state.mode, pos, flying)[index(state.board, monster.pos)]! <= mobility) theirs++;
  }
  return theirs >= mine;
}

/** Gardé par jeu de cartes, puis par grimoire. */
const heldCache = new WeakMap<CardSet, WeakMap<readonly CardId[], number>>();

/** Mana des sorts encore au grimoire (calculé une fois par grimoire : il ne change que quand une carte est jouée). */
function heldSpells(cards: CardSet, grimoire: readonly CardId[]): number {
  let byGrimoire = heldCache.get(cards);
  if (!byGrimoire) heldCache.set(cards, (byGrimoire = new WeakMap()));
  let total = byGrimoire.get(grimoire);
  if (total === undefined) {
    total = 0;
    for (const id of grimoire) {
      const card = getCard(cards, id);
      if (card.kind === 'spell') total += card.cost;
    }
    byGrimoire.set(grimoire, total);
  }
  return total;
}

function monstersOf(state: GameState, player: PlayerId): MonsterUnit[] {
  return Object.values(state.units).filter((u): u is MonsterUnit => u.kind === 'monster' && u.owner === player);
}

const index =(board: Board, pos: Position) => pos.row * board.cols + pos.col;

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

const zoneAtCache = new WeakMap<Board, Partial<Record<GameMode, Int8Array>>>();

/**
 * Pour chaque case, le rang (dans `getManaZones`) de la mana zone dont la zone la contient, -1 hors des zones ; calculé
 * une fois par plateau et par mode.
 */
function zoneAt(board: Board, mode: GameMode): Int8Array {
  let cache = zoneAtCache.get(board);
  if (!cache) zoneAtCache.set(board, (cache = {}));
  let at = cache[mode];
  if (!at) {
    const cells = new Int8Array(board.rows * board.cols).fill(-1);
    getManaZones(board).forEach(({ pos }, i) => {
      for (const cell of getZoneCells(board, mode, pos)) {
        if (isPlayable(board, cell) && cells[index(board, cell)] === -1) cells[index(board, cell)] = i;
      }
    });
    cache[mode] = at = cells;
  }
  return at;
}

/** Distances de marche vers une case, calculées une fois par plateau. */
const cellDistanceCache = new WeakMap<Board, Map<number, Int16Array>>();

function cellDistances(board: Board, pos: Position, flying: boolean): Int16Array {
  let cache = cellDistanceCache.get(board);
  if (!cache) cellDistanceCache.set(board, (cache = new Map()));
  const key = index(board, pos) * 2 + (flying ? 1 : 0);
  let dist = cache.get(key);
  if (!dist) {
    dist = walkDistances(board, [pos], flying);
    cache.set(key, dist);
  }
  return dist;
}

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


/**
 * ATK qu'un monstre garde d'un tour à l'autre : sans le bonus du tour (Dopage, Flèche divine) ni le carreau armé
 * (Carreau perforant), perdus à la fin du tour.
 */
function durableAtk(state: GameState, monster: MonsterUnit): number {
  return Math.max(0, getAtk(state, monster) - monster.atkBonus - (monster.armed?.atk ?? 0));
}

/**
 * PV que les burn d'une unité lui feront encore perdre, au début des prochains tours de son camp (§4.2, §5 bis), si rien
 * ne change d'ici là (ni soin, ni nouveau burn). `first` : seulement au début de son prochain tour.
 */
export function pendingBurn(state: GameState, unit: Unit, first = false): number {
  if (unit.statuses.length === 0) return 0;
  const next = ownerNextTurn(state.turn, state.activePlayer, unit.owner);
  let total = 0;
  for (const status of unit.statuses) {
    if (status.kind !== 'burn' || status.expiresAtTurn <= next) continue;
    // Il agit au début de chacun de ses tours, jusqu'au tour où il disparaît (exclu).
    total += status.amount * (first ? 1 : Math.ceil((status.expiresAtTurn - next) / 2));
  }
  return total;
}

/**
 * Valeur d'une unité : ses caractéristiques durables (le bonus d'ATK du tour n'en fait pas partie), avec les PV que ses
 * burn vont lui faire perdre. Un monstre qu'ils vont détruire ne vaut presque plus rien (son VP va à l'autre camp,
 * `evaluate`) : rien s'il meurt avant d'agir de nouveau, `doomedActs` s'il a encore un tour.
 */
function unitValue(state: GameState, unit: Unit): number {
  const burn = pendingBurn(state, unit);
  if (unit.kind === 'terrain') return burn >= unit.hp ? 0 : 2 + (unit.hp - burn) * 0.5;
  const card = getMonsterCard(state.cards, unit.cardId);
  const atk = durableAtk(state, unit);
  const statsValue = (form: MonsterCard, atk: number, hp: number) => 1 + 1.5 * atk + hp + 0.4 * form.mobility + 0.8 * (form.range - 1);
  if (burn >= unit.hp) {
    const first = pendingBurn(state, unit, true);
    return first >= unit.hp ? 0 : W.doomedActs * statsValue(card, atk, unit.hp - first);
  }
  let value = statsValue(card, atk, unit.hp - burn);
  // Un monstre qui change de forme (Emma) vaut la meilleure des deux : il y revient quand il veut, en payant le mana.
  for (const ability of card.activated) {
    for (const effect of ability.effects) {
      if (effect.type !== 'transform') continue;
      const form = getMonsterCard(state.cards, effect.into);
      const hp = Math.max(1, form.hp + unit.maxHp - card.hp - (unit.otherFormDamage ?? 0) - burn);
      value = Math.max(value, statsValue(form, atk + form.atk - card.atk, hp) - ability.manaCost * W.mana);
    }
  }
  if (unit.statuses.some((s) => s.kind === 'requiem')) value *= 0.3;
  return value;
}


/**
 * Ce que `attacker` peut faire perdre à l'autre camp à son prochain tour (portées calculées par `reach.ts`) : chaque
 * monstre frappe une fois par attaque qu'il a (deux pour un archer couvert par un Écuyer) ; ils détruisent d'abord ce
 * qui rapporte le plus par attaque engagée (la valeur de l'unité, plus un VP pour un monstre), puis les attaques qui
 * restent entament la cible la plus abîmée qu'elles atteignent.
 */
export function strikeLosses(state: GameState, attacker: PlayerId): number {
  const strikers = getStrikers(
    state,
    attacker,
    (monster) => nextMobility(state, monster),
    (monster) => durableAtk(state, monster),
    // Il ne frappe pas ce qu'il ne voit pas (Farceur, Pénombre).
    (unit) => !isHiddenFrom(state, unit, attacker),
  );
  const lossOf = (unit: Unit) => unitValue(state, unit) + (unit.kind === 'monster' ? W.vp : 0);
  // Un monstre qui a plusieurs attaques par tour (un archer dans le carré de 1 d'un Écuyer, Carquois prêt !) frappe
  // autant de fois, depuis où il est couvert aujourd'hui.
  const free = new Set(strikers.flatMap((striker) => Array.from({ length: attackLimit(state, striker.monster) }, () => ({ ...striker }))));
  const hp = new Map<Unit, number>();
  // Ses burn finiront ce qu'une attaque entame (le VP va au camp de l'attaquant) ; un monstre qu'ils détruiront de toute
  // façon n'est plus une cible (sa perte est déjà comptée, `evaluate`).
  const hpOf = (unit: Unit) => hp.get(unit) ?? unit.hp - pendingBurn(state, unit);
  let losses = 0;
  for (;;) {
    let best: { target: Unit; team: Striker[]; gain: number } | null = null;
    const targets = new Set<Unit>();
    for (const striker of free) for (const { target } of striker.hits) targets.add(target);
    for (const target of targets) {
      // Sous carapace, il ne descend pas sous 1 PV pendant le tour adverse (Carapace, Fortification, §5 bis) : pas une
      // destruction possible.
      if (hpOf(target) <= 0 || hasCarapace(target)) continue;
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
    hp.set(best.target, 0);
    // Un échange perdant, il ne le ferait pas.
    losses += Math.max(0, lossOf(best.target) - W.revenge * revenge(state, best.target, best.team, lossOf, (unit) => hpOf(unit) > 0));
    for (const striker of best.team) free.delete(striker);
  }
  for (const striker of free) {
    let chip = 0;
    for (const { target, damage } of striker.hits) {
      const room = hasCarapace(target) ? Math.min(hpOf(target), target.hp - 1) : hpOf(target);
      if (room > 0) chip = Math.max(chip, Math.min(damage, room));
    }
    losses += chip;
  }
  return losses;
}

/**
 * Ce que le camp de `target` peut reprendre au tour suivant, une fois `target` détruite par `team` : ceux qui l'ont
 * détruite se tiennent à leur portée de sa case ; un autre de ses monstres encore en vie (`alive`) qui peut venir les
 * frapper et en détruire un se venge sur le plus précieux. Un monstre qu'elle peut venger se risque donc plus volontiers.
 */
function revenge(state: GameState, target: Unit, team: readonly Striker[], lossOf: (unit: Unit) => number, alive: (unit: Unit) => boolean): number {
  let best = 0;
  for (const avenger of monstersOf(state, target.owner)) {
    if (avenger.id === target.id || !alive(avenger)) continue;
    const mobility = nextMobility(state, avenger);
    if (mobility < 0) continue;
    const atk = durableAtk(state, avenger);
    const distance = cellDistances(state.board, target.pos, canFly(state.cards, avenger))[index(state.board, avenger.pos)]!;
    const reach = mobility + getMonsterCard(state.cards, avenger.cardId).range;
    for (const { monster: killer } of team) {
      if (atk < killer.hp || distance + getMonsterCard(state.cards, killer.cardId).range > reach) continue;
      best = Math.max(best, lossOf(killer));
    }
  }
  return best;
}
