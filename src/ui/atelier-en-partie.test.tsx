import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getMonsterCard, getPlayerView } from '../engine';
import { HomeScreen } from './HomeScreen';
import { setupFromQuery, setupToQuery } from './routes';
import { DEFAULT_SETUP, newSession, updateSession } from './session';
import type { Setup } from './session';
import { DEFAULT_SETTINGS } from './settings';
import { TopBar } from './TopBar';
import { WorkshopScreen } from './WorkshopScreen';
import { setField } from './workshop';

// Tester en partie (étape 3 de l'atelier) : à l'accueil, « Cartes de l'atelier » lance une partie avec les réglages de
// l'atelier ; la partie les fixe à son lancement, et le dit en jeu et au journal.

const patches = setField({}, 'clown-assassin', 'atk', 6);
const withWorkshop: Setup = { ...DEFAULT_SETUP, workshop: patches };
const clownAtk = (setup: Setup) => getMonsterCard(newSession(1, setup).game.cards, 'clown-assassin').atk;
const noop = () => {};

describe('une partie avec les cartes de l’atelier', () => {
  it('se joue avec ces cartes ; sans réglage, avec celles d’origine', () => {
    expect(clownAtk(withWorkshop)).toBe(6);
    expect(clownAtk(DEFAULT_SETUP)).toBe(3);
    expect(clownAtk({ ...DEFAULT_SETUP, workshop: {} })).toBe(3);
  });

  it('le journal le dit dès le début, avec les cartes modifiées', () => {
    expect(newSession(1, withWorkshop).log[0]!.text).toContain(', avec les cartes de l’atelier (1 carte modifiée : Clown assassin),');
    expect(newSession(1, DEFAULT_SETUP).log[0]!.text).not.toContain('atelier');
  });

  it('choisir qui commence, puis rejouer, gardent ces cartes', () => {
    const session = newSession(1, withWorkshop, { rolls: [{ 1: 6, 2: 2 }], winner: 1, chosen: null });
    const chosen = updateSession(session, { type: 'chooseFirst', first: 2 });
    expect(getMonsterCard(chosen.game.cards, 'clown-assassin').atk).toBe(6);
    const again = updateSession(chosen, { type: 'restart' });
    expect(getMonsterCard(again.game.cards, 'clown-assassin').atk).toBe(6);
  });

  it('l’adresse du jeu demande les cartes de l’atelier ; leurs réglages, eux, restent dans le navigateur', () => {
    const query = setupToQuery(withWorkshop);
    expect(query).toContain('atelier=1');
    expect(query).not.toContain('clown');
    expect(setupToQuery(DEFAULT_SETUP)).not.toContain('atelier');
    expect(setupFromQuery(query, patches).workshop).toEqual(patches);
    // Plus aucun réglage dans l'atelier : la partie reprend les cartes d'origine.
    expect(setupFromQuery(query, {}).workshop).toBeUndefined();
    expect(setupFromQuery(setupToQuery(DEFAULT_SETUP), patches).workshop).toBeUndefined();
  });
});

describe('à l’accueil', () => {
  const home = (initial: Setup, workshop?: typeof patches) =>
    renderToStaticMarkup(<HomeScreen initial={initial} onStart={noop} workshop={workshop} />);

  it('« De l’atelier » ne se choisit que s’il y a des réglages', () => {
    const html = home(DEFAULT_SETUP);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>De l’atelier<\/button>/);
    expect(html).toContain('L’atelier n’a aucun réglage pour l’instant.');
    const available = home(DEFAULT_SETUP, patches);
    expect(available).not.toMatch(/disabled=""[^>]*>De l’atelier/);
    expect(available).toContain('L’atelier a 1 carte modifiée : Clown assassin.');
  });

  it('choisi, il nomme les cartes modifiées', () => {
    const html = home(withWorkshop, patches);
    expect(html).toMatch(/aria-pressed="true"[^>]*>De l’atelier<\/button>/);
    expect(html).toContain('La partie se joue avec tes réglages de l’atelier : 1 carte modifiée : Clown assassin.');
  });
});

describe('en jeu', () => {
  const topBar = (setup: Setup) =>
    renderToStaticMarkup(
      <TopBar
        view={getPlayerView(newSession(1, setup).game, 1)}
        setup={setup}
        canEndTurn
        onEndTurn={noop}
        helpOpen={false}
        onHelp={noop}
        settings={DEFAULT_SETTINGS}
        boardView="iso"
        isoAvailable
        tiltAvailable
        onSettings={noop}
        onSound={noop}
        onHome={noop}
        pile={null}
        onPile={noop}
      />,
    );

  it('le repère « Atelier » dans la barre du haut, avec les cartes modifiées au survol', () => {
    const html = topBar(withWorkshop);
    expect(html).toContain('class="topbar__workshop" title="Cartes de l’atelier : 1 carte modifiée : Clown assassin"');
    expect(topBar(DEFAULT_SETUP)).not.toContain('topbar__workshop');
  });
});

describe('dans l’atelier, en développement', () => {
  it('« Enregistrer dans le projet » s’il y a des réglages', () => {
    const button = (html: string) => html.match(/<button[^>]*>Enregistrer dans le projet<\/button>/)?.[0] ?? '';
    expect(import.meta.env.DEV).toBe(true);
    expect(button(renderToStaticMarkup(<WorkshopScreen onNavigate={noop} initial={{}} />))).toContain('disabled=""');
    expect(button(renderToStaticMarkup(<WorkshopScreen onNavigate={noop} initial={patches} />))).not.toContain('disabled');
  });
});

describe('dans l’atelier', () => {
  it('« Tester en partie » s’il y a des réglages', () => {
    const button = (html: string) => html.match(/<button[^>]*>(<svg[^]*?<\/svg>)?Tester en partie<\/button>/)?.[0] ?? '';
    expect(button(renderToStaticMarkup(<WorkshopScreen onNavigate={noop} initial={{}} />))).toContain('disabled=""');
    expect(button(renderToStaticMarkup(<WorkshopScreen onNavigate={noop} initial={patches} />))).not.toContain('disabled');
  });
});
