import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import type { CardId, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { bubbleBack, getBubble } from './bubble';
import type { BubbleModel } from './bubble';
import { getHighlights, posKey } from './interaction';
import type { Selection } from './interaction';

// Bulle d'action (handoff V10, lot 11) : ce qu'elle propose vient des actions légales et de l'aperçu du moteur.

const view = (state: GameState) => getPlayerView(state, state.activePlayer);
const bubble = (state: GameState, selection: Selection, flipped = false): BubbleModel => {
  const model = getBubble(view(state), selection, flipped);
  if (!model) throw new Error('bulle attendue');
  return model;
};
const row = (model: BubbleModel, key: string) => {
  const found = model.rows.find((r) => r.key === key);
  if (!found) throw new Error(`ligne ${key} absente`);
  return found;
};
const attack = (targetId = 'u2'): Selection => ({ kind: 'attack', unitId: 'u1', targetId, page: 'main' });

describe('bulle d’attaque', () => {
  const duel = gameWith([
    { monster: 'chevalier', owner: 1, at: at(8, 1) }, // ATK 3
    { monster: 'golem', owner: 2, at: at(8, 2) }, // 7 PV : survit
    { monster: 'eclaireur', owner: 2, at: at(7, 1) }, // 1 PV : détruit au contact
  ]);

  it('au-dessus de la cible : son nom et ses PV avant → après', () => {
    const model = bubble(duel, attack());
    expect(model).toMatchObject({ anchor: at(8, 2), anchorUnit: 'u2' });
    expect(model.header).toEqual({ kind: 'unit', name: 'Golem', owner: 2, hp: { before: 7, after: 4 }, note: null });
    expect(model.rows.map((r) => r.title)).toEqual(['Attaquer', 'Attaquer et avancer', 'Effets']);
    expect(bubbleBack(model)).toBeNull();
  });

  it('« Attaquer » n’avance jamais ; « Attaquer et avancer » est grisé si la cible survit', () => {
    const model = bubble(duel, attack());
    expect(row(model, 'attack')).toMatchObject({
      enabled: true,
      subtitle: '−3 PV',
      pick: { action: { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false } },
    });
    expect(row(model, 'advance')).toMatchObject({ enabled: false, subtitle: 'Ne détruit pas la cible (7 → 4 PV)', pick: null });
    expect(row(model, 'effects')).toMatchObject({ enabled: false, subtitle: 'Aucun effet actif' });
  });

  it('cible détruite au contact : avancer prend sa case, trajet montré au survol', () => {
    const model = bubble(duel, attack('u3'));
    expect(row(model, 'attack').subtitle).toBe('−3 PV · détruit');
    expect(row(model, 'advance')).toMatchObject({
      enabled: true,
      boot: true,
      subtitle: '−3 PV, détruit, puis prend sa case',
      path: [at(7, 1)],
      pick: { action: { type: 'attack', unitId: 'u1', targetId: 'u3', advance: true } },
    });
  });

  it('à distance, on n’avance pas (§4.7)', () => {
    const state = gameWith([
      { monster: 'archer-lourd', owner: 1, at: at(5, 3) },
      { monster: 'eclaireur', owner: 2, at: at(5, 5) },
    ]);
    expect(row(bubble(state, attack()), 'advance')).toMatchObject({ enabled: false, subtitle: 'À distance : il ne peut pas avancer' });
  });

  it('conséquences : riposte au contact, Givre, coup dans le dos', () => {
    const riposte = gameWith([
      { monster: 'milicien', owner: 1, at: at(5, 4) },
      { monster: 'gardien', owner: 2, at: at(5, 5) },
    ]);
    expect(row(bubble(riposte, attack()), 'attack').subtitle).toMatch(/riposte −1$/);
    const frost = gameWith([
      { monster: 'archer-de-glace', owner: 1, at: at(5, 3) },
      { monster: 'golem', owner: 2, at: at(5, 5) },
    ]);
    expect(row(bubble(frost, attack()), 'attack').subtitle).toBe('−2 PV · Givre');
    const behind = gameWith([
      { monster: 'clown-assassin', owner: 1, at: at(5, 4) },
      { monster: 'golem', owner: 2, at: at(5, 5), facing: 'right' },
    ]);
    expect(row(bubble(behind, attack()), 'attack').subtitle).toBe('−6 PV dans le dos');
  });
});

describe('bulle : effets', () => {
  const bomber = (mana: number) =>
    gameWith(
      [
        { monster: 'poseur-de-bombe', owner: 1, at: at(5, 4) },
        { monster: 'golem', owner: 2, at: at(5, 5) },
      ],
      { players: { 1: { mana } } },
    );

  it('depuis l’attaque : « 1 disponible », puis la sous-vue des effets de l’attaquant, avec retour', () => {
    const model = bubble(bomber(5), attack());
    expect(row(model, 'effects')).toMatchObject({ enabled: true, subtitle: '1 disponible ›', pick: { selection: { ...attack(), page: 'effects' } } });
    const effects = bubble(bomber(5), { ...attack(), page: 'effects' } as Selection);
    expect(effects.header).toEqual({ kind: 'page', title: 'Effets', note: '· tu as 5 mana', back: attack() });
    expect(effects.anchor).toEqual(at(5, 5));
    // Poser une bombe : on passe au ciblage sur le plateau (cases violettes).
    expect(effects.rows).toHaveLength(1);
    expect(effects.rows[0]).toMatchObject({
      title: 'Poser une bombe',
      cost: 2,
      enabled: true,
      pick: { selection: { kind: 'unit', unitId: 'u1', mode: 'effect' } },
    });
  });

  it('sans assez de mana : grisé, en rouge, avec ce qui manque', () => {
    expect(row(bubble(bomber(1), attack()), 'effects')).toMatchObject({ enabled: false, warn: true, subtitle: 'Il te manque 1 mana' });
    const effects = bubble(bomber(1), { kind: 'effects', unitId: 'u1', page: 'effects' });
    expect(effects.rows[0]).toMatchObject({ enabled: false, warn: true, subtitle: 'Il te manque 1 mana', pick: null });
  });

  it('clic droit : au-dessus de son monstre, son nom et son mana ; un effet sur soi se lance directement', () => {
    const state = gameWith([{ monster: 'jean-bon', owner: 1, at: at(5, 4) }], { players: { 1: { mana: 4 } } });
    const model = bubble(state, { kind: 'effects', unitId: 'u1', page: 'effects' });
    expect(model).toMatchObject({ anchor: at(5, 4), anchorUnit: 'u1' });
    expect(model.header).toEqual({ kind: 'unit', name: 'Jean Bon', owner: 1, hp: null, note: 'Effets · 4 mana' });
    expect(model.rows[0]).toMatchObject({
      title: 'Dopage',
      cost: 2,
      enabled: true,
      pick: { action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } } },
    });
    const plain = gameWith([{ monster: 'chevalier', owner: 1, at: at(5, 4) }]);
    expect(bubble(plain, { kind: 'effects', unitId: 'u1', page: 'effects' }).rows).toEqual([
      expect.objectContaining({ title: 'Aucun effet actif', enabled: false }),
    ]);
  });

  it('évolution : le choix de la carte, dans la bulle', () => {
    const state = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 4) }], {
      players: { 1: { mana: 5, grimoire: ['dragon-feu', 'dragon-vent'] as CardId[] } },
    });
    const effects = bubble(state, { kind: 'effects', unitId: 'u1', page: 'effects' });
    expect(effects.rows[0]!.pick).toEqual({ selection: { kind: 'effects', unitId: 'u1', page: 'evolve' } });
    const evolve = bubble(state, { kind: 'effects', unitId: 'u1', page: 'evolve' });
    expect(evolve.header).toMatchObject({ kind: 'page', title: 'Évolution' });
    expect(bubbleBack(evolve)).toEqual({ kind: 'effects', unitId: 'u1', page: 'effects' });
    expect(evolve.rows.map((r) => r.title)).toEqual(['Dragon élémentaire de feu', 'Dragon élémentaire de vent']);
    expect(evolve.rows[0]!.pick).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'card', cardId: 'dragon-feu' } },
    });
  });
});

describe('bulle : choix en plusieurs temps', () => {
  it('Vent violent : la direction est cliquée sur le plateau, la distance se choisit dans la bulle', () => {
    const state = gameWith(
      [
        { monster: 'dragon-vent', owner: 1, at: at(8, 1), facing: 'up' },
        { monster: 'golem', owner: 2, at: at(8, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    const selection: Selection = { kind: 'areaDirection', unitId: 'u1', direction: 'right' };
    const model = bubble(state, selection);
    expect(model.header).toMatchObject({ kind: 'page', title: 'Vent violent', note: 'vers la droite', back: { kind: 'unit', unitId: 'u1', mode: 'effect' } });
    expect(model.rows.map((r) => r.title)).toEqual(['Recul de 1', 'Recul de 2', 'Recul de 3']);
    expect(model.rows.every((r) => r.arrow === 'right')).toBe(true);
    // Plateau retourné : la bulle parle de l'écran.
    const flipped = bubble(state, selection, true);
    expect(flipped.header).toMatchObject({ note: 'vers la gauche' });
    expect(flipped.rows[0]!.arrow).toBe('left');
    expect(getHighlights(view(state), selection).get(posKey(at(8, 3)))).toBe('effect');
  });

  it('Bourrasque : une ligne par direction, avec la case d’arrivée', () => {
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(5, 5) }], {
      players: { 1: { mana: 5, grimoire: ['bourrasque'] as CardId[] } },
    });
    const model = bubble(state, { kind: 'push', cardId: 'bourrasque', unitId: 'u1' });
    expect(model).toMatchObject({ anchor: at(5, 5), anchorUnit: 'u1' });
    expect(model.header).toMatchObject({ kind: 'unit', name: 'Golem', note: 'Bourrasque' });
    const down = row(model, 'down');
    expect(down).toMatchObject({ title: 'Vers le bas', subtitle: 'Il arrive en (7, 5)', arrow: 'down' });
    expect(row(bubble(state, { kind: 'push', cardId: 'bourrasque', unitId: 'u1' }, true), 'down')).toMatchObject({
      title: 'Vers le haut',
      arrow: 'up',
    });
  });

  it('Invocateur : la case est choisie, le monstre se choisit dans la bulle, au coût total (effet + monstre)', () => {
    const state = gameWith([{ monster: 'invocateur', owner: 1, at: at(5, 4) }], {
      players: { 1: { mana: 10, grimoire: ['milicien', 'golem'] as CardId[] } },
    });
    const model = bubble(state, { kind: 'summonAt', unitId: 'u1', pos: at(5, 5) });
    expect(model).toMatchObject({ anchor: at(5, 5), anchorUnit: null });
    expect(model.header).toMatchObject({ kind: 'page', title: 'Invoquer', back: { kind: 'unit', unitId: 'u1', mode: 'effect' } });
    expect(model.rows.map((r) => [r.title, r.cost])).toEqual([
      ['Milicien', 3],
      ['Golem', 5],
    ]);
  });
});

describe('bulle : carte du grimoire (clic droit)', () => {
  const menu = (cardId: CardId): Selection => ({ kind: 'cardMenu', cardId });

  it('un monstre : « Invoquer », puis ses cases dorées sur le plateau', () => {
    const state = gameWith([], { players: { 1: { mana: 5, grimoire: ['milicien'] as CardId[] } } });
    const model = bubble(state, menu('milicien'));
    expect(model).toMatchObject({ anchor: null, anchorUnit: null, anchorCard: 'milicien' });
    expect(model.header).toEqual({ kind: 'card', icon: 'dragon-head', name: 'Milicien', note: 'Monstre' });
    expect(model.rows).toEqual([
      expect.objectContaining({ title: 'Invoquer', cost: 2, enabled: true, pick: { selection: { kind: 'card', cardId: 'milicien' } } }),
    ]);
    expect(getHighlights(view(state), menu('milicien')).size).toBe(0);
  });

  it('pas assez de mana : grisé, avec ce qui manque', () => {
    const state = gameWith([], { players: { 1: { mana: 1, grimoire: ['golem'] as CardId[] } } });
    expect(bubble(state, menu('golem')).rows[0]).toMatchObject({ enabled: false, warn: true, subtitle: 'Il te manque 3 mana', pick: null });
  });

  it('un sort sans cible à choisir (Pénombre) se lance tout de suite ; Bourrasque passe au ciblage', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(5, 4) }, { monster: 'golem', owner: 2, at: at(5, 6) }], {
      players: { 1: { mana: 10, grimoire: ['penombre', 'bourrasque'] as CardId[] } },
    });
    expect(bubble(state, menu('penombre')).rows[0]).toMatchObject({
      title: 'Lancer',
      cost: 5,
      pick: { action: { type: 'playCard', cardId: 'penombre', target: { kind: 'all' } } },
    });
    expect(bubble(state, menu('bourrasque')).rows[0]!.pick).toEqual({ selection: { kind: 'card', cardId: 'bourrasque' } });
  });

  it('hors de son tour : la carte se lit, sans pouvoir la jouer', () => {
    const state = gameWith([], { players: { 2: { mana: 5, grimoire: ['milicien'] as CardId[] } } });
    const model = getBubble(getPlayerView(state, 2), menu('milicien'));
    expect(model?.rows[0]).toMatchObject({ enabled: false, subtitle: 'Pas ton tour', pick: null });
    expect(getBubble(getPlayerView(state, 2), menu('golem'))).toBeNull();
  });
});

