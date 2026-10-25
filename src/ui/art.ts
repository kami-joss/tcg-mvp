// Illustrations des cartes et fonds de plateau. Une carte ou un plateau sans image garde un motif par défaut.
import type { Board, CardId } from '../engine';
import archerDeGlace from '../assets/art/archer-de-glace.jpg';
import archerDuFeu from '../assets/art/archer-du-feu.jpg';
import archerLeger from '../assets/art/archer-leger.jpg';
import archerLourd from '../assets/art/archer-lourd.jpg';
import arnold from '../assets/art/arnold.jpg';
import autelDeMana from '../assets/art/autel-de-mana.jpg';
import bastion from '../assets/art/bastion.jpg';
import benediction from '../assets/art/benediction.jpg';
import bouleDeFeu from '../assets/art/boule-de-feu.jpg';
import bourrasque from '../assets/art/bourrasque.jpg';
import charge from '../assets/art/charge.jpg';
import clownAssassin from '../assets/art/clown-assassin.jpg';
import dragonEau from '../assets/art/dragon-eau.jpg';
import dragonFeu from '../assets/art/dragon-feu.jpg';
import dragonTerre from '../assets/art/dragon-terre.jpg';
import dragonVent from '../assets/art/dragon-vent.jpg';
import farceur from '../assets/art/farceur.jpg';
import invocateur from '../assets/art/invocateur.jpg';
import jeanBon from '../assets/art/jean-bon.jpg';
import jeuneDragon from '../assets/art/jeune-dragon.jpg';
import jeuneGomuscu from '../assets/art/jeune-gomuscu.jpg';
import kiNe from '../assets/art/ki-ne.jpg';
import poseurDeBombe from '../assets/art/poseur-de-bombe.jpg';
import poseurDePiege from '../assets/art/poseur-de-piege.jpg';
import seringue from '../assets/art/seringue.jpg';
import flecheDivine from '../assets/art/fleche-divine.jpg';
import penombre from '../assets/art/penombre.jpg';
import dragonOrigine from '../assets/art/dragon-origine.jpg';
import apprenti from '../assets/art/apprenti.jpg';
import lutinBrasier from '../assets/art/lutin-brasier.jpg';
import archimage from '../assets/art/archimage.jpg';
import golemDeLave from '../assets/art/golem-de-lave.jpg';
import teleporteur from '../assets/art/teleporteur.jpg';
import terrainDrainant from '../assets/art/terrain-drainant.jpg';
import terrainPiege from '../assets/art/terrain-piege.jpg';
import trebuchet from '../assets/art/trebuchet.jpg';
import zoneInvocation from '../assets/art/zone-invocation.jpg';

export const CARD_ART: Partial<Record<CardId, string>> = {
  'archer-leger': archerLeger,
  'archer-lourd': archerLourd,
  'archer-de-glace': archerDeGlace,
  'archer-du-feu': archerDuFeu,
  trebuchet,
  'poseur-de-piege': poseurDePiege,
  farceur,
  'poseur-de-bombe': poseurDeBombe,
  'clown-assassin': clownAssassin,
  // Flèche divine et Pénombre : en paysage (Pénombre recadrée sur ses deux farceurs).
  'fleche-divine': flecheDivine,
  penombre,
  // Deck dragon : illustrations en paysage, recadrées au centre sur les jetons.
  'jeune-dragon': jeuneDragon,
  'dragon-feu': dragonFeu,
  'dragon-eau': dragonEau,
  'dragon-vent': dragonVent,
  'dragon-terre': dragonTerre,
  'dragon-origine': dragonOrigine,
  // Sorts et terrains : illustrations en paysage, recadrées par l'affichage (tuiles du grimoire, fiche, carte qui vole).
  'boule-de-feu': bouleDeFeu,
  charge,
  bourrasque,
  benediction,
  'autel-de-mana': autelDeMana,
  bastion,
  // Cartes communes : illustrations en paysage, recadrées au centre.
  invocateur,
  teleporteur,
  'terrain-drainant': terrainDrainant,
  'terrain-piege': terrainPiege,
  'zone-invocation': zoneInvocation,
  // Deck Bodybuilder : illustrations en paysage, recadrées au centre.
  'jeune-gomuscu': jeuneGomuscu,
  'jean-bon': jeanBon,
  arnold,
  'ki-ne': kiNe,
  seringue,
  // Deck Sorciers du feu : illustrations en paysage, recadrées au centre.
  apprenti,
  'lutin-brasier': lutinBrasier,
  archimage,
  'golem-de-lave': golemDeLave,
};

/** Fond illustré par plateau, indexé par son nom ; aucun pour l'instant. */
const BOARD_ART: Readonly<Record<string, string>> = {};

export const boardArt = (board: Board): string | undefined => BOARD_ART[board.name];

/** Noms raccourcis pour tenir sur un jeton sans illustration. */
const SHORT_NAMES: Partial<Record<CardId, string>> = {
  'archer-de-glace': 'Archer glace',
  'archer-du-feu': 'Archer feu',
  'chasseur-de-primes': 'Chasseur',
  'porte-etendard': 'Porte-étend.',
  'poseur-de-piege': 'Poseur piège',
  'poseur-de-bombe': 'Poseur bombe',
  'clown-assassin': 'Clown',
  'jeune-dragon': 'Jeune dragon',
  'dragon-feu': 'Dragon feu',
  'dragon-eau': 'Dragon eau',
  'dragon-vent': 'Dragon vent',
  'dragon-terre': 'Dragon terre',
  'dragon-origine': 'Origine',
};

export const shortName = (cardId: CardId, name: string): string => SHORT_NAMES[cardId] ?? name;
