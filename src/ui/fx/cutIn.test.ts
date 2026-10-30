import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, getPlayerView } from '../../engine';
import type { Action, GameState, PlayerId } from '../../engine';
import { at, gameWith } from '../../engine/test-utils';
import { CUT_IN_MS, cutInFrames, cutInIndex, cutInOf, cutInScale } from './cutIn';

/** Le cut-in de l'action, comme le lecteur le trouve : sur la vue d'avant, au premier événement qui peut l'ouvrir. */
function cutInFor(state: GameState, action: Action, viewer: PlayerId = state.activePlayer) {
  const before = getPlayerView(state, viewer);
  const { events } = getPlayerView(applyAction(state, action), viewer);
  const index = cutInIndex(events);
  return index < 0 ? null : cutInOf(events[index]!, before, events.slice(index + 1));
}

const FORGE = at(5, 4);

describe('cut-in : la carte qui agit, mise en avant', () => {
  it('attaque : la carte de l’attaquant, qui repart vers lui ; la riposte n’en a pas d’autre', () => {
    const state = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ]);
    const action: Action = { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false };
    const { events } = getPlayerView(applyAction(state, action), 1);
    const riposte = events.find((e) => e.type === 'riposte');
    expect(riposte).toBeDefined();
    expect(events[cutInIndex(events)]!.type).toBe('attack');
    expect(cutInOf(riposte!, getPlayerView(state, 1), [])).toBeNull();
    expect(cutInFor(state, action)).toEqual({
      kind: 'attack',
      cardId: 'chevalier',
      owner: 1,
      shiny: false,
      title: 'Chevalier',
      archetype: '',
      action: 'Attaque',
      effect: null,
      to: at(8, 1),
    });
  });

  it('effet actif : le nom de l’effet, le nom de la carte sans son archétype, et l’archétype à part', () => {
    const state = gameWith(
      [
        { monster: 'dragon-feu', owner: 1, at: at(8, 1), facing: 'right' },
        { monster: 'milicien', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { mana: 5 } } },
    );
    const action = getLegalActions(state).find((a) => a.type === 'activateEffect' && a.unitId === 'u1')!;
    expect(cutInFor(state, action)).toMatchObject({
      kind: 'effect',
      cardId: 'dragon-feu',
      title: 'Dragon élémentaire de feu',
      archetype: 'Dragons',
      action: 'Effet actif',
      effect: 'Déflagration',
      to: at(8, 1),
    });
  });

  it('sort : il file vers le monstre visé ; un sort sans cible s’efface sur place', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(9, 5) },
        { monster: 'poseur-de-piege', owner: 1, at: at(9, 2) },
      ],
      { players: { 1: { mana: 10, grimoire: ['benediction', 'penombre'] } } },
    );
    const blessing: Action = { type: 'playCard', cardId: 'benediction', target: { kind: 'unit', unitId: 'u1' } };
    expect(cutInFor(state, blessing)).toMatchObject({ kind: 'spell', cardId: 'benediction', action: 'Sort', to: at(9, 5) });
    const shadow = getLegalActions(state).find((a) => a.type === 'playCard' && a.cardId === 'penombre')!;
    expect(cutInFor(state, shadow)).toMatchObject({ kind: 'spell', cardId: 'penombre', title: 'Pénombre', archetype: 'Pièges', to: null });
  });

  it('terrain et invocation : la carte file vers sa case ; un exemplaire brillant le reste', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: FORGE }], {
      players: { 1: { mana: 10, shiny: ['milicien'] } },
    });
    const terrain: Action = { type: 'playCard', cardId: 'bastion', target: { kind: 'cell', pos: FORGE } };
    expect(cutInFor(state, terrain)).toMatchObject({ kind: 'terrain', cardId: 'bastion', action: 'Terrain', shiny: false, to: FORGE });
    const summon: Action = { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 4) } };
    expect(cutInFor(state, summon)).toMatchObject({ kind: 'summon', cardId: 'milicien', action: 'Invocation', shiny: true, to: at(0, 4) });
  });

  it('un monstre brillant attaque en brillant', () => {
    const base = gameWith([
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'golem', owner: 2, at: at(8, 2) },
    ]);
    const state: GameState = { ...base, units: { ...base.units, u1: { ...base.units.u1!, shiny: true } } };
    expect(cutInFor(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false })).toMatchObject({ shiny: true });
  });

  it('l’action de l’adversaire (IA) a son cut-in, à sa couleur, dans la vue du joueur', () => {
    const state = gameWith(
      [
        { monster: 'golem', owner: 2, at: at(8, 2) },
        { monster: 'chevalier', owner: 1, at: at(8, 1) },
      ],
      { activePlayer: 2 },
    );
    expect(cutInFor(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false }, 1)).toMatchObject({
      kind: 'attack',
      cardId: 'golem',
      owner: 2,
    });
  });

  it('ni déplacement ni fin du tour ; rien si l’unité qui agit n’est pas dans la vue', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(9, 5) }]);
    expect(cutInFor(state, { type: 'move', unitId: 'u1', to: at(8, 5) })).toBeNull();
    expect(cutInFor(state, { type: 'endTurn' })).toBeNull();
    const view = getPlayerView(state, 1);
    const ghost = { type: 'attack', unitId: 'u9', targetId: 'u1', from: at(8, 5), to: at(9, 5), behind: false } as const;
    expect(cutInOf(ghost, view, [])).toBeNull();
  });
});

describe('cut-in : taille et trajet', () => {
  it('la plus grande carte qui tient dans la fenêtre, overframe comprise, entre 0,5 et 1,25', () => {
    expect(cutInScale({ width: 1600, height: 1000 }, 0)).toBe(1.25);
    expect(cutInScale({ width: 1600, height: 800 }, 186)).toBeCloseTo((800 - 112) / (498 + 186), 3);
    expect(cutInScale({ width: 1600, height: 800 }, 186)).toBeLessThan(cutInScale({ width: 1600, height: 800 }, 0));
    expect(cutInScale({ width: 320, height: 300 }, 0)).toBe(0.5);
  });

  it('surgit, se pose à son échelle, puis file vers la case en rapetissant à la taille d’un jeton', () => {
    const frames = cutInFrames(1.2, { dx: -300, dy: 140 });
    const offsets = frames.slice(1, -1).map((f) => f.offset as number);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(frames[0]).toMatchObject({ opacity: 0 });
    expect(frames[2]!.transform).toContain('scale(1.2)');
    expect(frames.at(-1)!.transform).toContain('translate(-300px, 140px)');
    expect(frames.at(-1)!.transform).toContain('scale(0.2)');
    // Mêmes fonctions de transformation partout : le navigateur peut interpoler chaque image clé.
    const shape = (t: unknown) => String(t).replace(/\([^)]*\)/g, '()');
    expect(new Set(frames.map((f) => shape(f.transform))).size).toBe(1);
  });

  it('sans case d’arrivée, elle grossit en s’effaçant sur place ; le tout dure 1,2 s', () => {
    const last = cutInFrames(1, null).at(-1)!;
    expect(last.transform).toContain('translate(0px, 0px)');
    expect(last.opacity).toBe(0);
    expect(CUT_IN_MS).toBe(1200);
  });
});
