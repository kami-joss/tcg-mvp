// Écran de chargement du plateau : ce qui est déjà dessiné, l'étape à afficher, et quand le lever. Logique pure et
// testée ; `BoardLoadingScreen.tsx` affiche et mesure le temps.

/** Ce que le plateau a déjà dessiné (rapporté par `Board`). */
export interface BoardProgress {
  /** Le moteur de dessin (PixiJS) : en chargement, prêt, ou indisponible (sans WebGL, rien de plus ne viendra). */
  readonly engine: 'loading' | 'ready' | 'failed';
  /** Le sol peint à l'écran : aucun (vert uni d'attente), celui du plateau seul, ou celui du monde (décor extérieur). */
  readonly ground: 'none' | 'board' | 'world';
  /** Le sol du monde viendra : sinon, le plateau seul suffit. */
  readonly worldExpected: boolean;
  /** Cases et unités dessinées, illustrations des jetons comprises. */
  readonly pieces: boolean;
}

/** Un plateau sans rien à attendre (plateau en HTML sans sol peint). */
export const BOARD_DRAWN: BoardProgress = { engine: 'ready', ground: 'board', worldExpected: false, pieces: true };

/** Étapes du chargement, dans l'ordre. */
export type LoadingStep = 'engine' | 'ground' | 'pieces' | 'world';

export const LOADING_STEP_TEXT: Readonly<Record<LoadingStep, string>> = {
  engine: 'Préparation du plateau',
  ground: 'Peinture du sol',
  pieces: 'Placement des pièces',
  world: 'Décor autour du plateau',
};

/**
 * Le plateau prêt (sans le décor extérieur), on attend encore ce dernier au plus ce temps (ms) : lu dans le cache, il
 * suit aussitôt ; calculé la première fois sur un appareil, en quelques secondes. Au-delà, il arrivera pendant la partie.
 */
export const WORLD_GRACE_MS = 8000;
/** Le contenu de l'écran (titre, barre) n'apparaît qu'après ce temps (ms) : un plateau prêt aussitôt ne fait pas clignoter de texte. */
export const LOADER_DELAY_MS = 700;
/** Au-delà de ce temps (ms), l'écran explique que le premier chargement sur un appareil est plus long. */
export const LOADER_HINT_MS = 2500;
/** Garde-fou (ms) : l'écran se lève quoi qu'il arrive (un sol qui ne vient pas ne bloque pas la partie). */
export const LOADER_MAX_MS = 30_000;

/** L'étape en cours (`null` : tout est là), et le nombre d'étapes faites sur le total. */
export function loadingSteps(progress: BoardProgress): { readonly step: LoadingStep | null; readonly done: number; readonly total: number } {
  const steps: [LoadingStep, boolean][] = [
    ['engine', progress.engine !== 'loading'],
    ['ground', progress.ground !== 'none'],
    ['pieces', progress.pieces],
    ...(progress.worldExpected ? [['world', progress.ground === 'world'] as [LoadingStep, boolean]] : []),
  ];
  const done = steps.filter(([, ok]) => ok).length;
  return { step: steps.find(([, ok]) => !ok)?.[0] ?? null, done, total: steps.length };
}

/** Le plateau lui-même est dessiné : son sol peint, ses cases et ses unités (le décor extérieur peut encore venir). */
export function boardDrawn(progress: BoardProgress): boolean {
  return progress.engine === 'failed' || (progress.engine === 'ready' && progress.ground !== 'none' && progress.pieces);
}

/**
 * L'écran se lève-t-il ? Quand tout est là ; ou le plateau dessiné depuis `WORLD_GRACE_MS` sans son décor extérieur (qui
 * se calcule encore : il arrivera pendant la partie) ; ou sans moteur de dessin ; ou après `LOADER_MAX_MS` dans tous les
 * cas. `drawnFor` : depuis combien de temps (ms) le plateau est dessiné (`null` s'il ne l'est pas) ; `elapsed` : depuis
 * combien de temps l'écran est là.
 */
export function loadingDone(progress: BoardProgress | null, drawnFor: number | null, elapsed: number): boolean {
  if (elapsed >= LOADER_MAX_MS) return true;
  if (!progress || !boardDrawn(progress)) return false;
  if (progress.engine === 'failed' || !progress.worldExpected || progress.ground === 'world') return true;
  return drawnFor !== null && drawnFor >= WORLD_GRACE_MS;
}
