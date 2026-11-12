// Sur le plateau et cimetière de chaque joueur (SPEC.md §4.3, §10) : publics, lus dans la vue du joueur qui regarde,
// pour lui comme pour son adversaire. Sur le plateau : ses unités, invisibles et camouflées comprises (leur carte, jamais
// leur case). Une tuile par exemplaire, sans regroupement, la plus récente en premier.
import { unitOrder } from '../engine';
import type { CardCopy, PlayerId, PlayerView } from '../engine';
import type { IconName } from './Icon';

/** Les deux listes publiques d'un joueur : ses unités sur le plateau, son cimetière. */
export type PileKind = 'board' | 'graveyard';

/** La liste ouverte dans le panneau : un joueur, une de ses listes. */
export interface PileSelection {
  readonly player: PlayerId;
  readonly pile: PileKind;
}

/** Les listes, dans l'ordre des compteurs et des onglets. */
export const PILES: readonly PileKind[] = ['board', 'graveyard'];

/** Nom de chaque liste (onglets), son icône (compteurs, onglets) et ce que dit une liste vide. */
export const PILE_LABELS: Readonly<Record<PileKind, string>> = { board: 'Plateau', graveyard: 'Cimetière' };
export const PILE_ICONS: Readonly<Record<PileKind, IconName>> = { board: 'pion', graveyard: 'tombstone' };
export const PILE_EMPTY: Readonly<Record<PileKind, string>> = {
  board: 'Aucune unité sur le plateau.',
  graveyard: 'Le cimetière est vide.',
};

/**
 * La liste `pile` de `player`, la plus ancienne d'abord. Sur le plateau : ses unités que le joueur voit, dans l'ordre
 * d'arrivée, puis celles de l'adversaire qui lui sont cachées (leur carte seulement, `onBoardHidden`).
 */
export function pileOf(view: PlayerView, player: PlayerId, pile: PileKind): readonly CardCopy[] {
  const mine = player === view.viewer;
  if (pile === 'graveyard') return (mine ? view.me : view.opponent).graveyard;
  // Ses unités et ses balises (Balise de vision, publiques), dans l'ordre d'arrivée.
  const seen = [...Object.values(view.units), ...view.beacons]
    .filter((unit) => unit.owner === player)
    .sort((a, b) => unitOrder(a.id) - unitOrder(b.id))
    .map((unit): CardCopy => (unit.shiny ? { cardId: unit.cardId, shiny: true } : { cardId: unit.cardId }));
  return mine ? seen : [...seen, ...view.opponent.onBoardHidden];
}

/** Une tuile du panneau : l'exemplaire et son rang dans la liste, qui dit quelle tuile la fiche montre. */
export interface PileEntry {
  readonly copy: CardCopy;
  readonly index: number;
}

/** Les tuiles de la liste, la plus récente en premier (§10). */
export function pileEntries(view: PlayerView, player: PlayerId, pile: PileKind): PileEntry[] {
  return pileOf(view, player, pile)
    .map((copy, index) => ({ copy, index }))
    .reverse();
}

/** Survol d'un compteur : « Sur le plateau (J2) : 5 », « Cimetière de J1 : 0 ». */
export function pileTitle(player: PlayerId, pile: PileKind, count: number): string {
  return pile === 'board' ? `Sur le plateau (J${player}) : ${count}` : `Cimetière de J${player} : ${count}`;
}

/** Clic sur un compteur : ouvre sa liste, ou ferme le panneau si elle y est déjà. */
export function togglePile(current: PileSelection | null, next: PileSelection): PileSelection | null {
  return current?.player === next.player && current.pile === next.pile ? null : next;
}
