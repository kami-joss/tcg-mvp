// Disponibilité d'une carte du grimoire, de l'attaque ou de l'effet actif d'un monstre, avec la raison quand ce n'est
// pas possible (mana, déjà utilisé, aucune cible…), pour que l'interface n'ait pas à la deviner. Calculée sur la vue du
// joueur (ses actions légales y sont déjà) : elle ne révèle rien de caché.
import { getCard, getMonsterCard } from './cards';
import { isDisarmed, isSilenced, isStunned } from './statuses';
import { canAttack, getEffectCost } from './units';
import type { Ability, CardId, PlayerView, UnitId } from './types';

/**
 * Ce qui manque : une case libre dans sa zone d'invocation (monstre), une zone de mana (terrain), une case pour l'effet,
 * un monstre à viser, une carte d'évolution dans le grimoire, un monstre qu'il peut payer à invoquer, une case où il
 * est passé ce tour (retour).
 */
export type MissingTarget =
  | 'summonZone'
  | 'manaZone'
  | 'cell'
  | 'monster'
  | 'evolution'
  | 'summonCard'
  | 'trail'
  /** Un de ses terrains (Fortification). */
  | 'terrain'
  /** Un monstre dans son cimetière (Réanimation). */
  | 'graveyard'
  /** Un allié qui a un malus (Cure). */
  | 'malus';

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
  /** Désarmé : ne peut pas attaquer. */
  | { readonly kind: 'disarmed' }
  /** Déjà armé : une seule attaque armée à la fois (Flèche explosive, Carreau perforant). */
  | { readonly kind: 'armed' }
  /** Plus d'attaque ce tour : rien à armer. */
  | { readonly kind: 'noAttack' }
  /** Arrivé ce tour-ci : l'évolution attend le tour suivant. */
  | { readonly kind: 'justSummoned' }
  /** Déjà à la limite de mana : un gain ne rapporterait rien (Élixir de mana). */
  | { readonly kind: 'manaLimit' }
  | { readonly kind: 'noTarget'; readonly target: MissingTarget };

export type Availability = { readonly ok: true } | { readonly ok: false; readonly reason: UnavailableReason };

const OK: Availability = { ok: true };
const no = (reason: UnavailableReason): Availability => ({ ok: false, reason });

const myTurn = (view: PlayerView) => view.winner === null && view.activePlayer === view.viewer;

/** Peut-il jouer cette carte de son grimoire, et sinon pourquoi. */
export function cardAvailability(view: PlayerView, cardId: CardId): Availability {
  const card = getCard(view.cards, cardId);
  if (!myTurn(view)) return no({ kind: 'notYourTurn' });
  if (!view.me.grimoire.includes(cardId)) return no({ kind: 'noCopy' });
  if (view.me.mana < card.cost) return no({ kind: 'mana', missing: card.cost - view.me.mana });
  if (view.legalActions.some((a) => a.type === 'playCard' && a.cardId === cardId)) return OK;
  if (card.kind !== 'spell') return no({ kind: 'noTarget', target: card.kind === 'monster' ? 'summonZone' : 'manaZone' });
  return no(spellMissing(view, card.ability));
}

/** Ce qui manque à un sort sans cible possible. */
function spellMissing(view: PlayerView, { targeting, effects }: Ability): UnavailableReason {
  switch (targeting.type) {
    case 'none':
      return effects.some((e) => e.type === 'gainMana') ? { kind: 'manaLimit' } : { kind: 'noTarget', target: 'monster' };
    case 'terrain':
      return { kind: 'noTarget', target: 'terrain' };
    case 'graveyard': {
      const monsters = view.me.graveyard.some((copy) => getCard(view.cards, copy.cardId).kind === 'monster');
      return { kind: 'noTarget', target: monsters ? 'summonZone' : 'graveyard' };
    }
    case 'monster':
      if (effects.every((e) => e.type === 'cleanse')) return { kind: 'noTarget', target: 'malus' };
      // Une téléportation : il a des alliés, mais aucune case où les poser.
      if (effects.some((e) => e.type === 'teleport') && Object.values(view.units).some((u) => u.kind === 'monster' && u.owner === view.viewer)) {
        return { kind: 'noTarget', target: 'cell' };
      }
      return { kind: 'noTarget', target: 'monster' };
    default:
      return { kind: 'noTarget', target: 'monster' };
  }
}

/** Son monstre peut-il attaquer, et sinon pourquoi. */
export function attackAvailability(view: PlayerView, unitId: UnitId): Availability {
  const unit = view.units[unitId];
  if (!myTurn(view) || unit?.kind !== 'monster' || unit.owner !== view.viewer) return no({ kind: 'notYourTurn' });
  if (isStunned(unit)) return no({ kind: 'stunned' });
  if (isDisarmed(unit)) return no({ kind: 'disarmed' });
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
  const ability = getMonsterCard(view.cards, unit.cardId).activated[effect];
  if (!ability) return null;
  if (!myTurn(view) || unit.owner !== view.viewer) return no({ kind: 'notYourTurn' });
  if (isStunned(unit)) return no({ kind: 'stunned' });
  if (isSilenced(unit)) return no({ kind: 'silenced' });
  if (!ability.unlimited && unit.usedEffects.includes(effect)) return no({ kind: 'alreadyUsed' });
  const cost = getEffectCost(view, unit, ability);
  if (view.me.mana < cost) return no({ kind: 'mana', missing: cost - view.me.mana });
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
    const budget = view.me.mana - cost;
    const affordable = view.me.grimoire.some((id) => {
      const card = getCard(view.cards, id);
      return card.kind === 'monster' && card.cost <= budget;
    });
    return no({ kind: 'noTarget', target: affordable ? 'cell' : 'summonCard' });
  }
  if (targeting.type === 'trail') return no({ kind: 'noTarget', target: 'trail' });
  const cell = targeting.type === 'emptySquareCell' || targeting.type === 'emptyCell';
  return no({ kind: 'noTarget', target: cell ? 'cell' : 'monster' });
}
