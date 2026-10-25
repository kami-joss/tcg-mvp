// Effets actifs des monstres (SPEC.md §4.8, §5.2).
import { getMonsterCard } from './cards';
import { getAreaCells, getEffectTargets, resolveAbility, sameEffectTarget } from './effects';
import { IllegalActionError } from './errors';
import { emit } from './events';
import { addMana } from './players';
import { isStunned } from './statuses';
import { perceived } from './stealth';
import { getActiveMonster, getMonsters, setUnit } from './units';
import type { Action, GameEvent, GameState } from './types';

type ActivateEffectAction = Extract<Action, { type: 'activateEffect' }>;

/** Une fois par tour, en payant son coût en mana ; n'utilise pas l'attaque du monstre. */
export function getActivateEffectActions(state: GameState): Action[] {
  const { mana } = state.players[state.activePlayer];
  return getMonsters(state, state.activePlayer).flatMap((monster) => {
    const ability = getMonsterCard(monster.cardId).activated;
    if (!ability || monster.hasUsedEffect || isStunned(monster) || ability.manaCost > mana) return [];
    return getEffectTargets(state, ability, monster.owner, monster).map(
      (target): Action => ({ type: 'activateEffect', unitId: monster.id, target }),
    );
  });
}

export function applyActivateEffect(state: GameState, action: ActivateEffectAction): GameState {
  const monster = getActiveMonster(state, action.unitId);
  const ability = getMonsterCard(monster.cardId).activated;
  if (!ability) throw new IllegalActionError(`${monster.id} n'a pas d'effet activé`);
  if (monster.hasUsedEffect) throw new IllegalActionError(`${monster.id} a déjà utilisé son effet ce tour`);
  if (isStunned(monster)) throw new IllegalActionError(`${monster.id} est stun : aucune action possible`);
  const { mana } = state.players[monster.owner];
  if (mana < ability.manaCost) {
    throw new IllegalActionError(`Mana insuffisant pour l'effet de ${monster.id} : ${mana} < ${ability.manaCost}`);
  }
  const targets = getEffectTargets(perceived(state), ability, monster.owner, monster);
  if (!targets.some((t) => sameEffectTarget(t, action.target))) {
    throw new IllegalActionError(`Cible invalide pour l'effet de ${monster.id}`);
  }

  // Zone en ligne : le monstre se tourne vers la direction choisie, avant que l'effet ne parte (recul « vers l'avant »).
  const facing = action.target.kind === 'area' ? action.target.direction : undefined;
  const source = { ...monster, hasUsedEffect: true, ...(facing ? { facing } : {}) };
  const used = setUnit(state, source);
  // Pour un piège, l'événement ne donne pas la case : seule la pose (visible de son poseur) la révèle. Pour une
  // invocation ou une téléportation non plus : la case d'arrivée suit, avec le monstre, s'il est visible.
  const { target } = action;
  const pos = target.kind === 'unit' || target.kind === 'unitAndDirection' ? (state.units[target.unitId]?.pos ?? monster.pos) : monster.pos;
  const { targeting } = ability;
  const cells = targeting.type === 'zone' ? getAreaCells(state, source, targeting.zone) : [];
  const event: GameEvent = { type: 'effect', unitId: monster.id, pos, cells, ...(facing ? { facing } : {}) };
  const paid = addMana(emit(used, event), monster.owner, -ability.manaCost);
  return resolveAbility(paid, ability, action.target, monster.owner, source);
}
