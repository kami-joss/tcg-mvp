// Caméra des actions de l'adversaire : quand un de ses monstres agit (déplacement, attaque, effet actif, téléportation),
// la vue se centre sur lui avant l'animation. Pur et testé ; `GameScreen` pilote la caméra du plateau.
import type { GameEvent, PlayerId, PlayerView, Position } from '../../engine';

/**
 * La case sur laquelle centrer la vue pour l'action `events`, ou `null` : le premier monstre qui agit, s'il est à
 * l'adversaire de `viewer` et visible sur `before` (la vue d'avant l'action). Une attaque ou un effet : sa case de départ ;
 * un déplacement ou une téléportation : sa case d'arrivée (la vue le suit). Une carte jouée, un piège ou la riposte ne
 * comptent pas.
 */
export function cameraFocusOf(events: readonly GameEvent[], before: PlayerView, viewer: PlayerId): Position | null {
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    let unitId: string;
    switch (event.type) {
      case 'attack':
      case 'effect':
      case 'teleport':
        unitId = event.unitId;
        break;
      case 'step':
        if (event.kind !== 'walk') continue;
        unitId = event.unitId;
        break;
      default:
        continue;
    }
    const unit = before.units[unitId];
    if (unit?.kind !== 'monster' || unit.owner === viewer) return null;
    switch (event.type) {
      case 'attack':
        return event.from;
      case 'teleport':
        return event.to;
      case 'step': {
        let to = event.to;
        for (const next of events.slice(i + 1)) if (next.type === 'step' && next.kind === 'walk' && next.unitId === unitId) to = next.to;
        return to;
      }
      default:
        return unit.pos;
    }
  }
  return null;
}
