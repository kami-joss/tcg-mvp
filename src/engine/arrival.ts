// Arriver sur un monstre caché (SPEC §10, validé le 2026-11-12). Les cases d'arrivée d'une invocation ou d'une
// téléportation se choisissent sur ce que voit le joueur (`perceived`) : une case qu'il croit libre peut porter un monstre
// adverse caché. Quand un monstre y arriverait, le monstre caché se révèle (jusqu'à la fin du tour) et le monstre arrive
// sur la case valide la plus proche, parmi celles que la carte ou l'effet permettait sur l'état réel : la plus proche de
// la case visée (distance orthogonale), à égalité la première dans l'ordre de lecture. Sans case valide, rien n'est payé
// ni joué : seul le monstre caché est révélé. Les pièges et les cases brûlées ne sont pas concernés (ils se posent).
import { distance } from './board';
import { getEffectTargets } from './effects';
import { reveal } from './stealth';
import { getMonsterAt } from './units';
import type { Ability, EffectTarget, GameState, MonsterUnit, PlayerId, Position } from './types';

/** L'arrivée sur une case occupée : l'état avec le monstre caché révélé, et la cible retenue (`null` : aucune). */
export interface Arrival<T> {
  readonly state: GameState;
  readonly target: T | null;
}

/** Plus proche de `pos` en distance orthogonale, puis dans l'ordre de lecture (ligne, puis colonne). */
const byNearest = (pos: Position) => (a: Position, b: Position) =>
  distance(a, pos) - distance(b, pos) || a.row - b.row || a.col - b.col;

/**
 * Un monstre de `player` arriverait en `pos` : si un monstre adverse s'y tient (caché, puisque le joueur l'a crue
 * libre), il se révèle et la cible devient la plus proche des `options` (calculées sur l'état réel). `null` : la case est
 * libre, rien ne change.
 */
export function arrival<T>(
  state: GameState,
  player: PlayerId,
  pos: Position,
  options: readonly T[],
  posOf: (option: T) => Position,
): Arrival<T> | null {
  const hidden = getMonsterAt(state, pos);
  if (!hidden || hidden.owner === player) return null;
  const nearest = byNearest(pos);
  const [target = null] = [...options].sort((a, b) => nearest(posOf(a), posOf(b)));
  return { state: reveal(state, hidden.id), target };
}

/** La case où un effet fait arriver un monstre (invocation, réanimation, téléportation, retour), ou `null`. */
export function arrivalPos(ability: Ability, target: EffectTarget): Position | null {
  if (target.kind === 'cellAndCard' || target.kind === 'unitAndCell') return target.pos;
  if (target.kind === 'cell' && ability.targeting.type === 'trail') return target.pos;
  return null;
}

/** Le même choix, à la case près : le même monstre à invoquer, à réanimer ou à téléporter. */
function sameChoice(a: EffectTarget, b: EffectTarget): boolean {
  if (a.kind === 'cellAndCard') return b.kind === 'cellAndCard' && a.cardId === b.cardId;
  if (a.kind === 'unitAndCell') return b.kind === 'unitAndCell' && a.unitId === b.unitId;
  return a.kind === b.kind;
}

/**
 * L'arrivée d'un effet (sort ou effet actif) dont la cible fait arriver un monstre sur une case : `null` si l'effet n'en
 * fait arriver aucun ou si la case est libre ; sinon le monstre caché révélé et la cible la plus proche du même choix.
 */
export function effectArrival(
  state: GameState,
  ability: Ability,
  target: EffectTarget,
  player: PlayerId,
  source: MonsterUnit | null,
): Arrival<EffectTarget> | null {
  const pos = arrivalPos(ability, target);
  if (!pos) return null;
  const options = getEffectTargets(state, ability, player, source).filter((option) => sameChoice(target, option) && arrivalPos(ability, option));
  return arrival(state, player, pos, options, (option) => arrivalPos(ability, option)!);
}
