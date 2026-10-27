import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { DECKS } from './cards';
import { createGame } from './game';
import { at, gameWith } from './test-utils';
import { getPlayerView } from './view';
import type { Action, CardId, GameState } from './types';

// Exemplaires brillants (handoff V11, overframes) : purement visuels, sans effet sur les règles. Une carte jouée l'est
// d'abord dans un exemplaire brillant ; l'unité qu'elle fait venir l'est aussi.

/** Jouer la carte sur la première case permise. */
const play = (state: GameState, cardId: CardId): GameState => {
  const action = getLegalActions(state).find(
    (a): a is Extract<Action, { type: 'playCard' }> => a.type === 'playCard' && a.cardId === cardId,
  );
  if (!action) throw new Error(`${cardId} ne peut pas être jouée`);
  return applyAction(state, action);
};

describe('exemplaires brillants', () => {
  it('à la création : seulement des cartes du deck, un par exemplaire présent', () => {
    const deck: CardId[] = ['eclaireur', 'eclaireur', 'chevalier'];
    const game = createGame(undefined, { 1: deck, 2: deck }, { 1: ['eclaireur', 'eclaireur', 'eclaireur', 'golem'], 2: [] });
    expect(game.players[1].shiny).toEqual(['eclaireur', 'eclaireur']);
    expect(game.players[2].shiny).toBeUndefined();
  });

  it('decks de démo : Archer de glace et Archer du feu, Apprenti - Sorciers du feu brillants ; aucun dans Explorateur du temps', () => {
    const shiny = (id: string) => DECKS.find((d) => d.id === id)!.shiny;
    expect(shiny('archers')).toEqual(['archer-de-glace', 'archer-du-feu']);
    expect(shiny('sorciers-du-feu')).toEqual(['apprenti']);
    expect(shiny('explorateur-du-temps')).toBeUndefined();
    for (const deck of DECKS) for (const id of deck.shiny ?? []) expect(deck.cards).toContain(id);
  });

  it('jouer la carte : l’exemplaire brillant part en premier, son monstre est brillant ; le suivant ne l’est plus', () => {
    const state = gameWith([], { players: { 1: { mana: 10, grimoire: ['eclaireur', 'eclaireur'], shiny: ['eclaireur'] } } });
    const first = play(state, 'eclaireur');
    expect(first.units.u1).toMatchObject({ cardId: 'eclaireur', shiny: true });
    expect(first.players[1].shiny).toEqual([]);
    const second = play(first, 'eclaireur');
    expect(second.units.u2!.shiny).toBeUndefined();
    expect(second.players[1].grimoire).toEqual([]);
  });

  it('un terrain brillant aussi ; sans exemplaire brillant, rien ne change', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(5, 4) }], {
      players: { 1: { mana: 10, grimoire: ['bastion', 'chevalier'], shiny: ['bastion'] } },
    });
    const placed = play(state, 'bastion');
    expect(placed.units.u2).toMatchObject({ kind: 'terrain', shiny: true });
    const plain = play(gameWith([], { players: { 1: { mana: 10, grimoire: ['chevalier'] } } }), 'chevalier');
    expect(plain.units.u1!.shiny).toBeUndefined();
    expect(plain.players[1].shiny).toBeUndefined();
  });

  it('l’adversaire ne voit pas les exemplaires brillants de son grimoire, mais voit une unité brillante', () => {
    const state = gameWith([], { players: { 1: { mana: 10, grimoire: ['eclaireur', 'chevalier'], shiny: ['eclaireur'] } } });
    const placed = play(state, 'eclaireur');
    expect(getPlayerView(state, 1).me.shiny).toEqual(['eclaireur']);
    expect(getPlayerView(state, 2).opponent).not.toHaveProperty('shiny');
    expect(getPlayerView(placed, 2).units.u1!.shiny).toBe(true);
  });
});
