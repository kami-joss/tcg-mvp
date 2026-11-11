import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { effectAvailability } from './availability';
import { getAttackTargets } from './combat';
import { getMoveDestinations } from './movement';
import { isHiddenFrom } from './stealth';
import { addStatus, isDisarmed, normalStatus } from './statuses';
import { at, gameWith } from './test-utils';
import { getAtk, getRange } from './units';
import { getPlayerView } from './view';
import type { GameState, MonsterUnit, StatusSpec } from './types';

// Norme des statuts (SPEC.md §5 bis, 2026-11-08) : Désarmé, Récupération, Absorbation, Absorbé (lié à l'absorbeur),
// bonus et malus de stat, Camouflage (plus de 2 cases) et Invisible (plus de 1 case), Requiem sans paramètre.

const endTurn = { type: 'endTurn' } as const;
const monster = (state: GameState, id: string) => state.units[id] as MonsterUnit;
const give = (state: GameState, id: string, spec: StatusSpec) => addStatus(state, id, spec);

describe('Désarmé : ne peut pas attaquer', () => {
  it('plus d’attaque, mais le déplacement et les effets restent possibles ; il disparaît à la fin de sa durée', () => {
    let state = gameWith([{ monster: 'archer', owner: 1, at: at(9, 1) }, { monster: 'golem', owner: 2, at: at(9, 2) }]);
    expect(getAttackTargets(state, monster(state, 'u1'))).toHaveLength(1);
    state = give(state, 'u1', { kind: 'desarme', turns: 1 });
    expect(isDisarmed(monster(state, 'u1'))).toBe(true);
    expect(getAttackTargets(state, monster(state, 'u1'))).toEqual([]);
    expect(getLegalActions(state).some((a) => a.type === 'attack')).toBe(false);
    expect(getLegalActions(state).some((a) => a.type === 'move' && a.unitId === 'u1')).toBe(true);
    expect(effectAvailability(getPlayerView(state, 1), 'u1')).toBeNull(); // pas d'effet sur l'Archer
    // 1 tour : encore désarmé à son prochain tour, libre ensuite.
    const next = applyAction(applyAction(state, endTurn), endTurn);
    expect(isDisarmed(monster(next, 'u1'))).toBe(true);
    const later = applyAction(applyAction(next, endTurn), endTurn);
    expect(isDisarmed(monster(later, 'u1'))).toBe(false);
  });
});

describe('Récupération et Absorbation : des PV au début de son tour', () => {
  it('Récupération X : +X PV au début de son tour, sans dépasser les PV max', () => {
    let state = gameWith([{ monster: 'golem', owner: 1, at: at(9, 1), hp: 3 }], { activePlayer: 2 });
    state = give(state, 'u1', { kind: 'recuperation', amount: 2, turns: 2 });
    expect(monster(applyAction(state, endTurn), 'u1').hp).toBe(5);
    const again = applyAction(applyAction(applyAction(applyAction(state, endTurn), endTurn), endTurn), endTurn);
    expect(monster(again, 'u1').hp).toBe(7); // 5, puis 7 (plafonné : maxHp 7)
  });

  it('Absorbation : 1 PV par instance, elles se cumulent', () => {
    let state = gameWith([{ monster: 'golem', owner: 1, at: at(9, 1), hp: 2 }], { activePlayer: 2 });
    state = give(give(state, 'u1', { kind: 'absorbation', amount: 1, turns: 1 }), 'u1', { kind: 'absorbation', amount: 1, turns: 1 });
    expect(monster(applyAction(state, endTurn), 'u1').hp).toBe(4);
  });
});

describe('Absorbé : lié à l’absorbeur', () => {
  const scene = (absorberHp = 3, targetHp = 5) =>
    gameWith(
      [
        { monster: 'golem', owner: 1, at: at(9, 1), hp: absorberHp },
        { monster: 'golem', owner: 2, at: at(1, 1), hp: targetHp },
      ],
      { activePlayer: 2 },
    );

  it('au début du tour adverse, il perd N PV et l’absorbeur gagne ce qu’il a perdu', () => {
    const state = give(scene(), 'u2', { kind: 'absorbe', amount: 1, turns: 2, by: 'u1' });
    const after = applyAction(state, endTurn); // début du tour de J1 (l'adversaire du porteur)
    expect(monster(after, 'u2').hp).toBe(4);
    expect(monster(after, 'u1').hp).toBe(4);
    // Pas au début de son propre tour.
    const own = applyAction(after, endTurn);
    expect(monster(own, 'u2').hp).toBe(4);
  });

  it('plusieurs Absorbé se cumulent ; l’absorbeur ne dépasse pas ses PV max ; une destruction rapporte 1 VP', () => {
    let state = scene(7, 1);
    state = give(state, 'u2', { kind: 'absorbe', amount: 1, turns: 2, by: 'u1' });
    const after = applyAction(state, endTurn);
    expect(after.units.u2).toBeUndefined();
    expect(monster(after, 'u1').hp).toBe(7); // déjà au maximum
    expect(after.players[1].vp).toBeGreaterThanOrEqual(1);
    const twice = give(give(scene(), 'u2', { kind: 'absorbe', amount: 1, turns: 2, by: 'u1' }), 'u2', { kind: 'absorbe', amount: 1, turns: 2, by: 'u1' });
    expect(monster(applyAction(twice, endTurn), 'u2').hp).toBe(3);
  });

  it('absorbeur disparu : le porteur perd quand même ses PV, personne ne les gagne', () => {
    const { u1: _gone, ...units } = scene().units;
    const state = give({ ...scene(), units }, 'u2', { kind: 'absorbe', amount: 1, turns: 2, by: 'u1' });
    expect(monster(applyAction(state, endTurn), 'u2').hp).toBe(4);
  });
});

describe('<stat> +X et <stat> −X', () => {
  it('ATK et portée, signés, pendant la durée', () => {
    let state = gameWith([{ monster: 'archer', owner: 1, at: at(9, 1) }]);
    state = give(give(state, 'u1', { kind: 'stat', stat: 'atk', amount: 2, turns: 1 }), 'u1', { kind: 'stat', stat: 'range', amount: -1, turns: 1 });
    expect(getAtk(state, monster(state, 'u1'))).toBe(4); // 2 + 2
    expect(getRange(state, monster(state, 'u1'))).toBe(1); // 2 − 1
    const malus = give(gameWith([{ monster: 'archer', owner: 1, at: at(9, 1) }]), 'u1', { kind: 'stat', stat: 'atk', amount: -5, turns: 1 });
    expect(getAtk(malus, monster(malus, 'u1'))).toBe(0); // jamais négatif
    const later = applyAction(applyAction(applyAction(applyAction(state, endTurn), endTurn), endTurn), endTurn);
    expect(getAtk(later, monster(later, 'u1'))).toBe(2);
  });

  it('mobilité +X : compte aussitôt pendant son tour, puis à chaque début de tour pendant la durée', () => {
    let state = gameWith([{ monster: 'chevalier', owner: 1, at: at(9, 1) }]); // mobilité 3
    state = give(state, 'u1', { kind: 'stat', stat: 'mobility', amount: 2, turns: 1 });
    expect(monster(state, 'u1').mobilityLeft).toBe(5);
    const next = applyAction(applyAction(state, endTurn), endTurn);
    expect(monster(next, 'u1').mobilityLeft).toBe(5); // encore actif à son prochain tour
  });

  it('un malus de mobilité est un slow : « mobilité −X » pose slow X (2026-11-11)', () => {
    expect(normalStatus({ kind: 'stat', stat: 'mobility', amount: -2, turns: 1 })).toEqual({ kind: 'slow', amount: 2, turns: 1 });
    // Les autres stats et le bonus de mobilité ne changent pas.
    const atk = { kind: 'stat', stat: 'atk', amount: -1, turns: 1 } as const;
    expect(normalStatus(atk)).toBe(atk);
    const boost = { kind: 'stat', stat: 'mobility', amount: 1, turns: 1 } as const;
    expect(normalStatus(boost)).toBe(boost);
    // Posé sur un monstre : c'est un slow, avec ses effets (mobilité en moins aussitôt, retirée par Cure comme un malus).
    const slowed = give(gameWith([{ monster: 'chevalier', owner: 1, at: at(9, 1) }]), 'u1', { kind: 'stat', stat: 'mobility', amount: -1, turns: 1 });
    expect(monster(slowed, 'u1').statuses).toEqual([expect.objectContaining({ kind: 'slow', amount: 1 })]);
    expect(monster(slowed, 'u1')).toMatchObject({ mobilityLeft: 2, froze: 1 });
    const next = applyAction(applyAction(slowed, endTurn), endTurn);
    expect(monster(next, 'u1').mobilityLeft).toBe(2); // encore là à son prochain tour
  });

  it('PV max +X : PV et PV max montent ; à la fin les PV max reviennent et les PV sont plafonnés, sans tuer', () => {
    let state = gameWith([{ monster: 'milicien', owner: 1, at: at(9, 1) }]); // 3 PV
    state = give(state, 'u1', { kind: 'stat', stat: 'maxHp', amount: 3, turns: 0 });
    expect(monster(state, 'u1')).toMatchObject({ hp: 6, maxHp: 6 });
    const after = applyAction(applyAction(state, endTurn), endTurn); // jusqu'à son prochain tour : fini
    expect(monster(after, 'u1')).toMatchObject({ hp: 3, maxHp: 3 });
    // −X : sans descendre sous 1 PV ; à la fin, les PV max reviennent mais les PV perdus le restent.
    const malus = give(gameWith([{ monster: 'milicien', owner: 1, at: at(9, 1) }]), 'u1', { kind: 'stat', stat: 'maxHp', amount: -5, turns: 0 });
    expect(monster(malus, 'u1')).toMatchObject({ hp: 1, maxHp: 1 });
    const healed = applyAction(applyAction(malus, endTurn), endTurn);
    expect(monster(healed, 'u1')).toMatchObject({ hp: 1, maxHp: 3 });
  });
});

describe('Camouflage (plus de 2 cases) et Invisible (plus de 1 case)', () => {
  const scene = (kind: 'camouflage' | 'invisible', enemyAt: ReturnType<typeof at>) =>
    give(
      gameWith(
        [
          { monster: 'milicien', owner: 1, at: at(9, 1) },
          { monster: 'golem', owner: 2, at: enemyAt },
        ],
        { activePlayer: 2 },
      ),
      'u1',
      { kind, turns: 3 },
    );

  it('Camouflage : un ennemi à 2 cases le révèle, à 3 non', () => {
    const near = scene('camouflage', at(9, 3));
    expect(isHiddenFrom(near, monster(near, 'u1'), 2)).toBe(false);
    const far = scene('camouflage', at(9, 4));
    expect(isHiddenFrom(far, monster(far, 'u1'), 2)).toBe(true);
  });

  it('Invisible : un ennemi à 1 case le révèle, à 2 cases non', () => {
    const near = scene('invisible', at(9, 2));
    expect(isHiddenFrom(near, monster(near, 'u1'), 2)).toBe(false);
    const far = scene('invisible', at(9, 3));
    expect(isHiddenFrom(far, monster(far, 'u1'), 2)).toBe(true);
  });

  it('les deux ensemble : la plus grande portée compte, sans somme', () => {
    const both = give(scene('invisible', at(9, 3)), 'u1', { kind: 'camouflage', turns: 3 });
    expect(isHiddenFrom(both, monster(both, 'u1'), 2)).toBe(false); // le Camouflage (2) le révèle à 2 cases
  });
});

describe('Requiem : sans paramètre, deuxième tour après affectation', () => {
  it('le monstre joue son prochain tour, puis meurt au début du suivant, sans VP', () => {
    let state = gameWith([{ monster: 'golem', owner: 2, at: at(1, 1) }]);
    state = give(state, 'u1', { kind: 'requiem' });
    state = applyAction(state, endTurn); // tour 2 (J2) : son prochain tour, il vit
    expect(state.units.u1).toBeDefined();
    state = applyAction(applyAction(state, endTurn), endTurn); // tour 4 (J2) : le deuxième, il meurt
    expect(state.units.u1).toBeUndefined();
    expect(state.players[1].vp).toBe(0);
  });
});

describe('Vol : peut survoler les cases X', () => {
  const reach = (state: GameState) => getMoveDestinations(state, monster(state, 'u1')).map((d) => `${d.pos.row},${d.pos.col}`);

  it('pendant la durée, comme le mot-clé Vol : les X de la ligne 6 et 7 se survolent, puis il redevient terrestre', () => {
    let state = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 4) }]); // mobilité 3 ; (7, 4) et (6, 4) sont des X
    expect(reach(state)).not.toContain('5,4');
    state = give(state, 'u1', { kind: 'vol', turns: 1 });
    expect(reach(state)).toContain('5,4');
    const next = applyAction(applyAction(state, endTurn), endTurn); // son prochain tour : encore en vol
    expect(reach(next)).toContain('5,4');
    const later = applyAction(applyAction(next, endTurn), endTurn);
    expect(reach(later)).not.toContain('5,4');
  });

  it('un monstre qui a le mot-clé Vol de sa carte vole sans statut', () => {
    const state = gameWith([{ monster: 'dragonnet', owner: 1, at: at(8, 4), mobilityLeft: 3 }]);
    expect(reach(state)).toContain('5,4');
  });
});
