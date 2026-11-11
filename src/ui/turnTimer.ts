// Minuteur de tour (option de l'accueil, SPEC.md §4.2) : un joueur a `TURN_TIMER_SECONDS` de réflexion par tour ; seul
// compte le temps où il réfléchit, sans rien qui se passe : les actions et leurs animations ne comptent pas. Au-delà, son
// tour finit. Contre l'IA, seul le joueur humain est minuté ; en hotseat, l'écran de passage ne compte pas (l'écran de
// jeu n'est pas affiché). Calculs purs ; `TurnTimerBadge.tsx` fait avancer le temps (nom distinct : macOS ignore la casse).
import { TURN_TIMER_SECONDS } from '../engine';

export const TURN_TIMER_MS = TURN_TIMER_SECONDS * 1000;

/** Sous ce temps restant, le minuteur passe en alerte. */
export const TIMER_WARNING_MS = 30_000;

/** Temps de réflexion pris pendant le tour, après `elapsed` ms : il n'avance que si le chrono tourne. */
export function spend(spent: number, elapsed: number, running: boolean): number {
  return running ? spent + Math.max(0, elapsed) : spent;
}

export const remainingMs = (spent: number): number => Math.max(0, TURN_TIMER_MS - spent);

export const isTimeUp = (spent: number): boolean => spent >= TURN_TIMER_MS;

/** « 3:00 », « 0:09 » : les secondes arrondies au-dessus, 0:00 seulement quand le temps est écoulé. */
export function timerText(remaining: number): string {
  const seconds = Math.ceil(Math.max(0, remaining) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Le chrono tourne : la partie a un minuteur, c'est au joueur de cet écran de jouer (jamais à l'IA, ni une fois la partie
 * finie) et rien ne se passe à l'écran (aucune action en cours d'animation).
 */
export function timerRuns(enabled: boolean, myTurn: boolean, busy: boolean): boolean {
  return enabled && myTurn && !busy;
}

/** Ce que montre le minuteur : le temps restant, en alerte sous `TIMER_WARNING_MS`, en pause pendant une action. */
export function timerState(spent: number, running: boolean): { readonly text: string; readonly low: boolean; readonly paused: boolean } {
  const remaining = remainingMs(spent);
  return { text: timerText(remaining), low: remaining <= TIMER_WARNING_MS, paused: !running };
}

/**
 * Horloge suivie (partie en ligne) : celle de l'autorité qui minute (le serveur), renvoyée à chaque nouvelle de la
 * partie. L'écran l'affiche en la faisant avancer entre deux nouvelles ; c'est l'autorité qui finit le tour.
 */
export interface ExternalClock {
  /** Change à chaque horloge reçue : le minuteur repart de `spent`. */
  readonly id: number;
  /** Temps de réflexion déjà pris dans le tour en cours, à la réception. */
  readonly spent: number;
  /** Le chrono tourne : le joueur actif réfléchit, aucune action ne se joue. */
  readonly running: boolean;
}

/** Ce que la barre du haut fait du minuteur. */
export interface TimerDisplay {
  /** Le minuteur est affiché (sa place reste réservée sinon). */
  readonly shown: boolean;
  /** Clé de montage : le tour, et l'horloge reçue ; une nouvelle clé fait repartir le minuteur de `spent`. */
  readonly key: string;
  readonly spent: number;
  readonly running: boolean;
  /** Le minuteur finit lui-même le tour à 0:00 (partie locale) ; avec une horloge suivie, c'est l'autorité. */
  readonly local: boolean;
}

/**
 * Le minuteur de la barre du haut. En local (`enabled`, sans horloge suivie) : pendant le tour du joueur de l'écran, de
 * 3:00 à chaque tour. Avec une horloge suivie : pendant le tour de chacun, tel que l'autorité le compte (et arrêté
 * pendant les animations de cet écran). `null` : la partie n'a pas de minuteur.
 */
export function timerDisplay(options: {
  readonly enabled: boolean;
  readonly clock: ExternalClock | null;
  readonly myTurn: boolean;
  readonly busy: boolean;
  readonly turn: number;
  readonly over: boolean;
}): TimerDisplay | null {
  const { enabled, clock, myTurn, busy, turn, over } = options;
  if (clock) return { shown: !over, key: `${turn}:${clock.id}`, spent: clock.spent, running: clock.running && !busy && !over, local: false };
  if (!enabled) return null;
  return { shown: myTurn, key: String(turn), spent: 0, running: timerRuns(true, myTurn, busy), local: true };
}
