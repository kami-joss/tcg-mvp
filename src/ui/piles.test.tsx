import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView } from '../engine';
import type { Action, CardId, GameState, PlayerView, Position } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { PileCounters, PilePanel } from './CardPiles';
import { pileEntries, pileOf, pileTitle, togglePile } from './piles';
import type { PileSelection } from './piles';
import { getSheet, sameSubject } from './sheet';

// Sur le plateau et cimetière de chaque joueur (SPEC.md §10) : compteurs, panneau, fiche ; rien de caché (une unité
// adverse camouflée compte sur le plateau, par sa carte seulement).

const noop = () => {};
const onCell = (cardId: CardId, pos: Position): Action => ({ type: 'playCard', cardId, target: { kind: 'cell', pos } });

/**
 * J1 joue un Archer de glace brillant, puis un normal, puis Charge ; son premier archer est détruit au tour de J2.
 * J2 invoque un Farceur brillant, loin de J1 : il est camouflé.
 */
function game(): GameState {
  let state = gameWith([{ monster: 'golem', owner: 2, at: at(1, 3) }], {
    players: {
      1: { mana: 20, grimoire: ['archer-de-glace', 'archer-de-glace', 'charge', 'bastion'], shiny: ['archer-de-glace'] },
      2: { mana: 20, grimoire: ['farceur', 'golem', 'zoldik'], shiny: ['farceur'] },
    },
  });
  state = applyAction(state, onCell('archer-de-glace', at(0, 3)));
  state = applyAction(state, onCell('archer-de-glace', at(0, 5)));
  state = applyAction(state, { type: 'playCard', cardId: 'charge', target: { kind: 'unit', unitId: 'u3' } });
  state = applyAction(state, { type: 'endTurn' });
  state = applyAction(state, onCell('farceur', at(10, 4)));
  // Le Golem de J2 détruit l'archer brillant (u2 : 3 PV) d'une attaque de 4.
  return applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false });
}

const panel = (view: PlayerView, selection: PileSelection, focused: number | null = null) =>
  renderToStaticMarkup(
    <PilePanel
      view={view}
      selection={selection}
      onSelect={noop}
      onClose={noop}
      focused={focused}
      onCopyClick={noop}
      onCopyHover={noop}
    />,
  );

describe('listes publiques (§10)', () => {
  const state = game();

  it('sur le plateau et cimetière de chaque joueur, lus dans la vue de celui qui regarde', () => {
    const j2 = getPlayerView(state, 2);
    expect(pileOf(j2, 1, 'board')).toEqual([{ cardId: 'archer-de-glace' }]);
    expect(pileOf(j2, 1, 'graveyard')).toEqual([{ cardId: 'charge' }, { cardId: 'archer-de-glace', shiny: true }]);
    expect(pileOf(j2, 2, 'board')).toEqual([{ cardId: 'golem' }, { cardId: 'farceur', shiny: true }]);
    expect(pileOf(j2, 2, 'graveyard')).toEqual([]);
  });

  it('une unité adverse cachée compte sur le plateau, par sa carte, jamais brillante', () => {
    const j1 = getPlayerView(state, 1);
    expect(j1.hiddenEnemies).toHaveLength(1);
    expect(pileOf(j1, 2, 'board')).toEqual([{ cardId: 'golem' }, { cardId: 'farceur' }]);
  });

  it('une tuile par exemplaire, la plus récente en premier, avec son rang dans la liste', () => {
    expect(pileEntries(getPlayerView(state, 1), 1, 'graveyard')).toEqual([
      { copy: { cardId: 'archer-de-glace', shiny: true }, index: 1 },
      { copy: { cardId: 'charge' }, index: 0 },
    ]);
  });

  it('compteurs : un clic ouvre la liste, un second clic sur le même compteur la referme', () => {
    const board = { player: 2, pile: 'board' } as const;
    expect(togglePile(null, board)).toEqual(board);
    expect(togglePile(board, board)).toBeNull();
    expect(togglePile(board, { player: 2, pile: 'graveyard' })).toEqual({ player: 2, pile: 'graveyard' });
    expect(togglePile(board, { player: 1, pile: 'board' })).toEqual({ player: 1, pile: 'board' });
    expect(pileTitle(2, 'board', 5)).toBe('Sur le plateau (J2) : 5');
    expect(pileTitle(1, 'graveyard', 0)).toBe('Cimetière de J1 : 0');
  });
});

describe('compteurs dans le score (§10)', () => {
  const view = getPlayerView(game(), 1);

  it('deux compteurs, chacun avec son nom écrit : sur le plateau puis cimetière ; celui de la liste ouverte est enfoncé', () => {
    const html = renderToStaticMarkup(<PileCounters view={view} player={1} open="graveyard" onOpen={noop} />);
    expect(html.indexOf('score__pile--board')).toBeLessThan(html.indexOf('score__pile--graveyard'));
    expect(html).toMatch(/class="score__pile score__pile--board" aria-pressed="false" aria-label="Sur le plateau \(J1\) : 1"[^>]*>.*?<\/svg><b>1<\/b><span class="score__pile-label">Plateau<\/span><\/button>/);
    expect(html).toMatch(/class="score__pile score__pile--graveyard" aria-pressed="true" aria-label="Cimetière de J1 : 2"[^>]*>.*?<\/svg><b>2<\/b><span class="score__pile-label">Cimetière<\/span><\/button>/);
  });

  it('ceux de l’adversaire comptent ses unités, même un monstre camouflé', () => {
    const html = renderToStaticMarkup(<PileCounters view={view} player={2} open={null} onOpen={noop} />);
    expect(html).toContain('aria-label="Sur le plateau (J2) : 2"');
    expect(html).toContain('aria-label="Cimetière de J2 : 0"');
    expect(html).not.toContain('aria-pressed="true"');
  });
});

describe('panneau sur le plateau et cimetière (§10)', () => {
  const state = game();

  it('le joueur, deux onglets avec leur nombre (celui de la liste ouverte enfoncé), la croix', () => {
    const html = panel(getPlayerView(state, 2), { player: 1, pile: 'board' });
    expect(html).toContain('aria-label="Cartes de J1"');
    expect(html).toContain('Joueur 1');
    expect(html).toMatch(/aria-pressed="true">.*?<\/svg>Plateau<span class="panel__count">1<\/span>/);
    expect(html).toMatch(/aria-pressed="false">.*?<\/svg>Cimetière<span class="panel__count">2<\/span>/);
    expect(html).toContain('title="Fermer (Échap)"');
  });

  it('une tuile par exemplaire, la plus récente en premier, sans nombre d’exemplaires ni état jouable', () => {
    const html = panel(getPlayerView(state, 2), { player: 1, pile: 'graveyard' });
    const tiles = [...html.matchAll(/class="(tile [^"]*)"/g)].map((match) => match[1]);
    expect(tiles).toHaveLength(2);
    expect(tiles.every((classes) => classes!.includes('tile--pile') && !classes!.includes('tile--playable'))).toBe(true);
    expect(html.indexOf('Archer de glace')).toBeLessThan(html.indexOf('Charge'));
    expect(html).not.toMatch(/×\d/);
    expect(html).not.toContain('aria-disabled');
    // Aucune tuile ne sert de repère à la carte qui s'envole du grimoire.
    expect(html).not.toContain('data-card');
  });

  it('l’exemplaire brillant l’est sur sa tuile (cadre, ★), pas l’autre', () => {
    const html = panel(getPlayerView(state, 2), { player: 1, pile: 'graveyard' });
    expect(html.match(/tile--shiny/g)).toHaveLength(1);
    expect(html.match(/★/g)).toHaveLength(1);
  });

  it('la tuile que montre la fiche est marquée', () => {
    const html = panel(getPlayerView(state, 1), { player: 1, pile: 'graveyard' }, 0);
    expect(html.match(/is-focused/g)).toHaveLength(1);
  });

  it('liste vide : une phrase', () => {
    expect(panel(getPlayerView(state, 1), { player: 2, pile: 'graveyard' })).toContain('Le cimetière est vide.');
  });

  it('rien de caché : ni le grimoire adverse, ni l’exemplaire brillant d’un monstre camouflé, ni sa case', () => {
    const view = getPlayerView(state, 1);
    expect(view.hiddenEnemies).toHaveLength(1);
    const html = panel(view, { player: 2, pile: 'board' });
    expect(html).toContain('Farceur');
    expect(html).toContain('Golem');
    expect(html).not.toContain('tile--shiny');
    expect(html).not.toContain('★');
    expect(html).not.toMatch(/Zoldik/);
    expect(html).not.toMatch(/\(10, 4\)|data-cell/);
    // Son propriétaire, lui, le voit brillant.
    expect(panel(getPlayerView(state, 2), { player: 2, pile: 'board' })).toContain('tile--shiny');
  });
});

describe('fiche d’une carte des listes (§10)', () => {
  const state = game();
  const subject = (player: 1 | 2, pile: 'board' | 'graveyard', index: number) => ({ kind: 'copy', player, pile, index }) as const;

  it('la carte seule : coût, stats et effets, sans ligne pour la jouer', () => {
    const sheet = getSheet(getPlayerView(state, 2), subject(1, 'board', 0))!;
    expect(sheet).toMatchObject({ title: 'Archer de glace', archetype: 'Archers', kind: 'monster', cost: 3, shiny: false, lines: [] });
    expect(sheet.stats.map((s) => s.label)).toEqual(['ATK', 'PV', 'Mobilité', 'Portée']);
    expect(sheet.passive).not.toBeNull();
  });

  it('brillante si l’exemplaire l’est, quel que soit le grimoire de celui qui regarde', () => {
    expect(getSheet(getPlayerView(state, 2), subject(1, 'graveyard', 1))?.shiny).toBe(true);
    expect(getSheet(getPlayerView(state, 1), subject(2, 'board', 1))?.shiny).toBe(false);
    expect(getSheet(getPlayerView(state, 2), subject(2, 'board', 1))?.shiny).toBe(true);
  });

  it('un rang hors de la liste n’a pas de fiche ; deux exemplaires différents sont deux sujets', () => {
    expect(getSheet(getPlayerView(state, 1), subject(2, 'graveyard', 0))).toBeNull();
    expect(sameSubject(subject(1, 'board', 0), subject(1, 'board', 0))).toBe(true);
    expect(sameSubject(subject(1, 'board', 0), subject(1, 'board', 1))).toBe(false);
    expect(sameSubject(subject(1, 'board', 0), subject(1, 'graveyard', 0))).toBe(false);
    expect(sameSubject(subject(1, 'board', 0), { kind: 'card', cardId: 'archer-de-glace' })).toBe(false);
  });
});
