// Icônes des effets sur le plateau : statuts des unités, et marques au sol sur les cases de la zone d'une unité
// « Passage » (Terrain drainant, Terrain piégé, Golem de lave), avec ce qu'elle inflige aux ennemis qui y entrent
// (SPEC.md §6 ter) : un cercle comme celui d'un piège, à l'icône du statut ; plusieurs marques se rangent comme les
// points d'un dé. Les cases brûlées (Lutin brasier) ont aussi leur marque, pleine.
import { adjacentCells, getCard, getPassage } from '../engine';
import type { PlayerId, PlayerView, StatusKind, UnitId } from '../engine';
import { effectText } from './cardText';
import type { IconName } from './Icon';

export const STATUS_ICONS: Readonly<Record<StatusKind, IconName>> = {
  stun: 'knockout',
  slow: 'snail',
  immobilise: 'fishing-net',
  burn: 'flame',
  requiem: 'death-skull',
  invisible: 'eye-slash',
};

/** Marque au sol : un effet d'une unité « Passage » sur une case de sa zone, ou une case brûlée. */
export interface ZoneMark {
  /** L'unité « Passage », ou `brulee-<ligne>,<colonne>` pour une case brûlée. */
  readonly sourceId: UnitId;
  /** Propriétaire de l'unité ou de la case brûlée : l'effet touche ses ennemis. */
  readonly owner: PlayerId;
  /** Case brûlée : la marque est pleine, couleur de braise. */
  readonly burning?: boolean;
  readonly icon: IconName;
  /** Texte court à côté de l'icône : « −1 » pour des dégâts, la valeur d'un statut au-delà de 1 ; sinon rien. */
  readonly label: string | null;
  readonly title: string;
}

/**
 * Marques au sol par case (`ligne,colonne`), pour chaque unité « Passage » visible et chacun de ses effets, puis pour
 * chaque case brûlée.
 */
export function getZoneMarks(view: Pick<PlayerView, 'board' | 'units'> & Partial<Pick<PlayerView, 'burningCells'>>): Map<string, ZoneMark[]> {
  const marks = new Map<string, ZoneMark[]>();
  const add = (key: string, mark: ZoneMark) => marks.set(key, [...(marks.get(key) ?? []), mark]);
  for (const unit of Object.values(view.units)) {
    const passage = getPassage(unit);
    if (!passage) continue;
    const name = getCard(unit.cardId).name;
    const effects: Omit<ZoneMark, 'sourceId' | 'owner'>[] = passage.effects.map((effect) => {
      const title = `${name} de J${unit.owner} : ${effectText(effect)} à l’ennemi qui entre ici (une fois par mouvement).`;
      if (effect.type === 'damage') return { icon: 'hearts', label: `−${effect.amount}`, title };
      const amount = 'amount' in effect ? effect.amount : 0;
      return { icon: STATUS_ICONS[effect.kind], label: amount > 1 ? String(amount) : null, title };
    });
    for (const pos of adjacentCells(view.board, unit.pos)) {
      for (const effect of effects) add(`${pos.row},${pos.col}`, { ...effect, sourceId: unit.id, owner: unit.owner });
    }
  }
  for (const cell of view.burningCells ?? []) {
    const key = `${cell.pos.row},${cell.pos.col}`;
    const what = cell.effects.map(effectText).join(' + ');
    const damage = cell.effects.find((effect) => effect.type === 'damage');
    add(key, {
      sourceId: `brulee-${key}`,
      owner: cell.owner,
      burning: true,
      icon: 'flame',
      label: damage ? `−${damage.amount}` : null,
      title: `Case brûlée par ${getCard(cell.cardId).name} de J${cell.owner} : ${what} à chaque ennemi qui y entre.`,
    });
  }
  return marks;
}

/** Place d'une marque dans sa case : centre (`x`, `y`) et diamètre, en % de la case. */
export interface DiceSpot {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

const DICE: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[24, 24], [50, 50], [76, 76]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[24, 24], [76, 24], [50, 50], [24, 76], [76, 76]],
  6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
};
const DICE_SIZES: Readonly<Record<number, number>> = { 1: 68, 2: 46, 3: 38, 4: 42, 5: 36, 6: 30 };

/**
 * Plusieurs marques sur une case se partagent la place comme les points d'un dé : une au centre, deux en diagonale,
 * trois en diagonale, quatre aux coins, cinq avec le centre, six en deux colonnes (au-delà, on reprend la face du six).
 */
export function diceLayout(count: number): DiceSpot[] {
  const face = Math.min(6, Math.max(1, count));
  return Array.from({ length: count }, (_, i) => {
    const [x, y] = DICE[face]![i % face]!;
    return { x, y, size: DICE_SIZES[face]! };
  });
}
