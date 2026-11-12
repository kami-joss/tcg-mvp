// Balises (Balise de vision, SPEC.md §6 ter, §10, 2026-11-12) : ni monstre ni terrain, elles sont rangées à part, comme
// les pièges et les cases brûlées. Publiques, au sol, elles ne bloquent rien (déplacements, tirs, invocations, mana zones,
// camouflage : rien ne les voit comme une unité). Une attaque ou un sort de dégâts touche une balise quand aucun monstre
// n'est sur sa case ; détruite, elle va au cimetière de son joueur, sans VP. Elle révèle à son joueur les pièges ennemis de
// son carré de N.
import { getManaZones, isPlayable, samePos, squareCells } from './board';
import { getCard } from './cards';
import { emit } from './events';
import { updatePlayer } from './players';
import { getMonsters, getUnitsAt } from './units';
import { getZoneStatus } from './zones';
import type { Beacon, BeaconCard, BoardState, GameState, PlayerId, Position, Trap, UnitId } from './types';

/** Les balises posées (aucune dans une partie d'avant les balises). */
export const getBeacons = (state: { readonly beacons?: readonly Beacon[] }): readonly Beacon[] => state.beacons ?? [];

export const getBeacon = (state: { readonly beacons?: readonly Beacon[] }, id: UnitId): Beacon | undefined =>
  getBeacons(state).find((beacon) => beacon.id === id);

export const getBeaconAt = (state: { readonly beacons?: readonly Beacon[] }, pos: Position): Beacon | undefined =>
  getBeacons(state).find((beacon) => samePos(beacon.pos, pos));

/** La carte de cette balise. */
export function getBeaconCard(state: Pick<BoardState, 'cards'>, beacon: Beacon): BeaconCard {
  const card = getCard(state.cards, beacon.cardId);
  if (card.kind !== 'beacon') throw new Error(`« ${beacon.cardId} » n'est pas une balise`);
  return card;
}

/**
 * Cases où `player` peut poser cette balise : libres (sans unité qu'il voit ni balise) dans le carré de N d'un de ses
 * monstres (falaises et cases X coupent le carré), sauf la case centrale d'une mana zone qu'il tient (là où il poserait un
 * terrain). `seen` : ce qu'il voit ; `real` : l'état réel, pour les mana zones (leur état est public, §10). Un monstre
 * adverse caché sur la case ne gêne pas : la balise est au sol, ils partagent la case.
 */
export function getBeaconCells(seen: GameState, card: BeaconCard, player: PlayerId, real: GameState = seen): Position[] {
  const cells = new Map<string, Position>();
  for (const monster of getMonsters(seen, player)) {
    for (const pos of squareCells(seen.board, monster.pos, card.placement.square)) cells.set(`${pos.row},${pos.col}`, pos);
  }
  const held = getManaZones(real.board)
    .map((zone) => zone.pos)
    .filter((pos) => getZoneStatus(real, pos).controller === player);
  return [...cells.values()].filter(
    (pos) =>
      isPlayable(seen.board, pos) && getUnitsAt(seen, pos).length === 0 && !getBeaconAt(seen, pos) && !held.some((center) => samePos(center, pos)),
  );
}

/** Pose la balise de `player` sur la case (cible déjà validée). */
export function placeBeacon(state: GameState, card: BeaconCard, player: PlayerId, pos: Position, shiny: boolean): GameState {
  const beacon: Beacon = {
    id: `u${state.nextUnitId}`,
    cardId: card.id,
    owner: player,
    pos: { row: pos.row, col: pos.col },
    hp: card.hp,
    maxHp: card.hp,
    ...(shiny ? { shiny: true as const } : {}),
  };
  return { ...emit(state, { type: 'beaconPlaced', beacon }), beacons: [...getBeacons(state), beacon], nextUnitId: state.nextUnitId + 1 };
}

/** Retire `amount` PV à la balise ; à 0, elle est détruite et va au cimetière de son joueur, sans VP pour personne. */
export function damageBeacon(state: GameState, beaconId: UnitId, amount: number): GameState {
  const beacon = getBeacon(state, beaconId);
  if (!beacon) return state;
  const hp = beacon.hp - amount;
  const hit = emit(state, { type: 'beaconDamage', beaconId, pos: beacon.pos, amount: Math.min(amount, beacon.hp), hp: Math.max(0, hp) });
  if (hp > 0) return { ...hit, beacons: getBeacons(hit).map((b) => (b.id === beaconId ? { ...b, hp } : b)) };
  const gone = { ...emit(hit, { type: 'beaconDestroyed', beaconId, pos: beacon.pos }), beacons: getBeacons(hit).filter((b) => b.id !== beaconId) };
  const owner = gone.players[beacon.owner];
  return updatePlayer(gone, beacon.owner, { graveyard: [...owner.graveyard, { cardId: beacon.cardId, ...(beacon.shiny ? { shiny: true as const } : {}) }] });
}

/** Les balises ennemies de `player` sur ces cases, seules (aucun monstre sur leur case) : ce qu'un sort de dégâts touche. */
export function enemyBeaconsOn(state: GameState, player: PlayerId, cells: readonly Position[]): Beacon[] {
  return getBeacons(state).filter(
    (beacon) =>
      beacon.owner !== player &&
      cells.some((pos) => samePos(pos, beacon.pos)) &&
      !getUnitsAt(state, beacon.pos).some((unit) => unit.kind === 'monster'),
  );
}

/** Les pièges ennemis que `player` voit grâce à ses balises : dans le carré de N d'une d'elles (falaises et cases X coupent). */
export function getRevealedTraps(state: GameState, player: PlayerId): Trap[] {
  const watched = getBeacons(state)
    .filter((beacon) => beacon.owner === player)
    .flatMap((beacon) => [beacon.pos, ...squareCells(state.board, beacon.pos, getBeaconCard(state, beacon).revealTraps.square)]);
  return state.traps.filter((trap) => trap.owner !== player && watched.some((pos) => samePos(pos, trap.pos)));
}
