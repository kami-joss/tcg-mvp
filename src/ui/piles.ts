// Cartes jouées et cimetière de chaque joueur (SPEC.md §4.3, §10) : publics, lus dans la vue du joueur qui regarde,
// pour lui comme pour son adversaire. Une tuile par exemplaire, sans regroupement, la plus récente en premier.
import type { CardCopy, PlayerId, PlayerView } from '../engine';
import type { IconName } from './Icon';

/** Les deux listes publiques d'un joueur : ses cartes jouées, son cimetière. */
export type PileKind = 'played' | 'graveyard';

/** La liste ouverte dans le panneau : un joueur, une de ses listes. */
export interface PileSelection {
  readonly player: PlayerId;
  readonly pile: PileKind;
}

/** Les listes, dans l'ordre des compteurs et des onglets. */
export const PILES: readonly PileKind[] = ['played', 'graveyard'];

/** Nom de chaque liste (onglets), son icône (compteurs, onglets) et ce que dit une liste vide. */
export const PILE_LABELS: Readonly<Record<PileKind, string>> = { played: 'Jouées', graveyard: 'Cimetière' };
export const PILE_ICONS: Readonly<Record<PileKind, IconName>> = { played: 'card-play', graveyard: 'tombstone' };
export const PILE_EMPTY: Readonly<Record<PileKind, string>> = {
  played: 'Aucune carte jouée.',
  graveyard: 'Le cimetière est vide.',
};

/** La liste `pile` de `player`, dans l'ordre du moteur : la plus ancienne d'abord. */
export function pileOf(view: PlayerView, player: PlayerId, pile: PileKind): readonly CardCopy[] {
  return (player === view.viewer ? view.me : view.opponent)[pile];
}

/**
 * Une tuile du panneau : l'exemplaire et son rang dans la liste du moteur. Ce rang ne change pas d'une action à
 * l'autre (les listes ne font que s'allonger) : il dit quelle tuile la fiche montre.
 */
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

/** Survol d'un compteur : « Cartes jouées par J2 : 5 », « Cimetière de J1 : 0 ». */
export function pileTitle(player: PlayerId, pile: PileKind, count: number): string {
  return pile === 'played' ? `Cartes jouées par J${player} : ${count}` : `Cimetière de J${player} : ${count}`;
}

/** Clic sur un compteur : ouvre sa liste, ou ferme le panneau si elle y est déjà. */
export function togglePile(current: PileSelection | null, next: PileSelection): PileSelection | null {
  return current?.player === next.player && current.pile === next.pile ? null : next;
}
