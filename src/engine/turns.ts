// Déroulé des tours (SPEC.md §4.2) : fin de tour, puis début de tour du joueur suivant.
import { BASE_MANA_CAP, BASE_MANA_FIRST_TURN, MANA_GROWTH_PER_TURN, RESERVE_BASE_MANA_CAP, VP_PER_CONTROLLED_ZONE } from './config';
import { dealDamage } from './damage';
import { emit } from './events';
import { addMana, addVp, opponent } from './players';
import { expireBurningCells, expireTraps, sweepZonesAtTurnStart } from './traps';
import { getMonsterCard } from './cards';
import { applyTriggeredEffects } from './effects';
import { expireStatuses, statusTotal, turnMobility } from './statuses';
import { statTotal } from './units';
import { auraMobility, getMonsters, removeUnit, setUnit } from './units';
import { isInZone } from './board';
import { getControlledZones, getZoneMana } from './zones';
import type { Economy, GameState } from './types';

/** Mana de base du tour `turn` (numéro global) : 3 à son premier tour, +1 à chacun de ses tours suivants, 10 au plus (§4.2). */
export function getBaseMana(turn: number, economy: Economy = 'classic'): number {
  const cap = economy === 'reserve' ? RESERVE_BASE_MANA_CAP : BASE_MANA_CAP;
  return Math.min(cap, BASE_MANA_FIRST_TURN + (Math.ceil(turn / 2) - 1) * MANA_GROWTH_PER_TURN);
}

/**
 * Début de tour du joueur actif : le mana qu'il n'a pas dépensé est perdu, puis il reçoit le mana de base de son tour
 * et, pour chaque mana zone contrôlée (contrôle évalué maintenant, §4.4), des VP, et le mana (bonus compris) de celles où
 * il a un terrain. Ses monstres récupèrent
 * toute leur mobilité, leur attaque et leur effet activé. Tous les monstres récupèrent leur riposte,
 * limitée à une par tour, et un monstre `invisible` révélé redevient caché (§10).
 */
export function startTurn(state: GameState): GameState {
  const player = state.activePlayer;

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
  // Économie classique : le mana non dépensé est perdu ; « Réserve » : il reste, et les revenus s'arrêtent à la limite.
  if (next.economy !== 'reserve') next = addMana(next, player, -next.players[player].mana);
  next = addMana(next, player, getBaseMana(next.turn, next.economy));
  for (const { pos } of zones) next = addMana(next, player, getZoneMana(next, pos), pos);
  for (const { pos } of zones) next = addVp(next, player, VP_PER_CONTROLLED_ZONE, pos);

  // 2. Effets passifs de début de tour (Ki né) : sur ses alliés de l'archétype autour de lui (§4.2).
  for (const source of getMonsters(next, player)) {
    const trigger = getMonsterCard(source.cardId).turnStart;
    if (!trigger || !next.units[source.id]) continue;
    const allies = getMonsters(next, player).filter(
      (m) => m.id !== source.id && getMonsterCard(m.cardId).archetype === trigger.archetype && isInZone(next.board, source.pos, m.pos, trigger.zone),
    );
    for (const ally of allies) next = applyTriggeredEffects(next, trigger.effects, ally.id, source);
  }

  // 2 bis. Zones (Golem de lave) : chaque ennemi resté dans la zone est de nouveau touché (§10).
  next = sweepZonesAtTurnStart(next, player);

  // 2 ter. Récupération et absorbation : +X PV au début de son tour, jusqu'à ses PV max (§5 bis).
  for (const monster of getMonsters(next, player)) {
    const gain = statusTotal(monster, 'recuperation') + statusTotal(monster, 'absorbation');
    if (gain > 0) next = healBy(next, monster.id, gain);
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
  // Absorbé : au début du tour de l'adversaire de son porteur, il perd N PV par instance, et le monstre qui l'a posé
  // (`by`, s'il est encore là) gagne les PV réellement perdus ; une destruction profite à l'absorbeur comme pour burn.
  for (const unit of Object.values(next.units)) {
    if (unit.owner === player) continue;
    for (const status of unit.statuses) {
      if (status.kind !== 'absorbe') continue;
      const target = next.units[unit.id];
      if (!target) break;
      const lost = Math.min(status.amount, target.hp);
      next = dealDamage(next, unit.id, status.amount, player, 'burn');
      if (status.by && lost > 0) next = healBy(next, status.by, lost);
    }
  }

  for (const current of [...getMonsters(next, 1), ...getMonsters(next, 2)]) {
    // Son déplacement arrêté (sablier, retour…), la mobilité dépensée au-delà de sa forme et le bonus d'un Terrain de
    // chasse déjà reçu ne valaient que son tour.
    const { halted: _halted, mobilityDebt: _debt, onMoveTaken: _taken, armed: _armed, ...fresh } = current;
    // Un monstre armé qui n'a pas attaqué perd son bonus à la fin de son tour : celui de l'adversaire aussi, au début du mien.
    const { armed: _spent, ...unarmed } = current;
    const monster = current.owner === player ? fresh : unarmed;
    // Mobilité de la carte, plus les auras et le bonus du plateau, moins les slow ; 0 si stun ou immobilisé (§5 bis).
    const refreshed =
      monster.owner === player
        ? {
            mobilityLeft: turnMobility(monster, auraMobility(next, monster)),
            // Les slow retirent des pas, mobilité +X en ajoute (affichage « pas restants »).
            froze: statusTotal(monster, 'slow'),
            boost: statTotal(monster, 'mobility'),
            turnBonuses: [],
            hasAttacked: false,
            attacksMade: 0,
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

/** Rend `amount` PV à l'unité `unitId` si c'est un monstre encore sur le plateau, sans dépasser ses PV max. */
function healBy(state: GameState, unitId: string, amount: number): GameState {
  const unit = state.units[unitId];
  if (unit?.kind !== 'monster') return state;
  const hp = Math.min(unit.maxHp, unit.hp + amount);
  if (hp === unit.hp) return state;
  return setUnit(emit(state, { type: 'heal', unitId, pos: unit.pos, amount: hp - unit.hp }), { ...unit, hp });
}

/** « Fin du tour » : la main passe à l'adversaire, dont le tour commence. Le mana non dépensé est perdu au début de son prochain tour. */
export function applyEndTurn(state: GameState): GameState {
  return startTurn({ ...state, activePlayer: opponent(state.activePlayer), turn: state.turn + 1 });
}
