// API publique du moteur. L'UI n'importe que depuis ce fichier.
export * from './types';
export * from './board';
export * from './cards';
export * from './config';
export { createGame } from './game';
export { getManaLimit, getVictoryVp } from './players';
export { applyAction, getLegalActions } from './actions';
export { concede } from './concede';
export { getPlayerView, getViewZoneController, getViewZoneStatus, unitOrder } from './view';
export { IllegalActionError } from './errors';
export { canAdvance, getAttackCells, getAttackTargets, getDiagonalCells, getLineOfSightCells, getStrikeCells } from './combat';
export { getAreaCells, getAreaTargets, getEffectTargets, getPushDestination } from './effects';
export {
  getMoveDestinations,
  getMovePath,
  getNextTurnOnMoveBonus,
  getOnMoveBonus,
  pendingOnMove,
  type Destination,
} from './movement';
export { attackDamage, getStatikChain, hitsFromBehind, isBehind, previewAttack, type AttackPreview } from './combat';
export { getAllyChains, getEffectReach, getEmptySquareCells, getPullDestination, getTrapCells, isDirectionalZone } from './effects';
export { COMMON_CARDS } from './cards';
export { chainBetween, getPassage, getPassageSources, getTrapChains, type TrapChain } from './traps';
export { INITIAL_FACING } from './units';
export { canMove, getNextTurnMobility, hasCarapace, hasStatus, isMalus, isDisarmed, isSilenced, isStunned, normalStatus, ownerNextTurn, requiemCountdown, statusAmount, statusTotal, statusTurnsLeft } from './statuses';
export { getFreeSummonCells, getTerrainCells } from './play-card';
export { attackLimit, auraAtk, auraStealth, auraHp, auraMobility, auraRange, auraSources, canAttack, canFly, getAtk, getEffectCost, getKeyword, getRange, getMonsterAt, getMonsters, getUnitsAt, hasKeyword } from './units';
export { getControlledZones, getZoneCells, getZoneController, getZoneMana, getZoneOf, getZoneStatus } from './zones';
export { getHiddenUnitIds, isHiddenFrom } from './stealth';
export {
  attackAvailability,
  cardAvailability,
  effectAvailability,
  type Availability,
  type MissingTarget,
  type UnavailableReason,
} from './availability';
