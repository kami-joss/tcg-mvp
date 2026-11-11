import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { CARDS, DECKS, getTerrainCard } from './cards';
import { at, gameWith } from './test-utils';
import { getHiddenUnitIds, isHiddenFrom } from './stealth';
import { auraStealth } from './units';
import { getPlayerView } from './view';
import type { MonsterUnit } from './types';

// Terrain de jeu - Maîtres des pièges (SPEC.md §6 bis, §10, 2026-11-08) : Camouflage 1 pour ses maîtres des pièges alliés,
// sur sa case et dans son carré de 1, tant qu'ils y sont ; avec d'autres camouflages, la plus grande valeur.

const monster = (state: ReturnType<typeof gameWith>, id: string) => state.units[id] as MonsterUnit;

describe('Terrain de jeu : carte et deck', () => {
  it('3 mana, 5 PV, aura camouflage 1 sur ses maîtres des pièges, sa case et carré de 1', () => {
    expect(getTerrainCard(CARDS, 'terrain-de-jeu')).toMatchObject({
      name: 'Terrain de jeu - Maîtres des pièges',
      cost: 3,
      hp: 5,
      aura: { zone: 'cellAndSquare', archetype: 'piege', stealth: 'invisible' },
    });
  });

  it('le deck fait 30 cartes avec 3 Terrains de jeu, sans Autel de mana, Terrain drainant ni Invocateur', () => {
    const deck = DECKS.find((d) => d.id === 'pieges')!.cards;
    expect(deck).toHaveLength(30);
    const count = (id: string) => deck.filter((c) => c === id).length;
    expect(count('terrain-de-jeu')).toBe(3);
    for (const id of ['autel-de-mana', 'terrain-drainant', 'invocateur']) expect(count(id), id).toBe(0);
  });
});

describe('Terrain de jeu : camouflage 1 tant qu’ils sont dans la zone', () => {
  const scene = (extra: Parameters<typeof gameWith>[0] = []) =>
    gameWith(
      [
        { terrain: 'terrain-de-jeu', owner: 1, at: at(8, 4) },
        { monster: 'poseur-de-bombe', owner: 1, at: at(8, 4) }, // sur le terrain
        { monster: 'clown-assassin', owner: 1, at: at(8, 5) }, // dans le carré de 1
        { monster: 'poseur-de-piege', owner: 1, at: at(8, 7) }, // hors zone
        { monster: 'golem', owner: 1, at: at(9, 4) }, // pas un maître des pièges
        ...extra,
      ],
      { activePlayer: 2 },
    );

  it('cachés pour l’adversaire : sur le terrain et dans son carré de 1, pas hors zone ni un autre monstre', () => {
    const state = scene();
    expect(auraStealth(state, monster(state, 'u2'))).toBe(1);
    expect(auraStealth(state, monster(state, 'u3'))).toBe(1);
    expect(auraStealth(state, monster(state, 'u4'))).toBe(0);
    expect(getHiddenUnitIds(state, 2).sort()).toEqual(['u2', 'u3']);
    expect(getHiddenUnitIds(state, 1)).toEqual([]); // son propre camp les voit
  });

  it('révélés par un ennemi à 1 case (carré de 1), pas à 2 cases', () => {
    const near = scene([{ monster: 'milicien', owner: 2, at: at(9, 6) }]); // à 1 case de u3 (8,5)
    expect(isHiddenFrom(near, monster(near, 'u3'), 2)).toBe(false);
    expect(isHiddenFrom(near, monster(near, 'u2'), 2)).toBe(true); // (8,4) est à 2 cases de (9,6)
    const far = scene([{ monster: 'milicien', owner: 2, at: at(9, 7) }]);
    expect(isHiddenFrom(far, monster(far, 'u3'), 2)).toBe(true);
  });

  it('un monstre qui sort de la zone redevient visible aussitôt ; le terrain détruit aussi', () => {
    const state = scene();
    const out = applyAction(
      gameWith(
        [
          { terrain: 'terrain-de-jeu', owner: 1, at: at(8, 4) },
          { monster: 'clown-assassin', owner: 1, at: at(8, 5) },
        ],
        { activePlayer: 1 },
      ),
      { type: 'move', unitId: 'u2', to: at(8, 7), path: [at(8, 6), at(8, 7)] },
    );
    expect(getHiddenUnitIds(out, 2)).toEqual([]);
    const withoutTerrain = { ...state, units: Object.fromEntries(Object.entries(state.units).filter(([id]) => id !== 'u1')) };
    expect(getHiddenUnitIds(withoutTerrain, 2)).toEqual([]);
  });

  it('avec le Camouflage 2 du Farceur, la plus grande valeur compte (pas la somme) ; hors zone il garde le sien', () => {
    const state = gameWith(
      [
        { terrain: 'terrain-de-jeu', owner: 1, at: at(8, 4) },
        { monster: 'farceur', owner: 1, at: at(8, 5) },
        { monster: 'milicien', owner: 2, at: at(9, 7) }, // à 2 cases du Farceur : révélé par son Camouflage 2 aussi
      ],
      { activePlayer: 2 },
    );
    expect(isHiddenFrom(state, monster(state, 'u2'), 2)).toBe(false);
    const apart = gameWith(
      [
        { terrain: 'terrain-de-jeu', owner: 1, at: at(8, 4) },
        { monster: 'farceur', owner: 1, at: at(8, 5) },
        { monster: 'milicien', owner: 2, at: at(9, 8) }, // à 3 cases : caché
      ],
      { activePlayer: 2 },
    );
    expect(isHiddenFrom(apart, monster(apart, 'u2'), 2)).toBe(true);
  });

  it('seulement ses propres monstres : le terrain d’un adversaire ne cache pas les miens', () => {
    const state = gameWith(
      [
        { terrain: 'terrain-de-jeu', owner: 2, at: at(8, 4) },
        { monster: 'clown-assassin', owner: 1, at: at(8, 5) },
      ],
      { activePlayer: 2 },
    );
    expect(getHiddenUnitIds(state, 2)).toEqual([]);
  });

  it('la vue de l’adversaire ne contient pas les monstres cachés, la sienne si', () => {
    const state = scene();
    expect(Object.keys(getPlayerView(state, 2).units)).not.toContain('u2');
    expect(Object.keys(getPlayerView(state, 1).units)).toContain('u2');
  });
});
