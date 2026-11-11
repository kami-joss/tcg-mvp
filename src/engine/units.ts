// Unités sur le plateau : création, recherche et mise à jour immuable.
import { isInZone } from './board';
import { getMonsterCard, getTerrainCard } from './cards';
import { CAMOUFLAGE_RADIUS, INVISIBLE_RADIUS } from './config';
import { IllegalActionError } from './errors';
import type {
  BoardState,
  CardCopy,
  CardId,
  CardSet,
  Direction,
  GameState,
  Keyword,
  KeywordOf,
  MonsterCard,
  MonsterUnit,
  PlayerId,
  Position,
  StatAura,
  StatKey,
  Status,
  TerrainCard,
  TerrainUnit,
  Unit,
  UnitId,
} from './types';

/** Orientation d'un monstre qui ne s'est pas encore déplacé : vers le camp adverse (J1 en haut, J2 en bas). */
export const INITIAL_FACING: Readonly<Record<PlayerId, Direction>> = { 1: 'down', 2: 'up' };

/** Nouveau monstre. */
export function createMonsterUnit(
  id: UnitId,
  card: MonsterCard,
  owner: PlayerId,
  pos: Position,
  turn = 0,
): MonsterUnit {
  return {
    kind: 'monster',
    id,
    cardId: card.id,
    owner,
    pos,
    hp: card.hp,
    maxHp: card.hp,
    atk: card.atk,
    atkBonus: 0,
    rangeBonus: 0,
    auraHp: 0,
    mobilityLeft: card.mobility,
    froze: 0,
    boost: 0,
    turnBonuses: [],
    hasAttacked: false,
    attacksMade: 0,
    usedEffects: [],
    trail: [pos],
    hasRiposted: false,
    summonedOnTurn: turn,
    facing: INITIAL_FACING[owner],
    statuses: [],
    revealed: false,
  };
}

export function createTerrainUnit(id: UnitId, card: TerrainCard, owner: PlayerId, pos: Position): TerrainUnit {
  return { kind: 'terrain', id, cardId: card.id, owner, pos, hp: card.hp, maxHp: card.hp, statuses: [] };
}

/** Le mot-clé `keyword` de la carte du monstre, avec ses valeurs ; `undefined` s'il ne l'a pas. */
export function getKeyword<K extends Keyword>(cards: CardSet, monster: MonsterUnit, keyword: K): KeywordOf<K> | undefined {
  return getMonsterCard(cards, monster.cardId).keywords.find((spec): spec is KeywordOf<K> => spec.keyword === keyword);
}

export function hasKeyword(cards: CardSet, monster: MonsterUnit, keyword: Keyword): boolean {
  return getKeyword(cards, monster, keyword) !== undefined;
}

/** Une case contient au plus un monstre et un terrain. */
/**
 * Index des unités par case, calculé une fois par objet `units` : les états ne sont jamais modifiés (on en crée de
 * nouveaux), l'index d'un objet `units` reste donc juste. Il rend `getUnitsAt` rapide pour les parcours (déplacements,
 * tirs) et l'IA.
 */
const unitsByCell = new WeakMap<BoardState['units'], Map<string, Unit[]>>();

function cellIndex(units: BoardState['units']): Map<string, Unit[]> {
  let index = unitsByCell.get(units);
  if (!index) {
    index = new Map();
    for (const unit of Object.values(units)) {
      const key = `${unit.pos.row},${unit.pos.col}`;
      const here = index.get(key);
      if (here) here.push(unit);
      else index.set(key, [unit]);
    }
    unitsByCell.set(units, index);
  }
  return index;
}

export function getUnitsAt(state: BoardState, pos: Position): Unit[] {
  return [...(cellIndex(state.units).get(`${pos.row},${pos.col}`) ?? [])];
}

export function getMonsterAt(state: BoardState, pos: Position): MonsterUnit | undefined {
  return getUnitsAt(state, pos).find((unit) => unit.kind === 'monster');
}

export function getMonsters(state: BoardState, owner: PlayerId): MonsterUnit[] {
  return Object.values(state.units).filter(
    (unit): unit is MonsterUnit => unit.kind === 'monster' && unit.owner === owner,
  );
}

/** Monstre du joueur actif désigné par une action ; lève une `IllegalActionError` sinon. */
export function getActiveMonster(state: GameState, unitId: UnitId): MonsterUnit {
  const unit = state.units[unitId];
  if (!unit) throw new IllegalActionError(`Unité inconnue : ${unitId}`);
  if (unit.kind !== 'monster') throw new IllegalActionError(`${unitId} n'est pas un monstre`);
  if (unit.owner !== state.activePlayer) {
    throw new IllegalActionError(`${unitId} n'appartient pas au joueur actif (J${state.activePlayer})`);
  }
  return unit;
}

/**
 * Ajoute ou remplace une unité. Un monstre qui change de case l'ajoute à son chemin du tour (`trail`), quelle que soit
 * la façon dont il y arrive (déplacement, recul, avancée, téléportation, retour).
 */
export function setUnit(state: GameState, unit: Unit): GameState {
  const previous = state.units[unit.id];
  const last = unit.kind === 'monster' ? unit.trail.at(-1) : undefined;
  const moved =
    unit.kind === 'monster' && previous !== undefined && (previous.pos.row !== unit.pos.row || previous.pos.col !== unit.pos.col);
  const next = moved && (!last || last.row !== unit.pos.row || last.col !== unit.pos.col) ? { ...unit, trail: [...unit.trail, unit.pos] } : unit;
  return { ...state, units: { ...state.units, [unit.id]: next } };
}

/** Pose une nouvelle unité avec le prochain identifiant (u1, u2…). */
export function addUnit(state: GameState, create: (id: UnitId) => Unit): GameState {
  const id = `u${state.nextUnitId}`;
  return { ...setUnit(state, create(id)), nextUnitId: state.nextUnitId + 1 };
}

/** La carte d'une unité dans les listes publiques : pour une forme hors grimoire (la chauve-souris d'Emma), son origine. */
export function cardOfOrigin(cards: CardSet, unit: Unit): CardId {
  return unit.kind === 'monster' ? (getMonsterCard(cards, unit.cardId).formOf ?? unit.cardId) : unit.cardId;
}

/**
 * L'unité quitte le plateau (détruite, sacrifiée, tuée par requiem) : sa carte d'origine va au cimetière de son joueur
 * (§4.3), brillante si l'unité l'était.
 */
export function removeUnit(state: GameState, unitId: UnitId): GameState {
  const { [unitId]: removed, ...units } = state.units;
  if (!removed) return state;
  const owner = state.players[removed.owner];
  const copy: CardCopy = removed.shiny ? { cardId: cardOfOrigin(state.cards, removed), shiny: true } : { cardId: cardOfOrigin(state.cards, removed) };
  return { ...state, units, players: { ...state.players, [owner.id]: { ...owner, graveyard: [...owner.graveyard, copy] } } };
}

/** Bonus d'ATK des auras (Arnold, §5.2) : chaque monstre allié autour dont l'aura vise la famille du monstre (cumulés). */
export function auraAtk(state: BoardState, monster: MonsterUnit): number {
  return auraSources(state, monster).reduce((total, other) => total + (auraOf(state.cards, other)?.atk ?? 0), 0);
}

/** L'aura d'une unité : celle de sa carte, monstre ou terrain (Salle de sport). */
function auraOf(cards: CardSet, unit: Unit): StatAura | null {
  return unit.kind === 'monster' ? getMonsterCard(cards, unit.cardId).aura : getTerrainCard(cards, unit.cardId).aura;
}

/**
 * Les alliés dont l'aura couvre `monster` : monstres et terrains de même camp dont l'aura vise sa famille et dont la
 * zone le contient (carré de 1, carré de 2, ou case du terrain et carré de 1), pas lui-même.
 */
export function auraSources(state: BoardState, monster: MonsterUnit): Unit[] {
  const archetype = getMonsterCard(state.cards, monster.cardId).archetype;
  if (!archetype) return [];
  return Object.values(state.units).filter((other) => {
    if (other.owner !== monster.owner || other.id === monster.id) return false;
    const aura = auraOf(state.cards, other);
    return aura?.archetype === archetype && isInZone(state.board, other.pos, monster.pos, aura.zone);
  });
}

/**
 * Coût d'activation d'un effet actif de `monster` : celui de la carte, ou le coût fixé par une aura alliée qui le couvre
 * (Nid de dragons : 1), le plus bas s'il y en a plusieurs ; jamais plus que le coût de la carte.
 */
export function getEffectCost(state: BoardState, monster: MonsterUnit, ability: { readonly manaCost: number }): number {
  const fixed = auraSources(state, monster).map((other) => auraOf(state.cards, other)?.effectCost).filter((n): n is number => n !== undefined);
  return Math.min(ability.manaCost, ...fixed);
}

/** Le monstre survole les cases X : mot-clé Vol de sa carte, ou statut Vol (§5.6, §5 bis). */
export function canFly(cards: CardSet, monster: MonsterUnit): boolean {
  return hasKeyword(cards, monster, 'vol') || monster.statuses.some((status) => status.kind === 'vol');
}

/** Somme des statuts `stat` (ATK, mobilité, portée ou PV max) de `unit`, signés : +X compte, −X retire. */
export function statTotal(unit: { readonly statuses: readonly Status[] }, stat: StatKey): number {
  return unit.statuses.reduce((total, status) => (status.kind === 'stat' && status.stat === stat ? total + status.amount : total), 0);
}

/** ATK actuelle d'un monstre : la sienne, plus le bonus du tour, les auras, son bonus d'armé et ses statuts d'ATK. C'est elle qui frappe et qui riposte. */
export function getAtk(state: BoardState, monster: MonsterUnit): number {
  return Math.max(0, monster.atk + monster.atkBonus + auraAtk(state, monster) + (monster.armed?.atk ?? 0) + statTotal(monster, 'atk'));
}

/** PV qu'apportent les auras à `monster` (Origine : +1 par Origine alliée dans son carré de 1). */
export function auraHp(state: BoardState, monster: MonsterUnit): number {
  return auraSources(state, monster).reduce((total, other) => total + (auraOf(state.cards, other)?.hp ?? 0), 0);
}

/** Mobilité qu'apportent les auras à `monster`, comptée au début de son tour (Origine, §10). */
export function auraMobility(state: BoardState, monster: MonsterUnit): number {
  return auraSources(state, monster).reduce((total, other) => total + (auraOf(state.cards, other)?.mobility ?? 0), 0);
}

/** Bonus de portée des auras (Camps de tir) : les sources dont l'aura couvre `monster`, cumulées. */
export function auraRange(state: BoardState, monster: MonsterUnit): number {
  return auraSources(state, monster).reduce((total, other) => total + (auraOf(state.cards, other)?.range ?? 0), 0);
}

/** Rayon de révélation qu'apportent les auras à `monster` (Terrain de jeu : invisible, 1) : le plus grand des sources qui le couvrent ; 0 sinon. */
export function auraStealth(state: BoardState, monster: MonsterUnit): number {
  return Math.max(
    0,
    ...auraSources(state, monster).map((other) => {
      const stealth = auraOf(state.cards, other)?.stealth;
      return stealth === 'camouflage' ? CAMOUFLAGE_RADIUS : stealth === 'invisible' ? INVISIBLE_RADIUS : 0;
    }),
  );
}

/** Portée actuelle d'un monstre : celle de sa carte, plus le bonus du tour (Flèche divine) et les auras. C'est elle qui sert à attaquer. */
export function getRange(state: BoardState, monster: MonsterUnit): number {
  return Math.max(0, getMonsterCard(state.cards, monster.cardId).range + monster.rangeBonus + auraRange(state, monster) + statTotal(monster, 'range'));
}

/**
 * Nombre d'attaques de `monster` par tour (§4.7) : 1, ou davantage tant qu'un allié dont l'aura le donne le couvre
 * (Carquois prêt ! : 2 au total, plusieurs auras ne s'additionnent pas).
 */
export function attackLimit(state: BoardState, monster: MonsterUnit): number {
  return Math.max(1, ...auraSources(state, monster).map((other) => auraOf(state.cards, other)?.attacks ?? 0));
}

/** Il lui reste une attaque ce tour : ni stun, ni « plus d'attaque ce tour », et moins d'attaques faites que sa limite du moment. */
export function canAttack(state: BoardState, monster: MonsterUnit): boolean {
  if (monster.statuses.some((status) => status.kind === 'stun' || status.kind === 'desarme')) return false;
  if (monster.hasAttacked && monster.attacksMade === 0) return false;
  return monster.attacksMade < attackLimit(state, monster);
}
