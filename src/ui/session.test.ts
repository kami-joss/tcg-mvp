import { describe, expect, it } from 'vitest';
import { BATTLEFIELD, BATTLEFIELD_13, DECKS } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import type { Action } from '../engine';
import { DEFAULT_SETUP, newSession, rollOpening, updateSession, viewerOf } from './session';
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
      opening: null,
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

describe('lancer de dés d’ouverture (SPEC.md §4.1)', () => {
  /** Un `random` qui rend les faces données dans l'ordre (la face f est tirée avec (f − 1) / 6). */
  const faces = (...values: number[]) => {
    const queue = [...values];
    return () => (queue.shift()! - 1) / 6 + 0.01;
  };

  it('un dé à 6 faces par joueur ; le plus haut gagne', () => {
    expect(rollOpening(faces(2, 5))).toEqual({ rolls: [{ 1: 2, 2: 5 }], winner: 2, chosen: null });
    expect(rollOpening(faces(6, 1))).toMatchObject({ winner: 1 });
  });

  it('en cas d’égalité, on relance : les égalités restent visibles, le dernier lancer désigne le gagnant', () => {
    const opening = rollOpening(faces(3, 3, 4, 4, 6, 2));
    expect(opening.rolls).toEqual([{ 1: 3, 2: 3 }, { 1: 4, 2: 4 }, { 1: 6, 2: 2 }]);
    expect(opening.winner).toBe(1);
  });

  it('jamais hors de 1 à 6', () => {
    for (const values of [[0, 0.5], [0.999999, 0]]) {
      const queue = [...values];
      const [first] = rollOpening(() => queue.shift()!).rolls;
      expect([first![1], first![2]].every((v) => v >= 1 && v <= 6)).toBe(true);
    }
  });

  it('avant le choix du gagnant, personne ne joue', () => {
    const session = newSession(1, DEFAULT_SETUP, rollOpening(faces(2, 5)));
    expect(session.opening).toMatchObject({ winner: 2, chosen: null });
    expect(play(session, END_TURN)).toBe(session);
  });

  it('le gagnant choisit : J2 peut commencer (tour 1, mana de base, journal à jour)', () => {
    const session = updateSession(newSession(1, DEFAULT_SETUP, rollOpening(faces(2, 5))), { type: 'chooseFirst', first: 2 });
    expect(session.opening).toBeNull();
    expect(session.game).toMatchObject({ activePlayer: 2, turn: 1 });
    expect(session.game.players[2].mana).toBe(3);
    expect(viewerOf(session)).toBe(2);
    expect(session.log.map((e) => e.text)).toContain('Lancer de dés : J1 2 · J2 5. J2 a le plus gros chiffre et choisit de commencer.');
    expect(session.log.at(-1)).toMatchObject({ kind: 'turn', player: 2, text: 'J2 commence avec 3 mana.' });
  });

  it('le gagnant peut aussi laisser l’autre commencer', () => {
    const session = updateSession(newSession(1, DEFAULT_SETUP, rollOpening(faces(2, 5))), { type: 'chooseFirst', first: 1 });
    expect(session.game.activePlayer).toBe(1);
    expect(session.log.map((e) => e.text)).toContain('Lancer de dés : J1 2 · J2 5. J2 a le plus gros chiffre et laisse J1 commencer.');
    // Une fois la partie lancée, un nouveau choix n'a plus d'effet.
    expect(updateSession(session, { type: 'chooseFirst', first: 2 })).toBe(session);
  });

  it('les égalités figurent dans le journal', () => {
    const session = updateSession(newSession(1, DEFAULT_SETUP, rollOpening(faces(3, 3, 6, 1))), { type: 'chooseFirst', first: 1 });
    expect(session.log.map((e) => e.text)).toContain('Lancer de dés : J1 3 · J2 3 (égalité, on relance), J1 6 · J2 1. J1 a le plus gros chiffre et choisit de commencer.');
  });

  it('contre l’IA : si elle gagne, elle commence, après le clic de l’humain', () => {
    const setup = { ...DEFAULT_SETUP, ai: 2 as const };
    const session = newSession(1, setup, rollOpening(faces(1, 6)));
    expect(session.opening).toMatchObject({ winner: 2, chosen: 2 });
    expect(session.game.activePlayer).toBe(2);
    expect(play(session, END_TURN)).toBe(session);
    const ready = updateSession(session, { type: 'ready' });
    expect(ready.opening).toBeNull();
    expect(ready.game.activePlayer).toBe(2);
    expect(viewerOf(ready)).toBe(1);
  });

  it('contre l’IA : si l’humain gagne, il choisit', () => {
    const session = newSession(1, { ...DEFAULT_SETUP, ai: 2 }, rollOpening(faces(5, 2)));
    expect(session.opening).toMatchObject({ winner: 1, chosen: null });
    expect(updateSession(session, { type: 'ready' }).opening).toMatchObject({ winner: 1, chosen: null });
  });

  it('nouvelle partie : le lancer repart avec la partie', () => {
    const restarted = updateSession(newSession(1), { type: 'restart', opening: rollOpening(faces(4, 1)) });
    expect(restarted.opening).toMatchObject({ winner: 1, chosen: null });
    expect(updateSession(newSession(1), { type: 'restart' }).opening).toBeNull();
  });
});
