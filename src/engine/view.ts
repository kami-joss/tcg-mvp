// Vue d'un joueur (SPEC.md §2, §4.3) : l'état de la partie sans les informations cachées.
import { getLegalActions } from './actions';
import { getManaZones } from './board';
import { opponent } from './players';
import { getHiddenUnitIds, perceivedBy } from './stealth';
import { cardOfOrigin } from './units';
import { getZoneStatus } from './zones';
import type { CardCopy, GameEvent, GameState, PlayerId, PlayerView, Position, Unit, UnitId, ZoneStatus } from './types';

/**
 * Tout est public sauf le contenu du grimoire adverse, dont seul le nombre de cartes est donné, ses pièges et ses
 * monstres invisibles (§10) ; le contrôle des mana zones reste public, même tenu par un monstre invisible. Son
 * cimetière et ses cartes jouées aussi : un monstre camouflé y figure par sa carte, sans sa case.
 * Les actions légales ne sont fournies qu'au joueur actif : elles révèlent son grimoire.
 */
export function getPlayerView(state: GameState, player: PlayerId): PlayerView {
  const other = state.players[opponent(player)];
  return {
    viewer: player,
    board: state.board,
    mode: state.mode,
    units: withoutEnemyTrails(perceivedBy(state, player).units, player),
    activePlayer: state.activePlayer,
    turn: state.turn,
    winner: state.winner,
    me: state.players[player],
    opponent: {
      id: other.id,
      mana: other.mana,
      vp: other.vp,
      graveyard: other.graveyard,
      played: playedSeenBy(state, player),
      grimoireCount: other.grimoire.length,
    },
    traps: state.traps.filter((trap) => trap.owner === player),
    burningCells: state.burningCells,
    hiddenFromOpponent: getHiddenUnitIds(state, opponent(player)),
    hiddenEnemies: getHiddenUnitIds(state, player),
    zoneControl: getManaZones(state.board).map(({ pos }) => getZoneStatus(state, pos)),
    legalActions: state.activePlayer === player ? getLegalActions(state) : [],
    events: getVisibleEvents(state, player),
  };
}

/**
 * Cartes jouées de l'adversaire, telles que `player` les voit : publiques (§10), mais un exemplaire brillant dont l'unité
 * lui est cachée (camouflée) n'y est pas brillant, comme cette unité. Pour chaque unité cachée brillante, l'exemplaire
 * brillant le plus récent de sa carte est montré normal : le joueur voit autant d'exemplaires brillants qu'il en a vu.
 */
function playedSeenBy(state: GameState, player: PlayerId): readonly CardCopy[] {
  const { played } = state.players[opponent(player)];
  const hidden = getHiddenUnitIds(state, player).flatMap((id) => {
    const unit = state.units[id];
    return unit?.shiny ? [cardOfOrigin(unit)] : [];
  });
  if (hidden.length === 0) return played;
  const seen = [...played];
  for (const cardId of hidden) {
    for (let i = seen.length - 1; i >= 0; i--) {
      if (seen[i]!.cardId === cardId && seen[i]!.shiny) {
        seen[i] = { cardId };
        break;
      }
    }
  }
  return seen;
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
    case 'transform':
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
 * qui lui est invisible à la fin de l'action (§10). Une carte jouée vers ce monstre (son invocation, un sort sur lui) ou
 * l'effet d'un monstre visible sur lui restent, sans sa case.
 */
function getVisibleEvents(state: GameState, player: PlayerId): GameEvent[] {
  const hidden = getHiddenUnitIds(state, player);
  const isHidden = (id: UnitId | undefined) => id !== undefined && hidden.includes(id);
  return state.events
    .filter((event) => {
      if (event.type === 'trapPlaced') return event.trap.owner === player;
      return eventUnits(event).every((id) => !hidden.includes(id));
    })
    .map((event) => {
      if (event.type === 'cardPlayed' && isHidden(event.unitId)) return { ...event, pos: null };
      if (event.type === 'effect' && isHidden(event.targetId)) return { ...event, pos: null };
      return event;
    });
}

/** Qui tient la mana zone en `pos`, d'après la vue : l'information est publique (§10). */
export function getViewZoneStatus(view: Pick<PlayerView, 'zoneControl'>, pos: Position): ZoneStatus {
  return view.zoneControl.find((zone) => zone.pos.row === pos.row && zone.pos.col === pos.col) ?? { pos, controller: null, contested: false };
}

/** Joueur qui contrôle la mana zone en `pos`, d'après la vue ; `null` si elle est neutre ou contestée. */
export function getViewZoneController(view: Pick<PlayerView, 'zoneControl'>, pos: Position): PlayerId | null {
  return getViewZoneStatus(view, pos).controller;
}
