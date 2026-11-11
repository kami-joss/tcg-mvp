// Pages de l'application : l'accueil (`/`) règle la partie, le jeu est sur `/game`. Les choix de la partie sont dans
// l'adresse du jeu (`/game?carte=…&mode=contestation&eco=reserve&gen=6&lim=12&j1=…&j2=…&ia=2&atelier=1&minuteur=1`) : recharger la
// page relance une partie avec les mêmes réglages (les cartes de l'atelier telles qu'elles sont alors). Pages ouvertes depuis l'accueil : les decks (`/decks?deck=…`), les règles (`/regles`), les
// barèmes de coût des monstres (`/baremes`) et l'atelier de cartes (`/atelier`).
import { BOARDS, DECKS, DEFAULT_MANA_RULES, VICTORY_VP } from '../engine';
import type { Board, Deck, ManaRules, PlayerId } from '../engine';
import { DEFAULT_SETUP, MANA_CHOICES, isVictoryChoice, manaRulesOf, modeOf, victoryVpOf } from './session';
import type { Setup } from './session';
import { hasPatches, loadPatches } from './workshop';
import type { WorkshopPatches } from './workshop';

export type Page = 'home' | 'game' | 'decks' | 'rules' | 'scales' | 'workshop' | 'online';

/** Chemin de chaque page, sous la base de l'application ; l'accueil est à la racine. */
const PAGE_PATHS: Readonly<Record<Exclude<Page, 'home' | 'online'>, string>> = {
  game: 'game',
  decks: 'decks',
  rules: 'regles',
  scales: 'baremes',
  workshop: 'atelier',
};

/** Identifiant d'une carte dans l'adresse : « Champ de bataille (13 × 13) » → `champ-de-bataille-13x13`. */
export function boardSlug(board: Board): string {
  return board.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*×\s*/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Paramètres de l'adresse du jeu pour ces réglages. */
export function setupToQuery(setup: Setup): string {
  const params = new URLSearchParams({ carte: boardSlug(setup.board) });
  if (modeOf(setup) === 'contestation') params.set('mode', 'contestation');
  if (setup.economy === 'reserve') params.set('eco', 'reserve');
  // Réglages du mana : seulement s'ils ne sont pas ceux par défaut.
  const rules = manaRulesOf(setup);
  if (rules.baseCap !== DEFAULT_MANA_RULES.baseCap) params.set('gen', String(rules.baseCap));
  if (rules.limit !== DEFAULT_MANA_RULES.limit) params.set('lim', String(rules.limit));
  // VP pour gagner : seulement s'ils ne sont pas 30.
  if (victoryVpOf(setup) !== VICTORY_VP) params.set('vp', String(victoryVpOf(setup)));
  params.set('j1', setup.decks[1].id);
  params.set('j2', setup.decks[2].id);
  if (setup.ai) params.set('ia', String(setup.ai));
  // Cartes de l'atelier : leurs réglages restent dans le navigateur, l'adresse dit seulement de les prendre.
  if (hasPatches(setup.workshop)) params.set('atelier', '1');
  if (setup.timer) params.set('minuteur', '1');
  // J2 en ligne : seulement pour que l'accueil s'en souvienne (une partie en ligne se joue sur /partie/<id>).
  if (setup.online) params.set('enligne', '1');
  return params.toString();
}

/**
 * Réglages lus dans l'adresse ; ce qui manque ou n'existe pas reprend la valeur par défaut. `workshop` : les réglages de
 * l'atelier gardés par ce navigateur, pris si l'adresse le demande (`atelier=1`) et s'il y en a.
 */
export function setupFromQuery(search: string, workshop: WorkshopPatches = {}): Setup {
  const params = new URLSearchParams(search);
  const board = BOARDS.find((b) => boardSlug(b) === params.get('carte')) ?? DEFAULT_SETUP.board;
  const deck = (player: PlayerId): Deck => DECKS.find((d) => d.id === params.get(`j${player}`)) ?? DEFAULT_SETUP.decks[player];
  const mode = modeOf({ board, mode: params.get('mode') === 'contestation' ? 'contestation' : 'normal' });
  // Économie classique, réglages du mana par défaut : les champs restent absents, comme dans les réglages par défaut.
  const economy = params.get('eco') === 'reserve' ? { economy: 'reserve' as const } : {};
  const rules: ManaRules = { baseCap: manaParam(params, 'gen', 'baseCap'), limit: manaParam(params, 'lim', 'limit') };
  const manaRules = rules.baseCap !== DEFAULT_MANA_RULES.baseCap || rules.limit !== DEFAULT_MANA_RULES.limit ? { manaRules: rules } : {};
  const vp = Number(params.get('vp'));
  const victoryVp = isVictoryChoice(vp) && vp !== VICTORY_VP ? { victoryVp: vp } : {};
  const cards = params.get('atelier') === '1' && hasPatches(workshop) ? { workshop } : {};
  const timer = params.get('minuteur') === '1' ? { timer: true } : {};
  const online = params.get('enligne') === '1' ? { online: true } : {};
  return { board, mode, ...economy, ...manaRules, ...victoryVp, decks: { 1: deck(1), 2: deck(2) }, ai: params.get('ia') === '2' ? 2 : null, ...cards, ...timer, ...online };
}

/** Un réglage du mana lu dans l'adresse : un entier parmi les valeurs proposées à l'accueil, sinon la valeur par défaut. */
function manaParam(params: URLSearchParams, name: string, key: keyof ManaRules): number {
  const value = Number(params.get(name));
  const { min, max } = MANA_CHOICES[key];
  return params.has(name) && Number.isInteger(value) && value >= min && value <= max ? value : DEFAULT_MANA_RULES[key];
}

/** Chemin sous la base de l'application, sans barres au bout. */
const pathOf = (pathname: string, base: string) => (pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '')).replace(/\/+$/, '');

/** Le chemin d'une partie en ligne : `partie/<id>` (le lien d'invitation, SPEC.md §7 ter). */
const ONLINE_PATH = /^partie\/([a-z0-9]+)$/;

/** Page affichée pour un chemin, sous la base de l'application (`import.meta.env.BASE_URL`). */
export function pageOf(pathname: string, base = '/'): Page {
  const path = pathOf(pathname, base);
  if (ONLINE_PATH.test(path)) return 'online';
  const page = (Object.keys(PAGE_PATHS) as (keyof typeof PAGE_PATHS)[]).find((key) => PAGE_PATHS[key] === path);
  return page ?? 'home';
}

/** L'identifiant de la partie en ligne d'un chemin `/partie/<id>` ; `null` ailleurs. */
export function onlineRoomOf(pathname: string, base = '/'): string | null {
  return ONLINE_PATH.exec(pathOf(pathname, base))?.[1] ?? null;
}

/** Le lien d'une partie en ligne (sous la base de l'application). */
export const onlineUrl = (roomId: string, base = '/'): string => `${base}partie/${roomId}`;

/** Adresse d'une page ; celle du jeu porte ses réglages. */
export function pageUrl(page: Page, setup: Setup | null = null, base = '/'): string {
  // Une partie en ligne a sa propre adresse (`onlineUrl`) : sans identifiant, l'accueil.
  if (page === 'home' || page === 'online') return base;
  return `${base}${PAGE_PATHS[page]}${page === 'game' && setup ? `?${setupToQuery(setup)}` : ''}`;
}

/** Adresse de la page des decks, ouverte sur un deck. */
export function decksUrl(deck: Deck, base = '/'): string {
  return `${pageUrl('decks', null, base)}?deck=${encodeURIComponent(deck.id)}`;
}

/** Deck montré par la page des decks (`?deck=…`) ; le premier s'il manque ou n'existe pas. */
export function deckFromQuery(search: string): Deck {
  const id = new URLSearchParams(search).get('deck');
  return DECKS.find((d) => d.id === id) ?? DECKS[0]!;
}

const LAST_SETUP_KEY = 'tcg-derniere-partie';

/** Derniers réglages lancés depuis ce navigateur (l'accueil les reprend), ou ceux par défaut. */
export function loadLastSetup(): Setup {
  try {
    const saved = window.localStorage.getItem(LAST_SETUP_KEY);
    return saved === null ? DEFAULT_SETUP : setupFromQuery(saved, loadPatches());
  } catch {
    return DEFAULT_SETUP;
  }
}

export function saveLastSetup(setup: Setup): void {
  try {
    window.localStorage.setItem(LAST_SETUP_KEY, setupToQuery(setup));
  } catch {
    // Stockage indisponible : l'accueil repartira des réglages par défaut.
  }
}
