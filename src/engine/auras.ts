// Auras de PV (Origine, SPEC.md §10) : tenues à jour après chaque action, d'après les monstres adjacents.
import { emit } from './events';
import { auraHp, getMonsters, setUnit } from './units';
import type { GameState } from './types';

/**
 * Chaque monstre a les PV d'aura que lui donnent ses alliés adjacents. En entrant dans une aura : +N PV et +N PV max ;
 * en la quittant (lui ou la source s'éloigne, ou la source disparaît) : il perd ces PV et ces PV max, sans descendre
 * sous 1 PV.
 */
export function syncAuraHp(state: GameState): GameState {
  let next = state;
  for (const monster of [...getMonsters(state, 1), ...getMonsters(state, 2)]) {
    const target = auraHp(state, monster);
    const amount = target - monster.auraHp;
    if (amount === 0) continue;
    const hp = Math.max(1, monster.hp + amount);
    next = setUnit(emit(next, { type: 'auraHp', unitId: monster.id, pos: monster.pos, amount, hp }), {
      ...monster,
      hp,
      maxHp: monster.maxHp + amount,
      auraHp: target,
    });
  }
  return next;
}
