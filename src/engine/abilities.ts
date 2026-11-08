// Effets actifs des monstres (SPEC.md §4.8, §5.2) : un monstre peut en avoir plusieurs, chacun une fois par tour.
import { getMonsterCard } from './cards';
import { applyBacklash, getAreaCells, getEffectTargets, resolveAbility, sameEffectTarget } from './effects';
import { IllegalActionError } from './errors';
import { emit } from './events';
import { addMana } from './players';
import { isSilenced, isStunned } from './statuses';
import { perceived } from './stealth';
import { getActiveMonster, getMonsters, setUnit } from './units';
import type { Action, ActivatedAbility, GameEvent, GameState, MonsterUnit } from './types';

type ActivateEffectAction = Extract<Action, { type: 'activateEffect' }>;

/** `attacksMade` d'un monstre qui ne peut plus attaquer ce tour, quelle que soit sa limite. */
const NO_ATTACKS_LEFT = 99;

/** Rang de l'effet actif visé par une action (absent : le premier). */
export const effectIndex = (action: { readonly effect?: number }): number => action.effect ?? 0;

/** L'effet de rang `effect` ne peut plus servir ce tour : déjà utilisé, sauf s'il est sans limite par tour (Emma). */
export const effectSpent = (monster: MonsterUnit, ability: ActivatedAbility, effect: number): boolean =>
  !ability.unlimited && monster.usedEffects.includes(effect);

/**
 * Chaque effet actif d'un monstre, une fois par tour (ou sans limite, s'il le dit), en payant son coût en mana ;
 * n'utilise pas l'attaque du monstre. Les actions du premier effet n'ont pas de champ `effect` ; celles des suivants
 * portent leur rang.
 */
export function getActivateEffectActions(state: GameState): Action[] {
  const { mana } = state.players[state.activePlayer];
  return getMonsters(state, state.activePlayer).flatMap((monster) => {
    if (isStunned(monster) || isSilenced(monster)) return [];
    return getMonsterCard(monster.cardId).activated.flatMap((ability, effect) => {
      if (effectSpent(monster, ability, effect) || ability.manaCost > mana) return [];
      return getEffectTargets(state, ability, monster.owner, monster).map(
        (target): Action => ({ type: 'activateEffect', unitId: monster.id, ...(effect > 0 ? { effect } : {}), target }),
      );
    });
  });
}

export function applyActivateEffect(state: GameState, action: ActivateEffectAction): GameState {
  const monster = getActiveMonster(state, action.unitId);
  const effect = effectIndex(action);
  const ability = getMonsterCard(monster.cardId).activated[effect];
  if (!ability) throw new IllegalActionError(`${monster.id} n'a pas d'effet activé n°${effect + 1}`);
  if (effectSpent(monster, ability, effect)) throw new IllegalActionError(`${monster.id} a déjà utilisé cet effet ce tour`);
  if (isStunned(monster)) throw new IllegalActionError(`${monster.id} est stun : aucune action possible`);
  if (isSilenced(monster)) throw new IllegalActionError(`${monster.id} est silence : aucun effet actif possible`);
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
  // Un effet sans limite par tour n'est pas noté comme utilisé.
  const usedEffects = ability.unlimited ? monster.usedEffects : [...monster.usedEffects, effect];
  const source = { ...monster, usedEffects, ...(facing ? { facing } : {}) };
  const used = setUnit(state, source);
  // Pour un piège, l'événement ne donne pas la case : seule la pose (visible de son poseur) la révèle. Pour une
  // invocation ou une téléportation non plus : la case d'arrivée suit, avec le monstre, s'il est visible. Celle du
  // monstre visé n'est montrée qu'aux joueurs qui le voient (`getPlayerView`).
  const { target } = action;
  const targetId = target.kind === 'unit' || target.kind === 'unitAndDirection' ? target.unitId : null;
  const pos = targetId ? (state.units[targetId]?.pos ?? monster.pos) : monster.pos;
  const { targeting } = ability;
  const cells = targeting.type === 'zone' ? getAreaCells(state, source, targeting.zone) : [];
  const event: GameEvent = {
    type: 'effect',
    unitId: monster.id,
    pos,
    ...(targetId ? { targetId } : {}),
    cells,
    ...(facing ? { facing } : {}),
    ...(effect > 0 ? { effect } : {}),
  };
  const paid = addMana(emit(used, event), monster.owner, -ability.manaCost);
  const resolved = resolveAbility(paid, ability, action.target, monster.owner, source, { cardId: monster.cardId, ...(ability.name ? { effect: ability.name } : {}) });
  // « Puis plus d'attaque ce tour » (Zoldik) : il a pu attaquer avant, plus après.
  // Contre-coup : sur lui-même, après l'effet.
  const countered = ability.backlash ? applyBacklash(resolved, monster.id, ability.backlash, monster.owner) : resolved;
  const after = countered.units[monster.id];
  // Plus aucune attaque : `attacksMade` dépasse toute limite (Carquois prêt ! compris).
  return ability.endsAttack && after?.kind === 'monster'
    ? setUnit(countered, { ...after, hasAttacked: true, attacksMade: Math.max(after.attacksMade, NO_ATTACKS_LEFT) })
    : countered;
}
