// Bulle d'action (handoff V10, lot 11) : ce qu'elle affiche pour la sélection en cours, sans React. Elle remplace le
// bandeau guide : attaque d'une cible à portée (attaquer, attaquer et avancer, effets), effets de son monstre (clic
// droit), carte du grimoire (clic droit : l'invoquer, la lancer, la poser), et chaque choix en plusieurs temps (carte
// d'évolution, monstre à invoquer, direction de la Bourrasque, distance d'un recul). Tout vient des actions légales et
// des aperçus du moteur : la bulle ne calcule rien elle-même.
import { cardAvailability, effectAvailability, getCard, getMonsterCard, previewAttack } from '../engine';
import type {
  Action,
  CardId,
  Direction,
  MonsterCard,
  PlayerId,
  PlayerView,
  Position,
  StatusSpec,
  UnitId,
} from '../engine';
import { cardTitle, effectName } from './cardText';
import { abilityRules, plainRules } from './rulesText';
import type { IconName } from './Icon';
import { getEffectActions, getPushChoices, getSummonChoices } from './interaction';
import type { Selection } from './interaction';
import { reasonStatus } from './sheet';

/** Ce que fait une ligne : jouer une action, ou changer la sélection (page suivante, ciblage sur le plateau). */
export type BubblePick = { readonly action: Action } | { readonly selection: Selection };

export interface BubbleRow {
  readonly key: string;
  readonly icon: IconName;
  /** Icône violette (effet), ou flèche tournée vers une direction affichée. */
  readonly tone: 'plain' | 'effect';
  readonly arrow?: Direction;
  /** Petite botte : l'attaque avance. */
  readonly boot?: boolean;
  readonly title: string;
  readonly subtitle: string;
  readonly cost: number | null;
  readonly enabled: boolean;
  /** Indisponible faute de mana : sous-titre en rouge. */
  readonly warn: boolean;
  readonly pick: BubblePick | null;
  /** Trajet à montrer sur le plateau au survol de la ligne (attaquer et avancer). */
  readonly path?: readonly Position[];
}

export type BubbleHeader =
  /** Une unité : la cible (avec ses PV avant → après), ou son monstre (avec son mana, pour ses effets). */
  | {
      readonly kind: 'unit';
      readonly name: string;
      readonly owner: PlayerId;
      readonly hp: { readonly before: number; readonly after: number } | null;
      readonly note: string | null;
    }
  /** Une page suivante : « ‹ Effets · tu as 3 mana ». */
  | { readonly kind: 'page'; readonly title: string; readonly note: string; readonly back: Selection }
  /** Une carte du grimoire : son type et son nom. */
  | { readonly kind: 'card'; readonly icon: IconName; readonly name: string; readonly note: string };

export interface BubbleModel {
  /**
   * Case au-dessus de laquelle la bulle s'ouvre, et l'unité dont le jeton la porte (ou rien pour une case vide) ; pour
   * une carte du grimoire, aucune case : la bulle s'ouvre au-dessus de sa tuile (`anchorCard`).
   */
  readonly anchor: Position | null;
  readonly anchorUnit: UnitId | null;
  readonly anchorCard?: CardId;
  readonly header: BubbleHeader;
  readonly rows: readonly BubbleRow[];
}

/** Retour d'une page : la page précédente ; `null` sur la première page (fermer = désélectionner). */
export function bubbleBack(model: BubbleModel): Selection | null {
  return model.header.kind === 'page' ? model.header.back : null;
}

/** Sur un plateau retourné, le haut du plateau est en bas de l'écran : la bulle parle de l'écran. */
const SCREEN_DIRECTION: Readonly<Record<Direction, Direction>> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const DIRECTION_WORDS: Readonly<Record<Direction, string>> = { up: 'le haut', down: 'le bas', left: 'la gauche', right: 'la droite' };

const STATUS_NAMES: Readonly<Partial<Record<StatusSpec['kind'], string>>> = { burn: 'Brûlure', slow: 'Givre' };

const manaNote = (view: PlayerView) => `· tu as ${view.me.mana} mana`;
const statsLine = (card: MonsterCard) => `ATK ${card.atk} · PV ${card.hp} · Mob. ${card.mobility} · Portée ${card.range}`;

export function getBubble(view: PlayerView, selection: Selection, flipped = false): BubbleModel | null {
  switch (selection.kind) {
    case 'attack':
      return selection.page === 'main' ? attackBubble(view, selection) : effectsBubble(view, selection);
    case 'effects':
      return effectsBubble(view, selection);
    case 'push':
      return pushBubble(view, selection, flipped);
    case 'summonAt':
      return summonBubble(view, selection);
    case 'areaDirection':
      return distanceBubble(view, selection, flipped);
    case 'cardMenu':
      return cardBubble(view, selection.cardId);
    default:
      return null;
  }
}

/** Attaque d'une cible à portée : attaquer, attaquer et avancer (si l'attaque la détruit au contact), ses effets. */
function attackBubble(view: PlayerView, selection: Extract<Selection, { kind: 'attack' }>): BubbleModel | null {
  const attacker = view.units[selection.unitId];
  const target = view.units[selection.targetId];
  if (attacker?.kind !== 'monster' || !target) return null;
  const attacks = view.legalActions.filter(
    (a): a is Extract<Action, { type: 'attack' }> => a.type === 'attack' && a.unitId === attacker.id && a.targetId === target.id,
  );
  const stay = attacks.find((a) => !a.advance);
  if (!stay) return null;
  const advance = attacks.find((a) => a.advance);
  const p = previewAttack(view, attacker, target);

  const tags = [`−${p.damage} PV${p.behind ? ' dans le dos' : ''}`];
  if (p.destroys) tags.push('détruit');
  for (const status of p.statuses) tags.push(STATUS_NAMES[status.kind] ?? status.kind);
  if (p.riposte > 0) tags.push(`riposte −${p.riposte}`);

  const advanceSubtitle = advance
    ? `−${p.damage} PV, détruit, puis prend sa case`
    : !p.destroys
      ? `Ne détruit pas la cible (${p.hpBefore} → ${p.hpAfter} PV)`
      : Math.abs(attacker.pos.row - target.pos.row) + Math.abs(attacker.pos.col - target.pos.col) > 1
        ? 'À distance : il ne peut pas avancer'
        : 'Il ne peut pas prendre sa case';

  // Ses effets actifs : combien sont disponibles, sinon la raison du premier.
  const effects = getMonsterCard(attacker.cardId).activated.map((_, i) => effectAvailability(view, attacker.id, i)!);
  const ready = effects.filter((a) => a.ok).length;
  const first = effects[0];
  const effectRow: BubbleRow = {
    key: 'effects',
    icon: 'magic-swirl',
    tone: 'effect',
    title: 'Effets',
    subtitle: !first
      ? 'Aucun effet actif'
      : ready > 0
        ? `${ready} disponible${ready > 1 ? 's' : ''} ›`
        : first.ok
          ? ''
          : reasonText(first.reason, 'Déjà utilisé ce tour'),
    cost: null,
    enabled: ready > 0,
    warn: ready === 0 && first?.ok === false && first.reason.kind === 'mana',
    pick: { selection: { ...selection, page: 'effects' } },
  };

  return {
    anchor: target.pos,
    anchorUnit: target.id,
    header: { kind: 'unit', name: getCard(target.cardId).name, owner: target.owner, hp: { before: p.hpBefore, after: p.hpAfter }, note: null },
    rows: [
      {
        key: 'attack',
        icon: 'broadsword',
        tone: 'plain',
        title: 'Attaquer',
        subtitle: tags.join(' · '),
        cost: null,
        enabled: true,
        warn: false,
        pick: { action: stay },
      },
      {
        key: 'advance',
        icon: 'broadsword',
        tone: 'plain',
        boot: true,
        title: 'Attaquer et avancer',
        subtitle: advanceSubtitle,
        cost: null,
        enabled: advance !== undefined,
        warn: false,
        pick: advance ? { action: advance } : null,
        path: advance ? [target.pos] : undefined,
      },
      effectRow,
    ],
  };
}

/** Raison d'indisponibilité, en court pour la bulle (« Il te manque 2 mana »). */
function reasonText(reason: Parameters<typeof reasonStatus>[0], used: string): string {
  return reason.kind === 'mana' ? `Il te manque ${reason.missing} mana` : reasonStatus(reason, used).text;
}

/**
 * Effets actifs de son monstre (depuis la bulle d'attaque, ou par clic droit), puis le choix d'une carte d'évolution.
 * Choisir un effet le lance s'il n'y a rien d'autre à choisir ; sinon on passe au ciblage sur le plateau (cases violettes).
 */
function effectsBubble(
  view: PlayerView,
  selection: Extract<Selection, { kind: 'attack' | 'effects' }>,
): BubbleModel | null {
  const unit = view.units[selection.unitId];
  if (unit?.kind !== 'monster') return null;
  const card = getMonsterCard(unit.cardId);
  const fromAttack = selection.kind === 'attack';
  const actions = getEffectActions(view, unit.id);
  const anchorUnit = fromAttack ? view.units[selection.targetId] : unit;
  const anchor = anchorUnit?.pos ?? unit.pos;

  if (selection.page === 'evolve') {
    return {
      anchor,
      anchorUnit: anchorUnit?.id ?? unit.id,
      header: { kind: 'page', title: 'Évolution', note: '· sans payer son coût', back: { ...selection, page: 'effects' } },
      rows: actions.flatMap((action): BubbleRow[] => {
        if (action.target.kind !== 'card') return [];
        const evolved = getMonsterCard(action.target.cardId);
        return [
          {
            key: evolved.id,
            icon: 'dragon-head',
            tone: 'effect',
            title: cardTitle(evolved.id),
            subtitle: statsLine(evolved),
            cost: null,
            enabled: true,
            warn: false,
            pick: { action },
          },
        ];
      }),
    };
  }

  // Une ligne par effet actif, dans l'ordre de la carte.
  const rows: BubbleRow[] = card.activated.length
    ? card.activated.map((ability, i): BubbleRow => {
        const availability = effectAvailability(view, unit.id, i);
        return {
          key: `effect-${i}`,
          icon: 'magic-swirl',
          tone: 'effect',
          title: effectName(ability),
          subtitle: availability?.ok ? plainRules(abilityRules(ability)) : availability ? reasonText(availability.reason, 'Déjà utilisé ce tour') : '',
          cost: ability.manaCost,
          enabled: availability?.ok ?? false,
          warn: availability?.ok === false && availability.reason.kind === 'mana',
          pick: availability?.ok ? effectPick(view, unit.id, selection, i) : null,
        };
      })
    : [
        {
          key: 'none',
          icon: 'magic-swirl',
          tone: 'effect',
          title: 'Aucun effet actif',
          subtitle: `${card.name} n’a pas d’effet à activer`,
          cost: null,
          enabled: false,
          warn: false,
          pick: null,
        },
      ];
  const header: BubbleHeader = fromAttack
    ? { kind: 'page', title: 'Effets', note: manaNote(view), back: { ...selection, page: 'main' } }
    : { kind: 'unit', name: card.name, owner: unit.owner, hp: null, note: `Effets · ${view.me.mana} mana` };
  return { anchor, anchorUnit: anchorUnit?.id ?? unit.id, header, rows };
}

/**
 * Choisir l'effet de rang `effect` : le lancer s'il n'a qu'une forme (soi, zone autour), choisir une carte, ou cibler
 * sur le plateau (cases violettes).
 */
function effectPick(
  view: PlayerView,
  unitId: UnitId,
  selection: Extract<Selection, { kind: 'attack' | 'effects' }>,
  effect: number,
): BubblePick {
  const actions = getEffectActions(view, unitId, effect);
  if (actions.some((a) => a.target.kind === 'card')) return { selection: { ...selection, page: 'evolve' } };
  const only = actions.length === 1 ? actions[0]! : null;
  const direct = only && (only.target.kind === 'all' || (only.target.kind === 'area' && !only.target.direction) || (only.target.kind === 'unit' && only.target.unitId === unitId));
  if (direct) return { action: only };
  return { selection: { kind: 'unit', unitId, mode: 'effect', ...(effect > 0 ? { effect } : {}) } };
}

const CARD_ROWS = {
  monster: { icon: 'dragon-head', title: 'Invoquer', hint: 'Sur une case dorée de ta zone d’invocation' },
  spell: { icon: 'spell-book', title: 'Lancer', hint: '' },
  terrain: { icon: 'castle', title: 'Poser', hint: 'Sur une mana zone dorée, sous un de tes monstres' },
} as const satisfies Record<string, { icon: IconName; title: string; hint: string }>;

const CARD_KINDS = { monster: 'Monstre', spell: 'Sort', terrain: 'Terrain' } as const;

/**
 * Carte du grimoire (clic droit) : l'invoquer, la lancer ou la poser, ou la raison qui l'empêche. Choisir la ligne
 * passe au ciblage sur le plateau (cases dorées) ; un sort sans cible à choisir (Pénombre) se lance tout de suite.
 */
function cardBubble(view: PlayerView, cardId: CardId): BubbleModel | null {
  if (!view.me.grimoire.includes(cardId)) return null;
  const card = getCard(cardId);
  const kind = CARD_ROWS[card.kind];
  const availability = cardAvailability(view, cardId);
  const actions = view.legalActions.filter((a): a is Extract<Action, { type: 'playCard' }> => a.type === 'playCard' && a.cardId === cardId);
  const direct = actions.length === 1 && actions[0]!.target.kind === 'all' ? actions[0]! : null;
  const hint = card.kind === 'spell' ? plainRules(abilityRules(card.ability)) : kind.hint;
  return {
    anchor: null,
    anchorUnit: null,
    anchorCard: cardId,
    header: { kind: 'card', icon: kind.icon, name: card.name, note: CARD_KINDS[card.kind] },
    rows: [
      {
        key: 'play',
        icon: kind.icon,
        tone: 'plain',
        title: kind.title,
        subtitle: availability.ok ? hint : reasonText(availability.reason, 'Déjà lancé ce tour'),
        cost: card.cost,
        enabled: availability.ok,
        warn: !availability.ok && reasonStatus(availability.reason, '').tone === 'warn',
        pick: !availability.ok ? null : direct ? { action: direct } : { selection: { kind: 'card', cardId } },
      },
    ],
  };
}

/** Bourrasque : la direction du recul, à l'écran, avec la case d'arrivée. */
function pushBubble(view: PlayerView, selection: Extract<Selection, { kind: 'push' }>, flipped: boolean): BubbleModel | null {
  const target = view.units[selection.unitId];
  if (!target) return null;
  return {
    anchor: target.pos,
    anchorUnit: target.id,
    header: { kind: 'unit', name: getCard(target.cardId).name, owner: target.owner, hp: null, note: getCard(selection.cardId).name },
    rows: getPushChoices(view, selection).map(({ direction, destination, action }): BubbleRow => {
      const screen = flipped ? SCREEN_DIRECTION[direction] : direction;
      const still = destination.row === target.pos.row && destination.col === target.pos.col;
      return {
        key: direction,
        icon: 'plain-arrow',
        tone: 'plain',
        arrow: screen,
        title: `Vers ${DIRECTION_WORDS[screen]}`,
        subtitle: still ? 'Bloqué : il ne bouge pas' : `Il arrive en (${destination.row}, ${destination.col})`,
        cost: null,
        enabled: true,
        warn: false,
        pick: { action },
      };
    }),
  };
}

/** Invocateur : la case est choisie, le monstre à y invoquer ; chaque ligne coûte l'effet plus le monstre. */
function summonBubble(view: PlayerView, selection: Extract<Selection, { kind: 'summonAt' }>): BubbleModel {
  const summoner = view.units[selection.unitId];
  const summonAbility =
    summoner?.kind === 'monster'
      ? getMonsterCard(summoner.cardId).activated.find((ability) => ability.effects.some((effect) => effect.type === 'summon'))
      : undefined;
  const effectCost = summonAbility?.manaCost ?? 0;
  return {
    anchor: selection.pos,
    anchorUnit: null,
    header: { kind: 'page', title: 'Invoquer', note: manaNote(view), back: { kind: 'unit', unitId: selection.unitId, mode: 'effect' } },
    rows: getSummonChoices(view, selection).map(({ cardId, action }): BubbleRow => {
      const card = getMonsterCard(cardId);
      return {
        key: cardId,
        icon: 'dragon-head',
        tone: 'plain',
        title: cardTitle(card.id),
        subtitle: statsLine(card),
        cost: effectCost + card.cost,
        enabled: true,
        warn: false,
        pick: { action },
      };
    }),
  };
}

/** Zone en ligne avec un recul au choix (Vent violent) : la direction est choisie, reste la distance. */
function distanceBubble(view: PlayerView, selection: Extract<Selection, { kind: 'areaDirection' }>, flipped: boolean): BubbleModel | null {
  const unit = view.units[selection.unitId];
  const ability = unit?.kind === 'monster' ? getMonsterCard(unit.cardId).activated.find((a) => a.targeting.type === 'zone') : undefined;
  if (!unit || !ability) return null;
  const screen = flipped ? SCREEN_DIRECTION[selection.direction] : selection.direction;
  const name = ability.name ?? 'Effet';
  return {
    anchor: unit.pos,
    anchorUnit: unit.id,
    header: { kind: 'page', title: name, note: `vers ${DIRECTION_WORDS[screen]}`, back: { kind: 'unit', unitId: unit.id, mode: 'effect' } },
    rows: getEffectActions(view, unit.id).flatMap((action): BubbleRow[] => {
      if (action.target.kind !== 'area' || action.target.direction !== selection.direction) return [];
      const { distance } = action.target;
      return [
        {
          key: String(distance ?? 0),
          icon: 'plain-arrow',
          tone: 'effect',
          arrow: screen,
          title: distance ? `Recul de ${distance}` : `Lancer ${name}`,
          subtitle: plainRules(abilityRules(ability)),
          cost: null,
          enabled: true,
          warn: false,
          pick: { action },
        },
      ];
    }),
  };
}
