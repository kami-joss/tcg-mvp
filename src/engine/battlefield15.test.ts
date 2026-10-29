import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_15, BOARDS, allPositions, getCell, getManaZones, getSummonZone, parseMap } from './board';
import type { MapData } from './board';
import { getAttackTargets, getLineOfSightCells } from './combat';
import { getMoveDestinations } from './movement';
import { at, gameWith } from './test-utils';
import type { UnitSpec } from './test-utils';
import type { Board, CardId, Cell, ManaZoneId, MonsterUnit, PlayerId, Position } from './types';

// Grande carte 15 × 15 (SPEC.md §3, §10, handoff plateau 15) : chargée depuis `maps/champ-15x15.json`.

const N = 15;
const key = (pos: Position) => `${pos.row},${pos.col}`;
const mirror = (pos: Position): Position => ({ row: N - 1 - pos.row, col: N - 1 - pos.col });
const MIRROR_ZONE: Readonly<Record<ManaZoneId, ManaZoneId>> = { forge: 'forge', ecurie: 'ferme', ferme: 'ecurie', scierie: 'mine', mine: 'scierie' };

/** La case vue par l'autre joueur : invocations et mana zones échangées ; la hauteur d'une X n'entre pas en compte. */
function mirrored(cell: Cell): Cell {
  if (cell.kind === 'blocked') return { kind: 'blocked' };
  if (cell.kind !== 'plain') return cell;
  const summonZoneOf = cell.summonZoneOf && ((3 - cell.summonZoneOf) as PlayerId);
  return { ...cell, summonZoneOf, manaZone: cell.manaZone && MIRROR_ZONE[cell.manaZone] };
}
const withoutHeight = (cell: Cell): Cell => (cell.kind === 'blocked' ? { kind: 'blocked' } : cell);

/** Nombre de cases de marche depuis l'invocation la plus proche (cases X toutes infranchissables à pied). */
function walkingDistances(board: Board, player: PlayerId): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier = getSummonZone(board, player);
  for (const pos of frontier) dist.set(key(pos), 0);
  for (let d = 1; frontier.length > 0; d++) {
    const next: Position[] = [];
    for (const pos of frontier) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const to = { row: pos.row + dr, col: pos.col + dc };
        if (dist.has(key(to)) || getCell(board, to).kind !== 'plain') continue;
        dist.set(key(to), d);
        next.push(to);
      }
    }
    frontier = next;
  }
  return dist;
}

const on15 = (units: readonly UnitSpec[]) => gameWith(units, { board: BATTLEFIELD_15 });
const destinations = (state: ReturnType<typeof on15>, id = 'u1') => getMoveDestinations(state, state.units[id] as MonsterUnit).map((d) => key(d.pos));
const targets = (state: ReturnType<typeof on15>) => getAttackTargets(state, state.units.u1 as MonsterUnit).map((u) => u.id);

describe('carte « Champ de bataille » 15 × 15 (SPEC.md §3)', () => {
  it('15 × 15, proposée avec les autres, +1 mobilité ; 5 mana zones, 3 cases d’invocation par joueur', () => {
    expect(BATTLEFIELD_15).toMatchObject({ name: 'Champ de bataille (15 × 15)', rows: 15, cols: 15, mobilityBonus: 1 });
    expect(BOARDS).toContain(BATTLEFIELD_15);
    expect(Object.fromEntries(getManaZones(BATTLEFIELD_15).map(({ zone, pos }) => [zone, pos]))).toEqual({
      ecurie: at(2, 2),
      ferme: at(12, 12),
      forge: at(7, 7),
      mine: at(2, 12),
      scierie: at(12, 2),
    });
    expect(getSummonZone(BATTLEFIELD_15, 1)).toEqual([at(0, 0), at(0, 1), at(1, 0)]);
    expect(getSummonZone(BATTLEFIELD_15, 2)).toEqual([at(13, 14), at(14, 13), at(14, 14)]);
  });

  it('symétrique par rotation de 180° (invocations et zones échangées) ; seule la hauteur des X diffère', () => {
    for (const pos of allPositions(BATTLEFIELD_15)) {
      expect(withoutHeight(getCell(BATTLEFIELD_15, mirror(pos))), `(${pos.row}, ${pos.col})`).toEqual(
        mirrored(getCell(BATTLEFIELD_15, pos)),
      );
    }
  });

  it('aucune case jouable isolée : tout se rejoint à pied depuis une base', () => {
    const plain = allPositions(BATTLEFIELD_15).filter((pos) => getCell(BATTLEFIELD_15, pos).kind === 'plain');
    expect(walkingDistances(BATTLEFIELD_15, 1).size).toBe(plain.length);
  });

  it('équilibre : Mine, Scierie et Forge à 13 cases de marche de chaque base ; Écurie et Ferme à 3 de la leur', () => {
    const table: Record<ManaZoneId, [number, number]> = { forge: [13, 13], mine: [13, 13], scierie: [13, 13], ecurie: [3, 23], ferme: [23, 3] };
    const d1 = walkingDistances(BATTLEFIELD_15, 1);
    const d2 = walkingDistances(BATTLEFIELD_15, 2);
    for (const { zone, pos } of getManaZones(BATTLEFIELD_15)) {
      expect([d1.get(key(pos)), d2.get(key(pos))], zone).toEqual(table[zone]);
    }
  });

  it('Mine : parois et tas de minerai en X hautes, deux entrées ; Scierie : canal et billots en X basses, deux ponts', () => {
    for (const pos of [at(1, 9), at(5, 13), at(9, 1), at(13, 5)]) expect(getCell(BATTLEFIELD_15, pos).kind, key(pos)).toBe('plain');
    for (const pos of [at(0, 9), at(2, 9), at(5, 10), at(5, 14), at(2, 11), at(3, 12)]) {
      expect(getCell(BATTLEFIELD_15, pos), key(pos)).toEqual({ kind: 'blocked', height: 'high' });
    }
    for (const pos of [at(9, 0), at(9, 3), at(14, 5), at(11, 2), at(12, 3)]) {
      expect(getCell(BATTLEFIELD_15, pos), key(pos)).toEqual({ kind: 'blocked', height: 'low' });
    }
    // Étangs : X basses (validé) ; crête claire côté Scierie : X ordinaires.
    for (const pos of [at(2, 7), at(3, 7), at(11, 7), at(12, 7)]) expect(getCell(BATTLEFIELD_15, pos)).toEqual({ kind: 'blocked', height: 'low' });
    for (const pos of [at(9, 4), at(9, 5), at(10, 5)]) expect(getCell(BATTLEFIELD_15, pos)).toEqual({ kind: 'blocked' });
  });
});

describe('cases X hautes et basses (SPEC.md §10)', () => {
  it('Mine fermée à `vol` : entrées tenues par l’ennemi, un dragon ne peut pas y entrer', () => {
    const dragon = { monster: 'dragonnet', owner: 1, at: at(1, 7), mobilityLeft: 30 } as const;
    expect(destinations(on15([dragon]))).toContain('2,12');
    const blocked = on15([
      dragon,
      { monster: 'golem', owner: 2, at: at(1, 9) },
      { monster: 'golem', owner: 2, at: at(5, 13) },
    ]);
    expect(destinations(blocked)).not.toContain('2,12');
  });

  it('`vol` survole une X basse ou ordinaire, pas une X haute ; à pied, aucune', () => {
    // (3, 8) → (3, 6) en 2 pas par-dessus l'étang (3, 7) ; (3, 10) derrière la paroi (3, 9) reste hors d'atteinte.
    const flying = on15([{ monster: 'dragonnet', owner: 1, at: at(3, 8), mobilityLeft: 2 }]);
    expect(destinations(flying)).toContain('3,6');
    expect(destinations(flying)).not.toContain('3,10');
    const walking = on15([{ monster: 'milicien', owner: 1, at: at(3, 8), mobilityLeft: 2 }]);
    expect(destinations(walking)).not.toContain('3,6');
    // Le canal (9, 2) et la crête ordinaire (10, 5) se survolent.
    expect(destinations(on15([{ monster: 'dragonnet', owner: 1, at: at(8, 2), mobilityLeft: 2 }]))).toContain('10,2');
    expect(destinations(on15([{ monster: 'dragonnet', owner: 1, at: at(10, 4), mobilityLeft: 2 }]))).toContain('10,6');
  });

  it('tirs : portée 2+ par-dessus une X basse (canal, étang), jamais par-dessus une X haute ou ordinaire', () => {
    const shot = (from: Position, to: Position, monster: CardId = 'archer') =>
      targets(on15([{ monster, owner: 1, at: from }, { monster: 'golem', owner: 2, at: to }]));
    expect(shot(at(8, 2), at(10, 2))).toEqual(['u2']); // canal
    expect(shot(at(2, 6), at(2, 8))).toEqual(['u2']); // étang
    expect(shot(at(3, 8), at(3, 10))).toEqual([]); // paroi de la Mine
    expect(shot(at(10, 4), at(10, 6))).toEqual([]); // crête ordinaire
  });

  it('un monstre de portée 1 ne frappe pas à travers une X basse ; la ligne de vue de l’effet suit la même règle', () => {
    const state = on15([{ monster: 'chevalier', owner: 1, at: at(8, 2) }, { monster: 'golem', owner: 2, at: at(10, 2) }]);
    expect(getLineOfSightCells(state, at(8, 2), 1)).toEqual([]);
    expect(getLineOfSightCells(state, at(8, 2), 2)).toEqual([at(10, 2)]);
    expect(getLineOfSightCells(state, at(8, 2), 3)).toEqual([at(10, 2)]);
  });

  it('lecteur de carte : `casesX` sur des X seulement, une fois chacune ; sans `casesX`, X ordinaires', () => {
    const base: MapData = { lignes: ['1 X', 'X 2'], eau: [], falaises: [], enclaves: [] };
    expect(getCell(parseMap('mini', base), at(0, 1))).toEqual({ kind: 'blocked' });
    const map = parseMap('mini', { ...base, casesX: { haute: [[0, 1]], basse: [[1, 0]] } });
    expect(getCell(map, at(0, 1))).toEqual({ kind: 'blocked', height: 'high' });
    expect(getCell(map, at(1, 0))).toEqual({ kind: 'blocked', height: 'low' });
    expect(() => parseMap('mini', { ...base, casesX: { haute: [[0, 0]] } })).toThrow(/doit être un X/);
    expect(() => parseMap('mini', { ...base, casesX: { haute: [[0, 1]], basse: [[0, 1]] } })).toThrow(/deux fois/);
  });
});
