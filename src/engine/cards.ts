// Cartes du jeu (SPEC.md §5, §6, §6 bis) : leurs données sont dans `cards.data.ts`, que l'atelier de cartes écrit
// (« Enregistrer dans le projet ») ; ici, l'accès aux cartes et la composition des decks.
import { CARD_DATA } from './cards.data';
import type { Card, CardId, CardSet, Deck, MonsterCard, TerrainCard } from './types';

/** Les cartes d'origine du jeu (celles d'une partie par défaut). */
export const CARDS: CardSet = CARD_DATA;

/**
 * Une carte d'un jeu de cartes : celui de la partie (`state.cards`, `view.cards`), ou `CARDS` hors partie (pages de
 * consultation). Le moteur, l'IA et l'écran de jeu ne lisent jamais `CARDS` directement.
 */
export function getCard(cards: CardSet, id: CardId): Card {
  const card = cards[id];
  if (!card) throw new Error(`« ${id} » n'est pas dans les cartes de la partie`);
  return card;
}

export function getMonsterCard(cards: CardSet, id: CardId): MonsterCard {
  const card = getCard(cards, id);
  if (card.kind !== 'monster') throw new Error(`« ${id} » n'est pas un monstre`);
  return card;
}

export function getTerrainCard(cards: CardSet, id: CardId): TerrainCard {
  const card = getCard(cards, id);
  if (card.kind !== 'terrain') throw new Error(`« ${id} » n'est pas un terrain`);
  return card;
}

/** Composition d'un deck : carte et quantité (3 au plus, §6 bis). */
type Composition = readonly (readonly [CardId, number])[];

/** Cartes de base du grimoire de test (SPEC.md §6) : carte et quantité. */
const TEST_GRIMOIRE_QUANTITIES: Composition = [
  ['eclaireur', 2],
  ['milicien', 2],
  ['archer', 2],
  ['chaman', 1],
  ['gardien', 1],
  ['chevalier', 1],
  ['chasseur-de-primes', 1],
  ['porte-etendard', 1],
  ['mage', 1],
  ['golem', 1],
  ['dragonnet', 1],
  ['boule-de-feu', 1],
  ['charge', 1],
  ['bourrasque', 1],
  ['benediction', 1],
  ['autel-de-mana', 1],
  ['bastion', 1],
];

/**
 * Cartes communes (SPEC.md §6 ter) : génériques, elles complètent les decks, chacun avec ses propres quantités ; les
 * sorts génériques du 2026-11-10 (Puissance… Fortification) aussi. Soin n'est dans aucun deck pour l'instant.
 */
export const COMMON_CARDS: readonly CardId[] = [
  'invocateur',
  'teleporteur',
  'terrain-drainant',
  'terrain-piege',
  'zone-invocation',
  'puissance',
  'soin',
  'flash',
  'fatigue',
  'carapace',
  'elixir-de-mana',
  'cure',
  'repli',
  'teleportation',
  'reanimation',
  'fortification',
];

/** Les 5 premières cartes communes en 1 exemplaire : celles du deck Classique. */
const COMMONS_ONCE: Composition = [
  ['invocateur', 1],
  ['teleporteur', 1],
  ['terrain-drainant', 1],
  ['terrain-piege', 1],
  ['zone-invocation', 1],
];

const expand = (composition: Composition): CardId[] =>
  composition.flatMap(([id, quantity]) => Array.from({ length: quantity }, () => id));

/** Grimoire de test à plat, cartes communes comprises : une entrée par exemplaire (25 cartes). */
export const TEST_GRIMOIRE: readonly CardId[] = expand([...TEST_GRIMOIRE_QUANTITIES, ...COMMONS_ONCE]);

/**
 * Decks pré-construits (SPEC.md §6 bis), choisis avant la partie : 30 cartes chacun (le Classique, deck d'essai : 25),
 * avec les quantités du doc « Cartes du TCG » (tableau « Composition » de chaque deck) : ses cartes, des cartes de base,
 * des cartes communes. Bodybuilder n'est plus un deck (2026-11-10) : ses cartes gardent leurs données.
 */
export const DECKS: readonly Deck[] = [
  { id: 'classique', name: 'Classique', cards: TEST_GRIMOIRE },
  {
    id: 'archers',
    name: 'Archers impériaux',
    cards: expand([
      ['ecuyer-archers', 3],
      ['archer-imperial', 3],
      ['arbaletrier-imperial', 3],
      ['trebuchet-archers', 3],
      ['fleche-divine', 3],
      ['camps-de-tir', 3],
      ['bourrasque', 3],
      ['charge', 3],
      ['bastion', 1],
      ['zone-invocation', 1],
      ['terrain-piege', 1],
      ['teleporteur', 1],
      ['flash', 1],
      ['carapace', 1],
    ]),
  },
  {
    id: 'pieges',
    name: 'Maîtres des pièges',
    cards: expand([
      ['poseur-de-piege', 3],
      ['farceur', 3],
      ['poseur-de-bombe', 3],
      ['clown-assassin', 3],
      ['penombre', 3],
      ['terrain-de-jeu', 3],
      ['flash', 1],
      ['repli', 3],
      ['reanimation', 1],
      ['carapace', 3],
      ['zone-invocation', 1],
      ['terrain-piege', 2],
      ['fatigue', 1],
    ]),
  },
  {
    id: 'dragons',
    name: 'Dragons élémentaires',
    cards: expand([
      ['jeune-dragon', 3],
      ['dragon-feu', 3],
      ['dragon-eau', 3],
      ['dragon-vent', 3],
      ['dragon-terre', 3],
      ['hurlements', 3],
      ['nid-de-dragons', 3],
      ['autel-de-mana', 3],
      ['invocateur', 1],
      ['elixir-de-mana', 2],
      ['fortification', 3],
    ]),
  },
  {
    id: 'sorciers-du-feu',
    name: 'Sorciers du feu',
    // Démo des exemplaires brillants : une Feria (shiny générique : holo, reflet arc-en-ciel, étincelles).
    shiny: ['apprenti'],
    cards: expand([
      ['apprenti', 3],
      ['lutin-brasier', 3],
      ['archimage', 3],
      ['golem-de-lave', 3],
      ['brulure-en-chaine', 3],
      ['terrain-drainant', 3],
      ['fatigue', 3],
      ['zone-invocation', 3],
      ['teleportation', 3],
      ['flash', 1],
      ['puissance', 2],
    ]),
  },
  {
    id: 'explorateur-du-temps',
    name: 'Explorateur du temps',
    cards: expand([
      ['apprenti-temps', 3],
      ['chronomancienne', 3],
      ['dragonnet-temps', 3],
      ['maitre-du-temps', 3],
      ['piege-temporel', 3],
      ['fissure-temporelle', 3],
      ['fatigue', 3],
      ['puissance', 3],
      ['flash', 1],
      ['teleportation', 2],
      ['zone-invocation', 1],
      ['terrain-piege', 2],
    ]),
  },
  {
    id: 'vampire',
    name: 'Vampire',
    // Démo des exemplaires brillants : un Zoldik (images « Sang bleu » de son overframe).
    shiny: ['zoldik'],
    cards: expand([
      ['delta', 3],
      ['emma', 3],
      ['vladimir', 3],
      ['zoldik', 3],
      ['appel-du-sang', 3],
      ['sacrifice-sanguinaire', 3],
      ['terrain-de-chasse', 3],
      ['cure', 3],
      ['carapace', 3],
      ['flash', 1],
      ['puissance', 2],
    ]),
  },
];
