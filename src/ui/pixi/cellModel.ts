// Ce que le plateau PixiJS dessine sur chaque case (migration, sous-étape 3b), d'après la vue et la sélection : les mêmes
// règles que `BoardCell` en vue isométrique (jetons debout : une cible posée sur un monstre est dessinée sur son jeton,
// pas sur la case). Pur et testé ; les couleurs sont celles de game.css (variables `:root`, plateau peint).
import { MANA_ZONE_NAMES, allPositions, getCell, getUnitsAt, getViewZoneStatus, samePos } from '../../engine';
import type { PlayerView, Position, UnitId } from '../../engine';
import { trapLabel } from '../cardText';
import type { IconName } from '../Icon';
import type { AttackPreview, Highlight, ZoneView } from '../interaction';
import type { DangerEdges } from '../zones';
import { ISO, waterKind } from '../iso/scenery';
import { ZONE_ICONS } from '../sheet';
import { getZoneMarks } from '../zoneMarks';
import type { ZoneMark } from '../zoneMarks';

/** Couleurs de game.css (`:root`) dont le dessin des cases a besoin. */
export const CELL_COLORS = {
  j1: 'oklch(0.56 0.15 255)',
  j2: 'oklch(0.56 0.18 25)',
  zone: 'oklch(0.85 0.13 85)',
  contested: 'oklch(0.64 0.18 330)',
  zoneLabel: 'oklch(0.36 0.06 55)',
  paper: 'oklch(0.97 0.01 85)',
  ink: 'oklch(0.2 0.014 60)',
  moveLine: 'oklch(0.55 0.1 200)',
  path: 'oklch(0.36 0.09 208)',
  effect: 'oklch(0.55 0.17 300)',
  cardTarget: 'oklch(0.72 0.15 85)',
  danger: 'oklch(0.68 0.16 55)',
  threat: 'oklch(0.6 0.21 27)',
} as const;

/** Côté d'une case et pas entre deux cases dans le plan (px). */
export const CELL_SIZE = 68;

/** Fond d'une case du plateau peint ; `bare` : rien (quadrillage masqué, case sans repère). */
export type CellBase = 'plain' | 'odd' | 'mana' | 'summon1' | 'summon2' | 'blocked' | 'water' | 'bare';

export interface CellVisual {
  /** Case réelle (« ligne,colonne ») et son coin haut-gauche dans le plan affiché (plateau retourné compris). */
  readonly key: string;
  readonly pos: Position;
  readonly x: number;
  readonly y: number;
  readonly base: CellBase;
  /** Bord intérieur d'une case d'invocation (2 px, couleur du joueur). */
  readonly edge: { readonly color: string; readonly width: number } | null;
  /** Case d'invocation : « J1 » ou « J2 ». */
  readonly summon: 1 | 2 | null;
  /** Mana zone, portée par sa case centrale (refonte du 2026-11-11) : voir `ManaZoneVisual`. */
  readonly manaZone: ManaZoneVisual | null;
  /** Marques au sol des terrains « Passage » et des cases brûlées. */
  readonly marks: readonly ZoneMark[];
  readonly dim: boolean;
  /**
   * Zone du monstre sujet (handoff « zones ») : halo cyan (aller), orange (attaquer), rouge vif sur un monstre ennemi
   * visible qu'il peut attaquer (`target`).
   */
  readonly reach: 'move' | 'attack' | 'target' | null;
  /** Case de zone sur une mana zone : son voile est doré, liseré et halo gardent la couleur de la zone (validé). */
  readonly reachOnMana: boolean;
  /** Case survolée dans une zone : voile et anneau de sa couleur. */
  readonly hover: boolean;
  /** Case traversée par le chemin prévu (ni le départ, ni l'arrivée) : un petit point. */
  readonly step: boolean;
  /** Case d'aller : la mobilité que coûte d'y aller, écrite sur la case (en évidence sur le chemin et la case survolée). */
  readonly moveCost: number | null;
  /** Danger adverse : voile violet, et les côtés (affichés) où passe le contour. */
  readonly danger: DangerEdges | null;
  readonly effect: boolean;
  /** Cible d'une carte posée sur la case, pas sur un jeton : un « + » (case vide, ou terrain seul). */
  readonly target: boolean;
  /** Piège visible (le sien), sous un monstre absent. */
  readonly trap: string | null;
  /** Cible d'attaque posée sur la case (un terrain seul) : son cadre, et les dégâts annoncés. */
  readonly attack: { readonly damage: string | null } | null;
}

/**
 * Une mana zone (refonte du 2026-11-11) : au repos, une lueur dans son carré (3 × 3 en contestation, sa case sinon), la
 * case centrale éclairée et son icône au centre ; quand la souris passe sur la zone, un trait fin au bord, les quatre coins, un cercle fin
 * autour de la case centrale, et son nom, avec son icône et ce qu'elle rapporte ou qui la tient, au-dessus du décor.
 */
export interface ManaZoneVisual {
  readonly look: 'neutral' | 'p1' | 'p2' | 'contested';
  /** Couleur de la zone : neutre (or), du joueur qui la tient, ou contestée. */
  readonly color: string;
  /** Son carré dans le plan affiché (coin haut-gauche, côté). */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** La souris est sur une de ses cases : le trait fin et le nom s'affichent. */
  readonly hovered: boolean;
  /** La lueur respire (animations permises). */
  readonly pulse: boolean;
  readonly name: string;
  /** Son icône : au centre de la case centrale, et dans son nom. */
  readonly icon: IconName;
  /** À droite du nom : « +1 VP » (neutre), « J1 », « J2 », « Contestée ». */
  readonly holder: string;
}

/**
 * La mana zone dont `pos` fait partie : la case de la mana zone elle-même, ou en mode contestation une case de son
 * carré 3 × 3. `null` hors des zones.
 */
export function manaZoneAt(view: Pick<PlayerView, 'board' | 'mode'>, pos: Position): Position | null {
  const reach = view.mode === 'contestation' ? 1 : 0;
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const at = { row: pos.row + dr, col: pos.col + dc };
      if (at.row < 0 || at.col < 0 || at.row >= view.board.rows || at.col >= view.board.cols) continue;
      const cell = getCell(view.board, at);
      if (cell.kind === 'plain' && cell.manaZone) return at;
    }
  }
  return null;
}

export interface CellInputs {
  readonly view: PlayerView;
  readonly highlights: ReadonlyMap<string, Highlight>;
  readonly attacks: ReadonlyMap<string, AttackPreview>;
  readonly selectedUnitId: UnitId | null;
  readonly focused: boolean;
  readonly path: readonly Position[];
  readonly zones: ZoneView;
  readonly hovered: Position | null;
  readonly flipped: boolean;
  /** Animations permises : la lueur des mana zones pulse (sinon pas de lueur, comme en CSS). */
  readonly animated: boolean;
  /**
   * Quadrillage (réglage, vrai par défaut) : sans lui, ni traits ni damier, ni voile des cases bloquées ; mana zones et
   * cases d'invocation gardent leur fond et leur bord.
   */
  readonly grid?: boolean;
}

/** Couleur de celui qui tient une mana zone : le joueur, contestée, ou la couleur des zones neutres. */
function holderColor(controller: 1 | 2 | null, contested: boolean, neutral: string): string {
  if (contested) return CELL_COLORS.contested;
  return controller === 1 ? CELL_COLORS.j1 : controller === 2 ? CELL_COLORS.j2 : neutral;
}

/** Côtés du contour de danger tels qu'ils s'affichent : plateau retourné, haut et bas, gauche et droite s'échangent. */
function displayedEdges(edges: DangerEdges | undefined, flipped: boolean): DangerEdges | null {
  if (!edges) return null;
  return flipped ? { up: edges.down, down: edges.up, left: edges.right, right: edges.left } : edges;
}

/** Les cases du plateau à dessiner (les cases hors plateau n'ont rien). */
export function cellVisuals(inputs: CellInputs): CellVisual[] {
  const { view, highlights, attacks, selectedUnitId, focused, path, zones, hovered, flipped, animated, grid = true } = inputs;
  const { rows, cols } = view.board;
  // Chemin : les cases traversées, sans l'arrivée.
  const steps = new Set(path.slice(0, -1).map((pos) => `${pos.row},${pos.col}`));
  const hoveredKey = hovered ? `${hovered.row},${hovered.col}` : null;
  const marksByCell = getZoneMarks(view);
  const hoveredZone = hovered ? manaZoneAt(view, hovered) : null;
  // Côté du carré d'une zone de contestation, dans le plan : trois cases et les deux espaces entre elles.
  const span = view.mode === 'contestation' ? 1 : 0;
  const out: CellVisual[] = [];
  for (const pos of allPositions(view.board)) {
    const cell = getCell(view.board, pos);
    if (cell.kind === 'offBoard') continue;
    const key = `${pos.row},${pos.col}`;
    const [r, c] = flipped ? [rows - 1 - pos.row, cols - 1 - pos.col] : [pos.row, pos.col];
    const common = {
      key,
      pos,
      x: ISO.pad + c * ISO.pitch,
      y: ISO.pad + r * ISO.pitch,
      marks: marksByCell.get(key) ?? [],
    };
    if (cell.kind === 'blocked') {
      out.push({
        ...common,
        base: waterKind(view.board, pos) ? 'water' : grid ? 'blocked' : 'bare',
        edge: null,
        summon: null,
        manaZone: null,
        dim: false,
        reach: null,
        reachOnMana: false,
        hover: false,
        step: false,
        moveCost: null,
        danger: displayedEdges(zones.danger.get(key), flipped),
        effect: false,
        target: false,
        trap: null,
        attack: null,
      });
      continue;
    }
    const units = getUnitsAt(view, pos);
    const monster = units.find((u) => u.kind === 'monster');
    const terrain = units.find((u) => u.kind === 'terrain');
    const zone = cell.manaZone;
    const status = zone ? getViewZoneStatus(view, pos) : null;
    const controller = status?.controller ?? null;
    const contested = status?.contested ?? false;
    const highlight = highlights.get(key);
    const attack = attacks.get(key);
    const step = steps.has(key);
    const reach = zones.moves.has(key) ? 'move' : zones.targets.has(key) ? 'target' : zones.attacks.has(key) ? 'attack' : null;
    const selected = (id: UnitId | undefined) => id !== undefined && id === selectedUnitId;
    const trap = view.traps.find((t) => samePos(t.pos, pos));
    // Jetons debout : une cible ou une attaque sur un monstre se dessine sur son jeton.
    const onToken = monster !== undefined;
    out.push({
      ...common,
      base: zone ? 'mana' : cell.summonZoneOf === 1 ? 'summon1' : cell.summonZoneOf === 2 ? 'summon2' : !grid ? 'bare' : (pos.row + pos.col) % 2 ? 'odd' : 'plain',
      edge: cell.summonZoneOf !== null ? { color: cell.summonZoneOf === 1 ? CELL_COLORS.j1 : CELL_COLORS.j2, width: 2 } : null,
      summon: cell.summonZoneOf,
      manaZone: zone
        ? {
            look: contested ? 'contested' : controller === 1 ? 'p1' : controller === 2 ? 'p2' : 'neutral',
            color: holderColor(controller, contested, CELL_COLORS.zone),
            x: common.x - span * ISO.pitch,
            y: common.y - span * ISO.pitch,
            size: CELL_SIZE + 2 * span * ISO.pitch,
            hovered: hoveredZone !== null && samePos(hoveredZone, pos),
            pulse: animated,
            name: MANA_ZONE_NAMES[zone],
            icon: ZONE_ICONS[zone],
            holder: contested ? 'Contestée' : controller ? `J${controller}` : '+1 VP',
          }
        : null,
      dim: focused && !highlight && !reach && !step && !selected(monster?.id) && !selected(terrain?.id),
      reach,
      reachOnMana: reach !== null && zone !== null,
      hover: reach !== null && key === hoveredKey,
      step,
      moveCost: reach === 'move' ? (zones.moveCosts.get(key) ?? null) : null,
      danger: displayedEdges(zones.danger.get(key), flipped),
      effect: highlight === 'effect',
      target: highlight === 'target' && !onToken,
      trap: trap && !monster ? trapLabel(trap) : null,
      attack: (highlight === 'attack' || attack) && !onToken ? { damage: attack ? `−${attack.damage}${attack.behind ? ' dos' : ''}` : null } : null,
    });
  }
  return out;
}
