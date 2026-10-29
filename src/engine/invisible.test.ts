import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { getPlayerView } from './view';
import { at, gameWith } from './test-utils';
import type { Action, GameState, Position, UnitId } from './types';

const END_TURN: Action = { type: 'endTurn' };
const unitIdsIn = (actions: readonly Action[]) => JSON.stringify(actions);
const visibleTo = (state: GameState, player: 1 | 2, unitId: UnitId) => unitId in getPlayerView(state, player).units;

describe('`invisible` : Farceur (SPEC.md §5, §10)', () => {
  it('invisible pour l’adversaire au-delà de 2 cases de ses unités, toujours visible pour son camp', () => {
    const far = gameWith([
      { monster: 'chevalier', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
    ]);
    expect(visibleTo(far, 1, 'u2')).toBe(false);
    expect(visibleTo(far, 2, 'u2')).toBe(true);
    expect(getPlayerView(far, 2).hiddenFromOpponent).toEqual(['u2']);
    expect(getPlayerView(far, 1).hiddenEnemies).toEqual(['u2']);
    expect(JSON.stringify(getPlayerView(far, 1).units)).not.toMatch(/farceur/);

    const near = gameWith([
      { monster: 'chevalier', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(8, 1) },
    ]);
    expect(visibleTo(near, 1, 'u2')).toBe(true);
    expect(getPlayerView(near, 2).hiddenFromOpponent).toEqual([]);
  });

  it('un terrain adverse le révèle aussi ; les autres monstres ne sont jamais cachés', () => {
    const state = gameWith([
      { terrain: 'bastion', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(9, 2) },
      { monster: 'eclaireur', owner: 2, at: at(1, 8) },
    ]);
    expect(visibleTo(state, 1, 'u2')).toBe(true);
    expect(visibleTo(state, 1, 'u3')).toBe(true);
  });

  it('rayon de 2 (diagonales comprises) ; la zone d’invocation adverse ne le révèle pas, seuls monstres et terrains', () => {
    expect(visibleTo(gameWith([{ monster: 'farceur', owner: 2, at: at(0, 4) }]), 1, 'u1')).toBe(false);
    const near = (pos: Position) => gameWith([{ monster: 'chevalier', owner: 1, at: at(1, 0) }, { monster: 'farceur', owner: 2, at: pos }]);
    // (3, 2) : 2 cases en diagonale, dans le rayon ; (3, 3) : hors du rayon.
    expect(visibleTo(near(at(3, 2)), 1, 'u2')).toBe(true);
    expect(visibleTo(near(at(3, 3)), 1, 'u2')).toBe(false);
  });

  it('inciblable tant qu’il est invisible : ni attaque, ni sort, ni effet', () => {
    const state = gameWith(
      [
        { monster: 'trebuchet', owner: 1, at: at(9, 8) },
        { monster: 'mage', owner: 1, at: at(1, 0) },
        { monster: 'farceur', owner: 2, at: at(9, 5) },
      ],
      { players: { 1: { mana: 10, grimoire: ['boule-de-feu', 'bourrasque', 'charge'] } } },
    );
    expect(unitIdsIn(getLegalActions(state))).not.toMatch(/"u3"/);
    expect(() => applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u3', advance: false })).toThrow();
    expect(() =>
      applyAction(state, { type: 'playCard', cardId: 'boule-de-feu', target: { kind: 'unit', unitId: 'u3' } }),
    ).toThrow();
  });

  it('le contrôle de la mana zone qu’il occupe reste public', () => {
    const state = gameWith([{ monster: 'farceur', owner: 2, at: at(5, 4) }]);
    const view = getPlayerView(state, 1);
    expect(view.units).toEqual({});
    expect(view.zoneControl.find((z) => z.pos.row === 5 && z.pos.col === 4)?.controller).toBe(2);
  });

  it('un déplacement qui entrerait sur sa case s’arrête avant, sans plus de mobilité, et le révèle', () => {
    const state = gameWith([
      { monster: 'chevalier', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
    ]);
    const blocked = { type: 'move', unitId: 'u1', to: at(9, 3), path: [at(9, 1), at(9, 2), at(9, 3)] } as const;
    expect(getLegalActions(state)).toContainEqual({ type: 'move', unitId: 'u1', to: at(9, 3) });
    const after = applyAction(state, blocked);
    expect(after.units.u1).toMatchObject({ pos: at(9, 2), mobilityLeft: 0, facing: 'right' });
    expect(after.units.u2).toMatchObject({ pos: at(9, 3), revealed: true });
    expect(visibleTo(after, 1, 'u2')).toBe(true);
  });

  it('un tir qui le traverse est arrêté : attaque utilisée, sans dégâts, il se révèle jusqu’à la fin du tour', () => {
    const state = gameWith([
      { monster: 'trebuchet', owner: 1, at: at(9, 0) },
      { monster: 'farceur', owner: 2, at: at(9, 3) },
      { monster: 'golem', owner: 2, at: at(9, 5) },
    ]);
    expect(getLegalActions(state)).toContainEqual({ type: 'attack', unitId: 'u1', targetId: 'u3', advance: false });
    const after = applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u3', advance: false });
    expect(after.units.u3).toMatchObject({ hp: 7 });
    expect(after.units.u2).toMatchObject({ hp: 1, revealed: true });
    expect(after.units.u1).toMatchObject({ hasAttacked: true });
    expect(visibleTo(after, 1, 'u2')).toBe(true);

    const nextTurn = applyAction(after, END_TURN);
    expect(nextTurn.units.u2).toMatchObject({ revealed: false });
    expect(visibleTo(nextTurn, 1, 'u2')).toBe(false);
  });

  it('un recul de Bourrasque s’arrête avant lui, et il se révèle', () => {
    const state = gameWith(
      [
        { monster: 'farceur', owner: 2, at: at(9, 2) },
        { monster: 'milicien', owner: 2, at: at(9, 4) },
      ],
      { players: { 1: { mana: 10, grimoire: ['bourrasque'] } } },
    );
    const target = { kind: 'unitAndDirection', unitId: 'u2', direction: 'left' } as const;
    const after = applyAction(state, { type: 'playCard', cardId: 'bourrasque', target });
    expect(after.units.u2).toMatchObject({ pos: at(9, 3) });
    expect(after.units.u1).toMatchObject({ revealed: true });
  });

  it('ne change pas les actions de son propre camp', () => {
    const state = gameWith([{ monster: 'farceur', owner: 1, at: at(1, 0) }]);
    expect(getLegalActions(state)).toContainEqual({ type: 'move', unitId: 'u1', to: at(1, 1) });
  });
});
