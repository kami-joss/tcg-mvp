// Fiche (handoff V8, lot 9) : ce que la carte fait, et ce qu'elle peut faire maintenant. Construite à partir de la vue
// du joueur : elle ne montre que ce qu'il a le droit de voir (ses propres pièges, rien du grimoire adverse).
// Dans l'ordre : type, stats (bonus et malus en pastille), lignes de disponibilité, effet passif (ambre), effet actif
// (violet), puis « Effets en cours » en bas (statuts, bonus du tour, zone tenue…).
import {
  MANA_PER_CONTROLLED_ZONE,
  MANA_ZONE_NAMES,
  VP_PER_CONTROLLED_ZONE,
  attackAvailability,
  auraAtk,
  auraHp,
  auraMobility,
  auraSources,
  canMove,
  cardAvailability,
  effectAvailability,
  getAtk,
  getCard,
  getCell,
  getMonsterCard,
  getNextTurnMobility,
  getRange,
  getUnitsAt,
  getViewZoneController,
  getZoneMana,
  ownerNextTurn,
  samePos,
  statusTurnsLeft,
} from '../engine';
import type {
  Availability,
  BurningCell,
  Card,
  CardId,
  ManaZoneId,
  MonsterCard,
  EffectSource,
  MonsterUnit,
  TurnBonus,
  PlayerId,
  PlayerView,
  Position,
  Status,
  TerrainUnit,
  Trap,
  Unit,
  UnitId,
  UnavailableReason,
} from '../engine';
import {
  ARCHETYPE_NAMES,
  auraBonusText,
  cardTitle,
  effectName,
  durationText,
  effectText,
  splitCardName,
  trapLabel,
} from './cardText';
import type { IconName } from './Icon';
import { waterKind } from './iso/scenery';
import { STATUS_ICONS } from './zoneMarks';
import { abilityRules, passiveRules } from './rulesText';

/** Ce que montre la fiche : une case (zone, piège…), une unité du plateau, une carte du grimoire. */
export type HoverSubject =
  | { readonly kind: 'cell'; readonly pos: Position }
  | { readonly kind: 'unit'; readonly unitId: UnitId }
  | { readonly kind: 'card'; readonly cardId: CardId };

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

/** Ligne de disponibilité : l'attaque, l'invocation, la menace d'un monstre adverse… */
export interface SheetLine {
  readonly icon: IconName;
  readonly label: string;
  readonly status: SheetStatus;
}

export interface SheetPassive {
  /** Mots-clés et passifs : « **Riposte** · texte » (sans nom pour la règle d'un terrain) ; textes balisés (`rulesSegments`). */
  readonly items: readonly { readonly name: string; readonly text: string }[];
  /** Riposte prête ou utilisée. */
  readonly foot: SheetStatus | null;
}

export interface SheetActive {
  /** Nom de l'effet (« Déflagration »), s'il en a un. */
  readonly name: string | null;
  /** Coût en mana de l'effet d'un monstre ; `null` pour un sort (son coût est en haut de la fiche). */
  readonly cost: number | null;
  readonly text: string;
  readonly foot: SheetStatus | null;
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
  readonly lines: readonly SheetLine[];
  readonly text: readonly string[];
  readonly passive: SheetPassive | null;
  /** Effets actifs, dans l'ordre de la carte. */
  readonly active: readonly SheetActive[];
  /** Effets en cours ; `null` : pas de pied (cases, cartes du grimoire). */
  readonly status: readonly SheetChip[] | null;
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
  status: null,
});

const stat = (icon: IconName, label: string, value: number | string, delta = 0, hurt = false): SheetStat => ({
  icon,
  label,
  value: String(value),
  delta,
  hurt,
});

/** Mots-clés et passifs d'une carte (monstre ou terrain) : nom (« Givre 1 »), puis sa règle en phrase (`rulesText.ts`). */
const keywordItems = (card: Card): SheetPassive['items'] => passiveRules(card);
const terrainItems = keywordItems;

/** « · Bodybuilder » après le type d'un monstre d'une famille (§5.1). */
const familySuffix = (card: Card) => (card.kind === 'monster' && card.archetype ? ` · ${ARCHETYPE_NAMES[card.archetype].title}` : '');

const hasRiposte = (card: MonsterCard) => card.keywords.some((spec) => spec.keyword === 'riposte');

/** Un bloc par effet actif ; `foot` : sa disponibilité (sur le plateau, pendant son tour), par rang d'effet. */
function activeBlocks(card: MonsterCard, foot: (effect: number) => SheetStatus | null = () => null): SheetActive[] {
  return card.activated.map((ability, i) => ({
    name: ability.name ?? (card.activated.length > 1 ? effectName(ability) : null),
    cost: ability.manaCost,
    text: abilityRules(ability),
    foot: foot(i),
  }));
}

const OK: SheetStatus = { text: 'Disponible', tone: 'ok' };

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
    case 'justSummoned':
      return { text: 'Arrivé ce tour : au prochain tour', tone: 'off' };
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
      }
  }
}

const availabilityStatus = (availability: Availability, used: string): SheetStatus =>
  availability.ok ? OK : reasonStatus(availability.reason, used);

export function getSheet(view: PlayerView, subject: HoverSubject): SheetData | null {
  switch (subject.kind) {
    case 'card':
      return cardSheet(view, subject.cardId);
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
    case 'cell':
      return b.kind === 'cell' && samePos(a.pos, b.pos);
  }
}

/** Bonus de mobilité du plateau (13 × 13), pour tous les monstres. */
/** Puce du bonus du plateau (Champ de bataille) : son nom, le bonus au survol. */
const boardChip = (view: PlayerView): SheetChip => ({
  icon: 'walking-boot',
  text: view.board.name,
  detail: `Plateau : +${view.board.mobilityBonus} mobilité pour tous les monstres`,
  kind: 'boost',
  group: 'effect',
});

const CARD_VERBS: Readonly<Record<Card['kind'], string>> = { monster: 'Invocation', spell: 'Lancer', terrain: 'Poser' };

function cardSheet(view: PlayerView, cardId: CardId): SheetData {
  const card = getCard(cardId);
  const base = {
    ...empty(card.name, 'card', ''),
    kind: card.kind,
    cost: card.cost,
    art: { cardId, owner: null },
    shiny: view.me.shiny?.includes(cardId) ?? false,
    flavor: card.flavor ?? null,
  };
    const lines: SheetLine[] = [
    { icon: 'card-play', label: CARD_VERBS[card.kind], status: availabilityStatus(cardAvailability(view, cardId), 'Déjà joué') },
  ];

  switch (card.kind) {
    case 'monster': {
      const bonus = view.board.mobilityBonus;
      return {
        ...base,
        typeIcon: 'dragon-head',
        type: `Carte monstre${familySuffix(card)}`,
        stats: [
          stat('broadsword', 'ATK', card.atk),
          stat('hearts', 'PV', card.hp),
          stat('walking-boot', 'Mobilité', card.mobility + bonus, bonus),
          stat('high-shot', 'Portée', card.range),
        ],
        lines,
        text: card.evolvesFrom ? [evolutionLine(card.evolvesFrom)] : [],
        passive: passiveBlock(keywordItems(card), null),
        active: activeBlocks(card),
        // Le bonus du plateau le suivra dès qu'il sera posé.
        status: bonus > 0 ? [boardChip(view)] : null,
      };
    }
    case 'spell':
      return {
        ...base,
        typeIcon: 'spell-book',
        type: 'Carte sort · effet immédiat',
        lines,
        active: [{ name: null, cost: null, text: abilityRules(card.ability), foot: null }],
      };
    case 'terrain':
      return {
        ...base,
        typeIcon: 'castle',
        type: 'Carte terrain',
        stats: [stat('hearts', 'PV', card.hp)],
        lines,
        text: ['Se pose sur une mana zone occupée par un de tes monstres.'],
        passive: passiveBlock(terrainItems(card), null),
      };
  }
}

const passiveBlock = (items: SheetPassive['items'], foot: SheetStatus | null): SheetPassive | null =>
  items.length > 0 ? { items, foot } : null;

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

  if (cell.manaZone) {
    const controller = getViewZoneController(view, pos);
    return {
      ...empty(MANA_ZONE_NAMES[cell.manaZone], 'zone', 'Mana zone'),
      typeIcon: ZONE_ICONS[cell.manaZone],
      lines: [
        {
          icon: 'laurels',
          label: 'Contrôle',
          status: controller ? { text: `Joueur ${controller}`, tone: 'info' } : { text: 'Neutre · personne', tone: 'off' },
        },
      ],
      text: [
        `Celui qui l’occupe (monstre, ou terrain seul) gagne +${MANA_PER_CONTROLLED_ZONE} mana et +${VP_PER_CONTROLLED_ZONE} VP au début de son tour.`,
      ],
    };
  }

  const trap = view.traps.find((t) => samePos(t.pos, pos));
  if (trap) return trapSheet(trap);

  if (cell.summonZoneOf !== null) {
    const p = cell.summonZoneOf;
    return {
      ...empty(`Invocation J${p}`, p, 'Zone d’invocation'),
      text: [`Le Joueur ${p} y pose ses nouveaux monstres. L’occuper bloque ses invocations.`],
    };
  }
  return null;
}

/** Mobilité de base d'un monstre : sa carte, le bonus du plateau et les auras. */
const baseMobility = (view: PlayerView, monster: MonsterUnit) =>
  getMonsterCard(monster.cardId).mobility + view.board.mobilityBonus + auraMobility(view, monster);

function monsterSheet(view: PlayerView, monster: MonsterUnit): SheetData {
  const card = getMonsterCard(monster.cardId);
  const terrain = getUnitsAt(view, monster.pos).find((u): u is TerrainUnit => u.kind === 'terrain');
  const mine = monster.owner === view.viewer;
  const myTurn = mine && view.activePlayer === view.viewer && view.winner === null;

  // Stats : ATK et portée du moment, PV (max compris les bonus), pas restants sur le maximum de ce tour.
  const atk = getAtk(view, monster);
  const range = getRange(monster);
  const base = baseMobility(view, monster);
  // Maximum de ce tour : moins les slow, plus la Charge ; rien s'il ne peut pas bouger.
  const max = Math.max(monster.mobilityLeft, canMove(monster) ? base - monster.froze + monster.boost : monster.boost);
  const stats = [
    stat('broadsword', 'ATK', atk, atk - card.atk),
    stat('hearts', 'PV', `${monster.hp}/${monster.maxHp}`, monster.maxHp - card.hp, monster.hp < monster.maxHp),
    myTurn
      ? stat('walking-boot', 'Pas rest.', `${monster.mobilityLeft}/${max}`, max - card.mobility)
      : stat('walking-boot', 'Mobilité', base, base - card.mobility),
    stat('high-shot', 'Portée', range, range - card.range),
  ];

  const lines: SheetLine[] = [];
  if (myTurn) {
    const attack = attackAvailability(view, monster.id);
    const status = attack.ok
      ? OK
      : attack.reason.kind === 'noTarget'
        ? { text: 'Aucune cible depuis cette case', tone: 'off' as const }
        : reasonStatus(attack.reason, 'Utilisée ce tour');
    lines.push({ icon: 'broadsword', label: 'Attaque', status });
  } else if (!mine) {
    lines.push({ icon: 'crosshair', label: 'Menace', status: { text: 'Hachures au survol', tone: 'info' } });
  }

  const effectFoot = (i: number) => {
    const availability = myTurn ? effectAvailability(view, monster.id, i) : null;
    return availability ? availabilityStatus(availability, 'Déjà utilisé ce tour : une fois par tour/carte') : null;
  };
  const riposte = hasRiposte(card)
    ? monster.hasRiposted
      ? { text: 'Riposte utilisée ce tour', tone: 'off' as const }
      : { text: 'Riposte prête · une fois par tour/carte', tone: 'ok' as const }
    : null;

  return {
    ...empty(card.name, monster.owner, `Monstre${familySuffix(card)} · Joueur ${monster.owner}${mine ? '' : ' (adversaire)'}`),
    flavor: card.flavor ?? null,
    cost: card.cost,
    kind: 'monster',
    art: { cardId: card.id, owner: monster.owner },
    shiny: monster.shiny === true,
    typeIcon: 'dragon-head',
    stats,
    lines,
    text: mine
      ? []
      : [
          `À son prochain tour : hachures orange, là où il pourra aller (mobilité ${getNextTurnMobility(monster, view.turn, view.activePlayer, view.board.mobilityBonus)}) ; rouges, là où il pourra frapper (portée ${card.range}).`,
        ],
    passive: passiveBlock(keywordItems(card), riposte),
    active: activeBlocks(card, effectFoot),
    status: monsterChips(view, monster, terrain),
  };
}

/** Nom d'une source : son effet s'il en a un (« Dopage », « Passage »), sinon la carte (« Charge »). */
export const sourceName = (source: EffectSource) => source.effect ?? cardTitle(source.cardId);

/** « (Jean Bon) » : la carte d'un effet nommé ; rien quand le nom est déjà celui de la carte. */
const sourceCard = (source: EffectSource) => (source.effect ? ` (${cardTitle(source.cardId)})` : '');

function turnBonusChip({ source, atk, range, mobility }: TurnBonus): SheetChip {
  const now = [atk > 0 ? `+${atk} ATK` : null, range > 0 ? `+${range} portée` : null].filter(Boolean).join(' ');
  const parts = [now ? `${now} jusqu’à la fin du tour` : null, mobility > 0 ? `+${mobility} mobilité ce tour` : null].filter(Boolean);
  const icon: IconName = atk > 0 ? 'broadsword' : range > 0 ? 'high-shot' : 'sprint';
  return effect(icon, sourceName(source), `${parts.join(', ')}${sourceCard(source)}`, 'boost');
}

const effect = (icon: IconName, text: string, detail: string, kind: ChipKind): SheetChip => ({ icon, text, detail, kind, group: 'effect' });

/** « Effets en cours » d'un monstre : ses statuts, puis les effets qui le touchent (bonus du tour, auras, plateau, camouflage, zone, terrain). */
function monsterChips(view: PlayerView, monster: MonsterUnit, terrain: TerrainUnit | undefined): SheetChip[] {
  const card = getMonsterCard(monster.cardId);
  const chips: SheetChip[] = [...statusChips(view, monster)];
  // Bonus du tour, un par source : son nom (« Dopage », « Charge »), le bonus et la carte au survol.
  for (const bonus of monster.turnBonuses) chips.push(turnBonusChip(bonus));
  const aura = { atk: auraAtk(view, monster), hp: auraHp(view, monster), mobility: auraMobility(view, monster) };
  if (aura.atk > 0 || aura.hp > 0 || aura.mobility > 0) {
    const sources = auraSources(view, monster).map((other) => getCard(other.cardId).name);
    chips.push(effect('aura', 'Aura', `${auraBonusText(aura)} (${sources.join(', ')})`, 'boost'));
  }
  if (view.board.mobilityBonus > 0) chips.push(boardChip(view));
  // Camouflage par mot-clé (Pénombre le donne en statut, avec sa puce) : caché ou repéré, vu par son joueur.
  const mine = monster.owner === view.viewer;
  const camouflage = card.keywords.find((spec) => spec.keyword === 'camouflage');
  if (mine && camouflage && !monster.statuses.some((s) => s.kind === 'camouflage')) {
    const radius = 'amount' in camouflage ? camouflage.amount : 2;
    chips.push(
      view.hiddenFromOpponent.includes(monster.id)
        ? effect('eye-slash', 'Camouflé', `Invisible pour l’adversaire : aucun de ses monstres ni terrains dans un rayon de ${radius}`, 'info')
        : effect('eye', 'Repéré', `Visible : un monstre ou un terrain adverse est dans un rayon de ${radius}`, 'warn'),
    );
  }
  const cell = getCell(view.board, monster.pos);
  if (cell.kind === 'plain' && cell.manaZone) {
    const zone = MANA_ZONE_NAMES[cell.manaZone];
    chips.push(effect(ZONE_ICONS[cell.manaZone], zone, `Tient ${zone} : +${getZoneMana(view, monster.pos)} mana, +${VP_PER_CONTROLLED_ZONE} VP`, 'zone'));
  }
  if (terrain) {
    const name = getCard(terrain.cardId).name;
    chips.push(effect('castle', name, `Sur ${name} (${terrain.hp} PV)`, 'terrain'));
  }
  return chips;
}

function terrainSheet(view: PlayerView, terrain: TerrainUnit): SheetData {
  const card = getCard(terrain.cardId);
  const zone = getCell(view.board, terrain.pos);
  const chips: SheetChip[] = [...statusChips(view, terrain)];
  if (zone.kind === 'plain' && zone.manaZone) {
    const name = MANA_ZONE_NAMES[zone.manaZone];
    chips.push(effect(ZONE_ICONS[zone.manaZone], name, `Tient ${name} pour J${terrain.owner}`, 'zone'));
  }
  const above = getUnitsAt(view, terrain.pos).find((u) => u.kind === 'monster');
  if (above) {
    const name = getCard(above.cardId).name;
    chips.push(effect('dragon-head', name, `Sous ${name} (J${above.owner})`, 'terrain'));
  }
  return {
    ...empty(card.name, terrain.owner, `Terrain · Joueur ${terrain.owner}`),
    kind: 'terrain',
    cost: card.cost,
    art: { cardId: card.id, owner: terrain.owner },
    shiny: terrain.shiny === true,
    typeIcon: 'castle',
    stats: [stat('hearts', 'PV', `${terrain.hp}/${terrain.maxHp}`, 0, terrain.hp < terrain.maxHp)],
    passive: passiveBlock(terrainItems(card), null),
    status: chips,
  };
}

/** Case brûlée (Lutin brasier) : publique ; ce qu'elle inflige et combien de temps elle dure (§10). */
function burningSheet(view: PlayerView, cell: BurningCell): SheetData {
  const what = cell.effects.map(effectText).join(' + ');
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
    ...empty('Case brûlée', cell.owner, `Brûlée par ${getCard(cell.cardId).name} · Joueur ${cell.owner}`),
    typeIcon: 'flame',
    text: [`Chaque monstre ennemi qui y entre subit : ${what}. La case reste.`, `Elle brûle ${until}.`],
  };
}

function trapSheet(trap: Trap): SheetData {
  const what = trap.effects.map(effectText).join(' + ');
  return {
    ...empty(`Ton piège · ${trapLabel(trap)}`, 'trap', 'Piège caché · visible par toi seul'),
    text: [`Posé par ${getCard(trap.cardId).name}. L’ennemi qui entre ici subit : ${what}.`, 'Disparaît au début de ton prochain tour.'],
  };
}

/** Ce qu'il reste d'un statut, vu depuis le tour en cours (§5.5). */
function remainingText(view: PlayerView, unit: Unit, status: Status): string {
  const left = statusTurnsLeft(status, unit.owner, view.turn, view.activePlayer);
  if (left === 0) return durationText(0);
  if (unit.owner !== view.activePlayer) return left === 1 ? 'pendant son prochain tour' : `pendant ses ${left} prochains tours`;
  if (left === 1) return 'jusqu’à la fin de ce tour';
  return `jusqu’à la fin de ce tour et de ${left === 2 ? 'son prochain' : `ses ${left - 1} prochains`}`;
}

/** Couleur de la puce de chaque statut : givre pour le slow, braise pour le burn, information pour l'invisibilité. */
const STATUS_CHIP_KINDS: Readonly<Record<Status['kind'], ChipKind>> = {
  stun: 'warn',
  immobilise: 'warn',
  slow: 'frost',
  burn: 'burn',
  requiem: 'warn',
  camouflage: 'info',
};

/** Nom d'un statut, tel qu'au lexique (§5 bis). */
function statusName(status: Status): string {
  switch (status.kind) {
    case 'stun':
      return 'Stun';
    case 'immobilise':
      return 'Immobilisé';
    case 'slow':
      return `Slow ${status.amount}`;
    case 'burn':
      return `Burn ${status.amount}`;
    case 'requiem':
      return 'Requiem';
    case 'camouflage':
      return 'Camouflé';
  }
}

/** Une puce par statut en cours sur `unit` : son nom ; au survol, son effet et ce qu'il lui reste à durer (§5 bis, §5.5). */
export function statusChips(view: PlayerView, unit: Unit): SheetChip[] {
  return unit.statuses.map((status) => ({
    icon: STATUS_ICONS[status.kind],
    text: statusName(status),
    detail: statusText(view, unit, status),
    kind: STATUS_CHIP_KINDS[status.kind],
    group: 'status',
  }));
}

function statusText(view: PlayerView, unit: Unit, status: Status): string {
  const until = remainingText(view, unit, status);
  switch (status.kind) {
    case 'stun':
      return `Stun : aucune action ${until}`;
    case 'immobilise':
      return `Immobilisé : ne peut plus bouger ${until}`;
    case 'slow':
      return `Slow ${status.amount} : −${status.amount} mobilité ${until}`;
    case 'burn':
      return `Burn ${status.amount} : −${status.amount} PV au début de chacun de ses tours, ${until}`;
    case 'requiem': {
      const left = Math.max(1, (status.expiresAtTurn - ownerNextTurn(view.turn, view.activePlayer, unit.owner)) / 2 + 1);
      const when = left === 1 ? 'son prochain tour' : `son ${left}e prochain tour`;
      return `Requiem : meurt au début de ${when}, sans VP pour personne`;
    }
    case 'camouflage': {
      const seen = unit.owner === view.viewer && !view.hiddenFromOpponent.includes(unit.id);
      return `Camouflé ${until} : invisible pour l’adversaire sans monstre ni terrain à lui dans un rayon de ${status.amount}${seen ? ' (repéré en ce moment)' : ''}`;
    }
  }
}

/** Une carte qui peut aussi arriver par l'évolution d'un autre monstre (dragons élémentaires). */
function evolutionLine(from: CardId): string {
  const source = getMonsterCard(from);
  const evolve = source.activated.find((ability) => ability.effects.some((effect) => effect.type === 'evolve'));
  const cost = evolve ? ` (${evolve.manaCost} mana)` : '';
  return `Ou par l’effet ${evolve?.name ?? 'actif'} d’un ${cardTitle(from)}${cost} : il apparaît à sa place, sans payer ce coût, et n’agit qu’au tour suivant.`;
}
