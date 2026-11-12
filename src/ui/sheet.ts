// Fiche (handoff V8, lot 9 ; refonte « plein cadre » du 2026-11-11) : ce que la carte fait, rien de plus. Construite à
// partir de la vue du joueur : elle ne montre que ce qu'il a le droit de voir (ses propres pièges, rien du grimoire
// adverse). Dans l'ordre : type, stats (du moment, bonus et malus en pastille), effet passif (ambre), effets actifs
// (violet). Ce que l'unité peut encore faire ce tour, ses statuts et les effets en cours ne sont plus sur la carte
// (validé le 2026-11-11) : ils sont au jeton (`unitTip.ts`), et la raison d'une carte injouable dans le grimoire.
import {
  MANA_PER_CONTROLLED_ZONE,
  MANA_ZONE_NAMES,
  VP_PER_CONTROLLED_ZONE,
  auraMobility,
  canMove,
  cardAvailability,
  getAtk,
  getCard,
  getCell,
  getEffectReach,
  getMonsterCard,
  getOnMoveBonus,
  getRange,
  getUnitsAt,
  getViewZoneStatus,
  getZoneMana,
  getZoneOf,
  samePos,
} from '../engine';
import type {
  Availability,
  BurningCell,
  Card,
  CardId,
  CardSet,
  ManaZoneId,
  MonsterCard,
  MonsterUnit,
  PlayerId,
  PlayerView,
  Position,
  TerrainUnit,
  Trap,
  UnitId,
  UnavailableReason,
} from '../engine';
import {
  ARCHETYPE_NAMES,
  cardTitle,
  effectName,
  effectText,
  splitCardName,
  trapLabel,
} from './cardText';
import type { IconName } from './Icon';
import { waterKind } from './iso/scenery';
import { pileOf } from './piles';
import type { PileKind } from './piles';
import { abilityRules, passiveRules } from './rulesText';

/**
 * Ce que montre la fiche : une case (zone, piège…), une unité du plateau, une carte du grimoire, ou un exemplaire des
 * cartes jouées ou du cimetière d'un joueur (`index` : son rang dans la liste du moteur, §10).
 */
export type HoverSubject =
  | { readonly kind: 'cell'; readonly pos: Position }
  | { readonly kind: 'unit'; readonly unitId: UnitId }
  | { readonly kind: 'card'; readonly cardId: CardId }
  | { readonly kind: 'copy'; readonly player: PlayerId; readonly pile: PileKind; readonly index: number };

/** Point coloré : vert (possible), orange (il manque quelque chose), gris (impossible), orangé (information). */
export type SheetTone = 'ok' | 'warn' | 'off' | 'info';

export interface SheetStatus {
  readonly text: string;
  readonly tone: SheetTone;
}

export interface SheetStat {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
  /** Bonus (> 0) ou malus (< 0) par rapport à la carte : en vert ou en rouge, avec une pastille « +2 » / « −1 ». */
  readonly delta: number;
  /** PV en rouge : blessé. */
  readonly hurt: boolean;
}

/** Ligne d'état : le contrôle d'une mana zone ; dans l'infobulle d'un jeton, l'attaque, un effet actif, la menace… */
export interface SheetLine {
  readonly icon: IconName;
  readonly label: string;
  readonly status: SheetStatus;
}

export interface SheetPassive {
  /** Mots-clés et passifs : « **Riposte** · texte » (sans nom pour la règle d'un terrain) ; textes balisés (`rulesSegments`). */
  readonly items: readonly { readonly name: string; readonly text: string }[];
}

export interface SheetActive {
  /** Nom de l'effet (« Déflagration »), s'il en a un. */
  readonly name: string | null;
  /** Coût en mana de l'effet d'un monstre ; `null` pour un sort (son coût est en haut de la fiche). */
  readonly cost: number | null;
  readonly text: string;
  /** Portée de l'effet d'un monstre du plateau, montrée sur le plateau au survol du bloc. */
  readonly reach?: readonly Position[];
}

/** Couleur d'une puce « Effets en cours », selon ce qui la cause. */
export type ChipKind = 'frost' | 'burn' | 'boost' | 'zone' | 'terrain' | 'warn' | 'info';

/** Groupe d'une puce : les statuts (stun, slow, burn…) à part des autres effets qui touchent l'unité. */
export type ChipGroup = 'status' | 'effect';

/** Une puce : le nom du statut ou de l'effet (lexique), le détail au survol. */
export interface SheetChip {
  readonly icon: IconName;
  readonly text: string;
  readonly detail: string;
  readonly kind: ChipKind;
  readonly group: ChipGroup;
  /** Statut : les tours qu'il lui reste à durer (« · 1 tour »), 0 : jusqu'à son prochain tour ; absent sinon. */
  readonly turns?: number;
}

export interface SheetData {
  readonly title: string;
  /** Archétype d'une carte de deck (« Sorciers du feu »), sous le nom ; vide sinon. */
  readonly archetype: string;
  /** Texte d'ambiance de la carte, s'il y en a un. */
  readonly flavor: string | null;
  readonly cost: number | null;
  /** Couleur du cadre : un joueur, ou un type de case. */
  readonly frame: PlayerId | 'card' | 'zone' | 'blocked' | 'trap';
  /** Type de la carte (rayures rubis, saphir ou émeraude sans illustration) ; `null` pour une case, un piège. */
  readonly kind: Card['kind'] | null;
  /**
   * Illustration : celle de la carte, aux couleurs de son propriétaire s'il y en a un. Une fiche illustrée (monstre,
   * terrain, carte) a la taille fixe d'une carte ; les autres (zone, piège, case) prennent la hauteur de leur texte.
   */
  readonly art: { readonly cardId: CardId; readonly owner: PlayerId | null } | null;
  /**
   * Exemplaire brillant (handoff V11) : l'unité, ou la carte du grimoire dont un exemplaire brillant reste (il sera
   * joué en premier). Cadre doré, reflets, badge « ★ Brillante ».
   */
  readonly shiny: boolean;
  readonly typeIcon: IconName | null;
  readonly type: string;
  readonly stats: readonly SheetStat[];
  /** Lignes d'état d'une case (contrôle d'une mana zone) ; jamais sur une carte. */
  readonly lines: readonly SheetLine[];
  readonly text: readonly string[];
  readonly passive: SheetPassive | null;
  /** Effets actifs, dans l'ordre de la carte. */
  readonly active: readonly SheetActive[];
}


/** Icône de chaque mana zone (puce « Tient … »). */
export const ZONE_ICONS: Readonly<Record<ManaZoneId, IconName>> = {
  ecurie: 'horseshoe',
  ferme: 'wheat',
  forge: 'anvil',
  scierie: 'circular-saw',
  mine: 'mining',
};

const empty = (name: string, frame: SheetData['frame'], type: string): SheetData => ({
  ...splitCardName(name),
  flavor: null,
  cost: null,
  frame,
  kind: null,
  art: null,
  shiny: false,
  typeIcon: null,
  type,
  stats: [],
  lines: [],
  text: [],
  passive: null,
  active: [],
});

const stat = (icon: IconName, label: string, value: number | string, delta = 0, hurt = false): SheetStat => ({
  icon,
  label,
  value: String(value),
  delta,
  hurt,
});

/** Mots-clés et passifs d'une carte (monstre ou terrain) : nom (« Entrave 1 »), puis sa règle en phrase (`rulesText.ts`). */
const keywordItems = (card: Card): SheetPassive['items'] => passiveRules(card);
const terrainItems = keywordItems;

/** « · Bodybuilder » après le type d'un monstre d'une famille (§5.1). */
const familySuffix = (card: Card) => (card.kind === 'monster' && card.archetype ? ` · ${ARCHETYPE_NAMES[card.archetype].title}` : '');

/** Nom d'un effet actif : le sien, ou celui tiré de ses effets quand le monstre en a plusieurs ; `null` sinon. */
export const activeName = (card: MonsterCard, rank: number): string | null => {
  const ability = card.activated[rank]!;
  return ability.name ?? (card.activated.length > 1 ? effectName(ability) : null);
};

/** Un bloc par effet actif ; `monster` : le monstre du plateau, dont la portée de chaque effet se montre au survol. */
function activeBlocks(cards: CardSet, card: MonsterCard, monster?: { view: PlayerView; unit: MonsterUnit }): SheetActive[] {
  return card.activated.map((ability, i) => ({
    name: activeName(card, i),
    cost: ability.manaCost,
    text: abilityRules(cards, ability),
    ...(monster ? { reach: getEffectReach(monster.view, ability, monster.unit.owner, monster.unit) } : {}),
  }));
}

export const OK: SheetStatus = { text: 'Disponible', tone: 'ok' };

/** Pourquoi ce n'est pas possible, en mots ; `missing` : la cible qui manque, dite selon ce qu'on essaie de faire. */
export function reasonStatus(reason: UnavailableReason, used: string): SheetStatus {
  switch (reason.kind) {
    case 'notYourTurn':
      return { text: 'Pas ton tour', tone: 'off' };
    case 'noCopy':
      return { text: 'Plus d’exemplaire', tone: 'off' };
    case 'mana':
      return { text: `Mana insuffisant · il te manque ${reason.missing}`, tone: 'warn' };
    case 'alreadyUsed':
      return { text: used, tone: 'off' };
    case 'stunned':
      return { text: 'Stun : aucune action ce tour', tone: 'off' };
    case 'silenced':
      return { text: 'Silence : plus d’effet actif', tone: 'off' };
    case 'disarmed':
      return { text: 'Désarmé : ne peut pas attaquer', tone: 'off' };
    case 'armed':
      return { text: 'Déjà armé : attaque d’abord', tone: 'off' };
    case 'noAttack':
      return { text: 'Plus d’attaque ce tour', tone: 'off' };
    case 'justSummoned':
      return { text: 'Arrivé ce tour : au prochain tour', tone: 'off' };
    case 'manaLimit':
      return { text: 'Déjà à la limite de mana', tone: 'off' };
    case 'noTarget':
      switch (reason.target) {
        case 'summonZone':
          return { text: 'Zone d’invocation pleine', tone: 'warn' };
        case 'manaZone':
          return { text: 'Aucune mana zone tenue', tone: 'warn' };
        case 'cell':
          return { text: 'Aucune case libre à portée', tone: 'off' };
        case 'monster':
          return { text: 'Aucune cible à portée', tone: 'off' };
        case 'evolution':
          return { text: 'Aucune carte d’évolution dans le grimoire', tone: 'off' };
        case 'summonCard':
          return { text: 'Aucun monstre que tu peux payer', tone: 'warn' };
        case 'trail':
          return { text: 'Aucune case où revenir : il n’a pas bougé ce tour', tone: 'off' };
        case 'terrain':
          return { text: 'Aucun de tes terrains sur le plateau', tone: 'off' };
        case 'graveyard':
          return { text: 'Aucun monstre dans ton cimetière', tone: 'off' };
        case 'malus':
          return { text: 'Aucun allié n’a de malus', tone: 'off' };
      }
  }
}

export const availabilityStatus = (availability: Availability, used: string): SheetStatus =>
  availability.ok ? OK : reasonStatus(availability.reason, used);

export function getSheet(view: PlayerView, subject: HoverSubject): SheetData | null {
  switch (subject.kind) {
    case 'card':
      return cardSheet(view, subject.cardId);
    case 'copy': {
      // La carte seule (§10) : comme dans le grimoire, sans la ligne pour la jouer ; brillante si l'exemplaire l'était.
      const copy = pileOf(view, subject.player, subject.pile)[subject.index];
      return copy ? cardSheetOf(view.cards, copy.cardId, copy.shiny === true) : null;
    }
    case 'cell':
      return cellSheet(view, subject.pos);
    case 'unit': {
      const unit = view.units[subject.unitId];
      if (!unit) return null;
      return unit.kind === 'monster' ? monsterSheet(view, unit) : terrainSheet(view, unit);
    }
  }
}

/** Ce que la fiche montre pour une case du plateau : l'unité qui s'y trouve (le monstre avant le terrain), sinon la case. */
export function subjectAt(view: PlayerView, pos: Position): HoverSubject {
  const units = getUnitsAt(view, pos);
  const unit = units.find((u) => u.kind === 'monster') ?? units[0];
  return unit ? { kind: 'unit', unitId: unit.id } : { kind: 'cell', pos };
}

/** Le même élément (même unité, même case, même carte). */
export function sameSubject(a: HoverSubject | null, b: HoverSubject | null): boolean {
  if (!a || !b) return a === b;
  switch (a.kind) {
    case 'unit':
      return b.kind === 'unit' && a.unitId === b.unitId;
    case 'card':
      return b.kind === 'card' && a.cardId === b.cardId;
    case 'copy':
      return b.kind === 'copy' && a.player === b.player && a.pile === b.pile && a.index === b.index;
    case 'cell':
      return b.kind === 'cell' && samePos(a.pos, b.pos);
  }
}

/** La fiche d'une carte seule, hors du plateau (cartes jouées, cimetière, page des decks) : sans ligne pour la jouer. */
export function cardSheetOf(cards: CardSet, cardId: CardId, shiny = false): SheetData {
  const card = getCard(cards, cardId);
  const base = {
    ...empty(card.name, 'card', ''),
    kind: card.kind,
    cost: card.cost,
    art: { cardId, owner: null },
    shiny,
    flavor: card.flavor ?? null,
  };

  switch (card.kind) {
    case 'monster': {
      return {
        ...base,
        typeIcon: 'dragon-head',
        type: `Carte monstre${familySuffix(card)}`,
        stats: [
          stat('broadsword', 'ATK', card.atk),
          stat('hearts', 'PV', card.hp),
          stat('walking-boot', 'Mobilité', card.mobility),
          stat('high-shot', 'Portée', card.range),
        ],
        text: card.evolvesFrom ? [evolutionLine(cards, card.evolvesFrom)] : [],
        passive: passiveBlock(keywordItems(card)),
        active: activeBlocks(cards, card),
      };
    }
    case 'spell':
      return {
        ...base,
        typeIcon: 'spell-book',
        type: 'Carte sort · effet immédiat',
        active: [{ name: null, cost: null, text: abilityRules(cards, card.ability) }],
      };
    case 'terrain':
      return {
        ...base,
        typeIcon: 'castle',
        type: 'Carte terrain',
        stats: [stat('hearts', 'PV', card.hp)],
        text: ['Se pose sur une mana zone occupée par un de tes monstres.'],
        passive: passiveBlock(terrainItems(card)),
      };
    case 'beacon':
      return {
        ...base,
        typeIcon: 'eye',
        type: 'Carte balise',
        stats: [stat('hearts', 'PV', card.hp)],
        passive: passiveBlock(passiveRules(card)),
      };
  }
}

/**
 * Une carte du grimoire : sa fiche seule, brillante s'il en reste un exemplaire brillant. Si elle ne peut pas être jouée,
 * la raison est dans le grimoire, sous la carte (`cardReason`).
 */
function cardSheet(view: PlayerView, cardId: CardId): SheetData {
  return cardSheetOf(view.cards, cardId, view.me.shiny?.includes(cardId) ?? false);
}

/**
 * Pourquoi une carte du grimoire ne peut pas être jouée, écrit sous la carte (« Il te manque 3 mana », en orange), ou
 * `null` si elle peut l'être.
 */
export function cardReason(view: PlayerView, cardId: CardId): SheetStatus | null {
  const availability = cardAvailability(view, cardId);
  if (availability.ok) return null;
  const { reason } = availability;
  return reason.kind === 'mana' ? { text: `Il te manque ${reason.missing} mana`, tone: 'warn' } : reasonStatus(reason, 'Déjà joué');
}

const passiveBlock = (items: SheetPassive['items']): SheetPassive | null => (items.length > 0 ? { items } : null);

/** Règle d'une case X selon sa hauteur (SPEC.md §10). */
const BLOCKED_TEXTS = {
  normal: 'Infranchissable à pied (le vol la survole). Coupe aussi les tirs.',
  high: 'Infranchissable, même en volant. Coupe tous les tirs.',
  low: 'Infranchissable à pied (le vol la survole). Les tirs de portée 2 ou plus passent par-dessus.',
} as const;

function cellSheet(view: PlayerView, pos: Position): SheetData | null {
  const cell = getCell(view.board, pos);
  if (cell.kind === 'offBoard') return null;
  if (cell.kind === 'blocked') {
    // L'eau (rivière, étang) n'est qu'un rendu : mêmes règles qu'une case bloquée, selon sa hauteur (§10).
    const water = waterKind(view.board, pos);
    const height = cell.height === 'high' ? ' haute' : cell.height === 'low' ? ' basse' : '';
    const title = water === 'pond' ? 'Étang' : water ? 'Rivière' : `Case bloquée${height}`;
    return { ...empty(title, 'blocked', 'Obstacle'), text: [BLOCKED_TEXTS[cell.height ?? 'normal']] };
  }

  const units = getUnitsAt(view, pos);
  const monster = units.find((u): u is MonsterUnit => u.kind === 'monster');
  if (monster) return monsterSheet(view, monster);
  const terrain = units.find((u): u is TerrainUnit => u.kind === 'terrain');
  if (terrain) return terrainSheet(view, terrain);

  const burning = view.burningCells.find((c) => samePos(c.pos, pos));
  if (burning) return burningSheet(view, burning);

  if (cell.manaZone) return zoneSheet(view, cell.manaZone, pos);

  const trap = view.traps.find((t) => samePos(t.pos, pos));
  if (trap) return trapSheet(view.cards, trap);

  // Mode contestation : une case vide d'une zone de 9 cases montre sa zone (§4.4 bis).
  const area = getZoneOf(view.board, view.mode, pos);
  if (area) return zoneSheet(view, area.zone, area.pos);

  if (cell.summonZoneOf !== null) {
    const p = cell.summonZoneOf;
    return {
      ...empty(`Invocation J${p}`, p, 'Zone d’invocation'),
      text: [`Le Joueur ${p} y pose ses nouveaux monstres. L’occuper bloque ses invocations.`],
    };
  }
  return null;
}

/** Le mana qu'une zone tenue rapporte : rien sans terrain (§4.2). */
export const zoneIncome = (mana: number) => (mana > 0 ? `+${mana} mana` : 'pas de mana sans terrain');

/** Une mana zone : qui la tient (ou contestée, §4.4 bis) et ce qu'elle rapporte. */
function zoneSheet(view: PlayerView, zone: ManaZoneId, pos: Position): SheetData {
  const { controller, contested } = getViewZoneStatus(view, pos);
  const contest = view.mode === 'contestation';
  return {
    ...empty(MANA_ZONE_NAMES[zone], 'zone', contest ? 'Mana zone · 9 cases' : 'Mana zone'),
    typeIcon: ZONE_ICONS[zone],
    lines: [
      {
        icon: 'crown',
        label: 'Contrôle',
        status: contested
          ? { text: 'Contestée · personne', tone: 'warn' }
          : controller
            ? { text: `Joueur ${controller} · ${zoneIncome(getZoneMana(view, pos, controller))}`, tone: 'info' }
            : { text: 'Neutre · personne', tone: 'off' },
      },
    ],
    text: contest
      ? [
          `Le joueur qui a le plus de monstres dans ses 9 cases la tient ; un terrain la tient seul, quel que soit le nombre de monstres ennemis. Qui la tient gagne +${VP_PER_CONTROLLED_ZONE} VP au début de son tour, et +${MANA_PER_CONTROLLED_ZONE} mana s’il y a un terrain à lui.`,
          'À égalité (par exemple 1 contre 1), elle est contestée : ni mana ni VP pour personne, et aucun terrain ne s’y pose. On ne pose un terrain que dans une zone qu’on tient.',
        ]
      : [
          `Celui qui l’occupe (monstre, ou terrain seul) gagne +${VP_PER_CONTROLLED_ZONE} VP au début de son tour, et +${MANA_PER_CONTROLLED_ZONE} mana s’il y a un terrain dessus : un monstre seul ne génère pas de mana.`,
        ],
  };
}

/** Mobilité de base d'un monstre : sa carte et les auras. */
const baseMobility = (view: PlayerView, monster: MonsterUnit) =>
  getMonsterCard(view.cards, monster.cardId).mobility + auraMobility(view, monster);

function monsterSheet(view: PlayerView, monster: MonsterUnit): SheetData {
  const card = getMonsterCard(view.cards, monster.cardId);
  const mine = monster.owner === view.viewer;
  const myTurn = mine && view.activePlayer === view.viewer && view.winner === null;

  // Stats : ATK et portée du moment, PV (max compris les bonus), pas restants sur le maximum de ce tour.
  const atk = getAtk(view, monster);
  const range = getRange(view, monster);
  const base = baseMobility(view, monster);
  // Maximum de ce tour : moins les slow, plus la Charge ; rien s'il ne peut pas bouger. Le +1 d'un Terrain de chasse
  // qu'il aurait en partant d'ici compte déjà.
  const pending = myTurn ? getOnMoveBonus(view, monster) : 0;
  const max = Math.max(monster.mobilityLeft, canMove(monster) ? base - monster.froze + monster.boost : monster.boost) + pending;
  const stats = [
    stat('broadsword', 'ATK', atk, atk - card.atk),
    stat('hearts', 'PV', `${monster.hp}/${monster.maxHp}`, monster.maxHp - card.hp, monster.hp < monster.maxHp),
    myTurn
      ? stat('walking-boot', 'Pas rest.', `${monster.mobilityLeft + pending}/${max}`, max - card.mobility)
      : stat('walking-boot', 'Mobilité', base, base - card.mobility),
    stat('high-shot', 'Portée', range, range - card.range),
  ];

  return {
    ...empty(card.name, monster.owner, `Monstre${familySuffix(card)} · Joueur ${monster.owner}${mine ? '' : ' (adversaire)'}`),
    flavor: card.flavor ?? null,
    cost: card.cost,
    kind: 'monster',
    art: { cardId: card.id, owner: monster.owner },
    shiny: monster.shiny === true,
    typeIcon: 'dragon-head',
    stats,
    passive: passiveBlock(keywordItems(card)),
    active: activeBlocks(view.cards, card, { view, unit: monster }),
  };
}

function terrainSheet(view: PlayerView, terrain: TerrainUnit): SheetData {
  const card = getCard(view.cards, terrain.cardId);
  return {
    ...empty(card.name, terrain.owner, `Terrain · Joueur ${terrain.owner}`),
    kind: 'terrain',
    cost: card.cost,
    art: { cardId: card.id, owner: terrain.owner },
    shiny: terrain.shiny === true,
    typeIcon: 'castle',
    stats: [stat('hearts', 'PV', `${terrain.hp}/${terrain.maxHp}`, 0, terrain.hp < terrain.maxHp)],
    passive: passiveBlock(terrainItems(card)),
  };
}

/** Case brûlée (Lutin brasier) : publique ; ce qu'elle inflige et combien de temps elle dure (§10). */
function burningSheet(view: PlayerView, cell: BurningCell): SheetData {
  const what = cell.effects.map((effect) => effectText(view.cards, effect)).join(' + ');
  // Tours de son camp où elle brûle encore, le tour en cours compris s'il est le sien.
  const mine = cell.owner === view.activePlayer;
  const left = Math.max(1, Math.ceil((cell.expiresAtTurn - (mine ? view.turn : view.turn + 1)) / 2));
  const until = mine
    ? left === 1
      ? 'jusqu’à la fin de ce tour'
      : `jusqu’à la fin de ce tour et ${left === 2 ? 'du prochain tour' : `des ${left - 1} prochains tours`} de J${cell.owner}`
    : left === 1
      ? `jusqu’à la fin du prochain tour de J${cell.owner}`
      : `jusqu’à la fin du ${left}e prochain tour de J${cell.owner}`;
  return {
    ...empty('Case brûlée', cell.owner, `Brûlée par ${getCard(view.cards, cell.cardId).name} · Joueur ${cell.owner}`),
    typeIcon: 'flame',
    text: [`Chaque monstre ennemi qui y entre subit : ${what}. La case reste.`, `Elle brûle ${until}.`],
  };
}

function trapSheet(cards: CardSet, trap: Trap): SheetData {
  const what = trap.effects.map((effect) => effectText(cards, effect)).join(' + ');
  return {
    ...empty(`Ton piège · ${trapLabel(trap)}`, 'trap', 'Piège caché · visible par toi seul'),
    text: [`Posé par ${getCard(cards, trap.cardId).name}. L’ennemi qui entre ici subit : ${what}.`, 'Disparaît au début de ton prochain tour.'],
  };
}

/** Une carte qui peut aussi arriver par l'évolution d'un autre monstre (dragons élémentaires). */
function evolutionLine(cards: CardSet, from: CardId): string {
  const source = getMonsterCard(cards, from);
  const evolve = source.activated.find((ability) => ability.effects.some((effect) => effect.type === 'evolve'));
  const cost = evolve ? ` (${evolve.manaCost} mana)` : '';
  return `Ou par l’effet ${evolve?.name ?? 'actif'} d’un ${cardTitle(cards, from)}${cost} : il apparaît à sa place, sans payer ce coût, et n’agit qu’au tour suivant.`;
}
