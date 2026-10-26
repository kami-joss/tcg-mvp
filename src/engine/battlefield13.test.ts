import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { BATTLEFIELD_13, BOARD, BOARDS, allPositions, getCell, getCliff, getManaZones, getSummonZone, parseMap } from './board';
import type { MapData } from './board';
import { getAttackTargets } from './combat';
import { getMoveDestinations } from './movement';
import { at, gameWith } from './test-utils';
import type { Board, Cell, ManaZoneId, PlayerId, Position } from './types';

// Grande carte 13 × 13 (SPEC.md §3, handoff V7) : chargée depuis `maps/champ-13x13.json`.

const N = 13;
const mirror = (pos: Position): Position => ({ row: N - 1 - pos.row, col: N - 1 - pos.col });
const MIRROR_ZONE: Readonly<Record<ManaZoneId, ManaZoneId>> = { forge: 'forge', ecurie: 'ferme', ferme: 'ecurie', scierie: 'mine', mine: 'scierie' };

/** La case vue par l'autre joueur : invocations et mana zones échangées. */
function mirrored(cell: Cell): Cell {
  if (cell.kind !== 'plain') return cell;
  const summonZoneOf = cell.summonZoneOf && ((3 - cell.summonZoneOf) as PlayerId);
  return { ...cell, summonZoneOf, manaZone: cell.manaZone && MIRROR_ZONE[cell.manaZone] };
}

/** Nombre de cases de marche depuis l'invocation la plus proche (falaises et cases bloquées comprises). */
function walkingDistances(board: Board, player: PlayerId): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier = getSummonZone(board, player);
  for (const pos of frontier) dist.set(`${pos.row},${pos.col}`, 0);
  for (let d = 1; frontier.length > 0; d++) {
    const next: Position[] = [];
    for (const pos of frontier) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const to = { row: pos.row + dr, col: pos.col + dc };
        const key = `${to.row},${to.col}`;
        if (dist.has(key) || getCell(board, to).kind !== 'plain' || getCliff(board, pos, to)) continue;
        dist.set(key, d);
        next.push(to);
      }
    }
    frontier = next;
  }
  return dist;
}

describe('carte « Champ de bataille » 13 × 13 (SPEC.md §3)', () => {
  it('13 × 13, proposée avec les autres ; 5 mana zones, 3 cases d’invocation par joueur', () => {
    expect(BATTLEFIELD_13).toMatchObject({ name: 'Champ de bataille (13 × 13)', rows: 13, cols: 13, mobilityBonus: 1 });
    expect(BOARDS).toContain(BATTLEFIELD_13);
    expect(getManaZones(BATTLEFIELD_13).map((z) => z.zone).sort()).toEqual(['ecurie', 'ferme', 'forge', 'mine', 'scierie']);
    expect(getSummonZone(BATTLEFIELD_13, 1)).toEqual([at(0, 0), at(0, 1), at(1, 0)]);
    expect(getSummonZone(BATTLEFIELD_13, 2)).toEqual([at(11, 12), at(12, 11), at(12, 12)]);
  });

  it('symétrique par rotation de 180° (invocations et zones échangées), eau comprise', () => {
    for (const pos of allPositions(BATTLEFIELD_13)) {
      expect(getCell(BATTLEFIELD_13, mirror(pos)), `(${pos.row}, ${pos.col})`).toEqual(mirrored(getCell(BATTLEFIELD_13, pos)));
    }
    const water = BATTLEFIELD_13.scenery!.water;
    expect(water).toEqual([at(2, 6), at(3, 6), at(9, 6), at(10, 6)]);
    for (const pos of water) expect(water).toContainEqual(mirror(pos));
  });

  it('équilibre : cases de marche depuis l’invocation la plus proche', () => {
    const table: Record<ManaZoneId, [number, number]> = { forge: [11, 11], mine: [13, 13], scierie: [13, 13], ecurie: [4, 18], ferme: [18, 4] };
    const d1 = walkingDistances(BATTLEFIELD_13, 1);
    const d2 = walkingDistances(BATTLEFIELD_13, 2);
    for (const { zone, pos } of getManaZones(BATTLEFIELD_13)) {
      expect([d1.get(`${pos.row},${pos.col}`), d2.get(`${pos.row},${pos.col}`)], zone).toEqual(table[zone]);
    }
  });

  it('Écurie et Ferme près des bases ; un passage dans chaque mur de rochers', () => {
    expect(getCell(BATTLEFIELD_13, at(4, 1))).toMatchObject({ manaZone: 'ecurie' });
    expect(getCell(BATTLEFIELD_13, at(8, 11))).toMatchObject({ manaZone: 'ferme' });
    for (const pos of [at(5, 3), at(7, 9)]) expect(getCell(BATTLEFIELD_13, pos).kind).toBe('plain');
    // De l’Écurie au passage : 3 pas.
    const walker = gameWith([{ monster: 'eclaireur', owner: 1, at: at(4, 1) }], { board: BATTLEFIELD_13 });
    expect(getMoveDestinations(walker, walker.units.u1 as never).find((d) => d.pos.row === 5 && d.pos.col === 3)?.cost).toBe(3);
  });

  it('falaises : la Mine est fermée (hautes), la Scierie ouverte aux tirs de portée 2+ (basses)', () => {
    expect(BATTLEFIELD_13.cliffs).toHaveLength(12);
    // Mêmes falaises de part et d'autre, par symétrie : seule la hauteur change.
    for (const { between: [a, b], rangedShotsPass } of BATTLEFIELD_13.cliffs) {
      expect(getCliff(BATTLEFIELD_13, mirror(a), mirror(b)), `(${a.row}, ${a.col})|(${b.row}, ${b.col})`).toMatchObject({
        rangedShotsPass: !rangedShotsPass,
      });
    }
    expect(getCliff(BATTLEFIELD_13, at(10, 3), at(10, 4))).toMatchObject({ rangedShotsPass: false, flyingPasses: false });
    // Murs intérieurs de la Mine, devant ses deux ouvertures.
    expect(getCliff(BATTLEFIELD_13, at(9, 1), at(10, 1))).toMatchObject({ rangedShotsPass: false });
    expect(getCliff(BATTLEFIELD_13, at(11, 2), at(11, 3))).toMatchObject({ rangedShotsPass: false });
    expect(getCliff(BATTLEFIELD_13, at(10, 2), at(10, 3))).toBeUndefined();
    expect(getCliff(BATTLEFIELD_13, at(2, 11), at(3, 11))).toMatchObject({ rangedShotsPass: true, flyingPasses: true });
    // On ne marche pas à travers une falaise.
    const walker = gameWith([{ monster: 'milicien', owner: 1, at: at(3, 11) }], { board: BATTLEFIELD_13 });
    // (3, 11) → (2, 11) : 3 pas en contournant par la colonne 12, pas 1.
    expect(getMoveDestinations(walker, walker.units.u1 as never).find((d) => d.pos.row === 2 && d.pos.col === 11)?.cost).toBe(3);
    // Tir de portée 2 par-dessus une falaise basse, pas par-dessus une haute.
    const low = gameWith(
      [
        { monster: 'archer', owner: 1, at: at(4, 11) },
        { monster: 'golem', owner: 2, at: at(2, 11) },
      ],
      { board: BATTLEFIELD_13 },
    );
    expect(getAttackTargets(low, low.units.u1 as never).map((u) => u.id)).toContain('u2');
    const high = gameWith(
      [
        { monster: 'archer', owner: 1, at: at(10, 4) },
        { monster: 'golem', owner: 2, at: at(10, 2) },
      ],
      { board: BATTLEFIELD_13 },
    );
    expect(getAttackTargets(high, high.units.u1 as never)).toEqual([]);
  });

  it('enclaves de la Scierie et de la Mine, pour le rendu', () => {
    expect(BATTLEFIELD_13.scenery!.enclaves).toEqual([
      { type: 'hollow', r0: 0, r1: 3, c0: 9, c1: 12, zone: at(1, 11) },
      { type: 'quarry', r0: 9, r1: 12, c0: 0, c1: 3, zone: at(11, 1) },
    ]);
    expect(getCell(BATTLEFIELD_13, at(1, 11))).toMatchObject({ manaZone: 'scierie' });
    expect(getCell(BATTLEFIELD_13, at(11, 1))).toMatchObject({ manaZone: 'mine' });
  });

  it('+1 mobilité pour tous les monstres : à l’invocation et à chaque début de tour, pas sur les autres plateaux', () => {
    const state = gameWith([], { board: BATTLEFIELD_13, players: { 1: { mana: 10, grimoire: ['milicien'] } } });
    const summoned = applyAction(state, { type: 'playCard', cardId: 'milicien', target: { kind: 'cell', pos: at(0, 0) } });
    expect(summoned.units.u1).toMatchObject({ mobilityLeft: 3 }); // Milicien : mobilité 2
    const again = applyAction(applyAction(summoned, { type: 'endTurn' }), { type: 'endTurn' });
    expect(again.units.u1).toMatchObject({ mobilityLeft: 3 });
    expect(gameWith([{ monster: 'milicien', owner: 1, at: at(0, 0) }], { board: BATTLEFIELD_13 }).units.u1).toMatchObject({ mobilityLeft: 3 });
    expect(gameWith([{ monster: 'milicien', owner: 1, at: at(1, 4) }], { board: BOARD }).units.u1).toMatchObject({ mobilityLeft: 2 });
  });

  it('lecteur de carte : refuse une eau hors d’un X et un type de falaise inconnu', () => {
    const base: MapData = { lignes: ['1 P', 'X 2'], eau: [], falaises: [], enclaves: [] };
    expect(parseMap('mini', base)).toMatchObject({ rows: 2, cols: 2, scenery: { water: [], enclaves: [] } });
    expect(() => parseMap('mini', { ...base, eau: ['0,1'] })).toThrow(/doit être un X/);
    expect(() => parseMap('mini', { ...base, falaises: [{ entre: [[0, 1], [1, 1]], type: 'moyenne' }] })).toThrow(/inconnu/);
  });
});
