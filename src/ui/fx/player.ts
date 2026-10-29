// Rejoue les événements d'une action en animation (handoff, lot 2). Le moteur a déjà tout résolu : on part de la vue
// d'avant l'action et, événement par événement, on anime puis on met l'écran à jour (`patch`). Les animations ne
// décident de rien : elles lisent les événements et la vue affichée. Les sons (lot 4) partent au même moment que l'effet
// visuel qu'ils accompagnent.
import { distance, getCard, getMonsterCard, statusAmount } from '../../engine';
import { trapLabel } from '../cardText';
import type { GameEvent, MonsterUnit, PlayerId, PlayerView, Position, StatusKind } from '../../engine';
import { CARD_ART } from '../art';
import { flyCard, placeTrap, revealTrap, shoot } from './missiles';
import type { Projectile } from './missiles';
import { sfx } from '../sfx/sound';
import type { SoundName } from '../sfx/sound';
import {
  bodyEl,
  burst,
  die,
  drop,
  explode,
  float,
  floatAt,
  flyTo,
  gust,
  land,
  lunge,
  net,
  pulse,
  quake,
  recoil,
  rise,
  shake,
  slam,
  wait,
  walk,
} from './stage';
import type { Stage } from './stage';

export interface Playback {
  readonly stage: Stage;
  /** Vue affichée en ce moment. */
  readonly shown: () => PlayerView;
  /** Applique l'événement à la vue affichée et attend qu'elle soit redessinée. */
  readonly patch: (event: GameEvent) => Promise<void>;
  /** La lecture a été interrompue (écran démonté) : arrêter au plus vite. */
  readonly stopped: () => boolean;
}

const PLAYER_COLORS: Readonly<Record<PlayerId, string>> = { 1: 'oklch(0.56 0.15 255)', 2: 'oklch(0.56 0.18 25)' };
const GOLD = 'oklch(0.85 0.13 85)';
const DAMAGE = 'oklch(0.9 0.12 60)';
const MANA = 'oklch(0.82 0.1 195)';
const VIOLET = 'oklch(0.72 0.15 300)';
/** Retour dans le temps (Explorateur du temps) : turquoise. */
const TIME_COLOR = 'oklch(0.82 0.11 195)';
const REQUIEM = 'oklch(0.7 0.06 300)';

/** Son de l'effet de zone de chaque dragon. */
const AREA_SOUNDS: Readonly<Record<string, SoundName>> = {
  'dragon-feu': 'fireball',
  'dragon-eau': 'spell',
  'dragon-vent': 'gust',
  'dragon-terre': 'terrain',
};

/** Son d'un statut posé ; le filet a déjà le sien, au déclenchement du piège. */
const STATUS_SOUNDS: Readonly<Record<StatusKind, SoundName | null>> = {
  slow: 'frost',
  burn: 'burn',
  stun: 'blocked',
  immobilise: null,
  requiem: null,
  camouflage: null,
};

/** Projectile d'un tireur, selon sa carte. */
function projectileOf(cardId: string): Exclude<Projectile, 'fireball' | 'magic'> {
  if (cardId === 'archer-du-feu') return 'fire';
  if (cardId === 'archer-de-glace') return 'ice';
  if (cardId === 'trebuchet') return 'stone';
  return 'arrow';
}

function monsterOf(view: PlayerView, unitId: string): MonsterUnit | undefined {
  const unit = view.units[unitId];
  return unit?.kind === 'monster' ? unit : undefined;
}

/** Le monstre du joueur le plus proche de `pos` (point de départ de la Boule de feu). */
function nearestOwn(view: PlayerView, player: PlayerId, pos: Position): Position | null {
  let best: Position | null = null;
  for (const unit of Object.values(view.units)) {
    if (unit.kind !== 'monster' || unit.owner !== player) continue;
    if (!best || distance(unit.pos, pos) < distance(best, pos)) best = unit.pos;
  }
  return best;
}

export async function playEvents(events: readonly GameEvent[], playback: Playback): Promise<void> {
  const { stage, shown, patch, stopped } = playback;
  let behind = false;
  let lastSpell: string | null = null;

  for (let i = 0; i < events.length && !stopped(); i++) {
    const event = events[i]!;
    switch (event.type) {
      case 'turnStart':
        sfx('turn');
        await wait(200);
        break;

      case 'mana': {
        const selector = `[data-mana="${event.player}"]`;
        if (event.amount < 0) {
          floatAt(stage, selector, `−${-event.amount}`, MANA);
          pulse(stage, selector, false);
        } else if (event.pos) {
          flyTo(stage, event.pos, selector, 'water-drop', '#7ea6f0');
          sfx('mana', 0.85);
          burst(stage, event.pos, GOLD, { n: 6, spread: 20, size: 4, ringScale: 2.2 });
          await wait(170);
        } else {
          floatAt(stage, selector, `+${event.amount}`, MANA);
          pulse(stage, selector, true);
          sfx('mana');
        }
        await patch(event);
        break;
      }

      case 'vp':
        if (event.pos) {
          float(stage, event.pos, `+${event.amount} VP`, GOLD, 120);
          flyTo(stage, event.pos, `[data-vp="${event.player}"]`, 'laurels', '#d9b44a', 80);
          sfx('vp', 0.93);
          await wait(170);
        } else {
          pulse(stage, `[data-vp="${event.player}"]`, true);
          sfx('vp');
        }
        await patch(event);
        break;

      case 'cardPlayed': {
        const card = getCard(event.cardId);
        lastSpell = card.kind === 'spell' ? card.id : null;
        sfx('card');
        if (card.kind === 'spell') sfx('spell', 0.59);
        await flyCard(stage, `[data-card="${event.cardId}"]`, event.pos, CARD_ART[event.cardId] ?? null, card.name, card.kind === 'spell');
        await patch(event);
        if (card.id === 'boule-de-feu') {
          const from = nearestOwn(shown(), event.player, event.pos);
          sfx('fireball');
          if (from) await shoot(stage, from, event.pos, 'fireball');
          sfx('bomb');
          explode(stage, event.pos, 'oklch(0.75 0.2 45)');
        }
        break;
      }

      case 'summon': {
        await patch(event);
        const { unit } = event;
        if (unit.kind === 'monster') {
          sfx('summon');
          await drop(stage, unit.id, unit.pos, PLAYER_COLORS[unit.owner]);
        } else {
          sfx('terrain', 0.2);
          await slam(stage, unit.id, unit.pos);
        }
        break;
      }

      case 'effect': {
        const source = monsterOf(shown(), event.unitId);
        if (!source) break;
        const ability = getMonsterCard(source.cardId).activated[event.effect ?? 0];
        recoil(stage, source.id);
        if (event.cells.length > 0) {
          sfx(AREA_SOUNDS[source.cardId] ?? 'spell');
          await areaBlast(stage, source.cardId, source.pos, event.cells);
        } else if (ability?.targeting.type === 'monster' && ability.effects.some((e) => e.type === 'damage')) {
          sfx('spell');
          await shoot(stage, source.pos, event.pos, 'magic');
        } else {
          if (ability?.targeting.type === 'monster') sfx('spell');
          await wait(150);
        }
        break;
      }

      case 'sacrifice':
        sfx('spell');
        rise(stage, event.pos, 'oklch(0.85 0.13 85)');
        await die(stage, event.unitId, event.pos);
        await patch(event);
        break;

      case 'trapPlaced':
        sfx('card');
        sfx('trapSet', 0.9);
        await placeTrap(stage, event.trap.pos, trapLabel(event.trap) === 'Bombe' ? 'bomb' : 'net');
        await patch(event);
        float(stage, event.trap.pos, 'Piégé', 'oklch(0.85 0.1 300)');
        break;

      case 'trapTriggered': {
        const kind = trapLabel(event.trap) === 'Bombe' ? 'bomb' : 'net';
        sfx('flip', 0.22);
        await revealTrap(stage, event.trap.pos, kind);
        await patch(event);
        sfx(kind);
        if (kind === 'bomb') explode(stage, event.trap.pos, 'oklch(0.78 0.19 50)');
        else net(stage, event.trap.pos);
        break;
      }

      case 'step': {
        // Les pas consécutifs d'un même monstre forment une seule marche.
        const steps = [event];
        while (i + 1 < events.length) {
          const next = events[i + 1]!;
          if (next.type !== 'step' || next.unitId !== event.unitId || next.kind !== event.kind) break;
          steps.push(next);
          i++;
        }
        if (event.kind === 'push') {
          sfx('gust');
          gust(stage, event.from, event.to);
          await wait(220);
        }
        const cells = steps.map((s) => s.to);
        if (event.kind !== 'push') {
          // Un pas sourd à chaque case, 210 ms par case.
          cells.forEach((_, n) => sfx('step', ((n + 1) * 210) / 1000 - 0.04));
        }
        const sliding = await walk(stage, event.unitId, event.from, cells, event.kind === 'push' ? { speed: 0.7, hop: 4 } : {});
        for (const s of steps) await patch(s);
        sliding?.cancel();
        land(stage, event.unitId, cells.at(-1)!);
        break;
      }

      case 'teleport': {
        // Le monstre s'efface dans une gerbe violette et réapparaît sur sa case d'arrivée.
        sfx('spell');
        rise(stage, event.from, VIOLET);
        await wait(260);
        await patch(event);
        await drop(stage, event.unitId, event.to, VIOLET);
        break;
      }

      case 'rewind': {
        // Retour dans le temps : le monstre s'efface dans une gerbe turquoise et réapparaît sur une case de son chemin.
        sfx('spell');
        rise(stage, event.from, TIME_COLOR);
        await wait(260);
        await patch(event);
        await drop(stage, event.unitId, event.to, TIME_COLOR);
        break;
      }

      case 'passage': {
        // L'unité (terrain, Golem de lave) s'éveille, son nom s'affiche sur le monstre ennemi qui entre dans sa zone.
        const source = shown().units[event.sourceId];
        sfx('flip');
        if (source) burst(stage, source.pos, VIOLET, { n: 10, spread: 30, size: 5, ringScale: 2.6 });
        float(stage, event.pos, source ? getCard(source.cardId).name : 'Passage', VIOLET);
        await wait(220);
        await patch(event);
        break;
      }

      case 'cellBurned':
        // La case s'embrase.
        sfx('fire');
        explode(stage, event.cell.pos, 'oklch(0.75 0.19 45)');
        await patch(event);
        float(stage, event.cell.pos, 'Brûle', 'oklch(0.8 0.16 55)');
        await wait(250);
        break;

      case 'burningCell':
        sfx('burn');
        burst(stage, event.cell.pos, 'oklch(0.78 0.19 50)', { n: 10, spread: 28, size: 5, ring: false, fall: -18 });
        float(stage, event.cell.pos, 'Case brûlée', 'oklch(0.8 0.16 55)');
        await patch(event);
        await wait(220);
        break;

      case 'stopped':
        sfx('blocked');
        await patch(event);
        float(stage, event.pos, 'Arrêté', 'oklch(0.9 0.05 220)');
        await wait(250);
        break;

      case 'attack': {
        const attacker = monsterOf(shown(), event.unitId);
        behind = event.behind;
        if (!attacker) break;
        const ranged = distance(event.from, event.to) > 1;
        let hit = 'oklch(0.97 0.02 85)';
        if (ranged) {
          recoil(stage, attacker.id);
          const type = projectileOf(attacker.cardId);
          sfx(type);
          hit = await shoot(stage, event.from, event.to, type);
          if (type === 'stone') quake(stage);
        } else {
          sfx('swing', 0.12);
          await lunge(stage, attacker.id, event.from, event.to);
        }
        burst(stage, event.to, hit, { n: behind ? 16 : 10, spread: behind ? 46 : 34, size: 6, flash: behind ? 'oklch(0.7 0.22 25)' : undefined });
        await patch(event);
        break;
      }

      case 'shotBlocked': {
        const attacker = monsterOf(shown(), event.unitId);
        if (attacker) recoil(stage, attacker.id);
        const type = attacker ? projectileOf(attacker.cardId) : 'arrow';
        sfx(type);
        const hit = await shoot(stage, event.from, event.pos, type);
        sfx('blocked');
        burst(stage, event.pos, hit, { n: 10 });
        float(stage, event.pos, 'Arrêté !', 'oklch(0.9 0.05 220)');
        await patch(event);
        break;
      }

      case 'revealed':
        sfx('flip');
        await patch(event);
        burst(stage, event.unit.pos, VIOLET, { n: 10, ringScale: 3 });
        float(stage, event.unit.pos, 'Révélé', 'oklch(0.85 0.1 300)', 150);
        await wait(450);
        break;

      case 'riposte':
        await wait(150);
        sfx('swing', 0.12);
        await lunge(stage, event.unitId, event.from, event.to);
        burst(stage, event.to, 'oklch(0.97 0.02 85)', { n: 10 });
        await patch(event);
        break;

      case 'damage': {
        const hard = behind || event.amount >= 3;
        const el = bodyEl(stage, event.unitId);
        if (event.cause === 'burn') {
          burst(stage, event.pos, 'oklch(0.78 0.19 50)', { n: 10, spread: 26, size: 5, ring: false, fall: -18 });
        }
        shake(el, hard);
        sfx(event.cause === 'burn' ? 'burn' : hard ? 'hitHard' : 'hit');
        const label = event.cause === 'attack' && behind ? `−${event.amount} dans le dos !` : `−${event.amount}`;
        float(stage, event.pos, label, event.cause === 'burn' ? 'oklch(0.8 0.16 55)' : DAMAGE);
        await patch(event);
        await wait(event.hp > 0 ? 320 : 0);
        behind = false;
        break;
      }

      case 'destroyed':
        sfx('death', 0.26);
        await die(stage, event.unitId, event.pos);
        await patch(event);
        break;

      case 'requiem':
        // Le requiem arrive à son terme : le monstre s'éteint dans une fumée sombre.
        rise(stage, event.pos, REQUIEM);
        float(stage, event.pos, 'Requiem', REQUIEM, 120);
        sfx('death', 0.26);
        await die(stage, event.unitId, event.pos);
        await patch(event);
        break;

      case 'heal':
        sfx('spell');
        burst(stage, event.pos, 'oklch(0.8 0.15 150)', { n: 10, spread: 30, size: 5, ringScale: 2.4 });
        float(stage, event.pos, `+${event.amount} PV`, 'oklch(0.85 0.15 150)');
        await patch(event);
        await wait(350);
        break;

      case 'buff':
        sfx('spell');
        burst(stage, event.pos, GOLD, { n: 12, spread: 36, size: 6, square: true });
        float(stage, event.pos, `+${event.atk} ATK · +${event.hp} PV`, GOLD);
        await patch(event);
        await wait(350);
        break;

      case 'boost':
        sfx('charge');
        burst(stage, event.pos, 'oklch(0.8 0.17 145)', { n: 12, spread: 34, size: 6, square: true });
        float(stage, event.pos, `+${event.atk} ATK`, 'oklch(0.85 0.17 145)');
        await patch(event);
        await wait(350);
        break;

      case 'auraHp':
        if (event.amount > 0) sfx('spell', 0.5);
        float(stage, event.pos, `${event.amount > 0 ? '+' : '−'}${Math.abs(event.amount)} PV (aura)`, event.amount > 0 ? GOLD : 'oklch(0.75 0.05 30)');
        await patch(event);
        await wait(250);
        break;

      case 'reach':
        sfx('charge');
        burst(stage, event.pos, 'oklch(0.8 0.17 145)', { n: 10, spread: 30, size: 5, square: true });
        float(stage, event.pos, `+${event.amount} portée`, 'oklch(0.85 0.17 145)');
        await patch(event);
        await wait(350);
        break;

      case 'mobility':
        sfx('charge');
        rise(stage, event.pos, 'oklch(0.85 0.13 195)');
        float(stage, event.pos, `+${event.amount} pas`, MANA);
        await patch(event);
        await wait(lastSpell === 'charge' ? 450 : 250);
        break;

      case 'status': {
        const { kind } = event.status;
        const amount = statusAmount(event.status);
        const sound = STATUS_SOUNDS[kind];
        if (sound) sfx(sound, 0.38);
        if (kind === 'slow') {
          burst(stage, event.pos, 'oklch(0.92 0.06 220)', { n: 8, square: true, spread: 26, size: 5, ring: false });
          float(stage, event.pos, `Slow ${amount}`, 'oklch(0.88 0.08 220)', 380);
        } else if (kind === 'burn') {
          burst(stage, event.pos, 'oklch(0.78 0.19 50)', { n: 8, spread: 26, size: 5, ring: false, fall: -18 });
          float(stage, event.pos, `Burn ${amount}`, 'oklch(0.8 0.16 55)', 380);
        } else if (kind === 'requiem') {
          rise(stage, event.pos, REQUIEM);
          float(stage, event.pos, `Requiem ${event.status.turns}`, REQUIEM, 380);
        } else if (kind === 'camouflage') {
          rise(stage, event.pos, 'oklch(0.7 0.05 280)');
          float(stage, event.pos, 'Invisible', 'oklch(0.8 0.06 280)', 380);
        } else if (kind === 'immobilise') {
          shake(bodyEl(stage, event.unitId), false);
          float(stage, event.pos, 'Immobilisé', 'oklch(0.85 0.1 300)');
        } else {
          shake(bodyEl(stage, event.unitId), true);
          burst(stage, event.pos, 'oklch(0.9 0.13 95)', { n: 10, spread: 30, size: 5, square: true });
          float(stage, event.pos, 'Stun', 'oklch(0.9 0.13 95)');
        }
        await patch(event);
        await wait(kind === 'immobilise' || kind === 'stun' || kind === 'requiem' ? 300 : 0);
        break;
      }
    }
  }
}

/** Effet de zone d'un dragon, sur chaque case touchée : flammes, vague, rafale ou secousse selon l'élément. */
async function areaBlast(stage: Stage, cardId: string, from: Position, cells: readonly Position[]): Promise<void> {
  switch (cardId) {
    case 'dragon-feu':
      for (const pos of cells) burst(stage, pos, 'oklch(0.78 0.19 50)', { n: 14, spread: 40, size: 7, flash: 'oklch(0.8 0.18 60)', flashScale: 2.4, fall: -14 });
      quake(stage);
      break;
    case 'dragon-eau':
      for (const pos of cells) burst(stage, pos, 'oklch(0.75 0.12 230)', { n: 16, spread: 44, size: 6, flash: 'oklch(0.85 0.08 220)', ringScale: 3.4 });
      break;
    case 'dragon-vent':
      for (const pos of cells) gust(stage, from, pos);
      break;
    default:
      quake(stage);
      for (const pos of cells) burst(stage, pos, 'oklch(0.6 0.05 70)', { n: 14, spread: 40, size: 9, ring: false, fall: 10 });
  }
  await wait(450);
}
