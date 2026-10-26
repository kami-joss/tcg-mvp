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
  MonsterUnit,
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
  FAMILY_NAMES,
  abilityExplanation,
  auraBonusText,
  capitalize,
  describeCard,
  durationText,
  effectText,
  keywordLabel,
  keywordText,
  passiveLines,
  trapLabel,
} from './cardText';
import type { IconName } from './Icon';
import { waterKind } from './iso/scenery';
import { STATUS_ICONS } from './zoneMarks';

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
  /** Mots-clés et passifs : « **Riposte** · texte » (sans nom pour la règle d'un terrain). */
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

export interface SheetChip {
  readonly icon: IconName;
  readonly text: string;
  readonly kind: ChipKind;
}

export interface SheetData {
  readonly title: string;
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
  readonly typeIcon: IconName | null;
  readonly type: string;
  readonly stats: readonly SheetStat[];
  readonly lines: readonly SheetLine[];
  readonly text: readonly string[];
  readonly passive: SheetPassive | null;
  readonly active: SheetActive | null;
  /** Effets en cours ; `null` : pas de pied (cases, cartes du grimoire). */
  readonly status: readonly SheetChip[] | null;
}

const FACING_NAMES = { up: 'le haut', down: 'le bas', left: 'la gauche', right: 'la droite' } as const;

/** Icône de chaque mana zone (puce « Tient … »). */
export const ZONE_ICONS: Readonly<Record<ManaZoneId, IconName>> = {
  ecurie: 'horseshoe',
  ferme: 'wheat',
  forge: 'anvil',
  scierie: 'circular-saw',
  mine: 'mining',
};

const empty = (title: string, frame: SheetData['frame'], type: string): SheetData => ({
  title,
  cost: null,
  frame,
  kind: null,
  art: null,
  typeIcon: null,
  type,
  stats: [],
  lines: [],
  text: [],
  passive: null,
  active: null,
  status: null,
});

const stat = (icon: IconName, label: string, value: number | string, delta = 0, hurt = false): SheetStat => ({
  icon,
  label,
  value: String(value),
  delta,
  hurt,
});

/** Mots-clés et passifs d'un monstre : nom avec sa valeur (« Givre 1 »), puis sa définition. */
function keywordItems(card: MonsterCard): SheetPassive['items'] {
  return [
    ...card.keywords.map((spec) => ({ name: keywordLabel(spec), text: capitalize(keywordText(spec)) })),
    ...passiveLines(card).map((line) => ({ name: line.name, text: `${capitalize(line.rule)} : ${line.explain}` })),
  ];
}

/** Règles d'un terrain (« Passif · Nom : texte », ou une phrase) : ses effets passifs. */
function terrainItems(card: Card): SheetPassive['items'] {
  return describeCard(card)
    .slice(1)
    .map((line) => {
      const match = /^Passif · (.+?) : (.+)$/.exec(line);
      return match ? { name: match[1]!, text: capitalize(match[2]!) } : { name: '', text: line };
    });
}

/** « · Bodybuilder » après le type d'un monstre d'une famille (§5.1). */
const familySuffix = (card: Card) => (card.kind === 'monster' && card.family ? ` · ${FAMILY_NAMES[card.family].title}` : '');

const hasRiposte = (card: MonsterCard) => card.keywords.some((spec) => spec.keyword === 'riposte');

function activeBlock(card: MonsterCard, foot: SheetStatus | null): SheetActive | null {
  if (!card.activated) return null;
  return { name: card.activated.name ?? null, cost: card.activated.manaCost, text: abilityExplanation(card.activated), foot };
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
const boardMobilityText = (view: PlayerView) => `+${view.board.mobilityBonus} mobilité sur ce plateau (tous les monstres)`;

const CARD_VERBS: Readonly<Record<Card['kind'], string>> = { monster: 'Invocation', spell: 'Lancer', terrain: 'Poser' };

function cardSheet(view: PlayerView, cardId: CardId): SheetData {
  const card = getCard(cardId);
  const base = { ...empty(card.name, 'card', ''), kind: card.kind, cost: card.cost, art: { cardId, owner: null } };
  const used = 'Déjà lancé ce tour : un même sort une fois par tour';
  const lines: SheetLine[] = [
    { icon: 'card-play', label: CARD_VERBS[card.kind], status: availabilityStatus(cardAvailability(view, cardId), used) },
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
        active: activeBlock(card, null),
        // Le bonus du plateau le suivra dès qu'il sera posé.
        status: bonus > 0 ? [{ icon: 'walking-boot', text: boardMobilityText(view), kind: 'boost' }] : null,
      };
    }
    case 'spell':
      return {
        ...base,
        typeIcon: 'spell-book',
        type: 'Carte sort · effet immédiat',
        lines,
        active: { name: null, cost: null, text: describeCard(card).join(' '), foot: null },
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

function cellSheet(view: PlayerView, pos: Position): SheetData | null {
  const cell = getCell(view.board, pos);
  if (cell.kind === 'offBoard') return null;
  if (cell.kind === 'blocked') {
    // L'eau (rivière, étang) n'est qu'un rendu : mêmes règles qu'une case bloquée.
    const water = waterKind(view.board, pos);
    const title = water === 'pond' ? 'Étang' : water ? 'Rivière' : 'Case bloquée';
    return { ...empty(title, 'blocked', 'Obstacle'), text: ['Infranchissable à pied (le vol la survole). Coupe aussi les tirs.'] };
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

  const effect = myTurn ? effectAvailability(view, monster.id) : null;
  const riposte = hasRiposte(card)
    ? monster.hasRiposted
      ? { text: 'Riposte utilisée ce tour', tone: 'off' as const }
      : { text: 'Riposte prête · une fois par tour', tone: 'ok' as const }
    : null;

  return {
    ...empty(card.name, monster.owner, `Monstre${familySuffix(card)} · Joueur ${monster.owner}${mine ? '' : ' (adversaire)'}`),
    cost: card.cost,
    kind: 'monster',
    art: { cardId: card.id, owner: monster.owner },
    typeIcon: 'dragon-head',
    stats,
    lines,
    text: mine
      ? []
      : [
          `À son prochain tour : hachures orange, là où il pourra aller (mobilité ${getNextTurnMobility(monster, view.turn, view.activePlayer, view.board.mobilityBonus)}) ; rouges, là où il pourra frapper (portée ${card.range}).`,
        ],
    passive: passiveBlock(keywordItems(card), riposte),
    active: activeBlock(card, effect ? availabilityStatus(effect, 'Déjà utilisé ce tour') : null),
    status: monsterChips(view, monster, terrain),
  };
}

/** « Effets en cours » d'un monstre : statuts, bonus du tour, auras, plateau, invisibilité, sens, zone, terrain. */
function monsterChips(view: PlayerView, monster: MonsterUnit, terrain: TerrainUnit | undefined): SheetChip[] {
  const card = getMonsterCard(monster.cardId);
  const chips: SheetChip[] = [...statusChips(view, monster)];
  if (monster.boost > 0) chips.push({ icon: 'sprint', text: `+${monster.boost} mobilité ce tour (Charge)`, kind: 'boost' });
  if (monster.atkBonus > 0) chips.push({ icon: 'broadsword', text: `+${monster.atkBonus} ATK jusqu’à la fin du tour`, kind: 'boost' });
  if (monster.rangeBonus > 0) chips.push({ icon: 'high-shot', text: `+${monster.rangeBonus} portée jusqu’à la fin du tour`, kind: 'boost' });
  const aura = { atk: auraAtk(view, monster), hp: auraHp(view, monster), mobility: auraMobility(view, monster) };
  if (aura.atk > 0 || aura.hp > 0 || aura.mobility > 0) {
    const sources = auraSources(view, monster).map((other) => getCard(other.cardId).name);
    chips.push({ icon: 'aura', text: `${auraBonusText(aura)} (aura${sources.length > 1 ? 's' : ''} : ${sources.join(', ')})`, kind: 'boost' });
  }
  if (view.board.mobilityBonus > 0) chips.push({ icon: 'walking-boot', text: boardMobilityText(view), kind: 'boost' });
  const mine = monster.owner === view.viewer;
  if (mine && (card.keywords.some((spec) => spec.keyword === 'invisible') || monster.statuses.some((s) => s.kind === 'invisible'))) {
    chips.push(
      view.hiddenFromOpponent.includes(monster.id)
        ? { icon: 'eye-slash', text: 'Invisible pour l’adversaire', kind: 'info' }
        : { icon: 'eye', text: 'Visible : une unité adverse est proche', kind: 'warn' },
    );
  }
  chips.push({ icon: 'compass', text: `Regarde vers ${FACING_NAMES[monster.facing]}`, kind: 'info' });
  const cell = getCell(view.board, monster.pos);
  if (cell.kind === 'plain' && cell.manaZone) {
    chips.push({
      icon: ZONE_ICONS[cell.manaZone],
      text: `Tient ${MANA_ZONE_NAMES[cell.manaZone]} : +${getZoneMana(view, monster.pos)} mana, +${VP_PER_CONTROLLED_ZONE} VP`,
      kind: 'zone',
    });
  }
  if (terrain) chips.push({ icon: 'castle', text: `Sur ${getCard(terrain.cardId).name} (${terrain.hp} PV)`, kind: 'terrain' });
  return chips;
}

function terrainSheet(view: PlayerView, terrain: TerrainUnit): SheetData {
  const card = getCard(terrain.cardId);
  const zone = getCell(view.board, terrain.pos);
  const chips: SheetChip[] = [];
  if (zone.kind === 'plain' && zone.manaZone) {
    chips.push({ icon: ZONE_ICONS[zone.manaZone], text: `Tient ${MANA_ZONE_NAMES[zone.manaZone]} pour J${terrain.owner}`, kind: 'zone' });
  }
  const above = getUnitsAt(view, terrain.pos).find((u) => u.kind === 'monster');
  if (above) chips.push({ icon: 'dragon-head', text: `Sous ${getCard(above.cardId).name} (J${above.owner})`, kind: 'terrain' });
  chips.push(...statusChips(view, terrain));
  return {
    ...empty(card.name, terrain.owner, `Terrain · Joueur ${terrain.owner}`),
    kind: 'terrain',
    cost: card.cost,
    art: { cardId: card.id, owner: terrain.owner },
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
  invisible: 'info',
};

/** Une puce par statut en cours sur `unit`, avec ce qu'il lui reste à durer (§5 bis, §5.5). */
export function statusChips(view: PlayerView, unit: Unit): SheetChip[] {
  return unit.statuses.map((status) => ({
    icon: STATUS_ICONS[status.kind],
    text: statusText(view, unit, status),
    kind: STATUS_CHIP_KINDS[status.kind],
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
    case 'invisible':
      return `Invisible ${status.amount} (Pénombre) ${until}`;
  }
}

/** Une carte qui peut aussi arriver par l'évolution d'un autre monstre (dragons élémentaires). */
function evolutionLine(from: CardId): string {
  const source = getMonsterCard(from);
  const cost = source.activated ? ` (${source.activated.manaCost} mana)` : '';
  return `Ou par l’effet ${source.activated?.name ?? 'actif'} d’un ${source.name}${cost} : il apparaît à sa place, sans payer ce coût, et n’agit qu’au tour suivant.`;
}
