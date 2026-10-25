import { describe, expect, it } from 'vitest';
import { DECKS, applyAction, createGame, getLegalActions } from '../engine';
import type { Action, CardId, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { chooseAction, knownState } from './bot';

// IA d'entraînement (SPEC.md §7 bis) : une action à la fois, la meilleure vue un coup à l'avance, sans tricher.

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
      { players: { 1: { mana: 2 } } },
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
