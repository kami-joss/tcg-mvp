// Dégâts et destruction (SPEC.md §4.7), communs aux attaques, sorts, effets et ripostes.
import { VP_PER_MONSTER_DESTROYED } from './config';
import { emit } from './events';
import { addVp } from './players';
import { hasCarapace } from './statuses';
import { removeUnit, setUnit } from './units';
import type { DamageCause, GameState, PlayerId, UnitId } from './types';

/**
 * Retire `amount` PV à la cible ; les dégâts restent. À 0 PV ou moins, l'unité est détruite.
 * Détruire un monstre rapporte des VP à `by` ; détruire un terrain ne rapporte rien.
 */
export function dealDamage(
  state: GameState,
  targetId: UnitId,
  amount: number,
  by: PlayerId,
  cause: DamageCause,
): GameState {
  const target = state.units[targetId];
  if (!target) throw new Error(`Unité inconnue : ${targetId}`);

  // Carapace (§5 bis) : ses PV ne descendent pas sous 1, quels que soient les dégâts (attaque, sort, effet, piège, burn…) ;
  // elle tient jusqu'à la fin de sa durée.
  const held = hasCarapace(target) && amount >= target.hp;
  const dealt = held ? Math.max(0, target.hp - 1) : amount;
  const hp = target.hp - dealt;
  const hit = emit(state, { type: 'damage', unitId: targetId, pos: target.pos, amount: dealt, hp: Math.max(0, hp), cause, ...(held ? { held: true } : {}) });
  if (hp > 0) return setUnit(hit, { ...target, hp });

  const destroyed = removeUnit(emit(hit, { type: 'destroyed', unitId: targetId, pos: target.pos }), targetId);
  return target.kind === 'monster' ? addVp(destroyed, by, VP_PER_MONSTER_DESTROYED, target.pos) : destroyed;
}
