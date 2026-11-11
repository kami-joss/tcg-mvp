// Minuteur du tour en cours (barre du haut) : il avance tant que le chrono tourne (`running`), s'arrête pendant les
// actions et leurs animations, et prévient une fois quand le temps de réflexion est écoulé. Monté avec la clé du tour
// (et de l'horloge suivie, en ligne) : chaque tour repart de 3 minutes, ou du temps que donne l'horloge reçue. Calculs
// dans `turnTimer.ts`.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { isTimeUp, spend, timerState } from './turnTimer';

/** Intervalle de mise à jour : le temps est mesuré, pas compté par tops. */
const TICK_MS = 250;

interface TurnTimerProps {
  running: boolean;
  /** Le temps de réflexion du tour est écoulé (appelé une fois) ; absent : une autorité extérieure finit le tour. */
  onTimeUp?: () => void;
  /** Temps déjà pris au montage : celui de l'horloge suivie (partie en ligne), ou 0. */
  initialSpent?: number;
}

export function TurnTimer({ running, onTimeUp, initialSpent = 0 }: TurnTimerProps) {
  const [spent, setSpent] = useState(initialSpent);
  const timeUp = useRef(onTimeUp);
  timeUp.current = onTimeUp;
  const fired = useRef(false);

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      setSpent((current) => spend(current, elapsed, true));
    };
    const id = window.setInterval(tick, TICK_MS);
    // À l'arrêt du chrono (une action commence), le temps écoulé depuis le dernier top compte encore.
    return () => {
      window.clearInterval(id);
      tick();
    };
  }, [running]);

  useEffect(() => {
    if (!running || fired.current || !isTimeUp(spent)) return;
    fired.current = true;
    timeUp.current?.();
  }, [running, spent]);

  const { text, low, paused } = timerState(spent, running);
  const classes = ['turn-timer', low && 'is-low', paused && 'is-paused'].filter(Boolean).join(' ');
  return (
    <span
      className={classes}
      role="timer"
      aria-label={`Temps de réflexion restant : ${text}`}
      title="Temps de réflexion du tour : il s’arrête pendant les actions. À 0:00, le tour finit."
    >
      <Icon name="timer-outline" />
      {text}
    </span>
  );
}
