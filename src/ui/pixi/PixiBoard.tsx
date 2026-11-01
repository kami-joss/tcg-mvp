// Plateau 15 × 15 dessiné par PixiJS (réglage expérimental, migration étape 3) : un canvas de la taille du cadre qui
// défile, collé en haut à gauche de ce cadre et sous la scène en HTML (qui garde pour l'instant les cases et les jetons).
// Il suit le défilement et la caméra de la scène : chaque défilement le redessine aussitôt, en phase avec le HTML.
// PixiJS est chargé à la demande ; sans WebGL, rien n'est dessiné (le sol reste vide) et un avertissement l'explique.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Board, Position } from '../../engine';
import type { TokenStats } from '../settings';
import type { CellInputs } from './cellModel';
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
  /** Ce que les cases montrent (vue, sélection, surbrillances, chemin, menace). */
  cells: Omit<CellInputs, 'flipped' | 'animated'>;
  /** Stats affichées sur les jetons, et case sous la bulle d'action (son jeton ne grossit pas au survol). */
  stats: TokenStats;
  anchor: Position | null;
  /** La souris passe par le canvas : la case sous elle (celle d'un jeton dont la goutte dépasse sur une autre comprise). */
  onCellClick: (pos: Position) => void;
  onCellContextMenu?: (pos: Position) => void;
  onCellHover: (pos: Position | null, rect?: DOMRect) => void;
}

const NO_MASKS: Readonly<Record<string, string>> = {};

export function PixiBoard(props: PixiBoardProps) {
  const { board, camera, plan, flipped, animated, ground, world, controllers, reveal, viewport, scene, cells, stats, anchor } = props;
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

  // Cases : redessinées quand la vue, la sélection ou le survol changent.
  const { view, highlights, attacks, selectedUnitId, focused, path, reach } = cells;
  useEffect(() => {
    renderer?.setCells({ view, highlights, attacks, selectedUnitId, focused, path, reach, flipped, animated });
  }, [renderer, view, highlights, attacks, selectedUnitId, focused, path, reach, flipped, animated]);

  // Unités : redessinées quand la vue, la sélection, les cibles ou les stats affichées changent.
  useEffect(() => {
    renderer?.setUnits({ view, highlights, attacks, selectedUnitId, flipped, stats, animated, anchor });
  }, [renderer, view, highlights, attacks, selectedUnitId, flipped, stats, animated, anchor]);

  // Souris : la case sous elle vient du canvas (les cases en HTML ne la captent plus). Les rappels les plus récents
  // servent, sans réinstaller les écouteurs.
  const handlers = useRef(props);
  handlers.current = props;
  useEffect(() => {
    const frame = viewport.current;
    if (!renderer || !frame) return;
    let hovered: string | null = null;
    const cellUnder = (event: MouseEvent): Position | null => {
      // Un autre bouton dans le cadre (bulle d'action…) garde ses clics.
      if (event.target instanceof Element && event.target.closest('button:not([data-cell]), a, input, select, textarea, label, [role="dialog"]')) return null;
      const box = frame.getBoundingClientRect();
      return renderer.cellAt(event.clientX - box.left - frame.clientLeft, event.clientY - box.top - frame.clientTop);
    };
    const cellRect = (pos: Position) => scene.current?.querySelector(`[data-cell="${pos.row},${pos.col}"]`)?.getBoundingClientRect();
    const hover = (pos: Position | null) => {
      const key = pos ? `${pos.row},${pos.col}` : null;
      if (key === hovered) return;
      hovered = key;
      renderer.setHover(key);
      const { cells: c, onCellHover } = handlers.current;
      // Main tendue sur ce qui se clique : une case en surbrillance ou une unité.
      frame.style.cursor = key && (c.highlights.has(key) || Object.values(c.view.units).some((u) => u.pos.row === pos!.row && u.pos.col === pos!.col)) ? 'pointer' : '';
      onCellHover(pos, pos ? cellRect(pos) : undefined);
    };
    const move = (event: PointerEvent) => hover(frame.classList.contains('is-dragging') ? null : cellUnder(event));
    const leave = () => hover(null);
    const click = (event: MouseEvent) => {
      // Le clic qui suit un glisser du plateau est annulé (`useZoomViewport`).
      if (event.defaultPrevented || event.button !== 0) return;
      const pos = cellUnder(event);
      if (pos) handlers.current.onCellClick(pos);
    };
    const context = (event: MouseEvent) => {
      const pos = cellUnder(event);
      if (!pos) return;
      event.preventDefault();
      handlers.current.onCellContextMenu?.(pos);
    };
    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerleave', leave);
    frame.addEventListener('click', click);
    frame.addEventListener('contextmenu', context);
    return () => {
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerleave', leave);
      frame.removeEventListener('click', click);
      frame.removeEventListener('contextmenu', context);
      frame.style.cursor = '';
    };
  }, [renderer, viewport, scene]);

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
