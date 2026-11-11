import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { effectArrival } from './arrival';
import { getMonsterCard } from './cards';
import { getMonsterAt } from './units';
import { at, gameWith, withStatus } from './test-utils';
import type { Action, GameState } from './types';

// Arriver sur un monstre caché (SPEC §10, validé le 2026-11-12). Plateau classique : les cases d'invocation de J1 sont
// (0, 3), (0, 4) et (0, 5). Un Farceur de J2 (camouflage) n'est vu d'aucune unité de J1 à plus de 2 cases.

const summon = (pos: ReturnType<typeof at>): Action => ({ type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos } });
const monsterAt = (state: GameState, row: number, col: number) => getMonsterAt(state, at(row, col));

describe('arriver sur un monstre caché', () => {
  it('invocation : le Farceur caché se révèle, le Milicien arrive sur la case d’invocation libre la plus proche (carte et mana payés)', () => {
    const state = gameWith([{ monster: 'farceur', owner: 2, at: at(0, 3) }], { players: { 1: { mana: 10, grimoire: ['milicien'] } } });
    // J1 ne le voit pas : la case lui semble libre, l'invocation y est légale.
    expect(getLegalActions(state)).toContainEqual(summon(at(0, 3)));
    const after = applyAction(state, summon(at(0, 3)));
    expect(monsterAt(after, 0, 3)).toMatchObject({ id: 'u1', revealed: true });
    expect(monsterAt(after, 0, 4)).toMatchObject({ cardId: 'milicien', owner: 1 });
    expect(after.players[1].grimoire).toEqual([]);
    expect(after.players[1].mana).toBe(10 - getMonsterCard(after.cards, 'milicien').cost);
    expect(after.events.map((e) => e.type)).toEqual(expect.arrayContaining(['revealed', 'cardPlayed', 'summon']));
    expect(after.events.find((e) => e.type === 'cardPlayed')).toMatchObject({ pos: at(0, 4) });
  });

  it('à égalité de distance, la première case dans l’ordre de lecture', () => {
    const state = gameWith([{ monster: 'farceur', owner: 2, at: at(0, 4) }], { players: { 1: { mana: 10, grimoire: ['milicien'] } } });
    expect(monsterAt(applyAction(state, summon(at(0, 4))), 0, 3)).toMatchObject({ cardId: 'milicien' });
  });

  it('aucune case valide : rien n’est payé ni joué, seul le monstre caché se révèle', () => {
    const state = gameWith(
      [
        { monster: 'farceur', owner: 2, at: at(0, 3) },
        { monster: 'farceur', owner: 2, at: at(0, 4) },
        { monster: 'farceur', owner: 2, at: at(0, 5) },
      ],
      { players: { 1: { mana: 10, grimoire: ['milicien'] } } },
    );
    const after = applyAction(state, summon(at(0, 4)));
    expect(after.players[1]).toMatchObject({ mana: 10, grimoire: ['milicien'] });
    expect(Object.keys(after.units)).toEqual(['u1', 'u2', 'u3']);
    expect(after.units.u2).toMatchObject({ revealed: true });
    expect(after.units.u1).toMatchObject({ revealed: false });
    expect(after.events.map((e) => e.type)).toEqual(['revealed']);
    // Révélé, il n'est plus une cible : J1 ne peut plus viser cette case.
    expect(getLegalActions(after)).not.toContainEqual(summon(at(0, 4)));
  });

  it('Réanimation : le monstre revient sur la case d’invocation libre la plus proche', () => {
    const state = gameWith([{ monster: 'farceur', owner: 2, at: at(0, 4) }], {
      players: { 1: { mana: 10, grimoire: ['reanimation'], graveyard: [{ cardId: 'milicien' }] } },
    });
    const after = applyAction(state, { type: 'playCard', cardId: 'reanimation', target: { kind: 'cellAndCard', pos: at(0, 4), cardId: 'milicien' } });
    expect(monsterAt(after, 0, 3)).toMatchObject({ cardId: 'milicien', owner: 1 });
    expect(after.units.u1).toMatchObject({ revealed: true, pos: at(0, 4) });
  });

  it('Repli : l’allié est téléporté sur la case d’invocation libre la plus proche', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 8) },
        { monster: 'farceur', owner: 2, at: at(0, 5) },
      ],
      { players: { 1: { mana: 10, grimoire: ['repli'] } } },
    );
    const after = applyAction(state, { type: 'playCard', cardId: 'repli', target: { kind: 'unitAndCell', unitId: 'u1', pos: at(0, 5) } });
    expect(after.units.u1).toMatchObject({ pos: at(0, 4) });
    expect(after.units.u2).toMatchObject({ revealed: true });
    expect(after.events.find((e) => e.type === 'teleport')).toMatchObject({ unitId: 'u1', to: at(0, 4) });
  });

  it('Flash vers un invisible (carré de 1) : l’allié arrive sur la case la plus proche à 2 cases de lui', () => {
    const state = withStatus(
      gameWith(
        [
          { monster: 'milicien', owner: 1, at: at(8, 1) },
          { monster: 'golem', owner: 2, at: at(8, 3) },
        ],
        { players: { 1: { mana: 10, grimoire: ['flash'] } } },
      ),
      'u2',
      'invisible',
      0,
      1,
    );
    const flash: Action = { type: 'playCard', cardId: 'flash', target: { kind: 'unitAndCell', unitId: 'u1', pos: at(8, 3) } };
    expect(getLegalActions(state)).toContainEqual(flash);
    const after = applyAction(state, flash);
    // À 1 case de la case visée : (7, 3), (8, 2) et (9, 3) ; la première dans l'ordre de lecture.
    expect(after.units.u1).toMatchObject({ pos: at(7, 3) });
    expect(after.units.u2).toMatchObject({ pos: at(8, 3), revealed: true });
  });

  it('effet actif (Téléporteur) : la cible la plus proche du même allié, dans son carré de 1 ; aucune : pas d’arrivée', () => {
    const state = gameWith([
      { monster: 'teleporteur', owner: 1, at: at(5, 2) },
      { monster: 'milicien', owner: 1, at: at(8, 8) },
      { monster: 'golem', owner: 2, at: at(4, 2) },
    ]);
    const ability = getMonsterCard(state.cards, 'teleporteur').activated[0]!;
    const moved = effectArrival(state, ability, { kind: 'unitAndCell', unitId: 'u2', pos: at(4, 2) }, 1, state.units.u1 as never);
    expect(moved?.target).toEqual({ kind: 'unitAndCell', unitId: 'u2', pos: at(4, 1) });
    expect(moved?.state.units.u3).toMatchObject({ revealed: true });
    // Case libre : rien à changer.
    expect(effectArrival(state, ability, { kind: 'unitAndCell', unitId: 'u2', pos: at(4, 1) }, 1, state.units.u1 as never)).toBeNull();
  });

  it('une case brûlée posée sur la case d’un invisible est posée quand même, sans le toucher ni le révéler', () => {
    // Lutin brasier : son carré de 2 ; un invisible n'est vu qu'au carré de 1.
    const state = withStatus(
      gameWith([
        { monster: 'lutin-brasier', owner: 1, at: at(8, 6) },
        { monster: 'golem', owner: 2, at: at(8, 8) },
      ], { players: { 1: { mana: 10 } } }),
      'u2',
      'invisible',
      0,
      1,
    );
    const burn: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos: at(8, 8) } };
    expect(getLegalActions(state)).toContainEqual(burn);
    const after = applyAction(state, burn);
    expect(after.burningCells).toContainEqual(expect.objectContaining({ pos: at(8, 8), owner: 1 }));
    expect(after.units.u2).toMatchObject({ pos: at(8, 8), hp: state.units.u2!.hp, revealed: false });
  });
});
