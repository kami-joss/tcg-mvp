// Page des règles (`/regles`) : les règles du jeu pour les joueurs, reprises de SPEC.md (§3, §4, §4.4 bis, §5 bis, §5.6,
// §10) en phrases naturelles, sans rien y ajouter. Les mots du lexique sont balisés comme sur les cartes
// (`{{terme|mot}}`, `rulesText.ts`) : en gras, définis au survol. Les nombres viennent de `config.ts`.
// Statuts et lexique sont lus dans `GLOSSARY` : une seule définition par mot, la même que sur les cartes.
import {
  BASE_MANA_FIRST_TURN,
  CLASSIC_DECK_SIZE,
  DECK_SIZE,
  DEFAULT_MANA_RULES,
  MANA_GROWTH_PER_TURN,
  MAX_COPIES_PER_DECK,
  TURN_TIMER_SECONDS,
  VICTORY_VP,
  VP_PER_CONTROLLED_ZONE,
  VP_PER_MONSTER_DESTROYED,
} from '../engine/config';
import type { Keyword } from '../engine';
import { GLOSSARY } from './rulesText';
import type { GlossaryTerm } from './rulesText';

/** Un mot du lexique dans un texte : « {{teleporter|téléporté}} ». */
const t = (term: GlossaryTerm, shown: string) => `{{${term}|${shown}}}`;

export interface RulesSection {
  readonly id: string;
  readonly title: string;
  /** Paragraphes d'introduction, puis une liste à puces (vide s'il n'y en a pas). */
  readonly intro: readonly string[];
  readonly points: readonly string[];
}

export const RULES_SECTIONS: readonly RulesSection[] = [
  {
    id: 'but',
    title: 'But du jeu',
    intro: [
      `Deux joueurs s’affrontent sur un plateau, chacun avec son deck. Le premier à ${VICTORY_VP} VP (points de victoire ; un autre nombre se choisit à l’accueil) gagne aussitôt.`,
    ],
    points: [
      `Tenir une mana zone rapporte ${VP_PER_CONTROLLED_ZONE} VP au début de chacun de ses tours.`,
      `Détruire un monstre ennemi rapporte ${VP_PER_MONSTER_DESTROYED} VP, par une attaque, un sort, un effet ou une riposte. Détruire un terrain ne rapporte rien.`,
      'Certains mots-clés rapportent des VP en plus (Prime, Trophée).',
    ],
  },
  {
    id: 'mise-en-place',
    title: 'Mise en place',
    intro: [],
    points: [
      'Chaque joueur choisit un deck pré-construit : son grimoire. Toutes ses cartes sont disponibles dès le début.',
      'Chaque joueur lance un dé à 6 faces ; en cas d’égalité, on relance. Le plus gros chiffre choisit qui commence. Contre l’IA, si elle gagne le lancer, elle commence.',
      'J1 est en haut du plateau, J2 en bas, quel que soit celui qui commence.',
      'On commence à 0 mana et 0 VP. Le second joueur n’a aucun bonus.',
    ],
  },
  {
    id: 'plateau',
    title: 'Le plateau',
    intro: ['Une grille de cases. On se déplace et on mesure les distances en ligne droite, sans diagonale (sauf pour l’attaque en diagonale).'],
    points: [
      'Cases d’invocation : chaque joueur pose ses monstres sur les siennes. On peut occuper celles de l’adversaire pour le bloquer.',
      'Mana zones (Écurie, Ferme, Forge, Scierie, Mine) : des cases normales, qui rapportent à celui qui les tient.',
      'Case X : on ne la traverse pas en marchant. Une case X ordinaire coupe les tirs et se survole avec Vol. Une case X basse se survole aussi, et les tirs de portée 2 ou plus passent par-dessus. Une case X haute ne se survole pas et coupe tous les tirs.',
      'L’eau, les ponts et le décor ne sont que du décor : une case d’eau suit la règle de sa case X.',
    ],
  },
  {
    id: 'tour',
    title: 'Déroulé d’un tour',
    intro: ['Au début de son tour, dans cet ordre :'],
    points: [
      'Les statuts, pièges et cases brûlées arrivés à échéance disparaissent.',
      'Revenus : le mana non dépensé est perdu, puis on reçoit son mana du tour et 1 VP par mana zone tenue.',
      'Les effets « Début de tour » des monstres agissent.',
      'Les statuts agissent : requiem (le monstre meurt, sans VP), puis burn.',
      'Ses monstres retrouvent toute leur mobilité, leur attaque et leurs effets actifs.',
      'Ensuite, dans l’ordre qu’on veut et autant de fois que possible : jouer une carte, déplacer un monstre, attaquer, utiliser l’effet actif d’un monstre. Le tour finit avec « Fin du tour ».',
      `Avec le minuteur (option de l’accueil) : ${TURN_TIMER_SECONDS / 60} minutes de réflexion par tour ; les actions et leurs animations ne comptent pas. À 0:00, le tour finit.`,
    ],
  },
  {
    id: 'mana',
    title: 'Le mana',
    intro: [
      'Le mana paie les cartes et les effets actifs. Deux économies, choisies à l’accueil : Classique, le mana non dépensé est perdu à la fin du tour ; Réserve, il se garde d’un tour à l’autre.',
    ],
    points: [
      `Mana de base : ${BASE_MANA_FIRST_TURN} à son premier tour, +${MANA_GROWTH_PER_TURN} à chacun de ses tours suivants, jusqu’à la génération max de la partie (${DEFAULT_MANA_RULES.baseCap} par défaut, réglable à l’accueil).`,
      'Une mana zone tenue où l’on a un terrain rapporte +1 mana (plus les bonus de ce terrain et du mot-clé Étendard), en plus du mana de base. Un monstre seul sur une zone ne rapporte pas de mana, seulement le VP.',
      `On n’a jamais plus de mana que la limite de la partie (${DEFAULT_MANA_RULES.limit} par défaut, réglable à l’accueil) : un gain qui la dépasse est perdu, au début du tour comme pendant.`,
    ],
  },
  {
    id: 'grimoire',
    title: 'Le grimoire et les cartes',
    intro: [
      `Un deck compte ${DECK_SIZE} cartes (le deck Classique, deck d’essai : ${CLASSIC_DECK_SIZE}), ${MAX_COPIES_PER_DECK} exemplaires au plus d’une même carte. Trois sortes de cartes : les monstres, les sorts (effet immédiat) et les terrains.`,
    ],
    points: [
      'Toute carte du grimoire se joue pendant son tour, si l’on a le mana. Pas de limite par tour : seul le mana compte.',
      'Une carte jouée quitte le grimoire. Le cimetière reçoit les sorts lancés, et les monstres et terrains qui quittent le plateau.',
      'Publics : le cimetière, les cartes jouées, le nombre de cartes restantes, le mana et les VP de chaque joueur. Caché : le contenu du grimoire adverse.',
      'En hotseat, un écran de passage cache tout entre deux tours.',
    ],
  },
  {
    id: 'mana-zones',
    title: 'Tenir une mana zone',
    intro: ['Mode Normal :'],
    points: [
      'Un de ses monstres sur la zone : on la tient.',
      'Sans monstre, un de ses terrains sur la zone : on la tient.',
      'Sinon, elle est neutre. On regarde qui la tient au début de chaque tour.',
    ],
  },
  {
    id: 'contestation',
    title: 'Mode contestation',
    intro: ['Choisi à l’accueil, sur les cartes 13 × 13 et 15 × 15. Il ne change que les mana zones.'],
    points: [
      'Chaque mana zone devient une zone de 9 cases : la mana zone et les 8 cases autour.',
      'Un terrain dans la zone la tient pour son propriétaire, quel que soit le nombre de monstres ennemis : il faut le détruire pour la reprendre.',
      'Sans terrain, on compte les monstres de chaque joueur dans les 9 cases (camouflés compris) : le plus nombreux tient la zone. À égalité, elle est contestée ; sans monstre, elle est neutre.',
      'Une zone contestée ne rapporte rien à personne, ni mana ni VP.',
      'Un terrain se pose seulement sur la case centrale, et seulement dans une zone qu’on tient.',
    ],
  },
  {
    id: 'invocation',
    title: 'Invoquer un monstre',
    intro: [],
    points: [
      `Payer son coût, puis le poser sur une case d’invocation libre de son camp. Il ${t('entrer', 'entre')} sur la case.`,
      'La case d’un de ses terrains « Point d’invocation » est aussi une case d’invocation, tant qu’aucun monstre ne s’y trouve.',
      'Le monstre peut agir tout de suite : se déplacer, attaquer, utiliser son effet.',
    ],
  },
  {
    id: 'deplacement',
    title: 'Se déplacer',
    intro: [],
    points: [
      'En ligne droite, sans diagonale : 1 mobilité par case.',
      'On traverse ses alliés, sauf un allié stun ou immobilisé ; jamais un ennemi (monstre ou terrain), ni une case X.',
      'On ne termine pas sur une case occupée.',
      'La mobilité se fractionne : bouger, attaquer, puis rebouger avec ce qui reste.',
      'Un monstre regarde dans le sens de son dernier pas (un recul ne le tourne pas). Tant qu’il n’a pas bougé, il regarde vers le camp adverse. La pointe de son jeton montre ce sens.',
    ],
  },
  {
    id: 'attaque',
    title: 'Attaquer',
    intro: ['Une attaque par monstre et par tour (l’aura de l’Écuyer des archers en donne 2).'],
    points: [
      'Cible : une unité ennemie, monstre ou terrain, en ligne droite, à une distance au plus égale à la portée.',
      'En diagonale : une case de diagonale compte pour 2 de portée. Portée 2 ou 3 : 1 case ; 4 ou 5 : 2 cases ; 6 : 3 cases. Ni riposte, ni avancée, ni bonus par derrière.',
      'Ligne de vue : les cases entre les deux doivent exister, ne pas être des cases X, et être vides ou n’avoir que des alliés de l’attaquant. Une unité ennemie arrête le tir.',
      'Sur une case avec un monstre et un terrain, l’attaque touche le monstre.',
      'Dégâts = ATK de l’attaquant, retirés aux PV de la cible. Les dégâts restent. À 0 PV ou moins, l’unité est détruite.',
      'Pas de riposte, sauf avec le mot-clé Riposte.',
      `Avancée : si l’attaquant était ${t('auContact', 'au contact')} et a détruit sa cible, il peut prendre sa place, sans dépenser de mobilité.`,
      `${t('parDerriere', 'Par derrière')} : l’attaquant frappe dans le sens où regarde sa cible (mots-clés Sournois, Attaque par surprise).`,
    ],
  },
  {
    id: 'effets',
    title: 'Effets actifs',
    intro: [],
    points: [
      'Un effet actif se paie en mana et s’utilise une fois par tour pour chaque monstre. Un monstre peut en avoir deux : chacun une fois par tour.',
      'Exception : un effet « sans limite par tour » s’utilise tant qu’on paie son coût.',
      'Un effet n’utilise pas l’attaque du monstre, sauf s’il le dit (« puis plus d’attaque ce tour »).',
    ],
  },
  {
    id: 'terrains',
    title: 'Terrains',
    intro: [],
    points: [
      'Un terrain se pose sur une mana zone où se trouve un de ses monstres. Monstre et terrain du même joueur partagent la case.',
      'Le monstre peut ensuite partir : le terrain reste et tient la zone.',
      'Un terrain n’a ni ATK ni mobilité. Les ennemis n’entrent pas sur sa case tant qu’il n’est pas détruit.',
    ],
  },
];

/** Mots-clés des monstres et terrains (SPEC.md §5.6) : nom, valeur notée N, règle. Un par mot-clé du moteur. */
export const KEYWORD_RULES: Readonly<Record<Keyword, { readonly name: string; readonly text: string }>> = {
  riposte: { name: 'Riposte', text: `Attaqué ${t('auContact', 'au contact')} et encore en vie, il inflige son ATK à l’attaquant. Une fois par tour.` },
  vol: { name: 'Vol', text: 'En se déplaçant, survole les cases X ordinaires et basses, mais pas les ennemis ; ne termine jamais sur une case X.' },
  prime: { name: 'Prime N', text: 'Quand il détruit un monstre : +N VP en plus.' },
  trophee: { name: 'Trophée N', text: `Quand il détruit un monstre ${t('auContact', 'au contact')} : +N VP en plus.` },
  pillage: { name: 'Pillage N', text: `Quand il détruit un monstre ${t('auContact', 'au contact')} : +N mana.` },
  etendard: { name: 'Étendard N', text: 'La mana zone qu’il occupe rapporte +N mana, si son camp y a un terrain.' },
  givre: { name: 'Givre N', text: `À l’attaque, inflige ${t('slow', 'slow')} N à sa cible pendant 1 tour (pas à un terrain).` },
  brulure: { name: 'Brûlure N', text: `À l’attaque, inflige ${t('burn', 'burn')} N à sa cible pendant 1 tour.` },
  siege: { name: 'Siège ×N', text: 'Dégâts ×N contre un terrain.' },
  sournois: { name: 'Sournois +N', text: `En attaquant un monstre ${t('parDerriere', 'par derrière')} : +N ATK pour cette attaque.` },
  assassin: { name: 'Attaque par surprise ×N', text: `En attaquant un monstre ${t('parDerriere', 'par derrière')} : dégâts ×N.` },
  camouflage: { name: 'Camouflage', text: `Caché à l’adversaire tant qu’aucun de ses monstres ni terrains n’est dans un ${t('carre', 'carré de 2')}.` },
  soif: { name: 'Soif N', text: 'En attaquant un monstre (pas un terrain), il récupère N PV, sans dépasser ses PV max.' },
};

/** Statuts (SPEC.md §5 bis), malus puis bonus : leur définition est celle du lexique des cartes. */
export const STATUS_TERMS: readonly { readonly title: string; readonly terms: readonly GlossaryTerm[] }[] = [
  { title: 'Malus', terms: ['malus', 'burn', 'slow', 'immobilise', 'absorbe', 'stun', 'silence', 'desarme', 'requiem'] },
  { title: 'Bonus', terms: ['camouflage', 'invisible', 'absorbation', 'recuperation', 'vol', 'carapace'] },
];

/** Les autres mots du lexique, groupés : zones et distances, mouvements, effets. */
export const LEXICON_TERMS: readonly { readonly title: string; readonly terms: readonly GlossaryTerm[] }[] = [
  { title: 'Zones et distances', terms: ['carre', 'adjacent', 'auContact', 'enLigne', 'pas', 'parDerriere'] },
  { title: 'Mouvements', terms: ['deplacement', 'entrer', 'teleporter', 'repousser', 'chemin', 'transformer'] },
  {
    title: 'Effets',
    terms: ['invoquer', 'caseInvocation', 'cimetiere', 'sacrifier', 'absorber', 'piege', 'caseBrulee', 'passage', 'zone', 'arme', 'contreCoup'],
  },
];

/** Une entrée du lexique : « Slow N : −N mobilité. » → nom et définition. */
export function glossaryEntry(term: GlossaryTerm): { name: string; text: string } {
  const definition = GLOSSARY[term];
  const split = definition.indexOf(' : ');
  return split < 0 ? { name: term, text: definition } : { name: definition.slice(0, split), text: definition.slice(split + 3) };
}
