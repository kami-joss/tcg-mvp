// Raccourcis du zoom du plateau : + et − au clavier, 0 pour la taille ajustée ; Ctrl ou ⌘ + molette sur le plateau, et le
// pincement du pavé tactile (que les navigateurs envoient comme une molette avec Ctrl). La molette seule fait toujours
// défiler le plateau. Logique pure et testée ; `GameScreen` écoute le clavier, `Board` la molette.

/** Un cran de zoom vers le haut ou vers le bas, ou le retour à la taille ajustée (100 %). */
export type ZoomShortcut = 1 | -1 | 'reset';

/**
 * La touche d'un raccourci du zoom, ou `null`. Lue sur le caractère, pour tous les claviers (en AZERTY, « + » est sur la
 * touche « = »), et sur la touche pour le pavé numérique et le 0 (« à » en AZERTY). Avec Ctrl, ⌘ ou Alt, rien : Ctrl/⌘ +
 * et − restent le zoom du navigateur.
 */
export function zoomKey(event: {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}): ZoomShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') return 1;
  if (event.key === '-' || event.code === 'NumpadSubtract') return -1;
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') return 'reset';
  return null;
}

/** Défilement (px) qui fait un cran de zoom : un cran de molette (environ 100 px) en fait un, un pincement s'additionne. */
export const WHEEL_STEP_PX = 60;
/** Une ligne de défilement en pixels (molette comptée en lignes, Firefox) : un cran de 3 lignes fait un cran de zoom. */
const LINE_PX = 40;

/**
 * Molette avec Ctrl ou ⌘ : le défilement s'additionne jusqu'à un cran de zoom (vers le haut : zoomer). Un changement de
 * sens repart de zéro. `deltaMode` : pixels (0), lignes (1) ou pages (2).
 */
export function wheelZoom(accumulated: number, deltaY: number, deltaMode: number): { readonly accumulated: number; readonly step: 1 | -1 | 0 } {
  const px = deltaMode === 1 ? deltaY * LINE_PX : deltaMode === 2 ? deltaY * 400 : deltaY;
  const total = Math.sign(px) === Math.sign(accumulated) ? accumulated + px : px;
  if (Math.abs(total) < WHEEL_STEP_PX) return { accumulated: total, step: 0 };
  return { accumulated: 0, step: total < 0 ? 1 : -1 };
}
