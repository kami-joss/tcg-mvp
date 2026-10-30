// Illustrations des cartes et fonds de plateau. Une carte ou un plateau sans image garde un motif par défaut.
// Handoff V8, lot 10 : les illustrations sont prises telles quelles, de n'importe quel format ; chaque affichage (jeton,
// fiche, tuile du grimoire, carte qui vole) les cadre seul sur les yeux du personnage (ou le point d'intérêt d'un sort
// ou d'un terrain), d'après la taille de l'image et la position des yeux notées ici.
import type { Board, CardId } from '../engine';
import apprentiShiny from '../assets/art/apprenti-shiny.jpg';
import apprentiTemps from '../assets/art/apprenti-temps.jpg';
import apprenti from '../assets/art/apprenti.jpg';
import archerDeGlaceShiny from '../assets/art/archer-de-glace-shiny.jpg';
import archerDeGlace from '../assets/art/archer-de-glace.jpg';
import archerDuFeu from '../assets/art/archer-du-feu.jpg';
import archerLeger from '../assets/art/archer-leger.jpg';
import archerLourd from '../assets/art/archer-lourd.jpg';
import archimage from '../assets/art/archimage.jpg';
import arnold from '../assets/art/arnold.jpg';
import autelDeMana from '../assets/art/autel-de-mana.jpg';
import bastion from '../assets/art/bastion.jpg';
import benediction from '../assets/art/benediction.jpg';
import bouleDeFeu from '../assets/art/boule-de-feu.jpg';
import bourrasque from '../assets/art/bourrasque.jpg';
import charge from '../assets/art/charge.jpg';
import chronomancienne from '../assets/art/chronomancienne.jpg';
import clownAssassin from '../assets/art/clown-assassin.jpg';
import dragonEau from '../assets/art/dragon-eau.jpg';
import dragonFeu from '../assets/art/dragon-feu.jpg';
import dragonOrigine from '../assets/art/dragon-origine.jpg';
import dragonTerre from '../assets/art/dragon-terre.jpg';
import dragonVent from '../assets/art/dragon-vent.jpg';
import dragonnetTemps from '../assets/art/dragonnet-temps.jpg';
import farceur from '../assets/art/farceur.jpg';
import fissureTemporelle from '../assets/art/fissure-temporelle.jpg';
import flecheDivine from '../assets/art/fleche-divine.jpg';
import golemDeLave from '../assets/art/golem-de-lave.jpg';
import invocateur from '../assets/art/invocateur.jpg';
import jeanBon from '../assets/art/jean-bon.jpg';
import jeuneDragon from '../assets/art/jeune-dragon.jpg';
import jeuneGomuscu from '../assets/art/jeune-gomuscu.jpg';
import kiNe from '../assets/art/ki-ne.jpg';
import lutinBrasier from '../assets/art/lutin-brasier.jpg';
import maitreDesHeures from '../assets/art/maitre-des-heures.jpg';
import penombre from '../assets/art/penombre.jpg';
import piegeTemporel from '../assets/art/piege-temporel.jpg';
import poseurDeBombe from '../assets/art/poseur-de-bombe.jpg';
import poseurDePiege from '../assets/art/poseur-de-piege.jpg';
import seringue from '../assets/art/seringue.jpg';
import teleporteur from '../assets/art/teleporteur.jpg';
import terrainDrainant from '../assets/art/terrain-drainant.jpg';
import terrainPiege from '../assets/art/terrain-piege.jpg';
import trebuchet from '../assets/art/trebuchet.jpg';
import zoneInvocation from '../assets/art/zone-invocation.jpg';

export interface CardArt {
  readonly src: string;
  /** Taille de l'image, en px. */
  readonly w: number;
  readonly h: number;
  /** Position des yeux (ou du point d'intérêt), en % de la largeur et de la hauteur de l'image. */
  readonly eye: readonly [number, number];
  /** Zoom du jeton : la largeur d'image qu'il montre (avant son recul), en % de la largeur de l'image : le visage et un peu autour. */
  readonly face: number;
}

const art = (src: string, w: number, h: number, eye: readonly [number, number], face: number): CardArt => ({ src, w, h, eye, face });

export const CARD_ART: Partial<Record<CardId, CardArt>> = {
  // Deck Archers
  'archer-leger': art(archerLeger, 572, 1024, [49.5, 25.8], 25),
  'archer-lourd': art(archerLourd, 572, 1024, [49, 26], 33),
  'archer-de-glace': art(archerDeGlace, 576, 1024, [44.5, 12.3], 24),
  'archer-du-feu': art(archerDuFeu, 572, 1024, [50, 14.1], 25),
  trebuchet: art(trebuchet, 960, 960, [52, 35], 70),
  'fleche-divine': art(flecheDivine, 1024, 559, [48, 45], 45),
  // Deck Pièges
  'poseur-de-piege': art(poseurDePiege, 1024, 1024, [65, 32.5], 30),
  farceur: art(farceur, 1024, 1024, [70, 30.5], 40),
  'poseur-de-bombe': art(poseurDeBombe, 1024, 1024, [55.5, 36], 36),
  'clown-assassin': art(clownAssassin, 1024, 1024, [64, 28], 32),
  penombre: art(penombre, 687, 1024, [45, 26], 60),
  // Deck Dragons
  'jeune-dragon': art(jeuneDragon, 1024, 559, [63.1, 24], 24),
  'dragon-feu': art(dragonFeu, 1024, 559, [58, 42], 30),
  'dragon-eau': art(dragonEau, 1024, 559, [71.5, 21], 28),
  'dragon-vent': art(dragonVent, 1024, 559, [42, 32], 28),
  'dragon-terre': art(dragonTerre, 1024, 559, [37.5, 25], 30),
  'dragon-origine': art(dragonOrigine, 1024, 559, [46.5, 12], 30),
  // Deck Bodybuilder
  'jeune-gomuscu': art(jeuneGomuscu, 1024, 559, [51.7, 35.4], 15),
  'jean-bon': art(jeanBon, 1024, 559, [51.1, 32.3], 14),
  arnold: art(arnold, 1024, 559, [62.9, 21.4], 17),
  'ki-ne': art(kiNe, 1024, 559, [52.5, 36.2], 16),
  seringue: art(seringue, 1024, 559, [52, 45], 45),
  // Deck Sorciers du feu
  apprenti: art(apprenti, 576, 1024, [46.5, 24.6], 30),
  'lutin-brasier': art(lutinBrasier, 1024, 559, [49.9, 28.6], 23),
  archimage: art(archimage, 1024, 559, [52.7, 24.3], 16),
  'golem-de-lave': art(golemDeLave, 1024, 559, [49.7, 16.5], 28),
  // Deck Explorateur du temps
  'apprenti-temps': art(apprentiTemps, 576, 1024, [50.6, 11.2], 23),
  chronomancienne: art(chronomancienne, 576, 1024, [48.2, 20.2], 22),
  'dragonnet-temps': art(dragonnetTemps, 576, 1024, [64.6, 40.3], 24),
  'maitre-des-heures': art(maitreDesHeures, 576, 1024, [55.6, 20.8], 22),
  // Scènes en 9:16 : le point d'intérêt au niveau du bandeau, l'image couvre toute la fiche (pas de bande floue).
  'piege-temporel': art(piegeTemporel, 576, 1024, [49.6, 13], 60),
  'fissure-temporelle': art(fissureTemporelle, 576, 1024, [51, 13], 55),
  // Cartes communes
  invocateur: art(invocateur, 1024, 559, [40.3, 24], 17),
  teleporteur: art(teleporteur, 1024, 559, [37.2, 23.7], 18),
  charge: art(charge, 1024, 559, [60.1, 17.7], 16),
  'boule-de-feu': art(bouleDeFeu, 1024, 559, [50, 28], 32),
  bourrasque: art(bourrasque, 1024, 559, [63, 35], 35),
  benediction: art(benediction, 1024, 559, [54, 28], 32),
  // Terrains
  'autel-de-mana': art(autelDeMana, 1024, 572, [59, 25], 30),
  bastion: art(bastion, 1024, 572, [55, 30], 45),
  'terrain-drainant': art(terrainDrainant, 1024, 559, [41, 25], 40),
  'terrain-piege': art(terrainPiege, 1024, 559, [48, 52], 45),
  'zone-invocation': art(zoneInvocation, 1024, 559, [55, 45], 45),
};

/**
 * Illustration d'un exemplaire brillant (handoff V11), même image recolorée et même cadrage que `CARD_ART` ; une carte
 * absente d'ici garde son illustration, avec le shiny générique par-dessus.
 */
export const CARD_ART_SHINY: Partial<Record<CardId, string>> = {
  'archer-de-glace': archerDeGlaceShiny,
  apprenti: apprentiShiny,
};

/** L'illustration à montrer pour un exemplaire, brillant ou non. */
export function cardArtFor(cardId: CardId, shiny: boolean): CardArt | undefined {
  const base = CARD_ART[cardId];
  const src = shiny ? CARD_ART_SHINY[cardId] : undefined;
  return base && src ? { ...base, src } : base;
}

/**
 * Comment cadrer une illustration dans une boîte : `ratio` = hauteur / largeur de la boîte, les yeux à `eyeAt` de sa
 * hauteur, l'image couvrant au moins `cover` de sa hauteur (rognée sur les côtés si besoin).
 */
export interface ArtFrame {
  readonly ratio: number;
  readonly eyeAt: number;
  readonly cover: number;
}

/** Fiche (280 × 498) : les yeux dans le bandeau clair du haut. */
export const SHEET_FRAME: ArtFrame = { ratio: 498 / 280, eyeAt: 0.13, cover: 0.8 };
/** Tuile du grimoire (3:4) et carte qui vole. */
export const TILE_FRAME: ArtFrame = { ratio: 4 / 3, eyeAt: 0.16, cover: 0.85 };
/** Carte mise en avant (cut-in, 280 × 498) : l'illustration sur toute la carte, les yeux vers le tiers haut. */
export const CUT_IN_FRAME: ArtFrame = { ratio: 498 / 280, eyeAt: 0.3, cover: 1 };

/**
 * Placement de l'image, en largeurs de boîte : décalage `x`, `y` du coin haut gauche, largeur `size` ; `edge` : où
 * finit l'image, en % de la hauteur de la boîte (moins de 100 : il reste du vide en bas).
 */
export interface ArtFit {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly edge: number;
}

/** Cadrage dans une boîte : centré sur les yeux sans vide sur les côtés, les yeux à `eyeAt`, jamais de vide en haut. */
export function artFit(image: CardArt, frame: ArtFrame): ArtFit {
  const r = image.h / image.w;
  const ex = image.eye[0] / 100;
  const ey = image.eye[1] / 100;
  const size = Math.max(1, (frame.cover * frame.ratio) / r);
  const height = size * r;
  const x = Math.min(0, Math.max(1 - size, 0.5 - ex * size));
  const y = Math.max(frame.ratio - height - 1, Math.min(0, frame.eyeAt * frame.ratio - ey * height));
  return { x, y, size, edge: ((y + height) / frame.ratio) * 100 };
}

/** Recul du jeton : il montre un quart de largeur d'image de plus que `face`, pour voir la tête en entier. */
export const TOKEN_STEP_BACK = 1.25;

/**
 * Cadrage d'un jeton rond : il montre `face` × `TOKEN_STEP_BACK` % de la largeur de l'image, les yeux centrés, au
 * quart de sa hauteur ; l'image couvre toujours tout le rond (sans vide, quitte à décaler un peu les yeux).
 */
export function tokenFit(image: CardArt): ArtFit {
  const r = image.h / image.w;
  const size = Math.max(100 / Math.min(100, image.face * TOKEN_STEP_BACK), 1, 1 / r);
  const height = size * r;
  const x = Math.min(0, Math.max(1 - size, 0.5 - (image.eye[0] / 100) * size));
  const y = Math.min(0, Math.max(1 - height, 0.25 - (image.eye[1] / 100) * height));
  return { x, y, size, edge: (y + height) * 100 };
}

/**
 * Fond CSS d'un cadrage. Positions absolues (jamais en %, qui ne bougent plus quand l'image a presque le ratio de la
 * boîte) : en `cqw` quand la boîte est le conteneur, sinon en px pour une boîte de `unit` px de large.
 */
export function fitBackground(image: CardArt, fit: ArtFit, unit: 'cqw' | number): string {
  const scale = unit === 'cqw' ? 100 : unit;
  const suffix = unit === 'cqw' ? 'cqw' : 'px';
  const length = (value: number) => `${Number((value * scale).toFixed(2))}${suffix}`;
  return `url("${image.src}") ${length(fit.x)} ${length(fit.y)} / ${length(fit.size)} auto no-repeat`;
}

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
  'apprenti-temps': 'Apprenti',
  chronomancienne: 'Chronomanc.',
  'dragonnet-temps': 'Dragonnet',
};

/** Nom court sur un jeton sans illustration : le sien, sinon le nom de la carte sans son archétype. */
export const shortName = (cardId: CardId, name: string): string => {
  const at = name.lastIndexOf(' - ');
  return SHORT_NAMES[cardId] ?? (at < 0 ? name : name.slice(0, at));
};
