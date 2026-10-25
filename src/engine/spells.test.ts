import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { getCard } from './cards';
import { IllegalActionError } from './errors';
import { createGame } from './game';
import { at, deepFreeze, gameWith } from './test-utils';
import { getUnitsAt } from './units';
import type { Action, CardId, Direction, GameState, Position, UnitId } from './types';

const cast = (cardId: CardId, unitId: UnitId): Action => ({ type: 'playCard', cardId, target: { kind: 'unit', unitId } });
const gust = (unitId: UnitId, direction: Direction): Action => ({
  type: 'playCard',
  cardId: 'bourrasque',
  target: { kind: 'unitAndDirection', unitId, direction },
});
const move = (unitId: UnitId, to: Position): Action => ({ type: 'move', unitId, to });
const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const END_TURN: Action = { type: 'endTurn' };
const MANA = { players: { 1: { mana: 10 } } };
const spellActions = (state: GameState, cardId: CardId) =>
  getLegalActions(state).filter((a) => a.type === 'playCard' && a.cardId === cardId);

describe('sorts (SPEC.md §4.3, §6)', () => {
  it('un sort paie son coût et passe dans la pile « utilisées »', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], MANA);
    const after = applyAction(state, cast('charge', 'u1'));
    expect(after.players[1].mana).toBe(9);
    expect(after.players[1].used).toEqual(['charge']);
    expect(after.players[1].grimoire).not.toContain('charge');
  });

  it('un sort sans cible valide n’est pas jouable', () => {
    const state = createGame(); // aucun monstre sur le plateau
    for (const cardId of ['boule-de-feu', 'charge', 'bourrasque', 'benediction'] as const) {
      expect(spellActions(state, cardId), cardId).toEqual([]);
    }
    expect(() => applyAction(state, cast('charge', 'u1'))).toThrow(IllegalActionError);
  });

  it('un sort vise un monstre, pas une case', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], MANA);
    const onCell: Action = { type: 'playCard', cardId: 'charge', target: { kind: 'cell', pos: at(8, 1) } };
    expect(() => applyAction(state, onCell)).toThrow(IllegalActionError);
  });

  it('est refusé si le mana est insuffisant', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { mana: 1 } } },
    );
    expect(() => applyAction(state, cast('boule-de-feu', 'u2'))).toThrow(/Mana insuffisant/);
  });

  it('toutes les cibles proposées sont acceptées, sans muter l’état', () => {
    const state = deepFreeze(
      gameWith(
        [
          { monster: 'milicien', owner: 1, at: at(8, 1) },
          { monster: 'golem', owner: 2, at: at(8, 3) },
          { monster: 'eclaireur', owner: 2, at: at(5, 3) },
          { terrain: 'bastion', owner: 2, at: at(5, 4) },
        ],
        MANA,
      ),
    );
    const snapshot = structuredClone(state);
    const actions = getLegalActions(state).filter((a) => a.type === 'playCard' && getCard(a.cardId).kind === 'spell');
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(() => applyAction(state, action)).not.toThrow();
    expect(state).toEqual(snapshot);
  });
});

describe('Boule de feu', () => {
  it('inflige 2 dégâts à un monstre ennemi à 3 pas d’un de mes monstres, en L et sans ligne de vue (§10)', () => {
    // (4,3) → (3,5) : 1 + 2 = 3 pas, avec les X (3,4) et (4,4) entre les deux.
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(4, 3) },
        { monster: 'golem', owner: 2, at: at(3, 5) },
      ],
      MANA,
    );
    const after = applyAction(state, cast('boule-de-feu', 'u2'));
    expect(after.units.u2?.hp).toBe(5);
    expect(after.players[1].mana).toBe(8);
  });

  it('refusée au-delà de 3 pas de tous mes monstres', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(6, 3) }, // 2 + 2 = 4 pas
      ],
      MANA,
    );
    expect(spellActions(state, 'boule-de-feu')).toEqual([]);
    expect(() => applyAction(state, cast('boule-de-feu', 'u2'))).toThrow(IllegalActionError);
  });

  it('la distance se mesure depuis n’importe lequel de mes monstres', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'archer', owner: 1, at: at(2, 2) },
        { monster: 'golem', owner: 2, at: at(1, 4) }, // loin du Milicien, à 1 + 2 = 3 pas de l'Archer
      ],
      MANA,
    );
    expect(applyAction(state, cast('boule-de-feu', 'u3')).units.u3?.hp).toBe(5);
  });

  it('ne vise ni un allié ni un terrain', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(5, 3) },
        { monster: 'golem', owner: 1, at: at(5, 2) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
      ],
      MANA,
    );
    expect(spellActions(state, 'boule-de-feu')).toEqual([]);
    expect(() => applyAction(state, cast('boule-de-feu', 'u2'))).toThrow(IllegalActionError);
    expect(() => applyAction(state, cast('boule-de-feu', 'u3'))).toThrow(IllegalActionError);
  });

  it('détruire un monstre rapporte 1 VP au lanceur (§4.7)', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 3) },
      ],
      MANA,
    );
    const after = applyAction(state, cast('boule-de-feu', 'u2'));
    expect(after.units.u2).toBeUndefined();
    expect(after.players[1].vp).toBe(1);
  });
});

describe('Charge', () => {
  it('donne +2 mobilité pour ce tour', () => {
    let state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], MANA); // mobilité 2
    state = applyAction(state, cast('charge', 'u1'));
    expect(state.units.u1).toMatchObject({ mobilityLeft: 4 });
    state = applyAction(state, move('u1', at(8, 5)));
    expect(state.units.u1).toMatchObject({ pos: at(8, 5), mobilityLeft: 0 });
  });

  it('fonctionne aussi sur un monstre qui a déjà dépensé sa mobilité', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1), mobilityLeft: 0 }], MANA);
    expect(applyAction(state, cast('charge', 'u1')).units.u1).toMatchObject({ mobilityLeft: 2 });
  });

  it('le bonus ne dure que ce tour', () => {
    let state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], MANA);
    state = applyAction(state, cast('charge', 'u1'));
    state = applyAction(applyAction(state, END_TURN), END_TURN);
    expect(state.units.u1).toMatchObject({ mobilityLeft: 2 });
  });

  it('ne vise qu’un monstre allié', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 3) },
      ],
      MANA,
    );
    expect(() => applyAction(state, cast('charge', 'u2'))).toThrow(IllegalActionError);
  });
});

describe('Bénédiction', () => {
  it('donne définitivement +1 ATK, +1 PV et +1 PV max', () => {
    let state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) }, // ATK 2, PV 3
        { monster: 'golem', owner: 2, at: at(8, 2) }, // PV 7
      ],
      MANA,
    );
    state = applyAction(state, cast('benediction', 'u1'));
    expect(state.units.u1).toMatchObject({ atk: 3, hp: 4, maxHp: 4 });
    state = applyAction(applyAction(state, END_TURN), END_TURN);
    expect(state.units.u1).toMatchObject({ atk: 3, hp: 4, maxHp: 4 });
    expect(applyAction(state, attack('u1', 'u2')).units.u2?.hp).toBe(4);
  });

  it('sur un monstre blessé, ajoute aussi 1 PV à ses PV actuels', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1), hp: 1 }], MANA);
    expect(applyAction(state, cast('benediction', 'u1')).units.u1).toMatchObject({ hp: 2, maxHp: 4 });
  });

  it('ne vise qu’un monstre allié', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 3) },
      ],
      MANA,
    );
    expect(() => applyAction(state, cast('benediction', 'u2'))).toThrow(IllegalActionError);
  });
});

describe('Bourrasque', () => {
  it('recule un monstre ennemi de 2 cases dans la direction choisie, sans toucher à sa mobilité', () => {
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }], MANA);
    expect(applyAction(state, gust('u1', 'right')).units.u1).toMatchObject({ pos: at(8, 3), mobilityLeft: 2 });
  });

  it('s’arrête avant une case X ou hors plateau', () => {
    const state = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(3, 2) }, // X en (3,4)
        { monster: 'golem', owner: 2, at: at(1, 3) }, // (-1,3) n'existe pas
      ],
      MANA,
    );
    expect(applyAction(state, gust('u1', 'right')).units.u1?.pos).toEqual(at(3, 3));
    expect(applyAction(state, gust('u2', 'up')).units.u2?.pos).toEqual(at(0, 3));
  });

  it('s’arrête avant un monstre, de son camp ou non', () => {
    const state = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(8, 1) },
        { monster: 'milicien', owner: 2, at: at(8, 3) },
        { monster: 'golem', owner: 2, at: at(1, 1) },
        { monster: 'milicien', owner: 1, at: at(1, 3) },
      ],
      MANA,
    );
    expect(applyAction(state, gust('u1', 'right')).units.u1?.pos).toEqual(at(8, 2));
    expect(applyAction(state, gust('u3', 'right')).units.u3?.pos).toEqual(at(1, 2));
  });

  it('s’arrête avant un terrain du camp adverse', () => {
    const state = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(2, 2) },
        { terrain: 'bastion', owner: 1, at: at(2, 4) }, // sur l'Écurie
      ],
      MANA,
    );
    expect(applyAction(state, gust('u1', 'right')).units.u1?.pos).toEqual(at(2, 3));
  });

  it('un terrain de son propre camp ne l’arrête pas : il le traverse ou s’arrête dessus (§10)', () => {
    const crossing = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(5, 3) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
      ],
      MANA,
    );
    expect(applyAction(crossing, gust('u1', 'right')).units.u1?.pos).toEqual(at(5, 5));

    const landing = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(5, 3) },
        { terrain: 'bastion', owner: 2, at: at(5, 4) },
        { monster: 'milicien', owner: 2, at: at(5, 5) },
      ],
      MANA,
    );
    expect(getUnitsAt(applyAction(landing, gust('u1', 'right')), at(5, 4)).map((u) => u.id)).toEqual(['u1', 'u2']);
  });

  it('quand son monstre est poussé, le terrain reste en place', () => {
    const state = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(2, 4) },
        { terrain: 'bastion', owner: 2, at: at(2, 4) }, // sur l'Écurie
      ],
      MANA,
    );
    const after = applyAction(state, gust('u1', 'right'));
    expect(after.units.u1?.pos).toEqual(at(2, 6));
    expect(after.units.u2?.pos).toEqual(at(2, 4));
  });

  it('interdite dans une direction où le monstre ne peut pas reculer (§10)', () => {
    const state = gameWith([{ monster: 'golem', owner: 2, at: at(9, 0) }], MANA);
    expect(() => applyAction(state, gust('u1', 'down'))).toThrow(IllegalActionError); // (10,0) n'existe pas
    expect(() => applyAction(state, gust('u1', 'left'))).toThrow(IllegalActionError);
    expect(spellActions(state, 'bourrasque')).toEqual([gust('u1', 'up'), gust('u1', 'right')]);
  });

  it('`vol` ne s’applique pas au recul : un Dragonnet s’arrête aussi avant une case X', () => {
    const state = gameWith([{ monster: 'dragonnet', owner: 2, at: at(3, 2) }], MANA);
    expect(applyAction(state, gust('u1', 'right')).units.u1?.pos).toEqual(at(3, 3));
  });

  it('ne vise qu’un monstre ennemi', () => {
    const state = gameWith([{ monster: 'golem', owner: 1, at: at(8, 1) }], MANA);
    expect(spellActions(state, 'bourrasque')).toEqual([]);
    expect(() => applyAction(state, gust('u1', 'right'))).toThrow(IllegalActionError);
  });
});

describe('un même sort, une fois par tour (SPEC.md §4.3)', () => {
  const state = gameWith(
    [
      { monster: 'milicien', owner: 1, at: at(8, 1) },
      { monster: 'chevalier', owner: 1, at: at(8, 3) },
    ],
    { players: { 1: { mana: 10, grimoire: ['charge', 'charge', 'benediction'] } } },
  );

  it('le second exemplaire attend le tour suivant ; un autre sort reste permis', () => {
    const once = applyAction(state, cast('charge', 'u1'));
    expect(spellActions(once, 'charge')).toEqual([]);
    expect(() => applyAction(once, cast('charge', 'u2'))).toThrow(IllegalActionError);
    expect(() => applyAction(once, cast('benediction', 'u2'))).not.toThrow();
    const nextTurn = applyAction(applyAction(once, END_TURN), END_TURN);
    expect(nextTurn.players[1].spellsThisTurn).toEqual([]);
    expect(spellActions(nextTurn, 'charge').length).toBeGreaterThan(0);
  });

  it('les monstres et terrains ne sont pas concernés', () => {
    const twice = gameWith([], { players: { 1: { mana: 10, grimoire: ['eclaireur', 'eclaireur'] } } });
    const summon = (pos: Position): Action => ({ type: 'playCard', cardId: 'eclaireur', target: { kind: 'cell', pos } });
    expect(() => applyAction(applyAction(twice, summon(at(0, 3))), summon(at(0, 4)))).not.toThrow();
  });
});
