// Disponibilité d'une carte du grimoire, de l'attaque ou de l'effet actif d'un monstre, avec la raison quand ce n'est
// pas possible (mana, déjà utilisé, aucune cible…), pour que l'interface n'ait pas à la deviner. Calculée sur la vue du
// joueur (ses actions légales y sont déjà) : elle ne révèle rien de caché.
import { getCard, getMonsterCard } from './cards';
import { isStunned } from './statuses';
import type { CardId, PlayerView, UnitId } from './types';

/**
 * Ce qui manque : une case libre dans sa zone d'invocation (monstre), une zone de mana (terrain), une case pour l'effet,
 * un monstre à viser, une carte d'évolution dans le grimoire, un monstre qu'il peut payer à invoquer.
 */
export type MissingTarget = 'summonZone' | 'manaZone' | 'cell' | 'monster' | 'evolution' | 'summonCard';

export type UnavailableReason =
  /** Ce n'est pas son tour (ou la partie est finie). */
  | { readonly kind: 'notYourTurn' }
  /** Plus d'exemplaire de la carte dans son grimoire. */
  | { readonly kind: 'noCopy' }
  | { readonly kind: 'mana'; readonly missing: number }
  /** Sort déjà lancé, attaque ou effet déjà utilisés ce tour. */
  | { readonly kind: 'alreadyUsed' }
  /** Stun : aucune action. */
  | { readonly kind: 'stunned' }
  /** Arrivé ce tour-ci : l'évolution attend le tour suivant. */
  | { readonly kind: 'justSummoned' }
  | { readonly kind: 'noTarget'; readonly target: MissingTarget };

export type Availability = { readonly ok: true } | { readonly ok: false; readonly reason: UnavailableReason };

const OK: Availability = { ok: true };
const no = (reason: UnavailableReason): Availability => ({ ok: false, reason });

const myTurn = (view: PlayerView) => view.winner === null && view.activePlayer === view.viewer;

/** Peut-il jouer cette carte de son grimoire, et sinon pourquoi. */
export function cardAvailability(view: PlayerView, cardId: CardId): Availability {
  const card = getCard(cardId);
  if (!myTurn(view)) return no({ kind: 'notYourTurn' });
  if (!view.me.grimoire.includes(cardId)) return no({ kind: 'noCopy' });
  if (card.kind === 'spell' && view.me.spellsThisTurn.includes(cardId)) return no({ kind: 'alreadyUsed' });
  if (view.me.mana < card.cost) return no({ kind: 'mana', missing: card.cost - view.me.mana });
  if (view.legalActions.some((a) => a.type === 'playCard' && a.cardId === cardId)) return OK;
  return no({ kind: 'noTarget', target: card.kind === 'monster' ? 'summonZone' : card.kind === 'terrain' ? 'manaZone' : 'monster' });
}

/** Son monstre peut-il attaquer, et sinon pourquoi. */
export function attackAvailability(view: PlayerView, unitId: UnitId): Availability {
  const unit = view.units[unitId];
  if (!myTurn(view) || unit?.kind !== 'monster' || unit.owner !== view.viewer) return no({ kind: 'notYourTurn' });
  if (isStunned(unit)) return no({ kind: 'stunned' });
  if (unit.hasAttacked) return no({ kind: 'alreadyUsed' });
  if (view.legalActions.some((a) => a.type === 'attack' && a.unitId === unitId)) return OK;
  return no({ kind: 'noTarget', target: 'monster' });
}

/** Son monstre peut-il utiliser son effet actif, et sinon pourquoi ; `null` s'il n'en a pas. */
export function effectAvailability(view: PlayerView, unitId: UnitId): Availability | null {
  const unit = view.units[unitId];
  if (unit?.kind !== 'monster') return null;
  const ability = getMonsterCard(unit.cardId).activated;
  if (!ability) return null;
  if (!myTurn(view) || unit.owner !== view.viewer) return no({ kind: 'notYourTurn' });
  if (isStunned(unit)) return no({ kind: 'stunned' });
  if (unit.hasUsedEffect) return no({ kind: 'alreadyUsed' });
  if (view.me.mana < ability.manaCost) return no({ kind: 'mana', missing: ability.manaCost - view.me.mana });
  if (view.legalActions.some((a) => a.type === 'activateEffect' && a.unitId === unitId)) return OK;
  const { targeting, effects } = ability;
  if (effects.some((e) => e.type === 'evolve')) {
    return no(unit.summonedOnTurn === view.turn ? { kind: 'justSummoned' } : { kind: 'noTarget', target: 'evolution' });
  }
  if (effects.some((e) => e.type === 'summon')) {
    const budget = view.me.mana - ability.manaCost;
    const affordable = view.me.grimoire.some((id) => {
      const card = getCard(id);
      return card.kind === 'monster' && card.cost <= budget;
    });
    return no({ kind: 'noTarget', target: affordable ? 'cell' : 'summonCard' });
  }
  const cell = targeting.type === 'emptyAdjacentCell' || targeting.type === 'emptyCell';
  return no({ kind: 'noTarget', target: cell ? 'cell' : 'monster' });
}
