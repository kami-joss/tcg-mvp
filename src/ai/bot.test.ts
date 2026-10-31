import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, DECKS, applyAction, createGame, getLegalActions, getZoneController } from '../engine';
import type { Action, CardId, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { SEARCH, chooseAction, knownState, lastEvaluations, strikeLosses } from './bot';

// IA d'entraînement (SPEC.md §7 bis) : une action à la fois, cherchée sur la fin du tour, sans tricher.

const isLegal = (state: GameState, action: Action) =>
  getLegalActions(state).some((a) => JSON.stringify(a) === JSON.stringify(action));

describe('IA d’entraînement', () => {
  it('ne joue que des actions légales, et finit son tour quand plus rien ne l’aide', () => {
    const broke = gameWith([], { activePlayer: 2, players: { 2: { mana: 0 } } });
    expect(chooseAction(broke, 2)).toEqual({ type: 'endTurn' });
    const rich = gameWith([], { activePlayer: 2, players: { 2: { mana: 5 } } });
    const action = chooseAction(rich, 2);
    expect(action.type).toBe('playCard');
    expect(isLegal(rich, action)).toBe(true);
  });

  it('achève un monstre adverse à sa portée', () => {
    const state = gameWith(
      [
        { monster: 'chevalier', owner: 2, at: at(5, 3) },
        { monster: 'eclaireur', owner: 1, at: at(4, 3) },
      ],
      { activePlayer: 2, players: { 2: { mana: 0 } } },
    );
    expect(chooseAction(state, 2)).toMatchObject({ type: 'attack', unitId: 'u1', targetId: 'u2' });
  });

  it('va prendre une mana zone libre', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 2, at: at(8, 3) }], { activePlayer: 2, players: { 2: { mana: 0 } } });
    expect(chooseAction(state, 2)).toEqual({ type: 'move', unitId: 'u1', to: at(8, 4) });
  });

  it('ne triche pas : elle ignore les pièges adverses et les monstres qu’elle ne voit pas', () => {
    const base = gameWith([{ monster: 'chevalier', owner: 2, at: at(8, 3) }], { activePlayer: 2, players: { 2: { mana: 0 } } });
    const trapped: GameState = { ...base, traps: [{ owner: 1, pos: at(8, 4), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe' }] };
    expect(chooseAction(trapped, 2)).toEqual(chooseAction(base, 2));
    expect(knownState(trapped, 2).traps).toEqual([]);
    // Un Farceur invisible, loin de tout : absent de ce qu'elle sait.
    const hidden = gameWith([{ monster: 'farceur', owner: 1, at: at(3, 0) }], { activePlayer: 2 });
    expect(knownState(hidden, 2).units).toEqual({});
  });

  it('une partie IA contre IA va à son terme, sans action refusée', () => {
    let state = createGame(undefined, { 1: DECKS[0]!.cards, 2: DECKS[0]!.cards });
    let actions = 0;
    while (state.winner === null && state.turn <= 40 && actions < 600) {
      state = applyAction(state, chooseAction(state, state.activePlayer));
      actions++;
    }
    expect(state.winner).not.toBeNull();
  }, 60_000);
});

describe('IA : mode contestation (SPEC.md §4.4 bis)', () => {
  it('entre dans une zone de 9 cases, sans aller jusqu’à la mana zone', () => {
    // Forge du 13 × 13 en (6, 6) : à 2 pas de mobilité près, le bord de sa zone suffit.
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(9, 5), mobilityLeft: 2 }], {
      board: BATTLEFIELD_13,
      mode: 'contestation',
      activePlayer: 2,
      players: { 2: { mana: 0 } },
    });
    const action = chooseAction(state, 2);
    expect(action).toMatchObject({ type: 'move', unitId: 'u1' });
    expect(getZoneController(applyAction(state, action), at(6, 6))).toBe(2);
  });

  it('un seul monstre garde une zone : le second part prendre la suivante', () => {
    // Ferme du 13 × 13 en (8, 11) : le Golem la garde, le Chevalier file vers la Forge, en (6, 6).
    const state = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(8, 11) },
        { monster: 'chevalier', owner: 2, at: at(7, 10) },
      ],
      { board: BATTLEFIELD_13, mode: 'contestation', activePlayer: 2, players: { 2: { mana: 0 } } },
    );
    const after = applyAction(state, chooseAction(state, 2));
    expect(getZoneController(after, at(8, 11))).toBe(2);
    expect(getZoneController(after, at(6, 6))).toBe(2);
  });

  it('une partie IA contre IA sur le 13 × 13 se joue sans action refusée', () => {
    let state = createGame(BATTLEFIELD_13, { 1: DECKS[0]!.cards, 2: DECKS[1]!.cards }, undefined, 'contestation');
    let actions = 0;
    while (state.winner === null && state.turn <= 16 && actions < 300) {
      state = applyAction(state, chooseAction(state, state.activePlayer));
      actions++;
    }
    expect(state.turn).toBeGreaterThan(10);
    expect(state.players[1].vp + state.players[2].vp).toBeGreaterThan(0);
  }, 60_000);
});

describe('IA : deux coups d’avance pour un même monstre', () => {
  it('Flèche divine, puis l’archer achève l’ennemi à 3 cases', () => {
    const state = gameWith(
      [
        { monster: 'archer-leger', owner: 1, at: at(9, 0), mobilityLeft: 0 },
        { monster: 'eclaireur', owner: 2, at: at(6, 0) },
      ],
      { players: { 1: { mana: 2, grimoire: ['fleche-divine'] as CardId[] } } },
    );
    const arrow: Action = { type: 'playCard', cardId: 'fleche-divine', target: { kind: 'unit', unitId: 'u1' } };
    expect(chooseAction(state, 1)).toEqual(arrow);
    expect(chooseAction(applyAction(state, arrow), 1)).toMatchObject({ type: 'attack', unitId: 'u1', targetId: 'u2' });
  });

  it('Dopage, puis Jean Bon détruit le Golem', () => {
    const state = gameWith(
      [
        { monster: 'jean-bon', owner: 1, at: at(8, 1), mobilityLeft: 0 },
        { monster: 'golem', owner: 2, at: at(7, 1) },
      ],
      { players: { 1: { mana: 2, grimoire: [] as CardId[] } } },
    );
    const dopage = chooseAction(state, 1);
    expect(dopage).toEqual({ type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } });
    expect(chooseAction(applyAction(state, dopage), 1)).toMatchObject({ type: 'attack', unitId: 'u1', targetId: 'u2' });
  });

  it('Pénombre pour cacher un monstre piège menacé, pas sans menace', () => {
    const threatened = gameWith(
      [
        { monster: 'poseur-de-piege', owner: 1, at: at(3, 1), mobilityLeft: 0 },
        { monster: 'chevalier', owner: 2, at: at(7, 1) },
      ],
      { players: { 1: { mana: 5, grimoire: ['penombre'] as CardId[] } } },
    );
    const penombre: Action = { type: 'playCard', cardId: 'penombre', target: { kind: 'all' } };
    expect(chooseAction(threatened, 1)).toEqual(penombre);
    const safe = { ...threatened, units: { ...threatened.units, u2: { ...threatened.units.u2!, pos: at(9, 8) } } };
    expect(chooseAction(safe, 1)).not.toEqual(penombre);
  });
});

describe('IA : effets actifs des monstres', () => {
  it('un effet utile passe avant une carte qui lui prendrait son mana', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(5, 2), mobilityLeft: 0, hasAttacked: true },
        { monster: 'golem', owner: 2, at: at(7, 2) },
      ],
      { players: { 1: { mana: 2, grimoire: ['milicien'] as CardId[] } } },
    );
    expect(chooseAction(state, 1)).toEqual({ type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u2' } });
  });

  it('elle approche un monstre pour qu’il puisse lancer son effet, puis le lance', () => {
    const state = gameWith(
      [
        { monster: 'mage', owner: 1, at: at(2, 3), hasAttacked: true },
        { monster: 'eclaireur', owner: 2, at: at(6, 3) },
      ],
      { players: { 1: { mana: 2, grimoire: [] as CardId[] } } },
    );
    const move = chooseAction(state, 1);
    expect(move).toMatchObject({ type: 'move', unitId: 'u1' });
    expect(chooseAction(applyAction(state, move), 1)).toEqual({
      type: 'activateEffect',
      unitId: 'u1',
      target: { kind: 'unit', unitId: 'u2' },
    });
  });

  it('elle pose ses monstres après ses déplacements utiles', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(1, 4) }], {
      players: { 1: { mana: 2, grimoire: ['milicien'] as CardId[] } },
    });
    expect(chooseAction(state, 1)).toMatchObject({ type: 'move', unitId: 'u1' });
  });
});

describe('IA : ce que l’adversaire peut faire au prochain tour', () => {
  it('chaque monstre adverse ne frappe qu’une fois : un second Milicien à sa portée ne coûte rien de plus', () => {
    // Le Golem (J2, 4 ATK, 2 de mobilité) peut aller détruire l'un ou l'autre Milicien (3 PV), pas les deux.
    const one = gameWith([
      { monster: 'golem', owner: 2, at: at(6, 2) },
      { monster: 'milicien', owner: 1, at: at(4, 2) },
    ]);
    const two = gameWith([
      { monster: 'golem', owner: 2, at: at(6, 2) },
      { monster: 'milicien', owner: 1, at: at(4, 2) },
      { monster: 'milicien', owner: 1, at: at(8, 2) },
    ]);
    expect(strikeLosses(one, 2)).toBeGreaterThan(12); // Un monstre détruit : sa valeur, plus le VP qu'il rapporte.
    expect(strikeLosses(two, 2)).toBe(strikeLosses(one, 2));
  });
});

describe('IA : recherche dans un budget de calcul', () => {
  it('s’arrête au budget : moins d’évaluations qu’une recherche sans limite, et toujours une action légale', () => {
    const state = createGame(BATTLEFIELD_13, { 1: DECKS[0]!.cards, 2: DECKS[0]!.cards });
    const free = chooseAction(state, 1, { ...SEARCH, budget: Infinity });
    const unlimited = lastEvaluations();
    const capped = chooseAction(state, 1, { ...SEARCH, budget: 10 });
    expect(lastEvaluations()).toBeLessThan(unlimited);
    for (const action of [free, capped]) expect(isLegal(state, action)).toBe(true);
  });
});
