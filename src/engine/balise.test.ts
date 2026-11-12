import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { BOARDS, getManaZones } from './board';
import { CARDS, COMMON_CARDS } from './cards';
import { at, gameWith } from './test-utils';
import { getPlayerView } from './view';
import type { Action, Beacon, CardId, EffectTarget, GameState, PlayerId, Position, Trap, UnitId } from './types';

// Balise de vision (SPEC.md §6 ter, §10, 2026-11-12) : une balise, ni monstre ni terrain, au sol ; elle ne bloque rien,
// révèle à son joueur les pièges ennemis de son carré de 5, et une attaque ou un sort de dégâts la touche quand aucun
// monstre n'est sur sa case.

const play = (cardId: CardId, target: EffectTarget): Action => ({ type: 'playCard', cardId, target });
const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const beaconCells = (state: GameState) =>
  getLegalActions(state).flatMap((a) => (a.type === 'playCard' && a.cardId === 'balise-de-vision' && a.target.kind === 'cell' ? [a.target.pos] : []));
const withBeacon = (state: GameState, owner: PlayerId, pos: Position, hp = 3): GameState => {
  const beacon: Beacon = { id: `u${state.nextUnitId}`, cardId: 'balise-de-vision', owner, pos, hp, maxHp: 3 };
  return { ...state, beacons: [beacon], nextUnitId: state.nextUnitId + 1 };
};
const BALISE = { 1: { mana: 10, grimoire: ['balise-de-vision'] as CardId[] } };

describe('carte Balise de vision', () => {
  it('une balise commune : 2 mana, 3 PV, posée dans un carré de 3, révèle dans un carré de 5', () => {
    expect(CARDS['balise-de-vision']).toMatchObject({ kind: 'beacon', cost: 2, hp: 3, placement: { square: 3 }, revealTraps: { square: 5 } });
    expect(COMMON_CARDS).toContain('balise-de-vision');
  });
});

describe('poser une balise', () => {
  it('sur une case libre du carré de 3 d’un de ses monstres, ni occupée, ni plus loin', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(1, 1) },
        { monster: 'milicien', owner: 1, at: at(2, 2) },
      ],
      { players: BALISE },
    );
    const cells = beaconCells(state);
    expect(cells).toContainEqual(at(4, 4 - 1)); // à 3 cases de (1, 1)
    expect(cells).not.toContainEqual(at(2, 2)); // un monstre y est
    expect(cells).not.toContainEqual(at(1, 6)); // trop loin
  });

  it('pas sur la case centrale d’une mana zone qu’il tient ; une zone adverse, contestée ou neutre, oui', () => {
    const board = BOARDS.find((b) => b.contestation)!;
    const [held, other] = getManaZones(board).map((zone) => zone.pos);
    const beside = (pos: Position) => at(pos.row, pos.col + 1);
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: beside(held!) }, // tient cette zone (contestation : supériorité numérique)
        { monster: 'milicien', owner: 1, at: beside(other!) },
        { monster: 'milicien', owner: 2, at: at(other!.row, other!.col - 1) }, // l'autre zone est contestée
      ],
      { board, mode: 'contestation', players: BALISE },
    );
    const cells = beaconCells(state);
    expect(cells).not.toContainEqual(held);
    expect(cells).toContainEqual(other);
  });

  it('la carte quitte le grimoire, la balise est posée, elle n’est pas au cimetière', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(1, 1) }], { players: BALISE });
    const next = applyAction(state, play('balise-de-vision', { kind: 'cell', pos: at(2, 3) }));
    expect(next.beacons).toEqual([{ id: `u${state.nextUnitId}`, cardId: 'balise-de-vision', owner: 1, pos: at(2, 3), hp: 3, maxHp: 3 }]);
    expect(next.players[1]).toMatchObject({ mana: 8, grimoire: [], graveyard: [] });
    expect(next.events.some((e) => e.type === 'beaconPlaced')).toBe(true);
  });
});

describe('une balise ne bloque rien', () => {
  it('un monstre ennemi marche sur sa case et la traverse', () => {
    const state = withBeacon(gameWith([{ monster: 'chevalier', owner: 2, at: at(1, 1) }], { activePlayer: 2 }), 1, at(1, 2));
    const destinations = getLegalActions(state).flatMap((a) => (a.type === 'move' && a.unitId === 'u1' ? [a.to] : []));
    expect(destinations).toContainEqual(at(1, 2));
    expect(destinations).toContainEqual(at(1, 3));
  });

  it('elle ne gêne pas un tir : l’archer vise le monstre derrière elle', () => {
    const state = withBeacon(
      gameWith([
        { monster: 'archer', owner: 1, at: at(1, 1) },
        { monster: 'milicien', owner: 2, at: at(1, 3) },
      ]),
      2,
      at(1, 2),
    );
    expect(getLegalActions(state)).toContainEqual(attack('u1', 'u2'));
  });
});

describe('vision : les pièges ennemis de son carré de 5', () => {
  const trap = (pos: Position): Trap => ({ owner: 2, pos, effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe', sourceId: 'u9', expiresAtTurn: 8 });
  const state: GameState = { ...withBeacon(gameWith([]), 1, at(1, 1)), traps: [trap(at(5, 5)), trap(at(1, 7)), trap(at(1, 1))] };

  it('son joueur voit ceux de sa case et de son carré de 5, pas plus loin ; l’adversaire voit toujours les siens', () => {
    expect(getPlayerView(state, 1).traps.map((t) => t.pos)).toEqual([at(5, 5), at(1, 1)]);
    expect(getPlayerView(state, 2).traps).toHaveLength(3);
  });

  it('la balise est publique', () => {
    expect(getPlayerView(state, 2).beacons).toHaveLength(1);
  });
});

describe('attaquer une balise', () => {
  it('seule sur sa case : l’ATK du moment, sans riposte ; détruite, elle va au cimetière, sans VP', () => {
    const state = withBeacon(gameWith([{ monster: 'chevalier', owner: 2, at: at(1, 1) }], { activePlayer: 2 }), 1, at(1, 2));
    const id = state.beacons![0]!.id;
    expect(getLegalActions(state)).toContainEqual(attack('u1', id));
    const next = applyAction(state, attack('u1', id));
    expect(next.beacons).toEqual([]);
    expect(next.players[1].graveyard).toEqual([{ cardId: 'balise-de-vision' }]);
    expect(next.players[2].vp).toBe(state.players[2].vp);
    expect(next.events.some((e) => e.type === 'beaconDestroyed')).toBe(true);
  });

  it('avec moins de dégâts que ses PV, elle les perd et reste', () => {
    const state = withBeacon(gameWith([{ monster: 'milicien', owner: 2, at: at(1, 1) }], { activePlayer: 2 }), 1, at(1, 2));
    const next = applyAction(state, attack('u1', state.beacons![0]!.id));
    expect(next.beacons![0]).toMatchObject({ hp: 3 - 2 });
  });

  it('pas quand un monstre est sur sa case', () => {
    const state = withBeacon(
      gameWith([{ monster: 'chevalier', owner: 2, at: at(1, 1) }, { monster: 'golem', owner: 1, at: at(1, 2) }], { activePlayer: 2 }),
      1,
      at(1, 2),
    );
    expect(getLegalActions(state).some((a) => a.type === 'attack' && a.targetId === state.beacons![0]!.id)).toBe(false);
  });
});

describe('sorts de dégâts sur une balise', () => {
  it('Onde de choc : les balises ennemies seules dans sa zone', () => {
    const state = withBeacon(
      gameWith([{ monster: 'archi', owner: 1, at: at(2, 2) }], { players: { 1: { mana: 10, grimoire: ['onde-de-choc'] } } }),
      2,
      at(2, 4),
    );
    const next = applyAction(state, play('onde-de-choc', { kind: 'unit', unitId: 'u1' }));
    expect(next.beacons![0]).toMatchObject({ hp: 1 });
  });

  it('Chaînes d’éclair : une balise ennemie seule sur une chaîne', () => {
    const state = withBeacon(
      gameWith(
        [
          { monster: 'milicien', owner: 1, at: at(1, 0) },
          { monster: 'milicien', owner: 1, at: at(1, 5) },
        ],
        { players: { 1: { mana: 10, grimoire: ['chaines-eclair'] } } },
      ),
      2,
      at(1, 2),
    );
    const next = applyAction(state, play('chaines-eclair', { kind: 'all' }));
    expect(next.beacons).toEqual([]);
  });

  it('un sort qui vise un ennemi peut la viser (Boule de feu)', () => {
    const state = withBeacon(
      gameWith([{ monster: 'milicien', owner: 1, at: at(1, 1) }], { players: { 1: { mana: 10, grimoire: ['boule-de-feu'] } } }),
      2,
      at(2, 3),
    );
    const id = state.beacons![0]!.id;
    const targets = getLegalActions(state).flatMap((a) => (a.type === 'playCard' && a.cardId === 'boule-de-feu' ? [a.target] : []));
    expect(targets).toContainEqual({ kind: 'unit', unitId: id });
    const next = applyAction(state, play('boule-de-feu', { kind: 'unit', unitId: id }));
    expect(next.beacons![0]!.hp).toBeLessThan(3);
  });
});
