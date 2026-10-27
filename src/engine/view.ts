// Vue d'un joueur (SPEC.md §2, §4.3) : l'état de la partie sans les informations cachées.
import { getLegalActions } from './actions';
import { getManaZones } from './board';
import { opponent } from './players';
import { getHiddenUnitIds, perceivedBy } from './stealth';
import { getZoneController } from './zones';
import type { GameEvent, GameState, PlayerId, PlayerView, Position, Unit, UnitId } from './types';

/**
 * Tout est public sauf le contenu du grimoire adverse, dont seul le nombre de cartes est donné, ses pièges et ses
 * monstres invisibles (§10) ; le contrôle des mana zones reste public, même tenu par un monstre invisible.
 * Les actions légales ne sont fournies qu'au joueur actif : elles révèlent son grimoire.
 */
export function getPlayerView(state: GameState, player: PlayerId): PlayerView {
  const other = state.players[opponent(player)];
  return {
    viewer: player,
    board: state.board,
    units: withoutEnemyTrails(perceivedBy(state, player).units, player),
    activePlayer: state.activePlayer,
    turn: state.turn,
    winner: state.winner,
    me: state.players[player],
    opponent: {
      id: other.id,
      mana: other.mana,
      vp: other.vp,
      used: other.used,
      grimoireCount: other.grimoire.length,
    },
    traps: state.traps.filter((trap) => trap.owner === player),
    burningCells: state.burningCells,
    hiddenFromOpponent: getHiddenUnitIds(state, opponent(player)),
    hiddenEnemies: getHiddenUnitIds(state, player),
    zoneControl: getManaZones(state.board).map(({ pos }) => ({ pos, controller: getZoneController(state, pos) })),
    legalActions: state.activePlayer === player ? getLegalActions(state) : [],
    events: getVisibleEvents(state, player),
  };
}

/**
 * Le chemin du tour d'un monstre adverse n'est pas montré : il pourrait dire par où il est passé en étant invisible.
 * Seule sa case actuelle reste.
 */
function withoutEnemyTrails(units: Readonly<Record<UnitId, Unit>>, player: PlayerId): Readonly<Record<UnitId, Unit>> {
  return Object.fromEntries(
    Object.entries(units).map(([id, unit]) => [
      id,
      unit.kind === 'monster' && unit.owner !== player && unit.trail.length > 1 ? { ...unit, trail: [unit.pos] } : unit,
    ]),
  );
}

/** Unités dont parle un événement. */
function eventUnits(event: GameEvent): UnitId[] {
  switch (event.type) {
    case 'summon':
    case 'revealed':
      return [event.unit.id];
    case 'attack':
    case 'riposte':
      return [event.unitId, event.targetId];
    case 'trapTriggered':
    case 'teleport':
    case 'rewind':
    case 'passage':
    case 'burningCell':
    case 'effect':
    case 'sacrifice':
    case 'step':
    case 'stopped':
    case 'shotBlocked':
    case 'damage':
    case 'destroyed':
    case 'heal':
    case 'buff':
    case 'boost':
    case 'reach':
    case 'auraHp':
    case 'requiem':
    case 'mobility':
    case 'status':
      return [event.unitId];
    case 'turnStart':
    case 'mana':
    case 'vp':
    case 'cardPlayed':
    case 'trapPlaced':
    case 'cellBurned':
      return [];
  }
}

/**
 * Événements que `player` a le droit de voir : jamais la pose d'un piège adverse, ni ce qui concerne un monstre
 * qui lui est invisible à la fin de l'action (§10).
 */
function getVisibleEvents(state: GameState, player: PlayerId): GameEvent[] {
  const hidden = getHiddenUnitIds(state, player);
  return state.events.filter((event) => {
    if (event.type === 'trapPlaced') return event.trap.owner === player;
    return eventUnits(event).every((id) => !hidden.includes(id));
  });
}

/** Joueur qui contrôle la mana zone en `pos`, d'après la vue : l'information est publique (§10). */
export function getViewZoneController(view: PlayerView, pos: Position): PlayerId | null {
  return view.zoneControl.find((zone) => zone.pos.row === pos.row && zone.pos.col === pos.col)?.controller ?? null;
}
