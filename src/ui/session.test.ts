import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, BATTLEFIELD_13, DECKS } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import type { Action } from '../engine';
import { DEFAULT_SETUP, newSession, updateSession, viewerOf } from './session';
import type { Session } from './session';

const END_TURN: Action = { type: 'endTurn' };
const play = (session: Session, action: Action) => updateSession(session, { type: 'play', action });

describe('session hotseat (SPEC.md §4.3)', () => {
  it('une nouvelle partie s’ouvre directement sur le jeu de J1, sans écran de passage', () => {
    const session = newSession(1);
    expect(session.handoffTo).toBeNull();
    expect(session.game.activePlayer).toBe(1);
    expect(session.log.map((entry) => entry.text)).toEqual([
      'Début de la partie sur la carte « Champ de bataille (13 × 13) », J1 avec le deck Classique, J2 avec le deck Classique.',
      'J1 commence avec 3 mana.',
    ]);
  });

  it('les actions pendant le tour ne déclenchent pas d’écran de passage', () => {
    const summon: Action = { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 1) } };
    const session = play(newSession(1), summon);
    expect(session.handoffTo).toBeNull();
    expect(session.log.at(-1)).toMatchObject({ kind: 'action', player: 1, icon: 'dragon-head', text: 'J1 invoque Milicien en (0, 1).' });
  });

  it('« Fin du tour » masque le jeu jusqu’à ce que le joueur suivant prenne l’écran', () => {
    const handoff = play(newSession(1), END_TURN);
    expect(handoff.handoffTo).toBe(2);
    expect(handoff.game.activePlayer).toBe(2);

    const ready = updateSession(handoff, { type: 'ready' });
    expect(ready.handoffTo).toBeNull();
    expect(ready.game).toBe(handoff.game);

    // Et ainsi de suite à chaque tour, dans les deux sens.
    const toJ1 = play(ready, END_TURN);
    expect(toJ1.handoffTo).toBe(1);
    expect(play(updateSession(toJ1, { type: 'ready' }), END_TURN).handoffTo).toBe(2);
  });

  it('pendant le passage, aucune action n’est prise en compte', () => {
    const handoff = play(newSession(1), END_TURN);
    expect(play(handoff, END_TURN)).toBe(handoff);
  });

  it('pas d’écran de passage quand la partie se termine au début du tour suivant', () => {
    const session: Session = {
      id: 1,
      game: gameWith([{ monster: 'milicien', owner: 1, at: at(5, 4) }], {
        activePlayer: 2,
        players: { 1: { vp: 29 } },
      }),
      previous: null,
      setup: DEFAULT_SETUP,
      log: [],
      handoffTo: null,
    };
    const after = play(session, END_TURN);
    expect(after.game.winner).toBe(1);
    expect(after.handoffTo).toBeNull();
  });

  it('une action refusée est notée au journal, sans changer la partie', () => {
    const session = newSession(1);
    const after = play(session, { type: 'move', unitId: 'u42', to: at(1, 1) });
    expect(after.game).toBe(session.game);
    expect(after.log.at(-1)?.text).toMatch(/^Action refusée : /);
  });

  it('« Nouvelle partie » repart de zéro', () => {
    const finished = play(newSession(1), END_TURN);
    const restarted = updateSession(finished, { type: 'restart' });
    expect(restarted).toMatchObject({ id: 2, handoffTo: null });
    expect(restarted.game).toMatchObject({ turn: 1, activePlayer: 1, units: {} });
    expect(restarted.log).toHaveLength(2);
  });

  it('« Nouvelle partie » peut changer de carte et de decks ; sinon elle garde les mêmes', () => {
    const [classique, archers, pieges] = DECKS;
    const setup = { board: BATTLEFIELD, decks: { 1: archers!, 2: pieges! } };
    const changed = updateSession(newSession(1), { type: 'restart', setup });
    expect(changed.game.board).toBe(BATTLEFIELD);
    expect(changed.game.players[1].grimoire).toEqual(archers!.cards);
    expect(changed.game.players[2].grimoire).toEqual(pieges!.cards);
    expect(updateSession(changed, { type: 'restart' }).setup).toBe(setup);
    expect(newSession(1).game.board).toBe(BATTLEFIELD_13);
    expect(newSession(1).setup.decks[1]).toBe(classique);
  });
});

describe('contre l’IA (SPEC.md §7 bis)', () => {
  const setup = { ...DEFAULT_SETUP, ai: 2 as const };

  it('pas d’écran de passage, et l’écran montre toujours la vue du joueur humain', () => {
    const session = newSession(1, setup);
    expect(viewerOf(session)).toBe(1);
    const aiTurn = play(session, END_TURN);
    expect(aiTurn.handoffTo).toBeNull();
    expect(aiTurn.game.activePlayer).toBe(2);
    expect(viewerOf(aiTurn)).toBe(1);
    expect(play(aiTurn, END_TURN).handoffTo).toBeNull();
  });

  it('en hotseat, la vue suit le joueur actif', () => {
    const session = play(newSession(1), END_TURN);
    expect(viewerOf(session)).toBe(2);
  });
});
