import { describe, expect, it } from 'vitest';
import {
  BASE_MANA_PER_TURN,
  MANA_PER_CONTROLLED_ZONE,
  PLAYER2_FIRST_TURN_BONUS_MANA,
  VICTORY_VP,
  VP_PER_CONTROLLED_ZONE,
  VP_PER_MONSTER_DESTROYED,
} from './config';

// Les autres tests utilisent ces constantes : ils restent valables si on les ajuste.
// Celui-ci fige les valeurs du MVP et sera à mettre à jour en cas d'équilibrage.
describe('constantes de jeu (SPEC.md §4.2, §4.7, §4.10)', () => {
  it('ont les valeurs de la spécification', () => {
    expect(VICTORY_VP).toBe(30);
    expect(BASE_MANA_PER_TURN).toBe(3);
    expect(PLAYER2_FIRST_TURN_BONUS_MANA).toBe(1);
    expect(MANA_PER_CONTROLLED_ZONE).toBe(1);
    expect(VP_PER_CONTROLLED_ZONE).toBe(1);
    expect(VP_PER_MONSTER_DESTROYED).toBe(1);
  });
});
