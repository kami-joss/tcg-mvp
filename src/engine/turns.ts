// Déroulé des tours (SPEC.md §4.2) : fin de tour, puis début de tour du joueur suivant.
import { BASE_MANA_PER_TURN, PLAYER2_FIRST_TURN_BONUS_MANA, VP_PER_CONTROLLED_ZONE } from './config';
import { dealDamage } from './damage';
import { emit } from './events';
import { addMana, addVp, opponent } from './players';
import { expireBurningCells, expireTraps } from './traps';
import { getMonsterCard } from './cards';
import { applyTriggeredEffects } from './effects';
import { expireStatuses, statusTotal, turnMobility } from './statuses';
import { auraMobility, getMonsters, removeUnit, setUnit } from './units';
import { adjacentCells, samePos } from './board';
import { getControlledZones, getZoneMana } from './zones';
import type { GameState } from './types';

/**
 * Début de tour du joueur actif : il gagne le mana de base et, pour chaque mana zone contrôlée
 * (contrôle évalué maintenant, §4.4), son mana (bonus compris) et des VP. Ses monstres récupèrent
 * toute leur mobilité, leur attaque et leur effet activé. Tous les monstres récupèrent leur riposte,
 * limitée à une par tour, et un monstre `invisible` révélé redevient caché (§10).
 */
export function startTurn(state: GameState): GameState {
  const player = state.activePlayer;
  // J1 commence toujours (§4.1) : le tour 2 est le tout premier tour de J2.
  const firstTurnBonus = player === 2 && state.turn === 2 ? PLAYER2_FIRST_TURN_BONUS_MANA : 0;

  // Ses pièges du tour précédent ont fait leur temps (§10) ; il peut de nouveau lancer chacun de ses sorts (§4.3).
  let next = expireTraps(emit(state, { type: 'turnStart', player, turn: state.turn }), player);
  next = { ...next, players: { ...next.players, [player]: { ...next.players[player], spellsThisTurn: [] } } };
  // Requiem arrivé à son terme : ses monstres meurent avant tout le reste, sans VP pour personne (§5 bis).
  for (const monster of getMonsters(next, player)) {
    if (!monster.statuses.some((s) => s.kind === 'requiem' && s.expiresAtTurn <= state.turn)) continue;
    next = removeUnit(emit(next, { type: 'requiem', unitId: monster.id, pos: monster.pos }), monster.id);
  }
  // Les statuts et les cases brûlées arrivés à échéance disparaissent avant tout le reste (§5 bis, §10).
  next = expireStatuses(next, state.turn);
  next = expireBurningCells(next, state.turn);
  const zones = getControlledZones(next, player);
  next = addMana(next, player, BASE_MANA_PER_TURN + firstTurnBonus);
  for (const { pos } of zones) next = addMana(next, player, getZoneMana(next, pos), pos);
  for (const { pos } of zones) next = addVp(next, player, VP_PER_CONTROLLED_ZONE, pos);

  // Burn : ses unités perdent leurs PV ; une destruction profite à l'adversaire.
  for (const unit of Object.values(next.units)) {
    const burn = statusTotal(unit, 'burn');
    if (unit.owner !== player || burn === 0) continue;
    next = dealDamage(next, unit.id, burn, opponent(player), 'burn');
  }

  // « Début de tour » (Ki né) : sur ses alliés de la famille autour de lui, après les revenus et le burn (§10).
  for (const source of getMonsters(next, player)) {
    const trigger = getMonsterCard(source.cardId).turnStart;
    if (!trigger || !next.units[source.id]) continue;
    const cells = adjacentCells(next.board, source.pos);
    const allies = getMonsters(next, player).filter(
      (m) => m.id !== source.id && getMonsterCard(m.cardId).family === trigger.family && cells.some((c) => samePos(c, m.pos)),
    );
    for (const ally of allies) next = applyTriggeredEffects(next, trigger.effects, ally.id, source);
  }

  for (const monster of [...getMonsters(next, 1), ...getMonsters(next, 2)]) {
    // Mobilité de la carte, plus les auras et le bonus du plateau, moins les slow ; 0 si stun ou immobilisé (§5 bis).
    const refreshed =
      monster.owner === player
        ? {
            mobilityLeft: turnMobility(monster, auraMobility(next, monster) + next.board.mobilityBonus),
            froze: statusTotal(monster, 'slow'),
            boost: 0,
            hasAttacked: false,
            hasUsedEffect: false,
          }
        : {};
    // Les bonus du tour précédent (ATK : Dopage, Seringue ; portée : Flèche divine) sont finis.
    next = setUnit(next, { ...monster, ...refreshed, atkBonus: 0, rangeBonus: 0, hasRiposted: false, revealed: false });
  }
  return next;
}

/** « Fin du tour » : la main passe à l'adversaire, dont le tour commence. Le mana non dépensé est conservé. */
export function applyEndTurn(state: GameState): GameState {
  return startTurn({ ...state, activePlayer: opponent(state.activePlayer), turn: state.turn + 1 });
}
