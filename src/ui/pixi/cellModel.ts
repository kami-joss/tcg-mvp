// Ce que le plateau PixiJS dessine sur chaque case (migration, sous-étape 3b), d'après la vue et la sélection : les mêmes
// règles que `BoardCell` en vue isométrique (jetons debout : une cible posée sur un monstre est dessinée sur son jeton,
// pas sur la case). Pur et testé ; les couleurs sont celles de game.css (variables `:root`, plateau peint).
import { MANA_ZONE_NAMES, allPositions, getCell, getUnitsAt, getViewZoneStatus, samePos } from '../../engine';
import type { PlayerView, Position, UnitId } from '../../engine';
import { trapLabel } from '../cardText';
import { FLIP_EDGE, getZoneTiles } from '../contestZones';
import type { ZoneEdge, ZoneLook } from '../contestZones';
import type { AttackPreview, Highlight } from '../interaction';
import { ISO, waterKind } from '../iso/scenery';
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
  /** Bord intérieur : mana zone (3 px, couleur de celui qui la tient) ou case d'invocation (2 px). */
  readonly edge: { readonly color: string; readonly width: number } | null;
  /** Lueur qui pulse d'une mana zone (animations permises), à la couleur de celui qui la tient. */
  readonly glow: string | null;
  /** Case d'invocation : « J1 » ou « J2 ». */
  readonly summon: 1 | 2 | null;
  /** Mode contestation : la case d'une zone de 9 cases, l'état de sa zone et ses côtés de bord (affichés). */
  readonly area: { readonly look: ZoneLook; readonly edges: readonly ZoneEdge[] } | null;
  /** Marques au sol des terrains « Passage » et des cases brûlées. */
  readonly marks: readonly ZoneMark[];
  readonly dim: boolean;
  readonly move: boolean;
  /** Numéro du pas sur le chemin prévu. */
  readonly step: number | null;
  readonly effect: boolean;
  /** Cible d'une carte posée sur la case, pas sur un jeton : un « + » (case vide, ou terrain seul). */
  readonly target: boolean;
  readonly reach: 'move' | 'strike' | null;
  /** Piège visible (le sien), sous un monstre absent. */
  readonly trap: string | null;
  /** Cible d'attaque posée sur la case (un terrain seul) : son cadre, et les dégâts annoncés. */
  readonly attack: { readonly damage: string | null } | null;
  /** Nom de la mana zone, à la couleur de celui qui la tient. */
  readonly zoneLabel: { readonly text: string; readonly color: string } | null;
}

export interface CellInputs {
  readonly view: PlayerView;
  readonly highlights: ReadonlyMap<string, Highlight>;
  readonly attacks: ReadonlyMap<string, AttackPreview>;
  readonly selectedUnitId: UnitId | null;
  readonly focused: boolean;
  readonly path: readonly Position[];
  readonly reach: ReadonlyMap<string, 'move' | 'strike'>;
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

/** Les cases du plateau à dessiner (les cases hors plateau n'ont rien). */
export function cellVisuals(inputs: CellInputs): CellVisual[] {
  const { view, highlights, attacks, selectedUnitId, focused, path, reach, flipped, animated, grid = true } = inputs;
  const { rows, cols } = view.board;
  const steps = new Map(path.map((pos, i) => [`${pos.row},${pos.col}`, i + 1]));
  const marksByCell = getZoneMarks(view);
  const tiles = getZoneTiles(view);
  const out: CellVisual[] = [];
  for (const pos of allPositions(view.board)) {
    const cell = getCell(view.board, pos);
    if (cell.kind === 'offBoard') continue;
    const key = `${pos.row},${pos.col}`;
    const [r, c] = flipped ? [rows - 1 - pos.row, cols - 1 - pos.col] : [pos.row, pos.col];
    const tile = tiles.get(key);
    const common = {
      key,
      pos,
      x: ISO.pad + c * ISO.pitch,
      y: ISO.pad + r * ISO.pitch,
      area: tile ? { look: tile.look, edges: tile.edges.map((edge) => (flipped ? FLIP_EDGE[edge] : edge)) } : null,
      marks: marksByCell.get(key) ?? [],
    };
    if (cell.kind === 'blocked') {
      out.push({
        ...common,
        base: waterKind(view.board, pos) ? 'water' : grid ? 'blocked' : 'bare',
        edge: null,
        glow: null,
        summon: null,
        dim: false,
        move: false,
        step: null,
        effect: false,
        target: false,
        reach: null,
        trap: null,
        attack: null,
        zoneLabel: null,
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
    const step = steps.get(key) ?? null;
    const selected = (id: UnitId | undefined) => id !== undefined && id === selectedUnitId;
    const trap = view.traps.find((t) => samePos(t.pos, pos));
    // Jetons debout : une cible ou une attaque sur un monstre se dessine sur son jeton.
    const onToken = monster !== undefined;
    out.push({
      ...common,
      base: zone ? 'mana' : cell.summonZoneOf === 1 ? 'summon1' : cell.summonZoneOf === 2 ? 'summon2' : !grid ? 'bare' : (pos.row + pos.col) % 2 ? 'odd' : 'plain',
      edge: zone
        ? { color: holderColor(controller, contested, CELL_COLORS.zone), width: 3 }
        : cell.summonZoneOf !== null
          ? { color: cell.summonZoneOf === 1 ? CELL_COLORS.j1 : CELL_COLORS.j2, width: 2 }
          : null,
      glow: zone && animated ? holderColor(controller, contested, CELL_COLORS.zone) : null,
      summon: cell.summonZoneOf,
      dim: focused && !highlight && step === null && !selected(monster?.id) && !selected(terrain?.id),
      move: step === null && highlight === 'move',
      step,
      effect: highlight === 'effect',
      target: highlight === 'target' && !onToken,
      reach: reach.get(key) ?? null,
      trap: trap && !monster ? trapLabel(trap) : null,
      attack: (highlight === 'attack' || attack) && !onToken ? { damage: attack ? `−${attack.damage}${attack.behind ? ' dos' : ''}` : null } : null,
      zoneLabel: zone
        ? {
            text: `${controller ? `J${controller} · ` : ''}${contested ? 'Contestée · ' : ''}${MANA_ZONE_NAMES[zone]}`,
            color: holderColor(controller, contested, CELL_COLORS.zoneLabel),
          }
        : null,
    });
  }
  return out;
}
