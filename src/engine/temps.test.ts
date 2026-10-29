import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { DECKS, getMonsterCard } from './cards';
import { getLegalActions } from './actions';
import { at, gameWith } from './test-utils';
import { rewindMonster } from './traps';
import { getPlayerView } from './view';
import type { Action, GameState, MonsterUnit, Position, Trap } from './types';

// Deck Explorateur du temps (SPEC.md §6 bis, §10) : retour sur une case du chemin du tour, effets actifs multiples,
// piège qui fait remonter le temps, stun, requiem, Piège temporel, Fissure temporelle.

const monster = (state: GameState, id: string) => state.units[id] as MonsterUnit;
const move = (unitId: string, path: readonly Position[]): Action => ({ type: 'move', unitId, to: path.at(-1)!, path });
const effect = (unitId: string, index: number, target: Extract<Action, { type: 'activateEffect' }>['target']): Action => ({
  type: 'activateEffect',
  unitId,
  ...(index > 0 ? { effect: index } : {}),
  target,
});
const endTurn: Action = { type: 'endTurn' };
const MANA = { players: { 1: { mana: 10 }, 2: { mana: 10 } } };
const returnCells = (state: GameState, unitId: string) =>
  getLegalActions(state).flatMap((a) =>
    a.type === 'activateEffect' && a.unitId === unitId && (a.effect ?? 0) === 0 && a.target.kind === 'cell' ? [a.target.pos] : [],
  );

describe('cartes du deck Explorateur du temps', () => {
  it('stats, famille, effets actifs ; le deck fait 25 cartes', () => {
    expect(getMonsterCard('apprenti-temps')).toMatchObject({ name: 'Apprenti - Explorateur du temps', cost: 1, atk: 2, hp: 2, mobility: 4, range: 1, archetype: 'temps' });
    expect(getMonsterCard('chronomancienne')).toMatchObject({ cost: 4, atk: 3, hp: 4, mobility: 4, range: 1, archetype: 'temps' });
    expect(getMonsterCard('dragonnet-temps')).toMatchObject({ cost: 3, atk: 3, hp: 3, mobility: 5, range: 1, archetype: 'temps' });
    expect(getMonsterCard('maitre-des-heures')).toMatchObject({ cost: 7, atk: 5, hp: 6, mobility: 4, range: 1, archetype: 'temps' });
    expect(getMonsterCard('apprenti-temps').activated).toHaveLength(1);
    for (const id of ['chronomancienne', 'dragonnet-temps', 'maitre-des-heures'] as const) {
      expect(getMonsterCard(id).activated.map((a) => a.manaCost), id).toEqual([1, 2]);
    }
    const deck = DECKS.find((d) => d.id === 'explorateur-du-temps')!;
    expect(deck.cards).toHaveLength(25);
  });
});

describe('retour : revenir sur une case du chemin du tour', () => {
  const walked = () => {
    const state = gameWith([{ monster: 'apprenti-temps', owner: 1, at: at(1, 0) }], MANA);
    return applyAction(state, move('u1', [at(1, 1), at(1, 2), at(1, 3)]));
  };

  it('les cases où il a été ce tour, sa case de départ comprise, sauf la sienne', () => {
    const state = walked();
    expect(monster(state, 'u1').trail).toEqual([at(1, 0), at(1, 1), at(1, 2), at(1, 3)]);
    expect(returnCells(state, 'u1')).toEqual([at(1, 0), at(1, 1), at(1, 2)]);
    // Sans s'être déplacé : aucune case.
    expect(returnCells(gameWith([{ monster: 'apprenti-temps', owner: 1, at: at(1, 0) }], MANA), 'u1')).toEqual([]);
  });

  it('téléportation : 1 mana, plus de déplacement ensuite, l’attaque reste ; une fois par tour', () => {
    const back = applyAction(walked(), effect('u1', 0, { kind: 'cell', pos: at(1, 1) }));
    expect(monster(back, 'u1')).toMatchObject({ pos: at(1, 1), mobilityLeft: 0, hasAttacked: false, usedEffects: [0], trail: [at(1, 0), at(1, 1)] });
    expect(back.players[1].mana).toBe(9);
    expect(back.events.map((e) => e.type)).toEqual(['effect', 'mana', 'rewind']);
    expect(getLegalActions(back).some((a) => a.type === 'move' && a.unitId === 'u1')).toBe(false);
    expect(getLegalActions(back).some((a) => a.type === 'activateEffect' && a.unitId === 'u1')).toBe(false);
  });

  it('après avoir attaqué, il peut encore revenir', () => {
    const state = gameWith(
      [
        { monster: 'apprenti-temps', owner: 1, at: at(1, 0) },
        { monster: 'golem', owner: 2, at: at(1, 4) },
      ],
      MANA,
    );
    const hit = applyAction(applyAction(state, move('u1', [at(1, 1), at(1, 2), at(1, 3)])), {
      type: 'attack',
      unitId: 'u1',
      targetId: 'u2',
      advance: false,
    });
    const back = applyAction(hit, effect('u1', 0, { kind: 'cell', pos: at(1, 0) }));
    expect(monster(back, 'u1')).toMatchObject({ pos: at(1, 0), hasAttacked: true });
  });

  it('une téléportation : rien ne se déclenche sur la case d’arrivée (piège ennemi, case brûlée)', () => {
    const trap: Trap = { owner: 2, pos: at(1, 1), effects: [{ type: 'damage', amount: 1 }], cardId: 'poseur-de-bombe' };
    const state = walked();
    const burning = { owner: 2 as const, pos: at(1, 1), effects: [{ type: 'damage' as const, amount: 1 }], cardId: 'lutin-brasier' as const, expiresAtTurn: 9 };
    const back = applyAction({ ...state, traps: [trap], burningCells: [burning] }, effect('u1', 0, { kind: 'cell', pos: at(1, 1) }));
    expect(monster(back, 'u1')).toMatchObject({ pos: at(1, 1), hp: monster(state, 'u1').hp });
    expect(back.traps).toEqual([trap]);
    expect(back.events.map((e) => e.type)).not.toContain('trapTriggered');
  });

  it('le chemin repart de sa case au début de son tour', () => {
    const next = applyAction(applyAction(walked(), endTurn), endTurn);
    expect(monster(next, 'u1').trail).toEqual([at(1, 3)]);
  });

  it('l’adversaire ne voit pas le chemin d’un monstre adverse', () => {
    expect((getPlayerView(walked(), 2).units.u1 as MonsterUnit).trail).toEqual([at(1, 3)]);
    expect((getPlayerView(walked(), 1).units.u1 as MonsterUnit).trail).toHaveLength(4);
  });
});

describe('deux effets actifs : chacun une fois par tour', () => {
  it('Dragonnet : stun d’un ennemi adjacent (pendant 1 tour), puis retour, dans le même tour', () => {
    const state = gameWith(
      [
        { monster: 'dragonnet-temps', owner: 1, at: at(1, 2) },
        { monster: 'golem', owner: 2, at: at(1, 4) },
      ],
      MANA,
    );
    const moved = applyAction(state, move('u1', [at(1, 3)]));
    const stunned = applyAction(moved, effect('u1', 1, { kind: 'unit', unitId: 'u2' }));
    expect(monster(stunned, 'u2').statuses.map((s) => s.kind)).toEqual(['stun']);
    expect(getLegalActions(stunned).some((a) => a.type === 'activateEffect' && a.effect === 1)).toBe(false);
    const back = applyAction(stunned, effect('u1', 0, { kind: 'cell', pos: at(1, 2) }));
    expect(monster(back, 'u1')).toMatchObject({ pos: at(1, 2), usedEffects: [1, 0] });
    expect(back.players[1].mana).toBe(7);
    // Son tour suivant, le golem ne fait rien.
    const theirTurn = applyAction(back, endTurn);
    expect(getLegalActions(theirTurn).filter((a) => 'unitId' in a && a.unitId === 'u2')).toEqual([]);
  });

  it('Maître des heures : requiem 2 sur un ennemi adjacent, qui meurt au début de son 2e prochain tour, sans VP', () => {
    const state = gameWith(
      [
        { monster: 'maitre-des-heures', owner: 1, at: at(1, 3) },
        { monster: 'golem', owner: 2, at: at(1, 4) },
      ],
      MANA,
    );
    const cursed = applyAction(state, effect('u1', 1, { kind: 'unit', unitId: 'u2' }));
    const turn2 = applyAction(cursed, endTurn);
    expect(turn2.units.u2).toBeDefined();
    const turn4 = applyAction(applyAction(turn2, endTurn), endTurn);
    expect(turn4.units.u2).toBeUndefined();
    expect(turn4.players[1].vp).toBe(cursed.players[1].vp);
  });
});

describe('piège de la Chronomancienne : l’ennemi remonte 3 cases de son chemin', () => {
  const trap = (pos: Position): Trap => ({ owner: 1, pos, effects: [{ type: 'rewind', steps: 3 }], cardId: 'chronomancienne' });
  const walker = (traps: readonly Trap[], extra: Parameters<typeof gameWith>[0] = []) => ({
    ...gameWith([{ monster: 'apprenti-temps', owner: 2, at: at(1, 8), mobilityLeft: 5 }, ...extra], { activePlayer: 2, ...MANA }),
    traps,
  });
  const path = [at(1, 7), at(1, 6), at(1, 5), at(1, 4), at(1, 3)];

  it('la Chronomancienne le pose sur une case adjacente libre (2 mana)', () => {
    const state = gameWith([{ monster: 'chronomancienne', owner: 1, at: at(1, 4) }], MANA);
    const placed = applyAction(state, effect('u1', 1, { kind: 'cell', pos: at(1, 5) }));
    expect(placed.traps).toEqual([trap(at(1, 5))]);
    expect(placed.players[1].mana).toBe(8);
  });

  it('il revient de 3 cases, son déplacement s’arrête, plus de mobilité ce tour', () => {
    const after = applyAction(walker([trap(at(1, 4))]), move('u1', path));
    expect(monster(after, 'u1')).toMatchObject({ pos: at(1, 7), mobilityLeft: 0, trail: [at(1, 8), at(1, 7)] });
    expect(after.traps).toEqual([]);
    expect(after.events.filter((e) => e.type === 'rewind')).toEqual([{ type: 'rewind', unitId: 'u1', from: at(1, 4), to: at(1, 7) }]);
  });

  it('arrivée en téléportation : rien ne s’y déclenche (piège ennemi sur la case retrouvée)', () => {
    const state = gameWith([{ monster: 'apprenti-temps', owner: 2, at: at(1, 4) }], { activePlayer: 2 });
    const walked: GameState = {
      ...state,
      units: { u1: { ...monster(state, 'u1'), trail: [at(1, 7), at(1, 6), at(1, 5), at(1, 4)] } },
      traps: [{ owner: 1, pos: at(1, 7), effects: [{ type: 'damage', amount: 1 }], cardId: 'poseur-de-bombe' }],
    };
    const { state: after } = rewindMonster(walked, 'u1', 3);
    expect(monster(after, 'u1')).toMatchObject({ pos: at(1, 7), hp: monster(walked, 'u1').hp, mobilityLeft: 0 });
    expect(after.traps).toHaveLength(1);
  });

  it('chemin plus court : il revient à son départ ; une case occupée entre-temps est sautée', () => {
    expect(monster(applyAction(walker([trap(at(1, 7))]), move('u1', path)), 'u1').pos).toEqual(at(1, 8));
    // Un autre monstre passe derrière lui sur (1, 7) avant qu'il n'arrive sur le piège.
    const state = walker([trap(at(1, 4))], [{ monster: 'eclaireur', owner: 2, at: at(2, 7) }]);
    const first = applyAction(state, move('u1', path.slice(0, 2)));
    const blocked = applyAction(first, move('u2', [at(1, 7)]));
    const after = applyAction(blocked, move('u1', [at(1, 5), at(1, 4)]));
    expect(monster(after, 'u1').pos).toEqual(at(1, 6));
  });
});

describe('Piège temporel et Fissure temporelle', () => {
  it('Piège temporel : tous les ennemis immobilisés pendant 1 tour', () => {
    const state = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(1, 4) },
        { monster: 'eclaireur', owner: 2, at: at(9, 4) },
      ],
      { players: { 1: { mana: 5, grimoire: ['piege-temporel'] } } },
    );
    const cast = applyAction(state, { type: 'playCard', cardId: 'piege-temporel', target: { kind: 'all' } });
    expect(cast.players[1].mana).toBe(2);
    const theirTurn = applyAction(cast, endTurn);
    for (const id of ['u1', 'u2']) {
      expect(monster(theirTurn, id).mobilityLeft, id).toBe(0);
      expect(getLegalActions(theirTurn).some((a) => a.type === 'move' && a.unitId === id)).toBe(false);
    }
  });

  it('Fissure temporelle : un ennemi qui entre dans sa zone est immobilisé et s’arrête', () => {
    const state = gameWith(
      [
        { terrain: 'fissure-temporelle', owner: 1, at: at(2, 4) },
        { monster: 'apprenti-temps', owner: 2, at: at(1, 8) },
      ],
      { activePlayer: 2 },
    );
    const after = applyAction(state, move('u2', [at(1, 7), at(1, 6), at(1, 5), at(1, 4)]));
    expect(monster(after, 'u2')).toMatchObject({ pos: at(1, 5), mobilityLeft: 0 });
    expect(monster(after, 'u2').statuses.map((s) => s.kind)).toEqual(['immobilise']);
  });
});
