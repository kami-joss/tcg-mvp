// Sons d'une action quand les animations sont coupées (handoff, lot 4) : sans animation à suivre, chaque événement
// marquant joue son son principal, les uns après les autres. Avec les animations, `fx/player.ts` cale chaque son sur son
// effet visuel.
import { distance } from '../../engine';
import type { CardId, GameEvent } from '../../engine';
import { trapLabel } from '../cardText';
import type { SoundName } from './recipes';

/** Projectile (et donc son) d'un tireur, selon sa carte. */
export function shotSound(cardId: CardId | undefined): SoundName {
  if (cardId === 'archer-du-feu') return 'fire';
  if (cardId === 'archer-de-glace') return 'ice';
  if (cardId === 'trebuchet') return 'stone';
  return 'arrow';
}

/** Son principal d'un événement, ou `null` s'il n'en a pas. `cardOf` : la carte d'une unité, si elle est connue. */
function soundOf(event: GameEvent, cardOf: (unitId: string) => CardId | undefined): SoundName | null {
  switch (event.type) {
    case 'turnStart':
      return 'turn';
    case 'mana':
      return event.amount > 0 ? 'mana' : null;
    case 'vp':
      return 'vp';
    case 'cardPlayed':
      return 'card';
    case 'summon':
      return event.unit.kind === 'monster' ? 'summon' : 'terrain';
    case 'effect':
      return event.cells.length > 0 ? 'spell' : null;
    case 'sacrifice':
    case 'heal':
    case 'buff':
      return 'spell';
    case 'trapPlaced':
      return 'trapSet';
    case 'trapTriggered':
      return trapLabel(event.trap) === 'Bombe' ? 'bomb' : 'net';
    case 'step':
      return event.kind === 'push' ? 'gust' : 'step';
    case 'stopped':
    case 'shotBlocked':
      return 'blocked';
    case 'teleport':
    case 'rewind':
      return 'spell';
    case 'cellBurned':
      return 'fire';
    case 'burningCell':
      return 'burn';
    case 'passage':
      return 'flip';
    case 'attack':
      return distance(event.from, event.to) > 1 ? shotSound(cardOf(event.unitId)) : 'swing';
    case 'riposte':
      return 'swing';
    case 'revealed':
      return 'flip';
    case 'damage':
      if (event.cause === 'burn') return 'burn';
      return event.amount >= 3 ? 'hitHard' : 'hit';
    case 'destroyed':
      return 'death';
    case 'mobility':
    case 'boost':
    case 'reach':
      return 'charge';
    case 'auraHp':
      return event.amount > 0 ? 'spell' : null;
    case 'requiem':
      return 'death';
    case 'status':
      return event.status.kind === 'slow' ? 'frost' : event.status.kind === 'burn' ? 'burn' : event.status.kind === 'stun' ? 'blocked' : null;
  }
}

/** Sons d'une action sans animation, avec leur délai en secondes : 0,1 s entre deux sons, 0,21 s entre deux pas. */
export function eventSounds(
  events: readonly GameEvent[],
  cardOf: (unitId: string) => CardId | undefined = () => undefined,
): [SoundName, number][] {
  const out: [SoundName, number][] = [];
  let at = 0;
  let previous: GameEvent | null = null;
  for (const event of events) {
    const sound = soundOf(event, cardOf);
    // Un recul ne souffle qu'une fois, même sur plusieurs cases.
    const samePush =
      event.type === 'step' && event.kind === 'push' && previous?.type === 'step' && previous.kind === 'push' && previous.unitId === event.unitId;
    previous = event;
    if (!sound || samePush) continue;
    out.push([sound, Number(at.toFixed(2))]);
    at += sound === 'step' ? 0.21 : 0.1;
  }
  return out;
}
