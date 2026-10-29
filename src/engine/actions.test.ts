import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { BOARDS, isPlayable } from './board';
import { DECKS, TEST_GRIMOIRE } from './cards';
import { VICTORY_VP } from './config';
import { createGame } from './game';
import { at, gameWith } from './test-utils';
import type { Action, GameState, Unit } from './types';

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Invariants qui doivent tenir dans toute position atteignable. */
function expectInvariants(state: GameState): void {
  const byCell = new Map<string, Unit[]>();
  for (const unit of Object.values(state.units)) {
    expect(isPlayable(state.board, unit.pos)).toBe(true);
    expect(unit.hp).toBeGreaterThan(0);
    expect(unit.hp).toBeLessThanOrEqual(unit.maxHp);
    if (unit.kind === 'monster') expect(unit.mobilityLeft).toBeGreaterThanOrEqual(0);
    const key = `${unit.pos.row},${unit.pos.col}`;
    byCell.set(key, [...(byCell.get(key) ?? []), unit]);
  }
  for (const units of byCell.values()) {
    // Au plus un monstre et un terrain par case, d'un seul joueur.
    expect(units.filter((u) => u.kind === 'monster').length).toBeLessThanOrEqual(1);
    expect(units.filter((u) => u.kind === 'terrain').length).toBeLessThanOrEqual(1);
    expect(new Set(units.map((u) => u.owner)).size).toBe(1);
  }
  for (const player of [state.players[1], state.players[2]]) {
    expect(player.mana).toBeGreaterThanOrEqual(0);
    // Chaque carte est dans le grimoire, au cimetière ou sur le plateau (§4.3).
    const onBoard = Object.values(state.units).filter((u) => u.owner === player.id).length;
    expect(player.grimoire.length + player.graveyard.length + onBoard).toBe(TEST_GRIMOIRE.length);
  }
  if (state.winner !== null) expect(state.players[state.winner].vp).toBeGreaterThanOrEqual(VICTORY_VP);
  // Pièges : sur des cases jouables, au plus un par joueur et par case, jamais sous un monstre ennemi.
  for (const trap of state.traps) {
    expect(isPlayable(state.board, trap.pos)).toBe(true);
    expect(state.traps.filter((t) => t.owner === trap.owner && t.pos.row === trap.pos.row && t.pos.col === trap.pos.col)).toHaveLength(1);
    const units = Object.values(state.units).filter((u) => u.pos.row === trap.pos.row && u.pos.col === trap.pos.col);
    expect(units.every((u) => u.owner === trap.owner)).toBe(true);
  }
}

describe('cohérence du moteur', () => {
  it('dans une position chargée, chaque action proposée est unique et acceptée', () => {
    const state = gameWith(
      [
        { monster: 'chaman', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 1, at: at(8, 2), hp: 1 },
        { monster: 'mage', owner: 1, at: at(5, 3) },
        { monster: 'dragonnet', owner: 1, at: at(4, 3) },
        { monster: 'porte-etendard', owner: 1, at: at(5, 1) },
        { monster: 'gardien', owner: 2, at: at(8, 3) },
        { monster: 'golem', owner: 2, at: at(5, 4) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
        { monster: 'archer', owner: 2, at: at(5, 6) },
      ],
      { players: { 1: { mana: 20 } } },
    );
    const actions = getLegalActions(state);
    expect(new Set(actions.map((a) => JSON.stringify(a))).size).toBe(actions.length);
    for (const type of ['playCard', 'move', 'attack', 'activateEffect', 'endTurn'] as const) {
      expect(actions.some((a) => a.type === type), type).toBe(true);
    }
    for (const action of actions) expect(() => applyAction(state, action)).not.toThrow();
  });

  const deck = (id: string) => DECKS.find((d) => d.id === id)!.cards;
  const scenarios = [
    ['classique, decks classiques', BOARDS[0]!, deck('classique'), deck('classique')],
    ['classique, archers contre pièges', BOARDS[0]!, deck('archers'), deck('pieges')],
    ['champ de bataille, pièges contre archers', BOARDS[1]!, deck('pieges'), deck('archers')],
  ] as const;

  it.each(scenarios)(
    'des parties jouées au hasard respectent toujours les invariants du jeu (%s)',
    (_name, board, deck1, deck2) => {
      const played = new Set<Action['type']>();
      let finished = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const random = seededRandom(seed);
        let state = createGame(board, { 1: deck1, 2: deck2 });
        for (let step = 0; step < 800 && state.winner === null; step++) {
          const actions = getLegalActions(state);
          // Régulièrement, toutes les actions proposées doivent être acceptées.
          if (step % 25 === 0) for (const action of actions) applyAction(state, action);
          const action = actions[Math.floor(random() * actions.length)]!;
          played.add(action.type);
          state = applyAction(state, action);
          expectInvariants(state);
        }
        if (state.winner !== null) finished++;
      }
      // Les parties vont assez loin pour exercer tout le moteur.
      expect(played).toEqual(new Set(['playCard', 'move', 'attack', 'activateEffect', 'endTurn']));
      expect(finished).toBeGreaterThan(0);
    },
    // Quelques secondes en local, bien plus sur la machine de publication (GitHub Actions) : 5 s ne suffisent pas.
    60_000,
  );
});
