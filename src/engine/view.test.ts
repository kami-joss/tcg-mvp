import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { createGame } from './game';
import { at, deepFreeze, gameWith } from './test-utils';
import { getPlayerView } from './view';

describe('getPlayerView (SPEC.md §2, §4.3)', () => {
  it('cache le contenu du grimoire adverse, mais en donne le nombre de cartes', () => {
    const state = gameWith([], {
      players: {
        1: { grimoire: ['eclaireur'], graveyard: [] },
        2: { grimoire: ['dragonnet', 'golem'], graveyard: ['charge'], mana: 4, vp: 2 },
      },
    });
    const view = getPlayerView(state, 1);
    expect(view.opponent).toEqual({ id: 2, mana: 4, vp: 2, graveyard: ['charge'], grimoireCount: 2 });
    expect(JSON.stringify(view)).not.toMatch(/dragonnet|golem/);
  });

  it('montre au joueur tout son propre grimoire', () => {
    const state = createGame();
    expect(getPlayerView(state, 2).me).toEqual(state.players[2]);
  });

  it('donne les informations publiques : mana, VP et cartes utilisées des deux joueurs', () => {
    let state = createGame();
    state = applyAction(state, { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } });
    state = applyAction(state, { type: 'endTurn' });
    const view = getPlayerView(state, 2);
    expect(view.opponent).toMatchObject({ id: 1, mana: 1, vp: 0, graveyard: [], grimoireCount: 24 });
    expect(view.me).toMatchObject({ id: 2, mana: 4, vp: 0, graveyard: [] });
  });

  it('le plateau, les unités, le tour, le joueur actif et le vainqueur sont publics', () => {
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(5, 4) }]);
    const view = getPlayerView(state, 2);
    expect(view.board).toBe(state.board);
    expect(view.units).toEqual(state.units);
    expect(view).toMatchObject({ viewer: 2, activePlayer: 1, turn: 1, winner: null });
  });

  it('seul le joueur actif reçoit ses actions légales', () => {
    const state = createGame();
    expect(getPlayerView(state, 1).legalActions).toEqual(getLegalActions(state));
    expect(getPlayerView(state, 2).legalActions).toEqual([]);
  });

  it('ne mute pas l’état', () => {
    const state = deepFreeze(createGame());
    const snapshot = structuredClone(state);
    getPlayerView(state, 1);
    getPlayerView(state, 2);
    expect(state).toEqual(snapshot);
  });
});
