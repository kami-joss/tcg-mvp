import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, BATTLEFIELD_13, BATTLEFIELD_15, BOARD, BOARDS, DECKS, getPlayerView } from '../engine';
import { gameWith } from '../engine/test-utils';
import { HomeScreen } from './HomeScreen';
import { boardSlug, pageOf, pageUrl, setupFromQuery, setupToQuery } from './routes';
import { DEFAULT_SETUP, newSession } from './session';
import type { Setup } from './session';
import { VictoryOverlay } from './VictoryOverlay';

// Pages : l'accueil (`/`) règle la partie, le jeu est sur `/game` avec ses réglages dans l'adresse.

const archers = DECKS.find((d) => d.id === 'archers')!;
const pieges = DECKS.find((d) => d.id === 'pieges')!;

describe('adresses des pages', () => {
  it('identifiant de chaque carte, unique', () => {
    expect(boardSlug(BOARD)).toBe('classique-11x9');
    expect(boardSlug(BATTLEFIELD)).toBe('champ-de-bataille-11x11');
    expect(boardSlug(BATTLEFIELD_13)).toBe('champ-de-bataille-13x13');
    expect(new Set(BOARDS.map(boardSlug)).size).toBe(BOARDS.length);
  });

  it('les réglages font l’aller-retour par l’adresse du jeu', () => {
    const setup: Setup = { board: BATTLEFIELD, mode: 'normal', decks: { 1: archers, 2: pieges }, ai: 2 };
    expect(setupToQuery(setup)).toBe('carte=champ-de-bataille-11x11&j1=archers&j2=pieges&ia=2');
    expect(setupFromQuery(`?${setupToQuery(setup)}`)).toEqual(setup);
    expect(pageUrl('game', setup)).toBe('/game?carte=champ-de-bataille-11x11&j1=archers&j2=pieges&ia=2');
    expect(pageUrl('home')).toBe('/');
  });

  it('le mode contestation est dans l’adresse, sur une carte qui le propose (SPEC.md §4.4 bis)', () => {
    const setup: Setup = { board: BATTLEFIELD_15, mode: 'contestation', decks: { 1: archers, 2: pieges }, ai: null };
    expect(setupToQuery(setup)).toBe('carte=champ-de-bataille-15x15&mode=contestation&j1=archers&j2=pieges');
    expect(setupFromQuery(`?${setupToQuery(setup)}`)).toEqual(setup);
    // Une carte qui ne le propose pas joue en mode Normal, quoi que dise l'adresse.
    expect(setupToQuery({ ...setup, board: BOARD })).not.toContain('mode=');
    expect(setupFromQuery('?carte=classique-11x9&mode=contestation').mode).toBe('normal');
    expect(newSession(1, { ...setup, board: BOARD }).game.mode).toBe('normal');
    expect(newSession(1, setup).game.mode).toBe('contestation');
  });

  it('ce qui manque ou n’existe pas reprend la valeur par défaut', () => {
    expect(setupFromQuery('')).toEqual({ ...DEFAULT_SETUP, ai: null });
    expect(setupFromQuery('?carte=inconnue&j1=archers&j2=rien').decks).toEqual({ 1: archers, 2: DEFAULT_SETUP.decks[2] });
  });

  it('/game : le jeu ; tout le reste : l’accueil (base de l’application comprise)', () => {
    expect(pageOf('/game')).toBe('game');
    expect(pageOf('/game/')).toBe('game');
    expect(pageOf('/')).toBe('home');
    expect(pageOf('/autre')).toBe('home');
    expect(pageOf('/tcg/game', '/tcg/')).toBe('game');
    expect(pageUrl('game', null, '/tcg/')).toBe('/tcg/game');
  });
});

describe('accueil', () => {
  const html = renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={() => {}} />);

  it('les cartes, avec leurs particularités ; celle par défaut cochée', () => {
    expect(html.match(/name="carte"/g)).toHaveLength(BOARDS.length);
    expect(html).toContain('13 × 13 · vue isométrique · +1 mobilité pour tous les monstres');
    expect(html).toContain('11 × 9');
    expect(html).toContain('checked="" value="Champ de bataille (13 × 13)"');
  });

  it('un deck par joueur, J2 humain ou IA, et le bouton pour lancer', () => {
    expect(html.match(/name="deck-j1"/g)).toHaveLength(DECKS.length);
    expect(html.match(/name="deck-j2"/g)).toHaveLength(DECKS.length);
    expect(html).toContain('aria-pressed="true">Un humain');
    expect(html).toContain('Lancer la partie');
  });

  it('le mode : Normal par défaut, Contestation sur le 13 × 13 et le 15 × 15 seulement (SPEC.md §4.4 bis)', () => {
    expect(html).toContain('aria-pressed="true">Normal');
    expect(html).toMatch(/aria-pressed="false">Contestation/);
    expect(html).toContain('13 × 13 · vue isométrique · +1 mobilité pour tous les monstres · mode contestation');
    const contest = renderToStaticMarkup(<HomeScreen initial={{ ...DEFAULT_SETUP, mode: 'contestation' }} onStart={() => {}} />);
    expect(contest).toContain('aria-pressed="true">Contestation');
    expect(contest).toContain('zone de 9 cases');
    const classic = renderToStaticMarkup(<HomeScreen initial={{ ...DEFAULT_SETUP, board: BOARD, mode: 'contestation' }} onStart={() => {}} />);
    expect(classic).toContain('aria-pressed="true">Normal');
    expect(classic).toMatch(/disabled="">Contestation/);
    expect(classic).toContain('Contestation : sur les cartes 13 × 13 et 15 × 15.');
  });
});

describe('fin de partie', () => {
  it('rejouer avec les mêmes réglages, ou revenir à l’accueil', () => {
    const won = getPlayerView({ ...gameWith([]), winner: 1 }, 1);
    const html = renderToStaticMarkup(<VictoryOverlay view={won} onRestart={() => {}} onHome={() => {}} />);
    expect(html).toContain('Le Joueur 1 l’emporte');
    expect(html).toContain('Rejouer');
    expect(html).toContain('Nouvelle partie');
  });
});
