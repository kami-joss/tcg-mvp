// Cartes décrites en données, avec les mots du lexique (SPEC.md §5, §6, §6 bis).
import type { Ability, ActivatedAbility, Card, CardId, Deck, Archetype, KeywordSpec, MonsterCard, Targeting, TerrainCard } from './types';

function monster(
  id: CardId,
  name: string,
  stats: { cost: number; atk: number; hp: number; mobility: number; range: number },
  keywords: readonly KeywordSpec[] = [],
  activated: ActivatedAbility | readonly ActivatedAbility[] | null = null,
  evolvesFrom: CardId | null = null,
): MonsterCard {
  return {
    kind: 'monster',
    id,
    name,
    ...stats,
    keywords,
    activated: activated === null ? [] : Array.isArray(activated) ? activated : [activated as ActivatedAbility],
    evolvesFrom,
    archetype: null,
    onKill: null,
    turnStart: null,
    aura: null,
    passage: null,
  };
}

/** Monstre de la famille Bodybuilder (§6 bis) : déclencheurs passifs et effet actif éventuels. */
function bodybuilder(
  id: CardId,
  name: string,
  stats: { cost: number; atk: number; hp: number; mobility: number; range: number },
  passives: Partial<Pick<MonsterCard, 'onKill' | 'turnStart' | 'aura' | 'activated'>> = {},
): MonsterCard {
  return { ...monster(id, name, stats), archetype: 'bodybuilder', ...passives };
}

/** Le monstre `card`, dans la famille `archetype` (§5.1). */
const inArchetype = (archetype: Archetype, card: MonsterCard): MonsterCard => ({ ...card, archetype });

/** Archer du deck Archers (§6 bis) : monstre de la famille Archer. */
function archer(id: CardId, name: string, stats: { cost: number; atk: number; hp: number; mobility: number; range: number }, keyword: KeywordSpec): MonsterCard {
  return { ...monster(id, name, stats, [keyword]), archetype: 'archer' };
}

function spell(id: CardId, name: string, cost: number, ability: Ability): Card {
  return { kind: 'spell', id, name, cost, ability };
}

/** Dragon élémentaire : 7 mana, ou évolution d'un Jeune dragon élémentaire ; Vol ; effet actif de zone à 3 mana (§6 bis). */
function dragon(
  id: CardId,
  name: string,
  stats: { atk: number; hp: number; mobility: number },
  ability: Omit<ActivatedAbility, 'manaCost'>,
): MonsterCard {
  return { ...monster(id, name, { cost: 7, range: 1, ...stats }, [VOL], { manaCost: 3, ...ability }, 'jeune-dragon'), archetype: 'dragon' };
}

/** Terrain : se pose sur une mana zone occupée par un de ses monstres (§4.9). */
function terrain(
  id: CardId,
  name: string,
  stats: { cost: number; hp: number },
  passives: Partial<Pick<TerrainCard, 'zoneManaBonus' | 'passage' | 'summonPoint'>> = {},
): TerrainCard {
  return { kind: 'terrain', id, name, ...stats, zoneManaBonus: 0, passage: null, summonPoint: false, ...passives };
}

const VOL: KeywordSpec = { keyword: 'vol' };
/** Brûlure des sorciers du feu : à l'attaque, burn 1 pendant 2 tours (terrains compris, §10). */
const BRULURE_2: KeywordSpec = { keyword: 'brulure', amount: 1, turns: 2 };
const AN_ALLY: Targeting = { type: 'monster', side: 'ally', reach: { type: 'anywhere' } };
const AN_ENEMY: Targeting = { type: 'monster', side: 'enemy', reach: { type: 'anywhere' } };
const FRONT3: Targeting = { type: 'zone', zone: 'front3' };
const LINE3: Targeting = { type: 'zone', zone: 'line3' };
const EMPTY_ADJACENT_CELL: Targeting = { type: 'emptyAdjacentCell' };
const ADJACENT_ENEMY: Targeting = { type: 'monster', side: 'enemy', reach: { type: 'adjacent' } };
/** Retour (Explorateur du temps) : 1 mana, il se téléporte sur une case libre où il a été ce tour, puis ne bouge plus (§10). */
const RETURN: ActivatedAbility = { manaCost: 1, targeting: { type: 'trail' }, effects: [{ type: 'returnOnTrail' }] };

export const CARDS: Readonly<Record<CardId, Card>> = {
  // Monstres
  eclaireur: monster('eclaireur', 'Éclaireur', { cost: 1, atk: 1, hp: 1, mobility: 3, range: 1 }),
  milicien: monster('milicien', 'Milicien', { cost: 2, atk: 2, hp: 3, mobility: 2, range: 1 }),
  archer: monster('archer', 'Archer', { cost: 2, atk: 2, hp: 1, mobility: 2, range: 2 }),
  chaman: monster('chaman', 'Chaman', { cost: 2, atk: 1, hp: 3, mobility: 2, range: 1 }, [], {
    manaCost: 1,
    targeting: { type: 'monster', side: 'ally', reach: { type: 'adjacent' } },
    effects: [{ type: 'heal', amount: 2 }],
  }),
  gardien: monster('gardien', 'Gardien', { cost: 3, atk: 1, hp: 6, mobility: 1, range: 1 }, [{ keyword: 'riposte' }]),
  chevalier: monster('chevalier', 'Chevalier', { cost: 3, atk: 3, hp: 4, mobility: 3, range: 1 }),
  'chasseur-de-primes': monster(
    'chasseur-de-primes',
    'Chasseur de primes',
    { cost: 3, atk: 3, hp: 2, mobility: 3, range: 1 },
    [{ keyword: 'prime', amount: 1 }],
  ),
  'porte-etendard': monster(
    'porte-etendard',
    'Porte-étendard',
    { cost: 3, atk: 2, hp: 3, mobility: 2, range: 1 },
    [{ keyword: 'etendard', amount: 1 }],
  ),
  mage: monster('mage', 'Mage', { cost: 4, atk: 3, hp: 3, mobility: 2, range: 2 }, [], {
    manaCost: 2,
    targeting: { type: 'monster', side: 'enemy', reach: { type: 'line', range: 2 } },
    effects: [{ type: 'damage', amount: 2 }],
  }),
  golem: monster('golem', 'Golem', { cost: 4, atk: 4, hp: 7, mobility: 2, range: 1 }),
  dragonnet: monster('dragonnet', 'Dragonnet', { cost: 6, atk: 5, hp: 6, mobility: 4, range: 1 }, [VOL]),

  // Deck Archers
  'archer-leger': archer('archer-leger', 'Archer léger - Archers', { cost: 1, atk: 1, hp: 3, mobility: 5, range: 2 }, {
    keyword: 'trophee',
    amount: 1,
  }),
  'archer-lourd': archer('archer-lourd', 'Archer lourd - Archers', { cost: 3, atk: 3, hp: 3, mobility: 3, range: 2 }, {
    keyword: 'pillage',
    amount: 1,
  }),
  'archer-de-glace': archer('archer-de-glace', 'Archer de glace - Archers', { cost: 3, atk: 2, hp: 3, mobility: 3, range: 2 }, {
    keyword: 'givre',
    amount: 1,
    turns: 1,
  }),
  'archer-du-feu': archer('archer-du-feu', 'Archer du feu - Archers', { cost: 3, atk: 2, hp: 3, mobility: 3, range: 2 }, {
    keyword: 'brulure',
    amount: 1,
    turns: 1,
  }),
  // Pas de la famille Archer (§10).
  trebuchet: monster('trebuchet', 'Trébuchet', { cost: 5, atk: 4, hp: 1, mobility: 2, range: 5 }, [
    { keyword: 'siege', multiplier: 2 },
  ]),
  'fleche-divine': spell('fleche-divine', 'Flèche divine - Archers', 2, {
    targeting: { type: 'monster', side: 'ally', reach: { type: 'anywhere' }, archetype: 'archer' },
    effects: [
      { type: 'addAtkThisTurn', amount: 1 },
      { type: 'addRangeThisTurn', amount: 1 },
    ],
  }),

  // Deck Pièges : les 4 monstres sont de la famille Piège (« monstres piège », §10).
  'poseur-de-piege': inArchetype(
    'piege',
    monster('poseur-de-piege', 'Poseur de piège - Pièges', { cost: 1, atk: 1, hp: 1, mobility: 7, range: 1 }, [], {
      manaCost: 1,
      targeting: EMPTY_ADJACENT_CELL,
      effects: [{ type: 'placeTrap', effects: [{ type: 'status', kind: 'immobilise', turns: 0 }] }],
    }),
  ),
  farceur: inArchetype(
    'piege',
    monster('farceur', 'Farceur - Pièges', { cost: 2, atk: 2, hp: 1, mobility: 6, range: 1 }, [
      { keyword: 'camouflage', amount: 2 },
      { keyword: 'sournois', amount: 1 },
    ]),
  ),
  'poseur-de-bombe': inArchetype(
    'piege',
    monster('poseur-de-bombe', 'Poseur de bombe - Pièges', { cost: 1, atk: 2, hp: 1, mobility: 7, range: 1 }, [], {
      manaCost: 2,
      targeting: EMPTY_ADJACENT_CELL,
      effects: [{ type: 'placeTrap', effects: [{ type: 'damage', amount: 3 }] }],
    }),
  ),
  'clown-assassin': inArchetype(
    'piege',
    monster('clown-assassin', 'Clown assassin - Pièges', { cost: 4, atk: 2, hp: 2, mobility: 7, range: 1 }, [
      { keyword: 'assassin', multiplier: 3 },
    ]),
  ),
  penombre: spell('penombre', 'Pénombre - Pièges', 5, {
    targeting: { type: 'allies', archetype: 'piege' },
    effects: [{ type: 'status', kind: 'camouflage', amount: 2, turns: 1 }],
  }),

  // Deck Dragons : famille Dragon élémentaire, Jeune dragon compris (§10).
  'jeune-dragon': inArchetype(
    'dragon',
    monster('jeune-dragon', 'Jeune dragon élémentaire - Dragons', { cost: 2, atk: 3, hp: 2, mobility: 4, range: 1 }, [], {
      name: 'Évolution',
      manaCost: 2,
      targeting: { type: 'self' },
      effects: [{ type: 'evolve' }],
    }),
  ),
  'dragon-feu': dragon('dragon-feu', 'Dragon élémentaire de feu - Dragons', { atk: 5, hp: 5, mobility: 5 }, {
    name: 'Déflagration',
    targeting: FRONT3,
    effects: [
      { type: 'damage', amount: 2 },
      { type: 'status', kind: 'burn', amount: 1, turns: 1 },
    ],
  }),
  'dragon-eau': dragon('dragon-eau', 'Dragon élémentaire d’eau - Dragons', { atk: 4, hp: 7, mobility: 4 }, {
    name: 'Raz de marée',
    targeting: LINE3,
    effects: [{ type: 'status', kind: 'stun', turns: 1 }],
  }),
  'dragon-vent': dragon('dragon-vent', 'Dragon élémentaire de vent - Dragons', { atk: 4, hp: 4, mobility: 7 }, {
    name: 'Vent violent',
    targeting: LINE3,
    effects: [{ type: 'push', distance: 3, direction: 'forward', chooseDistance: true }],
  }),
  'dragon-terre': dragon('dragon-terre', 'Dragon élémentaire de terre - Dragons', { atk: 6, hp: 5, mobility: 4 }, {
    name: 'Tremblement de terre',
    targeting: { type: 'zone', zone: 'adjacent2' },
    effects: [{ type: 'damage', amount: 3 }],
  }),
  // Vol, mais pas d'évolution : elle s'invoque pour 10 mana (§10).
  'dragon-origine': {
    ...inArchetype('dragon', monster('dragon-origine', 'Origine - Dragons', { cost: 10, atk: 7, hp: 7, mobility: 7, range: 1 }, [VOL])),
    aura: { zone: 'adjacent', archetype: 'dragon', atk: 1, hp: 1, mobility: 1 },
  },

  // Deck Sorciers du feu : famille Sorcier du feu (§10). Brûlure 1, 2 tours : à l'attaque, burn 1 pendant 2 tours.
  apprenti: inArchetype(
    'sorcier',
    monster('apprenti', 'Apprenti - Sorciers du feu', { cost: 2, atk: 1, hp: 3, mobility: 4, range: 2 }, [BRULURE_2]),
  ),
  'lutin-brasier': inArchetype(
    'sorcier',
    monster('lutin-brasier', 'Lutin brasier - Sorciers du feu', { cost: 4, atk: 2, hp: 4, mobility: 4, range: 2 }, [BRULURE_2], {
      manaCost: 1,
      targeting: { type: 'emptyCell', zone: 'adjacent2' },
      effects: [
        {
          type: 'burnCell',
          turns: 2,
          effects: [
            { type: 'damage', amount: 1 },
            { type: 'status', kind: 'burn', amount: 1, turns: 1 },
          ],
        },
      ],
    }),
  ),
  archimage: inArchetype(
    'sorcier',
    monster('archimage', 'Archimage - Sorciers du feu', { cost: 6, atk: 3, hp: 5, mobility: 4, range: 2 }, [BRULURE_2], {
      manaCost: 1,
      targeting: { type: 'zone', zone: 'adjacent' },
      effects: [{ type: 'status', kind: 'burn', amount: 2, turns: 2 }],
    }),
  ),
  'golem-de-lave': {
    ...inArchetype('sorcier', monster('golem-de-lave', 'Golem de lave - Sorciers du feu', { cost: 5, atk: 2, hp: 8, mobility: 2, range: 1 })),
    passage: { zone: 'adjacent', effects: [{ type: 'status', kind: 'burn', amount: 1, turns: 1 }] },
  },

  // Deck Explorateur du temps : famille Explorateur du temps (§10). Retour : il revient sur une case où il a été ce tour.
  'apprenti-temps': inArchetype(
    'temps',
    monster('apprenti-temps', 'Apprenti - Explorateur du temps', { cost: 1, atk: 2, hp: 2, mobility: 4, range: 1 }, [], RETURN),
  ),
  chronomancienne: inArchetype(
    'temps',
    monster('chronomancienne', 'Chronomancienne - Explorateur du temps', { cost: 4, atk: 3, hp: 4, mobility: 4, range: 1 }, [], [
      RETURN,
      { manaCost: 2, targeting: EMPTY_ADJACENT_CELL, effects: [{ type: 'placeTrap', effects: [{ type: 'rewind', steps: 3 }] }] },
    ]),
  ),
  'dragonnet-temps': inArchetype(
    'temps',
    monster('dragonnet-temps', 'Dragonnet - Explorateur du temps', { cost: 3, atk: 3, hp: 3, mobility: 5, range: 1 }, [], [
      RETURN,
      { manaCost: 2, targeting: ADJACENT_ENEMY, effects: [{ type: 'status', kind: 'stun', turns: 1 }] },
    ]),
  ),
  'maitre-des-heures': {
    ...inArchetype(
      'temps',
      monster('maitre-des-heures', 'Maître des heures - Explorateur du temps', { cost: 7, atk: 5, hp: 6, mobility: 4, range: 1 }, [], [
        RETURN,
        { manaCost: 2, targeting: ADJACENT_ENEMY, effects: [{ type: 'status', kind: 'requiem', turns: 2 }] },
      ]),
    ),
    flavor: 'Un ancien explorateur, qui s’est perdu entre les époques. Physiquement jeune, mais très vieux dans les faits.',
  },
  'piege-temporel': spell('piege-temporel', 'Piège temporel - Explorateur du temps', 3, {
    targeting: { type: 'enemies' },
    effects: [{ type: 'status', kind: 'immobilise', turns: 1 }],
  }),
  'fissure-temporelle': terrain('fissure-temporelle', 'Fissure temporelle - Explorateur du temps', { cost: 3, hp: 4 }, {
    passage: { zone: 'adjacent', effects: [{ type: 'status', kind: 'immobilise', turns: 0 }] },
  }),

  // Cartes communes (§6 ter)
  invocateur: monster('invocateur', 'Invocateur', { cost: 4, atk: 1, hp: 3, mobility: 3, range: 2 }, [], {
    manaCost: 1,
    targeting: EMPTY_ADJACENT_CELL,
    effects: [{ type: 'summon' }],
  }),
  teleporteur: monster('teleporteur', 'Téléporteur', { cost: 4, atk: 1, hp: 3, mobility: 3, range: 2 }, [], {
    manaCost: 1,
    targeting: AN_ALLY,
    effects: [{ type: 'teleport' }],
  }),

  // Deck Bodybuilder
  'jeune-gomuscu': bodybuilder('jeune-gomuscu', 'Jeune Gomuscu - Bodybuilder', { cost: 2, atk: 2, hp: 2, mobility: 3, range: 1 }, {
    onKill: [{ type: 'addStats', atk: 1, hp: 1 }],
  }),
  'jean-bon': bodybuilder('jean-bon', 'Jean Bon - Bodybuilder', { cost: 3, atk: 5, hp: 3, mobility: 3, range: 1 }, {
    activated: [
      {
        name: 'Dopage',
        manaCost: 2,
        targeting: { type: 'self' },
        effects: [
          { type: 'addAtkThisTurn', amount: 2 },
          { type: 'status', kind: 'burn', amount: 1, turns: 2 },
        ],
      },
    ],
  }),
  arnold: bodybuilder('arnold', 'Arnold - Bodybuilder', { cost: 7, atk: 7, hp: 5, mobility: 3, range: 1 }, {
    aura: { zone: 'adjacent', archetype: 'bodybuilder', atk: 2, hp: 0, mobility: 0 },
  }),
  'ki-ne': bodybuilder('ki-ne', 'Ki né - Bodybuilder', { cost: 3, atk: 2, hp: 3, mobility: 4, range: 1 }, {
    turnStart: { zone: 'adjacent', archetype: 'bodybuilder', effects: [{ type: 'heal', amount: 1 }] },
  }),
  seringue: spell('seringue', 'Seringue - Bodybuilder', 2, {
    targeting: { type: 'monster', side: 'ally', reach: { type: 'anywhere' }, archetype: 'bodybuilder' },
    effects: [
      { type: 'multiplyAtkThisTurn', multiplier: 2 },
      { type: 'status', kind: 'requiem', turns: 2 },
    ],
  }),

  // Sorts
  'boule-de-feu': spell('boule-de-feu', 'Boule de feu', 2, {
    targeting: { type: 'monster', side: 'enemy', reach: { type: 'nearOwnMonster', steps: 3 } },
    effects: [{ type: 'damage', amount: 2 }],
  }),
  charge: spell('charge', 'Charge', 1, { targeting: AN_ALLY, effects: [{ type: 'addMobility', amount: 2 }] }),
  bourrasque: spell('bourrasque', 'Bourrasque', 2, {
    targeting: AN_ENEMY,
    effects: [{ type: 'push', distance: 2, direction: 'chosen', chooseDistance: false }],
  }),
  benediction: spell('benediction', 'Bénédiction', 1, { targeting: AN_ALLY, effects: [{ type: 'addStats', atk: 1, hp: 1 }] }),

  // Terrains
  'autel-de-mana': terrain('autel-de-mana', 'Autel de mana', { cost: 2, hp: 1 }, { zoneManaBonus: 1 }),
  bastion: terrain('bastion', 'Bastion', { cost: 2, hp: 10 }),
  'terrain-drainant': terrain('terrain-drainant', 'Terrain drainant', { cost: 1, hp: 4 }, {
    passage: { zone: 'adjacent', effects: [{ type: 'damage', amount: 1 }] },
  }),
  'terrain-piege': terrain('terrain-piege', 'Terrain piégé', { cost: 1, hp: 4 }, {
    passage: { zone: 'adjacent', effects: [{ type: 'status', kind: 'slow', amount: 1, turns: 0 }] },
  }),
  'zone-invocation': terrain('zone-invocation', 'Zone d’invocation', { cost: 1, hp: 4 }, { summonPoint: true }),
};

export function getCard(id: CardId): Card {
  return CARDS[id];
}

export function getMonsterCard(id: CardId): MonsterCard {
  const card = CARDS[id];
  if (card.kind !== 'monster') throw new Error(`« ${id} » n'est pas un monstre`);
  return card;
}

export function getTerrainCard(id: CardId): TerrainCard {
  const card = CARDS[id];
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

/** Cartes communes (SPEC.md §6 ter) : elles complètent les decks, chacun avec ses propres quantités. */
export const COMMON_CARDS: readonly CardId[] = ['invocateur', 'teleporteur', 'terrain-drainant', 'terrain-piege', 'zone-invocation'];

/** Les 5 cartes communes en 1 exemplaire. */
const COMMONS_ONCE: Composition = COMMON_CARDS.map((id) => [id, 1] as const);

const expand = (composition: Composition): CardId[] =>
  composition.flatMap(([id, quantity]) => Array.from({ length: quantity }, () => id));

/** Grimoire de test à plat, cartes communes comprises : une entrée par exemplaire (25 cartes). */
export const TEST_GRIMOIRE: readonly CardId[] = expand([...TEST_GRIMOIRE_QUANTITIES, ...COMMONS_ONCE]);

/**
 * Decks pré-construits (SPEC.md §6 bis), choisis avant la partie : 25 cartes chacun, avec les quantités du doc
 * « Cartes du TCG » (tableau « Composition » de chaque deck) : ses cartes, un complément de cartes de base, des cartes
 * communes.
 */
export const DECKS: readonly Deck[] = [
  { id: 'classique', name: 'Classique', cards: TEST_GRIMOIRE },
  {
    id: 'archers',
    name: 'Archers',
    // Démo des exemplaires brillants (handoff V11) : un Archer de glace (ses propres images) et un Archer du feu
    // (shiny générique).
    shiny: ['archer-de-glace', 'archer-du-feu'],
    cards: expand([
      ['archer-leger', 3],
      ['archer-lourd', 3],
      ['archer-de-glace', 3],
      ['archer-du-feu', 3],
      ['trebuchet', 2],
      ['fleche-divine', 1],
      ['boule-de-feu', 1],
      ['charge', 1],
      ['bourrasque', 1],
      ['benediction', 1],
      ['bastion', 1],
      ...COMMONS_ONCE,
    ]),
  },
  {
    id: 'pieges',
    name: 'Pièges',
    cards: expand([
      ['poseur-de-piege', 3],
      ['farceur', 3],
      ['poseur-de-bombe', 3],
      ['clown-assassin', 3],
      ['penombre', 2],
      ['boule-de-feu', 1],
      ['charge', 1],
      ['bourrasque', 1],
      ['benediction', 1],
      ['autel-de-mana', 1],
      ['invocateur', 1],
      ['terrain-drainant', 1],
      ['terrain-piege', 2],
      ['zone-invocation', 2],
    ]),
  },
  {
    id: 'bodybuilder',
    name: 'Bodybuilder',
    cards: expand([
      ['jeune-gomuscu', 3],
      ['jean-bon', 3],
      ['arnold', 3],
      ['ki-ne', 3],
      ['seringue', 2],
      ['boule-de-feu', 1],
      ['charge', 3],
      ['benediction', 1],
      ['bastion', 1],
      ...COMMONS_ONCE,
    ]),
  },
  {
    id: 'dragons',
    name: 'Dragons',
    cards: expand([
      ['jeune-dragon', 3],
      ['dragon-feu', 2],
      ['dragon-eau', 2],
      ['dragon-vent', 2],
      ['dragon-terre', 2],
      ['dragon-origine', 1],
      ['boule-de-feu', 2],
      ['charge', 3],
      ['benediction', 1],
      ['autel-de-mana', 2],
      ...COMMONS_ONCE,
    ]),
  },
  {
    // Composition proposée, à ajuster dans le doc.
    id: 'sorciers-du-feu',
    name: 'Sorciers du feu',
    // Démo des exemplaires brillants : un Apprenti (images « Flamme bleue » de son overframe).
    shiny: ['apprenti'],
    cards: expand([
      ['apprenti', 3],
      ['lutin-brasier', 3],
      ['archimage', 2],
      ['golem-de-lave', 3],
      ['gardien', 1],
      ['chevalier', 1],
      ['boule-de-feu', 2],
      ['charge', 2],
      ['benediction', 1],
      ['autel-de-mana', 1],
      ['bastion', 1],
      ...COMMONS_ONCE,
    ]),
  },
  {
    // Composition proposée, à ajuster dans le doc.
    id: 'explorateur-du-temps',
    name: 'Explorateur du temps',
    cards: expand([
      ['apprenti-temps', 3],
      ['chronomancienne', 3],
      ['dragonnet-temps', 3],
      ['maitre-des-heures', 2],
      ['piege-temporel', 2],
      ['fissure-temporelle', 2],
      ['boule-de-feu', 1],
      ['charge', 2],
      ['benediction', 1],
      ['autel-de-mana', 1],
      ...COMMONS_ONCE,
    ]),
  },
];
