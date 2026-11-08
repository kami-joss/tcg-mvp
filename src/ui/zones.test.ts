import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import type { Board, Cell, PlayerId, Position } from '../engine';
import { BATTLEFIELD_15 } from '../engine/board';
import { addStatus } from '../engine/statuses';
import { at, gameWith } from '../engine/test-utils';
import type { UnitSpec } from '../engine/test-utils';
import type { GameState } from '../engine/types';
import { getDangerEdges, getDangerZone, getMoveCosts, getUnitZones, getZonePath } from './zones';

// Zones « aller », « attaquer » et « danger » (handoff « zones », SPEC.md §10), d'après les règles du moteur.

const keys = (cells: readonly Position[]) => cells.map((p) => `${p.row},${p.col}`).sort();

/** Plateau 9 × 9 sans falaise ni case X : les cas simples se lisent à la main. */
const PLAIN: Cell = { kind: 'plain', summonZoneOf: null, manaZone: null };
const OPEN: Board = {
  name: 'Ouvert',
  rows: 9,
  cols: 9,
  cells: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => PLAIN)),
  cliffs: [],
  scenery: null,
  contestation: false,
};

const open = (units: readonly UnitSpec[]) => gameWith(units, { board: OPEN });
const on15 = (units: readonly UnitSpec[]) => gameWith(units, { board: BATTLEFIELD_15 });
const view = (state: GameState, player: PlayerId = 1) => getPlayerView(state, player);

describe('mobilité que coûte chaque case d’aller', () => {
  it('le plus court chemin, pour chaque case d’aller et seulement elles', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(4, 4), mobilityLeft: 2 },
      { monster: 'milicien', owner: 1, at: at(4, 5) }, // allié : traversé, pas une case d’arrêt
    ]);
    const costs = getMoveCosts(view(state), 'u1');
    expect([...costs.keys()].sort()).toEqual(keys(getUnitZones(view(state), 'u1').moves));
    expect(costs.get('3,4')).toBe(1);
    expect(costs.get('2,4')).toBe(2);
    expect(costs.get('3,5')).toBe(2);
    expect(costs.get('4,6')).toBe(2); // à travers l’allié
    expect(costs.has('4,5')).toBe(false);
  });

  it('le slow d’un Terrain piégé ennemi coûte un pas de plus', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(4, 4), mobilityLeft: 3 },
      { terrain: 'terrain-piege', owner: 2, at: at(4, 7) },
    ]);
    const costs = getMoveCosts(view(state), 'u1');
    expect(costs.get('4,5')).toBe(1);
    expect(costs.get('4,6')).toBe(3);
  });

  it('un monstre adverse : sa mobilité de son prochain tour', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(0, 0) },
      { monster: 'milicien', owner: 2, at: at(4, 4), mobilityLeft: 0 },
    ]);
    const costs = getMoveCosts(view(state), 'u2');
    expect(costs.get('3,4')).toBe(1);
    expect(Math.max(...costs.values())).toBeGreaterThan(1);
  });
});

describe('aller et attaquer : le pion sélectionné', () => {
  it('aller = ses déplacements légaux ; attaquer = depuis sa case ou une case d’arrêt, hors aller, hors alliés', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(4, 4), mobilityLeft: 1 },
      { monster: 'milicien', owner: 1, at: at(4, 6) }, // allié : ni aller, ni attaquer
      { monster: 'golem', owner: 2, at: at(2, 4) }, // ennemi : attaquable depuis (3, 4)
    ]);
    const zones = getUnitZones(view(state), 'u1');
    expect(keys(zones.moves)).toEqual(['3,4', '4,3', '4,5', '5,4']);
    expect(keys(zones.attacks)).toEqual(['2,4', '3,3', '3,5', '4,2', '5,3', '5,5', '6,4']);
  });

  it('portée 2 : un allié ne gêne pas le tir, un ennemi l’arrête ; diagonale jusqu’à portée ÷ 2', () => {
    const state = open([
      { monster: 'archer', owner: 1, at: at(4, 4), mobilityLeft: 0 },
      { monster: 'milicien', owner: 1, at: at(4, 5) },
      { monster: 'golem', owner: 2, at: at(4, 3) },
    ]);
    const { moves, attacks } = getUnitZones(view(state), 'u1');
    expect(moves).toEqual([]);
    expect(keys(attacks)).toEqual(['2,4', '3,3', '3,4', '3,5', '4,3', '4,6', '5,3', '5,4', '5,5', '6,4']);
  });

  it('plus d’attaque ce tour : seulement ses cases d’aller', () => {
    const state = open([{ monster: 'milicien', owner: 1, at: at(4, 4), mobilityLeft: 1, hasAttacked: true }]);
    expect(getUnitZones(view(state), 'u1').attacks).toEqual([]);
  });

  it('cases X du 15 × 15 : un tir de portée 2 passe une X basse, jamais une X haute ; portée 1, aucune', () => {
    const shoots = (monster: 'archer' | 'milicien', from: Position, to: Position) =>
      keys(getUnitZones(view(on15([{ monster, owner: 1, at: from, mobilityLeft: 0 }])), 'u1').attacks).includes(`${to.row},${to.col}`);
    expect(shoots('archer', at(8, 2), at(10, 2))).toBe(true); // canal, X basse
    expect(shoots('archer', at(3, 8), at(3, 10))).toBe(false); // paroi de la Mine, X haute
    expect(shoots('milicien', at(8, 2), at(10, 2))).toBe(false);
  });

  it('`vol` survole une X basse, pas une X haute ; à pied, aucune', () => {
    const moves = (monster: 'dragonnet' | 'milicien') =>
      keys(getUnitZones(view(on15([{ monster, owner: 1, at: at(3, 8), mobilityLeft: 2 }])), 'u1').moves);
    expect(moves('dragonnet')).toContain('3,6'); // par-dessus l'étang
    expect(moves('dragonnet')).not.toContain('3,10'); // derrière la paroi
    expect(moves('milicien')).not.toContain('3,6');
  });

  it('un monstre adverse : ses zones de son prochain tour (mobilité de sa carte) ; rien s’il sera stun', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(8, 8) },
      { monster: 'milicien', owner: 2, at: at(4, 4), mobilityLeft: 0 },
    ]);
    expect(getUnitZones(view(state), 'u2').moves).toHaveLength(12); // mobilité 2 au prochain tour, malgré 0 maintenant
    const stunned = addStatus(state, 'u2', { kind: 'stun', turns: 1 });
    expect(getUnitZones(view(stunned), 'u2')).toEqual({ moves: [], attacks: [] });
  });
});

describe('danger : l’union des monstres adverses', () => {
  it('aller et attaquer de chaque ennemi, sans leurs propres cases', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(4, 4) },
      { monster: 'milicien', owner: 2, at: at(0, 0) },
      { monster: 'milicien', owner: 2, at: at(0, 8) },
    ]);
    const danger = keys(getDangerZone(view(state), 1));
    const { moves, attacks } = getUnitZones(view(state), 'u2');
    const other = getUnitZones(view(state), 'u3');
    const union = new Set(keys([...moves, ...attacks, ...other.moves, ...other.attacks]));
    expect(danger).toEqual([...union].filter((k) => k !== '0,0' && k !== '0,8').sort());
    expect(danger).toContain('2,0'); // le premier
    expect(danger).toContain('2,8'); // le second
    expect(danger).not.toContain('4,4'); // trop loin
  });

  it('un ennemi invisible ne compte pas : le joueur ne le voit pas', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(8, 8) },
      { monster: 'farceur', owner: 2, at: at(0, 0) }, // Camouflage 2, loin de tout : caché
    ]);
    expect(getDangerZone(view(state), 1)).toEqual([]);
  });

  it('vu d’un monstre adverse sélectionné : le danger, ce sont tes monstres', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(4, 4), mobilityLeft: 1 },
      { monster: 'golem', owner: 2, at: at(0, 0) },
    ]);
    const mine = getUnitZones(view(state), 'u1');
    expect(keys(getDangerZone(view(state), 2))).toEqual(keys([...mine.moves, ...mine.attacks]));
  });
});

describe('chemin et contour', () => {
  it('chemin vers une case d’aller : les cases traversées, départ et arrivée exclus', () => {
    const state = open([
      { monster: 'milicien', owner: 1, at: at(4, 4), mobilityLeft: 2 },
      { monster: 'golem', owner: 2, at: at(4, 5) }, // il faut le contourner
    ]);
    expect(getZonePath(view(state), 'u1', at(4, 3))).toEqual([]);
    expect(getZonePath(view(state), 'u1', at(2, 4))).toEqual([at(3, 4)]);
    const around = getZonePath(view(state), 'u1', at(3, 5));
    expect(around).toHaveLength(1);
    expect(keys(around)).toEqual(['3,4']);
    expect(getZonePath(view(state), 'u1', at(4, 6))).toEqual([]); // hors d'atteinte
  });

  it('contour : seulement les côtés qui donnent sur une case hors danger', () => {
    const edges = getDangerEdges([at(2, 2), at(2, 3), at(3, 2)]);
    expect(edges.get('2,2')).toEqual({ up: true, down: false, left: true, right: false });
    expect(edges.get('2,3')).toEqual({ up: true, down: true, left: false, right: true });
    expect(edges.get('3,2')).toEqual({ up: false, down: true, left: true, right: true });
  });
});
