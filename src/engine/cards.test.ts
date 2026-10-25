import { describe, expect, it } from 'vitest';
import { CARDS, COMMON_CARDS, TEST_GRIMOIRE, getCard } from './cards';
import type { CardId } from './types';

describe('cartes (SPEC.md §6)', () => {
  it('chaque carte est enregistrée sous son propre id', () => {
    for (const [id, card] of Object.entries(CARDS)) expect(card.id).toBe(id);
  });

  it('le grimoire de test contient 25 cartes : 16 monstres, 4 sorts, 5 terrains (cartes communes comprises)', () => {
    const kinds = TEST_GRIMOIRE.map((id) => getCard(id).kind);
    expect(TEST_GRIMOIRE).toHaveLength(25);
    expect(kinds.filter((k) => k === 'monster')).toHaveLength(16);
    expect(kinds.filter((k) => k === 'spell')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'terrain')).toHaveLength(5);
  });

  it('cartes communes (§6 ter) : Invocateur, Téléporteur, Terrain drainant, Terrain piégé, Zone d’invocation', () => {
    expect(COMMON_CARDS).toEqual(['invocateur', 'teleporteur', 'terrain-drainant', 'terrain-piege', 'zone-invocation']);
    expect(CARDS.invocateur).toMatchObject({ cost: 4, atk: 1, hp: 3, mobility: 3, range: 2 });
    expect(CARDS.invocateur).toMatchObject({ activated: { manaCost: 1, targeting: { type: 'emptyAdjacentCell' }, effects: [{ type: 'summon' }] } });
    expect(CARDS.teleporteur).toMatchObject({ cost: 4, atk: 1, hp: 3, mobility: 3, range: 2 });
    expect(CARDS.teleporteur).toMatchObject({ activated: { manaCost: 1, targeting: { type: 'monster', side: 'ally' }, effects: [{ type: 'teleport' }] } });
    expect(CARDS['terrain-drainant']).toMatchObject({ cost: 1, hp: 4, passage: { zone: 'adjacent', effects: [{ type: 'damage', amount: 1 }] } });
    expect(CARDS['terrain-piege']).toMatchObject({
      cost: 1,
      hp: 4,
      passage: { zone: 'adjacent', effects: [{ type: 'status', kind: 'slow', amount: 1, turns: 0 }] },
    });
    expect(CARDS['zone-invocation']).toMatchObject({ cost: 1, hp: 4, summonPoint: true, passage: null });
  });

  it('Éclaireur, Milicien et Archer sont en 2 exemplaires, les autres cartes en 1', () => {
    const count = (id: CardId) => TEST_GRIMOIRE.filter((c) => c === id).length;
    const ids = [...new Set(TEST_GRIMOIRE)];
    expect(ids).toHaveLength(22);
    for (const id of ids) {
      const expected = ['eclaireur', 'milicien', 'archer'].includes(id) ? 2 : 1;
      expect(count(id), id).toBe(expected);
    }
  });

  it('aucun sort n’utilise une portée mesurée depuis un monstre source', () => {
    for (const card of Object.values(CARDS)) {
      // Un sort n'a pas de monstre source : ni zone, ni case autour de lui, ni portée relative, ni recul vers l'avant.
      if (card.kind !== 'spell') continue;
      const { targeting, effects } = card.ability;
      expect(['monster', 'allies'], card.id).toContain(targeting.type);
      if (targeting.type === 'monster') expect(['adjacent', 'line'], card.id).not.toContain(targeting.reach.type);
      for (const effect of effects) {
        expect(['placeTrap', 'evolve'], card.id).not.toContain(effect.type);
        if (effect.type === 'push') expect(effect.direction, card.id).toBe('chosen');
      }
    }
  });
});
