// API publique du moteur. L'UI n'importe que depuis ce fichier.
export * from './types';
export * from './board';
export * from './cards';
export * from './config';
export { createGame } from './game';
export { applyAction, getLegalActions } from './actions';
export { getPlayerView, getViewZoneController } from './view';
export { IllegalActionError } from './errors';
export { canAdvance, getAttackTargets, getLineOfSightCells, getStrikeCells } from './combat';
export { getAreaCells, getAreaTargets, getEffectTargets, getPushDestination } from './effects';
export { getMoveDestinations, getMovePath, type Destination } from './movement';
export { attackDamage, hitsFromBehind, isBehind, previewAttack, type AttackPreview } from './combat';
export { getEmptyAdjacentCells, getTrapCells } from './effects';
export { COMMON_CARDS } from './cards';
export { getPassage, getPassageSources } from './traps';
export { INITIAL_FACING } from './units';
export { canMove, getNextTurnMobility, hasStatus, isStunned, ownerNextTurn, requiemCountdown, statusAmount, statusTotal, statusTurnsLeft } from './statuses';
export { getFreeSummonCells, getTerrainCells } from './play-card';
export { auraAtk, auraHp, auraMobility, auraSources, getAtk, getKeyword, getRange, getMonsterAt, getMonsters, getUnitsAt, hasKeyword } from './units';
export { getControlledZones, getZoneController, getZoneMana } from './zones';
export { getHiddenUnitIds, isHiddenFrom } from './stealth';
export {
  attackAvailability,
  cardAvailability,
  effectAvailability,
  type Availability,
  type MissingTarget,
  type UnavailableReason,
} from './availability';
