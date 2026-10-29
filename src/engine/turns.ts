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

  // Ses pièges du tour précédent ont fait leur temps (§10).
  let next = expireTraps(emit(state, { type: 'turnStart', player, turn: state.turn }), player);
  // Requiem arrivé à son terme : noté avant que les statuts échus disparaissent ; il agit avec les autres statuts.
  const doomed = getMonsters(next, player)
    .filter((monster) => monster.statuses.some((s) => s.kind === 'requiem' && s.expiresAtTurn <= state.turn))
    .map((monster) => monster.id);
  // Les statuts et les cases brûlées arrivés à échéance disparaissent avant tout le reste (§5 bis, §10).
  next = expireStatuses(next, state.turn);
  next = expireBurningCells(next, state.turn);

  // 1. Revenus : mana et VP (§4.2).
  const zones = getControlledZones(next, player);
  next = addMana(next, player, BASE_MANA_PER_TURN + firstTurnBonus);
  for (const { pos } of zones) next = addMana(next, player, getZoneMana(next, pos), pos);
  for (const { pos } of zones) next = addVp(next, player, VP_PER_CONTROLLED_ZONE, pos);

  // 2. Effets passifs de début de tour (Ki né) : sur ses alliés de l'archétype autour de lui (§4.2).
  for (const source of getMonsters(next, player)) {
    const trigger = getMonsterCard(source.cardId).turnStart;
    if (!trigger || !next.units[source.id]) continue;
    const cells = adjacentCells(next.board, source.pos);
    const allies = getMonsters(next, player).filter(
      (m) => m.id !== source.id && getMonsterCard(m.cardId).archetype === trigger.archetype && cells.some((c) => samePos(c, m.pos)),
    );
    for (const ally of allies) next = applyTriggeredEffects(next, trigger.effects, ally.id, source);
  }

  // 3. Statuts : requiem (il meurt, sans VP pour personne), puis burn (une destruction profite à l'adversaire).
  for (const id of doomed) {
    const monster = next.units[id];
    if (monster) next = removeUnit(emit(next, { type: 'requiem', unitId: id, pos: monster.pos }), id);
  }
  for (const unit of Object.values(next.units)) {
    const burn = statusTotal(unit, 'burn');
    if (unit.owner !== player || burn === 0) continue;
    next = dealDamage(next, unit.id, burn, opponent(player), 'burn');
  }

  for (const monster of [...getMonsters(next, 1), ...getMonsters(next, 2)]) {
    // Mobilité de la carte, plus les auras et le bonus du plateau, moins les slow ; 0 si stun ou immobilisé (§5 bis).
    const refreshed =
      monster.owner === player
        ? {
            mobilityLeft: turnMobility(monster, auraMobility(next, monster) + next.board.mobilityBonus),
            froze: statusTotal(monster, 'slow'),
            boost: 0,
            turnBonuses: [],
            hasAttacked: false,
            usedEffects: [],
            // Le chemin du tour repart de sa case (retour, piège qui fait remonter le temps).
            trail: [monster.pos],
          }
        : {
            // Chez l'adversaire, seule la mobilité (Charge) dure jusqu'au début de son tour.
            turnBonuses: monster.turnBonuses.filter((b) => b.mobility > 0).map((b) => ({ ...b, atk: 0, range: 0 })),
          };
    // Les bonus du tour précédent (ATK : Dopage, Seringue ; portée : Flèche divine) sont finis.
    next = setUnit(next, { ...monster, ...refreshed, atkBonus: 0, rangeBonus: 0, hasRiposted: false, revealed: false });
  }
  return next;
}

/** « Fin du tour » : la main passe à l'adversaire, dont le tour commence. Le mana non dépensé est conservé. */
export function applyEndTurn(state: GameState): GameState {
  return startTurn({ ...state, activePlayer: opponent(state.activePlayer), turn: state.turn + 1 });
}
