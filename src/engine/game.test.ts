import { describe, expect, it } from 'vitest';
import { BOARD } from './board';
import { TEST_GRIMOIRE } from './cards';
import { BASE_MANA_PER_TURN } from './config';
import { createGame } from './game';

describe('createGame — mise en place (SPEC.md §4.1)', () => {
  it('J1 commence, au tour 1, sans vainqueur', () => {
    const state = createGame();
    expect(state.activePlayer).toBe(1);
    expect(state.turn).toBe(1);
    expect(state.winner).toBeNull();
  });

  it('chaque joueur a 0 VP, le grimoire complet et aucune carte utilisée', () => {
    const state = createGame();
    for (const id of [1, 2] as const) {
      expect(state.players[id]).toMatchObject({ id, vp: 0, grimoire: TEST_GRIMOIRE, graveyard: [] });
    }
  });

  it('J1 commence avec le mana de base (début de son premier tour, SPEC.md §10), J2 avec 0', () => {
    const state = createGame();
    expect(state.players[1].mana).toBe(BASE_MANA_PER_TURN);
    expect(state.players[2].mana).toBe(0);
  });

  it('utilise le plateau de la SPEC, sans aucune unité', () => {
    const state = createGame();
    expect(state.board).toBe(BOARD);
    expect(state.units).toEqual({});
  });

  it('est déterministe', () => {
    expect(createGame()).toEqual(createGame());
  });

  it('les grimoires des deux joueurs sont indépendants', () => {
    const state = createGame();
    expect(state.players[1].grimoire).not.toBe(state.players[2].grimoire);
  });
});
