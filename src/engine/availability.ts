// Disponibilité d'une carte du grimoire, de l'attaque ou de l'effet actif d'un monstre, avec la raison quand ce n'est
// pas possible (mana, déjà utilisé, aucune cible…), pour que l'interface n'ait pas à la deviner. Calculée sur la vue du
// joueur (ses actions légales y sont déjà) : elle ne révèle rien de caché.
import { getCard, getMonsterCard } from './cards';
import { isSilenced, isStunned } from './statuses';
import { canAttack } from './units';
import type { CardId, PlayerView, UnitId } from './types';

/**
 * Ce qui manque : une case libre dans sa zone d'invocation (monstre), une zone de mana (terrain), une case pour l'effet,
 * un monstre à viser, une carte d'évolution dans le grimoire, un monstre qu'il peut payer à invoquer, une case où il
 * est passé ce tour (retour).
 */
export type MissingTarget = 'summonZone' | 'manaZone' | 'cell' | 'monster' | 'evolution' | 'summonCard' | 'trail';

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
  /** Silence : plus d'effet actif. */
  | { readonly kind: 'silenced' }
  /** Déjà armé : une seule attaque armée à la fois (Flèche explosive, Carreau perforant). */
  | { readonly kind: 'armed' }
  /** Plus d'attaque ce tour : rien à armer. */
  | { readonly kind: 'noAttack' }
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
  if (view.me.mana < card.cost) return no({ kind: 'mana', missing: card.cost - view.me.mana });
  if (view.legalActions.some((a) => a.type === 'playCard' && a.cardId === cardId)) return OK;
  return no({ kind: 'noTarget', target: card.kind === 'monster' ? 'summonZone' : card.kind === 'terrain' ? 'manaZone' : 'monster' });
}

/** Son monstre peut-il attaquer, et sinon pourquoi. */
export function attackAvailability(view: PlayerView, unitId: UnitId): Availability {
  const unit = view.units[unitId];
  if (!myTurn(view) || unit?.kind !== 'monster' || unit.owner !== view.viewer) return no({ kind: 'notYourTurn' });
  if (isStunned(unit)) return no({ kind: 'stunned' });
  if (!canAttack(view, unit)) return no({ kind: 'alreadyUsed' });
  if (view.legalActions.some((a) => a.type === 'attack' && a.unitId === unitId)) return OK;
  return no({ kind: 'noTarget', target: 'monster' });
}

/**
 * Son monstre peut-il utiliser son effet actif de rang `effect` (0 : le premier), et sinon pourquoi ; `null` s'il ne l'a
 * pas.
 */
export function effectAvailability(view: PlayerView, unitId: UnitId, effect = 0): Availability | null {
  const unit = view.units[unitId];
  if (unit?.kind !== 'monster') return null;
  const ability = getMonsterCard(unit.cardId).activated[effect];
  if (!ability) return null;
  if (!myTurn(view) || unit.owner !== view.viewer) return no({ kind: 'notYourTurn' });
  if (isStunned(unit)) return no({ kind: 'stunned' });
  if (isSilenced(unit)) return no({ kind: 'silenced' });
  if (!ability.unlimited && unit.usedEffects.includes(effect)) return no({ kind: 'alreadyUsed' });
  if (view.me.mana < ability.manaCost) return no({ kind: 'mana', missing: ability.manaCost - view.me.mana });
  if (ability.effects.some((e) => e.type === 'arm')) {
    if (unit.armed) return no({ kind: 'armed' });
    if (!canAttack(view, unit)) return no({ kind: 'noAttack' });
  }
  if (view.legalActions.some((a) => a.type === 'activateEffect' && a.unitId === unitId && (a.effect ?? 0) === effect)) return OK;
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
  if (targeting.type === 'trail') return no({ kind: 'noTarget', target: 'trail' });
  const cell = targeting.type === 'emptySquareCell' || targeting.type === 'emptyCell';
  return no({ kind: 'noTarget', target: cell ? 'cell' : 'monster' });
}
