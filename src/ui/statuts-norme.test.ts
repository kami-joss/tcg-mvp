import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import { addStatus } from '../engine/statuses';
import { at, gameWith } from '../engine/test-utils';
import { statusText } from './cardText';
import { getSheet, reasonStatus } from './sheet';
import { groupStatuses, isBonus, statusEffect, statusIcon, statusLabel } from './statusInfo';
import { statusPills } from './pixi/tokenModel';

// Norme des statuts dans l'interface (SPEC.md §5 bis) : noms, bonus ou malus, descriptions, pastilles, fiche, notation.

describe('vocabulaire des statuts', () => {
  it('noms avec leur valeur, signés pour une stat', () => {
    expect(statusLabel({ kind: 'slow', amount: 2, turns: 1 })).toBe('Slow 2');
    expect(statusLabel({ kind: 'absorbe', amount: 1, turns: 1 })).toBe('Absorbé');
    expect(statusLabel({ kind: 'recuperation', amount: 3, turns: 1 })).toBe('Récupération 3');
    expect(statusLabel({ kind: 'stat', stat: 'atk', amount: 2, turns: 1 })).toBe('ATK +2');
    expect(statusLabel({ kind: 'stat', stat: 'mobility', amount: -1, turns: 1 })).toBe('mobilité −1');
    expect(statusLabel({ kind: 'invisible', turns: 1 })).toBe('Invisible');
    expect(statusLabel({ kind: 'camouflage', turns: 1 })).toBe('Camouflage');
    expect(statusLabel({ kind: 'requiem' })).toBe('Requiem');
  });

  it('bonus ou malus', () => {
    for (const kind of ['camouflage', 'invisible', 'carapace', 'vol'] as const) expect(isBonus({ kind, turns: 1 }), kind).toBe(true);
    for (const kind of ['stun', 'silence', 'epuise', 'immobilise'] as const) expect(isBonus({ kind, turns: 1 }), kind).toBe(false);
    expect(isBonus({ kind: 'recuperation', amount: 1, turns: 1 })).toBe(true);
    expect(isBonus({ kind: 'absorbe', amount: 1, turns: 1 })).toBe(false);
    expect(isBonus({ kind: 'stat', stat: 'range', amount: 1, turns: 1 })).toBe(true);
    expect(isBonus({ kind: 'stat', stat: 'range', amount: -1, turns: 1 })).toBe(false);
    expect(isBonus({ kind: 'requiem' })).toBe(false);
  });

  it('descriptions de la norme de l’utilisateur', () => {
    expect(statusEffect({ kind: 'camouflage', turns: 1 })).toBe('invisible pour l’adversaire à plus de 2 cases');
    expect(statusEffect({ kind: 'invisible', turns: 1 })).toBe('invisible pour l’adversaire à plus de 1 case');
    expect(statusEffect({ kind: 'epuise', turns: 1 })).toBe('ne peut pas attaquer');
    expect(statusEffect({ kind: 'vol', turns: 1 })).toBe('peut survoler les cases X');
    expect(statusLabel({ kind: 'vol', turns: 1 })).toBe('Vol');
    expect(statusText({ kind: 'vol', turns: 2 })).toBe('vol pendant 2 tours');
    expect(statusEffect({ kind: 'requiem' })).toMatch(/deuxième tour/);
  });

  it('notation des cartes : minuscules sauf une stat ; durée à la suite', () => {
    expect(statusText({ kind: 'epuise', turns: 1 })).toBe('épuisé pendant 1 tour');
    expect(statusText({ kind: 'recuperation', amount: 2, turns: 2 })).toBe('récupération 2 pendant 2 tours');
    expect(statusText({ kind: 'stat', stat: 'atk', amount: 2, turns: 1 })).toBe('ATK +2 pendant 1 tour');
    expect(statusText({ kind: 'invisible', turns: 0 })).toBe('invisible jusqu’à son prochain tour');
  });

  it('une icône par statut, celle de sa stat pour ATK, mobilité, portée et PV max', () => {
    expect(statusIcon({ kind: 'epuise', turns: 1 })).toBe('anvil');
    expect(statusIcon({ kind: 'stat', stat: 'atk', amount: 1, turns: 1 })).toBe('broadsword');
    expect(statusIcon({ kind: 'stat', stat: 'range', amount: 1, turns: 1 })).toBe('high-shot');
  });
});

describe('fiche et pastilles', () => {
  const withStatuses = () => {
    let state = gameWith([{ monster: 'golem', owner: 1, at: at(9, 1) }]);
    for (const spec of [
      { kind: 'epuise', turns: 2 },
      { kind: 'stat', stat: 'atk', amount: 2, turns: 2 },
      { kind: 'stat', stat: 'atk', amount: 1, turns: 2 },
      { kind: 'stat', stat: 'range', amount: -1, turns: 2 },
      { kind: 'recuperation', amount: 2, turns: 2 },
    ] as const) {
      state = addStatus(state, 'u1', spec);
    }
    return state;
  };

  it('une puce par statut avec son nom du lexique et sa couleur (bonus en vert, malus en alerte)', () => {
    const chips = getSheet(getPlayerView(withStatuses(), 1), { kind: 'unit', unitId: 'u1' })!.status ?? [];
    const named = Object.fromEntries(chips.map((c) => [c.text, c.kind]));
    expect(named['Épuisé']).toBe('warn');
    expect(named['ATK +2']).toBe('boost');
    expect(named['portée −1']).toBe('warn');
    expect(named['Récupération 2']).toBe('boost');
  });

  it('pastilles : une par type (par stat pour les statuts de stat), cumulées', () => {
    const state = withStatuses();
    const groups = groupStatuses(state.units.u1!.statuses);
    expect(groups.map((g) => [g.key, g.total])).toEqual([
      ['epuise', 0],
      ['stat:atk', 3],
      ['stat:range', -1],
      ['recuperation', 2],
    ]);
    expect(statusPills(state.units.u1!.statuses).map((p) => [p.kind, p.text])).toEqual([
      ['epuise', null],
      ['stat', '+3'],
      ['stat', '−1'],
      ['recuperation', '2'],
    ]);
  });

  it('raison d’indisponibilité : Épuisé', () => {
    expect(reasonStatus({ kind: 'exhausted' }, 'déjà utilisé').text).toMatch(/Épuisé/);
  });
});
