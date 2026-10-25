import { describe, expect, it } from 'vitest';
import { at, gameWith } from './test-utils';
import { getControlledZones, getZoneController } from './zones';

const FORGE = at(5, 4);

describe('contrôle des mana zones (SPEC.md §4.4)', () => {
  it('une zone occupée par un monstre est contrôlée par le propriétaire du monstre', () => {
    expect(getZoneController(gameWith([{ monster: 'golem', owner: 2, at: FORGE }]), FORGE)).toBe(2);
  });

  it('sans monstre, une zone occupée par un terrain est contrôlée par le propriétaire du terrain', () => {
    expect(getZoneController(gameWith([{ terrain: 'bastion', owner: 1, at: FORGE }]), FORGE)).toBe(1);
  });

  it('un monstre sur son propre terrain : la zone est contrôlée par ce joueur', () => {
    const state = gameWith([
      { monster: 'golem', owner: 1, at: FORGE },
      { terrain: 'bastion', owner: 1, at: FORGE },
    ]);
    expect(getZoneController(state, FORGE)).toBe(1);
  });

  it('le monstre passe avant le terrain', () => {
    // Impossible en jeu aujourd'hui (un ennemi ne peut pas entrer sur un terrain) : ce test fige l'ordre de la règle.
    const state = gameWith([
      { terrain: 'bastion', owner: 1, at: FORGE },
      { monster: 'golem', owner: 2, at: FORGE },
    ]);
    expect(getZoneController(state, FORGE)).toBe(2);
  });

  it('sinon, la zone est neutre', () => {
    expect(getZoneController(gameWith([]), FORGE)).toBeNull();
  });

  it('une case qui n’est pas une mana zone n’est contrôlée par personne', () => {
    expect(getZoneController(gameWith([{ monster: 'golem', owner: 1, at: at(8, 1) }]), at(8, 1))).toBeNull();
  });

  it('getControlledZones liste les zones contrôlées par chaque joueur', () => {
    const state = gameWith([
      { monster: 'golem', owner: 1, at: FORGE },
      { terrain: 'bastion', owner: 1, at: at(5, 1) }, // Scierie
      { monster: 'milicien', owner: 2, at: at(5, 7) }, // Mine
      { monster: 'archer', owner: 2, at: at(8, 1) }, // pas une mana zone
    ]);
    expect(getControlledZones(state, 1).map((z) => z.zone)).toEqual(['scierie', 'forge']);
    expect(getControlledZones(state, 2).map((z) => z.zone)).toEqual(['mine']);
  });
});
