import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, DECKS, getPlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { Legend } from './Legend';
import { ManaOrb, ORB_FULL_MANA } from './ManaOrb';
import { OptionsMenu } from './OptionsMenu';
import type { PileSelection } from './piles';
import { DEFAULT_SETTINGS } from './settings';
import { TopBar } from './TopBar';

// Haut de l'écran (encoche des scores, refonte du 2026-11-11), menu d'options et aide (handoff V11, lot 12 §2, lot 13 §5).

const decks = { 1: DECKS.find((d) => d.id === 'archers')!, 2: DECKS.find((d) => d.id === 'pieges')! };
const setup = { board: BATTLEFIELD_13, decks };
const state = gameWith([], { activePlayer: 2, players: { 1: { mana: 4, vp: 12 }, 2: { mana: 7, vp: 3 } } });
const noop = () => {};

const topBar = (helpOpen = false, pile: PileSelection | null = null, game = state) =>
  renderToStaticMarkup(
    <TopBar
      view={getPlayerView(game, 2)}
      setup={setup}
      canEndTurn
      onEndTurn={noop}
      helpOpen={helpOpen}
      onHelp={noop}
      settings={DEFAULT_SETTINGS}
      boardView="iso"
      isoAvailable
      tiltAvailable
      onSettings={noop}
      onSound={noop}
      onHome={noop}
      pile={pile}
      onPile={noop}
    />,
  );

describe('barre du haut', () => {
  it('J1 · « Fin du tour » · J2, à places fixes, quel que soit le joueur qui regarde', () => {
    const html = topBar();
    const j1 = html.indexOf('aria-label="Joueur 1"');
    const end = html.indexOf('Fin du tour');
    const j2 = html.indexOf('aria-label="Joueur 2"');
    expect(j1).toBeGreaterThan(0);
    expect(j1).toBeLessThan(end);
    expect(end).toBeLessThan(j2);
    expect(html).toContain('class="score score--p2 is-active"');
    expect(html).toContain('class="score score--p1"');
  });

  it('chaque score : mana (data-mana), nom, deck, VP sur 30 (data-vp)', () => {
    const html = topBar();
    expect(html).toContain('data-mana="1"');
    expect(html).toMatch(/data-mana="1"[^>]*>4</);
    expect(html).toMatch(/data-mana="2"[^>]*>7</);
    expect(html).toContain('<span data-vp="1">12</span><small>/30 VP</small>');
    expect(html).toContain('<span class="score__deck">Archers impériaux</span>');
    expect(html).toContain('<span class="score__deck">Maîtres des pièges</span>');
  });

  it('chaque score : sous le nom, les compteurs « Plateau » et « Cimetière », à leur nom (§10)', () => {
    const game = gameWith([{ monster: 'milicien', owner: 1, at: at(0, 4) }], {
      activePlayer: 2,
      players: { 1: { graveyard: [{ cardId: 'charge' }] } },
    });
    const html = topBar(false, { player: 1, pile: 'graveyard' }, game);
    expect(html).toContain('aria-label="Sur le plateau (J1) : 1"');
    expect(html).toContain('aria-pressed="true" aria-label="Cimetière de J1 : 1"');
    expect(html).toContain('aria-pressed="false" aria-label="Sur le plateau (J2) : 0"');
    expect(html).toContain('aria-pressed="false" aria-label="Cimetière de J2 : 0"');
    expect(html).toContain('<span class="score__pile-label">Plateau</span>');
    expect(html).toContain('<span class="score__pile-label">Cimetière</span>');
    expect(html.indexOf('Sur le plateau (J1)')).toBeLessThan(html.indexOf('data-vp="1"'));
    expect(html.indexOf('Cimetière de J1')).toBeLessThan(html.indexOf('Fin du tour'));
  });

  it('l’encoche : « Tour N » au-dessus de « Fin du tour », « À toi » au joueur qui joue, barre de progression des VP', () => {
    const html = topBar();
    expect(html).toContain('<div class="notch">');
    expect(html.indexOf('Tour 2')).toBeLessThan(html.indexOf('Fin du tour'));
    expect(html.match(/score__tag/g)).toHaveLength(1);
    expect(html).toMatch(/score--p2 is-active"[^]*?<span class="score__tag">À toi<\/span>/);
    // 12 VP sur 30 : 40 % ; 3 sur 30 : 10 %.
    expect(html).toContain('style="width:40%"');
    expect(html).toContain('style="width:10%"');
  });

  it('plus rien à jouer : « Fin du tour » s’illumine', () => {
    const done = gameWith([], { activePlayer: 2, players: { 2: { grimoire: [] } } });
    expect(getPlayerView(done, 2).legalActions.map((action) => action.type)).toEqual(['endTurn']);
    expect(topBar(false, null, done)).toContain('class="btn btn--end-turn is-only"');
    // Encore des cartes à jouer : le bouton reste calme.
    expect(topBar()).toContain('class="btn btn--end-turn"');
  });

  it('au tour de l’adversaire (IA, en ligne) : « Joueur N joue » à la place de « Fin du tour », et « Joue » à son nom', () => {
    const html = renderToStaticMarkup(
      <TopBar
        view={getPlayerView(state, 1)}
        setup={setup}
        canEndTurn={false}
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
    expect(html).toContain('is-waiting');
    expect(html).toContain('Joueur 2 joue');
    expect(html).not.toContain('Fin du tour');
    expect(html).toContain('<span class="score__tag">Joue</span>');
  });

  it('à droite : l’icône de l’aide (allumée quand elle est ouverte), la roue des options fermée', () => {
    expect(topBar()).toContain('Tour 2');
    expect(topBar()).toContain('class="topbar__icon-btn btn--help" aria-pressed="false"');
    expect(topBar(true)).toContain('class="topbar__icon-btn btn--help" aria-pressed="true"');
    expect(topBar()).toContain('aria-expanded="false" title="Options"');
    expect(topBar()).not.toContain('options__panel');
  });
});

describe('menu d’options', () => {
  const menu = (iso = true, tilt = true) =>
    renderToStaticMarkup(
      <OptionsMenu
        settings={DEFAULT_SETTINGS}
        boardView="iso"
        isoAvailable={iso}
        tiltAvailable={tilt}
        onChange={noop}
        onSound={noop}
        confirmHome
        onHome={noop}
        initialOpen
      />,
    );

  it('tous les réglages : vue, zoom, stats des jetons, son et volume, animations, nouvelle partie ; plus de plateau tourné', () => {
    const html = menu();
    for (const label of ['Dessus', 'Inclinée 45°', 'Isométrique', 'Zoom', '100 %', 'Stats sur les jetons', 'Son', 'Volume', 'Animations', 'Défilement aux bords', 'Quadrillage du plateau', 'Nouvelle partie']) {
      expect(html, label).toContain(label);
    }
    // Même angle pour les deux joueurs (validé) : le plateau ne se retourne plus.
    expect(html).not.toContain('Plateau tourné');
    expect(html).toContain('<button type="button" aria-pressed="true">Isométrique</button>');
    // Cinq stats, les animations, le défilement aux bords et le quadrillage ; plus de réglage du rendu PixiJS (le 15 × 15
    // l'est toujours).
    expect(html.match(/type="checkbox"/g)).toHaveLength(8);
    expect(html).not.toContain('PixiJS');
    expect(html).toContain('Maintiens Alt pour tout afficher');
    // Un calque transparent sous le panneau : un clic dehors le ferme.
    expect(html).toContain('options__backdrop');
  });

  it('cinq stats sur les jetons, cochées selon le choix', () => {
    const html = menu();
    for (const label of ['PV', 'Mobilité restante (mes monstres)', 'Mobilité (adversaire)', 'Attaque', 'Statuts (burn, slow…)']) {
      expect(html).toContain(label);
    }
    // 3 stats par défaut, plus animations et quadrillage ; le défilement aux bords est désactivé par défaut.
    expect(html.match(/checked=""/g)).toHaveLength(5);
  });

  it('sans décor, pas de vue isométrique ; sur le 15 × 15 (PixiJS), pas de vue inclinée', () => {
    expect(menu(false)).not.toContain('Isométrique');
    expect(menu(true, false)).not.toContain('Inclinée 45°');
    expect(menu(true, false)).toContain('Isométrique');
  });
});

describe('aide', () => {
  it('panneau d’aide sans réglages (ils sont dans les options)', () => {
    const html = renderToStaticMarkup(<Legend onClose={noop} />);
    expect(html).toContain('Commandes');
    expect(html).not.toContain('Réglages');
    expect(html).not.toContain('type="checkbox"');
  });
});

describe('orbe de mana (lot 12 §3)', () => {
  const orb = (mana: number, active = true, animated = true) =>
    renderToStaticMarkup(<ManaOrb player={1} mana={mana} active={active} animated={animated} />);

  it('le liquide monte avec le mana, pleine à 10 (les terrains peuvent le dépasser) ; le chiffre porte data-mana', () => {
    expect(ORB_FULL_MANA).toBe(10);
    expect(orb(4)).toContain('style="height:40.0%"');
    expect(orb(13)).toContain('style="height:100.0%"');
    expect(orb(0)).toContain('style="height:0.0%"');
    expect(orb(13)).toContain('<div class="orb__value" data-mana="1">13</div>');
    expect(orb(4)).toContain('data-burst="1"');
  });

  it('joueur qui joue : halo qui respire, brume dense ; sans mana, ni bulles ni brume visible', () => {
    expect(orb(4)).toContain('class="orb orb--anim is-active"');
    expect(orb(4).match(/orb__bubble/g)).toHaveLength(5);
    expect(orb(4).match(/orb__puff/g)).toHaveLength(5);
    expect(orb(4)).toContain('--o:0.75');
    expect(orb(4, false)).toContain('--o:0.22');
    expect(orb(0)).not.toContain('orb__bubble');
    expect(orb(0)).toContain('--o:0');
  });

  it('animations coupées : ni vague animée, ni bulles, ni brume', () => {
    const html = orb(4, true, false);
    expect(html).toContain('class="orb is-active"');
    expect(html).not.toContain('orb__bubble');
    expect(html).not.toContain('orb__mist');
  });
});
