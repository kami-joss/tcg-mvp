import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { at, gameWith } from './test-utils';
import { getPlayerView } from './view';
import type { Action, CardId, GameState, Position } from './types';

// Sur le plateau et cimetière (SPEC.md §4.3, §10) : publics. Un sort va au cimetière ; un monstre ou un terrain arrive
// sur le plateau et n'ira au cimetière qu'en le quittant. Les unités cachées comptent sur le plateau, sans leur case.

const play = (cardId: CardId, target: Extract<Action, { type: 'playCard' }>['target']): Action => ({ type: 'playCard', cardId, target });
const onCell = (cardId: CardId, pos: Position) => play(cardId, { kind: 'cell', pos });
const activate = (unitId: string, target: Extract<Action, { type: 'activateEffect' }>['target']): Action => ({
  type: 'activateEffect',
  unitId,
  target,
});
const END_TURN: Action = { type: 'endTurn' };

/** Rend une unité brillante, comme si son exemplaire l'était. */
const shiny = (state: GameState, unitId: string): GameState => ({
  ...state,
  units: { ...state.units, [unitId]: { ...state.units[unitId]!, shiny: true } },
});

describe('sur le plateau ou au cimetière (SPEC.md §4.3, §10)', () => {
  it('une invocation, un sort, un terrain : seul le sort va au cimetière, le monstre et le terrain sont sur le plateau', () => {
    const start = gameWith([], { players: { 1: { mana: 10, grimoire: ['milicien', 'charge', 'bastion'] } } });
    const summoned = applyAction(start, onCell('milicien', at(0, 4)));
    expect(summoned.units.u1?.cardId).toBe('milicien');
    expect(summoned.players[1].graveyard).toEqual([]);

    const cast = applyAction(summoned, play('charge', { kind: 'unit', unitId: 'u1' }));
    const moved = applyAction(cast, { type: 'move', unitId: 'u1', to: at(2, 4) });
    const placed = applyAction(moved, onCell('bastion', at(2, 4)));
    expect(Object.values(placed.units).map((unit) => unit.cardId)).toEqual(['milicien', 'bastion']);
    expect(placed.players[1].graveyard).toEqual([{ cardId: 'charge' }]);
    expect(placed.players[2].graveyard).toEqual([]);
  });

  it('le monstre invoqué par l’Invocateur arrive sur le plateau, pas au cimetière', () => {
    const state = gameWith([{ monster: 'invocateur', owner: 1, at: at(2, 2) }], {
      players: { 1: { mana: 10, grimoire: ['golem'] } },
    });
    const after = applyAction(state, activate('u1', { kind: 'cellAndCard', pos: at(3, 3), cardId: 'golem' }));
    expect(Object.values(after.units).map((unit) => unit.cardId)).toEqual(['invocateur', 'golem']);
    expect(after.players[1].graveyard).toEqual([]);
  });

  it('évolution : le dragon arrive sur le plateau, le Jeune dragon sacrifié va au cimetière', () => {
    const state = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 2) }], {
      players: { 1: { mana: 3, grimoire: ['dragon-feu'] } }, // Évolution draconique : 3 mana
      turn: 3,
    });
    const after = applyAction(state, activate('u1', { kind: 'card', cardId: 'dragon-feu' }));
    expect(Object.values(after.units).map((unit) => unit.cardId)).toEqual(['dragon-feu']);
    expect(after.players[1].graveyard).toEqual([{ cardId: 'jeune-dragon' }]);
  });

  it('ni la transformation d’Emma ni un piège ne mettent de carte au cimetière', () => {
    const emma = gameWith([{ monster: 'emma', owner: 1, at: at(2, 2) }], { players: { 1: { mana: 5 } } });
    const bat = applyAction(emma, activate('u1', { kind: 'unit', unitId: 'u1' }));
    expect(bat.units.u1?.cardId).toBe('emma-chauve-souris');
    expect(bat.players[1].graveyard).toEqual([]);

    const trapper = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(2, 2) }], { players: { 1: { mana: 5 } } });
    const trapped = applyAction(trapper, activate('u1', { kind: 'cell', pos: at(2, 3) }));
    expect(trapped.traps).toHaveLength(1);
    expect(trapped.players[1].graveyard).toEqual([]);
  });
});

describe('exemplaires brillants sur le plateau et au cimetière (§10)', () => {
  it('le premier exemplaire joué est le brillant ; le suivant ne l’est pas', () => {
    const state = gameWith([], {
      players: { 1: { mana: 10, grimoire: ['archer-de-glace', 'archer-de-glace'], shiny: ['archer-de-glace'] } },
    });
    const first = applyAction(state, onCell('archer-de-glace', at(0, 3)));
    const second = applyAction(first, onCell('archer-de-glace', at(0, 5)));
    expect(second.units.u1?.shiny).toBe(true);
    expect(second.units.u2?.shiny).toBeUndefined();
  });

  it('un sort ne l’est jamais au cimetière', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(2, 2) }], {
      players: { 1: { mana: 10, grimoire: ['charge'], shiny: ['charge'] } },
    });
    const after = applyAction(state, play('charge', { kind: 'unit', unitId: 'u1' }));
    expect(after.players[1].graveyard).toEqual([{ cardId: 'charge' }]);
    expect(after.players[1].shiny).toEqual([]);
  });

  it('une unité brillante qui quitte le plateau va au cimetière brillante', () => {
    const state = shiny(
      gameWith([
        { monster: 'golem', owner: 1, at: at(2, 1) },
        { monster: 'milicien', owner: 2, at: at(2, 2), hp: 1 },
      ]),
      'u2',
    );
    const after = applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false });
    expect(after.units.u2).toBeUndefined();
    expect(after.players[2].graveyard).toEqual([{ cardId: 'milicien', shiny: true }]);
  });
});

describe('sur le plateau dans la vue de chaque joueur (§4.3, §10)', () => {
  // J2 invoque un Farceur brillant sur sa case d'invocation ; le Chevalier de J1 est loin (camouflage 2).
  const farceur = (j1At: Position) =>
    applyAction(
      gameWith([{ monster: 'chevalier', owner: 1, at: j1At }], {
        activePlayer: 2,
        players: { 2: { mana: 5, grimoire: ['farceur', 'milicien'], shiny: ['farceur'] } },
      }),
      onCell('farceur', at(10, 4)),
    );

  it('public : l’adversaire sait qu’un monstre camouflé est sur le plateau, par sa carte, sans sa case ni son unité', () => {
    const state = farceur(at(0, 4));
    const view = getPlayerView(state, 1);
    expect(view.hiddenEnemies).toEqual(['u2']);
    expect(view.units.u2).toBeUndefined();
    expect(view.opponent.onBoardHidden).toEqual([{ cardId: 'farceur' }]);
    expect(JSON.stringify(view.opponent)).not.toMatch(/"row"|"col"|milicien|u2/);
  });

  it('l’exemplaire brillant d’un monstre caché n’est pas montré brillant, tant que l’adversaire ne le voit pas', () => {
    const hidden = farceur(at(0, 4));
    expect(getPlayerView(hidden, 1).opponent.onBoardHidden).toEqual([{ cardId: 'farceur' }]);
    expect(getPlayerView(hidden, 2).units.u2?.shiny).toBe(true);

    const seen = farceur(at(8, 4));
    expect(getPlayerView(seen, 1).hiddenEnemies).toEqual([]);
    expect(getPlayerView(seen, 1).opponent.onBoardHidden).toEqual([]);
    expect(getPlayerView(seen, 1).units.u2?.shiny).toBe(true);
  });

  it('une unité cachée reste comptée d’un tour à l’autre, et ne l’est plus quand elle quitte le plateau', () => {
    const state = applyAction(farceur(at(0, 4)), END_TURN);
    expect(getPlayerView(state, 1).opponent.onBoardHidden).toEqual([{ cardId: 'farceur' }]);
    const { u2: _gone, ...units } = state.units;
    expect(getPlayerView({ ...state, units }, 1).opponent.onBoardHidden).toEqual([]);
  });
});
