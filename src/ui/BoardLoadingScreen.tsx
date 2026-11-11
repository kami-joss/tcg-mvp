// Écran de chargement du plateau : il couvre l'écran de jeu tant que le plateau n'est pas dessiné (moteur, sol peint,
// cases et unités), puis s'efface en fondu. Son contenu n'apparaît qu'après un court délai : un plateau prêt aussitôt
// (cache, retour de l'écran de passage) ne fait que passer d'un fond sombre au plateau. Règles dans `boardLoading.ts`.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  LOADER_DELAY_MS,
  LOADER_HINT_MS,
  LOADER_MAX_MS,
  LOADING_STEP_TEXT,
  WORLD_GRACE_MS,
  boardDrawn,
  loadingDone,
  loadingSteps,
} from './boardLoading';
import type { BoardProgress } from './boardLoading';

/** Où en est l'écran de chargement. */
export interface BoardLoading {
  /** L'écran se lève : la partie peut jouer (animations, IA, minuteur). */
  readonly done: boolean;
  /** Temps écoulé (ms) depuis l'arrivée de l'écran, mis à jour aux moments qui changent l'affichage. */
  readonly elapsed: number;
  /** Quand il s'est levé (ms depuis son arrivée), `null` avant. */
  readonly doneAt: number | null;
}

/** Durée (ms) du fondu de sortie. */
const LEAVE_MS = 320;
/** Levé avant ce temps (ms), l'écran n'a pas eu le temps d'être vu : il part sans fondu. */
const UNSEEN_MS = 100;

/** Suit le chargement du plateau d'après ce qu'il rapporte ; une fois levé, l'écran ne revient pas. */
export function useBoardLoading(progress: BoardProgress | null): BoardLoading {
  const start = useRef(performance.now());
  const drawnAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  // Avant d'être peint : un plateau déjà prêt ne montre pas l'écran.
  useLayoutEffect(() => {
    if (doneAt !== null) return;
    const now = performance.now() - start.current;
    if (drawnAt.current === null && progress && boardDrawn(progress)) drawnAt.current = now;
    const drawnFor = drawnAt.current === null ? null : now - drawnAt.current;
    if (loadingDone(progress, drawnFor, now)) {
      setDoneAt(now);
      return;
    }
    // Prochain moment où l'affichage change sans nouvelle du plateau : le contenu, l'explication, la fin de l'attente du
    // décor extérieur, le garde-fou.
    const next = Math.min(
      ...[LOADER_DELAY_MS, LOADER_HINT_MS, LOADER_MAX_MS, ...(drawnAt.current === null ? [] : [drawnAt.current + WORLD_GRACE_MS])].filter((t) => t > now),
    );
    const timer = window.setTimeout(() => setElapsed(performance.now() - start.current), next - now + 5);
    return () => window.clearTimeout(timer);
  }, [progress, elapsed, doneAt]);
  return { done: doneAt !== null, elapsed, doneAt };
}

interface BoardLoadingScreenProps {
  loading: BoardLoading;
  progress: BoardProgress | null;
  /** Nom de la carte, en titre. */
  boardName: string;
  animated: boolean;
}

export function BoardLoadingScreen({ loading, progress, boardName, animated }: BoardLoadingScreenProps) {
  const seen = loading.doneAt === null || loading.doneAt >= UNSEEN_MS;
  const fade = loading.done && animated && seen;
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!fade) return;
    const timer = window.setTimeout(() => setGone(true), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [fade]);
  if (gone || (loading.done && !fade)) return null;

  const steps = loadingSteps(progress ?? { engine: 'loading', ground: 'none', worldExpected: false, pieces: false });
  const content = loading.elapsed >= LOADER_DELAY_MS;
  // L'explication, seulement pendant que le sol se peint (le plus long, la première fois sur un appareil).
  const hint = loading.elapsed >= LOADER_HINT_MS && (steps.step === 'ground' || steps.step === 'world');
  return (
    <div className={`board-loading${loading.done ? ' is-done' : ''}`} role="status" aria-live="polite" aria-busy={!loading.done}>
      {content && (
        <div className="board-loading__box">
          <div className="board-loading__tiles" aria-hidden="true">
            {Array.from({ length: steps.total }, (_, i) => (
              <span key={i} className={i < steps.done ? 'is-lit' : i === steps.done ? 'is-now' : undefined} />
            ))}
          </div>
          <p className="board-loading__kicker">Chargement du plateau</p>
          <h1 className="board-loading__title">{boardName}</h1>
          <div
            className="board-loading__bar"
            role="progressbar"
            aria-label="Chargement du plateau"
            aria-valuemin={0}
            aria-valuemax={steps.total}
            aria-valuenow={steps.done}
          >
            <span style={{ width: `${(100 * steps.done) / steps.total}%` }} />
          </div>
          <p className="board-loading__step">{steps.step ? `${LOADING_STEP_TEXT[steps.step]}…` : 'Prêt'}</p>
          {hint && (
            <p className="board-loading__hint">
              La première fois sur un appareil, le sol du plateau se peint : c’est plus long. Il est ensuite gardé pour les
              prochaines parties.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
