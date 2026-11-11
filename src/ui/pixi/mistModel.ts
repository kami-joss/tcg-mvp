// Mer de brume sous l'île (2026-11-11) : à la place du fond noir autour du monde peint, un fond de nuit et deux couches
// de la même brume peinte (`assets/plateau15/fond/brume.webp`, raccordée, le noir rendu transparent) qui dérivent
// lentement, plus ou moins vite selon leur profondeur. Les bords du monde sont déjà fondus en transparence
// (`buildGround`, section 6) : le décor se perd dans la brume. Pur et testé ; `BoardRenderer` la dessine.

/** Fond de nuit sous la brume, violet-bleu (les tons de la Mine) au lieu du brun-noir de l'écran. */
export const MIST_NIGHT = 0x17162a;

/** Côté du motif de brume (px). */
export const MIST_TILE = 1024;

export interface MistLayer {
  /** Opacité et teinte de la couche. */
  readonly alpha: number;
  readonly tint: number;
  /** Taille de la brume à l'échelle 1 de la caméra (×1 = 1024 px par motif). */
  readonly scale: number;
  /** Part du défilement que suit la couche : moins que le plateau (1), elle paraît plus bas, plus loin. */
  readonly parallax: number;
  /** Dérive, en px par seconde à l'écran. */
  readonly drift: readonly [number, number];
  /** Décalage de départ (px), pour que les deux couches ne se superposent pas. */
  readonly offset: readonly [number, number];
}

/** Du fond vers l'avant : la couche lointaine, petite et lente, puis la proche, plus grande et plus vive. */
export const MIST_LAYERS: readonly MistLayer[] = [
  { alpha: 0.32, tint: 0xa9a3c9, scale: 0.7, parallax: 0.35, drift: [5, 1.2], offset: [0, 0] },
  { alpha: 0.24, tint: 0xd4cfe6, scale: 1.15, parallax: 0.6, drift: [11, 2.5], offset: [380, 610] },
];

/**
 * Où poser le motif d'une couche : `scroll` = décalage du monde dans le canvas (`world.position`), `k` = échelle de la
 * caméra, `t` = temps en secondes (0 sans animation). La brume grandit moins vite que le plateau quand on zoome
 * (racine de `k`) : elle reste loin dessous.
 */
export function mistTile(layer: MistLayer, scroll: { readonly x: number; readonly y: number }, k: number, t: number): { x: number; y: number; scale: number } {
  const scale = layer.scale * Math.sqrt(k);
  // Ramené dans un motif : après des heures de dérive, de grands décalages perdraient en précision dans le shader.
  const period = MIST_TILE * scale;
  const wrap = (v: number) => ((v % period) + period) % period;
  return {
    x: wrap(layer.offset[0] + scroll.x * layer.parallax + layer.drift[0] * t),
    y: wrap(layer.offset[1] + scroll.y * layer.parallax + layer.drift[1] * t),
    scale,
  };
}
