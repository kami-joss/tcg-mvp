// Zones de déplacement, d'attaque et de danger (handoff « zones », SPEC.md §10) : logique pure, sans React.
// « Aller » et « attaquer » d'un monstre, et le danger de l'équipe adverse, d'après les règles du moteur
// (`movement.ts` pour les déplacements, `getStrikeCells` de `combat.ts` pour les tirs).
import {
  canAttack,
  getMonsterCard,
  getMoveDestinations,
  getMovePath,
  getNextTurnMobility,
  getNextTurnOnMoveBonus,
  getRange,
  getStrikeCells,
  getUnitsAt,
  ownerNextTurn,
} from '../engine';
import type { MonsterUnit, PlayerId, PlayerView, Position, UnitId } from '../engine';

const key = (pos: Position): string => `${pos.row},${pos.col}`;

/** Zones d'un monstre : `moves`, les cases où il peut aller ; `attacks`, les autres cases qu'il peut frapper. */
export interface UnitZones {
  readonly moves: readonly Position[];
  readonly attacks: readonly Position[];
}

export const NO_ZONES: UnitZones = { moves: [], attacks: [] };

/**
 * Le monstre tel qu'il se déplacerait : à son tour (ton monstre, à ton tour), tel qu'il est ; sinon à son prochain
 * tour, avec la mobilité de ce tour-là (statuts et Terrain de chasse compris). `null` s'il ne pourra pas bouger.
 */
function moverOf(view: PlayerView, unit: MonsterUnit): MonsterUnit | null {
  if (isNow(view, unit)) return unit;
  const next = ownerNextTurn(view.turn, view.activePlayer, unit.owner);
  if (unit.statuses.some((s) => s.kind === 'stun' && s.expiresAtTurn > next)) return null;
  // Le +1 d'un Terrain de chasse est déjà compté : pas une deuxième fois.
  const mobility = getNextTurnMobility(unit, view.turn, view.activePlayer) + getNextTurnOnMoveBonus(view, unit, view.turn, view.activePlayer);
  return { ...unit, mobilityLeft: mobility, onMoveTaken: true };
}

/** Ses zones de maintenant : un de tes monstres, à ton tour. Les autres montrent celles de leur prochain tour. */
function isNow(view: PlayerView, unit: MonsterUnit): boolean {
  return unit.owner === view.viewer && view.activePlayer === view.viewer;
}

/** Peut-il attaquer à ce tour-là ? Maintenant : s'il lui reste une attaque ; au prochain tour : sans stun ni désarmé. */
function canStrike(view: PlayerView, unit: MonsterUnit): boolean {
  if (isNow(view, unit)) return canAttack(view, unit);
  const next = ownerNextTurn(view.turn, view.activePlayer, unit.owner);
  return !unit.statuses.some((s) => (s.kind === 'stun' || s.kind === 'desarme') && s.expiresAtTurn > next);
}

/**
 * « Aller » et « attaquer » d'un monstre. Aller : ses cases d'arrêt valides (à ton tour, les déplacements légaux de
 * maintenant). Attaquer : les cases que son tir atteint depuis sa case ou l'une de ses cases d'arrêt (ligne de vue,
 * cases X hautes et basses, diagonale, alliés transparents), hors cases d'aller et hors cases de ses alliés. Portée :
 * l'effective maintenant, celle de la carte au prochain tour (ses bonus du tour seront retombés). Rien pour un terrain.
 */
export function getUnitZones(view: PlayerView, unitId: UnitId): UnitZones {
  const unit = view.units[unitId];
  if (unit?.kind !== 'monster') return NO_ZONES;
  const mover = moverOf(view, unit);
  const moves = mover ? destinations(view, unit, mover) : [];
  if (!canStrike(view, unit)) return { moves, attacks: [] };

  const card = getMonsterCard(unit.cardId);
  const range = isNow(view, unit) ? getRange(view, unit) : card.range;
  // Il ne se gêne pas lui-même : son tir part de chaque case possible comme si la sienne était libre.
  const { [unitId]: _self, ...others } = view.units;
  const board = { board: view.board, units: others };
  const taken = new Set([unit.pos, ...moves].map(key));
  const attacks = new Map<string, Position>();
  for (const from of [unit.pos, ...moves]) {
    for (const pos of getStrikeCells(board, from, range, unit.owner)) {
      // Trébuchet des archers : jamais au contact (ligne droite, à 1 case).
      if (card.noContact && Math.abs(pos.row - from.row) + Math.abs(pos.col - from.col) === 1) continue;
      if (taken.has(key(pos)) || getUnitsAt(view, pos).some((u) => u.owner === unit.owner)) continue;
      attacks.set(key(pos), pos);
    }
  }
  return { moves, attacks: [...attacks.values()] };
}

/** Cases d'arrêt : les déplacements légaux de maintenant pour ton monstre à ton tour, sinon ceux de son prochain tour. */
function destinations(view: PlayerView, unit: MonsterUnit, mover: MonsterUnit): Position[] {
  if (!isNow(view, unit)) return getMoveDestinations(view, mover).map((d) => d.pos);
  const moves = new Map<string, Position>();
  for (const action of view.legalActions) if (action.type === 'move' && action.unitId === unit.id) moves.set(key(action.to), action.to);
  return [...moves.values()];
}

/**
 * Mobilité que dépenserait le monstre pour aller sur chacune de ses cases d'aller (le plus court chemin, slow des
 * Terrains piégés compris), par clé « ligne,colonne » : à son tour, de maintenant ; sinon, de son prochain tour.
 */
export function getMoveCosts(view: PlayerView, unitId: UnitId): Map<string, number> {
  const unit = view.units[unitId];
  const mover = unit?.kind === 'monster' ? moverOf(view, unit) : null;
  return new Map(mover ? getMoveDestinations(view, mover).map((d) => [key(d.pos), d.cost] as const) : []);
}

/**
 * Zone de danger pour l'équipe `team` : l'union, pour chaque monstre adverse que voit le joueur, de ses cases d'aller
 * et d'attaquer (une seule couleur), sans les cases des monstres adverses eux-mêmes. Seuls comptent les monstres du
 * plateau : ni effets actifs, ni sorts (validé le 2026-11-08).
 */
export function getDangerZone(view: PlayerView, team: PlayerId): Position[] {
  const enemies = Object.values(view.units).filter((u): u is MonsterUnit => u.kind === 'monster' && u.owner !== team);
  const own = new Set(enemies.map((enemy) => key(enemy.pos)));
  const cells = new Map<string, Position>();
  for (const enemy of enemies) {
    const { moves, attacks } = getUnitZones(view, enemy.id);
    for (const pos of [...moves, ...attacks]) if (!own.has(key(pos))) cells.set(key(pos), pos);
  }
  return [...cells.values()];
}

/**
 * Chemin vers une case d'aller : les cases traversées depuis le monstre, départ et arrivée exclus (le plus court, celui
 * que prendrait le déplacement). Vide si la case est voisine, ou s'il ne peut pas y aller.
 */
export function getZonePath(view: PlayerView, unitId: UnitId, to: Position): Position[] {
  const unit = view.units[unitId];
  if (unit?.kind !== 'monster') return [];
  const mover = moverOf(view, unit);
  const path = mover ? getMovePath(view, mover, to) : null;
  return path ? path.slice(0, -1) : [];
}

/** Côtés d'une case de danger qui donnent sur une case hors danger : là passe le contour violet. */
export interface DangerEdges {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

/** Les côtés à tracer de chaque case de danger, par clé « ligne,colonne ». */
export function getDangerEdges(cells: readonly Position[]): Map<string, DangerEdges> {
  const inside = new Set(cells.map(key));
  const out = (row: number, col: number) => !inside.has(`${row},${col}`);
  return new Map(
    cells.map((pos) => [
      key(pos),
      {
        up: out(pos.row - 1, pos.col),
        down: out(pos.row + 1, pos.col),
        left: out(pos.row, pos.col - 1),
        right: out(pos.row, pos.col + 1),
      },
    ]),
  );
}
