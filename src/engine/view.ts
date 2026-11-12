// Vue d'un joueur (SPEC.md §2, §4.3) : l'état de la partie sans les informations cachées.
import { getLegalActions } from './actions';
import { getBeacons, getRevealedTraps } from './beacons';
import { getManaZones } from './board';
import { getVictoryVp, opponent } from './players';
import { getHiddenUnitIds, perceivedBy } from './stealth';
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
    cards: state.cards,
    mode: state.mode,
    economy: state.economy,
    manaRules: state.manaRules,
    victoryVp: getVictoryVp(state),
    units: withoutEnemyTrails(perceivedBy(state, player).units, player),
    activePlayer: state.activePlayer,
    turn: state.turn,
    winner: state.winner,
    concession: state.concession,
    me: state.players[player],
    opponent: {
      id: other.id,
      mana: other.mana,
      vp: other.vp,
      graveyard: other.graveyard,
      onBoardHidden: onBoardHiddenFrom(state, player),
      grimoireCount: other.grimoire.length,
    },
    // Ses pièges, et les pièges ennemis que révèlent ses balises (Balise de vision, §10).
    traps: [...state.traps.filter((trap) => trap.owner === player), ...getRevealedTraps(state, player)],
    burningCells: state.burningCells,
    beacons: getBeacons(state),
    hiddenFromOpponent: getHiddenUnitIds(state, opponent(player)),
    hiddenEnemies: getHiddenUnitIds(state, player),
    zoneControl: getManaZones(state.board).map(({ pos }) => getZoneStatus(state, pos)),
    legalActions: state.activePlayer === player ? getLegalActions(state) : [],
    events: getVisibleEvents(state, player),
  };
}

/**
 * Les unités de l'adversaire sur le plateau que `player` ne voit pas (invisibles, camouflées) : leur carte seulement,
 * dans l'ordre où elles sont arrivées, jamais brillantes (§4.3, §10). Ce qui a été joué est public, pas la case.
 */
function onBoardHiddenFrom(state: GameState, player: PlayerId): readonly CardCopy[] {
  return getHiddenUnitIds(state, player)
    .map((id) => state.units[id])
    .filter((unit): unit is Unit => unit !== undefined)
    .sort((a, b) => unitOrder(a.id) - unitOrder(b.id))
    .map((unit) => ({ cardId: unit.cardId }));
}

/** Rang d'arrivée d'une unité sur le plateau : son numéro (`u12` → 12). */
export function unitOrder(id: UnitId): number {
  return Number(id.replace(/\D/g, '')) || 0;
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
      return event.targetId ? [event.unitId, event.targetId] : [event.unitId];
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
    case 'cleansed':
      return [event.unitId];
    case 'revived':
    case 'turnStart':
    case 'mana':
    case 'vp':
    case 'cardPlayed':
    case 'trapPlaced':
    case 'cellBurned':
    case 'beaconPlaced':
    case 'beaconDamage':
    case 'beaconDestroyed':
    case 'arcs':
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
    .map((event) => {
      // Arcs électriques : sans ceux qui partent d'un monstre caché au joueur ou y arrivent (ce serait dire sa case).
      if (event.type !== 'arcs') return event;
      return { ...event, arcs: event.arcs.filter((arc) => !isHidden(arc.fromId) && !isHidden(arc.toId)) };
    })
    .filter((event) => {
      if (event.type === 'trapPlaced') return event.trap.owner === player;
      if (event.type === 'arcs') return event.arcs.length > 0;
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
