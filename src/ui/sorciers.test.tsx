import { describe, expect, it } from 'vitest';
import { applyAction, getCard, getPlayerView } from '../engine';
import type { Action, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { CARD_ART } from './art';
import { cardEffectLine, describeCard } from './cardText';
import { applyEvent } from './fx/patch';
import { clickCell, getHighlights, posKey } from './interaction';
import type { Selection } from './interaction';
import { describeAction } from './log';
import { eventSounds } from './sfx/events';
import { getSheet } from './sheet';
import { getZoneMarks } from './zoneMarks';

// Interface du deck Sorciers du feu (SPEC.md §6 bis) : textes, case brûlée (Lutin brasier), Passage du Golem de lave.

const view = (state: GameState, player: 1 | 2 = 1) => getPlayerView(state, player);
const BURN: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(2, 4) } };
const state = gameWith(
  [
    { monster: 'lutin-brasier', owner: 1, at: at(2, 2) },
    { monster: 'chevalier', owner: 2, at: at(2, 6) },
  ],
  { players: { 1: { mana: 5 } } },
);
const burned = applyAction(state, BURN);

describe('textes des cartes Sorciers du feu', () => {
  it('colonne « Effet » et fiche', () => {
    expect(cardEffectLine(getCard('apprenti'))).toBe('Brûlure 1, 2 tours');
    expect(cardEffectLine(getCard('lutin-brasier'))).toBe(
      'Brûlure 1, 2 tours ; Actif (1 mana) · une case libre, rayon 2 · case brûlée pendant 2 tours : 1 dégât + burn 1 pendant 1 tour',
    );
    expect(cardEffectLine(getCard('archimage'))).toBe('Brûlure 1, 2 tours ; Actif (1 mana) · adjacents · burn 2 pendant 2 tours');
    expect(cardEffectLine(getCard('golem-de-lave'))).toBe('Passage · adjacents · burn 1 pendant 1 tour');
    expect(describeCard(getCard('golem-de-lave'))).toEqual([
      'ATK 2 · PV 8 · Mob. 2 · Portée 1',
      'Archétype Sorciers du feu.',
      'Passif · Passage · adjacents · burn 1 pendant 1 tour : chaque monstre ennemi qui entre sur une des 8 cases autour de lui le subit, à chaque case où il entre (une fois par recul).',
    ]);
  });

  it('les quatre cartes ont leur illustration', () => {
    for (const id of ['apprenti', 'lutin-brasier', 'archimage', 'golem-de-lave'] as const) expect(CARD_ART[id], id).toBeTruthy();
  });
});

describe('Lutin brasier : brûler une case', () => {
  const selection: Selection = { kind: 'unit', unitId: 'u1', mode: 'effect' };

  it('cases violettes, clic', () => {
    const highlights = getHighlights(view(state), selection);
    expect(highlights.get(posKey(at(2, 4)))).toBe('effect');
    expect(highlights.has(posKey(at(2, 5)))).toBe(false);
    expect(clickCell(view(state), selection, at(2, 4))).toEqual({ action: BURN });
  });

  it('journal, animation, son ; marque au sol et fiche visibles des deux joueurs', () => {
    expect(describeAction(view(state), BURN, view(burned))[0]).toBe('Lutin brasier - Sorciers du feu de J1 met le feu sur l’Écurie.');
    const event = view(burned).events.find((e) => e.type === 'cellBurned')!;
    expect(applyEvent(view(state), event, view(burned)).burningCells).toHaveLength(1);
    expect(eventSounds([event]).map(([sound]) => sound)).toEqual(['fire']);
    for (const player of [1, 2] as const) {
      expect(getZoneMarks(view(burned, player)).get(posKey(at(2, 4)))).toEqual([
        expect.objectContaining({ burning: true, icon: 'flame', label: '−1', owner: 1 }),
      ]);
    }
    const sheet = getSheet(view(burned, 2), { kind: 'cell', pos: at(2, 4) })!;
    expect(sheet.title).toBe('Case brûlée');
    expect(sheet.text).toEqual([
      'Chaque monstre ennemi qui y entre subit : 1 dégât + burn 1 pendant 1 tour. La case reste.',
      'Elle brûle jusqu’à la fin de ce tour et des 2 prochains tours de J1.',
    ]);
    const theirTurn = applyAction(burned, { type: 'endTurn' });
    expect(getSheet(view(theirTurn, 2), { kind: 'cell', pos: at(2, 4) })!.text[1]).toBe(
      'Elle brûle jusqu’à la fin du 2e prochain tour de J1.',
    );
  });

  it('un ennemi y entre : le journal le dit', () => {
    const theirs = applyAction(burned, { type: 'endTurn' });
    const step: Action = { type: 'move', unitId: 'u2', to: at(2, 4) };
    expect(describeAction(view(theirs, 2), step, view(applyAction(theirs, step), 2))).toContain(
      'Chevalier de J2 marche dans le feu sur l’Écurie.',
    );
  });
});

describe('Golem de lave : marques de sa zone', () => {
  it('les 8 cases autour de lui, comme un terrain « Passage »', () => {
    const golem = gameWith([{ monster: 'golem-de-lave', owner: 2, at: at(5, 5) }]);
    const marks = getZoneMarks(view(golem));
    expect(marks.get(posKey(at(4, 5)))).toEqual([expect.objectContaining({ sourceId: 'u1', owner: 2, icon: 'flame' })]);
    expect(marks.has(posKey(at(5, 5)))).toBe(false);
  });
});
