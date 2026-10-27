import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView } from '../engine';
import type { Action, GameState } from '../engine';
import { at, gameWith, withStatus } from '../engine/test-utils';
import { canPlay } from './interaction';
import { getSheet, sameSubject, subjectAt } from './sheet';
import type { SheetData } from './sheet';

const cellSheet = (state: GameState, viewer: 1 | 2, row: number, col: number) =>
  getSheet(getPlayerView(state, viewer), { kind: 'cell', pos: at(row, col) });
const END_TURN: Action = { type: 'endTurn' };
const chipTexts = (sheet: SheetData | null) => sheet?.status?.map((c) => c.text) ?? [];

describe('fiche (lot 9)', () => {
  const state = gameWith([
    { monster: 'chevalier', owner: 1, at: at(8, 1), mobilityLeft: 1 },
    { monster: 'golem', owner: 2, at: at(8, 2), hp: 5 },
  ]);

  it('son propre monstre : pas restants, attaque disponible, sens et effets en cours', () => {
    const sheet = cellSheet(state, 1, 8, 1);
    expect(sheet?.title).toBe('Chevalier');
    expect(sheet?.stats.map((s) => [s.label, s.value])).toEqual([
      ['ATK', '3'],
      ['PV', '4/4'],
      ['Pas rest.', '1/3'],
      ['Portée', '1'],
    ]);
    expect(sheet?.lines).toEqual([{ icon: 'broadsword', label: 'Attaque', status: { text: 'Disponible', tone: 'ok' } }]);
    expect(chipTexts(sheet)).toContain('Regarde vers le bas');
  });

  it('attaque : utilisée ce tour, ou aucune cible depuis cette case', () => {
    const used = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1), hasAttacked: true },
      { monster: 'golem', owner: 2, at: at(8, 2) },
    ]);
    expect(cellSheet(used, 1, 8, 1)?.lines[0]?.status).toEqual({ text: 'Utilisée ce tour', tone: 'off' });
    const alone = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }]);
    expect(cellSheet(alone, 1, 8, 1)?.lines[0]?.status).toEqual({ text: 'Aucune cible depuis cette case', tone: 'off' });
  });

  it('monstre adverse : informations publiques, menace et rappel de sa portée', () => {
    const sheet = cellSheet(state, 1, 8, 2);
    expect(sheet?.type).toBe('Monstre · Joueur 2 (adversaire)');
    expect(sheet?.stats).toContainEqual({ icon: 'hearts', label: 'PV', value: '5/7', delta: 0, hurt: true });
    expect(sheet?.stats.map((s) => s.label)).toContain('Mobilité');
    expect(sheet?.text.join(' ')).toContain('prochain tour');
    expect(sheet?.lines.map((l) => l.label)).toEqual(['Menace']);
  });

  it('statuts : ce qu’il leur reste à durer, en tours de l’unité touchée ; couleur selon leur cause', () => {
    const burning = withStatus(withStatus(state, 'u2', 'burn', 1, 2), 'u2', 'immobilise', 0, 0);
    expect(cellSheet(burning, 1, 8, 2)?.status).toEqual(
      expect.arrayContaining([
        { icon: 'flame', text: 'Burn 1 : −1 PV au début de chacun de ses tours, pendant ses 2 prochains tours', kind: 'burn' },
        { icon: 'fishing-net', text: 'Immobilisé : ne peut plus bouger jusqu’à son prochain tour', kind: 'warn' },
      ]),
    );
  });

  it('slow reçu pendant son tour et Charge : la mobilité le montre (pastille), « Effets en cours » aussi', () => {
    let slowed = withStatus(gameWith([{ monster: 'golem', owner: 1, at: at(8, 1) }]), 'u1', 'slow', 1, 1);
    expect(cellSheet(slowed, 1, 8, 1)?.stats[2]).toEqual({ icon: 'walking-boot', label: 'Pas rest.', value: '1/1', delta: -1, hurt: false });
    expect(chipTexts(cellSheet(slowed, 1, 8, 1))).toContain('Slow 1 : −1 mobilité jusqu’à la fin de ce tour et de son prochain');
    slowed = applyAction(applyAction(slowed, END_TURN), END_TURN); // son tour suivant : encore ralenti
    expect(cellSheet(slowed, 1, 8, 1)?.stats[2]).toMatchObject({ value: '1/1', delta: -1 });

    const charged = applyAction(gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], { players: { 1: { mana: 3, grimoire: ['charge'] } } }), {
      type: 'playCard',
      cardId: 'charge',
      target: { kind: 'unit', unitId: 'u1' },
    });
    expect(cellSheet(charged, 1, 8, 1)?.stats[2]).toMatchObject({ value: '4/4', delta: 2 });
    expect(cellSheet(charged, 1, 8, 1)?.status).toContainEqual({ icon: 'sprint', text: '+2 mobilité ce tour (Charge)', kind: 'boost' });
  });

  it('effet passif (riposte prête) et effet actif (coût, disponibilité)', () => {
    const guard = gameWith([{ monster: 'gardien', owner: 1, at: at(8, 1) }]);
    expect(cellSheet(guard, 1, 8, 1)?.passive?.foot).toEqual({ text: 'Riposte prête · une fois par tour', tone: 'ok' });
    const poor = gameWith([{ monster: 'invocateur', owner: 1, at: at(5, 4) }], { players: { 1: { mana: 0 } } });
    expect(cellSheet(poor, 1, 5, 4)?.active[0]).toMatchObject({ cost: 1, foot: { text: 'Mana insuffisant · il te manque 1', tone: 'warn' } });
  });

  it('effet actif et mots-clés : écrits avec le lexique', () => {
    const sheet = getSheet(getPlayerView(state, 1), { kind: 'card', cardId: 'dragon-feu' });
    expect(sheet?.passive?.items).toEqual([{ name: 'Vol', text: 'En se déplaçant, survole les cases X et les falaises de la Scierie (pas celles de la Mine, zone fermée), mais pas les ennemis.' }]);
    expect(sheet?.active).toEqual([{
      name: 'Déflagration',
      cost: 3,
      text: '3 cases devant · 2 dégâts + burn 1 pendant 1 tour',
      foot: null,
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
      traps: [{ owner: 1, pos: at(8, 2), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe' }],
    };
    expect(cellSheet(trapped, 1, 8, 2)?.title).toBe('Ton piège · Bombe');
    expect(cellSheet(trapped, 2, 8, 2)).toBeNull();
  });

  it('carte du grimoire trop chère : il manque du mana ; pas d’« Effets en cours »', () => {
    const poor = gameWith([], { players: { 1: { mana: 1 } } });
    const sheet = getSheet(getPlayerView(poor, 1), { kind: 'card', cardId: 'golem' });
    expect(sheet?.lines).toEqual([
      { icon: 'card-play', label: 'Invocation', status: { text: 'Mana insuffisant · il te manque 3', tone: 'warn' } },
    ]);
    expect(sheet?.status).toBeNull();
  });

  it('sort du grimoire : « Lancer », son effet en effet actif (coût en haut de la fiche)', () => {
    const sheet = getSheet(getPlayerView(gameWith([], { players: { 1: { mana: 5 } } }), 1), { kind: 'card', cardId: 'charge' });
    expect(sheet?.lines[0]).toEqual({ icon: 'card-play', label: 'Lancer', status: { text: 'Aucune cible à portée', tone: 'off' } });
    expect(sheet?.active[0]).toMatchObject({ cost: null, name: null });
    expect(sheet?.cost).toBe(1);
  });

  it('mana zone neutre et case bloquée', () => {
    const empty = gameWith([]);
    expect(cellSheet(empty, 1, 5, 4)?.title).toBe('Forge');
    expect(cellSheet(empty, 1, 5, 4)?.lines).toEqual([
      { icon: 'laurels', label: 'Contrôle', status: { text: 'Neutre · personne', tone: 'off' } },
    ]);
    expect(cellSheet(empty, 1, 3, 4)?.title).toBe('Case bloquée');
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
  it('le dit, et la tuile n’est plus jouable', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], {
      players: { 1: { mana: 10, grimoire: ['charge', 'charge'] } },
    });
    const after = applyAction(state, { type: 'playCard', cardId: 'charge', target: { kind: 'unit', unitId: 'u1' } });
    const view = getPlayerView(after, 1);
    expect(canPlay(view, 'charge')).toBe(false);
    expect(getSheet(view, { kind: 'card', cardId: 'charge' })?.lines[0]?.status).toEqual({
      text: 'Déjà lancé ce tour : un même sort une fois par tour',
      tone: 'off',
    });
  });
});
