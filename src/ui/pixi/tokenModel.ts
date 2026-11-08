// Ce que le plateau PixiJS dessine pour chaque unité (migration, sous-étape 3c), d'après la vue : les mêmes règles que
// `MonsterToken`, `TerrainPlaque` et `TerrainCrest` en vue isométrique. Un monstre est une goutte debout, pointe vers
// son orientation, avec ses stats, ses statuts, une cible ou des dégâts annoncés ; au sol, son ombre et la flèche
// d'orientation au bord de sa case. Un terrain est un socle au sol et un blason debout (petit sous un monstre). Pur et
// testé ; le dessin est dans `tokenLayer.ts`.
import { canAttack, getAtk, getCard, getMonsterCard, getOnMoveBonus, getUnitsAt, requiemCountdown, statusAmount } from '../../engine';
import type { CardId, Direction, PlayerId, PlayerView, Position, Status, StatusKind, UnitId } from '../../engine';
import { shortName } from '../art';
import { isExhausted } from '../interaction';
import type { AttackPreview, Highlight } from '../interaction';
import { ISO } from '../iso/scenery';
import type { TokenStats } from '../settings';
import { isoDepth } from './isoProjection';

/** Sens de la pointe à l'écran en vue isométrique (degrés, sens horaire depuis le haut), comme `ISO_ANGLES` de `Board`. */
export const ISO_ANGLES: Readonly<Record<Direction, number>> = { up: 60, right: 120, down: 240, left: 300 };
const FLIP: Readonly<Record<Direction, Direction>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** La rangée de stats passe au-dessus du rond quand la pointe descend, pour ne pas la cacher (`statsAbove`). */
export const statsAbove = (angle: number): boolean => Math.cos((angle * Math.PI) / 180) < -0.2;

/** Pied d'un jeton dans sa case : avancé vers l'avant (le coin bas du losange), comme `translate(19px, 19px)` du CSS. */
export const TOKEN_FOOT = 34 + 19;
/** Avancée vers la caméra d'un jeton (`translateZ(10px)`) et d'un blason (`translateZ(12px)`). */
export const TOKEN_DZ = 10;
export const CREST_DZ = 12;

const STATUS_ORDER: readonly StatusKind[] = ['requiem', 'stun', 'silence', 'immobilise', 'slow', 'burn', 'camouflage', 'carapace'];

export interface StatPill {
  readonly kind: 'mob' | 'hp' | 'atk';
  readonly value: number;
  /** Mobilité restante d'un de ses monstres pendant son tour (turquoise ; grise à 0). */
  readonly mine?: boolean;
  readonly empty?: boolean;
  readonly hurt?: boolean;
  /** ATK : attaque déjà faite ce tour (barrée), bonus en cours (verte). */
  readonly spent?: boolean;
  readonly boosted?: boolean;
}

export interface StatusPill {
  readonly kind: StatusKind;
  /** Valeur affichée (cumul, ou tours avant la mort pour requiem) ; rien pour une seule unité de statut. */
  readonly text: string | null;
}

/** Statuts en pastilles, dans l'ordre du CSS : requiem N, stun, immobilisé, slow X, burn X, camouflage. */
export function statusPills(statuses: readonly Status[], requiem: number | null = null): StatusPill[] {
  return STATUS_ORDER.filter((kind) => statuses.some((s) => s.kind === kind)).map((kind) => {
    const amount = kind === 'requiem' ? (requiem ?? 1) : statuses.filter((s) => s.kind === kind).reduce((total, s) => total + statusAmount(s), 0);
    return { kind, text: (amount > 1 || kind === 'requiem') && kind !== 'camouflage' && kind !== 'carapace' ? String(amount) : null };
  });
}

export interface TokenVisual {
  readonly id: UnitId;
  readonly pos: Position;
  readonly owner: PlayerId;
  readonly cardId: CardId;
  /** Nom court, sans illustration. */
  readonly label: string;
  /** Pied du jeton dans le plan (px), et son ordre de dessin. */
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  /** Orientation affichée (plateau retourné compris) et sens de la pointe à l'écran. */
  readonly facing: Direction;
  readonly angle: number;
  readonly statsAbove: boolean;
  readonly stats: readonly StatPill[];
  /** Les trois stats ensemble forment un petit arc (PV décalé). */
  readonly arc: boolean;
  readonly statuses: readonly StatusPill[];
  readonly target: 'attack' | 'card' | null;
  readonly damage: string | null;
  readonly selected: boolean;
  /** Plus rien à faire ce tour (illustration ternie, flèche grise). */
  readonly exhausted: boolean;
  /** Camouflé, invisible pour l'adversaire (vu par son joueur) : translucide, contour en pointillés. */
  readonly hidden: boolean;
  /** Un terrain allié sur sa case : ombre plus claire. */
  readonly onTerrain: boolean;
  /** Décalage de la respiration (s), d'une case à l'autre. */
  readonly bobDelay: number;
}

export interface TerrainVisual {
  readonly id: UnitId;
  readonly pos: Position;
  readonly owner: PlayerId;
  readonly cardId: CardId;
  /** Coin haut-gauche de sa case dans le plan. */
  readonly x: number;
  readonly y: number;
  /** Blason : au centre de la case seul, à droite de la goutte sous un monstre (petit, sans PV). */
  readonly small: boolean;
  readonly depth: number;
  readonly hp: number;
  readonly hurt: boolean;
  readonly statuses: readonly StatusPill[];
  /** Cible d'une carte (terrain seul). */
  readonly target: boolean;
  readonly selected: boolean;
}

export interface TokenInputs {
  readonly view: PlayerView;
  readonly highlights: ReadonlyMap<string, Highlight>;
  readonly attacks: ReadonlyMap<string, AttackPreview>;
  readonly selectedUnitId: UnitId | null;
  readonly flipped: boolean;
  readonly stats: TokenStats;
}

/** Les unités que le joueur voit, à dessiner. */
export function unitVisuals(inputs: TokenInputs): { tokens: TokenVisual[]; terrains: TerrainVisual[] } {
  const { view, highlights, attacks, selectedUnitId, flipped, stats } = inputs;
  const { rows, cols } = view.board;
  const tokens: TokenVisual[] = [];
  const terrains: TerrainVisual[] = [];
  for (const unit of Object.values(view.units)) {
    const { pos } = unit;
    const key = `${pos.row},${pos.col}`;
    const [r, c] = flipped ? [rows - 1 - pos.row, cols - 1 - pos.col] : [pos.row, pos.col];
    const [x, y] = [ISO.pad + c * ISO.pitch, ISO.pad + r * ISO.pitch];
    const units = getUnitsAt(view, pos);
    const highlight = highlights.get(key);
    if (unit.kind === 'terrain') {
      const small = units.some((u) => u.kind === 'monster');
      const [fx, fy, dz] = small ? [x + TOKEN_FOOT, y + TOKEN_FOOT, CREST_DZ] : [x + 34, y + 34, CREST_DZ];
      terrains.push({
        id: unit.id,
        pos,
        owner: unit.owner,
        cardId: unit.cardId,
        x,
        y,
        small,
        depth: isoDepth(fx, fy, dz),
        hp: unit.hp,
        hurt: unit.hp < unit.maxHp,
        statuses: statusPills(unit.statuses),
        target: !small && highlight === 'target',
        selected: unit.id === selectedUnitId,
      });
      continue;
    }
    const card = getMonsterCard(unit.cardId);
    const active = unit.owner === view.activePlayer;
    const facing = flipped ? FLIP[unit.facing] : unit.facing;
    const angle = ISO_ANGLES[facing];
    const above = statsAbove(angle);
    const showMobility = active ? stats.mobility : stats.enemyMobility;
    const mobility = active ? unit.mobilityLeft + getOnMoveBonus(view, unit) : card.mobility;
    const atk = getAtk(view, unit);
    const pills: StatPill[] = [];
    if (showMobility) pills.push({ kind: 'mob', value: mobility, mine: active, empty: active && mobility === 0 });
    if (stats.hp) pills.push({ kind: 'hp', value: unit.hp, hurt: unit.hp < unit.maxHp });
    if (stats.atk) pills.push({ kind: 'atk', value: atk, spent: active && unit.hasAttacked && !canAttack(view, unit), boosted: atk > unit.atk });
    const attack = attacks.get(key);
    tokens.push({
      id: unit.id,
      pos,
      owner: unit.owner,
      cardId: unit.cardId,
      label: shortName(unit.cardId, getCard(unit.cardId).name),
      x: x + TOKEN_FOOT,
      y: y + TOKEN_FOOT,
      depth: isoDepth(x + TOKEN_FOOT, y + TOKEN_FOOT, TOKEN_DZ),
      facing,
      angle,
      statsAbove: above,
      stats: pills,
      arc: pills.length === 3,
      statuses: stats.statuses ? statusPills(unit.statuses, requiemCountdown(unit, view.turn, view.activePlayer)) : [],
      target: highlight === 'attack' || attack ? 'attack' : highlight === 'target' ? 'card' : null,
      damage: attack ? `−${attack.damage}${attack.behind ? ' dos' : ''}` : null,
      selected: unit.id === selectedUnitId,
      exhausted: isExhausted(view, unit.id),
      hidden: view.hiddenFromOpponent.includes(unit.id),
      onTerrain: units.some((u) => u.kind === 'terrain'),
      bobDelay: -((pos.row * 7 + pos.col * 3) % 10) * 0.18,
    });
  }
  return { tokens, terrains };
}
