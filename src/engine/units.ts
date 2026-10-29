// Unités sur le plateau : création, recherche et mise à jour immuable.
import { isAdjacent } from './board';
import { getMonsterCard } from './cards';
import { IllegalActionError } from './errors';
import type {
  BoardState,
  Direction,
  GameState,
  Keyword,
  KeywordOf,
  MonsterCard,
  MonsterUnit,
  PlayerId,
  Position,
  TerrainCard,
  TerrainUnit,
  Unit,
  UnitId,
} from './types';

/** Orientation d'un monstre qui ne s'est pas encore déplacé : vers le camp adverse (J1 en haut, J2 en bas). */
export const INITIAL_FACING: Readonly<Record<PlayerId, Direction>> = { 1: 'down', 2: 'up' };

/** Nouveau monstre ; `mobilityBonus` : mobilité en plus du plateau (SPEC.md §3). */
export function createMonsterUnit(
  id: UnitId,
  card: MonsterCard,
  owner: PlayerId,
  pos: Position,
  turn = 0,
  mobilityBonus = 0,
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
    mobilityLeft: card.mobility + mobilityBonus,
    froze: 0,
    boost: 0,
    turnBonuses: [],
    hasAttacked: false,
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
export function getKeyword<K extends Keyword>(monster: MonsterUnit, keyword: K): KeywordOf<K> | undefined {
  return getMonsterCard(monster.cardId).keywords.find((spec): spec is KeywordOf<K> => spec.keyword === keyword);
}

export function hasKeyword(monster: MonsterUnit, keyword: Keyword): boolean {
  return getKeyword(monster, keyword) !== undefined;
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

/** L'unité quitte le plateau (détruite, sacrifiée, tuée par requiem) : sa carte va au cimetière de son joueur (§4.3). */
export function removeUnit(state: GameState, unitId: UnitId): GameState {
  const { [unitId]: removed, ...units } = state.units;
  if (!removed) return state;
  const owner = state.players[removed.owner];
  return { ...state, units, players: { ...state.players, [owner.id]: { ...owner, graveyard: [...owner.graveyard, removed.cardId] } } };
}

/** Bonus d'ATK des auras (Arnold, §5.2) : chaque monstre allié autour dont l'aura vise la famille du monstre (cumulés). */
export function auraAtk(state: BoardState, monster: MonsterUnit): number {
  return auraSources(state, monster).reduce((total, other) => total + (getMonsterCard(other.cardId).aura?.atk ?? 0), 0);
}

/** Les alliés dont l'aura couvre `monster` : même famille, sur une des 8 cases autour, pas lui-même. */
export function auraSources(state: BoardState, monster: MonsterUnit): MonsterUnit[] {
  const archetype = getMonsterCard(monster.cardId).archetype;
  if (!archetype) return [];
  return getMonsters(state, monster.owner).filter((other) => {
    const aura = getMonsterCard(other.cardId).aura;
    return other.id !== monster.id && aura?.archetype === archetype && isAdjacent(state.board, other.pos, monster.pos);
  });
}

/** ATK actuelle d'un monstre : la sienne, plus le bonus du tour et les auras. C'est elle qui frappe et qui riposte. */
export function getAtk(state: BoardState, monster: MonsterUnit): number {
  return monster.atk + monster.atkBonus + auraAtk(state, monster);
}

/** PV qu'apportent les auras à `monster` (Origine : +1 par Origine alliée adjacente). */
export function auraHp(state: BoardState, monster: MonsterUnit): number {
  return auraSources(state, monster).reduce((total, other) => total + (getMonsterCard(other.cardId).aura?.hp ?? 0), 0);
}

/** Mobilité qu'apportent les auras à `monster`, comptée au début de son tour (Origine, §10). */
export function auraMobility(state: BoardState, monster: MonsterUnit): number {
  return auraSources(state, monster).reduce((total, other) => total + (getMonsterCard(other.cardId).aura?.mobility ?? 0), 0);
}

/** Portée actuelle d'un monstre : celle de sa carte, plus le bonus du tour (Flèche divine). C'est elle qui sert à attaquer. */
export function getRange(monster: MonsterUnit): number {
  return getMonsterCard(monster.cardId).range + monster.rangeBonus;
}
