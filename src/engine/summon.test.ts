import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { getCard } from './cards';
import { IllegalActionError } from './errors';
import { createGame } from './game';
import { getFreeSummonCells } from './play-card';
import { at, deepFreeze, gameWith } from './test-utils';
import { getMonsterAt } from './units';
import type { Action, CardId, Position } from './types';

const summon = (cardId: CardId, pos: Position): Action => ({ type: 'playCard', cardId, target: { kind: 'cell', pos } });

describe('invocation (SPEC.md §4.5)', () => {
  it('pose le monstre sur une case d’invocation libre de son camp', () => {
    const state = applyAction(createGame(), summon('milicien', at(0, 4)));
    expect(getMonsterAt(state, at(0, 4))).toMatchObject({ cardId: 'milicien', owner: 1 });
  });

  it('J2 invoque sur ses propres cases d’invocation', () => {
    const state = gameWith([], { activePlayer: 2, players: { 2: { mana: 3 } } });
    expect(getMonsterAt(applyAction(state, summon('milicien', at(10, 4))), at(10, 4))).toMatchObject({ owner: 2 });
    expect(() => applyAction(state, summon('milicien', at(0, 4)))).toThrow(IllegalActionError);
  });

  it('paie le coût et passe un seul exemplaire de la carte dans la pile « utilisées » (§4.3)', () => {
    const before = createGame();
    const after = applyAction(before, summon('eclaireur', at(0, 3)));
    expect(after.players[1].mana).toBe(before.players[1].mana - 1);
    expect(after.players[1].used).toEqual(['eclaireur']);
    expect(after.players[1].grimoire).toHaveLength(24);
    expect(after.players[1].grimoire.filter((id) => id === 'eclaireur')).toHaveLength(1);
    expect(after.players[2]).toEqual(before.players[2]);
  });

  it('le monstre invoqué a les stats de sa carte et peut agir immédiatement', () => {
    const state = applyAction(createGame(), summon('chevalier', at(0, 4)));
    expect(getMonsterAt(state, at(0, 4))).toEqual({
      kind: 'monster',
      id: 'u1',
      cardId: 'chevalier',
      owner: 1,
      pos: at(0, 4),
      hp: 4,
      maxHp: 4,
      atk: 3,
      atkBonus: 0,
      rangeBonus: 0,
      auraHp: 0,
      mobilityLeft: 3,
      froze: 0,
      boost: 0,
      hasAttacked: false,
      usedEffects: [],
      trail: [at(0, 4)],
      hasRiposted: false,
      summonedOnTurn: 1,
      facing: 'down',
      statuses: [],
      revealed: false,
    });
    // Mobilité complète dès ce tour : (0,4) → (1,4) → (1,3) → (1,2).
    const moved = applyAction(state, { type: 'move', unitId: 'u1', to: at(1, 2) });
    expect(moved.units.u1).toMatchObject({ pos: at(1, 2), mobilityLeft: 0 });
  });

  it('chaque unité invoquée reçoit un identifiant distinct et déterministe', () => {
    const state = applyAction(applyAction(createGame(), summon('eclaireur', at(0, 3))), summon('eclaireur', at(0, 5)));
    expect(Object.keys(state.units)).toEqual(['u1', 'u2']);
    expect(state.nextUnitId).toBe(3);
  });

  it('le mana exact suffit ; sinon l’invocation est refusée', () => {
    const state = createGame(); // J1 : 3 mana
    expect(applyAction(state, summon('chevalier', at(0, 4))).players[1].mana).toBe(0);
    expect(() => applyAction(state, summon('mage', at(0, 4)))).toThrow(/Mana insuffisant/);
  });

  it('refuse une carte qui n’est plus dans le grimoire', () => {
    let state = gameWith([], { players: { 1: { mana: 10 } } });
    state = applyAction(state, summon('eclaireur', at(0, 3)));
    state = applyAction(state, summon('eclaireur', at(0, 4)));
    expect(() => applyAction(state, summon('eclaireur', at(0, 5)))).toThrow(/plus dans le grimoire/);
  });

  it('refuse une case d’invocation déjà occupée', () => {
    const state = applyAction(createGame(), summon('eclaireur', at(0, 4)));
    expect(() => applyAction(state, summon('milicien', at(0, 4)))).toThrow(IllegalActionError);
  });

  it('refuse les cases qui ne sont pas des cases d’invocation de son camp', () => {
    const state = createGame();
    // Case d'invocation adverse, plaine, mana zone, case bloquée, hors plateau, hors grille.
    for (const pos of [at(10, 4), at(1, 4), at(2, 4), at(3, 4), at(0, 0), at(-1, 4)]) {
      expect(() => applyAction(state, summon('eclaireur', pos)), `(${pos.row}, ${pos.col})`).toThrow(
        IllegalActionError,
      );
    }
  });

  describe('occuper les cases d’invocation adverses (blocage)', () => {
    it('un monstre peut se déplacer sur une case d’invocation adverse', () => {
      const state = gameWith([{ monster: 'eclaireur', owner: 1, at: at(9, 4) }]);
      const after = applyAction(state, { type: 'move', unitId: 'u1', to: at(10, 4) });
      expect(after.units.u1?.pos).toEqual(at(10, 4));
    });

    it('l’adversaire ne peut plus invoquer sur la case occupée', () => {
      const state = gameWith([{ monster: 'milicien', owner: 2, at: at(0, 4) }]);
      expect(getFreeSummonCells(state, 1)).toEqual([at(0, 3), at(0, 5)]);
      expect(() => applyAction(state, summon('eclaireur', at(0, 4)))).toThrow(IllegalActionError);
    });
  });

  it('ne mute pas l’état et est déterministe', () => {
    const state = deepFreeze(createGame());
    const snapshot = structuredClone(state);
    const a = applyAction(state, summon('archer', at(0, 5)));
    const b = applyAction(state, summon('archer', at(0, 5)));
    expect(state).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('getLegalActions — invocations', () => {
  const summonActions = (actions: Action[]) =>
    actions.filter(
      (a): a is Extract<Action, { type: 'playCard' }> => a.type === 'playCard' && getCard(a.cardId).kind === 'monster',
    );

  it('propose chaque monstre abordable, une seule fois par carte, sur chaque case d’invocation libre', () => {
    const actions = summonActions(getLegalActions(createGame())); // J1 : 3 mana
    const affordable: CardId[] = [
      'eclaireur',
      'milicien',
      'archer',
      'chaman',
      'gardien',
      'chevalier',
      'chasseur-de-primes',
      'porte-etendard',
    ];
    expect(new Set(actions.map((a) => a.cardId))).toEqual(new Set(affordable));
    expect(actions).toHaveLength(affordable.length * 3);
  });

  it('ne propose que les cases d’invocation libres', () => {
    const state = gameWith([{ monster: 'milicien', owner: 2, at: at(0, 4) }]);
    const cells = summonActions(getLegalActions(state)).flatMap((a) => (a.target.kind === 'cell' ? [a.target.pos] : []));
    expect(cells).not.toContainEqual(at(0, 4));
    expect(cells).toEqual(expect.arrayContaining([at(0, 3), at(0, 5)]));
  });

  it('toutes les invocations proposées sont acceptées par applyAction', () => {
    const state = gameWith([{ monster: 'milicien', owner: 2, at: at(0, 4) }], { players: { 1: { mana: 6 } } });
    for (const action of summonActions(getLegalActions(state))) {
      expect(() => applyAction(state, action)).not.toThrow();
    }
  });
});
