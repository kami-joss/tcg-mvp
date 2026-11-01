// Caméra isométrique du plateau dessiné par PixiJS (migration, étape 3) : la même projection que le plateau en CSS,
// `scale(k) rotateX(54,7356°) rotateZ(45°)` autour du centre du plateau, posé au milieu de la scène (`isoCamera`). Sans
// perspective, c'est une transformation affine : un point (x, y) du plan s'affiche en X = (x − y) / √2, Y = (x + y) / √6
// (fois k), et s'avance vers la caméra de (x + y) / √3. Pur et testé.
import type { Matrix2D } from '../iso/ambience';
import type { IsoCamera } from '../iso/scenery';

const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);
const SQRT6 = Math.sqrt(6);

/** Matrice du plan du plateau (côté `plan` px) vers la scène isométrique (px de la scène, avant défilement). */
export function isoPlaneMatrix(camera: Pick<IsoCamera, 'k' | 'width' | 'centerY'>, plan: number): Matrix2D {
  const { k, width, centerY } = camera;
  return [k / SQRT2, k / SQRT6, -k / SQRT2, k / SQRT6, width / 2, centerY - (plan * k) / SQRT6];
}

/** Un point du plan à l'écran (px de la scène), et son avancée vers la caméra (px de plan) pour le tri. */
export function isoProject(camera: Pick<IsoCamera, 'k' | 'width' | 'centerY'>, plan: number, x: number, y: number): { x: number; y: number; depth: number } {
  const [a, b, c, d, tx, ty] = isoPlaneMatrix(camera, plan);
  return { x: a * x + c * y + tx, y: b * x + d * y + ty, depth: (x + y) / SQRT3 };
}

/** Le point du plan sous un point de l'écran (px de la scène) : l'inverse de `isoProject`, au niveau du sol. */
export function isoUnproject(camera: Pick<IsoCamera, 'k' | 'width' | 'centerY'>, plan: number, sx: number, sy: number): { x: number; y: number } {
  const [a, b, c, d, tx, ty] = isoPlaneMatrix(camera, plan);
  const det = a * d - b * c;
  const [u, v] = [sx - tx, sy - ty];
  return { x: (d * u - c * v) / det, y: (a * v - b * u) / det };
}

/**
 * Ordre de dessin d'un élément debout ancré en (x, y) du plan et avancé de `dz` vers la caméra : plus il est grand, plus
 * l'élément passe devant. Le même calcul que `spritesHiding` et que la 3D du plateau en CSS.
 */
export const isoDepth = (x: number, y: number, dz: number): number => (x + y) / SQRT3 + dz;
