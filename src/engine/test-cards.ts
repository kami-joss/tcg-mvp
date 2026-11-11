// Cartes d'essai des tests de règles (`gameWith`, et les tests qui le disent) : les cartes du jeu, effets compris, avec
// leurs chiffres figés tels qu'ils étaient le 2026-11-10 avant les réglages de l'atelier de ce jour-là (le dernier
// commit) : coût, ATK, PV, mobilité, portée, valeurs des mots-clés, coût des effets actifs. Un réglage de l'atelier
// change `CARDS` (`cards.data.ts`), pas ces cartes : un test de règle ne casse pas parce qu'une carte a été
// rééquilibrée. Les tests des vraies cartes (decks, tableaux de SPEC.md, textes, parties IA contre IA) lisent `CARDS`.
// Une carte absente de la table garde ses chiffres de `CARDS`.
import { CARDS } from './cards';
import type { Card, CardSet, KeywordSpec } from './types';

/** Les chiffres d'une carte, comme les champs de l'atelier : `cost`, `atk`, `hp`, `mobility`, `range`, « mot-clé.valeur », « activated.rang.manaCost ». */
type CardNumbers = Readonly<Record<string, number>>;

export const TEST_NUMBERS: Readonly<Record<string, CardNumbers>> = {
  eclaireur: { cost: 1, atk: 1, hp: 1, mobility: 3, range: 1 },
  milicien: { cost: 2, atk: 2, hp: 3, mobility: 2, range: 1 },
  archer: { cost: 2, atk: 2, hp: 1, mobility: 2, range: 2 },
  chaman: { cost: 2, atk: 1, hp: 3, mobility: 2, range: 1, 'activated.0.manaCost': 1 },
  gardien: { cost: 3, atk: 1, hp: 6, mobility: 1, range: 1 },
  chevalier: { cost: 3, atk: 3, hp: 4, mobility: 3, range: 1 },
  'chasseur-de-primes': { cost: 3, atk: 3, hp: 2, mobility: 3, range: 1, 'prime.amount': 1 },
  'porte-etendard': { cost: 3, atk: 2, hp: 3, mobility: 2, range: 1, 'etendard.amount': 1 },
  mage: { cost: 4, atk: 3, hp: 3, mobility: 2, range: 2, 'activated.0.manaCost': 2 },
  golem: { cost: 4, atk: 4, hp: 7, mobility: 2, range: 1 },
  dragonnet: { cost: 6, atk: 5, hp: 6, mobility: 4, range: 1 },
  'archer-leger': { cost: 1, atk: 1, hp: 3, mobility: 5, range: 2, 'trophee.amount': 1 },
  'archer-lourd': { cost: 3, atk: 3, hp: 3, mobility: 3, range: 2, 'pillage.amount': 1 },
  'archer-de-glace': { cost: 3, atk: 2, hp: 3, mobility: 3, range: 2, 'givre.amount': 1, 'givre.turns': 1 },
  'archer-du-feu': { cost: 3, atk: 2, hp: 3, mobility: 3, range: 2, 'brulure.amount': 1, 'brulure.turns': 1 },
  trebuchet: { cost: 5, atk: 4, hp: 1, mobility: 2, range: 5, 'siege.multiplier': 2 },
  'monstre-de-test': { cost: 10, atk: 3, hp: 7, mobility: 9, range: 1 },
  'ecuyer-archers': { cost: 1, atk: 0, hp: 3, mobility: 6, range: 0 },
  'archer-imperial': { cost: 2, atk: 2, hp: 2, mobility: 3, range: 4, 'activated.0.manaCost': 1 },
  'arbaletrier-imperial': { cost: 3, atk: 4, hp: 2, mobility: 3, range: 3, 'activated.0.manaCost': 1 },
  'trebuchet-archers': { cost: 4, atk: 5, hp: 2, mobility: 2, range: 6, 'siege.multiplier': 2 },
  'camps-de-tir': { cost: 2, hp: 5 },
  'fleche-divine': { cost: 2 },
  'poseur-de-piege': { cost: 2, atk: 1, hp: 1, mobility: 7, range: 1, 'activated.0.manaCost': 1 },
  farceur: { cost: 3, atk: 2, hp: 1, mobility: 7, range: 1, 'assassin.multiplier': 2 },
  'poseur-de-bombe': { cost: 2, atk: 1, hp: 1, mobility: 7, range: 1, 'activated.0.manaCost': 1 },
  'clown-assassin': { cost: 4, atk: 3, hp: 2, mobility: 7, range: 1, 'assassin.multiplier': 3 },
  penombre: { cost: 5 },
  'jeune-dragon': { cost: 2, atk: 3, hp: 2, mobility: 4, range: 1, 'activated.0.manaCost': 3 },
  'dragon-feu': { cost: 7, atk: 5, hp: 5, mobility: 5, range: 3, 'activated.0.manaCost': 3 },
  'dragon-eau': { cost: 7, atk: 4, hp: 9, mobility: 4, range: 1, 'activated.0.manaCost': 3 },
  'dragon-vent': { cost: 7, atk: 4, hp: 4, mobility: 9, range: 1, 'activated.0.manaCost': 3 },
  'dragon-terre': { cost: 7, atk: 9, hp: 4, mobility: 4, range: 1, 'activated.0.manaCost': 3 },
  'dragon-origine': { cost: 10, atk: 7, hp: 7, mobility: 7, range: 1 },
  hurlements: { cost: 1 },
  'nid-de-dragons': { cost: 3, hp: 5 },
  apprenti: { cost: 3, atk: 1, hp: 3, mobility: 5, range: 2, 'brulure.amount': 1, 'brulure.turns': 2 },
  'lutin-brasier': { cost: 2, atk: 1, hp: 3, mobility: 6, range: 1, 'activated.0.manaCost': 1 },
  archimage: { cost: 6, atk: 3, hp: 7, mobility: 5, range: 2, 'brulure.amount': 1, 'brulure.turns': 2, 'activated.0.manaCost': 1 },
  'golem-de-lave': { cost: 4, atk: 2, hp: 10, mobility: 2, range: 1 },
  'brulure-en-chaine': { cost: 2 },
  'apprenti-temps': { cost: 1, atk: 1, hp: 2, mobility: 5, range: 1, 'activated.0.manaCost': 1 },
  chronomancienne: { cost: 4, atk: 3, hp: 3, mobility: 7, range: 1, 'activated.0.manaCost': 1, 'activated.1.manaCost': 1 },
  'dragonnet-temps': { cost: 3, atk: 3, hp: 3, mobility: 6, range: 1, 'activated.0.manaCost': 1, 'activated.1.manaCost': 1 },
  'maitre-du-temps': { cost: 6, atk: 5, hp: 5, mobility: 7, range: 1, 'activated.0.manaCost': 1, 'activated.1.manaCost': 2 },
  'piege-temporel': { cost: 3 },
  'fissure-temporelle': { cost: 3, hp: 4 },
  delta: { cost: 3, atk: 3, hp: 3, mobility: 4, range: 1, 'soif.amount': 1 },
  emma: { cost: 1, atk: 2, hp: 3, mobility: 3, range: 1, 'soif.amount': 1, 'activated.0.manaCost': 1 },
  'emma-chauve-souris': { cost: 1, atk: 1, hp: 1, mobility: 8, range: 1, 'soif.amount': 1, 'activated.0.manaCost': 1 },
  vladimir: { cost: 4, atk: 3, hp: 5, mobility: 5, range: 1, 'soif.amount': 1, 'activated.0.manaCost': 1 },
  zoldik: { cost: 6, atk: 3, hp: 8, mobility: 5, range: 1, 'soif.amount': 1, 'activated.0.manaCost': 2 },
  'appel-du-sang': { cost: 3 },
  'sacrifice-sanguinaire': { cost: 2 },
  invocateur: { cost: 4, atk: 1, hp: 3, mobility: 3, range: 2, 'activated.0.manaCost': 1 },
  teleporteur: { cost: 4, atk: 1, hp: 3, mobility: 3, range: 2, 'activated.0.manaCost': 1 },
  'jeune-gomuscu': { cost: 2, atk: 2, hp: 2, mobility: 3, range: 1 },
  'jean-bon': { cost: 3, atk: 5, hp: 3, mobility: 3, range: 1, 'activated.0.manaCost': 2 },
  rudy: { cost: 4, atk: 3, hp: 3, mobility: 7, range: 1 },
  arnold: { cost: 8, atk: 8, hp: 4, mobility: 4, range: 1 },
  tibo: { cost: 4, atk: 3, hp: 8, mobility: 3, range: 1, 'activated.0.manaCost': 1 },
  'ki-ne': { cost: 2, atk: 3, hp: 3, mobility: 4, range: 1 },
  'salle-de-sport': { cost: 2, hp: 4 },
  'terrain-de-jeu': { cost: 3, hp: 5 },
  seringue: { cost: 2 },
  'boule-de-feu': { cost: 2 },
  charge: { cost: 1 },
  bourrasque: { cost: 2 },
  benediction: { cost: 1 },
  'autel-de-mana': { cost: 2, hp: 1 },
  bastion: { cost: 2, hp: 10 },
  'terrain-drainant': { cost: 1, hp: 4 },
  'terrain-piege': { cost: 1, hp: 4 },
  'zone-invocation': { cost: 1, hp: 4 },
  'terrain-de-chasse': { cost: 1, hp: 3 },
  // Sorts génériques du 2026-11-10, à leurs chiffres d'arrivée.
  puissance: { cost: 2 },
  soin: { cost: 2 },
  flash: { cost: 3 },
  fatigue: { cost: 2 },
  carapace: { cost: 2 },
  'elixir-de-mana': { cost: 0 },
  cure: { cost: 1 },
  repli: { cost: 1 },
  teleportation: { cost: 3 },
  reanimation: { cost: 5 },
  fortification: { cost: 3 },
};

/** La carte avec ses chiffres figés. */
function pinned(card: Card, numbers: CardNumbers | undefined): Card {
  if (!numbers) return card;
  const value = (key: string, current: number) => numbers[key] ?? current;
  if (card.kind === 'spell') return { ...card, cost: value('cost', card.cost) };
  if (card.kind === 'terrain') return { ...card, cost: value('cost', card.cost), hp: value('hp', card.hp) };
  return {
    ...card,
    cost: value('cost', card.cost),
    atk: value('atk', card.atk),
    hp: value('hp', card.hp),
    mobility: value('mobility', card.mobility),
    range: value('range', card.range),
    keywords: card.keywords.map((spec) => {
      const pins = Object.entries(spec).filter(([param, v]) => typeof v === 'number' && numbers[`${spec.keyword}.${param}`] !== undefined);
      return pins.length === 0 ? spec : ({ ...spec, ...Object.fromEntries(pins.map(([param]) => [param, numbers[`${spec.keyword}.${param}`]])) } as KeywordSpec);
    }),
    activated: card.activated.map((ability, rank) => ({ ...ability, manaCost: value(`activated.${rank}.manaCost`, ability.manaCost) })),
  };
}

export const TEST_CARDS: CardSet = Object.fromEntries(
  (Object.entries(CARDS) as [string, Card][]).map(([id, card]) => [id, pinned(card, TEST_NUMBERS[id])]),
) as CardSet;
