import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import {
  BASE_MANA_PER_TURN,
  MANA_PER_CONTROLLED_ZONE,
  PLAYER2_FIRST_TURN_BONUS_MANA,
  VICTORY_VP,
  VP_PER_CONTROLLED_ZONE,
} from './config';
import { createGame } from './game';
import { addVp } from './players';
import { at, deepFreeze, gameWith } from './test-utils';
import type { Action, GameState, Position, UnitId } from './types';

const END_TURN: Action = { type: 'endTurn' };
const move = (unitId: UnitId, to: Position): Action => ({ type: 'move', unitId, to });
const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });

function endTurns(state: GameState, count: number): GameState {
  let next = state;
  for (let i = 0; i < count; i++) next = applyAction(next, END_TURN);
  return next;
}

const FORGE = at(5, 4);
const SCIERIE = at(5, 1);
const MINE = at(5, 7);

describe('fin du tour (SPEC.md §4.2)', () => {
  it('passe la main à l’adversaire et fait avancer le numéro de tour', () => {
    const turn2 = endTurns(createGame(), 1);
    expect(turn2).toMatchObject({ activePlayer: 2, turn: 2 });
    expect(endTurns(turn2, 1)).toMatchObject({ activePlayer: 1, turn: 3 });
  });

  it('est toujours proposée, même quand plus rien d’autre n’est possible', () => {
    expect(getLegalActions(createGame())).toContainEqual(END_TURN);
    const exhausted = gameWith(
      [{ monster: 'eclaireur', owner: 1, at: at(8, 1), mobilityLeft: 0, hasAttacked: true }],
      { players: { 1: { mana: 0 } } },
    );
    expect(getLegalActions(exhausted)).toEqual([END_TURN]);
  });

  it('après la fin du tour, le joueur ne peut plus agir', () => {
    const state = endTurns(gameWith([{ monster: 'eclaireur', owner: 1, at: at(8, 1) }]), 1);
    expect(() => applyAction(state, move('u1', at(8, 2)))).toThrow(/joueur actif/);
  });

  it('ne mute pas l’état et est déterministe', () => {
    const state = deepFreeze(gameWith([{ monster: 'milicien', owner: 2, at: FORGE }], { activePlayer: 2 }));
    const snapshot = structuredClone(state);
    const a = applyAction(state, END_TURN);
    const b = applyAction(state, END_TURN);
    expect(state).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('début de tour : mana (SPEC.md §4.2)', () => {
  it('J1 commence avec le mana de base ; le premier tour de J2 lui rapporte +1 mana', () => {
    const game = createGame();
    expect(game.players[1].mana).toBe(BASE_MANA_PER_TURN);
    expect(endTurns(game, 1).players[2].mana).toBe(BASE_MANA_PER_TURN + PLAYER2_FIRST_TURN_BONUS_MANA);
  });

  it('le bonus de J2 ne s’applique qu’à son tout premier tour, et jamais à J1', () => {
    const turn3 = endTurns(createGame(), 2);
    expect(turn3.players[1].mana).toBe(2 * BASE_MANA_PER_TURN);
    const turn4 = endTurns(turn3, 1);
    expect(turn4.players[2].mana).toBe(2 * BASE_MANA_PER_TURN + PLAYER2_FIRST_TURN_BONUS_MANA);
  });

  it('le mana non dépensé est conservé d’un tour à l’autre, sans plafond', () => {
    const state = gameWith([], { players: { 1: { mana: 50 }, 2: { mana: 40 } } });
    const next = endTurns(state, 2); // début du tour de J2 (son premier), puis de J1
    expect(next.players[1].mana).toBe(50 + BASE_MANA_PER_TURN);
    expect(next.players[2].mana).toBe(40 + BASE_MANA_PER_TURN + PLAYER2_FIRST_TURN_BONUS_MANA);
  });

  it('seul le joueur actif reçoit du mana au début de son tour', () => {
    const next = endTurns(gameWith([], { players: { 1: { mana: 0 } } }), 1);
    expect(next.players[1].mana).toBe(0);
  });
});

describe('début de tour : mana zones contrôlées (SPEC.md §4.2, §4.4)', () => {
  it('chaque mana zone contrôlée rapporte du mana et 1 VP au joueur actif', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: FORGE },
        { monster: 'eclaireur', owner: 1, at: SCIERIE },
      ],
      { activePlayer: 2, players: { 1: { mana: 0, vp: 0 } } },
    );
    const turn = endTurns(state, 1);
    expect(turn.players[1].mana).toBe(BASE_MANA_PER_TURN + 2 * MANA_PER_CONTROLLED_ZONE);
    expect(turn.players[1].vp).toBe(2 * VP_PER_CONTROLLED_ZONE);
  });

  it('une zone neutre ne rapporte rien', () => {
    const turn = endTurns(gameWith([], { activePlayer: 2, players: { 1: { mana: 0, vp: 0 } } }), 1);
    expect(turn.players[1]).toMatchObject({ mana: BASE_MANA_PER_TURN, vp: 0 });
  });

  it('les zones de chaque joueur ne lui rapportent qu’au début de son propre tour', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: FORGE },
        { monster: 'golem', owner: 2, at: MINE },
      ],
      { activePlayer: 2, players: { 1: { mana: 0, vp: 0 }, 2: { mana: 0, vp: 0 } } },
    );
    const withOneZone = { mana: BASE_MANA_PER_TURN + MANA_PER_CONTROLLED_ZONE, vp: VP_PER_CONTROLLED_ZONE };

    const turn3 = endTurns(state, 1); // début du tour de J1
    expect(turn3.players[1]).toMatchObject(withOneZone);
    expect(turn3.players[2]).toMatchObject({ mana: 0, vp: 0 });

    const turn4 = endTurns(turn3, 1); // début du tour de J2
    expect(turn4.players[2]).toMatchObject(withOneZone);
    expect(turn4.players[1]).toMatchObject(withOneZone);
  });

  it('un terrain seul tient la zone et rapporte à son propriétaire (§4.9)', () => {
    const state = gameWith([{ terrain: 'bastion', owner: 1, at: FORGE }], {
      activePlayer: 2,
      players: { 1: { mana: 0, vp: 0 } },
    });
    expect(endTurns(state, 1).players[1]).toMatchObject({
      mana: BASE_MANA_PER_TURN + MANA_PER_CONTROLLED_ZONE,
      vp: VP_PER_CONTROLLED_ZONE,
    });
  });

  describe('le contrôle est évalué au début du tour', () => {
    it('passer sur une zone pendant son tour ne rapporte rien', () => {
      let state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(5, 3) }], { players: { 1: { mana: 0, vp: 0 } } });
      state = applyAction(state, move('u1', FORGE));
      expect(state.players[1]).toMatchObject({ mana: 0, vp: 0 });
      state = applyAction(state, move('u1', at(5, 5)));
      state = endTurns(state, 2); // début du tour suivant de J1
      expect(state.players[1]).toMatchObject({ mana: BASE_MANA_PER_TURN, vp: 0 });
    });

    it('occuper une zone en fin de tour rapporte au début de son tour suivant', () => {
      let state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(5, 3) }], { players: { 1: { mana: 0, vp: 0 } } });
      state = applyAction(state, move('u1', FORGE));
      state = endTurns(state, 1); // début du tour de J2 : rien pour J1
      expect(state.players[1]).toMatchObject({ mana: 0, vp: 0 });
      state = endTurns(state, 1); // début du tour de J1
      expect(state.players[1]).toMatchObject({
        mana: BASE_MANA_PER_TURN + MANA_PER_CONTROLLED_ZONE,
        vp: VP_PER_CONTROLLED_ZONE,
      });
    });

    it('une zone perdue pendant le tour adverse ne rapporte plus rien', () => {
      let state = gameWith(
        [
          { monster: 'eclaireur', owner: 1, at: FORGE },
          { monster: 'milicien', owner: 2, at: at(5, 5) },
        ],
        { activePlayer: 2, players: { 1: { mana: 0, vp: 0 } } },
      );
      state = applyAction(state, attack('u2', 'u1'));
      state = endTurns(state, 1);
      expect(state.players[1]).toMatchObject({ mana: BASE_MANA_PER_TURN, vp: 0 });
    });
  });
});

describe('début de tour : les monstres récupèrent (SPEC.md §4.2)', () => {
  const exhausted = { mobilityLeft: 0, hasAttacked: true, hasUsedEffect: true };

  it('les monstres du joueur actif récupèrent mobilité, attaque et effet activé ; pas ceux de l’adversaire', () => {
    const state = gameWith(
      [
        { monster: 'chevalier', owner: 1, at: at(8, 1), ...exhausted },
        { monster: 'golem', owner: 2, at: at(1, 1), ...exhausted },
      ],
      { activePlayer: 2 },
    );
    const turn = endTurns(state, 1);
    expect(turn.units.u1).toMatchObject({ mobilityLeft: 3, hasAttacked: false, hasUsedEffect: false });
    expect(turn.units.u2).toMatchObject(exhausted);
  });

  it('la mobilité revient à celle de la carte : le reste du tour précédent ne se cumule pas', () => {
    const state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1), mobilityLeft: 2 }], { activePlayer: 2 });
    expect(endTurns(state, 1).units.u1).toMatchObject({ mobilityLeft: 3 });
  });

  it('les dégâts restent d’un tour à l’autre', () => {
    const state = gameWith([{ monster: 'golem', owner: 1, at: at(8, 1), hp: 3 }], { activePlayer: 2 });
    expect(endTurns(state, 1).units.u1).toMatchObject({ hp: 3, maxHp: 7 });
  });
});

describe('victoire (SPEC.md §4.10)', () => {
  it('atteindre 20 VP en détruisant un monstre fait gagner immédiatement', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { vp: VICTORY_VP - 1 } } },
    );
    const after = applyAction(state, attack('u1', 'u2'));
    expect(after.players[1].vp).toBe(VICTORY_VP);
    expect(after.winner).toBe(1);
  });

  it('J2 peut gagner de la même façon pendant son tour', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 2, at: at(8, 1) },
        { monster: 'eclaireur', owner: 1, at: at(8, 2) },
      ],
      { activePlayer: 2, players: { 2: { vp: VICTORY_VP - 1 } } },
    );
    expect(applyAction(state, attack('u1', 'u2')).winner).toBe(2);
  });

  it('atteindre ou dépasser 20 VP au début du tour grâce aux zones fait gagner immédiatement', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: FORGE },
        { monster: 'eclaireur', owner: 1, at: SCIERIE },
      ],
      { activePlayer: 2, players: { 1: { vp: VICTORY_VP - 1 } } },
    );
    const turn = endTurns(state, 1);
    expect(turn.players[1].vp).toBe(VICTORY_VP + 1);
    expect(turn.winner).toBe(1);
  });

  it('en dessous de 20 VP, personne ne gagne', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: FORGE }], {
      activePlayer: 2,
      players: { 1: { vp: VICTORY_VP - 2 } },
    });
    const turn = endTurns(state, 1);
    expect(turn.players[1].vp).toBe(VICTORY_VP - 1);
    expect(turn.winner).toBeNull();
  });

  it('une fois la partie gagnée, plus aucune action n’est possible', () => {
    const won = applyAction(
      gameWith(
        [
          { monster: 'milicien', owner: 1, at: at(8, 1) },
          { monster: 'eclaireur', owner: 2, at: at(8, 2) },
          { monster: 'chevalier', owner: 1, at: at(9, 1) },
        ],
        { players: { 1: { vp: VICTORY_VP - 1 } } },
      ),
      attack('u1', 'u2'),
    );
    expect(getLegalActions(won)).toEqual([]);
    expect(() => applyAction(won, END_TURN)).toThrow(/partie est terminée/);
    expect(() => applyAction(won, move('u3', at(9, 2)))).toThrow(/partie est terminée/);
  });

  it('le premier joueur à atteindre 20 VP reste le vainqueur', () => {
    const won = addVp(gameWith([], { players: { 1: { vp: VICTORY_VP - 1 } } }), 1, 1);
    expect(won.winner).toBe(1);
    expect(addVp(won, 2, VICTORY_VP).winner).toBe(1);
  });
});
