import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { CARDS, DECKS, getMonsterCard } from './cards';
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
  it('famille, effets actifs ; le deck fait 30 cartes', () => {
    // Leurs chiffres (coût, stats, valeurs des mots-clés, coût des effets) se règlent dans l'atelier : cardText.test.ts
    // vérifie qu'ils sont ceux des tableaux de SPEC.md.
    expect(getMonsterCard(CARDS, 'apprenti-temps')).toMatchObject({ name: 'Apprenti - Explorateur du temps', archetype: 'temps' });
    for (const id of ['chronomancienne', 'dragonnet-temps', 'maitre-du-temps'] as const) {
      expect(getMonsterCard(CARDS, id), id).toMatchObject({ archetype: 'temps' });
      expect(getMonsterCard(CARDS, id).activated, id).toHaveLength(2);
    }
    expect(getMonsterCard(CARDS, 'apprenti-temps').activated).toHaveLength(1);
    // Chaque effet a son nom (SPEC §5.2) ; Retour vers le futur est le premier des quatre monstres.
    for (const id of ['apprenti-temps', 'chronomancienne', 'dragonnet-temps', 'maitre-du-temps'] as const) {
      expect(getMonsterCard(CARDS, id).activated[0]!.name, id).toBe('Retour vers le futur');
    }
    expect(getMonsterCard(CARDS, 'chronomancienne').activated[1]!.name).toBe('Sablier du temps');
    expect(getMonsterCard(CARDS, 'dragonnet-temps').activated[1]!.name).toBe('Miroir de souvenirs');
    expect(getMonsterCard(CARDS, 'maitre-du-temps').activated[1]!.name).toBe('Requiem');
    const deck = DECKS.find((d) => d.id === 'explorateur-du-temps')!;
    expect(deck.cards).toHaveLength(30);
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

  it('téléportation : 1 mana ; il garde sa mobilité restante et peut repartir (2026-11-10), l’attaque reste ; une fois par tour', () => {
    // Apprenti (mobilité 5) : 3 pas faits, il lui en reste 2 après le retour.
    const back = applyAction(walked(), effect('u1', 0, { kind: 'cell', pos: at(1, 1) }));
    expect(monster(back, 'u1')).toMatchObject({ pos: at(1, 1), mobilityLeft: 2, hasAttacked: false, usedEffects: [0], trail: [at(1, 0), at(1, 1)] });
    expect(monster(back, 'u1').halted).toBeUndefined();
    expect(back.players[1].mana).toBe(9);
    expect(back.events.map((e) => e.type)).toEqual(['effect', 'mana', 'rewind']);
    const again = applyAction(back, move('u1', [at(2, 1), at(3, 1)]));
    expect(monster(again, 'u1')).toMatchObject({ pos: at(3, 1), mobilityLeft: 0, trail: [at(1, 0), at(1, 1), at(2, 1), at(3, 1)] });
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

  it('une téléportation : il entre sur la case d’arrivée, piège ennemi et case brûlée se déclenchent (§10)', () => {
    const trap: Trap = { owner: 2, pos: at(1, 1), effects: [{ type: 'damage', amount: 1 }], cardId: 'poseur-de-bombe', sourceId: 'u0', expiresAtTurn: 99 };
    const state = walked();
    const burning = { owner: 2 as const, pos: at(1, 1), effects: [{ type: 'damage' as const, amount: 1 }], cardId: 'lutin-brasier' as const, expiresAtTurn: 9 };
    const back = applyAction({ ...state, traps: [trap], burningCells: [burning] }, effect('u1', 0, { kind: 'cell', pos: at(1, 1) }));
    // 1 dégât du piège, 1 de la case brûlée : l'Apprenti (2 PV) est détruit sur la case.
    expect(back.units.u1).toBeUndefined();
    expect(back.traps).toEqual([]);
    expect(back.burningCells).toEqual([burning]);
    expect(back.events.map((e) => e.type)).toContain('trapTriggered');
    expect(back.events.map((e) => e.type)).toContain('burningCell');
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
  it('Dragonnet, Miroir de souvenirs (1 mana) : stun pendant 1 tour sur un ennemi du carré de 1 ; contre-coup : silence pour lui', () => {
    const state = gameWith(
      [
        { monster: 'dragonnet-temps', owner: 1, at: at(1, 2) },
        { monster: 'golem', owner: 2, at: at(1, 4) },
      ],
      MANA,
    );
    const moved = applyAction(state, move('u1', [at(1, 3)]));
    const mirrored = applyAction(moved, effect('u1', 1, { kind: 'unit', unitId: 'u2' }));
    expect(monster(mirrored, 'u2').statuses.map((s) => s.kind)).toEqual(['stun']);
    expect(monster(mirrored, 'u1').statuses.map((s) => s.kind)).toEqual(['silence']);
    expect(mirrored.players[1].mana).toBe(9);
    // Silence : plus aucun effet actif, Retour compris, mais l'attaque et le déplacement restent possibles.
    expect(getLegalActions(mirrored).some((a) => a.type === 'activateEffect')).toBe(false);
    expect(() => applyAction(mirrored, effect('u1', 0, { kind: 'cell', pos: at(1, 2) }))).toThrow(/silence/);
    expect(getLegalActions(mirrored).some((a) => a.type === 'attack' && a.unitId === 'u1')).toBe(true);
    // Son tour suivant, le golem ne fait rien.
    const theirTurn = applyAction(mirrored, endTurn);
    expect(getLegalActions(theirTurn).filter((a) => 'unitId' in a && a.unitId === 'u2')).toEqual([]);
  });

  it('le silence dure jusqu’à la fin du prochain tour du Dragonnet, puis disparaît ; Retour avant le Miroir reste possible', () => {
    const state = gameWith(
      [
        { monster: 'dragonnet-temps', owner: 1, at: at(1, 2) },
        { monster: 'golem', owner: 2, at: at(1, 1) },
      ],
      MANA,
    );
    const moved = applyAction(state, move('u1', [at(1, 3)]));
    const back = applyAction(moved, effect('u1', 0, { kind: 'cell', pos: at(1, 2) }));
    expect(monster(back, 'u1').pos).toEqual(at(1, 2));
    const mirrored = applyAction(back, effect('u1', 1, { kind: 'unit', unitId: 'u2' }));
    const opponent = applyAction(mirrored, endTurn);
    const mine = applyAction(opponent, endTurn); // son prochain tour : encore silencieux
    expect(monster(mine, 'u1').statuses.map((s) => s.kind)).toEqual(['silence']);
    expect(getLegalActions(mine).some((a) => a.type === 'activateEffect' && a.unitId === 'u1')).toBe(false);
    const later = applyAction(applyAction(mine, endTurn), endTurn); // fin de ce tour : il disparaît
    expect(monster(later, 'u1').statuses).toEqual([]);
    expect(getLegalActions(later).some((a) => a.type === 'activateEffect' && a.unitId === 'u1')).toBe(true);
  });

  it('le contre-coup s’applique dès l’activation, y compris sur une cible déjà stun', () => {
    const state = gameWith(
      [
        { monster: 'dragonnet-temps', owner: 1, at: at(1, 3) },
        { monster: 'golem', owner: 2, at: at(1, 4) },
      ],
      MANA,
    );
    // Une cible déjà stun (le même effet une 2e fois dans le tour par un autre Dragonnet) : le contre-coup est le même.
    const stunned = applyAction(state, effect('u1', 1, { kind: 'unit', unitId: 'u2' }));
    const first = { ...stunned, units: { ...stunned.units, u1: { ...monster(stunned, 'u1'), statuses: [], usedEffects: [] } } };
    const again = applyAction(first, effect('u1', 1, { kind: 'unit', unitId: 'u2' }));
    expect(monster(again, 'u1').statuses.map((s) => s.kind)).toEqual(['silence']);
    expect(monster(applyAction(state, effect('u1', 1, { kind: 'unit', unitId: 'u2' })), 'u1').statuses.map((s) => s.kind)).toEqual(['silence']);
  });

  it('Maître du temps : requiem 2 sur un ennemi adjacent, qui meurt au début de son 2e prochain tour, sans VP', () => {
    const state = gameWith(
      [
        { monster: 'maitre-du-temps', owner: 1, at: at(1, 3) },
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
  const trap = (pos: Position): Trap => ({ owner: 1, pos, effects: [{ type: 'rewind', steps: 3 }], cardId: 'chronomancienne', sourceId: 'u0', expiresAtTurn: 99 });
  const walker = (traps: readonly Trap[], extra: Parameters<typeof gameWith>[0] = []) => ({
    ...gameWith([{ monster: 'apprenti-temps', owner: 2, at: at(1, 8), mobilityLeft: 5 }, ...extra], { activePlayer: 2, ...MANA }),
    traps,
  });
  const path = [at(1, 7), at(1, 6), at(1, 5), at(1, 4), at(1, 3)];

  it('la Chronomancienne le pose sur une case adjacente libre (1 mana)', () => {
    const state = gameWith([{ monster: 'chronomancienne', owner: 1, at: at(1, 4) }], MANA);
    const placed = applyAction(state, effect('u1', 1, { kind: 'cell', pos: at(1, 5) }));
    expect(placed.traps).toEqual([{ ...trap(at(1, 5)), sourceId: 'u1', expiresAtTurn: 7 }]);
    expect(placed.players[1].mana).toBe(9);
  });

  it('Sablier du temps dure 3 tours adverses : il est encore là au 3e, il disparaît au début du 3e prochain tour de son poseur', () => {
    const state = gameWith([{ monster: 'chronomancienne', owner: 1, at: at(1, 4) }], MANA);
    let game = applyAction(state, effect('u1', 1, { kind: 'cell', pos: at(1, 5) })); // tour 1
    game = applyAction(game, endTurn); // tour 2 (J2) : 1er tour adverse
    game = applyAction(game, endTurn); // tour 3 (J1) : il reste
    expect(game.traps).toHaveLength(1);
    game = applyAction(applyAction(game, endTurn), endTurn); // tours 4 (J2), 5 (J1) : il reste
    expect(game.turn).toBe(5);
    expect(game.traps).toHaveLength(1);
    game = applyAction(applyAction(game, endTurn), endTurn); // tour 6 (J2, 3e tour adverse) puis tour 7 (J1) : disparu
    expect(game.turn).toBe(7);
    expect(game.traps).toEqual([]);
  });

  it('un seul sablier à la fois par monstre : le nouveau fait disparaître l’ancien, sans VP', () => {
    const state = gameWith([{ monster: 'chronomancienne', owner: 1, at: at(1, 4) }], MANA);
    const first = applyAction(state, effect('u1', 1, { kind: 'cell', pos: at(1, 5) }));
    const turn3 = applyAction(applyAction(first, endTurn), endTurn);
    const second = applyAction(turn3, effect('u1', 1, { kind: 'cell', pos: at(1, 3) }));
    expect(second.traps.map((t) => t.pos)).toEqual([at(1, 3)]);
    expect(second.players[2].vp).toBe(first.players[2].vp);
    // Deux Chronomanciennes : chacune garde le sien.
    const two = gameWith(
      [
        { monster: 'chronomancienne', owner: 1, at: at(1, 4) },
        { monster: 'chronomancienne', owner: 1, at: at(3, 4) },
      ],
      MANA,
    );
    const both = applyAction(applyAction(two, effect('u1', 1, { kind: 'cell', pos: at(1, 5) })), effect('u2', 1, { kind: 'cell', pos: at(3, 5) }));
    expect(both.traps).toHaveLength(2);
  });

  it('il revient de 3 cases, son déplacement s’arrête, plus de mobilité ce tour', () => {
    const after = applyAction(walker([trap(at(1, 4))]), move('u1', path));
    expect(monster(after, 'u1')).toMatchObject({ pos: at(1, 7), mobilityLeft: 0, trail: [at(1, 8), at(1, 7)] });
    expect(after.traps).toEqual([]);
    expect(after.events.filter((e) => e.type === 'rewind')).toEqual([{ type: 'rewind', unitId: 'u1', from: at(1, 4), to: at(1, 7) }]);
  });

  it('arrivée en téléportation : le piège ennemi de la case retrouvée se déclenche (§10)', () => {
    const state = gameWith([{ monster: 'apprenti-temps', owner: 2, at: at(1, 4) }], { activePlayer: 2 });
    const walked: GameState = {
      ...state,
      units: { u1: { ...monster(state, 'u1'), trail: [at(1, 7), at(1, 6), at(1, 5), at(1, 4)] } },
      traps: [{ owner: 1, pos: at(1, 7), effects: [{ type: 'damage', amount: 1 }], cardId: 'poseur-de-bombe', sourceId: 'u0', expiresAtTurn: 99 }],
    };
    const { state: after } = rewindMonster(walked, 'u1', 3);
    expect(monster(after, 'u1')).toMatchObject({ pos: at(1, 7), hp: monster(walked, 'u1').hp - 1, mobilityLeft: 0 });
    expect(after.traps).toHaveLength(0);
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
