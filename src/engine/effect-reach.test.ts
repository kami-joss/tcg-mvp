import { describe, expect, it } from 'vitest';
import { getEffectReach } from './effects';
import { at, gameWith } from './test-utils';
import type { UnitSpec } from './test-utils';
import type { Ability, Board, Cell, MonsterUnit, Position, Targeting } from './types';

// Portée d'un effet (pour l'afficher au survol) : les cases que son ciblage peut viser ou toucher, cible ou non.

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

const keys = (cells: readonly Position[]) => cells.map((p) => `${p.row},${p.col}`).sort();
const ability = (targeting: Targeting) => ({ name: 'Essai', manaCost: 1, targeting, effects: [] }) as unknown as Ability;
const reach = (targeting: Targeting, units: readonly UnitSpec[] = []) => {
  const state = gameWith([{ monster: 'milicien', owner: 1, at: at(4, 4) }, ...units], { board: OPEN });
  return keys(getEffectReach(state, ability(targeting), 1, state.units.u1 as MonsterUnit));
};

describe('portée d’un effet de monstre', () => {
  it('carré de 1 : les 8 cases autour, qu’il y ait une cible ou non', () => {
    expect(reach({ type: 'monster', side: 'enemy', reach: { type: 'square1' } })).toHaveLength(8);
    expect(reach({ type: 'emptySquareCell' })).toEqual(reach({ type: 'monster', side: 'ally', reach: { type: 'square1' } }));
  });

  it('en ligne : la ligne de vue d’une attaque, arrêtée par un ennemi', () => {
    const cells = reach({ type: 'monster', side: 'enemy', reach: { type: 'line', range: 2 } }, [{ monster: 'golem', owner: 2, at: at(3, 4) }]);
    expect(cells).toEqual(['3,4', '4,2', '4,3', '4,5', '4,6', '5,4', '6,4']);
  });

  it('zone en ligne : les quatre directions ; zone autour : son carré', () => {
    expect(reach({ type: 'zone', zone: 'line3' })).toHaveLength(12);
    expect(reach({ type: 'zone', zone: 'square2' })).toHaveLength(24);
  });

  it('soi-même : sa case ; n’importe où : les cases des monstres visés', () => {
    expect(reach({ type: 'self' })).toEqual(['4,4']);
    const units: UnitSpec[] = [
      { monster: 'golem', owner: 2, at: at(0, 0) },
      { monster: 'golem', owner: 2, at: at(8, 8) },
    ];
    expect(reach({ type: 'monster', side: 'enemy', reach: { type: 'anywhere' } }, units)).toEqual(['0,0', '8,8']);
    expect(reach({ type: 'enemies' }, units)).toEqual(['0,0', '8,8']);
  });
});
