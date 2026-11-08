// Page des decks (`/decks`) : la composition de chaque deck pré-construit (SPEC.md §6 bis), à consulter avant la partie.
// Logique pure : les sections du grimoire (monstres, sorts, terrains) avec le nombre d'exemplaires de chaque carte, et
// un résumé (cartes, coût moyen, courbe de mana).
import { getCard } from '../engine';
import type { Archetype, Card, CardId, Deck } from '../engine';
import { ARCHETYPE_NAMES, groupCards } from './cardText';

/** Une section du deck : ses cartes dans l'ordre du deck, chacune avec son nombre d'exemplaires. */
export interface DeckSection {
  readonly kind: Card['kind'];
  readonly title: string;
  readonly cards: readonly { readonly cardId: CardId; readonly count: number }[];
  readonly total: number;
}

const SECTIONS: readonly { readonly kind: Card['kind']; readonly title: string }[] = [
  { kind: 'monster', title: 'Monstres' },
  { kind: 'spell', title: 'Sorts' },
  { kind: 'terrain', title: 'Terrains' },
];

/** Les sections du deck, comme dans le grimoire en partie ; une section vide disparaît. */
export function deckSections(deck: Deck): DeckSection[] {
  const groups = groupCards(deck.cards);
  return SECTIONS.map(({ kind, title }) => {
    const cards = groups.filter(({ cardId }) => getCard(cardId).kind === kind);
    return { kind, title, cards, total: cards.reduce((sum, { count }) => sum + count, 0) };
  }).filter((section) => section.total > 0);
}

export interface DeckSummary {
  readonly total: number;
  /** Coût moyen d'un exemplaire, arrondi au dixième. */
  readonly averageCost: number;
  /** Nombre d'exemplaires par coût, de 0 au plus cher (la courbe de mana). */
  readonly curve: readonly number[];
  /** Archétype des monstres du deck (le plus fréquent), s'ils en ont un. */
  readonly archetype: string | null;
}

export function deckSummary(deck: Deck): DeckSummary {
  const cards = deck.cards.map(getCard);
  const curve = Array.from({ length: Math.max(0, ...cards.map((card) => card.cost)) + 1 }, () => 0);
  for (const card of cards) curve[card.cost]! += 1;
  const families = new Map<Archetype, number>();
  for (const card of cards) {
    if (card.kind === 'monster' && card.archetype) families.set(card.archetype, (families.get(card.archetype) ?? 0) + 1);
  }
  const top = [...families].sort((a, b) => b[1] - a[1])[0];
  return {
    total: cards.length,
    averageCost: Math.round((cards.reduce((sum, card) => sum + card.cost, 0) / Math.max(1, cards.length)) * 10) / 10,
    curve,
    archetype: top ? ARCHETYPE_NAMES[top[0]].title : null,
  };
}
