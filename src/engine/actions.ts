// Point d'entrée des règles : actions légales et application d'une action (SPEC.md §2).
import { applyActivateEffect, getActivateEffectActions } from './abilities';
import { applyAttack, getAttackActions } from './combat';
import { IllegalActionError } from './errors';
import { syncAuraHp } from './auras';
import { applyMove, getMoveActions } from './movement';
import { applyPlayCard, getPlayCardActions } from './play-card';
import { perceived } from './stealth';
import { applyEndTurn } from './turns';
import type { Action, GameState } from './types';

/**
 * Actions légales du joueur actif, dans un ordre déterministe. Aucune une fois la partie gagnée.
 * Calculées sur ce qu'il voit : un monstre invisible pour lui n'y joue aucun rôle (§10).
 */
export function getLegalActions(real: GameState): Action[] {
  if (real.winner !== null) return [];
  const state = perceived(real);
  return [
    ...getPlayCardActions(state, real),
    ...getMoveActions(state),
    ...getAttackActions(state),
    ...getActivateEffectActions(state),
    { type: 'endTurn' },
  ];
}

/**
 * Applique une action sans muter `state`. Lève une `IllegalActionError` si l'action est illégale. Les PV d'aura
 * (Origine) sont remis à jour ensuite, d'après les positions finales.
 */
export function applyAction(previous: GameState, action: Action): GameState {
  if (previous.winner !== null) throw new IllegalActionError(`La partie est terminée : J${previous.winner} a gagné`);
  return syncAuraHp(resolveAction({ ...previous, events: [] }, action));
}

function resolveAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'playCard':
      return applyPlayCard(state, action);
    case 'move':
      return applyMove(state, action);
    case 'attack':
      return applyAttack(state, action);
    case 'activateEffect':
      return applyActivateEffect(state, action);
    case 'endTurn':
      return applyEndTurn(state);
  }
}
