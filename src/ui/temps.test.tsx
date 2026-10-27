import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, getCard, getPlayerView } from '../engine';
import type { Action, GameState, Trap } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { CARD_ART, SHEET_FRAME, artFit } from './art';
import { getBubble } from './bubble';
import { cardEffectLine, splitCardName, trapLabel } from './cardText';
import { Grimoire } from './Grimoire';
import { clickCard, clickCell, getHighlights, posKey } from './interaction';
import { describeAction } from './log';
import { getSheet } from './sheet';

// Deck Explorateur du temps dans l'interface : deux effets actifs, retour, sablier, noms « Nom - Archétype ».

const view = (state: GameState, player = state.activePlayer) => getPlayerView(state, player);
const MANA = { players: { 1: { mana: 10 } } };
const walk: Action = { type: 'move', unitId: 'u1', to: at(1, 3), path: [at(1, 2), at(1, 3)] };

describe('noms « Nom - Archétype »', () => {
  it('nom et archétype séparés ; une carte de base n’a pas d’archétype', () => {
    expect(splitCardName(getCard('apprenti').name)).toEqual({ title: 'Apprenti', archetype: 'Sorciers du feu' });
    expect(splitCardName(getCard('apprenti-temps').name)).toEqual({ title: 'Apprenti', archetype: 'Explorateur du temps' });
    expect(splitCardName(getCard('dragon-origine').name)).toEqual({ title: 'Origine', archetype: 'Dragons' });
    expect(splitCardName(getCard('golem').name)).toEqual({ title: 'Golem', archetype: '' });
  });

  it('tuile du grimoire et fiche : le nom, l’archétype en petit dessous', () => {
    const state = gameWith([], { players: { 1: { grimoire: ['maitre-des-heures'] } } });
    const html = renderToStaticMarkup(
      <Grimoire view={view(state)} selectedCard={null} layout="grid2" onLayout={() => {}} onCardClick={() => {}} onCardHover={() => {}} />,
    );
    expect(html).toContain('<span class="tile__name">Maître des heures<small class="tile__archetype">Explorateur du temps</small></span>');
    const sheet = getSheet(view(state), { kind: 'card', cardId: 'maitre-des-heures' })!;
    expect(sheet).toMatchObject({ title: 'Maître des heures', archetype: 'Explorateur du temps' });
    expect(sheet.flavor).toMatch(/^Un ancien explorateur/);
  });

  it('illustrations du deck (tuile, fiche, jeton), cadrées sur les yeux ou le point d’intérêt', () => {
    expect(CARD_ART['apprenti-temps']).toMatchObject({ w: 576, h: 1024, eye: [50.6, 11.2] });
    expect(CARD_ART.chronomancienne).toMatchObject({ w: 576, h: 1024, eye: [48.2, 20.2], face: 22 });
    expect(CARD_ART['maitre-des-heures']).toMatchObject({ w: 576, h: 1024, eye: [55.6, 20.8], face: 22 });
    expect(CARD_ART['dragonnet-temps']).toMatchObject({ w: 576, h: 1024, eye: [64.6, 40.3], face: 24 });
    expect(CARD_ART['piege-temporel']).toMatchObject({ w: 576, h: 1024, eye: [49.6, 13] });
    expect(CARD_ART['fissure-temporelle']).toMatchObject({ w: 576, h: 1024, eye: [51, 13] });
    // Sorts et terrains en 9:16 : l'image couvre toute la fiche, sans bande floue en bas.
    for (const id of ['piege-temporel', 'fissure-temporelle'] as const) expect(artFit(CARD_ART[id]!, SHEET_FRAME).edge).toBeGreaterThanOrEqual(99.5);
    const ids = ['apprenti-temps', 'chronomancienne', 'dragonnet-temps', 'maitre-des-heures', 'piege-temporel', 'fissure-temporelle'] as const;
    const state = gameWith([], { players: { 1: { grimoire: [...ids] } } });
    const html = renderToStaticMarkup(
      <Grimoire view={view(state)} selectedCard={null} layout="grid2" onLayout={() => {}} onCardClick={() => {}} onCardHover={() => {}} />,
    );
    for (const id of ids) expect(html).toContain(`${id}.jpg`);
  });
});

describe('effets actifs multiples et retour', () => {
  const state = gameWith(
    [
      { monster: 'dragonnet-temps', owner: 1, at: at(1, 1) },
      { monster: 'golem', owner: 2, at: at(1, 4) },
    ],
    MANA,
  );
  const moved = applyAction(state, walk);

  it('texte de la carte : un effet actif par partie', () => {
    expect(cardEffectLine(getCard('dragonnet-temps'))).toBe(
      'Actif (1 mana) · retour ; Actif (2 mana) · un ennemi adjacent · stun pendant 1 tour',
    );
  });

  it('bulle de ses effets : une ligne par effet, chacune avec sa disponibilité', () => {
    const fresh = getBubble(view(state), { kind: 'effects', unitId: 'u1', page: 'effects' })!;
    expect(fresh.rows.map((r) => [r.title, r.cost, r.enabled])).toEqual([
      ['Retour', 1, false],
      ['Stun', 2, false],
    ]);
    expect(fresh.rows[0]!.subtitle).toBe('Aucune case où revenir : il n’a pas bougé ce tour');
    const after = getBubble(view(moved), { kind: 'effects', unitId: 'u1', page: 'effects' })!;
    expect(after.rows.map((r) => r.enabled)).toEqual([true, true]);
    expect(after.rows[0]!.pick).toEqual({ selection: { kind: 'unit', unitId: 'u1', mode: 'effect' } });
    expect(after.rows[1]!.pick).toEqual({ selection: { kind: 'unit', unitId: 'u1', mode: 'effect', effect: 1 } });
  });

  it('retour : les cases de son chemin en violet ; un clic l’y ramène', () => {
    const selection = { kind: 'unit', unitId: 'u1', mode: 'effect' } as const;
    expect([...getHighlights(view(moved), selection)]).toEqual([
      [posKey(at(1, 1)), 'effect'],
      [posKey(at(1, 2)), 'effect'],
    ]);
    expect(clickCell(view(moved), selection, at(1, 1))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(1, 1) } },
    });
    // Second effet : seulement l'ennemi adjacent.
    const stun = { ...selection, effect: 1 } as const;
    expect([...getHighlights(view(moved), stun)]).toEqual([[posKey(at(1, 4)), 'effect']]);
  });

  it('journal du retour, fiche des deux effets', () => {
    const back: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(1, 1) } };
    expect(describeAction(view(moved), back, view(applyAction(moved, back)))[0]).toBe(
      'Dragonnet - Explorateur du temps de J1 revient dans le temps en (1, 1).',
    );
    const sheet = getSheet(view(moved), { kind: 'cell', pos: at(1, 3) })!;
    expect(sheet.active.map((a) => [a.name, a.cost, a.foot?.text])).toEqual([
      ['Retour', 1, 'Disponible'],
      ['Stun', 2, 'Disponible'],
    ]);
  });
});

describe('sablier de la Chronomancienne', () => {
  it('nom du piège, journal de l’ennemi qui remonte le temps', () => {
    const trap: Trap = { owner: 1, pos: at(1, 4), effects: [{ type: 'rewind', steps: 3 }], cardId: 'chronomancienne' };
    expect(trapLabel(trap)).toBe('Sablier');
    const state = { ...gameWith([{ monster: 'apprenti-temps', owner: 2, at: at(1, 8), mobilityLeft: 5 }], { activePlayer: 2 }), traps: [trap] };
    const hit: Action = { type: 'move', unitId: 'u1', to: at(1, 3), path: [at(1, 7), at(1, 6), at(1, 5), at(1, 4), at(1, 3)] };
    const lines = describeAction(view(state, 2), hit, view(applyAction(state, hit), 2));
    expect(lines).toContain(
      'Apprenti - Explorateur du temps de J2 déclenche un sablier : il remonte le temps en (1, 7) et ne peut plus bouger de ce tour.',
    );
  });
});

describe('Piège temporel', () => {
  it('les ennemis en doré ; un clic sur l’un d’eux lance le sort', () => {
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(5, 4) }, { monster: 'chevalier', owner: 1, at: at(1, 1) }], {
      players: { 1: { mana: 5, grimoire: ['piege-temporel'] } },
    });
    const selection = clickCard(view(state), { kind: 'none' }, 'piege-temporel');
    expect([...getHighlights(view(state), selection)]).toEqual([[posKey(at(5, 4)), 'target']]);
    expect(clickCell(view(state), selection, at(5, 4))).toEqual({
      action: { type: 'playCard', cardId: 'piege-temporel', target: { kind: 'all' } },
    });
  });
});
