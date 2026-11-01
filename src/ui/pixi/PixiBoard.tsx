// Plateau 15 × 15 dessiné par PixiJS (réglage expérimental, migration étape 3) : un canvas de la taille du cadre qui
// défile, collé en haut à gauche de ce cadre et sous la scène en HTML (qui garde pour l'instant les cases et les jetons).
// Il suit le défilement et la caméra de la scène : chaque défilement le redessine aussitôt, en phase avec le HTML.
// PixiJS est chargé à la demande ; sans WebGL, rien n'est dessiné (le sol reste vide) et un avertissement l'explique.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Board } from '../../engine';
import type { ZoneControllers } from '../iso/ambience';
import { useWaterMasks } from '../iso/paintedDecor';
import type { IsoCamera } from '../iso/scenery';
import { BoardRenderer } from './boardRenderer';

interface PixiBoardProps {
  board: Board;
  camera: IsoCamera;
  /** Côté du plan du plateau (px). */
  plan: number;
  flipped: boolean;
  animated: boolean;
  /** Sol du plateau seul, puis du monde peint (`usePaintedGround`). */
  ground: string | null;
  world: string | null;
  controllers: ZoneControllers;
  /** Cases à dégager (« ligne,colonne ») : les sprites qui les cachent s'effacent. */
  reveal: ReadonlySet<string>;
  /** Le cadre qui défile, et la scène en HTML dont le canvas suit la position. */
  viewport: RefObject<HTMLElement | null>;
  scene: RefObject<HTMLElement | null>;
}

const NO_MASKS: Readonly<Record<string, string>> = {};

export function PixiBoard({ board, camera, plan, flipped, animated, ground, world, controllers, reveal, viewport, scene }: PixiBoardProps) {
  const host = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const masks = useWaterMasks(board, animated) ?? NO_MASKS;

  // Le canvas a la taille de la partie visible du cadre (après la pose des références : effet, pas effet de mise en page).
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewport]);

  // L'application PixiJS, une fois.
  useEffect(() => {
    let disposed = false;
    let created: { app: import('pixi.js').Application; renderer: BoardRenderer } | null = null;
    (async () => {
      const pixi = await import('pixi.js');
      if (disposed || !host.current) return;
      const app = new pixi.Application();
      try {
        await app.init({
          resizeTo: host.current,
          backgroundAlpha: 0,
          resolution: Math.min(2, window.devicePixelRatio || 1),
          autoDensity: true,
          antialias: true,
          preference: 'webgl',
          autoStart: false,
          eventMode: 'none',
        });
      } catch (error) {
        console.warn('Plateau PixiJS indisponible (WebGL) :', error);
        return;
      }
      if (disposed) {
        app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
        return;
      }
      app.ticker.stop();
      Object.assign(app.canvas.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      host.current.appendChild(app.canvas);
      created = { app, renderer: new BoardRenderer(pixi, app) };
      if (import.meta.env.DEV) Object.assign(window, { __pixiBoard: created });
      setRenderer(created.renderer);
    })().catch((error: unknown) => console.warn('Plateau PixiJS indisponible :', error));
    return () => {
      disposed = true;
      setRenderer(null);
      if (created) {
        created.renderer.destroy();
        created.app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
      }
    };
  }, []);

  // Taille du canvas : PixiJS la suit (`resizeTo`), puis on redessine.
  useEffect(() => {
    if (!renderer) return;
    renderer.resize();
  }, [renderer, size.width, size.height]);

  // Décor : refait quand le sol arrive, que l'ambiance change ou qu'une zone change de mains.
  const zoneKey = [...controllers].map(([cell, owner]) => `${cell}=${owner}`).join('|');
  useEffect(() => {
    if (!renderer) return;
    renderer
      .setDecor({ board, flipped, animated, ground, world, controllers, masks })
      .catch((error: unknown) => console.warn('Décor du plateau PixiJS incomplet :', error));
    // `controllers` ne compte que par `zoneKey`.
  }, [renderer, board, flipped, animated, ground, world, zoneKey, masks]);

  useEffect(() => {
    renderer?.setCamera(camera, plan);
  }, [renderer, camera.k, camera.width, camera.centerY, plan]);

  const revealKey = [...reveal].sort().join('|');
  useEffect(() => {
    renderer?.setReveal(reveal);
    // `reveal` ne compte que par `revealKey`.
  }, [renderer, revealKey]);

  // Position de la scène dans le cadre : suivie au défilement et au redimensionnement.
  useLayoutEffect(() => {
    const frame = viewport.current;
    const target = scene.current;
    if (!renderer || !frame || !target) return;
    const sync = () => {
      const f = frame.getBoundingClientRect();
      const s = target.getBoundingClientRect();
      renderer.setOffset(s.left - f.left - frame.clientLeft, s.top - f.top - frame.clientTop);
    };
    sync();
    frame.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(frame);
    observer.observe(target);
    return () => {
      frame.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [renderer, viewport, scene, camera.k, camera.width, camera.centerY]);

  return (
    <div className="pixi-board" aria-hidden="true">
      <div ref={host} className="pixi-board__canvas" style={{ width: size.width, height: size.height }} />
    </div>
  );
}
