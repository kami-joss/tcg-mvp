import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, createGame, getPlayerView } from '../engine';
import { initialOnlineState, onlineReducer } from '../online/client';
import type { OnlineEvent, OnlineState } from '../online/client';
import type { RoomSettings, ServerMessage } from '../online/protocol';
import { DiceScreen } from './DiceScreen';
import { HomeScreen } from './HomeScreen';
import { LEAVE_WARNING, OnlineView } from './OnlineScreen';
import { OptionsMenu } from './OptionsMenu';
import { boardSlug, onlineRoomOf, onlineUrl, pageOf, setupFromQuery, setupToQuery } from './routes';
import { DEFAULT_SETUP } from './session';
import { DEFAULT_SETTINGS } from './settings';

// Écran d'une partie en ligne (SPEC.md §7 ter) : la page /partie/<id>, l'option « Joueur 2 : en ligne » de l'accueil,
// « Abandonner » dans les options.

const SETTINGS: RoomSettings = { board: boardSlug(BATTLEFIELD_13), mode: 'normal', economy: 'classic', manaRules: { baseCap: 5, limit: 10 }, timer: true };
const noop = () => {};
const LINK = 'https://tcg.example/partie/abcdefghijkm';
const run = (...messages: ServerMessage[]): OnlineState =>
  [{ type: 'opened' } as OnlineEvent, ...messages.map((message): OnlineEvent => ({ type: 'message', message }))].reduce(onlineReducer, initialOnlineState('abcdefghijkm'));
const render = (state: OnlineState) => renderToStaticMarkup(<OnlineView state={state} send={noop} link={LINK} onHome={noop} onReload={noop} />);
const lobby: ServerMessage = { type: 'lobby', settings: SETTINGS, decks: { 1: 'classique', 2: null } };

describe('la page d’une partie en ligne', () => {
  it('l’adresse /partie/<id> ; le lien d’invitation', () => {
    expect(pageOf('/partie/abcdefghijkm')).toBe('online');
    expect(onlineRoomOf('/tcg/partie/abcdefghijkm', '/tcg/')).toBe('abcdefghijkm');
    expect(onlineRoomOf('/game')).toBeNull();
    expect(onlineUrl('abcdefghijkm', '/tcg/')).toBe('/tcg/partie/abcdefghijkm');
  });

  it('l’hôte attend son invité : le lien à copier et les réglages', () => {
    const html = render(run({ type: 'welcome', seat: 1, token: 't' }, lobby));
    expect(html).toContain('En attente de ton adversaire');
    expect(html).toContain(`value="${LINK}"`);
    expect(html).toContain('Copier le lien');
    expect(html).toContain('<li>Minuteur : 3 minutes de réflexion par tour</li>');
  });

  it('l’invité voit les réglages de l’hôte, choisit son deck et rejoint', () => {
    const html = render(run(lobby));
    expect(html).toContain('Rejoindre la partie');
    expect(html).toContain('<li>Deck de l’hôte (J1) : Classique</li>');
    expect(html).toMatch(/name="deck-invite" value="vampire"/);
    // Sans connexion ouverte, le bouton attend.
    const closed = onlineReducer(run(lobby), { type: 'closed' });
    expect(render(closed)).toMatch(/disabled=""[^>]*>[^]*Rejoindre la partie/);
  });

  it('les erreurs : lien déjà utilisé, jeu mis à jour (recharger), partie introuvable', () => {
    expect(render(run({ type: 'error', code: 'full', text: 'Ce lien a déjà servi.' }))).toContain('Lien déjà utilisé');
    const version = render(run({ type: 'error', code: 'version', text: 'Le jeu a été mis à jour : recharge la page.' }));
    expect(version).toContain('Recharger la page');
    expect(render(onlineReducer(initialOnlineState('x'), { type: 'notFound' }))).toContain('Partie introuvable');
  });

  it('les dés : seul le gagnant choisit, l’autre attend', () => {
    const opening = { rolls: [{ 1: 5, 2: 2 }], winner: 1, chosen: null } as const;
    expect(renderToStaticMarkup(<DiceScreen opening={opening} seat={1} onChoose={noop} onReady={noop} />)).toContain('J1 commence');
    const waiting = renderToStaticMarkup(<DiceScreen opening={opening} seat={2} onChoose={noop} onReady={noop} />);
    expect(waiting).toContain('ton adversaire choisit qui commence');
    expect(waiting).not.toContain('J1 commence');
  });

  it('la partie : l’écran de jeu, avec le temps du serveur et le bandeau de l’adversaire déconnecté', () => {
    const game: ServerMessage = {
      type: 'state',
      seq: 3,
      settings: SETTINGS,
      decks: { 1: 'classique', 2: 'classique' },
      view: getPlayerView(createGame(), 2),
      log: [],
      clock: { id: 3, spent: 60_000, running: true },
      opponentConnected: false,
    };
    const html = render(run(game));
    expect(html).toContain('data-scene');
    expect(html).toContain('aria-label="Temps de réflexion restant : 2:00"');
    expect(html).toContain('<div class="game__banner" role="status">Ton adversaire s’est déconnecté : ses tours passeront à la fin de son temps.</div>');
  });
});

describe('les options d’une partie en ligne', () => {
  const menu = (onConcede?: () => void, homeWarning?: string) =>
    renderToStaticMarkup(
      <OptionsMenu
        settings={DEFAULT_SETTINGS}
        boardView="iso"
        isoAvailable
        tiltAvailable
        onChange={noop}
        onSound={noop}
        confirmHome
        onHome={noop}
        onConcede={onConcede}
        homeWarning={homeWarning}
        initialOpen
      />,
    );

  it('« Abandonner la partie » seulement en ligne ; « Nouvelle partie » dit que la partie continue sans lui', () => {
    expect(menu(noop, LEAVE_WARNING)).toContain('Abandonner la partie');
    expect(menu()).not.toContain('Abandonner la partie');
    expect(LEAVE_WARNING).toContain('Elle continue sans toi');
  });
});

describe('à l’accueil : « Joueur 2 : en ligne »', () => {
  const home = (online: boolean) => renderToStaticMarkup(<HomeScreen initial={{ ...DEFAULT_SETUP, online }} onStart={noop} />);

  it('le deck de J2 se choisit par l’invité ; le bouton crée la partie en ligne ; cartes d’origine', () => {
    const html = home(true);
    expect(html).toMatch(/aria-pressed="true"[^>]*>En ligne<\/button>/);
    expect(html).toContain('Ton adversaire choisit son deck en arrivant par le lien');
    expect(html).not.toContain('name="deck-j2"');
    expect(html).toContain('Créer la partie en ligne');
    expect(html).toContain('En ligne, la partie se joue avec les cartes d’origine pour l’instant.');
    expect(home(false)).toContain('name="deck-j2"');
  });

  it('l’erreur d’une création qui échoue s’affiche sous le bouton', () => {
    const html = renderToStaticMarkup(<HomeScreen initial={{ ...DEFAULT_SETUP, online: true }} onStart={noop} error="Le serveur ne répond pas." />);
    expect(html).toContain('<p class="home__error" role="alert">Le serveur ne répond pas.</p>');
  });

  it('l’accueil se souvient du choix', () => {
    expect(setupFromQuery(setupToQuery({ ...DEFAULT_SETUP, online: true })).online).toBe(true);
    expect(setupFromQuery(setupToQuery(DEFAULT_SETUP)).online).toBeUndefined();
  });
});
