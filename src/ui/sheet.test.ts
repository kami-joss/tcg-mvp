import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_15, applyAction, getPlayerView } from '../engine';
import type { Action, GameState } from '../engine';
import { at, gameWith, withStatus } from '../engine/test-utils';
import { canPlay } from './interaction';
import { cardReason, getSheet, sameSubject, subjectAt } from './sheet';

const cellSheet = (state: GameState, viewer: 1 | 2, row: number, col: number) =>
  getSheet(getPlayerView(state, viewer), { kind: 'cell', pos: at(row, col) });
const END_TURN: Action = { type: 'endTurn' };

describe('fiche (lot 9)', () => {
  const state = gameWith([
    { monster: 'chevalier', owner: 1, at: at(8, 1), mobilityLeft: 1 },
    { monster: 'golem', owner: 2, at: at(8, 2), hp: 5 },
  ]);

  it('son propre monstre : ses stats du moment (pas restants) ; la carte ne dit rien de son état', () => {
    const sheet = cellSheet(state, 1, 8, 1);
    expect(sheet?.title).toBe('Chevalier');
    expect(sheet?.stats.map((s) => [s.label, s.value])).toEqual([
      ['ATK', '3'],
      ['PV', '4/4'],
      ['Pas rest.', '1/3'],
      ['Portée', '1'],
    ]);
    // Ni disponibilité ni statut sur la carte : ils sont au jeton (`unitTip.ts`).
    expect(sheet?.lines).toEqual([]);
    expect(sheet?.text).toEqual([]);
    expect(sheet).not.toHaveProperty('status');
  });

  it('monstre adverse : informations publiques (PV, mobilité de la carte), sans sa menace (au jeton)', () => {
    const sheet = cellSheet(state, 1, 8, 2);
    expect(sheet?.type).toBe('Monstre · Joueur 2 (adversaire)');
    expect(sheet?.stats).toContainEqual({ icon: 'hearts', label: 'PV', value: '5/7', delta: 0, hurt: true });
    expect(sheet?.stats.map((s) => s.label)).toContain('Mobilité');
    expect(sheet?.lines).toEqual([]);
    expect(sheet?.text).toEqual([]);
  });

  it('slow reçu pendant son tour et Charge : la mobilité le montre (pastille)', () => {
    let slowed = withStatus(gameWith([{ monster: 'golem', owner: 1, at: at(8, 1) }]), 'u1', 'slow', 1, 1);
    expect(cellSheet(slowed, 1, 8, 1)?.stats[2]).toEqual({ icon: 'walking-boot', label: 'Pas rest.', value: '1/1', delta: -1, hurt: false });
    slowed = applyAction(applyAction(slowed, END_TURN), END_TURN); // son tour suivant : encore ralenti
    expect(cellSheet(slowed, 1, 8, 1)?.stats[2]).toMatchObject({ value: '1/1', delta: -1 });

    const charged = applyAction(gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], { players: { 1: { mana: 3, grimoire: ['charge'] } } }), {
      type: 'playCard',
      cardId: 'charge',
      target: { kind: 'unit', unitId: 'u1' },
    });
    expect(cellSheet(charged, 1, 8, 1)?.stats[2]).toMatchObject({ value: '4/4', delta: 2 });
  });

  it('effet actif : son coût, sans sa disponibilité (au jeton)', () => {
    const poor = gameWith([{ monster: 'invocateur', owner: 1, at: at(5, 4) }], { players: { 1: { mana: 0 } } });
    expect(cellSheet(poor, 1, 5, 4)?.active[0]).toMatchObject({ cost: 1 });
    expect(cellSheet(poor, 1, 5, 4)?.active[0]).not.toHaveProperty('foot');
  });

  it('effet actif et mots-clés : écrits avec le lexique', () => {
    const sheet = getSheet(getPlayerView(state, 1), { kind: 'card', cardId: 'dragon-feu' });
    expect(sheet?.passive?.items).toEqual([{ name: 'Vol', text: 'En se déplaçant, survole les cases X et les falaises de la Scierie (pas celles de la Mine), mais pas les ennemis.' }]);
    expect(sheet?.active).toEqual([{
      name: 'Lance-flamme',
      cost: 3,
      text: 'Inflige 2 dégâts aux ennemis sur 3 cases en ligne et les 2 cases en diagonale devant lui, dans la direction de ton choix et leur inflige {{burn|burn 2}} pendant 1 tour.',
    }]);
  });

  it('le type de la carte donne le fond de la fiche (rubis, saphir, émeraude) ; rien pour une case vide', () => {
    const view = getPlayerView(gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }, { terrain: 'bastion', owner: 1, at: at(5, 4) }]), 1);
    expect(getSheet(view, { kind: 'card', cardId: 'charge' })?.kind).toBe('spell');
    expect(getSheet(view, { kind: 'card', cardId: 'golem' })?.kind).toBe('monster');
    expect(getSheet(view, { kind: 'cell', pos: at(8, 1) })?.kind).toBe('monster');
    expect(getSheet(view, { kind: 'cell', pos: at(5, 4) })?.kind).toBe('terrain');
    // Un terrain posé sur le plateau montre aussi son illustration, comme un monstre.
    expect(getSheet(view, { kind: 'cell', pos: at(5, 4) })?.art).toEqual({ cardId: 'bastion', owner: 1 });
    expect(getSheet(view, { kind: 'cell', pos: at(2, 4) })?.kind).toBeNull();
  });

  it('un piège n’a de fiche que pour son poseur', () => {
    const trapped: GameState = {
      ...gameWith([]),
      traps: [{ owner: 1, pos: at(8, 2), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe', sourceId: 'u0', expiresAtTurn: 99 }],
    };
    expect(cellSheet(trapped, 1, 8, 2)?.title).toBe('Ton piège · Bombe');
    expect(cellSheet(trapped, 2, 8, 2)).toBeNull();
  });

  it('carte du grimoire trop chère : la fiche n’en dit rien, le grimoire donne la raison', () => {
    const view = getPlayerView(gameWith([], { players: { 1: { mana: 1 } } }), 1);
    expect(getSheet(view, { kind: 'card', cardId: 'golem' })?.lines).toEqual([]);
    expect(cardReason(view, 'golem')).toEqual({ text: 'Il te manque 3 mana', tone: 'warn' });
  });

  it('sort du grimoire : son effet en effet actif (coût en haut de la fiche) ; sans cible, la raison au grimoire', () => {
    const view = getPlayerView(gameWith([], { players: { 1: { mana: 5 } } }), 1);
    const sheet = getSheet(view, { kind: 'card', cardId: 'charge' });
    expect(sheet?.active[0]).toMatchObject({ cost: null, name: null });
    expect(sheet?.cost).toBe(1);
    expect(cardReason(view, 'charge')).toEqual({ text: 'Aucune cible à portée', tone: 'off' });
  });

  it('mana zone neutre et case bloquée', () => {
    const empty = gameWith([]);
    expect(cellSheet(empty, 1, 5, 4)?.title).toBe('Forge');
    expect(cellSheet(empty, 1, 5, 4)?.lines).toEqual([
      { icon: 'crown', label: 'Contrôle', status: { text: 'Neutre · personne', tone: 'off' } },
    ]);
    expect(cellSheet(empty, 1, 3, 4)?.title).toBe('Case bloquée');
  });

  it('cases X hautes et basses du 15 × 15 : leur règle dans la fiche', () => {
    const big = gameWith([], { board: BATTLEFIELD_15 });
    expect(cellSheet(big, 1, 2, 11)).toMatchObject({ title: 'Case bloquée haute', text: ['Infranchissable, même en volant. Coupe tous les tirs.'] });
    expect(cellSheet(big, 1, 11, 2)?.title).toBe('Case bloquée basse');
    expect(cellSheet(big, 1, 11, 2)?.text[0]).toContain('portée 2 ou plus passent par-dessus');
  });

  it('sujet d’une case : l’unité qui s’y trouve (le monstre d’abord), sinon la case ; comparaison', () => {
    const view = getPlayerView(gameWith([{ terrain: 'bastion', owner: 1, at: at(5, 4) }, { monster: 'golem', owner: 1, at: at(5, 4) }]), 1);
    expect(subjectAt(view, at(5, 4))).toEqual({ kind: 'unit', unitId: 'u2' });
    expect(subjectAt(view, at(2, 4))).toEqual({ kind: 'cell', pos: at(2, 4) });
    expect(getSheet(view, { kind: 'unit', unitId: 'u1' })?.title).toBe('Bastion');
    expect(getSheet(view, { kind: 'unit', unitId: 'u9' })).toBeNull();
    expect(sameSubject({ kind: 'cell', pos: at(1, 1) }, { kind: 'cell', pos: at(1, 1) })).toBe(true);
    expect(sameSubject({ kind: 'unit', unitId: 'u1' }, { kind: 'card', cardId: 'golem' })).toBe(false);
    expect(sameSubject(null, null)).toBe(true);
  });
});

describe('fiche d’un sort déjà lancé ce tour', () => {
  it('encore jouable s’il en reste un exemplaire et du mana : pas de limite par tour pour les sorts', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], {
      players: { 1: { mana: 10, grimoire: ['charge', 'charge'] } },
    });
    const after = applyAction(state, { type: 'playCard', cardId: 'charge', target: { kind: 'unit', unitId: 'u1' } });
    const view = getPlayerView(after, 1);
    expect(canPlay(view, 'charge')).toBe(true);
    expect(cardReason(view, 'charge')).toBeNull();
  });
});

describe('fiche : portée des effets actifs', () => {
  it('un monstre du plateau : chaque effet actif porte sa portée, montrée au survol de son bloc ; une carte, non', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { HoverSheet } = await import('./HoverSheet');
    const state = gameWith([{ monster: 'poseur-de-bombe', owner: 1, at: at(5, 4) }]);
    const sheet = getSheet(getPlayerView(state, 1), { kind: 'cell', pos: at(5, 4) })!;
    expect(sheet.active[0]!.reach).toHaveLength(6); // son carré de 1, sans la falaise du plateau classique
    const html = renderToStaticMarkup(createElement(HoverSheet, { sheet, onHoverReach: () => {} }));
    expect(html).toContain('sheet__block--active has-reach');
    const card = getSheet(getPlayerView(state, 1), { kind: 'card', cardId: 'poseur-de-bombe' })!;
    expect(card.active[0]!.reach).toBeUndefined();
  });
});
