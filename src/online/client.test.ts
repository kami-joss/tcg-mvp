import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, DECKS, createGame, getPlayerView } from '../engine';
import { boardSlug } from '../ui/routes';
import { DEFAULT_SETUP } from '../ui/session';
import {
  NOT_FOUND_TEXT,
  SERVER_DOWN,
  createOnlineGame,
  initialOnlineState,
  onlineBanner,
  onlinePhase,
  onlineReducer,
  onlineSetup,
  roomSettingsOf,
  settingsLines,
  socketUrl,
} from './client';
import type { OnlineEvent, OnlineState } from './client';
import type { RoomSettings, ServerMessage } from './protocol';

// Partie en ligne côté écran (SPEC.md §7 ter) : ce que l'écran sait de sa partie d'après les messages du serveur.

const SETTINGS: RoomSettings = { board: boardSlug(BATTLEFIELD_13), mode: 'normal', economy: 'classic', manaRules: { baseCap: 5, limit: 10 }, timer: true };
const DECKS_IDS = { 1: 'classique', 2: 'vampire' } as const;
const view = (viewer: 1 | 2 = 1) => getPlayerView(createGame(), viewer);
const state = (seq: number, opponentConnected = true): ServerMessage => ({
  type: 'state',
  seq,
  settings: SETTINGS,
  decks: DECKS_IDS,
  view: view(),
  log: [],
  clock: { id: seq, spent: 0, running: false },
  opponentConnected,
});
const run = (events: OnlineEvent[], start: OnlineState = initialOnlineState('salle')) => events.reduce(onlineReducer, start);
const message = (m: ServerMessage): OnlineEvent => ({ type: 'message', message: m });

describe('les pages de la partie en ligne', () => {
  it('connexion, puis salle d’attente (hôte, sa place connue) ou page pour rejoindre (invité, sans place)', () => {
    expect(onlinePhase(initialOnlineState('salle'))).toBe('loading');
    const lobby = message({ type: 'lobby', settings: SETTINGS, decks: { 1: 'classique', 2: null } });
    expect(onlinePhase(run([{ type: 'opened' }, lobby]))).toBe('join');
    expect(onlinePhase(run([{ type: 'opened' }, message({ type: 'welcome', seat: 1, token: 't' }), lobby]))).toBe('waiting');
  });

  it('les dés, puis la partie', () => {
    const opening = message({ type: 'opening', settings: SETTINGS, decks: DECKS_IDS, opening: { rolls: [{ 1: 5, 2: 2 }], winner: 1, chosen: null } });
    expect(onlinePhase(run([opening]))).toBe('opening');
    expect(onlinePhase(run([opening, message(state(1))]))).toBe('playing');
  });

  it('une erreur qui arrête tout ; un coup refusé n’est qu’une remarque, effacée au message suivant', () => {
    const full = run([message({ type: 'error', code: 'full', text: 'Ce lien a déjà servi.' })]);
    expect(onlinePhase(full)).toBe('error');
    expect(full.fatal).toEqual({ code: 'full', text: 'Ce lien a déjà servi.' });
    // Une coupure après une erreur ne change rien.
    expect(onlineReducer(full, { type: 'closed' })).toBe(full);
    const refused = run([message(state(1)), message({ type: 'error', code: 'refused', text: 'Ce n’est pas ton tour.' })]);
    expect([onlinePhase(refused), refused.notice]).toEqual(['playing', 'Ce n’est pas ton tour.']);
    expect(onlineReducer(refused, message(state(2))).notice).toBeNull();
    expect(run([{ type: 'notFound' }]).fatal).toEqual({ code: 'notFound', text: NOT_FOUND_TEXT });
  });
});

describe('la partie', () => {
  it('une nouvelle qui suit la précédente s’anime depuis elle ; après une reconnexion, on repart de la vue reçue', () => {
    const first = run([message(state(4))]);
    expect(first.before).toBeNull();
    const next = onlineReducer(first, message(state(5)));
    expect(next.before).toBe(first.view);
    // Une nouvelle qui ne suit pas (reconnexion, nouvelles manquées) : pas d'animation.
    expect(onlineReducer(next, message(state(9))).before).toBeNull();
  });

  it('l’horloge et la présence de l’adversaire suivent leurs messages', () => {
    const playing = run([message(state(1))]);
    expect(onlineReducer(playing, message({ type: 'clock', clock: { id: 2, spent: 4000, running: true } })).clock).toEqual({ id: 2, spent: 4000, running: true });
    expect(onlineReducer(playing, message({ type: 'presence', opponentConnected: false })).opponentConnected).toBe(false);
  });

  it('bandeau : connexion perdue, adversaire déconnecté (ses tours passeront avec le minuteur), coup refusé', () => {
    const playing = run([message(state(1))]);
    expect(onlineBanner(playing)).toBeNull();
    expect(onlineBanner(onlineReducer(playing, { type: 'closed' }))).toBe('Connexion perdue : reconnexion…');
    expect(onlineBanner(onlineReducer(playing, message({ type: 'presence', opponentConnected: false })))).toBe(
      'Ton adversaire s’est déconnecté : ses tours passeront à la fin de son temps.',
    );
    expect(onlineBanner(onlineReducer(playing, message({ type: 'error', code: 'refused', text: 'Non.' })))).toBe('Non.');
  });
});

describe('réglages', () => {
  it('ceux de l’accueil deviennent ceux de la partie en ligne, et inversement pour l’écran de jeu', () => {
    const settings = roomSettingsOf({ ...DEFAULT_SETUP, timer: true, economy: 'reserve' });
    expect(settings).toEqual({ board: boardSlug(DEFAULT_SETUP.board), mode: 'normal', economy: 'reserve', manaRules: { baseCap: 5, limit: 10 }, timer: true, victoryVp: 30 });
    expect(onlineSetup({ ...settings, victoryVp: 20 }, DECKS_IDS)).toMatchObject({ victoryVp: 20 });
    expect(onlineSetup(settings, DECKS_IDS)).toMatchObject({ board: DEFAULT_SETUP.board, decks: { 1: DECKS[0], 2: { id: 'vampire' } }, ai: null, timer: true });
    expect(onlineSetup({ ...settings, board: 'nulle-part' }, DECKS_IDS)).toBeNull();
  });

  it('en lignes, pour l’invité qui va rejoindre', () => {
    expect(settingsLines(SETTINGS, { 1: 'classique', 2: null })).toEqual([
      'Carte : Champ de bataille (13 × 13)',
      'Mode : Normal',
      'Économie : Classique',
      'Mana : génération max 5, limite 10',
      'Minuteur : 3 minutes de réflexion par tour',
      'Victoire : 30 VP',
      'Deck de l’hôte (J1) : Classique',
    ]);
  });
});

describe('serveur', () => {
  it('créer une partie : les réglages et le deck de l’hôte partent au serveur, qui rend la partie et le jeton', async () => {
    const sent: { url: string; body: unknown }[] = [];
    const post = async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ id: 'abc', token: 't' }), { status: 201 });
    };
    expect(await createOnlineGame(DEFAULT_SETUP, post)).toEqual({ id: 'abc', token: 't' });
    expect(sent).toEqual([{ url: '/api/parties', body: { settings: roomSettingsOf(DEFAULT_SETUP), deck: DEFAULT_SETUP.decks[1].id } }]);
  });

  it('un refus dit sa raison ; un serveur absent est dit tel', async () => {
    const refuse = async () => new Response(JSON.stringify({ error: 'Carte inconnue.' }), { status: 400 });
    expect(await createOnlineGame(DEFAULT_SETUP, refuse)).toEqual({ error: 'Carte inconnue.' });
    const down = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await createOnlineGame(DEFAULT_SETUP, down)).toEqual({ error: SERVER_DOWN });
  });

  it('la connexion se fait sur le même hôte que la page, chiffrée si la page l’est', () => {
    expect(socketUrl('abc', { protocol: 'https:', host: 'tcg.example' })).toBe('wss://tcg.example/api/parties/abc/ws');
    expect(socketUrl('abc', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/api/parties/abc/ws');
  });
});
