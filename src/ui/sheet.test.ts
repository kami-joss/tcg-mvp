import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView } from '../engine';
import type { GameState } from '../engine';
import { at, gameWith, withStatus } from '../engine/test-utils';
import { canPlay } from './interaction';
import { getSheet } from './sheet';

const cellSheet = (state: GameState, viewer: 1 | 2, row: number, col: number) =>
  getSheet(getPlayerView(state, viewer), { kind: 'cell', pos: at(row, col) });

describe('fiche au survol', () => {
  const state = gameWith([
    { monster: 'chevalier', owner: 1, at: at(8, 1), mobilityLeft: 1 },
    { monster: 'golem', owner: 2, at: at(8, 2), hp: 5 },
  ]);

  it('son propre monstre : pas restants et état du tour', () => {
    const sheet = cellSheet(state, 1, 8, 1);
    expect(sheet?.title).toBe('Chevalier');
    expect(sheet?.stats.map((s) => [s.label, s.value])).toEqual([
      ['ATK', '3'],
      ['PV', '4/4'],
      ['Pas rest.', '1/3'],
      ['Portée', '1'],
    ]);
    expect(sheet?.chips.map((c) => c.text)).toContain('Attaque disponible');
  });

  it('monstre adverse : informations publiques et rappel de sa portée', () => {
    const sheet = cellSheet(state, 1, 8, 2);
    expect(sheet?.type).toBe('Monstre · Joueur 2 (adversaire)');
    expect(sheet?.stats.map((s) => [s.label, s.value])).toContainEqual(['PV', '5/7']);
    expect(sheet?.stats.map((s) => s.label)).toContain('Mobilité');
    expect(sheet?.text.join(' ')).toContain('prochain tour');
    expect(sheet?.chips.map((c) => c.text)).not.toContain('Attaque disponible');
  });

  it('statuts : ce qu’il leur reste à durer, en tours de l’unité touchée', () => {
    const burning = withStatus(withStatus(state, 'u2', 'burn', 1, 2), 'u2', 'immobilise', 0, 0);
    expect(cellSheet(burning, 1, 8, 2)?.chips.map((c) => c.text)).toEqual(
      expect.arrayContaining([
        'Burn 1 : −1 PV au début de chacun de ses tours, pendant ses 2 prochains tours',
        'Immobilisé : ne peut plus bouger jusqu’à son prochain tour',
      ]),
    );
  });

  it('effet actif et mots-clés : écrits avec le lexique', () => {
    const sheet = getSheet(getPlayerView(state, 1), { kind: 'card', cardId: 'dragon-feu' });
    expect(sheet?.keywords).toEqual([{ name: 'Vol', text: 'En se déplaçant, survole les cases X et les falaises de la Scierie (pas celles de la Mine, zone fermée), mais pas les ennemis.' }]);
    expect(sheet?.effect).toEqual({
      head: 'Effet actif · Déflagration · 3 mana',
      text: '3 cases devant · 2 dégâts + burn 1 pendant 1 tour',
    });
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
      traps: [{ owner: 1, pos: at(8, 2), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe' }],
    };
    expect(cellSheet(trapped, 1, 8, 2)?.title).toBe('Ton piège · Bombe');
    expect(cellSheet(trapped, 2, 8, 2)).toBeNull();
  });

  it('carte du grimoire trop chère : il manque du mana', () => {
    const poor = gameWith([], { players: { 1: { mana: 1 } } });
    const sheet = getSheet(getPlayerView(poor, 1), { kind: 'card', cardId: 'golem' });
    expect(sheet?.chips).toEqual([{ text: 'Il te manque 3 mana', tone: 'warn' }]);
  });

  it('mana zone neutre et case bloquée', () => {
    const empty = gameWith([]);
    expect(cellSheet(empty, 1, 5, 4)?.title).toBe('Forge');
    expect(cellSheet(empty, 1, 5, 4)?.chips).toEqual([{ text: 'Neutre : personne ne la tient', tone: 'warn' }]);
    expect(cellSheet(empty, 1, 3, 4)?.title).toBe('Case bloquée');
  });
});

describe('fiche d’un sort déjà lancé ce tour', () => {
  it('le dit, et la tuile n’est plus jouable', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], {
      players: { 1: { mana: 10, grimoire: ['charge', 'charge'] } },
    });
    const after = applyAction(state, { type: 'playCard', cardId: 'charge', target: { kind: 'unit', unitId: 'u1' } });
    const view = getPlayerView(after, 1);
    expect(canPlay(view, 'charge')).toBe(false);
    expect(getSheet(view, { kind: 'card', cardId: 'charge' })?.chips).toContainEqual({
      text: 'Déjà lancé ce tour : un même sort une fois par tour',
      tone: 'warn',
    });
  });
});
