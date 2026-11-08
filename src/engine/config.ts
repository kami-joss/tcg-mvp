// Constantes de jeu ajustables (SPEC.md §4.10).

/** VP à atteindre pour gagner immédiatement. */
export const VICTORY_VP = 30;

/**
 * Mana de base du premier tour de chaque joueur (SPEC.md §4.2), puis `MANA_GROWTH_PER_TURN` de plus à chacun de ses tours,
 * jusqu'à `BASE_MANA_CAP` ; le mana non dépensé est perdu en fin de tour. Au-delà, seuls les terrains donnent du mana
 * de plus (mana de zone, §4.2).
 */
export const BASE_MANA_FIRST_TURN = 3;
export const MANA_GROWTH_PER_TURN = 1;
export const BASE_MANA_CAP = 10;

/**
 * VP rapportés au début du tour par chaque mana zone contrôlée, et mana rapporté par celle où l'on a un terrain : un monstre
 * seul ne génère pas de mana (SPEC.md §4.2).
 */
export const MANA_PER_CONTROLLED_ZONE = 1;
export const VP_PER_CONTROLLED_ZONE = 1;

/** VP rapportés par la destruction d'un monstre ennemi (SPEC.md §4.7). */
export const VP_PER_MONSTER_DESTROYED = 1;

// Les valeurs des mots-clés (Prime 1, Givre 1, Attaque par surprise ×3…) sont portées par chaque carte (SPEC.md §5.6, §5.7).

/** Exemplaires d'une même carte dans un deck, au plus (§6 bis). */
export const MAX_COPIES_PER_DECK = 3;
