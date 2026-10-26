// Plateau (SPEC.md §3, §7) : cases cliquables et calques superposés, du fond vers le dessus : atténuation, portée
// adverse, surbrillances, pièges, terrains, monstres, cible d'attaque, nom de zone, falaises.
// Trois vues (handoff, lots 3 et 5) : de dessus, inclinée à 45° (le sol bascule, les jetons restent debout face à
// l'écran), ou isométrique (Champ de bataille seulement : bloc de terrain, décor, mana zones modélisées, rivière).
// Le plateau peut être retourné pour que le camp du joueur actif soit en bas : seules les coordonnées d'affichage
// changent, les textes et les badges restent à l'endroit. Le plateau remplit sa zone de l'écran : la taille des cases
// (ou l'échelle de la vue isométrique) est choisie pour que toute la scène y tienne. Au-delà de 100 %, le zoom fait
// défiler la zone à la molette ou en la faisant glisser.
import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  MANA_ZONE_NAMES,
  allPositions,
  getAtk,
  getCard,
  getCell,
  getCliff,
  getMonsterCard,
  getUnitsAt,
  getViewZoneController,
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
import { DEFAULT_TOKEN_STATS } from './settings';
import type { BoardView, TokenStats } from './settings';
import { STATUS_ICONS, diceLayout, getZoneMarks } from './zoneMarks';
import type { ZoneMark } from './zoneMarks';

interface BoardProps {
  view: PlayerView;
  highlights: ReadonlyMap<string, Highlight>;
  attacks: ReadonlyMap<string, AttackPreview>;
  selectedUnitId: UnitId | null;
  /** Unité montrée par la fiche : son jeton grossit un peu (lot 9). */
  focusedUnitId?: UnitId | null;
  /** Atténuer les cases qui ne sont pas des cibles. */
  focused: boolean;
  /** Chemin prévu sous la souris, dans l'ordre des pas. */
  path: readonly Position[];
  /** Menace d'un monstre adverse : où il pourra aller (`move`), et les autres cases qu'il pourra frapper (`strike`). */
  reach: ReadonlyMap<string, 'move' | 'strike'>;
  showArt: boolean;
  /** Vue du plateau (déjà ramenée à « inclinée » si le plateau n'a pas de vue isométrique). */
  mode: BoardView;
  /** Zoom (1 à 2). */
  zoom: number;
  /** Boucles d'animation du décor (arbres, eau, drapeaux, feu). */
  animated: boolean;
  /** Plateau retourné : la case (0, 0) est en bas à droite. */
  flipped: boolean;
  /** Stats affichées sur les jetons (menu « Stats », Alt pour tout voir). */
  stats?: TokenStats;
  onCellClick: (pos: Position) => void;
  onCellHover: (pos: Position | null, rect?: DOMRect) => void;
}

/** Marge laissée autour de la scène de dessus ou inclinée, pour son ombre. */
const FIT_MARGIN = 12;

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

/** Taille de la zone du plateau, suivie au redimensionnement (fenêtre, largeur du grimoire, bandeau). */
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
 * Fenêtre de zoom : au-delà de 100 %, on déplace le plateau à la molette ou en le faisant glisser. Un glisser n'est pas
 * compté comme un clic sur une case. En changeant de niveau, le centre de la vue est conservé (centré depuis 100 %).
 */
function useZoomViewport(zoom: number, mode: BoardView) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const center = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || zoom <= 1) {
      center.current = null;
      return;
    }
    const apply = () => {
      const kept = center.current;
      if (kept) {
        el.scrollLeft = kept.x * el.scrollWidth - el.clientWidth / 2;
        el.scrollTop = kept.y * el.scrollHeight - el.clientHeight / 2;
      } else {
        el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
        el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.55;
      }
    };
    apply();
    // Le passage d'une vue à l'autre est animé : on recentre une fois la transition finie.
    const timer = window.setTimeout(apply, 650);
    const remember = () => {
      center.current = {
        x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
        y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
      };
    };
    el.addEventListener('scroll', remember);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener('scroll', remember);
    };
  }, [zoom, mode]);

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || zoom <= 1 || event.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
      drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      const d = drag.current;
      if (!el || !d) return;
      const dx = event.clientX - d.x;
      const dy = event.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      el.classList.add('is-dragging');
      el.scrollLeft = d.left - dx;
      el.scrollTop = d.top - dy;
    },
    onPointerUp: () => {
      ref.current?.classList.remove('is-dragging');
      suppressClick.current = drag.current?.moved ?? false;
      drag.current = null;
    },
    onPointerLeave: () => {
      ref.current?.classList.remove('is-dragging');
      drag.current = null;
    },
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
  };
  return { ref, handlers };
}

export function Board(props: BoardProps) {
  const { view, path, showArt, mode, zoom, animated, flipped, onCellHover } = props;
  const scenery = isoScenery(view.board);
  const iso = mode === 'iso' && scenery !== null;
  const tilted = mode === 'tilt';
  // Décor 2,5D (rochers, eau, mana zones modélisées, enclaves, bordure) : vues isométrique et inclinée, s'il existe.
  const decor = (iso || tilted) && scenery !== null;
  const art = showArt && !decor ? boardArt(view.board) : undefined;
  const zoomView = useZoomViewport(zoom, mode);
  const area = useElementSize(zoomView.ref);
  const { rows, cols } = view.board;
  // Vues de dessus et inclinée : la plus grande case pour laquelle la scène tient dans la zone (le zoom s'y ajoute).
  const tiltDecor = tilted && decor;
  const metrics = boardMetrics(fitCell(area.width - FIT_MARGIN, area.height - FIT_MARGIN, rows, cols, tilted, tiltDecor), rows, cols);
  const geometry = tiltGeometry(metrics, rows, tiltDecor);
  const plan = planSize(Math.max(rows, cols));
  const camera = isoCamera(plan, area.width, area.height, zoom);
  const sceneHeight = tilted ? geometry.sceneHeight : metrics.height;
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
          background: isoFloor(scenery!, flipped, view.board.rows, view.board.cols),
        }
      : {
          '--cell': `${metrics.cell}px`,
          top: tilted ? geometry.boardTop : 0,
          left: tilted ? geometry.boardLeft : 0,
          ...(decor ? { background: isoFloor(scenery!, flipped, rows, cols, metrics.pitch) } : {}),
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
  const controllers = new Map(
    allPositions(view.board)
      .filter((pos) => {
        const cell = getCell(view.board, pos);
        return cell.kind === 'plain' && cell.manaZone !== null;
      })
      .map((pos) => [`${pos.row},${pos.col}`, getViewZoneController(view, pos)] as const),
  );
  const zoomed = zoom > 1;

  return (
    <div
      ref={zoomView.ref}
      className={`board-viewport${zoomed ? ' is-zoomed' : ''}`}
      data-viewport
      {...zoomView.handlers}
    >
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
              standScale={tilted ? geometry.standScale(displayRow(pos)) : 1}
            />
          ))}
          <span className="board__edge" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function BoardCell({
  view,
  pos,
  step,
  marks,
  standScale,
  highlights,
  attacks,
  selectedUnitId,
  focusedUnitId = null,
  focused,
  reach,
  mode,
  flipped,
  stats = DEFAULT_TOKEN_STATS,
  onCellClick,
  onCellHover,
  decor,
}: BoardProps & { pos: Position; step: number | undefined; marks: readonly ZoneMark[] | undefined; standScale: number; decor: boolean }) {
  const cell = getCell(view.board, pos);
  const dataCell = `${pos.row},${pos.col}`;
  if (cell.kind === 'offBoard') return <div className="cell cell--off" aria-hidden="true" data-cell={dataCell} />;
  const hover = (event: MouseEvent<HTMLElement>) => onCellHover(pos, event.currentTarget.getBoundingClientRect());
  const iso = mode === 'iso';
  // Avec le décor 2,5D, les falaises ne sont plus des barres : les enclaves sont modélisées.
  const cliffs = decor ? null : <Cliffs board={view.board} pos={pos} flipped={flipped} />;
  const parity = (pos.row + pos.col) % 2 ? ' cell--odd' : '';

  if (cell.kind === 'blocked') {
    // Eau : une bande horizontale (rivière) ou verticale (étang de plusieurs cases).
    const water = waterKind(view.board, pos);
    const waterClass = water ? ` cell--water${water === 'pond' ? ' cell--pond' : ''}` : '';
    return (
      <div
        className={`cell cell--blocked${waterClass}${parity}${focused ? ' is-dim' : ''}`}
        onMouseEnter={hover}
        aria-label={water === 'pond' ? 'Étang' : water ? 'Rivière' : 'Case bloquée'}
        data-cell={dataCell}
      >
        {cliffs}
      </div>
    );
  }

  const key = posKey(pos);
  const units = getUnitsAt(view, pos);
  const monster = units.find((u): u is MonsterUnit => u.kind === 'monster');
  const terrain = units.find((u): u is TerrainUnit => u.kind === 'terrain');
  const zone = cell.manaZone;
  const controller = zone ? getViewZoneController(view, pos) : null;
  const highlight = highlights.get(key);
  const attack = attacks.get(key);
  const trap = view.traps.find((t) => samePos(t.pos, pos));
  const isSelected = (unit: Unit | undefined) => unit !== undefined && unit.id === selectedUnitId;
  const isFocus = (unit: Unit | undefined) => unit !== undefined && unit.id === focusedUnitId;
  const dim = focused && !highlight && !step && !isSelected(monster) && !isSelected(terrain);
  // En vue inclinée ou isométrique, les unités sont debout : une cible posée sur un monstre s'affiche sur le jeton.
  const upright = mode !== 'top';
  const onToken = upright && monster !== undefined;
  const classes = [
    'cell',
    zone ? 'cell--mana' : cell.summonZoneOf !== null ? `cell--summon cell--summon-p${cell.summonZoneOf}` : `cell--plain${parity}`,
    controller && `cell--held-p${controller}`,
    monster && 'cell--unit',
    (highlight || monster) && 'is-clickable',
  ];
  // Respiration des jetons désynchronisée d'une case à l'autre.
  const bobDelay = `${-((pos.row * 7 + pos.col * 3) % 10) * 0.18}s`;

  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(' ')}
      onClick={() => onCellClick(pos)}
      onMouseEnter={hover}
      aria-label={cellLabel(pos, zone ? MANA_ZONE_NAMES[zone] : null, units)}
      data-cell={dataCell}
    >
      {cell.summonZoneOf !== null && <span className="cell__summon">J{cell.summonZoneOf}</span>}
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
      {terrain && (
        <TerrainPlaque terrain={terrain} alone={!monster} selected={isSelected(terrain)} focus={isFocus(terrain)} upright={upright} />
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
          focus={isFocus(terrain)}
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
          focus={isFocus(monster)}
          exhausted={isExhausted(view, monster.id)}
          hidden={view.hiddenFromOpponent.includes(monster.id)}
          onZone={zone !== null}
          angle={(iso ? ISO_ANGLES : FLAT_ANGLES)[flipped ? FLIP_DIRECTION[monster.facing] : monster.facing]}
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
  /** Montré par la fiche. */
  focus: boolean;
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
  const { monster, atk, requiem, active, selected, focus, exhausted, hidden, onZone, angle, stats, mobilityBonus, standScale } = props;
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
    focus && 'is-focus',
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
                {selected && <path className="token__halo" d={path} />}
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

function TerrainPlaque(props: { terrain: TerrainUnit; alone: boolean; selected: boolean; focus: boolean; upright: boolean }) {
  const { terrain, alone, selected, focus, upright } = props;
  // Debout (vues inclinée et isométrique), le terrain est un blason : la plaque au sol n'est plus qu'un socle.
  const classes = ['plaque', `plaque--p${terrain.owner}`, selected && 'is-selected', focus && alone && !upright && 'is-focus'];
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
function TerrainCrest(props: { terrain: TerrainUnit; small: boolean; focus: boolean; standScale: number; target: boolean }) {
  const { terrain, small, focus, standScale, target } = props;
  const card = getCard(terrain.cardId);
  const art = CARD_ART[terrain.cardId];
  return (
    <span className={`crest crest--p${terrain.owner}${small ? ' is-small' : ''}${focus ? ' is-focus' : ''}`}>
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

const STATUS_ORDER: readonly StatusKind[] = ['requiem', 'stun', 'immobilise', 'slow', 'burn', 'invisible'];

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
            {(amount > 1 || kind === 'requiem') && kind !== 'invisible' && amount}
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
    case 'invisible':
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
