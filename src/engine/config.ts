// Constantes de jeu ajustables (SPEC.md §4.10).

/** VP à atteindre pour gagner immédiatement. */
/** VP pour gagner, par défaut ; la partie peut en demander d'autres (`GameState.victoryVp`, choisis à l'accueil). */
export const VICTORY_VP = 30;

/**
 * Mana de base du premier tour de chaque joueur (SPEC.md §4.2), puis `MANA_GROWTH_PER_TURN` de plus à chacun de ses tours,
 * jusqu'à la génération max de la partie ; le mana des mana zones s'ajoute par-dessus.
 */
export const BASE_MANA_FIRST_TURN = 3;
export const MANA_GROWTH_PER_TURN = 1;

/**
 * Réglages du mana par défaut, dans les deux économies (accueil, SPEC.md §4.2, §10, validés le 2026-11-08) : génération
 * max 5 (plafond du mana de base) et limite 10 (le mana qu'un joueur peut avoir au total, à tout moment).
 */
export const DEFAULT_MANA_RULES = { baseCap: 5, limit: 10 } as const;

/** Requiem : meurt au début de son deuxième tour après affectation (SPEC.md §5 bis), sans paramètre. */
export const REQUIEM_TURNS = 2;

/** Rayon de révélation d'un camouflage (carré de 2) et d'un état invisible (carré de 1), SPEC.md §5 bis. */
export const CAMOUFLAGE_RADIUS = 2;
export const INVISIBLE_RADIUS = 1;

/**
 * VP rapportés au début du tour par chaque mana zone contrôlée, et mana rapporté par celle où l'on a un terrain : un monstre
 * seul ne génère pas de mana (SPEC.md §4.2).
 */
export const MANA_PER_CONTROLLED_ZONE = 1;
export const VP_PER_CONTROLLED_ZONE = 1;

/** VP rapportés par la destruction d'un monstre ennemi (SPEC.md §4.7). */
export const VP_PER_MONSTER_DESTROYED = 1;

// Les valeurs des mots-clés (Prime 1, Entrave 1, Attaque par surprise ×3…) sont portées par chaque carte (SPEC.md §5.6, §5.7).

/**
 * Minuteur de tour (option de l'accueil, SPEC.md §4.2) : secondes de réflexion d'un joueur par tour ; les actions et leurs
 * animations ne comptent pas. Au-delà, son tour finit. Le moteur ne connaît pas le temps : c'est la session qui minute.
 */
export const TURN_TIMER_SECONDS = 180;

/** Exemplaires d'une même carte dans un deck, au plus (§6 bis). */
export const MAX_COPIES_PER_DECK = 3;

/** Cartes d'un deck (§6 bis, 2026-11-10) ; le deck Classique, deck d'essai, en garde 25. */
export const DECK_SIZE = 30;
export const CLASSIC_DECK_SIZE = 25;
