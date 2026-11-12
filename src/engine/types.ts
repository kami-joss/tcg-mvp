// Types du moteur de règles (SPEC.md §2). Aucune dépendance à l'UI.

export type PlayerId = 1 | 2;

/** Coordonnées (ligne, colonne), (0, 0) en haut à gauche (SPEC.md §3). */
export interface Position {
  readonly row: number;
  readonly col: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

// ---------------------------------------------------------------------------
// Plateau (SPEC.md §3)
// ---------------------------------------------------------------------------

export type ManaZoneId = 'ecurie' | 'ferme' | 'forge' | 'scierie' | 'mine';

/**
 * Mode de jeu, choisi avec la carte : `normal`, mana zones d'une case (§4.4) ; `contestation`, zones de 9 cases qu'on
 * tient seul ou qui sont contestées (§4.4 bis).
 */
export type GameMode = 'normal' | 'contestation';

/**
 * Économie du mana, choisie à l'accueil (SPEC.md §4.2, §10, 2026-11-08) : `classic`, la règle d'origine (le mana non
 * dépensé est perdu) ; `reserve`, le mana se garde d'un tour à l'autre. Mana de base et limite : `ManaRules`.
 */
export type Economy = 'classic' | 'reserve';

/**
 * Réglages du mana d'une partie, choisis à l'accueil dans les deux économies (SPEC.md §4.2, §10, validés le 2026-11-08) :
 * `baseCap`, la génération max (le mana de base monte de 3 à cette valeur, le mana des mana zones s'ajoute par-dessus) ;
 * `limit`, le mana qu'un joueur peut avoir au total, à tout moment : tout gain s'y arrête, le surplus est perdu.
 */
export interface ManaRules {
  readonly baseCap: number;
  readonly limit: number;
}

export type Cell =
  /** `.` : la case n'existe pas. */
  | { readonly kind: 'offBoard' }
  /**
   * `X` : case infranchissable. `height` (15 × 15, §10) : `high`, comme une falaise de la Mine (rien ne la traverse, ni
   * `vol`, ni aucun tir) ; `low`, comme une falaise de la Scierie (`vol` la survole, les tirs de portée 2+ passent
   * par-dessus). Sans `height`, case X ordinaire : `vol` la survole, elle coupe tous les tirs.
   */
  | { readonly kind: 'blocked'; readonly height?: 'high' | 'low' }
  /** Case jouable : plaine, éventuellement zone d'invocation ou mana zone. */
  | {
      readonly kind: 'plain';
      readonly summonZoneOf: PlayerId | null;
      readonly manaZone: ManaZoneId | null;
    };

/** Falaise : bord infranchissable à pied entre deux cases voisines (SPEC.md §10). */
export interface Cliff {
  readonly between: readonly [Position, Position];
  /** Les tirs des monstres de portée 2 ou plus passent par-dessus (falaises de la Scierie). */
  readonly rangedShotsPass: boolean;
  /** Un monstre `vol` la survole (Scierie) ; la Mine, zone fermée, ne se survole pas. */
  readonly flyingPasses: boolean;
}

/**
 * Enclave d'une mana zone, pour le rendu seulement : creux de la Scierie (`hollow`, talus) ou carrière de la Mine
 * (`quarry`, remparts). Rectangle de cases (lignes `r0` à `r1`, colonnes `c0` à `c1`) ; le côté « intérieur » d'une
 * falaise est la case la plus proche de `zone`.
 */
export interface Enclave {
  readonly type: 'hollow' | 'quarry';
  readonly r0: number;
  readonly r1: number;
  readonly c0: number;
  readonly c1: number;
  readonly zone: Position;
}

/** Décor d'un plateau (rendu seulement, les règles n'en tiennent pas compte) : il permet la vue isométrique. */
export interface BoardScenery {
  /** Cases bloquées dessinées en eau : règles d'une case bloquée. */
  readonly water: readonly Position[];
  readonly enclaves: readonly Enclave[];
}

export interface Board {
  readonly name: string;
  readonly rows: number;
  readonly cols: number;
  /** `cells[row][col]` */
  readonly cells: readonly (readonly Cell[])[];
  readonly cliffs: readonly Cliff[];
  /** Décor de la vue isométrique ; `null` : pas de vue isométrique pour ce plateau. */
  readonly scenery: BoardScenery | null;
  /** Le mode contestation se joue sur ce plateau (§4.4 bis : 13 × 13 et 15 × 15). */
  readonly contestation: boolean;
}

// ---------------------------------------------------------------------------
// Cartes (SPEC.md §5, §6) — décrites en données dans cards.ts
// ---------------------------------------------------------------------------

export type CardId =
  // Monstres
  | 'eclaireur'
  | 'milicien'
  | 'archer'
  | 'chaman'
  | 'gardien'
  | 'chevalier'
  | 'chasseur-de-primes'
  | 'porte-etendard'
  | 'mage'
  | 'golem'
  | 'dragonnet'
  // Sorts
  | 'boule-de-feu'
  | 'charge'
  | 'bourrasque'
  | 'benediction'
  // Terrains
  | 'autel-de-mana'
  | 'bastion'
  // Deck archer
  | 'archer-leger'
  | 'archer-lourd'
  | 'archer-de-glace'
  | 'archer-du-feu'
  | 'trebuchet'
  | 'monstre-de-test'
  | 'fleche-divine'
  | 'nid-de-dragons'
  | 'hurlements'
  // Deck Archers impériaux
  | 'ecuyer-archers'
  | 'archer-imperial'
  | 'arbaletrier-imperial'
  | 'trebuchet-archers'
  | 'camps-de-tir'
  // Deck piège
  | 'poseur-de-piege'
  | 'farceur'
  | 'poseur-de-bombe'
  | 'clown-assassin'
  | 'penombre'
  // Deck dragon
  | 'jeune-dragon'
  | 'dragon-feu'
  | 'dragon-eau'
  | 'dragon-vent'
  | 'dragon-terre'
  | 'dragon-origine'
  // Cartes communes, un exemplaire dans chaque deck
  | 'invocateur'
  | 'teleporteur'
  | 'terrain-drainant'
  | 'terrain-piege'
  | 'zone-invocation'
  | 'terrain-de-chasse'
  | 'terrain-de-jeu'
  // Deck Bodybuilder
  | 'jeune-gomuscu'
  | 'jean-bon'
  | 'rudy'
  | 'tibo'
  | 'arnold'
  | 'ki-ne'
  | 'seringue'
  | 'salle-de-sport'
  // Deck Sorciers du feu
  | 'apprenti'
  | 'lutin-brasier'
  | 'archimage'
  | 'golem-de-lave'
  // Deck Explorateur du temps
  | 'apprenti-temps'
  | 'chronomancienne'
  | 'dragonnet-temps'
  | 'maitre-du-temps'
  | 'piege-temporel'
  | 'brulure-en-chaine'
  | 'fissure-temporelle'
  // Deck Vampire (la chauve-souris est une forme d'Emma, hors grimoire)
  | 'delta'
  | 'emma'
  | 'emma-chauve-souris'
  | 'vladimir'
  | 'zoldik'
  | 'appel-du-sang'
  | 'sacrifice-sanguinaire'
  // Deck Ingénieurs foudroyants (2026-11-12)
  | 'archi'
  | 'elek'
  | 'blitz'
  | 'joy'
  | 'champ-magnetique'
  | 'chaines-eclair'
  | 'onde-de-choc'
  // Balise (carte commune, 2026-11-12)
  | 'balise-de-vision'
  // Sorts génériques (cartes communes, 2026-11-10).
  | 'puissance'
  | 'soin'
  | 'flash'
  | 'fatigue'
  | 'carapace'
  | 'elixir-de-mana'
  | 'cure'
  | 'repli'
  | 'teleportation'
  | 'reanimation'
  | 'fortification';

/**
 * Famille de cartes (SPEC.md §5.1) : les bodybuilders, les archers (sauf le Trébuchet), les dragons élémentaires (Jeune
 * dragon compris), les maîtres des pièges (les 4 monstres du deck Maîtres des pièges), les sorciers du feu, les explorateurs du temps,
 * les vampires, les ingénieurs foudroyants.
 */
export type Archetype = 'bodybuilder' | 'archer' | 'dragon' | 'piege' | 'sorcier' | 'temps' | 'vampire' | 'ingenieur';

/**
 * Mots-clés (SPEC.md §5.6) et leurs paramètres : chaque carte porte ses propres valeurs (« Entrave 1 », « Attaque par surprise ×3 »).
 * Une quantité s'appelle `amount`, un multiplicateur `multiplier`, une durée de statut `turns` (§5.7).
 */
interface KeywordParams {
  /** Attaqué au contact et encore en vie : inflige son ATK à l'attaquant, une fois par tour. */
  readonly riposte: object;
  /** En se déplaçant, survole les cases X et les falaises, pas les ennemis. */
  readonly vol: object;
  /** Quand il détruit un monstre par son attaque : +`amount` VP. */
  readonly prime: { readonly amount: number };
  /** Quand il détruit un monstre au contact par son attaque : +`amount` VP (Archer léger). */
  readonly trophee: { readonly amount: number };
  /** Quand il détruit un monstre au contact par son attaque : +`amount` mana (Archer lourd). */
  readonly pillage: { readonly amount: number };
  /** La mana zone qu'il occupe rapporte +`amount` mana (Porte-étendard). */
  readonly etendard: { readonly amount: number };
  /** À l'attaque : slow `amount` pendant `turns` tours (Archer de glace). */
  readonly entrave: { readonly amount: number; readonly turns: number };
  /** À l'attaque : burn `amount` pendant `turns` tours (Archer du feu). */
  readonly brulure: { readonly amount: number; readonly turns: number };
  /** Dégâts ×`multiplier` contre un terrain (Trébuchet). */
  readonly siege: { readonly multiplier: number };
  /** Par derrière, contre un monstre : +`amount` ATK pour cette attaque (Farceur). */
  readonly sournois: { readonly amount: number };
  /** Par derrière, contre un monstre : dégâts ×`multiplier` (Clown assassin). */
  readonly assassin: { readonly multiplier: number };
  /** Camouflage : caché à l'adversaire tant qu'aucun monstre ni terrain adverse n'est dans un carré de 2 (§10), sans valeur. */
  readonly camouflage: object;
  /** À l'attaque : il récupère `amount` PV, après les dégâts et avant la riposte (Vampire, §10). */
  readonly soif: { readonly amount: number };
  /**
   * Statik N (Elek, §10) : à l'attaque d'un monstre, ses dégâts se propagent de proche en proche aux ennemis reliés à la
   * cible (chacun dans le carré de 1 du précédent), `amount` de moins par maillon, jamais moins de 1 ; dégâts d'effet.
   */
  readonly statik: { readonly amount: number };
}

export type Keyword = keyof KeywordParams;

/** Un mot-clé d'une carte, avec ses valeurs. */
export type KeywordSpec = { [K in Keyword]: { readonly keyword: K } & KeywordParams[K] }[Keyword];

/** Le mot-clé `K` avec ses valeurs. */
export type KeywordOf<K extends Keyword> = Extract<KeywordSpec, { readonly keyword: K }>;

/** Statuts (SPEC.md §5 bis). */
export type StatusKind =
  /** Plus aucune action : ni déplacement, ni attaque, ni effet, ni riposte. */
  | 'stun'
  /** Mobilité réduite de `amount`. */
  | 'slow'
  /** Ne peut plus bouger, mais peut attaquer et activer ses effets. */
  | 'immobilise'
  /** Perd `amount` PV au début de chaque tour affecté. */
  | 'burn'
  /** Meurt au début du deuxième tour de son camp après affectation, sans VP pour personne (sans paramètre). */
  | 'requiem'
  /** Invisible pour l'adversaire tant qu'aucun de ses monstres ni terrains n'est dans un carré de 2 (Farceur, Pénombre). */
  | 'camouflage'
  /** Comme camouflage, mais seulement à plus de 1 case : un carré de 1 le révèle (Terrain de jeu). */
  | 'invisible'
  /** La prochaine attaque (ou riposte) subie n'inflige que 1 PV (Tibo, TORTANK) ; elle consomme le statut. */
  | 'carapace'
  /** Ne peut plus activer ses effets actifs ; attaque, déplacement, mots-clés et passifs restent possibles (Dragonnet). */
  | 'silence'
  /** Désarmé : ne peut pas attaquer ; déplacement et effets restent possibles. */
  | 'desarme'
  /** Vol : peut survoler les cases X, comme le mot-clé Vol (§5.6) ; un bonus de durée. */
  | 'vol'
  /** Absorbé : perd `amount` PV au début du tour de l'adversaire de son porteur ; le monstre qui l'a posé (`by`) les gagne. */
  | 'absorbe'
  /** Absorbation : gagne `amount` PV au début de son tour, jusqu'à ses PV max (un par instance). */
  | 'absorbation'
  /** Récupération : gagne `amount` PV au début de son tour, jusqu'à ses PV max. */
  | 'recuperation'
  /**
   * Bonus ou malus de stat, `amount` signé : ATK, portée ou PV max ±X, mobilité +X (pendant la durée). Un malus de
   * mobilité est un slow : `normalStatus` le récrit (SPEC §5 bis).
   */
  | 'stat';

/** Les stats que peut changer un statut `stat` (SPEC §5 bis). */
export type StatKey = 'atk' | 'mobility' | 'range' | 'maxHp';

/**
 * Statut posé par un effet (SPEC.md §5 bis, §5.5). `turns` : sa durée, en tours du camp de l'unité touchée (le tour en
 * cours ne compte pas) ; 0 = jusqu'à son prochain tour (il dure le reste du tour en cours).
 */
export type StatusSpec =
  | { readonly kind: 'requiem' }
  | {
      readonly kind: 'stun' | 'immobilise' | 'camouflage' | 'invisible' | 'carapace' | 'silence' | 'desarme' | 'vol';
      readonly turns: number;
    }
  | { readonly kind: 'slow' | 'burn' | 'absorbation' | 'recuperation'; readonly amount: number; readonly turns: number }
  /** `by` : le monstre qui absorbe ; absent dans une carte, il est complété par la source de l'effet. */
  | { readonly kind: 'absorbe'; readonly amount: number; readonly turns: number; readonly by?: UnitId }
  | {
      readonly kind: 'stat';
      readonly stat: StatKey;
      readonly amount: number;
      readonly turns: number;
      /** PV max réellement changés (PV max ±X, plafonné à 1 au plus bas) : ce que la fin du statut rend. */
      readonly applied?: number;
    };

/** Statut en cours sur une unité. */
export type Status = StatusSpec & {
  /** Numéro du tour au début duquel le statut disparaît. */
  readonly expiresAtTurn: number;
};

/** D'où vient un bonus du tour : la carte, et le nom de son effet s'il en a un (« Dopage »). */
export interface EffectSource {
  readonly cardId: CardId;
  readonly effect?: string;
}

/** Bonus du tour donné par une source (Charge, Dopage, Seringue, Flèche divine), cumulé par source. */
export interface TurnBonus {
  readonly source: EffectSource;
  /** ATK et portée : jusqu'à la fin du tour en cours. */
  readonly atk: number;
  readonly range: number;
  /** Mobilité (Charge) : jusqu'au début du prochain tour de son camp, comme `boost`. */
  readonly mobility: number;
}

/** Où peut se trouver le monstre visé par un effet (SPEC.md §5.3). */
export type TargetReach =
  /** Dans le carré de 1 du monstre source : une des 8 cases autour (§10). */
  | { readonly type: 'square1' }
  /** En ligne droite orthogonale depuis le monstre source, avec la même ligne de vue qu'une attaque. */
  | { readonly type: 'line'; readonly range: number }
  /** À `steps` pas au plus d'un des monstres du joueur : chemin en L possible, sans ligne de vue (§10). */
  | { readonly type: 'nearOwnMonster'; readonly steps: number }
  /**
   * Dans le carré de `square` d'une de ses unités, monstre ou terrain (Boule de feu : carré de 3) ; falaises et cases X
   * coupent la zone, comme pour tout carré (§5.1).
   */
  | { readonly type: 'nearOwnUnit'; readonly square: number }
  /** N'importe où sur le plateau. */
  | { readonly type: 'anywhere' };

/**
 * Zone autour du monstre source (SPEC.md §5.3) : la rangée des 3 cases devant lui (la case devant et ses deux voisines
 * de côté, « devant » = le sens où il regarde), son carré de 1 (les 8 cases autour), les 3 cases en ligne
 * dans une direction choisie par le joueur (`line3`, la source se tourne vers elle), ou son carré de 2 (`square2`).
 */
export type AreaZone = 'front3' | 'square1' | 'line3' | 'square2' | 'line3Diagonals';

/** Ce que vise un effet (SPEC.md §5.3). */
export type Targeting =
  /** Un monstre choisi par le joueur : jamais un terrain (§10) ; d'une famille, s'il y en a une (« un allié bodybuilder »). */
  | { readonly type: 'monster'; readonly side: 'ally' | 'enemy'; readonly reach: TargetReach; readonly archetype?: Archetype }
  /** Tous les monstres ennemis de la zone, invisibles compris (§5.3) ; jouable si le lanceur en voit au moins un. */
  | { readonly type: 'zone'; readonly zone: AreaZone }
  /** Une case jouable du carré de 1, sans unité (pose de piège). */
  | { readonly type: 'emptySquareCell' }
  /** Le monstre source lui-même (évolution, Dopage). */
  | { readonly type: 'self' }
  /** Une case jouable sans unité ni case brûlée, dans une zone autour de la source (Lutin brasier : carré de 2). */
  | { readonly type: 'emptyCell'; readonly zone: 'square2' }
  /** Tous ses monstres d'une famille, sans choix (Pénombre) ; jouable s'il en a au moins un. */
  | { readonly type: 'allies'; readonly archetype: Archetype }
  /** Tous les monstres ennemis qu'il voit, sans choix (Piège temporel) ; jouable s'il y en a au moins un. */
  | { readonly type: 'enemies' }
  /**
   * Les monstres ennemis du carré de 1 d'une unité alliée, monstre ou terrain (Brûlure en chaîne) : les effets s'appliquent
   * une fois par unité alliée à côté de laquelle l'ennemi se trouve ; jouable s'il y en a au moins un.
   */
  | { readonly type: 'enemiesNearAllies'; readonly zone: 'square1' }
  /**
   * Un de ses monstres d'une famille, choisi, puis tous les monstres ennemis de son carré de N, invisibles compris
   * (Hurlements) ; jouable dès qu'il a un monstre de la famille, même sans ennemi dans la zone.
   */
  | { readonly type: 'enemiesAroundAlly'; readonly archetype: Archetype; readonly square: number }
  /** Une case libre où la source a été pendant ce tour, sa case de départ comprise (retour, Explorateur du temps). */
  | { readonly type: 'trail' }
  /** Un de ses terrains, n'importe où (Fortification). */
  | { readonly type: 'terrain'; readonly side: 'ally' }
  /** Un monstre de son cimetière, au choix, et une de ses cases d'invocation libres (Réanimation). */
  | { readonly type: 'graveyard' }
  /**
   * Les unités ennemies (monstres et terrains) sur les chaînes entre ses monstres (Chaînes d'éclair, §10) : une chaîne
   * relie deux de ses monstres en ligne droite orthogonale, sans autre de ses monstres entre eux, coupée par les cases X et
   * les falaises ; une unité sur deux chaînes subit les effets deux fois. Sans choix, toujours jouable (ennemis invisibles).
   */
  | { readonly type: 'allyChains' }
  /** Sans cible : l'effet est pour le joueur (Élixir de mana). */
  | { readonly type: 'none' };

/**
 * Où une téléportation pose le monstre (§5.4) : sans précision, une case libre du carré de 1 de la source (Téléporteur) ;
 * `around` : une case libre à `square` cases au plus du monstre, diagonales comprises, sans rien regarder entre les deux
 * (ni case X, ni falaise : Flash) ; `summonCell` : une de ses cases d'invocation libres (Repli) ; `ownTerrain` : la case
 * d'un de ses terrains sans monstre (Téléportation).
 */
export type TeleportTo =
  | { readonly type: 'around'; readonly square: number }
  | { readonly type: 'summonCell' }
  | { readonly type: 'ownTerrain' };

/** Effets (SPEC.md §5.4), appliqués dans l'ordre à chaque cible. */
export type Effect =
  | { readonly type: 'damage'; readonly amount: number }
  /** Rend `amount` PV, sans dépasser les PV max ; jamais sur une cible qui a tous ses PV. */
  | { readonly type: 'heal'; readonly amount: number }
  /** Pose un statut, pour sa durée. */
  | ({ readonly type: 'status' } & StatusSpec)
  /**
   * Recule la cible de `distance` cases au plus, en s'arrêtant avant le premier obstacle. `direction` : au choix du
   * joueur (`chosen`) ou vers l'avant, le sens où regarde la source (`forward`) ; `chooseDistance` : le joueur choisit
   * aussi la distance, de 1 à `distance`.
   */
  | {
      readonly type: 'push';
      readonly distance: number;
      readonly direction: 'chosen' | 'forward';
      readonly chooseDistance: boolean;
    }
  /** Mobilité supplémentaire, pour ce tour. */
  | { readonly type: 'addMobility'; readonly amount: number }
  /**
   * ATK supplémentaire, pour ce tour (Dopage) ; `perHpLost` : `amount` par PV perdu par l'effet précédent, « perd tous
   * ses PV sauf N » (Sacrifice sanguinaire).
   */
  | { readonly type: 'addAtkThisTurn'; readonly amount: number; readonly perHpLost?: true }
  /** Portée supplémentaire, pour ce tour (Flèche divine). */
  | { readonly type: 'addRangeThisTurn'; readonly amount: number }
  /**
   * Armé (Archers impériaux) : sa prochaine attaque de ce tour a +`atk` ATK et/ou inflige `splash` dégâts aux ennemis du
   * carré de 1 de sa cible. Un seul à la fois ; consommé par l'attaque, perdu à la fin du tour.
   */
  | { readonly type: 'arm'; readonly atk?: number; readonly splash?: number }
  /** ATK du moment (bonus du tour compris, auras non comprises) multipliée, pour ce tour (Seringue). */
  | { readonly type: 'multiplyAtkThisTurn'; readonly multiplier: number }
  /** Bonus définitif ; `hp` augmente à la fois les PV actuels et les PV max. */
  | { readonly type: 'addStats'; readonly atk: number; readonly hp: number }
  /**
   * Piège la case visée, cachée pour l'adversaire, jusqu'au prochain tour du poseur : `effects` s'appliquent au monstre
   * ennemi qui y entre (§10).
   */
  | {
      readonly type: 'placeTrap';
      readonly effects: readonly TrapEffect[];
      /** Durée en tours adverses (1 par défaut : jusqu'au prochain tour du poseur) ; le piège disparaît avant s'il sert. */
      readonly turns?: number;
      /** Un seul à la fois par monstre : en poser un nouveau fait disparaître l'ancien (Sablier du temps). */
      readonly single?: true;
      /**
       * Piège électrique (Archi, §10) : il reste (pas de durée) ; deux de ces pièges du même joueur, alignés à `chain` cases
       * au plus sans case X ni falaise entre eux, sont reliés par une chaîne ; un ennemi qui entre sur un piège ou sur une
       * case de la chaîne déclenche tout le réseau relié (ennemis du carré de 1 de ses pièges et sur ses chaînes compris),
       * puis ses pièges se rechargent jusqu'au début du prochain tour de leur poseur.
       */
      readonly chain?: number;
      /** `max` à la fois par joueur pour cette carte : en poser un de plus fait disparaître le plus ancien (Archi : 3). */
      readonly max?: number;
    }
  /**
   * Attire (Blitz, §10) : la source se tourne vers la cible, qui glisse vers elle case par case jusqu'au contact, en
   * s'arrêtant avant le premier obstacle, comme un recul à l'envers (pièges et Passage à chaque case).
   */
  | { readonly type: 'pull' }
  /**
   * Brûle la case visée, visible des deux joueurs, pendant `turns` tours du camp du lanceur (§5.5) : chaque monstre
   * ennemi qui y entre subit `effects` ; la case reste (Lutin brasier).
   */
  | { readonly type: 'burnCell'; readonly turns: number; readonly effects: readonly TrapEffect[] }
  /**
   * Évolution : la source est sacrifiée et remplacée sur sa case par une carte de son grimoire qui évolue d'elle
   * (`evolvesFrom`), sans payer son coût ; le nouveau monstre ne peut pas agir ce tour. Impossible le tour où la source
   * a été invoquée (§10).
   */
  /** `status` : posé sur le monstre invoqué (Évolution draconique : stun jusqu'à son prochain tour). */
  | { readonly type: 'evolve'; readonly status?: StatusSpec }
  /**
   * Invocation (Invocateur) : un monstre de son grimoire, choisi par le joueur, est invoqué sur la case visée en payant
   * aussi son coût ; il peut agir aussitôt (§4.5).
   */
  | { readonly type: 'summon' }
  /**
   * Téléportation (Téléporteur) : le monstre visé est posé sur une case libre du carré de 1 de la source, choisie par le
   * joueur. Ce n'est pas un déplacement : il garde sa mobilité, son attaque et son orientation ; il entre sur la case : ce qui s'y trouve se déclenche (§5.4).
   */
  | { readonly type: 'teleport'; readonly to?: TeleportTo }
  /**
   * Retour (Explorateur du temps) : la source se téléporte sur la case visée, une case où elle a été ce tour (ce qui s'y
   * trouve se déclenche) ; elle garde son attaque, mais ne se déplace plus ce tour.
   */
  | { readonly type: 'returnOnTrail' }
  /**
   * Remonte N cases (piège de la Chronomancienne) : le monstre revient de `steps` cases en arrière sur son chemin (les
   * cases où il a été depuis le début du tour de son camp), en téléportation ; son déplacement s'arrête, sans plus de
   * mobilité ce tour.
   */
  | { readonly type: 'rewind'; readonly steps: number }
  /**
   * Absorbe (Vladimir, Zoldik) : retire `amount` PV à la cible, ou tous ses PV sauf `downTo` (sans la détruire) ; la
   * source récupère les PV retirés, sans dépasser ses PV max. Ce n'est pas une attaque.
   */
  | ({ readonly type: 'absorb' } & ({ readonly amount: number } | { readonly downTo: number }))
  /** La cible perd tous ses PV sauf `downTo`, sans être détruite (Sacrifice sanguinaire). */
  | { readonly type: 'loseHp'; readonly downTo: number }
  /**
   * Transformation (Emma) : la source prend sa forme `into`, avec ses stats, mots-clés et effets ; elle reste le même
   * monstre (§10). Les PV perdus de la forme quittée sont mis de côté, ceux de la forme prise reviennent.
   */
  | { readonly type: 'transform'; readonly into: CardId }
  /** +N mana pour le joueur, jusqu'à la limite de la partie (Élixir de mana) ; jouable seulement s'il en gagne. */
  | { readonly type: 'gainMana'; readonly amount: number }
  /**
   * Retire ses malus (Cure, §5 bis) : tous les statuts malus de la cible, requiem compris ; il retrouve la mobilité qu'ils
   * lui avaient prise ce tour (`mobilityTaken`). Jamais sur un monstre sans malus.
   */
  | { readonly type: 'cleanse' }
  /**
   * Réanimation : le monstre choisi dans son cimetière est invoqué sur la case visée (une de ses cases d'invocation
   * libres), sans payer son coût ; il quitte le cimetière, avec tous ses PV et sans statut, et peut agir aussitôt.
   */
  | { readonly type: 'reanimate' };

/** Effets possibles d'un piège, ou d'un terrain « Passage », sur le monstre qui entre sur sa case ou dans sa zone. */
export type TrapEffect = Extract<Effect, { readonly type: 'damage' | 'status' | 'rewind' }>;

/**
 * « Passage » (SPEC.md §5.2) : quand un monstre ennemi entre sur une case de la zone du terrain (son carré
 * de 1), il subit `effects` : à chaque case en marchant, une fois par recul.
 */
export interface TerrainPassage {
  readonly zone: 'square1';
  readonly effects: readonly TrapEffect[];
  /**
   * « Zone » (Golem de lave, §10) : la zone agit sur tout ennemi qui s'y trouve, pas seulement sur celui qui y entre :
   * aussi quand c'est la source qui entre à côté de lui, et au début de chaque tour de son camp sur ceux qui y sont encore.
   */
  readonly lingering?: boolean;
  /**
   * « Début du tour adverse » (Champ magnétique, §10) : au début de chaque tour de l'adversaire, chaque ennemi dans sa zone
   * subit de nouveau ses effets (après les revenus, avant burn et la mobilité).
   */
  readonly enemyTurnStart?: true;
}

/**
 * « Au déplacement » (Terrain de chasse, SPEC.md §5.2, §10) : un de ses monstres qui commence un déplacement sur une case
 * de sa zone (sa case et son carré de 1) a +`mobility` mobilité ce tour ; une fois par tour et par monstre, tous ces
 * terrains confondus.
 */
export interface TerrainOnMove {
  readonly zone: 'cellAndSquare';
  readonly mobility: number;
  /** Seulement ses monstres de cet archétype (Terrain de chasse - Vampire : ses vampires). */
  readonly archetype?: Archetype;
}

/** Un effet complet (SPEC.md §5.2) : sa cible ou sa zone, puis ses effets. */
export interface Ability {
  /** Nom de l'effet, s'il en a un (« Déflagration »), sans effet de règle. */
  readonly name?: string;
  readonly targeting: Targeting;
  readonly effects: readonly Effect[];
}

/** Armé (effet `arm`) : le bonus que porte la prochaine attaque, et d'où il vient. */
export interface Armed {
  readonly source: EffectSource;
  readonly atk: number;
  readonly splash: number;
}

/** Effet actif d'un monstre : chacun une fois par tour, en payant `manaCost`. */
export interface ActivatedAbility extends Ability {
  readonly manaCost: number;
  /** « Sans limite par tour » : autant de fois qu'il paie son coût (Emma, §4.8). */
  readonly unlimited?: true;
  /** « Puis plus d'attaque ce tour » : après l'activation, il ne peut plus attaquer ce tour (Zoldik). */
  readonly endsAttack?: true;
  /**
   * Contre-coup (SPEC §5.2) : ce que le monstre source subit en retour, sur lui-même, après l'effet (même si la cible
   * est détruite). Seuls des statuts pour l'instant (Dragonnet : silence).
   */
  readonly backlash?: readonly Effect[];
}

interface CardBase {
  readonly id: CardId;
  /** Nom affiché ; une carte de deck s'écrit « Nom - Archétype » (« Feria - Sorciers du feu »). */
  readonly name: string;
  readonly cost: number;
  /** Texte d'ambiance, sans effet de règle (Maître du temps). */
  readonly flavor?: string;
}

/**
 * Zone d'une aura ou d'un effet de début de tour : le carré de 1, le carré de 2 (`square2`, §5.3), ou la case de la
 * source et les 8 autour (`cellAndSquare`, terrain : Salle de sport).
 */
export type AllyZone = 'square1' | 'square2' | 'cellAndSquare';

/** Effet sur ses monstres d'une famille, dans une zone autour de la source (pas la source elle-même). */
export interface AllyZoneEffect {
  readonly zone: AllyZone;
  readonly archetype: Archetype;
  readonly effects: readonly Effect[];
}

/**
 * Aura (SPEC.md §5.2) : +`atk` ATK, +`hp` PV, +`mobility` mobilité à ses monstres d'une famille autour de la source,
 * tant qu'ils y sont (§10 pour les PV et la mobilité).
 */
export interface StatAura {
  /** Nom de l'effet, s'il en a un (« Carquois prêt ! »). */
  readonly name?: string;
  readonly zone: AllyZone;
  readonly archetype: Archetype;
  readonly atk: number;
  readonly hp: number;
  readonly mobility: number;
  /** +N portée (Camps de tir). */
  readonly range?: number;
  /** Nombre total d'attaques par tour (Carquois prêt ! : 2) ; plusieurs auras ne s'additionnent pas. */
  readonly attacks?: number;
  /** Coût d'activation de leurs effets actifs fixé à N mana tant qu'ils sont dans la zone (Nid de dragons : 1). */
  readonly effectCost?: number;
  /** Camouflage (carré de 2) ou Invisible (carré de 1) tant qu'ils sont dans la zone (Terrain de jeu : invisible) ; la plus grande portée compte. */
  readonly stealth?: 'camouflage' | 'invisible';
}

export interface MonsterCard extends CardBase {
  readonly kind: 'monster';
  readonly archetype: Archetype | null;
  readonly atk: number;
  readonly hp: number;
  readonly mobility: number;
  readonly range: number;
  readonly keywords: readonly KeywordSpec[];
  /** Effets actifs, dans l'ordre de la carte (aucun, un ou deux) : chacun utilisable une fois par tour. */
  readonly activated: readonly ActivatedAbility[];
  /** Évolution : carte qu'un monstre de cette carte-là peut faire apparaître à sa place, par son effet `evolve`. */
  readonly evolvesFrom: CardId | null;
  /** « Quand il détruit une unité » (monstre ou terrain) : effets sur lui-même (Jeune Gomuscu). */
  readonly onKill: readonly Effect[] | null;
  /** « Début de tour » : effets sur ses alliés d'une famille autour de lui (Ki né). */
  readonly turnStart: AllyZoneEffect | null;
  /** « Aura » : bonus d'ATK à ses alliés d'une famille autour de lui (Arnold). */
  readonly aura: StatAura | null;
  /** « Passage » : effets sur les monstres ennemis qui entrent dans sa zone, comme un terrain (Golem de lave). */
  readonly passage: TerrainPassage | null;
  /**
   * Forme d'une autre carte, hors grimoire (la chauve-souris d'Emma) : elle n'apparaît que par transformation, et c'est
   * cette carte-là qui va au cimetière.
   */
  readonly formOf: CardId | null;
  /** Ne peut pas attaquer une cible au contact (Trébuchet des archers) : `no_cac`, sans statut ni mot-clé. */
  readonly noContact?: true;
}

export interface SpellCard extends CardBase {
  readonly kind: 'spell';
  /** Effet du sort, résolu quand la carte est jouée. */
  readonly ability: Ability;
}

export interface TerrainCard extends CardBase {
  readonly kind: 'terrain';
  readonly hp: number;
  /** Mana supplémentaire rapporté par la mana zone que ce terrain occupe. */
  readonly zoneManaBonus: number;
  /** Effet « Passage » sur les monstres ennemis qui entrent dans sa zone (Terrain drainant, Terrain piégé). */
  readonly passage: TerrainPassage | null;
  /** « Point d'invocation » : sa case est une case d'invocation de son camp tant qu'aucun monstre ne s'y trouve. */
  readonly summonPoint: boolean;
  /** Effet « Au déplacement » sur ses monstres qui partent de sa zone (Terrain de chasse). */
  readonly onMove: TerrainOnMove | null;
  /** Aura sur ses monstres d'une famille dans sa zone, comme celle d'un monstre (Salle de sport). */
  readonly aura: StatAura | null;
}

/**
 * Balise (Balise de vision, §6 ter, §10) : la carte pose sur le plateau une balise, ni monstre ni terrain. Elle est au sol
 * et ne bloque rien ; elle a des PV ; elle révèle à son joueur les pièges ennemis autour d'elle.
 */
export interface BeaconCard extends CardBase {
  readonly kind: 'beacon';
  readonly hp: number;
  /** Où elle se pose : une case libre dans le carré de `square` d'un de ses monstres, hors case centrale d'une mana zone qu'il tient. */
  readonly placement: { readonly square: number };
  /** Elle révèle à son joueur les pièges ennemis de son carré de `square`, tant qu'elle est sur le plateau. */
  readonly revealTraps: { readonly square: number };
}

export type Card = MonsterCard | SpellCard | TerrainCard | BeaconCard;

/**
 * Les cartes d'une partie : la définition de chaque carte, par son identifiant. Celles de `CARDS` par défaut, d'autres
 * pour essayer des réglages (atelier) : le moteur, l'IA et l'écran de jeu ne lisent que celles de la partie.
 */
export type CardSet = Readonly<Record<CardId, Card>>;

// ---------------------------------------------------------------------------
// Unités sur le plateau
// ---------------------------------------------------------------------------

export type UnitId = string;

interface UnitBase {
  readonly id: UnitId;
  readonly cardId: CardId;
  readonly owner: PlayerId;
  readonly pos: Position;
  /**
   * Exemplaire brillant (« shiny », handoff V11) : la carte qui l'a fait venir l'était. Purement visuel, sans effet sur
   * les règles ; absent sinon.
   */
  readonly shiny?: true;
  /** Points de vie actuels (les dégâts restent). */
  readonly hp: number;
  readonly maxHp: number;
  /** Statuts en cours (cumulables). */
  readonly statuses: readonly Status[];
}

export interface MonsterUnit extends UnitBase {
  readonly kind: 'monster';
  /** ATK propre (peut différer de la carte, ex. Bénédiction), sans le bonus du tour ni les auras. */
  readonly atk: number;
  /** ATK en plus pour le tour en cours (Dopage, Seringue) ; remise à 0 au début de chaque tour. */
  readonly atkBonus: number;
  /** Portée en plus pour le tour en cours (Flèche divine) ; remise à 0 au début de chaque tour. */
  readonly rangeBonus: number;
  /** PV donnés par les auras (Origine), déjà compris dans `hp` et `maxHp` : ce qu'il perd en quittant l'aura. */
  readonly auraHp: number;
  readonly mobilityLeft: number;
  /** Mobilité retirée pour ce tour par slow (Entrave, Terrain piégé…) ; recalculée au début de son tour. */
  readonly froze: number;
  /** Mobilité ajoutée pour ce tour (Charge) ; remise à 0 au début de son tour. */
  readonly boost: number;
  /** Les bonus du tour (`atkBonus`, `rangeBonus`, `boost`), par source : pour dire d'où ils viennent. */
  readonly turnBonuses: readonly TurnBonus[];
  readonly hasAttacked: boolean;
  /**
   * Attaques faites ce tour (§4.7) : une seule, ou deux avec Carquois prêt ! (`attackLimit`). `hasAttacked` vrai avec 0
   * attaque faite : plus d'attaque ce tour (effet « puis plus d'attaque », nouveau monstre évolué).
   */
  readonly attacksMade: number;
  /** Armé : sa prochaine attaque de ce tour porte un bonus (Flèche explosive, Carreau perforant) ; absent sinon. */
  readonly armed?: Armed;
  /** Effets actifs déjà utilisés ce tour, par leur rang sur la carte (0 : le premier). */
  readonly usedEffects: readonly number[];
  /**
   * Cases où il a été depuis le début du tour de son camp (ou son arrivée), dans l'ordre, sa case actuelle à la fin :
   * le retour et le piège qui fait remonter le temps s'en servent (Explorateur du temps).
   */
  readonly trail: readonly Position[];
  /** `riposte` déjà déclenchée ce tour : une seule par tour (SPEC.md §10). */
  readonly hasRiposted: boolean;
  /** Tour où il est arrivé sur le plateau (l'évolution n'est pas possible ce tour-là). */
  readonly summonedOnTurn: number;
  /** Direction où regarde le monstre : celle de son dernier pas (sert à `assassin`, §10). */
  readonly facing: Direction;
  /** `invisible` : révélé jusqu'à la fin du tour, pour avoir bloqué une action adverse (§10). */
  readonly revealed: boolean;
  /**
   * Son déplacement est fini pour ce tour, sans statut (sablier, arrêt forcé sur un allié) : une transformation ne lui rend
   * pas de mobilité. Remis à zéro au début de son tour ; absent sinon.
   */
  readonly halted?: true;
  /**
   * Il a déjà eu ce tour le bonus d'un terrain « Au déplacement » (Terrain de chasse) : pas un deuxième. Remis à zéro au
   * début de son tour ; absent sinon.
   */
  readonly onMoveTaken?: true;
  /** PV perdus de son autre forme, mis de côté (Emma, §10) ; absent tant qu'il ne s'est pas transformé. */
  readonly otherFormDamage?: number;
  /**
   * Mobilité dépensée au-delà de celle de sa forme actuelle (chauve-souris qui a beaucoup marché, redevenue Emma) :
   * une transformation la déduit d'abord. Remise à zéro au début de son tour ; absente tant qu'il ne s'est pas transformé.
   */
  readonly mobilityDebt?: number;
  /**
   * Mobilité que ses malus (slow, stun, immobilisé) lui ont prise ce tour : au début de son tour et quand ils
   * arrivent pendant son tour. Retirer ses malus (Cure) la lui rend. Absente : rien.
   */
  readonly mobilityTaken?: number;
}

export interface TerrainUnit extends UnitBase {
  readonly kind: 'terrain';
}

export type Unit = MonsterUnit | TerrainUnit;

/**
 * Balise posée (§6 ter, §10) : publique, au sol, elle ne bloque rien (on marche dessus, elle ne gêne ni les déplacements
 * ni les tirs) et ne compte ni pour une mana zone ni pour révéler un monstre. Une attaque ou un sort de dégâts la touche
 * quand aucun monstre n'est sur sa case. Ce n'est pas une unité : elle est rangée à part, comme les pièges.
 */
export interface Beacon {
  /** Identifiant tiré du même compteur que les unités (`u12`). */
  readonly id: UnitId;
  readonly cardId: CardId;
  readonly owner: PlayerId;
  readonly pos: Position;
  readonly hp: number;
  readonly maxHp: number;
  readonly shiny?: true;
}

// ---------------------------------------------------------------------------
// État de la partie
// ---------------------------------------------------------------------------

/**
 * Exemplaire d'une carte dans une liste publique : cartes jouées, cimetière. `shiny` : brillant, comme son unité sur le
 * plateau (purement visuel, §10) ; jamais un sort.
 */
export interface CardCopy {
  readonly cardId: CardId;
  readonly shiny?: true;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly mana: number;
  /** Points de victoire. */
  readonly vp: number;
  /** Cartes encore disponibles (information cachée pour l'adversaire). */
  readonly grimoire: readonly CardId[];
  /**
   * Cimetière, public (§4.3) : sorts lancés, monstres et terrains qui ont quitté le plateau (détruits, sacrifiés, tués
   * par requiem), dans l'ordre d'arrivée. Un monstre ou un terrain posé quitte le grimoire sans y aller.
   */
  readonly graveyard: readonly CardCopy[];
  /**
   * Exemplaires brillants encore dans son grimoire (purement visuel) : une carte jouée l'est d'abord dans un exemplaire
   * brillant, s'il en reste. Absent : aucun.
   */
  readonly shiny?: readonly CardId[];
}

export interface GameState {
  readonly board: Board;
  /** Les cartes de la partie, fixées à sa création : publiques. */
  readonly cards: CardSet;
  readonly mode: GameMode;
  readonly economy: Economy;
  readonly manaRules: ManaRules;
  /** VP pour gagner (§4.10), choisis à l'accueil : 30 par défaut (`VICTORY_VP`). */
  readonly victoryVp: number;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly activePlayer: PlayerId;
  /** Numéro du tour : 1 = premier tour de J1, 2 = premier tour de J2, etc. */
  readonly turn: number;
  readonly units: Readonly<Record<UnitId, Unit>>;
  /** Pièges posés : chacun n'est visible que de son propriétaire. */
  readonly traps: readonly Trap[];
  /** Cases brûlées (Lutin brasier) : publiques. */
  readonly burningCells: readonly BurningCell[];
  /** Balises posées (Balise de vision) : publiques ; absent dans une partie d'avant (lire avec `getBeacons`). */
  readonly beacons?: readonly Beacon[];
  /** Compteur pour générer des `UnitId` de façon déterministe. */
  readonly nextUnitId: number;
  readonly winner: PlayerId | null;
  /** La partie a fini par un abandon (parties en ligne, SPEC.md §7 ter) : qui l'a perdue, et pourquoi ; `null` sinon. */
  readonly concession: Concession | null;
  /** Événements de la dernière action, dans l'ordre (pour les animations) ; vidés au début de chaque action. */
  readonly events: readonly GameEvent[];
}

/**
 * Fin de partie par abandon (SPEC.md §7 ter) : `abandon`, le joueur a abandonné ; `absence`, il a perdu par absence
 * (2 tours de suite passés à la fin de son temps sans être connecté). L'adversaire gagne.
 */
export interface Concession {
  readonly player: PlayerId;
  readonly reason: 'abandon' | 'absence';
}

/** Cause d'une perte de PV. */
export type DamageCause = 'attack' | 'riposte' | 'trap' | 'passage' | 'effect' | 'spell' | 'burn';

/**
 * Ce qui s'est passé pendant une action, dans l'ordre. `pos` est toujours la case concernée au moment de l'événement.
 * L'interface les rejoue en animation ; `getPlayerView` retire ceux que le joueur n'a pas le droit de voir, et la case
 * d'une unité qui lui est cachée (§10).
 */
export type GameEvent =
  | { readonly type: 'turnStart'; readonly player: PlayerId; readonly turn: number }
  /** Gain (positif) ou dépense (négative) de mana ; `pos` : la mana zone d'où il vient, s'il y en a une. */
  | { readonly type: 'mana'; readonly player: PlayerId; readonly amount: number; readonly pos: Position | null }
  /** Gain de VP ; `pos` : la mana zone tenue ou la case du monstre détruit, s'il y en a une. */
  | { readonly type: 'vp'; readonly player: PlayerId; readonly amount: number; readonly pos: Position | null }
  /**
   * Carte jouée depuis le grimoire, vers une case (invocation, terrain) ou un monstre (sort) ; `unitId` : l'unité qu'elle
   * pose ou le monstre qu'elle vise. `pos` vaut `null` pour un sort sans cible, et dans la vue d'un joueur à qui cette
   * unité est cachée : la carte est publique, pas sa case (§10).
   */
  | {
      readonly type: 'cardPlayed';
      readonly player: PlayerId;
      readonly cardId: CardId;
      readonly pos: Position | null;
      readonly unitId?: UnitId;
    }
  /** Unité posée (monstre invoqué ou terrain). */
  | { readonly type: 'summon'; readonly unit: Unit }
  /** Réanimation : l'exemplaire de `cardId` quitte le cimetière de `player` (son invocation suit). */
  | { readonly type: 'revived'; readonly player: PlayerId; readonly cardId: CardId; readonly shiny: boolean }
  /**
   * Ses malus lui sont retirés (Cure) : ses statuts, sa mobilité, ses PV et PV max ensuite (un malus de PV max qui part
   * les lui rend).
   */
  | {
      readonly type: 'cleansed';
      readonly unitId: UnitId;
      readonly pos: Position;
      readonly removed: readonly Status[];
      readonly statuses: readonly Status[];
      readonly mobilityLeft: number;
      readonly hp: number;
      readonly maxHp: number;
    }
  /**
   * Effet activé d'un monstre, vers un monstre (`targetId`, `pos` : sa case) ; pour un piège, `pos` est la case du
   * poseur. `pos` vaut `null` dans la vue d'un joueur à qui le monstre visé est caché (§10). `cells` : la zone touchée
   * par un effet de zone (vide sinon).
   */
  | {
      readonly type: 'effect';
      readonly unitId: UnitId;
      readonly pos: Position | null;
      readonly targetId?: UnitId;
      readonly cells: readonly Position[];
      /** Direction choisie pour une zone en ligne : la source se tourne vers elle. */
      readonly facing?: Direction;
      /** Rang de l'effet sur la carte (0 si absent : le premier). */
      readonly effect?: number;
    }
  /** Transformation (Emma) : le monstre passe de la forme `from` à la forme `to` ; `hp` et `maxHp` : ses PV ensuite. */
  | {
      readonly type: 'transform';
      readonly unitId: UnitId;
      readonly pos: Position;
      readonly from: CardId;
      readonly to: CardId;
      readonly hp: number;
      readonly maxHp: number;
    }
  /** Monstre sacrifié pour une évolution : il quitte le plateau, sans être détruit (pas de VP). */
  | { readonly type: 'sacrifice'; readonly unitId: UnitId; readonly pos: Position }
  /** Un pas d'une case : déplacement, avancée après une attaque, ou recul (Bourrasque). */
  | {
      readonly type: 'step';
      readonly unitId: UnitId;
      readonly from: Position;
      readonly to: Position;
      readonly kind: 'walk' | 'advance' | 'push' | 'pull';
    }
  /** Téléportation : le monstre passe de `from` à `to` sans traverser les cases entre les deux. */
  | { readonly type: 'teleport'; readonly unitId: UnitId; readonly from: Position; readonly to: Position }
  /** Retour dans le temps (retour, ou piège qui fait remonter) : le monstre revient de `from` à `to`, sur son chemin. */
  | { readonly type: 'rewind'; readonly unitId: UnitId; readonly from: Position; readonly to: Position }
  /** Un terrain « Passage » se déclenche sur le monstre ennemi qui vient d'entrer dans sa zone (`pos` : sa case). */
  | { readonly type: 'passage'; readonly sourceId: UnitId; readonly unitId: UnitId; readonly pos: Position }
  /** Une case brûle (Lutin brasier). */
  | { readonly type: 'cellBurned'; readonly cell: BurningCell }
  /** Un monstre ennemi entre sur une case brûlée. */
  | { readonly type: 'burningCell'; readonly cell: BurningCell; readonly unitId: UnitId }
  /** Déplacement interrompu par un monstre invisible : le monstre revient sur `pos`. */
  | { readonly type: 'stopped'; readonly unitId: UnitId; readonly pos: Position }
  | {
      readonly type: 'attack';
      readonly unitId: UnitId;
      /** La cible ; absente pour un tir sur une case vide (Flèche explosive). */
      readonly targetId?: UnitId;
      readonly from: Position;
      readonly to: Position;
      readonly behind: boolean;
    }
  /** Tir arrêté par un monstre invisible. */
  | { readonly type: 'shotBlocked'; readonly unitId: UnitId; readonly from: Position; readonly pos: Position }
  | { readonly type: 'riposte'; readonly unitId: UnitId; readonly targetId: UnitId; readonly from: Position; readonly to: Position }
  | {
      readonly type: 'damage';
      readonly unitId: UnitId;
      readonly pos: Position;
      readonly amount: number;
      readonly hp: number;
      readonly cause: DamageCause;
      /** Carapace : des dégâts qui l'auraient fait descendre sous 1 PV ont été retenus (`amount` : ceux qui restent). */
      readonly held?: true;
    }
  | { readonly type: 'destroyed'; readonly unitId: UnitId; readonly pos: Position }
  | { readonly type: 'heal'; readonly unitId: UnitId; readonly pos: Position; readonly amount: number }
  | { readonly type: 'buff'; readonly unitId: UnitId; readonly pos: Position; readonly atk: number; readonly hp: number }
  /** ATK en plus pour ce tour. */
  | { readonly type: 'boost'; readonly unitId: UnitId; readonly pos: Position; readonly atk: number }
  /** Portée en plus pour ce tour. */
  | { readonly type: 'reach'; readonly unitId: UnitId; readonly pos: Position; readonly amount: number }
  /** PV d'aura gagnés (ou perdus, `amount` < 0) en entrant dans une aura (ou en la quittant) ; `hp` : ses PV ensuite. */
  | { readonly type: 'auraHp'; readonly unitId: UnitId; readonly pos: Position; readonly amount: number; readonly hp: number }
  /** Requiem arrivé à son terme : le monstre meurt, sans être détruit par personne (pas de VP). */
  | { readonly type: 'requiem'; readonly unitId: UnitId; readonly pos: Position }
  /** Mobilité en plus ce tour ; `source` : le terrain qui la donne (Terrain de chasse), absent pour un sort ou un effet. */
  | { readonly type: 'mobility'; readonly unitId: UnitId; readonly pos: Position; readonly amount: number; readonly source?: CardId }
  | { readonly type: 'status'; readonly unitId: UnitId; readonly pos: Position; readonly status: Status }
  | { readonly type: 'trapPlaced'; readonly trap: Trap }
  | { readonly type: 'trapTriggered'; readonly trap: Trap; readonly unitId: UnitId }
  /** Monstre invisible révélé pour avoir bloqué une action (§10). */
  | { readonly type: 'revealed'; readonly unit: MonsterUnit }
  /**
   * Arcs électriques entre des cases, pour l'animation (propagation de Statik, réseau d'Archi, Chaînes d'éclair, Onde de
   * choc) ; `cardId` : la carte qui les lance. `getPlayerView` retire un arc dont une extrémité est un monstre caché au joueur.
   */
  | { readonly type: 'arcs'; readonly cardId: CardId; readonly arcs: readonly Arc[] }
  /** Balise posée (Balise de vision), publique. */
  | { readonly type: 'beaconPlaced'; readonly beacon: Beacon }
  /** Balise touchée par une attaque ou un sort : `hp`, ses PV ensuite. */
  | { readonly type: 'beaconDamage'; readonly beaconId: UnitId; readonly pos: Position; readonly amount: number; readonly hp: number }
  /** Balise détruite : elle quitte le plateau pour le cimetière de son joueur (pas de VP). */
  | { readonly type: 'beaconDestroyed'; readonly beaconId: UnitId; readonly pos: Position };

/** Un arc électrique (événement `arcs`) : de `from` à `to` ; `fromId`, `toId` : l'unité sur chaque bout, s'il y en a une. */
export interface Arc {
  readonly from: Position;
  readonly to: Position;
  readonly fromId?: UnitId;
  readonly toId?: UnitId;
}

/** Case brûlée (Lutin brasier) : publique, elle reste jusqu'au début du tour `expiresAtTurn`. */
export interface BurningCell {
  readonly owner: PlayerId;
  readonly pos: Position;
  /** Ce que subit chaque monstre ennemi qui entre sur la case. */
  readonly effects: readonly TrapEffect[];
  /** Carte du monstre qui l'a brûlée (pour l'affichage). */
  readonly cardId: CardId;
  readonly expiresAtTurn: number;
}

export interface Trap {
  readonly owner: PlayerId;
  readonly pos: Position;
  /** Ce que subit le monstre ennemi qui entre sur sa case. */
  readonly effects: readonly TrapEffect[];
  /** Carte du monstre qui l'a posé (pour l'affichage). */
  readonly cardId: CardId;
  /** Le monstre qui l'a posé (un sablier à la fois par monstre, §10). */
  readonly sourceId: UnitId;
  /**
   * Numéro du tour au début duquel il disparaît : le prochain tour de son poseur, ou plus tard (`turns` de `placeTrap`) ;
   * `null` : il reste (piège électrique d'Archi).
   */
  readonly expiresAtTurn: number | null;
  /** Piège électrique : reliés par une chaîne aux siens de la même carte, alignés à `chain` cases au plus (§10). */
  readonly chain?: number;
  /** Piège électrique déclenché : il se recharge jusqu'au début de ce tour (le prochain tour de son poseur). */
  readonly rearmsAtTurn?: number;
}

/** Deck pré-construit, choisi avant la partie (pas de deckbuilding). */
export interface Deck {
  readonly id: string;
  readonly name: string;
  readonly cards: readonly CardId[];
  /** Exemplaires brillants parmi ses cartes (purement visuel, handoff V11). */
  readonly shiny?: readonly CardId[];
}

/** Plateau, unités et cartes de la partie : informations publiques, communes à `GameState` et `PlayerView`. */
export type BoardState = Pick<GameState, 'board' | 'units' | 'cards'>;

/** Plateau, unités, cartes et mode : de quoi dire qui tient une mana zone (§4.4, §4.4 bis). */
export type ZoneState = Pick<GameState, 'board' | 'units' | 'cards' | 'mode'>;

/** Qui tient une mana zone : `controller` (personne si neutre ou contestée) ; `contested` en mode contestation. */
export interface ZoneStatus {
  readonly pos: Position;
  readonly controller: PlayerId | null;
  readonly contested: boolean;
}

// ---------------------------------------------------------------------------
// Vue d'un joueur (SPEC.md §2, §4.3) : tout ce que l'UI a le droit d'afficher
// ---------------------------------------------------------------------------

/** Ce qu'un joueur sait de son adversaire : tout, sauf le contenu de son grimoire. */
export interface OpponentView {
  readonly id: PlayerId;
  readonly mana: number;
  readonly vp: number;
  readonly graveyard: readonly CardCopy[];
  /**
   * Ses unités sur le plateau que le joueur ne voit pas (invisibles, camouflées) : leur carte seulement, jamais leur case
   * ni leur unité, et pas brillantes (§4.3, §10). Ce qui est joué est public ; seule la position est cachée.
   */
  readonly onBoardHidden: readonly CardCopy[];
  readonly grimoireCount: number;
}

export interface PlayerView {
  /** Le joueur à qui cette vue est destinée. */
  readonly viewer: PlayerId;
  readonly board: Board;
  /** Les cartes de la partie : l'écran les lit là, jamais dans `CARDS`. */
  readonly cards: CardSet;
  readonly mode: GameMode;
  readonly economy: Economy;
  readonly manaRules: ManaRules;
  /** VP pour gagner (§4.10), choisis à l'accueil : 30 par défaut (`VICTORY_VP`). */
  readonly victoryVp: number;
  readonly units: Readonly<Record<UnitId, Unit>>;
  readonly activePlayer: PlayerId;
  readonly turn: number;
  readonly winner: PlayerId | null;
  /** Abandon (public) : qui a perdu la partie ainsi ; `null` sinon. */
  readonly concession: Concession | null;
  readonly me: PlayerState;
  readonly opponent: OpponentView;
  /** Ses propres pièges seulement : ceux de l'adversaire sont cachés. */
  readonly traps: readonly Trap[];
  /** Toutes les cases brûlées : elles sont publiques. */
  readonly burningCells: readonly BurningCell[];
  /** Balises des deux joueurs : publiques. */
  readonly beacons: readonly Beacon[];
  /** Ses monstres `invisible` que l'adversaire ne voit pas en ce moment. */
  readonly hiddenFromOpponent: readonly UnitId[];
  /**
   * Monstres adverses présents sur le plateau mais invisibles pour lui (absents de `units`) : seule leur existence
   * est connue, pas leur case. Sert à ne pas prendre pour une destruction un monstre qui disparaît de la vue.
   */
  readonly hiddenEnemies: readonly UnitId[];
  /**
   * Contrôle des mana zones (`pos` : la mana zone, centre de sa zone en mode contestation) : public, même quand
   * l'occupant est invisible. `contested` : les deux joueurs y sont, personne ne la tient (§4.4 bis).
   */
  readonly zoneControl: readonly ZoneStatus[];
  /** Actions légales du joueur qui regarde ; vide si ce n'est pas son tour. */
  readonly legalActions: readonly Action[];
  /** Événements de la dernière action qu'il a le droit de voir (jamais un piège adverse posé, ni un monstre caché). */
  readonly events: readonly GameEvent[];
}

// ---------------------------------------------------------------------------
// Actions (SPEC.md §4.2)
// ---------------------------------------------------------------------------

/**
 * Cible d'un effet (sort ou effet activé) : un monstre, avec une direction pour un recul (Bourrasque),
 * ou une case pour un piège.
 */
export type EffectTarget =
  | { readonly kind: 'unit'; readonly unitId: UnitId }
  | { readonly kind: 'unitAndDirection'; readonly unitId: UnitId; readonly direction: Direction }
  | { readonly kind: 'cell'; readonly pos: Position }
  /**
   * Effet de zone, autour de la source ; `direction` : direction choisie pour une zone en ligne (Raz de marée, Vent
   * violent) ; `distance` : recul choisi (Vent violent).
   */
  | { readonly kind: 'area'; readonly direction?: Direction; readonly distance?: number }
  /** Carte de son grimoire choisie par l'effet (évolution). */
  | { readonly kind: 'card'; readonly cardId: CardId }
  /** Invocation : la case, puis le monstre de son grimoire à y invoquer. */
  | { readonly kind: 'cellAndCard'; readonly pos: Position; readonly cardId: CardId }
  /** Téléportation : le monstre, puis la case où le poser. */
  | { readonly kind: 'unitAndCell'; readonly unitId: UnitId; readonly pos: Position }
  /** Tous les monstres visés, sans choix (Pénombre). */
  | { readonly kind: 'all' };

export type CardTarget =
  /** Invocation (case d'invocation libre) ou terrain (mana zone). */
  | { readonly kind: 'cell'; readonly pos: Position }
  /** Sort. */
  | EffectTarget;

export type Action =
  | { readonly type: 'playCard'; readonly cardId: CardId; readonly target: CardTarget }
  /**
   * `path` : cases traversées, de la première après le départ jusqu'à `to` inclus. Sans `path`, le moteur
   * prend le chemin par défaut (`getMovePath`), celui que l'interface montre avant le clic.
   */
  | { readonly type: 'move'; readonly unitId: UnitId; readonly to: Position; readonly path?: readonly Position[] }
  /** `advance` : prendre la place de la cible détruite (avancée, SPEC.md §4.7). */
  | { readonly type: 'attack'; readonly unitId: UnitId; readonly targetId: UnitId; readonly advance: boolean }
  /**
   * Tir sur une case vide (2026-11-10) : seulement armé d'éclats (Flèche explosive), sur une case qu'il pourrait attaquer ;
   * c'est son attaque, les éclats touchent les ennemis du carré de 1 de la case.
   */
  | { readonly type: 'attackCell'; readonly unitId: UnitId; readonly pos: Position }
  /** `effect` : rang de l'effet actif sur la carte (absent : le premier). */
  | { readonly type: 'activateEffect'; readonly unitId: UnitId; readonly effect?: number; readonly target: EffectTarget }
  | { readonly type: 'endTurn' };
