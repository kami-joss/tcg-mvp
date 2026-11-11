import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction, concede, createGame, getLegalActions, getPlayerView } from '.';
import { deepFreeze } from './test-utils';

// Abandon (parties en ligne, SPEC.md §7 ter) : un joueur abandonne à tout moment, même pendant le tour adverse ; son
// adversaire gagne aussitôt. Il peut aussi perdre par absence.

describe('abandon', () => {
  it('le joueur actif abandonne : son adversaire gagne, la partie est finie', () => {
    const state = deepFreeze(createGame());
    const after = concede(state, 1);
    expect(after.winner).toBe(2);
    expect(after.concession).toEqual({ player: 1, reason: 'abandon' });
    expect(getLegalActions(after)).toEqual([]);
    expect(() => applyAction(after, { type: 'endTurn' })).toThrow(IllegalActionError);
    // L'état d'avant ne bouge pas.
    expect(state.winner).toBeNull();
    expect(state.concession).toBeNull();
  });

  it('pendant le tour adverse aussi ; ou par absence', () => {
    expect(concede(createGame(), 2).winner).toBe(1);
    expect(concede(createGame(), 2, 'absence').concession).toEqual({ player: 2, reason: 'absence' });
  });

  it('les deux joueurs le voient ; une partie finie ne s’abandonne plus', () => {
    const after = concede(createGame(), 1);
    expect(getPlayerView(after, 1).concession).toEqual({ player: 1, reason: 'abandon' });
    expect(getPlayerView(after, 2)).toMatchObject({ winner: 2, concession: { player: 1, reason: 'abandon' } });
    expect(() => concede(after, 2)).toThrow(IllegalActionError);
  });
});
