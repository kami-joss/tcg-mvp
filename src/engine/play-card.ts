// Jouer une carte du grimoire (SPEC.md §4.3) : invocation (§4.5), sort (§6) ou terrain (§4.9).
import { getManaZones, samePos } from './board';
import { getCard } from './cards';
import { getEffectTargets, resolveAbility, sameEffectTarget } from './effects';
import { IllegalActionError } from './errors';
import { perceived } from './stealth';
import { emit } from './events';
import { isShinyCopy, shine } from './players';
import { getFreeSummonCells, payCard, placeSummonedMonster } from './summon';
import { addUnit, createTerrainUnit, getMonsterAt, getUnitsAt } from './units';
import type { Action, Card, CardTarget, GameState, PlayerId, Position } from './types';

type PlayCardAction = Extract<Action, { type: 'playCard' }>;

export { getFreeSummonCells };

/** Mana zones où `player` peut poser un terrain : occupées par un de ses monstres, et sans terrain (§4.9, §10). */
export function getTerrainCells(state: GameState, player: PlayerId): Position[] {
  return getManaZones(state.board)
    .map(({ pos }) => pos)
    .filter(
      (pos) =>
        getMonsterAt(state, pos)?.owner === player && !getUnitsAt(state, pos).some((unit) => unit.kind === 'terrain'),
    );
}

/** Cibles possibles de `card` pour le joueur actif. Une carte sans cible n'est pas jouable. */
function getCardTargets(state: GameState, card: Card): CardTarget[] {
  const player = state.activePlayer;
  switch (card.kind) {
    case 'monster':
      return getFreeSummonCells(state, player).map((pos) => ({ kind: 'cell', pos }));
    case 'spell':
      return getEffectTargets(state, card.ability, player, null);
    case 'terrain':
      return getTerrainCells(state, player).map((pos) => ({ kind: 'cell', pos }));
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

export function getPlayCardActions(state: GameState): Action[] {
  const player = state.players[state.activePlayer];
  return [...new Set(player.grimoire)]
    .map((id) => getCard(id))
    .filter((card) => card.cost <= player.mana)
    .flatMap((card) =>
      getCardTargets(state, card).map((target): Action => ({ type: 'playCard', cardId: card.id, target })),
    );
}

export function applyPlayCard(state: GameState, action: PlayCardAction): GameState {
  const player = state.players[state.activePlayer];
  if (!player.grimoire.includes(action.cardId)) {
    throw new IllegalActionError(`La carte « ${action.cardId} » n'est plus dans le grimoire de J${player.id}`);
  }
  const card = getCard(action.cardId);
  if (player.mana < card.cost) {
    throw new IllegalActionError(`Mana insuffisant pour « ${card.name} » : ${player.mana} < ${card.cost}`);
  }
  const { target } = action;
  if (!getCardTargets(perceived(state), card).some((t) => sameCardTarget(t, target))) {
    throw new IllegalActionError(`Cible invalide pour « ${card.name} »`);
  }

  const pos =
    target.kind === 'cell'
      ? cellOf(target)
      : target.kind === 'unit' || target.kind === 'unitAndDirection'
        ? (state.units[target.unitId]?.pos ?? { row: 0, col: 0 })
        : { row: 0, col: 0 };
  const shiny = isShinyCopy(state, player.id, card.id);
  const paid = payCard(emit(state, { type: 'cardPlayed', player: player.id, cardId: card.id, pos }), player.id, card);
  const id = `u${paid.nextUnitId}`;
  switch (card.kind) {
    case 'monster':
      // Un ennemi invoqué sur une case piégée déclenche le piège, comme s'il y entrait (§10).
      return placeSummonedMonster(paid, player.id, card, cellOf(target), shiny);
    case 'terrain': {
      const unit = shine(createTerrainUnit(id, card, player.id, cellOf(target)), shiny);
      return addUnit(emit(paid, { type: 'summon', unit }), () => unit);
    }
    case 'spell': {
      if (target.kind === 'cell' || target.kind === 'card' || target.kind === 'cellAndCard') {
        throw new IllegalActionError(`Un sort cible un monstre`);
      }
      return resolveAbility(paid, card.ability, target, player.id, null, { cardId: card.id });
    }
  }
}
