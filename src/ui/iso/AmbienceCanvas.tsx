// Ambiance au sol du plateau peint (15 × 15), dessinée par PixiJS (WebGL) dans un seul canvas posé dans le plan du
// plateau, juste au-dessus du sol peint et sous les ponts, les cases et les jetons : reflets de l'eau (un shader par
// pièce d'eau, masqué sur son eau : reflets qui coulent, caustiques qui dérivent, scintillements), ombres de nuages,
// rafales et halos des mana zones. Un seul calque pour le navigateur, au lieu d'une centaine d'éléments animés en CSS
// (mesuré : la moitié du CPU du plateau au repos). 30 images par seconde suffisent à ces mouvements lents.
// PixiJS est chargé à la demande (import dynamique) : seulement sur un plateau peint, animations permises. Sans WebGL,
// pas d'ambiance au sol, le reste du jeu est inchangé. Le canvas ne capte pas la souris.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Application } from 'pixi.js';
import { buildGroundFx } from '../pixi/groundFx';
import type { BuiltScene, Pixi } from '../pixi/groundFx';
import type { GroundAmbience } from './ambience';
import { worldDensity } from './paintedDecor';

/** Images par seconde de l'ambiance au sol. */
const FPS = 30;

/** Application PixiJS vivante (`alive` passe à faux quand elle est détruite). */
interface Live {
  readonly module: Pixi;
  readonly app: Application;
  alive: boolean;
}

interface AmbienceCanvasProps {
  scene: GroundAmbience;
  /** Masques de l'eau de chaque image de pièce d'eau (`useWaterMasks`). */
  masks: Readonly<Record<string, string>>;
  /** Profondeur dans le plan du plateau (entre le sol peint et les ponts couchés). */
  depth: number;
}

export function AmbienceCanvas({ scene, masks, depth }: AmbienceCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<Live | null>(null);
  const { x, y, width, height } = scene.bounds;

  // L'application PixiJS et son canvas, une fois par emprise.
  useEffect(() => {
    let disposed = false;
    let record: Live | null = null;
    (async () => {
      const module = await import('pixi.js');
      if (disposed) return;
      const app = new module.Application();
      try {
        await app.init({
          width,
          height,
          backgroundAlpha: 0,
          resolution: worldDensity(),
          autoDensity: true,
          antialias: false,
          preference: 'webgl',
          eventMode: 'none',
        });
      } catch (error) {
        console.warn('Ambiance au sol indisponible (WebGL) :', error);
        return;
      }
      if (disposed) {
        app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
        return;
      }
      app.ticker.maxFPS = FPS;
      Object.assign(app.canvas.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      host.current?.appendChild(app.canvas);
      record = { module, app, alive: true };
      setLive(record);
    })().catch((error: unknown) => console.warn('Ambiance au sol indisponible :', error));
    return () => {
      disposed = true;
      setLive(null);
      if (record) {
        record.alive = false;
        record.app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
      }
    };
  }, [width, height]);

  // Sa scène, refaite quand l'eau (masques prêts, décor extérieur), les halos (contrôleur d'une zone) ou le sens du
  // plateau changent. Ce nettoyage-ci passe après celui de l'application quand l'emprise change : il ne touche alors
  // plus à l'application détruite.
  useEffect(() => {
    if (!live) return;
    let disposed = false;
    let built: BuiltScene | null = null;
    const tick = () => built?.update(performance.now() / 1000);
    // Le canvas couvre `bounds` : la scène est dessinée dans le repère du plateau, décalée d'autant.
    const origin = { x: -scene.bounds.x, y: -scene.bounds.y };
    buildGroundFx(live.module, live.app.stage, scene, masks, () => live.alive && !disposed, origin).then(
      (result) => {
        if (!result) return;
        built = result;
        tick();
        live.app.ticker.add(tick);
      },
      (error: unknown) => console.warn('Ambiance au sol incomplète :', error),
    );
    return () => {
      disposed = true;
      if (live.alive) live.app.ticker.remove(tick);
      built?.destroy();
    };
  }, [live, scene, masks]);

  const style: CSSProperties = { position: 'absolute', left: x, top: y, width, height, transform: `translateZ(${depth}px)`, pointerEvents: 'none' };
  return <div ref={host} data-ambience="" aria-hidden="true" style={style} />;
}

