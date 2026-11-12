// Illustrations des cartes et fonds de plateau. Une carte ou un plateau sans image garde un motif par défaut.
// Handoff V8, lot 10 : les illustrations sont prises telles quelles, de n'importe quel format ; chaque affichage (jeton,
// fiche, tuile du grimoire, carte qui vole) les cadre seul sur les yeux du personnage (ou le point d'intérêt d'un sort
// ou d'un terrain), d'après la taille de l'image et la position des yeux notées ici.
import type { Board, CardId } from '../engine';
import appelDuSang from '../assets/art/appel-du-sang.jpg';
import apprentiTemps from '../assets/art/apprenti-temps.jpg';
import apprenti from '../assets/art/apprenti.jpg';
import archerDeGlaceShiny from '../assets/art/archer-de-glace-shiny.jpg';
import archerDeGlace from '../assets/art/archer-de-glace.jpg';
import archerDuFeu from '../assets/art/archer-du-feu.jpg';
import archerImperial from '../assets/art/archer-imperial.jpg';
import archerLeger from '../assets/art/archer-leger.jpg';
import arbaletrierImperial from '../assets/art/arbaletrier-imperial.jpg';
import campsDeTir from '../assets/art/camps-de-tir.jpg';
import ecuyerArchers from '../assets/art/ecuyer-archers.jpg';
import archerLourd from '../assets/art/archer-lourd.jpg';
import archimage from '../assets/art/archimage.jpg';
import arnold from '../assets/art/arnold.jpg';
import autelDeMana from '../assets/art/autel-de-mana.jpg';
import bastion from '../assets/art/bastion.jpg';
import benediction from '../assets/art/benediction.jpg';
import bouleDeFeu from '../assets/art/boule-de-feu.jpg';
import bourrasque from '../assets/art/bourrasque.jpg';
import brulureEnChaine from '../assets/art/brulure-en-chaine.jpg';
import charge from '../assets/art/charge.jpg';
import chronomancienne from '../assets/art/chronomancienne.jpg';
import clownAssassin from '../assets/art/clown-assassin.jpg';
import dragonEau from '../assets/art/dragon-eau.jpg';
import dragonFeu from '../assets/art/dragon-feu.jpg';
import dragonOrigine from '../assets/art/dragon-origine.jpg';
import dragonTerre from '../assets/art/dragon-terre.jpg';
import dragonVent from '../assets/art/dragon-vent.jpg';
import delta from '../assets/art/delta.jpg';
import dragonnetTemps from '../assets/art/dragonnet-temps.jpg';
import emmaChauveSouris from '../assets/art/emma-chauve-souris.jpg';
import emma from '../assets/art/emma.jpg';
import farceur from '../assets/art/farceur.jpg';
import fissureTemporelle from '../assets/art/fissure-temporelle.jpg';
import flecheDivine from '../assets/art/fleche-divine.jpg';
import golemDeLave from '../assets/art/golem-de-lave.jpg';
import invocateur from '../assets/art/invocateur.jpg';
import jeanBon from '../assets/art/jean-bon.jpg';
import jeuneDragon from '../assets/art/jeune-dragon.jpg';
import nidDeDragons from '../assets/art/nid-de-dragons.jpg';
import jeuneGomuscu from '../assets/art/jeune-gomuscu.jpg';
import kiNe from '../assets/art/ki-ne.jpg';
import lutinBrasier from '../assets/art/lutin-brasier.jpg';
import maitreDuTemps from '../assets/art/maitre-du-temps.jpg';
import penombre from '../assets/art/penombre.jpg';
import piegeTemporel from '../assets/art/piege-temporel.jpg';
import poseurDeBombe from '../assets/art/poseur-de-bombe.jpg';
import poseurDePiege from '../assets/art/poseur-de-piege.jpg';
import sacrificeSanguinaire from '../assets/art/sacrifice-sanguinaire.jpg';
import seringue from '../assets/art/seringue.jpg';
import teleporteur from '../assets/art/teleporteur.jpg';
import terrainDeJeu from '../assets/art/terrain-de-jeu.jpg';
import terrainDrainant from '../assets/art/terrain-drainant.jpg';
import terrainPiege from '../assets/art/terrain-piege.jpg';
import trebuchet from '../assets/art/trebuchet.jpg';
import trebuchetArchers from '../assets/art/trebuchet-archers.jpg';
import vladimir from '../assets/art/vladimir.jpg';
import zoneInvocation from '../assets/art/zone-invocation.jpg';
import repli from '../assets/art/repli.jpg';
import carapace from '../assets/art/carapace.jpg';
import fatigue from '../assets/art/fatigue.jpg';
import flash from '../assets/art/flash.jpg';
import fortification from '../assets/art/fortification.jpg';
import elixirDeMana from '../assets/art/elixir-de-mana.jpg';
import puissance from '../assets/art/puissance.jpg';
import reanimation from '../assets/art/reanimation.jpg';
import soin from '../assets/art/soin.jpg';
import teleportation from '../assets/art/teleportation.jpg';
import hurlements from '../assets/art/hurlements.jpg';
import terrainDeChasse from '../assets/art/terrain-de-chasse.jpg';
import zoldikShiny from '../assets/art/zoldik-shiny.jpg';
import zoldik from '../assets/art/zoldik.jpg';
import archi from '../assets/art/archi.jpg';
import blitz from '../assets/art/blitz.jpg';
import chainesEclair from '../assets/art/chaines-eclair.jpg';
import champMagnetique from '../assets/art/champ-magnetique.jpg';
import elek from '../assets/art/elek.jpg';
import joy from '../assets/art/joy.jpg';
import ondeDeChoc from '../assets/art/onde-de-choc.jpg';

export interface CardArt {
  readonly src: string;
  /** Taille de l'image, en px. */
  readonly w: number;
  readonly h: number;
  /** Position des yeux (ou du point d'intérêt), en % de la largeur et de la hauteur de l'image. */
  readonly eye: readonly [number, number];
  /** Zoom du jeton : la largeur d'image qu'il montre (avant son recul), en % de la largeur de l'image : le visage et un peu autour. */
  readonly face: number;
  /**
   * Yeux pour le jeton, s'ils ne sont pas à `eye` : une illustration peu recadrée garde `eye` à 13 % (la fiche et la
   * tuile la calent en haut, sans zoom) et donne ici la vraie place des yeux, pour centrer le jeton sur le visage.
   */
  readonly token?: readonly [number, number];
}

const art = (src: string, w: number, h: number, eye: readonly [number, number], face: number, token?: readonly [number, number]): CardArt =>
  token ? { src, w, h, eye, face, token } : { src, w, h, eye, face };

export const CARD_ART: Partial<Record<CardId, CardArt>> = {
  // Deck Archers
  'archer-leger': art(archerLeger, 572, 1024, [49.5, 25.8], 25),
  'archer-lourd': art(archerLourd, 572, 1024, [49, 26], 33),
  'archer-de-glace': art(archerDeGlace, 576, 1024, [44.5, 12.3], 24),
  'archer-du-feu': art(archerDuFeu, 572, 1024, [50, 14.1], 25),
  trebuchet: art(trebuchet, 960, 960, [52, 35], 70),
  // Deck Archers impériaux (sources dans artworks/, recadrées au ratio 1,78 comme les autres decks en 9:16) : les yeux à 13 %
  // de la hauteur (SHEET_FRAME.eyeAt), sinon l'image remonte et laisse du vide en bas de la fiche ; scènes et machines : le point
  // d'intérêt est donné à 13 %, l'image reste calée en haut.
  'ecuyer-archers': art(ecuyerArchers, 576, 1024, [24.2, 13], 30, [24.2, 20.3]),
  'archer-imperial': art(archerImperial, 576, 1024, [38.4, 13], 26, [38.4, 23.3]),
  'arbaletrier-imperial': art(arbaletrierImperial, 576, 1024, [50.3, 13], 24, [50.3, 29.5]),
  'trebuchet-archers': art(trebuchetArchers, 576, 1024, [30, 13], 70),
  'camps-de-tir': art(campsDeTir, 576, 1024, [55, 13], 60),
  'fleche-divine': art(flecheDivine, 576, 1024, [22.1, 13], 29),
  // Deck Maîtres des pièges
  // Nouvelles illustrations du 2026-11-08 (sources dans artworks/) : recadrées au ratio 1,78, les yeux à 13 % de la hauteur
  // pour couvrir toute la fiche ; Pénombre, une scène, calée en haut.
  'poseur-de-piege': art(poseurDePiege, 576, 1024, [50.4, 13], 21, [50.4, 17.4]),
  farceur: art(farceur, 576, 1024, [50.2, 13], 26, [50.2, 36.6]),
  'poseur-de-bombe': art(poseurDeBombe, 576, 1024, [63.5, 13], 20, [63.5, 33.5]),
  'clown-assassin': art(clownAssassin, 576, 1024, [47.4, 13], 23, [47.4, 28.5]),
  penombre: art(penombre, 576, 1024, [53, 13], 60),
  'terrain-de-jeu': art(terrainDeJeu, 576, 1024, [50, 13], 60, [50, 30]),
  // Deck Dragons élémentaires (refait le 2026-11-08, sources dans artworks/) : recadrées au ratio 1,78, les yeux à 13 % de
  // la hauteur (SHEET_FRAME.eyeAt) pour couvrir toute la fiche ; le Nid, une scène, calée en haut.
  'jeune-dragon': art(jeuneDragon, 576, 1024, [41.3, 13], 32, [41.3, 20.4]),
  'dragon-feu': art(dragonFeu, 576, 1024, [54, 13], 30, [54, 37.4]),
  'dragon-eau': art(dragonEau, 576, 1024, [25.6, 13], 27, [25.6, 26.7]),
  'dragon-vent': art(dragonVent, 576, 1024, [70.4, 13], 27, [70.4, 36.4]),
  'dragon-terre': art(dragonTerre, 576, 1024, [63.4, 13], 30, [63.4, 28.5]),
  'nid-de-dragons': art(nidDeDragons, 576, 1024, [50, 13], 60),
  hurlements: art(hurlements, 576, 1024, [50, 13], 60),
  'dragon-origine': art(dragonOrigine, 1024, 559, [46.5, 12], 30),
  // Deck Bodybuilder
  'jeune-gomuscu': art(jeuneGomuscu, 1024, 559, [51.7, 35.4], 15),
  'jean-bon': art(jeanBon, 1024, 559, [51.1, 32.3], 14),
  arnold: art(arnold, 1024, 559, [62.9, 21.4], 17),
  'ki-ne': art(kiNe, 1024, 559, [52.5, 36.2], 16),
  seringue: art(seringue, 1024, 559, [52, 45], 45),
  // Deck Sorciers du feu
  // Nouvelles illustrations du 2026-11-09 (sources dans artworks/) : recadrées au ratio 1,78, les yeux à 13 % de la hauteur
  // pour couvrir toute la fiche (Feria n'a plus d'overframe ni d'illustration brillante propre) ; Brûlure en chaîne, une
  // scène, calée en haut.
  apprenti: art(apprenti, 576, 1024, [46.9, 13], 24, [46.9, 22.5]),
  'lutin-brasier': art(lutinBrasier, 576, 1024, [49, 13], 60, [49, 23]),
  archimage: art(archimage, 576, 1024, [48, 13], 22, [48, 14.3]),
  'golem-de-lave': art(golemDeLave, 576, 1024, [50.2, 13], 24, [50.2, 15.3]),
  'brulure-en-chaine': art(brulureEnChaine, 576, 1024, [50, 13], 60),
  // Deck Explorateur du temps
  'apprenti-temps': art(apprentiTemps, 576, 1024, [50.6, 11.2], 23),
  chronomancienne: art(chronomancienne, 576, 1024, [48.2, 20.2], 22),
  'dragonnet-temps': art(dragonnetTemps, 576, 1024, [64.6, 40.3], 24),
  'maitre-du-temps': art(maitreDuTemps, 576, 1024, [55.6, 20.8], 22),
  // Scènes en 9:16 : le point d'intérêt au niveau du bandeau, l'image couvre toute la fiche (pas de bande floue).
  'piege-temporel': art(piegeTemporel, 576, 1024, [49.6, 13], 60),
  'fissure-temporelle': art(fissureTemporelle, 576, 1024, [51, 13], 55),
  // Deck Vampire (sources dans artworksv2/vampire/, plans larges) : recadrées serré au ratio 1,8, les yeux vers 13 % de
  // la hauteur, pour couvrir toute la fiche ; les sorts calés en haut de la scène.
  delta: art(delta, 569, 1024, [50, 14], 28),
  emma: art(emma, 569, 1024, [38.2, 13.5], 28),
  'emma-chauve-souris': art(emmaChauveSouris, 569, 1024, [50, 14], 31),
  vladimir: art(vladimir, 569, 1024, [50, 13.5], 28),
  zoldik: art(zoldik, 569, 1024, [45.1, 11.8], 28),
  'appel-du-sang': art(appelDuSang, 569, 1024, [50, 13], 60),
  'sacrifice-sanguinaire': art(sacrificeSanguinaire, 569, 1024, [50, 13], 50),
  // Le Terrain de chasse (terrain du deck Vampire depuis le 2026-11-10) : une scène, calée en haut ; son blason se centre
  // sur la maison.
  'terrain-de-chasse': art(terrainDeChasse, 576, 1024, [50, 13], 45, [66, 44]),
  // Deck Ingénieurs foudroyants (2026-11-12, sources dans artworksv2/ingenieurs-foudroyants/, 784 × 1168) : recadrées au
  // ratio 1,78 sans réduction, les yeux vers 13 % de la hauteur pour couvrir toute la fiche ; les sorts et le Champ
  // magnétique, des scènes calées en haut, son blason centré sur le cercle.
  archi: art(archi, 576, 1024, [34.7, 13.8], 25),
  elek: art(elek, 576, 1024, [39.6, 13], 24),
  blitz: art(blitz, 576, 1024, [27.8, 14.3], 32),
  joy: art(joy, 576, 1024, [36.5, 14], 23),
  'champ-magnetique': art(champMagnetique, 576, 1024, [50, 13], 60, [50, 48]),
  'chaines-eclair': art(chainesEclair, 576, 1024, [50, 13], 60),
  'onde-de-choc': art(ondeDeChoc, 576, 1024, [50, 13], 60),
  // Cartes communes
  invocateur: art(invocateur, 1024, 559, [40.3, 24], 17),
  teleporteur: art(teleporteur, 1024, 559, [37.2, 23.7], 18),
  charge: art(charge, 1024, 559, [60.1, 17.7], 16),
  'boule-de-feu': art(bouleDeFeu, 1024, 559, [50, 28], 32),
  // Nouvelle Bourrasque et sorts génériques du 2026-11-10 (sources dans artworks/, 784 × 1168) : recadrées au ratio 1,78,
  // des scènes calées en haut (point d'intérêt donné à 13 %), qui couvrent toute la fiche.
  bourrasque: art(bourrasque, 576, 1024, [57, 13], 60),
  puissance: art(puissance, 576, 1024, [50, 13], 60),
  soin: art(soin, 576, 1024, [50, 13], 60),
  flash: art(flash, 576, 1024, [50, 13], 60),
  fatigue: art(fatigue, 576, 1024, [50, 13], 60),
  carapace: art(carapace, 576, 1024, [50, 13], 60),
  'elixir-de-mana': art(elixirDeMana, 576, 1024, [50, 13], 60),
  repli: art(repli, 576, 1024, [50, 13], 60),
  teleportation: art(teleportation, 576, 1024, [50, 13], 60),
  reanimation: art(reanimation, 576, 1024, [50, 13], 60),
  fortification: art(fortification, 576, 1024, [50, 13], 60),
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
  zoldik: zoldikShiny,
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

/** Fiche plein cadre (280 × 498, refonte du 2026-11-11) : les yeux vers le haut, l'image sur toute la hauteur. */
export const SHEET_FRAME: ArtFrame = { ratio: 498 / 280, eyeAt: 0.13, cover: 1 };
/** Tuile du grimoire (3:4) et carte qui vole. */
export const TILE_FRAME: ArtFrame = { ratio: 4 / 3, eyeAt: 0.16, cover: 0.85 };
/** Vignette carrée d'une ligne du grimoire en liste : le visage. */
export const THUMB_FRAME: ArtFrame = { ratio: 1, eyeAt: 0.34, cover: 1 };
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
  const [eyeX, eyeY] = image.token ?? image.eye;
  const x = Math.min(0, Math.max(1 - size, 0.5 - (eyeX / 100) * size));
  const y = Math.min(0, Math.max(1 - height, 0.25 - (eyeY / 100) * height));
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
  'dragon-origine': 'Origine',
  'apprenti-temps': 'Apprenti',
  chronomancienne: 'Chronomanc.',
  'dragonnet-temps': 'Dragonnet',
  'emma-chauve-souris': 'Chauve-souris',
};

/** Nom court sur un jeton sans illustration : le sien, sinon le nom de la carte sans son archétype. */
export const shortName = (cardId: CardId, name: string): string => {
  const at = name.lastIndexOf(' - ');
  return SHORT_NAMES[cardId] ?? (at < 0 ? name : name.slice(0, at));
};
