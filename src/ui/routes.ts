// Pages de l'application : l'accueil (`/`) règle la partie, le jeu est sur `/game`. Les choix de la partie sont dans
// l'adresse du jeu (`/game?carte=…&j1=…&j2=…&ia=2`) : recharger la page relance une partie avec les mêmes réglages.
import { BOARDS, DECKS } from '../engine';
import type { Board, Deck, PlayerId } from '../engine';
import { DEFAULT_SETUP } from './session';
import type { Setup } from './session';

export type Page = 'home' | 'game';

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
  const params = new URLSearchParams({ carte: boardSlug(setup.board), j1: setup.decks[1].id, j2: setup.decks[2].id });
  if (setup.ai) params.set('ia', String(setup.ai));
  return params.toString();
}

/** Réglages lus dans l'adresse ; ce qui manque ou n'existe pas reprend la valeur par défaut. */
export function setupFromQuery(search: string): Setup {
  const params = new URLSearchParams(search);
  const board = BOARDS.find((b) => boardSlug(b) === params.get('carte')) ?? DEFAULT_SETUP.board;
  const deck = (player: PlayerId): Deck => DECKS.find((d) => d.id === params.get(`j${player}`)) ?? DEFAULT_SETUP.decks[player];
  return { board, decks: { 1: deck(1), 2: deck(2) }, ai: params.get('ia') === '2' ? 2 : null };
}

/** Page affichée pour un chemin, sous la base de l'application (`import.meta.env.BASE_URL`). */
export function pageOf(pathname: string, base = '/'): Page {
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  return path.replace(/\/+$/, '') === 'game' ? 'game' : 'home';
}

/** Adresse d'une page ; celle du jeu porte ses réglages. */
export function pageUrl(page: Page, setup: Setup | null = null, base = '/'): string {
  return page === 'game' ? `${base}game${setup ? `?${setupToQuery(setup)}` : ''}` : base;
}

const LAST_SETUP_KEY = 'tcg-derniere-partie';

/** Derniers réglages lancés depuis ce navigateur (l'accueil les reprend), ou ceux par défaut. */
export function loadLastSetup(): Setup {
  try {
    const saved = window.localStorage.getItem(LAST_SETUP_KEY);
    return saved === null ? DEFAULT_SETUP : setupFromQuery(saved);
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
