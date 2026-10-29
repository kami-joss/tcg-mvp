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
  /** Mobilité en plus pour chaque monstre sur ce plateau (SPEC.md §3) ; 0 en général. */
  readonly mobilityBonus: number;
  /** Décor de la vue isométrique ; `null` : pas de vue isométrique pour ce plateau. */
  readonly scenery: BoardScenery | null;
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
  | 'fleche-divine'
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
  // Deck Bodybuilder
  | 'jeune-gomuscu'
  | 'jean-bon'
  | 'arnold'
  | 'ki-ne'
  | 'seringue'
  // Deck Sorciers du feu
  | 'apprenti'
  | 'lutin-brasier'
  | 'archimage'
  | 'golem-de-lave'
  // Deck Explorateur du temps
  | 'apprenti-temps'
  | 'chronomancienne'
  | 'dragonnet-temps'
  | 'maitre-des-heures'
  | 'piege-temporel'
  | 'fissure-temporelle';

/**
 * Famille de cartes (SPEC.md §5.1) : les bodybuilders, les archers (sauf le Trébuchet), les dragons élémentaires (Jeune
 * dragon compris), les monstres piège (les 4 monstres du deck Pièges), les sorciers du feu, les explorateurs du temps.
 */
export type Archetype = 'bodybuilder' | 'archer' | 'dragon' | 'piege' | 'sorcier' | 'temps';

/**
 * Mots-clés (SPEC.md §5.6) et leurs paramètres : chaque carte porte ses propres valeurs (« Givre 1 », « Assassin ×3 »).
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
  readonly givre: { readonly amount: number; readonly turns: number };
  /** À l'attaque : burn `amount` pendant `turns` tours (Archer du feu). */
  readonly brulure: { readonly amount: number; readonly turns: number };
  /** Dégâts ×`multiplier` contre un terrain (Trébuchet). */
  readonly siege: { readonly multiplier: number };
  /** Par derrière, contre un monstre : +`amount` ATK pour cette attaque (Farceur). */
  readonly sournois: { readonly amount: number };
  /** Par derrière, contre un monstre : dégâts ×`multiplier` (Clown assassin). */
  readonly assassin: { readonly multiplier: number };
  /** Camouflage : caché à l'adversaire tant qu'aucun monstre ni terrain adverse n'est dans un rayon de `amount` (§10). */
  readonly camouflage: { readonly amount: number };
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
  /** Meurt au début du `turns`-ième prochain tour de son camp, sans VP pour personne. */
  | 'requiem'
  /** Invisible pour l'adversaire comme avec le mot-clé `invisible` de valeur `amount` (Pénombre). */
  | 'camouflage';

/**
 * Statut posé par un effet (SPEC.md §5 bis, §5.5). `turns` : sa durée, en tours du camp de l'unité touchée (le tour en
 * cours ne compte pas) ; 0 = jusqu'à son prochain tour (il dure le reste du tour en cours).
 */
export type StatusSpec =
  | { readonly kind: 'stun' | 'immobilise' | 'requiem'; readonly turns: number }
  | { readonly kind: 'slow' | 'burn' | 'camouflage'; readonly amount: number; readonly turns: number };

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
  /** Adjacent au monstre source : une des 8 cases autour (§10). */
  | { readonly type: 'adjacent' }
  /** En ligne droite orthogonale depuis le monstre source, avec la même ligne de vue qu'une attaque. */
  | { readonly type: 'line'; readonly range: number }
  /** À `steps` pas au plus d'un des monstres du joueur : chemin en L possible, sans ligne de vue (§10). */
  | { readonly type: 'nearOwnMonster'; readonly steps: number }
  /** N'importe où sur le plateau. */
  | { readonly type: 'anywhere' };

/**
 * Zone autour du monstre source (SPEC.md §5.3) : la rangée des 3 cases devant lui (la case devant et ses deux voisines
 * de côté, « devant » = le sens où il regarde), ses 8 cases adjacentes (diagonales comprises), les 3 cases en ligne
 * dans une direction choisie par le joueur (`line3`, la source se tourne vers elle), ou les cases adjacentes et les
 * cases adjacentes à celles-ci (`adjacent2`, rayon 2).
 */
export type AreaZone = 'front3' | 'adjacent' | 'line3' | 'adjacent2';

/** Ce que vise un effet (SPEC.md §5.3). */
export type Targeting =
  /** Un monstre choisi par le joueur : jamais un terrain (§10) ; d'une famille, s'il y en a une (« un allié bodybuilder »). */
  | { readonly type: 'monster'; readonly side: 'ally' | 'enemy'; readonly reach: TargetReach; readonly archetype?: Archetype }
  /** Tous les monstres ennemis de la zone (jamais un monstre invisible pour le lanceur) ; jouable si au moins un. */
  | { readonly type: 'zone'; readonly zone: AreaZone }
  /** Une case adjacente jouable, sans unité (pose de piège). */
  | { readonly type: 'emptyAdjacentCell' }
  /** Le monstre source lui-même (évolution, Dopage). */
  | { readonly type: 'self' }
  /** Une case jouable sans unité ni case brûlée, dans une zone autour de la source (Lutin brasier : rayon 2). */
  | { readonly type: 'emptyCell'; readonly zone: 'adjacent2' }
  /** Tous ses monstres d'une famille, sans choix (Pénombre) ; jouable s'il en a au moins un. */
  | { readonly type: 'allies'; readonly archetype: Archetype }
  /** Tous les monstres ennemis qu'il voit, sans choix (Piège temporel) ; jouable s'il y en a au moins un. */
  | { readonly type: 'enemies' }
  /** Une case libre où la source a été pendant ce tour, sa case de départ comprise (retour, Explorateur du temps). */
  | { readonly type: 'trail' };

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
  /** ATK supplémentaire, pour ce tour (Dopage). */
  | { readonly type: 'addAtkThisTurn'; readonly amount: number }
  /** Portée supplémentaire, pour ce tour (Flèche divine). */
  | { readonly type: 'addRangeThisTurn'; readonly amount: number }
  /** ATK du moment (bonus du tour compris, auras non comprises) multipliée, pour ce tour (Seringue). */
  | { readonly type: 'multiplyAtkThisTurn'; readonly multiplier: number }
  /** Bonus définitif ; `hp` augmente à la fois les PV actuels et les PV max. */
  | { readonly type: 'addStats'; readonly atk: number; readonly hp: number }
  /**
   * Piège la case visée, cachée pour l'adversaire, jusqu'au prochain tour du poseur : `effects` s'appliquent au monstre
   * ennemi qui y entre (§10).
   */
  | { readonly type: 'placeTrap'; readonly effects: readonly TrapEffect[] }
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
  | { readonly type: 'evolve' }
  /**
   * Invocation (Invocateur) : un monstre de son grimoire, choisi par le joueur, est invoqué sur la case visée en payant
   * aussi son coût ; il peut agir aussitôt (§4.5).
   */
  | { readonly type: 'summon' }
  /**
   * Téléportation (Téléporteur) : le monstre visé est posé sur une case adjacente libre de la source, choisie par le
   * joueur. Ce n'est pas un déplacement : il garde sa mobilité, son attaque et son orientation ; rien ne se déclenche sur la case.
   */
  | { readonly type: 'teleport' }
  /**
   * Retour (Explorateur du temps) : la source se téléporte sur la case visée, une case où elle a été ce tour (rien ne s'y
   * déclenche) ; elle garde son attaque, mais ne se déplace plus ce tour.
   */
  | { readonly type: 'returnOnTrail' }
  /**
   * Remonte N cases (piège de la Chronomancienne) : le monstre revient de `steps` cases en arrière sur son chemin (les
   * cases où il a été depuis le début du tour de son camp), en téléportation ; son déplacement s'arrête, sans plus de
   * mobilité ce tour.
   */
  | { readonly type: 'rewind'; readonly steps: number };

/** Effets possibles d'un piège, ou d'un terrain « Passage », sur le monstre qui entre sur sa case ou dans sa zone. */
export type TrapEffect = Extract<Effect, { readonly type: 'damage' | 'status' | 'rewind' }>;

/**
 * « Passage » (SPEC.md §5.2) : quand un monstre ennemi entre sur une case de la zone du terrain (ses 8 cases
 * adjacentes), il subit `effects` : à chaque case en marchant, une fois par recul.
 */
export interface TerrainPassage {
  readonly zone: 'adjacent';
  readonly effects: readonly TrapEffect[];
}

/** Un effet complet (SPEC.md §5.2) : sa cible ou sa zone, puis ses effets. */
export interface Ability {
  /** Nom de l'effet, s'il en a un (« Déflagration »), sans effet de règle. */
  readonly name?: string;
  readonly targeting: Targeting;
  readonly effects: readonly Effect[];
}

/** Effet actif d'un monstre : chacun une fois par tour, en payant `manaCost`. */
export interface ActivatedAbility extends Ability {
  readonly manaCost: number;
}

interface CardBase {
  readonly id: CardId;
  /** Nom affiché ; une carte de deck s'écrit « Nom - Archétype » (« Apprenti - Sorciers du feu »). */
  readonly name: string;
  readonly cost: number;
  /** Texte d'ambiance, sans effet de règle (Maître des heures). */
  readonly flavor?: string;
}

/** Effet sur ses monstres d'une famille, dans une zone autour de la source (pas la source elle-même). */
export interface AllyZoneEffect {
  readonly zone: 'adjacent';
  readonly archetype: Archetype;
  readonly effects: readonly Effect[];
}

/**
 * Aura (SPEC.md §5.2) : +`atk` ATK, +`hp` PV, +`mobility` mobilité à ses monstres d'une famille autour de la source,
 * tant qu'ils y sont (§10 pour les PV et la mobilité).
 */
export interface StatAura {
  readonly zone: 'adjacent';
  readonly archetype: Archetype;
  readonly atk: number;
  readonly hp: number;
  readonly mobility: number;
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
}

export type Card = MonsterCard | SpellCard | TerrainCard;

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
  /** Mobilité retirée pour ce tour par slow (Givre, Terrain piégé…) ; recalculée au début de son tour. */
  readonly froze: number;
  /** Mobilité ajoutée pour ce tour (Charge) ; remise à 0 au début de son tour. */
  readonly boost: number;
  /** Les bonus du tour (`atkBonus`, `rangeBonus`, `boost`), par source : pour dire d'où ils viennent. */
  readonly turnBonuses: readonly TurnBonus[];
  readonly hasAttacked: boolean;
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
}

export interface TerrainUnit extends UnitBase {
  readonly kind: 'terrain';
}

export type Unit = MonsterUnit | TerrainUnit;

// ---------------------------------------------------------------------------
// État de la partie
// ---------------------------------------------------------------------------

export interface PlayerState {
  readonly id: PlayerId;
  readonly mana: number;
  /** Points de victoire. */
  readonly vp: number;
  /** Cartes encore disponibles (information cachée pour l'adversaire). */
  readonly grimoire: readonly CardId[];
  /**
   * Cimetière, public (§4.3) : sorts lancés, monstres et terrains qui ont quitté le plateau (détruits, sacrifiés, tués
   * par requiem). Un monstre ou un terrain posé quitte le grimoire sans y aller.
   */
  readonly graveyard: readonly CardId[];
  /**
   * Exemplaires brillants encore dans son grimoire (purement visuel) : une carte jouée l'est d'abord dans un exemplaire
   * brillant, s'il en reste. Absent : aucun.
   */
  readonly shiny?: readonly CardId[];
}

export interface GameState {
  readonly board: Board;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly activePlayer: PlayerId;
  /** Numéro du tour : 1 = premier tour de J1, 2 = premier tour de J2, etc. */
  readonly turn: number;
  readonly units: Readonly<Record<UnitId, Unit>>;
  /** Pièges posés : chacun n'est visible que de son propriétaire. */
  readonly traps: readonly Trap[];
  /** Cases brûlées (Lutin brasier) : publiques. */
  readonly burningCells: readonly BurningCell[];
  /** Compteur pour générer des `UnitId` de façon déterministe. */
  readonly nextUnitId: number;
  readonly winner: PlayerId | null;
  /** Événements de la dernière action, dans l'ordre (pour les animations) ; vidés au début de chaque action. */
  readonly events: readonly GameEvent[];
}

/** Cause d'une perte de PV. */
export type DamageCause = 'attack' | 'riposte' | 'trap' | 'passage' | 'effect' | 'spell' | 'burn';

/**
 * Ce qui s'est passé pendant une action, dans l'ordre. `pos` est toujours la case concernée au moment de l'événement.
 * L'interface les rejoue en animation ; `getPlayerView` retire ceux que le joueur n'a pas le droit de voir.
 */
export type GameEvent =
  | { readonly type: 'turnStart'; readonly player: PlayerId; readonly turn: number }
  /** Gain (positif) ou dépense (négative) de mana ; `pos` : la mana zone d'où il vient, s'il y en a une. */
  | { readonly type: 'mana'; readonly player: PlayerId; readonly amount: number; readonly pos: Position | null }
  /** Gain de VP ; `pos` : la mana zone tenue ou la case du monstre détruit, s'il y en a une. */
  | { readonly type: 'vp'; readonly player: PlayerId; readonly amount: number; readonly pos: Position | null }
  /** Carte jouée depuis le grimoire, vers une case (invocation, terrain) ou un monstre (sort). */
  | { readonly type: 'cardPlayed'; readonly player: PlayerId; readonly cardId: CardId; readonly pos: Position }
  /** Unité posée (monstre invoqué ou terrain). */
  | { readonly type: 'summon'; readonly unit: Unit }
  /**
   * Effet activé d'un monstre, vers un monstre (`pos` : sa case) ; pour un piège, `pos` est la case du poseur.
   * `cells` : la zone touchée par un effet de zone (vide sinon).
   */
  | {
      readonly type: 'effect';
      readonly unitId: UnitId;
      readonly pos: Position;
      readonly cells: readonly Position[];
      /** Direction choisie pour une zone en ligne : la source se tourne vers elle. */
      readonly facing?: Direction;
      /** Rang de l'effet sur la carte (0 si absent : le premier). */
      readonly effect?: number;
    }
  /** Monstre sacrifié pour une évolution : il quitte le plateau, sans être détruit (pas de VP). */
  | { readonly type: 'sacrifice'; readonly unitId: UnitId; readonly pos: Position }
  /** Un pas d'une case : déplacement, avancée après une attaque, ou recul (Bourrasque). */
  | {
      readonly type: 'step';
      readonly unitId: UnitId;
      readonly from: Position;
      readonly to: Position;
      readonly kind: 'walk' | 'advance' | 'push';
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
      readonly targetId: UnitId;
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
  | { readonly type: 'mobility'; readonly unitId: UnitId; readonly pos: Position; readonly amount: number }
  | { readonly type: 'status'; readonly unitId: UnitId; readonly pos: Position; readonly status: Status }
  | { readonly type: 'trapPlaced'; readonly trap: Trap }
  | { readonly type: 'trapTriggered'; readonly trap: Trap; readonly unitId: UnitId }
  /** Monstre invisible révélé pour avoir bloqué une action (§10). */
  | { readonly type: 'revealed'; readonly unit: MonsterUnit };

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
}

/** Deck pré-construit, choisi avant la partie (pas de deckbuilding). */
export interface Deck {
  readonly id: string;
  readonly name: string;
  readonly cards: readonly CardId[];
  /** Exemplaires brillants parmi ses cartes (purement visuel, handoff V11). */
  readonly shiny?: readonly CardId[];
}

/** Plateau et unités : informations publiques, communes à `GameState` et `PlayerView`. */
export type BoardState = Pick<GameState, 'board' | 'units'>;

// ---------------------------------------------------------------------------
// Vue d'un joueur (SPEC.md §2, §4.3) : tout ce que l'UI a le droit d'afficher
// ---------------------------------------------------------------------------

/** Ce qu'un joueur sait de son adversaire : tout, sauf le contenu de son grimoire. */
export interface OpponentView {
  readonly id: PlayerId;
  readonly mana: number;
  readonly vp: number;
  readonly graveyard: readonly CardId[];
  readonly grimoireCount: number;
}

export interface PlayerView {
  /** Le joueur à qui cette vue est destinée. */
  readonly viewer: PlayerId;
  readonly board: Board;
  readonly units: Readonly<Record<UnitId, Unit>>;
  readonly activePlayer: PlayerId;
  readonly turn: number;
  readonly winner: PlayerId | null;
  readonly me: PlayerState;
  readonly opponent: OpponentView;
  /** Ses propres pièges seulement : ceux de l'adversaire sont cachés. */
  readonly traps: readonly Trap[];
  /** Toutes les cases brûlées : elles sont publiques. */
  readonly burningCells: readonly BurningCell[];
  /** Ses monstres `invisible` que l'adversaire ne voit pas en ce moment. */
  readonly hiddenFromOpponent: readonly UnitId[];
  /**
   * Monstres adverses présents sur le plateau mais invisibles pour lui (absents de `units`) : seule leur existence
   * est connue, pas leur case. Sert à ne pas prendre pour une destruction un monstre qui disparaît de la vue.
   */
  readonly hiddenEnemies: readonly UnitId[];
  /** Contrôle des mana zones : public, même quand l'occupant est invisible. */
  readonly zoneControl: readonly { readonly pos: Position; readonly controller: PlayerId | null }[];
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
  /** `effect` : rang de l'effet actif sur la carte (absent : le premier). */
  | { readonly type: 'activateEffect'; readonly unitId: UnitId; readonly effect?: number; readonly target: EffectTarget }
  | { readonly type: 'endTurn' };
