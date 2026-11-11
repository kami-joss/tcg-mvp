// Jouer une carte du grimoire (SPEC.md §4.3) : invocation (§4.5), sort (§6) ou terrain (§4.9).
import { getManaZones, samePos } from './board';
import { getCard } from './cards';
import { getEffectTargets, resolveAbility, sameEffectTarget } from './effects';
import { IllegalActionError } from './errors';
import { perceived } from './stealth';
import { emit } from './events';
import { isShinyCopy, shine } from './players';
import { getFreeSummonCells, payCard, placeSummonedMonster } from './summon';
import { arrival, effectArrival } from './arrival';
import type { Arrival } from './arrival';
import { addUnit, createTerrainUnit, getMonsterAt, getUnitsAt } from './units';
import { getZoneStatus } from './zones';
import type { Action, Card, CardTarget, GameState, PlayerId, Position } from './types';

type PlayCardAction = Extract<Action, { type: 'playCard' }>;

export { getFreeSummonCells };

/**
 * Mana zones où `player` peut poser un terrain : occupées par un de ses monstres, et sans terrain (§4.9, §10) ; en mode
 * contestation, seulement dans une zone qu'on tient : ni contestée, ni tenue par le nombre de l'adversaire (§4.4 bis). Tout cela est public : se calcule sur l'état réel.
 */
export function getTerrainCells(state: GameState, player: PlayerId): Position[] {
  return getManaZones(state.board)
    .map(({ pos }) => pos)
    .filter(
      (pos) =>
        getMonsterAt(state, pos)?.owner === player &&
        !getUnitsAt(state, pos).some((unit) => unit.kind === 'terrain') &&
        getZoneStatus(state, pos).controller === player,
    );
}

/**
 * Cibles possibles de `card` pour le joueur actif, d'après ce qu'il voit (`seen`) ; une mana zone, d'après l'état réel :
 * l'état d'une zone est public, même contestée par un monstre invisible (§10). Une carte sans cible n'est pas jouable.
 */
function getCardTargets(seen: GameState, card: Card, real: GameState): CardTarget[] {
  const player = seen.activePlayer;
  switch (card.kind) {
    case 'monster':
      return getFreeSummonCells(seen, player).map((pos) => ({ kind: 'cell', pos }));
    case 'spell':
      return getEffectTargets(seen, card.ability, player, null);
    case 'terrain':
      return getTerrainCells(real, player).map((pos) => ({ kind: 'cell', pos }));
  }
}

function sameCardTarget(a: CardTarget, b: CardTarget): boolean {
  if (a.kind === 'cell' || b.kind === 'cell') {
    return a.kind === 'cell' && b.kind === 'cell' && samePos(a.pos, b.pos);
  }
  return sameEffectTarget(a, b);
}

/** Case visée par une invocation ou un terrain (cible déjà validée). */
function cellOf(target: CardTarget): Position {
  if (target.kind !== 'cell') throw new IllegalActionError(`Cette carte cible une case`);
  return { row: target.pos.row, col: target.pos.col };
}

/** Cartes jouables par le joueur actif, sur ce qu'il voit (`state`) ; `real` : l'état réel, pour les mana zones. */
export function getPlayCardActions(state: GameState, real: GameState = state): Action[] {
  const player = state.players[state.activePlayer];
  return [...new Set(player.grimoire)]
    .map((id) => getCard(state.cards, id))
    .filter((card) => card.cost <= player.mana)
    .flatMap((card) =>
      getCardTargets(state, card, real).map((target): Action => ({ type: 'playCard', cardId: card.id, target })),
    );
}

export function applyPlayCard(state: GameState, action: PlayCardAction): GameState {
  const player = state.players[state.activePlayer];
  if (!player.grimoire.includes(action.cardId)) {
    throw new IllegalActionError(`La carte « ${action.cardId} » n'est plus dans le grimoire de J${player.id}`);
  }
  const card = getCard(state.cards, action.cardId);
  if (player.mana < card.cost) {
    throw new IllegalActionError(`Mana insuffisant pour « ${card.name} » : ${player.mana} < ${card.cost}`);
  }
  if (!getCardTargets(perceived(state), card, state).some((t) => sameCardTarget(t, action.target))) {
    throw new IllegalActionError(`Cible invalide pour « ${card.name} »`);
  }
  // Un monstre caché sur la case d'arrivée (§10, 2026-11-12) : il se révèle, le monstre arrive sur la case valide la plus
  // proche ; sans case valide, rien n'est payé ni joué.
  const moved = cardArrival(state, card, action.target);
  if (moved && !moved.target) return moved.state;
  return playCard(moved ? moved.state : state, card, moved?.target ?? action.target);
}

/** L'arrivée de la carte sur un monstre caché, ou `null` si elle ne fait arriver aucun monstre sur une case occupée. */
function cardArrival(state: GameState, card: Card, target: CardTarget): Arrival<CardTarget> | null {
  const player = state.activePlayer;
  if (card.kind === 'monster' && target.kind === 'cell') {
    const options = getFreeSummonCells(state, player).map((pos): CardTarget => ({ kind: 'cell', pos }));
    return arrival(state, player, target.pos, options, (option) => cellOf(option));
  }
  if (card.kind === 'spell' && target.kind !== 'cell') return effectArrival(state, card.ability, target, player, null);
  return null;
}

/** Joue la carte, cible validée (et déjà déplacée si un monstre caché occupait sa case). */
function playCard(state: GameState, card: Card, target: CardTarget): GameState {
  const player = state.players[state.activePlayer];

  // L'unité vers laquelle va la carte : celle qu'elle pose, ou le monstre visé par le sort ; un sort sans cible n'en a pas.
  const id = `u${state.nextUnitId}`;
  // Réanimation : vers la case où le monstre revient (il prendra le prochain identifiant).
  const unitId =
    target.kind === 'cell' || target.kind === 'cellAndCard'
      ? id
      : target.kind === 'unit' || target.kind === 'unitAndDirection' || target.kind === 'unitAndCell'
        ? target.unitId
        : null;
  const pos =
    target.kind === 'cell' ? cellOf(target) : target.kind === 'cellAndCard' ? { ...target.pos } : unitId ? (state.units[unitId]?.pos ?? null) : null;
  const shiny = isShinyCopy(state, player.id, card.id);
  const paid = payCard(emit(state, { type: 'cardPlayed', player: player.id, cardId: card.id, pos, ...(unitId ? { unitId } : {}) }), player.id, card);
  switch (card.kind) {
    case 'monster':
      // Un ennemi invoqué sur une case piégée déclenche le piège, comme s'il y entrait (§10).
      return placeSummonedMonster(paid, player.id, card, cellOf(target), shiny);
    case 'terrain': {
      const unit = shine(createTerrainUnit(id, card, player.id, cellOf(target)), shiny);
      return addUnit(emit(paid, { type: 'summon', unit }), () => unit);
    }
    case 'spell': {
      if (target.kind === 'cell' || target.kind === 'card') throw new IllegalActionError(`Un sort ne cible pas une case seule`);
      return resolveAbility(paid, card.ability, target, player.id, null, { cardId: card.id });
    }
  }
}
