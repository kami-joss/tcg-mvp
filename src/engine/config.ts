// Constantes de jeu ajustables (SPEC.md §4.10).

/** VP à atteindre pour gagner immédiatement. */
export const VICTORY_VP = 20;

/** Mana gagné par le joueur actif à chaque début de tour, avant les mana zones. */
export const BASE_MANA_PER_TURN = 3;

/** Mana supplémentaire au tout premier tour de J2 uniquement. */
export const PLAYER2_FIRST_TURN_BONUS_MANA = 1;

/** Mana et VP rapportés au début du tour par chaque mana zone contrôlée (SPEC.md §4.2). */
export const MANA_PER_CONTROLLED_ZONE = 1;
export const VP_PER_CONTROLLED_ZONE = 1;

/** VP rapportés par la destruction d'un monstre ennemi (SPEC.md §4.7). */
export const VP_PER_MONSTER_DESTROYED = 1;

// Les valeurs des mots-clés (Prime 1, Givre 1, Assassin ×3…) sont portées par chaque carte (SPEC.md §5.6, §5.7).

/** Exemplaires d'une même carte dans un deck, au plus (§6 bis). */
export const MAX_COPIES_PER_DECK = 3;
