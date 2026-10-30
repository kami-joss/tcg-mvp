// Plateau (SPEC.md §3, §7) : cases cliquables et calques superposés, du fond vers le dessus : atténuation, portée
// adverse, surbrillances, pièges, terrains, monstres, cible d'attaque, nom de zone, falaises.
// Trois vues (handoff, lots 3 et 5) : de dessus, inclinée à 45° (le sol bascule, les jetons restent debout face à
// l'écran), ou isométrique (Champ de bataille seulement : bloc de terrain, décor, mana zones modélisées, rivière).
// Le plateau peut être retourné pour que le camp du joueur actif soit en bas : seules les coordonnées d'affichage
// changent, les textes et les badges restent à l'endroit. Le plateau remplit sa zone de l'écran : la taille des cases
// (ou l'échelle de la vue isométrique) est choisie pour que toute la scène y tienne, jusqu'à ×1,35 sans que les jetons
// grossissent (lot 11 : plus d'espace autour des monstres). La zone défile dès que la scène la dépasse (zoom, ou vue
// isométrique calée sur la largeur), à la molette ou en la faisant glisser.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import {
  MANA_ZONE_NAMES,
  allPositions,
  getAtk,
  getCard,
  getCell,
  getCliff,
  getMonsterCard,
  getUnitsAt,
  getViewZoneStatus,
  requiemCountdown,
  samePos,
  statusAmount,
} from '../engine';
import type { Board as BoardData, Direction, MonsterUnit, PlayerView, Position, Status, StatusKind, TerrainUnit, Trap, Unit, UnitId } from '../engine';
import { CARD_ART, boardArt, fitBackground, shortName, tokenFit } from './art';
import { Icon } from './Icon';
import { isExhausted, posKey } from './interaction';
import type { AttackPreview, Highlight } from './interaction';
import { trapLabel } from './cardText';
import { IsoDecor } from './iso/IsoDecor';
import { boardMetrics, fitCell, tiltGeometry } from './boardGeometry';
import { ISO_TILT, isoCamera, isoFloor, isoScenery, planSize, waterKind } from './iso/scenery';
import { flatGroundBackground, paintedDecor, usePaintedGround, worldPlan } from './iso/paintedDecor';
import { DEFAULT_TOKEN_STATS } from './settings';
import type { BoardView, TokenStats } from './settings';
import { FLIP_EDGE, getZoneTiles } from './contestZones';
import type { ZoneTile } from './contestZones';
import { STATUS_ICONS, diceLayout, getZoneMarks } from './zoneMarks';
import type { ZoneMark } from './zoneMarks';

interface BoardProps {
  view: PlayerView;
  highlights: ReadonlyMap<string, Highlight>;
  attacks: ReadonlyMap<string, AttackPreview>;
  selectedUnitId: UnitId | null;
  /** Case sous la bulle d'action : son jeton ne grossit pas au survol (la bulle s'y mesure). */
  anchor?: Position | null;
  /** Atténuer les cases qui ne sont pas des cibles. */
  focused: boolean;
  /** Chemin prévu sous la souris, dans l'ordre des pas. */
  path: readonly Position[];
  /** Menace d'un monstre adverse : où il pourra aller (`move`), et les autres cases qu'il pourra frapper (`strike`). */
  reach: ReadonlyMap<string, 'move' | 'strike'>;
  showArt: boolean;
  /** Vue du plateau (déjà ramenée à « inclinée » si le plateau n'a pas de vue isométrique). */
  mode: BoardView;
  /** Zoom (0,5 à 2). */
  zoom: number;
  /** Boucles d'animation du décor (arbres, eau, drapeaux, feu). */
  animated: boolean;
  /** Plateau retourné : la case (0, 0) est en bas à droite. */
  flipped: boolean;
  /** Stats affichées sur les jetons (menu d'options, Alt pour tout voir). */
  stats?: TokenStats;
  /**
   * Marges de glisse (handoff V11, lot 13 §1) : espaces vides à gauche et à droite de la scène, dans le cadre qui défile,
   * pour sortir chaque bord du plateau de sous un panneau flottant (fiche à gauche, grimoire à droite).
   */
  margins?: { readonly left: number; readonly right: number };
  onCellClick: (pos: Position) => void;
  /** Clic droit sur une case (le menu du navigateur est bloqué). */
  onCellContextMenu?: (pos: Position) => void;
  onCellHover: (pos: Position | null, rect?: DOMRect) => void;
}

/** Marge laissée autour de la scène de dessus ou inclinée, pour son ombre. */
const FIT_MARGIN = 12;

/** Au-delà de ce déplacement (px) bouton enfoncé, c'est un glisser du plateau, plus un clic (lot 13 §2). */
const DRAG_THRESHOLD = 6;

const NO_MARGINS = { left: 0, right: 0 } as const;

const FLIP_DIRECTION: Readonly<Record<Direction, Direction>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * Sens de la pointe de la goutte à l'écran (degrés, sens horaire depuis le haut), sur l'orientation affichée : vues de
 * dessus et inclinée, puis iso (plateau tourné de 45°) (handoff, lot 6).
 */
const FLAT_ANGLES: Readonly<Record<Direction, number>> = { up: 0, right: 90, down: 180, left: 270 };
const ISO_ANGLES: Readonly<Record<Direction, number>> = { up: 60, right: 120, down: 240, left: 300 };

/**
 * Contour d'une goutte dans un carré de 100 (rond de rayon 50 au centre), pointe vers `angle` : la pointe est à
 * 50 × √2 du centre, et ses deux côtés touchent le rond à 45° de part et d'autre. Dessinée déjà tournée : une rotation
 * CSS dans le support 3D des vues inclinée et iso est mal rendue.
 */
export function dropPath(angle: number): string {
  const at = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(50 + r * Math.sin(rad)).toFixed(2)} ${(50 - r * Math.cos(rad)).toFixed(2)}`;
  };
  return `M${at(angle, 50 * Math.SQRT2)} L${at(angle + 45, 50)} A50 50 0 1 1 ${at(angle - 45, 50)} Z`;
}

/** La rangée de stats passe au-dessus du rond quand la pointe va vers le bas de l'écran, pour ne pas la cacher. */
export const statsAbove = (angle: number) => Math.cos((angle * Math.PI) / 180) < -0.2;

/** Taille de la zone du plateau, suivie au redimensionnement (fenêtre, largeur du grimoire). */
function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  // Avant la première mesure (et dans le rendu des tests), une zone ordinaire d'écran de bureau.
  const [size, setSize] = useState({ width: 900, height: 640 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((current) =>
        current.width === el.offsetWidth && current.height === el.offsetHeight
          ? current
          : { width: el.offsetWidth, height: el.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * Cadre du plateau (lot 11) : il défile, sur chaque axe où la scène et ses marges de glisse le dépassent (zoom, vue
 * isométrique calée sur la largeur, lot 13), à la molette ou en la faisant glisser ; sinon la scène y est centrée entre
 * ses marges, sans défilement (le décor qui déborde de la scène n'ouvre pas de défilement). Un glisser n'est pas compté comme un clic sur une case. Au chargement et au
 * changement de vue, la vue est recentrée sur le plateau (`focusY` : hauteur de son centre dans la scène, de 0 à 1) ;
 * en changeant de zoom, le point de la scène au centre de la vue est conservé.
 */
function useZoomViewport(
  zoom: number,
  mode: BoardView,
  scroll: { readonly x: boolean; readonly y: boolean },
  ref: RefObject<HTMLDivElement | null>,
) {
  /** Point de la scène au centre de la vue, en fractions de sa largeur et de sa hauteur. */
  const center = useRef<{ x: number; y: number } | null>(null);
  /**
   * Le joueur a fait défiler le cadre (molette, glisser, barre de défilement) depuis le dernier recentrage : seulement
   * alors, le point au centre de la vue est retenu. Les défilements du plateau lui-même (mise en place, transition de vue)
   * ne déplacent pas le centrage.
   */
  const userMoved = useRef(false);
  const shownMode = useRef(mode);
  /** Hauteur du centre du plateau dans la scène (de 0 à 1), tenue à jour par le plateau à chaque rendu. */
  const focusY = useRef(0.5);
  const axes = useRef(scroll);
  axes.current = scroll;

  useLayoutEffect(() => {
    const el = ref.current;
    const scene = el?.querySelector<HTMLElement>('[data-scene]');
    if (!el || !scene) return;
    if (shownMode.current !== mode) {
      shownMode.current = mode;
      center.current = null;
      userMoved.current = false;
    }
    /** La scène dans le repère de défilement du cadre. */
    const box = () => {
      const v = el.getBoundingClientRect();
      const r = scene.getBoundingClientRect();
      return { left: r.left - v.left + el.scrollLeft, top: r.top - v.top + el.scrollTop, width: r.width || 1, height: r.height || 1 };
    };
    const apply = () => {
      const b = box();
      const fx = center.current?.x ?? 0.5;
      const fy = center.current?.y ?? focusY.current;
      el.scrollLeft = axes.current.x ? b.left + fx * b.width - el.clientWidth / 2 : 0;
      el.scrollTop = axes.current.y ? b.top + fy * b.height - el.clientHeight / 2 : 0;
    };
    apply();
    // Le passage d'une vue à l'autre est animé, et la scène prend sa taille après la première mesure de la zone : on
    // recentre à chaque changement de taille de la scène, et une fois la transition finie.
    const timer = window.setTimeout(apply, 650);
    const resized = new ResizeObserver(apply);
    resized.observe(scene);
    const remember = () => {
      if (!userMoved.current) return;
      const b = box();
      center.current = {
        x: (el.scrollLeft + el.clientWidth / 2 - b.left) / b.width,
        y: (el.scrollTop + el.clientHeight / 2 - b.top) / b.height,
      };
    };
    const touched = () => {
      userMoved.current = true;
    };
    el.addEventListener('scroll', remember);
    el.addEventListener('wheel', touched, { passive: true });
    el.addEventListener('pointerdown', touched);
    return () => {
      window.clearTimeout(timer);
      resized.disconnect();
      el.removeEventListener('scroll', remember);
      el.removeEventListener('wheel', touched);
      el.removeEventListener('pointerdown', touched);
    };
  }, [zoom, mode, scroll.x, scroll.y]);

  // Glisser le plateau (handoff V11, lot 13 §2) : clic gauche maintenu n'importe où dans le cadre (cases comprises, pas sur
  // un autre bouton), puis déplacement. Sous 6 px, c'est un clic ordinaire ; au-delà, le cadre suit la souris, le curseur
  // devient une main fermée et le clic qui suit le relâchement est annulé. Les mouvements sont suivis sur toute la
  // fenêtre, pour ne pas lâcher le plateau quand la souris sort du cadre ; tout est retiré au démontage.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
    let suppressClick = false;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !(axes.current.x || axes.current.y)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button:not([data-cell]), a, input, select, textarea, label')) return;
      drag = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        userMoved.current = true;
        el.classList.add('is-dragging');
      }
      event.preventDefault();
      if (axes.current.x) el.scrollLeft = drag.left - dx;
      if (axes.current.y) el.scrollTop = drag.top - dy;
    };
    const up = () => {
      if (!drag) return;
      el.classList.remove('is-dragging');
      suppressClick = drag.moved;
      drag = null;
      // Le clic arrive juste après le relâchement ; relâché hors du cadre, il ne vient pas : on oublie l'annulation.
      if (suppressClick) window.setTimeout(() => (suppressClick = false), 0);
    };
    const click = (event: globalThis.MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    return () => {
      el.classList.remove('is-dragging');
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
    };
  }, [ref]);

  return { focusY, scroll };
}

export function Board(props: BoardProps) {
  const { view, path, showArt, mode, zoom, animated, flipped, onCellHover, margins = NO_MARGINS } = props;
  const scenery = isoScenery(view.board);
  const iso = mode === 'iso' && scenery !== null;
  const tilted = mode === 'tilt';
  // Décor 2,5D (rochers, eau, mana zones modélisées, enclaves, bordure) : vues isométrique et inclinée, s'il existe.
  const decor = (iso || tilted) && scenery !== null;
  // Décor peint (15 × 15) : son sol, calculé une fois, remplace celui du décor procédural ; seul en vue de dessus. Celui
  // du monde, avec son décor extérieur, arrive ensuite (tâche de fond, puis cache de l'appareil).
  const paintedData = paintedDecor(view.board);
  const painted = paintedData !== null;
  const grounds = usePaintedGround(view.board);
  const art = showArt && !decor ? boardArt(view.board) : undefined;
  const viewportRef = useRef<HTMLDivElement>(null);
  const area = useElementSize(viewportRef);
  const { rows, cols } = view.board;
  // Vues de dessus et inclinée : la plus grande case pour laquelle la scène tient dans la zone (le zoom s'y ajoute).
  const tiltDecor = tilted && decor;
  const metrics = boardMetrics(fitCell(area.width - FIT_MARGIN, area.height - FIT_MARGIN, rows, cols, tilted, tiltDecor), rows, cols);
  // Décor extérieur peint : la scène inclinée l'englobe aussi (6 cases tout autour du 15 × 15).
  const worldBorder = tiltDecor && grounds.world && paintedData ? (paintedData.plan.bordure ?? 0) * paintedData.plan.pas : 0;
  const geometry = tiltGeometry(metrics, rows, tiltDecor, worldBorder);
  const plan = planSize(Math.max(rows, cols));
  // Avec le décor extérieur, la scène isométrique englobe tout le monde peint (on le parcourt en faisant glisser) ; le
  // plateau garde sa taille, calée sur la largeur de la zone.
  const framePlan = iso && grounds.world && paintedData ? worldPlan(paintedData, Math.max(rows, cols)) : plan;
  const camera = isoCamera(plan, area.width - FIT_MARGIN, area.height - FIT_MARGIN, zoom, framePlan);
  const sceneHeight = tilted ? geometry.sceneHeight : metrics.height;
  // Taille de la scène à l'écran (zoom compris) : le cadre ne défile que sur les axes où elle le dépasse, marges de glisse
  // comprises.
  const shownWidth = iso ? camera.width : (tilted ? geometry.sceneWidth : metrics.width) * zoom;
  const shownHeight = iso ? camera.height : sceneHeight * zoom;
  const zoomView = useZoomViewport(
    zoom,
    mode,
    { x: shownWidth + margins.left + margins.right > area.width + 1, y: shownHeight > area.height + 1 },
    viewportRef,
  );
  zoomView.focusY.current = iso ? camera.centerY / camera.height : tilted ? geometry.originY / geometry.sceneHeight : 0.5;
  const sceneStyle: CSSProperties = iso
    ? { width: camera.width, height: camera.height, perspective: 'none' }
    : {
        width: tilted ? geometry.sceneWidth : metrics.width,
        height: sceneHeight,
        perspectiveOrigin: tilted ? `${geometry.originX}px ${geometry.originY}px` : `${metrics.width / 2}px ${metrics.height / 2}px`,
        // En vue de dessus ou inclinée, le zoom agrandit toute la scène.
        ...(zoom !== 1 ? { zoom } : {}),
      };
  const half = plan / 2;
  const boardVars: Record<string, string | number> = {
    '--cols': view.board.cols,
    '--rows': view.board.rows,
    ...(iso
      ? {
          '--su': camera.standScale.toFixed(3),
          '--qz': camera.textScale.toFixed(3),
          left: camera.width / 2 - half,
          top: camera.centerY - half,
          transform: `scale(${camera.k.toFixed(4)}) rotateX(${ISO_TILT}deg) rotateZ(45deg)`,
          background: painted ? 'none' : isoFloor(scenery!, flipped, view.board.rows, view.board.cols),
        }
      : {
          '--cell': `${metrics.cell}px`,
          top: tilted ? geometry.boardTop : 0,
          left: tilted ? geometry.boardLeft : 0,
          ...(decor ? { background: painted ? 'none' : isoFloor(scenery!, flipped, rows, cols, metrics.pitch) } : {}),
          ...(!decor && paintedData ? { background: flatGroundBackground(paintedData, rows, grounds.board, metrics.pitch, metrics.pad) } : {}),
        }),
    ...(art ? { backgroundImage: `url(${art})` } : {}),
  };
  const boardStyle = boardVars as CSSProperties;
  const steps = new Map(path.map((pos, i) => [posKey(pos), i + 1]));
  // Zones des terrains « Passage » : l'icône de ce qu'ils infligent, au sol de chaque case touchée.
  const zoneMarks = getZoneMarks(view);
  // Plateau retourné : les cases sont simplement rendues dans l'ordre inverse de la grille.
  const positions = flipped ? allPositions(view.board).reverse() : allPositions(view.board);
  const displayRow = (pos: Position) => (flipped ? rows - 1 - pos.row : pos.row);
  // Couleur de chaque mana zone dans le décor : le joueur qui la tient, ou contestée (mode contestation).
  const controllers = new Map(
    view.zoneControl.map((status) => [`${status.pos.row},${status.pos.col}`, status.contested ? 'contested' : status.controller] as const),
  );
  // Mode contestation : les zones de 9 cases, dessinées au sol (§4.4 bis).
  const zoneTiles = getZoneTiles(view);
  const scrollable = zoomView.scroll.x || zoomView.scroll.y;

  return (
    <div
      ref={viewportRef}
      className={`board-viewport${scrollable ? ' is-scrollable' : ''}`}
      style={{ overflowX: zoomView.scroll.x ? 'auto' : 'hidden', overflowY: zoomView.scroll.y ? 'auto' : 'hidden' }}
      data-viewport
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="board-viewport__content">
        {margins.left > 0 && <div className="board-viewport__glide" style={{ width: margins.left }} aria-hidden="true" />}
        <div className={`scene scene--${iso ? 'iso' : mode === 'iso' ? 'tilt' : mode}`} style={sceneStyle} data-scene>
          <div
            className={['board', art && 'board--art', tilted && 'board--tilt', iso && 'board--iso', decor && 'board--decor']
              .filter(Boolean)
              .join(' ')}
            style={boardStyle}
            data-lift={iso ? camera.lift.toFixed(1) : undefined}
            onMouseLeave={() => onCellHover(null)}
          >
            {decor && scenery && (
              <IsoDecor
                board={view.board}
                scenery={scenery}
                flipped={flipped}
                controllers={controllers}
                animated={animated}
                camera={iso ? 'iso' : 'tilt'}
                pitch={iso ? undefined : metrics.pitch}
                painted={painted}
                ground={grounds.board}
                world={grounds.world}
              />
            )}
            {positions.map((pos) => (
              <BoardCell
                key={posKey(pos)}
                {...props}
                mode={iso ? 'iso' : tilted ? 'tilt' : 'top'}
                decor={decor}
                pos={pos}
                step={steps.get(posKey(pos))}
                marks={zoneMarks.get(posKey(pos))}
                tile={zoneTiles.get(posKey(pos))}
                isAnchor={props.anchor ? samePos(props.anchor, pos) : false}
                standScale={tilted ? geometry.standScale(displayRow(pos)) : 1}
              />
            ))}
            <span className="board__edge" aria-hidden="true" />
          </div>
        </div>
        {margins.right > 0 && <div className="board-viewport__glide" style={{ width: margins.right }} aria-hidden="true" />}
      </div>
    </div>
  );
}

function BoardCell({
  view,
  pos,
  step,
  marks,
  tile,
  standScale,
  highlights,
  attacks,
  selectedUnitId,
  focused,
  reach,
  mode,
  flipped,
  stats = DEFAULT_TOKEN_STATS,
  onCellClick,
  onCellContextMenu,
  onCellHover,
  decor,
  isAnchor,
}: BoardProps & {
  pos: Position;
  step: number | undefined;
  marks: readonly ZoneMark[] | undefined;
  tile: ZoneTile | undefined;
  standScale: number;
  decor: boolean;
  isAnchor: boolean;
}) {
  const cell = getCell(view.board, pos);
  const dataCell = `${pos.row},${pos.col}`;
  const contextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    onCellContextMenu?.(pos);
  };
  if (cell.kind === 'offBoard') {
    return <div className="cell cell--off" aria-hidden="true" data-cell={dataCell} onContextMenu={contextMenu} />;
  }
  const hover = (event: MouseEvent<HTMLElement>) => onCellHover(pos, event.currentTarget.getBoundingClientRect());
  const iso = mode === 'iso';
  // Avec le décor 2,5D, les falaises ne sont plus des barres : les enclaves sont modélisées.
  const cliffs = decor ? null : <Cliffs board={view.board} pos={pos} flipped={flipped} />;
  const parity = (pos.row + pos.col) % 2 ? ' cell--odd' : '';
  const area = tile && <ZoneArea tile={tile} flipped={flipped} />;

  if (cell.kind === 'blocked') {
    // Eau : une bande horizontale (rivière) ou verticale (étang de plusieurs cases).
    const water = waterKind(view.board, pos);
    const waterClass = water ? ` cell--water${water === 'pond' ? ' cell--pond' : ''}` : '';
    return (
      <div
        className={`cell cell--blocked${waterClass}${parity}${focused ? ' is-dim' : ''}`}
        onMouseEnter={hover}
        onContextMenu={contextMenu}
        aria-label={water === 'pond' ? 'Étang' : water ? 'Rivière' : 'Case bloquée'}
        data-cell={dataCell}
      >
        {area}
        {cliffs}
      </div>
    );
  }

  const key = posKey(pos);
  const units = getUnitsAt(view, pos);
  const monster = units.find((u): u is MonsterUnit => u.kind === 'monster');
  const terrain = units.find((u): u is TerrainUnit => u.kind === 'terrain');
  const zone = cell.manaZone;
  const zoneStatus = zone ? getViewZoneStatus(view, pos) : null;
  const controller = zoneStatus?.controller ?? null;
  const highlight = highlights.get(key);
  const attack = attacks.get(key);
  const trap = view.traps.find((t) => samePos(t.pos, pos));
  const isSelected = (unit: Unit | undefined) => unit !== undefined && unit.id === selectedUnitId;
  const dim = focused && !highlight && !step && !isSelected(monster) && !isSelected(terrain);
  // En vue inclinée ou isométrique, les unités sont debout : une cible posée sur un monstre s'affiche sur le jeton.
  const upright = mode !== 'top';
  const onToken = upright && monster !== undefined;
  const classes = [
    'cell',
    zone ? 'cell--mana' : cell.summonZoneOf !== null ? `cell--summon cell--summon-p${cell.summonZoneOf}` : `cell--plain${parity}`,
    controller && `cell--held-p${controller}`,
    zoneStatus?.contested && 'cell--contested',
    monster && 'cell--unit',
    (highlight || monster) && 'is-clickable',
    isAnchor && 'is-anchor',
  ];
  // Orientation affichée (plateau retourné compris) : la pointe de la goutte, et la flèche au bord de la case.
  const facing = monster ? (flipped ? FLIP_DIRECTION[monster.facing] : monster.facing) : null;
  const exhausted = monster ? isExhausted(view, monster.id) : false;
  // Respiration des jetons désynchronisée d'une case à l'autre.
  const bobDelay = `${-((pos.row * 7 + pos.col * 3) % 10) * 0.18}s`;

  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(' ')}
      onClick={() => onCellClick(pos)}
      onContextMenu={contextMenu}
      // Un clic ne donne pas le focus à la case (contour du clavier) : seul Tab le fait.
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={hover}
      aria-label={cellLabel(pos, zone ? MANA_ZONE_NAMES[zone] : null, units)}
      data-cell={dataCell}
    >
      {cell.summonZoneOf !== null && <span className="cell__summon">J{cell.summonZoneOf}</span>}
      {area}
      {zone && <span className="cell__glow" />}
      {marks && <ZoneMarks marks={marks} />}
      {dim && <span className="layer layer--dim" />}
      {step !== undefined ? (
        <span className="layer hl-path">
          <span>{step}</span>
        </span>
      ) : (
        highlight === 'move' && <span className="layer hl-move" />
      )}
      {highlight === 'effect' && <span className="layer hl-effect" />}
      {highlight === 'target' && !onToken && <span className="layer hl-target">{!monster && '+'}</span>}
      {/* Menace adverse au survol : par-dessus les surbrillances, même avec un de ses monstres sélectionné. */}
      {reach.get(key) === 'move' && <span className="layer layer--reach" />}
      {reach.get(key) === 'strike' && <span className="layer layer--threat" />}
      {trap && !monster && <TrapMarker trap={trap} />}
      {terrain && <TerrainPlaque terrain={terrain} alone={!monster} selected={isSelected(terrain)} upright={upright} />}
      {monster && facing && (
        <span className={`facing facing--${facing} facing--p${monster.owner}${exhausted ? ' is-done' : ''}`} aria-hidden="true">
          <span />
        </span>
      )}
      {upright && (monster || terrain) && (
        <span
          className={`token-shadow${terrain ? ' token-shadow--light' : ''}${monster ? '' : ' token-shadow--crest'}`}
        />
      )}
      {upright && terrain && (
        <TerrainCrest
          terrain={terrain}
          small={monster !== undefined}
          standScale={standScale}
          target={!monster && highlight === 'target'}
        />
      )}
      {monster && (
        <MonsterToken
          monster={monster}
          atk={getAtk(view, monster)}
          requiem={requiemCountdown(monster, view.turn, view.activePlayer)}
          active={monster.owner === view.activePlayer}
          selected={isSelected(monster)}
          exhausted={exhausted}
          hidden={view.hiddenFromOpponent.includes(monster.id)}
          onZone={zone !== null}
          angle={(iso ? ISO_ANGLES : FLAT_ANGLES)[facing!]}
          stats={stats}
          mobilityBonus={view.board.mobilityBonus}
          standScale={standScale}
          bobDelay={bobDelay}
          target={onToken ? (highlight === 'attack' || attack ? 'attack' : highlight === 'target' ? 'card' : null) : null}
          damage={onToken && attack ? attack : null}
        />
      )}
      {(highlight === 'attack' || attack) && !onToken && (
        <>
          <span className="layer hl-attack" />
          {attack && (
            <span className="dmg-pill">
              −{attack.damage}
              {attack.behind && ' dos'}
            </span>
          )}
        </>
      )}
      {zone && (
        <span className="zone-label">
          {controller && `J${controller} · `}
          {zoneStatus?.contested && 'Contestée · '}
          {MANA_ZONE_NAMES[zone]}
        </span>
      )}
      {cliffs}
    </button>
  );
}

/**
 * Au sol d'une case de la zone d'un terrain « Passage » : un cercle comme celui d'un piège, à l'icône de ce qu'il inflige
 * aux ennemis qui y entrent. Plusieurs marques se rangent comme les points d'un dé.
 */
/**
 * Case d'une zone de 9 cases (mode contestation) : un voile à la couleur de la zone, et le bord du carré sur ses côtés
 * extérieurs ; rayé aux deux couleurs quand elle est contestée.
 */
function ZoneArea({ tile, flipped }: { tile: ZoneTile; flipped: boolean }) {
  const edges = tile.edges.map((edge) => `is-${flipped ? FLIP_EDGE[edge] : edge}`).join(' ');
  return <span className={`cell__area cell__area--${tile.look} ${edges}`} aria-hidden="true" />;
}

function ZoneMarks({ marks }: { marks: readonly ZoneMark[] }) {
  const spots = diceLayout(marks.length);
  return (
    <span className="zone-marks">
      {marks.map((mark, i) => {
        const { x, y, size } = spots[i]!;
        return (
          <span
            key={`${mark.sourceId}-${i}`}
            className={`zone-mark zone-mark--p${mark.owner}${mark.burning ? ' zone-mark--burning' : ''}`}
            style={{ left: `${x}%`, top: `${y}%`, width: `${size}%`, height: `${size}%` }}
            title={mark.title}
          >
            <span className="zone-mark__face">
              <Icon name={mark.icon} />
              {mark.label && <span className="zone-mark__label">{mark.label}</span>}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Chaque falaise est dessinée une fois, par la case de gauche ou du dessus à l'écran. */
function Cliffs({ board, pos, flipped }: { board: BoardData; pos: Position; flipped: boolean }) {
  const d = flipped ? -1 : 1;
  const right = getCliff(board, pos, { row: pos.row, col: pos.col + d });
  const bottom = getCliff(board, pos, { row: pos.row + d, col: pos.col });
  return (
    <>
      {right && <span className={`cliff cliff--right${right.rangedShotsPass ? ' cliff--low' : ''}`} />}
      {bottom && <span className={`cliff cliff--bottom${bottom.rangedShotsPass ? ' cliff--low' : ''}`} />}
    </>
  );
}

function cellLabel(pos: Position, zoneName: string | null, units: Unit[]): string {
  const parts = [`Case (${pos.row}, ${pos.col})`, zoneName];
  for (const unit of units) parts.push(`${getCard(unit.cardId).name} de J${unit.owner}, ${unit.hp} PV`);
  return parts.filter(Boolean).join(' · ');
}

interface MonsterTokenProps {
  monster: MonsterUnit;
  /** ATK effective : ATK du monstre + bonus du tour + auras (Arnold). */
  atk: number;
  /** Compte à rebours de son requiem, ou `null`. */
  requiem: number | null;
  /** Monstre du joueur dont c'est le tour : sa mobilité restante est affichée. */
  active: boolean;
  selected: boolean;
  exhausted: boolean;
  /** Un de ses monstres `invisible` que l'adversaire ne voit pas en ce moment. */
  hidden: boolean;
  onZone: boolean;
  /** Sens de la pointe à l'écran, en degrés (orientation affichée, plateau retourné compris). */
  angle: number;
  /** Stats à afficher sous (ou sur) la goutte. */
  stats: TokenStats;
  /** Mobilité en plus sur ce plateau (13 × 13), comptée dans celle affichée pour l'adversaire. */
  mobilityBonus: number;
  /** Grossissement du jeton debout en vue inclinée. */
  standScale: number;
  bobDelay: string;
  /** Cible posée sur le jeton (vue inclinée). */
  target: 'attack' | 'card' | null;
  damage: AttackPreview | null;
}

/**
 * Jeton en goutte (handoff, lot 6) : un rond à l'illustration du monstre, dont la pointe, à la couleur du joueur, donne
 * le sens où il regarde ; dessous (ou dessus, si la pointe descend), les stats choisies par le joueur ; à gauche, ses
 * statuts. Trois niveaux : `.token` se déplace dans le plan du sol, `.token__stand` le redresse face à l'écran en vues
 * inclinée et iso (jamais animé), `.token__body` porte la respiration et les effets. `.token__frame` a la taille du
 * jeton : le support et le corps sont plus grands que lui, pour que rien de ce qui dépasse ne soit rogné en 3D.
 */
function MonsterToken(props: MonsterTokenProps) {
  const { monster, atk, requiem, active, selected, exhausted, hidden, onZone, angle, stats, mobilityBonus, standScale } = props;
  const { bobDelay, target, damage } = props;
  const card = getCard(monster.cardId);
  const art = CARD_ART[monster.cardId];
  const above = statsAbove(angle);
  const path = dropPath(angle);
  const showMobility = active ? stats.mobility : stats.enemyMobility;
  const mobility = active ? monster.mobilityLeft : getMonsterCard(monster.cardId).mobility + mobilityBonus;
  const classes = [
    'token',
    `token--p${monster.owner}`,
    onZone && 'token--on-zone',
    selected && 'is-selected',
    exhausted && 'is-exhausted',
    hidden && 'is-hidden',
  ];
  const statsClasses = ['token__stats', above && 'is-above', showMobility && stats.hp && stats.atk && 'is-arc'];
  return (
    <span className={classes.filter(Boolean).join(' ')} data-uid={monster.id}>
      <span className="token__stand" style={{ '--stand': standScale.toFixed(3) } as CSSProperties}>
        <span
          className="token__body"
          data-ubody={monster.id}
          style={{ animationDelay: bobDelay }}
          title={hidden ? 'Invisible pour l’adversaire' : undefined}
        >
          <span className="token__frame">
            <span className="token__drop">
              <svg className="token__shape" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                {target && <path className={`token__target token__target--${target} is-outer`} d={path} />}
                {target && <path className={`token__target token__target--${target}`} d={path} />}
                {selected && (
                  <>
                    {/* Halo flou de la sélection (lot 11) : un filtre propre au jeton, sous la goutte. */}
                    <defs>
                      <filter id={`halo-${monster.id}`} x="-80%" y="-80%" width="260%" height="260%">
                        <feGaussianBlur stdDeviation="9" />
                      </filter>
                    </defs>
                    <path className="token__glow" d={path} filter={`url(#halo-${monster.id})`} />
                    <path className="token__halo" d={path} />
                  </>
                )}
                <path className="token__rim" d={path} />
              </svg>
              <span className="token__art art">
                {art ? (
                  <span className="art-fit" style={{ background: fitBackground(art, tokenFit(art), 'cqw') }} />
                ) : (
                  <span className="token__label">{shortName(monster.cardId, card.name)}</span>
                )}
              </span>
              {stats.statuses && <Statuses statuses={monster.statuses} requiem={requiem} />}
              <span className={statsClasses.filter(Boolean).join(' ')}>
                {showMobility && (
                  <span
                    className={`stat stat--mob${active ? ' is-mine' : ''}${active && monster.mobilityLeft === 0 ? ' is-empty' : ''}`}
                    title={active ? 'Pas restants' : 'Mobilité'}
                  >
                    <Icon name="walking-boot" />
                    {mobility}
                  </span>
                )}
                {stats.hp && (
                  <span className={`stat stat--hp${monster.hp < monster.maxHp ? ' is-hurt' : ''}`} title="PV actuels">
                    <Icon name="hearts" />
                    {monster.hp}
                  </span>
                )}
                {stats.atk && (
                  <span
                    className={`stat stat--atk${active && monster.hasAttacked ? ' is-spent' : ''}${atk > monster.atk ? ' is-boosted' : ''}`}
                    title={atk > monster.atk ? `ATK ${atk} (${monster.atk} + ${atk - monster.atk})` : 'ATK'}
                  >
                    <Icon name="broadsword" />
                    {atk}
                  </span>
                )}
              </span>
              {damage && (
                <span className={`dmg-pill${above ? ' is-high' : ''}`}>
                  −{damage.damage}
                  {damage.behind && ' dos'}
                </span>
              )}
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}

function TerrainPlaque(props: { terrain: TerrainUnit; alone: boolean; selected: boolean; upright: boolean }) {
  const { terrain, alone, selected, upright } = props;
  // Debout (vues inclinée et isométrique), le terrain est un blason : la plaque au sol n'est plus qu'un socle.
  const classes = ['plaque', `plaque--p${terrain.owner}`, alone && !upright && 'is-alone', selected && 'is-selected'];
  return (
    <span className={classes.filter(Boolean).join(' ')} data-tid={upright ? undefined : terrain.id}>
      <span className="plaque__glow" />
      {alone && !upright && (
        <>
          <span className="plaque__name">{getCard(terrain.cardId).name}</span>
          <span className="plaque__hp">{terrain.hp} PV</span>
          <Statuses statuses={terrain.statuses} />
        </>
      )}
    </span>
  );
}

/**
 * Terrain debout (handoff, lot 5) : un blason, distinct du rond (J1) et de l'octogone (J2), au bord de la couleur du
 * propriétaire, garni de l'illustration de la carte (un château, à défaut d'illustration). Sous un monstre, il devient un
 * petit blason au-dessus de sa tête (iso) ou sur son coin haut-droit (inclinée), et redescend avec un rebond quand le
 * monstre part. Il ne flotte pas.
 */
function TerrainCrest(props: { terrain: TerrainUnit; small: boolean; standScale: number; target: boolean }) {
  const { terrain, small, standScale, target } = props;
  const card = getCard(terrain.cardId);
  const art = CARD_ART[terrain.cardId];
  return (
    <span className={`crest crest--p${terrain.owner}${small ? ' is-small' : ''}`}>
      <span className="crest__stand" style={{ '--stand': standScale.toFixed(3) } as CSSProperties}>
        <span className="crest__body" data-tid={terrain.id} title={card.name}>
          <span className="crest__rim" />
          {art ? (
            <span className="crest__face crest__face--art">
              <span className="art-fit" style={{ background: fitBackground(art, tokenFit(art), 'cqw') }} />
            </span>
          ) : (
            <span className="crest__face">
              <Icon name="castle" />
            </span>
          )}
          {target && <span className="crest__target" />}
          <span className={`badge badge--hp crest__hp${terrain.hp < terrain.maxHp ? ' is-hurt' : ''}`} title="PV actuels">
            <Icon name="hearts" />
            {terrain.hp}
          </span>
          <Statuses statuses={terrain.statuses} />
        </span>
      </span>
    </span>
  );
}

const STATUS_ORDER: readonly StatusKind[] = ['requiem', 'stun', 'immobilise', 'slow', 'burn', 'camouflage'];

/**
 * Statuts en pastilles : requiem N (tours avant sa mort), stun, immobilisé, slow X, burn X (les statuts du même type
 * se cumulent).
 */
function Statuses({ statuses, requiem = null }: { statuses: readonly Status[]; requiem?: number | null }) {
  if (statuses.length === 0) return null;
  return (
    <span className="statuses">
      {STATUS_ORDER.filter((kind) => statuses.some((s) => s.kind === kind)).map((kind) => {
        const amount =
          kind === 'requiem'
            ? (requiem ?? 1)
            : statuses.filter((s) => s.kind === kind).reduce((total, s) => total + statusAmount(s), 0);
        return (
          <span key={kind} className={`status status--${kind}`} title={statusTitle(kind, amount)}>
            <Icon name={STATUS_ICONS[kind]} />
            {(amount > 1 || kind === 'requiem') && kind !== 'camouflage' && amount}
          </span>
        );
      })}
    </span>
  );
}

function statusTitle(kind: StatusKind, amount: number): string {
  switch (kind) {
    case 'requiem':
      return amount > 1
        ? `Requiem : meurt au début du ${amount}e prochain tour de son camp`
        : 'Requiem : meurt au début du prochain tour de son camp';
    case 'stun':
      return 'Stun : aucune action';
    case 'immobilise':
      return 'Immobilisé : ne peut plus bouger';
    case 'slow':
      return `Slow ${amount} : −${amount} mobilité`;
    case 'burn':
      return `Burn ${amount} : −${amount} PV par tour`;
    case 'camouflage':
      return 'Invisible (Pénombre) : caché à l’adversaire tant qu’il ne s’approche pas';
  }
}

/** Un de ses propres pièges : l'adversaire ne le voit pas. */
function TrapMarker({ trap }: { trap: Trap }) {
  return (
    <span className="trap">
      <span>{trapLabel(trap)}</span>
    </span>
  );
}
