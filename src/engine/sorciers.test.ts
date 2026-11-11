import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { CARDS } from './cards';
import { IllegalActionError } from './errors';
import { placeSummonedMonster } from './summon';
import { at, gameWith } from './test-utils';
import { getPlayerView } from './view';
import type { Action, GameState, MonsterCard, Position, UnitId } from './types';

// Deck Sorciers du feu (SPEC.md §6 bis, §10) : Brûlure 1, 2 tours ; Lutin brasier et ses cases brûlées ; Archimage ;
// Golem de lave (Zone).

const END_TURN: Action = { type: 'endTurn' };
const MANA = { players: { 1: { mana: 10 } } };
const move = (unitId: UnitId, to: Position): Action => ({ type: 'move', unitId, to });
const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const burnCell = (pos: Position): Action => ({ type: 'activateEffect', unitId: 'u1', target: { kind: 'cell', pos } });
const burnTargets = (state: GameState) =>
  getLegalActions(state).flatMap((a) => (a.type === 'activateEffect' && a.target.kind === 'cell' ? [a.target.pos] : []));

describe('cartes du deck Sorciers du feu', () => {
  it('famille, Brûlure (Feria, Archimage)', () => {
    // Leurs chiffres (coût, stats, valeurs des mots-clés, coût des effets) se règlent dans l'atelier : cardText.test.ts
    // vérifie qu'ils sont ceux des tableaux de SPEC.md.
    for (const id of ['apprenti', 'lutin-brasier', 'archimage', 'golem-de-lave'] as const) expect(CARDS[id], id).toMatchObject({ archetype: 'sorcier' });
    for (const id of ['apprenti', 'archimage'] as const) {
      expect(CARDS[id], id).toMatchObject({ keywords: [{ keyword: 'brulure' }] });
    }
    // Le Lutin brasier n'a plus de Brûlure : seule sa case brûlée.
    expect(CARDS['lutin-brasier']).toMatchObject({ keywords: [] });
  });

  it('à l’attaque, la cible est burn 1 pendant 2 tours, terrain compris', () => {
    const state = gameWith([
      { monster: 'apprenti', owner: 1, at: at(1, 1) },
      { monster: 'golem', owner: 2, at: at(1, 3) },
      { terrain: 'bastion', owner: 2, at: at(3, 1) },
    ]);
    const hit = applyAction(state, attack('u1', 'u2'));
    expect(hit.units.u2?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 2 }]);
    const wall = applyAction(state, attack('u1', 'u3'));
    expect(wall.units.u3?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 2 }]);
  });
});

describe('Lutin brasier : case brûlée', () => {
  const state = gameWith(
    [
      { monster: 'lutin-brasier', owner: 1, at: at(2, 2) },
      { monster: 'milicien', owner: 1, at: at(1, 2) },
      { monster: 'chevalier', owner: 2, at: at(2, 6) },
    ],
    MANA,
  );

  it('une case libre parmi ses adjacents, rayon 2 : ni occupée, ni plus loin, ni déjà brûlée', () => {
    const targets = burnTargets(state);
    expect(targets).toContainEqual(at(2, 4));
    expect(targets).toContainEqual(at(0, 3));
    expect(targets).not.toContainEqual(at(1, 2)); // le Milicien y est
    expect(targets).not.toContainEqual(at(2, 5)); // à 3 cases
    const burned = applyAction(state, burnCell(at(2, 4)));
    expect(burned.players[1].mana).toBe(9);
    // Effet utilisé pour ce tour ; au tour suivant, la case déjà brûlée n'est plus proposée.
    const later = applyAction(applyAction(burned, END_TURN), END_TURN);
    expect(burnTargets(later)).not.toContainEqual(at(2, 4));
  });

  it('visible des deux joueurs ; chaque ennemi qui y entre perd 1 PV et est burn 1 pendant 1 tour ; la case reste', () => {
    const burned = applyAction(state, burnCell(at(2, 4)));
    expect(burned.burningCells).toEqual([
      expect.objectContaining({ owner: 1, pos: at(2, 4), cardId: 'lutin-brasier' }),
    ]);
    expect(getPlayerView(burned, 2).burningCells).toHaveLength(1);
    const entered = applyAction(applyAction(burned, END_TURN), move('u3', at(2, 4)));
    expect(entered.units.u3).toMatchObject({ hp: 3, statuses: [expect.objectContaining({ kind: 'burn', amount: 1, turns: 1 })] });
    expect(entered.events).toContainEqual(expect.objectContaining({ type: 'burningCell', unitId: 'u3' }));
    expect(entered.burningCells).toHaveLength(1);
    // Ses propres monstres n'ont rien.
    const own = applyAction(burned, move('u1', at(2, 4)));
    expect(own.units.u1).toMatchObject({ hp: 3, statuses: [] });
  });

  it('elle brûle jusqu’à la fin du 3e prochain tour de son camp', () => {
    let next = applyAction(state, burnCell(at(2, 4)));
    for (let i = 0; i < 6; i++) next = applyAction(next, END_TURN);
    expect(next.turn).toBe(7);
    expect(next.burningCells).toHaveLength(1);
    expect(applyAction(next, END_TURN).burningCells).toEqual([]);
  });

  it('pas sur une case occupée', () => {
    expect(() => applyAction(state, burnCell(at(1, 2)))).toThrow(IllegalActionError);
  });
});

describe('Archimage', () => {
  it('Actif (1 mana) : tous les ennemis dans un rayon de 2 sont burn 2 pendant 2 tours', () => {
    const state = gameWith(
      [
        { monster: 'archimage', owner: 1, at: at(1, 4) },
        { monster: 'golem', owner: 2, at: at(1, 5) },
        { monster: 'golem', owner: 2, at: at(2, 3) },
        { monster: 'golem', owner: 2, at: at(1, 6) },
        { monster: 'golem', owner: 2, at: at(1, 7) },
      ],
      MANA,
    );
    const after = applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'area' } });
    expect(after.players[1].mana).toBe(9);
    for (const id of ['u2', 'u3', 'u4']) expect(after.units[id]?.statuses, id).toMatchObject([{ kind: 'burn', amount: 2, turns: 2 }]);
    expect(after.units.u5?.statuses).toEqual([]); // à 3 cases
  });
});

describe('Brûlure en chaîne (sort, 2 mana)', () => {
  const CHAIN: Action = { type: 'playCard', cardId: 'brulure-en-chaine', target: { kind: 'all' } };
  const hand = { players: { 1: { mana: 10, grimoire: ['brulure-en-chaine' as const] } } };
  const burns = (state: GameState, id: UnitId) => state.units[id]?.statuses.filter((s) => s.kind === 'burn');

  it('les ennemis adjacents à un de ses monstres sont burn 1 pendant 2 tours ; les autres, rien', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(7, 2) }, // en diagonale : adjacent
        { monster: 'golem', owner: 2, at: at(8, 6) }, // loin
      ],
      hand,
    );
    const after = applyAction(state, CHAIN);
    expect(after.players[1].mana).toBe(8);
    expect(burns(after, 'u2')).toMatchObject([{ amount: 1, turns: 2 }]);
    expect(burns(after, 'u3')).toEqual([]);
  });

  it('une fois par unité alliée à côté : deux monstres voisins = burn cumulé', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'eclaireur', owner: 1, at: at(8, 3) },
        { monster: 'golem', owner: 2, at: at(8, 2) },
      ],
      hand,
    );
    // Deux burn 1 : ils se cumulent (§5 bis), soit 2 PV de burn par tour.
    expect(burns(applyAction(state, CHAIN), 'u3')?.reduce((total, b) => total + (b.kind === 'burn' ? b.amount : 0), 0)).toBe(2);
  });

  it('un terrain allié est aussi un centre : ses voisins sont brûlés', () => {
    const state = gameWith(
      [
        { terrain: 'bastion', owner: 1, at: at(5, 4) },
        { monster: 'golem', owner: 2, at: at(5, 5) },
      ],
      hand,
    );
    expect(burns(applyAction(state, CHAIN), 'u2')).toHaveLength(1);
  });

  it('pas jouable sans ennemi à côté d’une de ses unités', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(5, 5) },
        { monster: 'golem', owner: 2, at: at(5, 8) },
      ],
      hand,
    );
    expect(getLegalActions(state).some((a) => a.type === 'playCard' && a.cardId === 'brulure-en-chaine')).toBe(false);
    expect(() => applyAction(state, CHAIN)).toThrow(IllegalActionError);
  });
});

describe('Golem de lave : Zone · adjacents · burn 1 pendant 1 tour', () => {
  it('un ennemi qui entre à côté de lui est burn, à chaque case de la zone (les burn se cumulent)', () => {
    const state = gameWith(
      [
        { monster: 'golem-de-lave', owner: 1, at: at(1, 1) },
        { monster: 'eclaireur', owner: 2, at: at(4, 1) },
      ],
      { activePlayer: 2 },
    );
    // (4, 1) → (3, 1) → (2, 1) → (2, 2) : deux cases de la zone, deux burn.
    const after = applyAction(state, { type: 'move', unitId: 'u2', to: at(2, 2), path: [at(3, 1), at(2, 1), at(2, 2)] });
    expect(after.units.u2?.statuses).toMatchObject([
      { kind: 'burn', amount: 1, turns: 1 },
      { kind: 'burn', amount: 1, turns: 1 },
    ]);
    expect(after.events).toContainEqual({ type: 'passage', sourceId: 'u1', unitId: 'u2', pos: at(2, 1) });
    expect(after.events).toContainEqual({ type: 'passage', sourceId: 'u1', unitId: 'u2', pos: at(2, 2) });
  });

  it('quand c’est le Golem qui arrive à côté d’un ennemi, celui-ci est burn aussi', () => {
    const state = gameWith([
      { monster: 'golem-de-lave', owner: 1, at: at(1, 1) },
      { monster: 'eclaireur', owner: 2, at: at(4, 1) },
    ]);
    const after = applyAction(state, move('u1', at(3, 1)));
    expect(after.units.u2?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 1 }]);
    expect(after.events).toContainEqual({ type: 'passage', sourceId: 'u1', unitId: 'u2', pos: at(4, 1) });
  });

  it('un ennemi déjà dans la zone n’est pas touché de nouveau par le déplacement du Golem', () => {
    const state = gameWith([
      { monster: 'golem-de-lave', owner: 1, at: at(3, 1) },
      { monster: 'eclaireur', owner: 2, at: at(4, 2) },
    ]);
    const after = applyAction(state, move('u1', at(3, 2)));
    expect(after.units.u2?.statuses).toEqual([]);
  });

  it('invoqué à côté d’un ennemi, le Golem le brûle', () => {
    const state = gameWith([{ monster: 'eclaireur', owner: 2, at: at(2, 2) }]);
    const after = placeSummonedMonster(state, 1, CARDS['golem-de-lave'] as MonsterCard, at(1, 1));
    expect(after.units.u1?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 1 }]);
  });

  it('au début du tour de son possesseur, l’ennemi encore dans la zone est burn de nouveau', () => {
    const state = gameWith([
      { monster: 'golem-de-lave', owner: 1, at: at(1, 1) },
      { monster: 'eclaireur', owner: 2, at: at(2, 2) },
      { monster: 'eclaireur', owner: 2, at: at(5, 5) },
    ]);
    const mine = applyAction(state, END_TURN);
    // Le début du tour de l’adversaire ne déclenche rien : la zone est à son possesseur.
    expect(mine.units.u2?.statuses).toEqual([]);
    const back = applyAction(mine, END_TURN);
    expect(back.units.u2?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 1 }]);
    expect(back.units.u3?.statuses).toEqual([]);
    expect(back.events).toContainEqual({ type: 'passage', sourceId: 'u1', unitId: 'u2', pos: at(2, 2) });
  });

  it('téléportation (§10) : l’ennemi posé dans la zone est burn, comme le Golem posé à côté d’un ennemi', () => {
    const teleportTo = (unitId: UnitId, pos: Position): Action => ({
      type: 'activateEffect',
      unitId: 'u1',
      target: { kind: 'unitAndCell', unitId, pos },
    });
    // J2 téléporte son Éclaireur (u3) à côté de son Téléporteur (u1), lui-même dans la zone du Golem (u2).
    const enemy = gameWith(
      [
        { monster: 'teleporteur', owner: 2, at: at(2, 3) },
        { monster: 'golem-de-lave', owner: 1, at: at(1, 1) },
        { monster: 'eclaireur', owner: 2, at: at(8, 7) },
      ],
      { activePlayer: 2, players: { 2: { mana: 5 } } },
    );
    const arrived = applyAction(enemy, teleportTo('u3', at(2, 2)));
    expect(arrived.units.u3?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 1 }]);
    // Le Golem de J1, téléporté par son propre Téléporteur à côté d'un Éclaireur ennemi.
    const mine = gameWith(
      [
        { monster: 'teleporteur', owner: 1, at: at(3, 3) },
        { monster: 'golem-de-lave', owner: 1, at: at(9, 0) },
        { monster: 'eclaireur', owner: 2, at: at(5, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    const beside = applyAction(mine, teleportTo('u2', at(4, 3)));
    expect(beside.units.u3?.statuses).toMatchObject([{ kind: 'burn', amount: 1, turns: 1 }]);
  });

  it('l’ennemi qui est parti de la zone entre-temps n’est pas touché au début du tour', () => {
    const state = gameWith([
      { monster: 'golem-de-lave', owner: 1, at: at(1, 1) },
      { monster: 'eclaireur', owner: 2, at: at(2, 2) },
    ]);
    const away = applyAction(applyAction(state, END_TURN), move('u2', at(3, 3)));
    const back = applyAction(away, END_TURN);
    expect(back.units.u2?.statuses).toEqual([]);
  });
});
