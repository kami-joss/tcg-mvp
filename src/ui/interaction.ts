// Logique d'interaction de l'interface (SPEC.md §7), indépendante de React : sélection, surbrillances, clics.
// Tout part des actions légales de la vue : l'interface ne propose jamais une action que le moteur refuserait.
import {
  attackDamage,
  getAllyChains,
  getAtk,
  getAreaCells,
  getCard,
  getMonsterCard,
  getMovePath,
  getPushDestination,
  getUnitsAt,
  hitsFromBehind,
  isDirectionalZone,
  isInSquare,
  samePos,
} from '../engine';
import type { Action, CardId, Direction, PlayerView, Position, UnitId } from '../engine';
import { getDangerEdges, getDangerZone, getMoveCosts, getUnitZones } from './zones';
import type { DangerEdges } from './zones';

export type Selection =
  | { readonly kind: 'none' }
  /**
   * Un de ses monstres : ses déplacements et attaques (`act`), ou les cibles d'un de ses effets actifs (`effect`, de rang
   * `effect` sur la carte : 0 si absent).
   */
  | { readonly kind: 'unit'; readonly unitId: UnitId; readonly mode: 'act' | 'effect'; readonly effect?: number }
  /** Une carte de son grimoire, en attente de sa cible. */
  | { readonly kind: 'card'; readonly cardId: CardId }
  /** Bulle d'une carte du grimoire (clic droit) : l'invoquer, la lancer ou la poser. */
  | { readonly kind: 'cardMenu'; readonly cardId: CardId }
  /** Bourrasque : la cible est choisie, reste la direction (dans la bulle). */
  | { readonly kind: 'push'; readonly cardId: CardId; readonly unitId: UnitId }
  /**
   * Bulle d'action sur une cible à portée (handoff V10, lot 11) : attaquer, attaquer et avancer, ou ses effets (`page`
   * « effets », puis le choix d'une carte d'évolution).
   */
  | { readonly kind: 'attack'; readonly unitId: UnitId; readonly targetId: UnitId; readonly page: BubblePage }
  /** Tir sur une case vide (Flèche explosive armée) : la bulle propose de tirer. */
  | { readonly kind: 'shoot'; readonly unitId: UnitId; readonly pos: Position }
  /** Bulle de ses effets (clic droit sur son monstre). */
  | { readonly kind: 'effects'; readonly unitId: UnitId; readonly page: Exclude<BubblePage, 'main'> }
  /** Invocateur : la case est choisie, reste le monstre à invoquer (dans la bulle). */
  | { readonly kind: 'summonAt'; readonly unitId: UnitId; readonly pos: Position }
  /** Téléporteur : l'allié est choisi, reste la case où le poser. */
  | { readonly kind: 'teleport'; readonly unitId: UnitId; readonly targetId: UnitId }
  /** Sort de téléportation (Flash, Repli, Téléportation) : l'allié est choisi, reste la case où le poser. */
  | { readonly kind: 'cardTeleport'; readonly cardId: CardId; readonly targetId: UnitId }
  /** Réanimation : la case est choisie, reste le monstre du cimetière à y invoquer (dans la bulle). */
  | { readonly kind: 'reviveAt'; readonly cardId: CardId; readonly pos: Position }
  /** Zone en ligne avec un recul au choix (Vent violent) : la direction est choisie, reste la distance (dans la bulle). */
  | { readonly kind: 'areaDirection'; readonly unitId: UnitId; readonly direction: Direction }
  /** Unité affichée pour information seulement (adverse, terrain, ou hors de son tour). */
  | { readonly kind: 'inspect'; readonly unitId: UnitId };

export const NO_SELECTION: Selection = { kind: 'none' };

/** Pages de la bulle d'action : ses actions sur la cible, ses effets, le choix d'une carte d'évolution. */
export type BubblePage = 'main' | 'effects' | 'evolve';

/** La sélection s'affiche dans une bulle : le plateau ne fait que la fermer (ou la déplacer sur une autre cible). */
export function isBubble(selection: Selection): boolean {
  return (
    selection.kind === 'attack' ||
    selection.kind === 'effects' ||
    selection.kind === 'cardMenu' ||
    selection.kind === 'push' ||
    selection.kind === 'summonAt' ||
    selection.kind === 'reviveAt' ||
    selection.kind === 'shoot' ||
    selection.kind === 'areaDirection'
  );
}

export type Highlight = 'move' | 'attack' | 'effect' | 'target';

/** Un clic joue une action, ou change la sélection. */
export type ClickResult = { readonly action: Action } | { readonly selection: Selection };

export const posKey = (pos: Position): string => `${pos.row},${pos.col}`;

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

function actionsOf<T extends Action['type']>(view: PlayerView, type: T): ActionOf<T>[] {
  return view.legalActions.filter((action): action is ActionOf<T> => action.type === type);
}

/** Case d'une unité, ou d'une balise (Balise de vision : une cible d'attaque ou de sort, sans être une unité). */
const unitPos = (view: PlayerView, unitId: UnitId): Position | undefined =>
  view.units[unitId]?.pos ?? view.beacons.find((beacon) => beacon.id === unitId)?.pos;

/**
 * Case visée par une cible d'effet ou de carte : la case elle-même (piège, invocation), celle du monstre ciblé
 * (téléportation comprise : on choisit d'abord l'allié), ou aucune (zone, carte).
 */
function targetPos(view: PlayerView, target: ActionOf<'playCard'>['target']): Position | undefined {
  if (target.kind === 'cell' || target.kind === 'cellAndCard') return target.pos;
  return target.kind === 'unit' || target.kind === 'unitAndDirection' || target.kind === 'unitAndCell'
    ? unitPos(view, target.unitId)
    : undefined;
}

/** Case visée par une carte : la case elle-même (invocation, terrain) ou celle du monstre ciblé (sort). */
const cardTargetPos = (view: PlayerView, action: ActionOf<'playCard'>) => targetPos(view, action.target);

/**
 * Cases des monstres que touche un sort sans choix de cible : tous ses monstres d'une famille (Pénombre), ou tous les
 * monstres ennemis qu'il voit (Piège temporel). Un clic sur l'un d'eux lance le sort.
 */
export function getSpellAllies(view: PlayerView, cardId: CardId): Position[] {
  const card = getCard(view.cards, cardId);
  if (card.kind !== 'spell') return [];
  const { targeting } = card.ability;
  if (targeting.type === 'enemies') {
    return Object.values(view.units)
      .filter((u) => u.kind === 'monster' && u.owner !== view.viewer)
      .map((u) => u.pos);
  }
  if (targeting.type === 'allyChains') {
    // Chaînes d'éclair : ses monstres et les cases des chaînes entre eux (toujours jouable, §10).
    const mine = Object.values(view.units).filter((u) => u.kind === 'monster' && u.owner === view.viewer).map((u) => u.pos);
    return [...mine, ...getAllyChains(view, view.viewer).flat()];
  }
  if (targeting.type === 'enemiesNearAllies') {
    const mine = Object.values(view.units).filter((u) => u.owner === view.viewer);
    return Object.values(view.units)
      .filter((u) => u.kind === 'monster' && u.owner !== view.viewer && mine.some((m) => isInSquare(view.board, m.pos, u.pos)))
      .map((u) => u.pos);
  }
  if (targeting.type !== 'allies') return [];
  const { archetype } = targeting;
  return Object.values(view.units)
    .filter((u) => u.kind === 'monster' && u.owner === view.viewer && getMonsterCard(view.cards, u.cardId).archetype === archetype)
    .map((u) => u.pos);
}

/** Case visée par un effet activé : celle du monstre ciblé, ou la case à piéger ; aucune pour une zone ou une carte. */
const effectTargetPos = (view: PlayerView, action: ActionOf<'activateEffect'>) => targetPos(view, action.target);

/** Directions proposées pour un effet de zone en ligne (Raz de marée, Vent violent), dans l'ordre des actions. */
export function getAreaDirections(view: PlayerView, unitId: UnitId, effect = 0): Direction[] {
  const directions = getEffectActions(view, unitId, effect).flatMap((a) =>
    a.target.kind === 'area' && a.target.direction ? [a.target.direction] : [],
  );
  return [...new Set(directions)];
}

/**
 * Cases d'un effet de zone (affichées en violet), pour le monstre sélectionné en mode effet. Zone en ligne : les lignes
 * de toutes les directions proposées, ou de la seule `direction` donnée.
 */
export function getEffectArea(view: PlayerView, unitId: UnitId, direction?: Direction, effect = 0): Position[] {
  const unit = view.units[unitId];
  if (unit?.kind !== 'monster' || !getEffectActions(view, unitId, effect).some((a) => a.target.kind === 'area')) return [];
  const targeting = getMonsterCard(view.cards, unit.cardId).activated[effect]?.targeting;
  if (targeting?.type !== 'zone') return [];
  if (!isDirectionalZone(targeting.zone)) return getAreaCells(view, unit, targeting.zone);
  const zone = targeting.zone;
  return getAreaDirections(view, unitId, effect)
    .filter((d) => !direction || d === direction)
    .flatMap((d) => getAreaCells(view, { ...unit, facing: d }, zone));
}

/** Direction de la ligne qui passe par `pos`, pour un effet de zone en ligne. */
function areaDirectionAt(view: PlayerView, unitId: UnitId, pos: Position, effect = 0): Direction | undefined {
  // Une case en diagonale devant le dragon peut être dans deux zones (« 3 en ligne et 2 diagonales ») : la première
  // direction l'emporte ; un clic sur une case de la ligne choisit l'autre.
  return getAreaDirections(view, unitId, effect).find((d) => getEffectArea(view, unitId, d, effect).some((cell) => samePos(cell, pos)));
}

/** Unité mise en avant par la sélection. */
export function selectedUnitId(selection: Selection): UnitId | null {
  switch (selection.kind) {
    case 'unit':
    case 'inspect':
    case 'push':
    case 'attack':
    case 'effects':
    case 'summonAt':
    case 'teleport':
    case 'areaDirection':
    case 'shoot':
      return selection.unitId;
    case 'cardTeleport':
      return selection.targetId;
    case 'card':
    case 'cardMenu':
    case 'reviveAt':
    case 'none':
      return null;
  }
}

/** Cases à mettre en surbrillance pour la sélection courante. */
export function getHighlights(view: PlayerView, selection: Selection): Map<string, Highlight> {
  const highlights = new Map<string, Highlight>();
  const mark = (pos: Position | undefined, highlight: Highlight) => {
    if (pos) highlights.set(posKey(pos), highlight);
  };

  switch (selection.kind) {
    case 'unit':
      if (selection.mode === 'act') {
        for (const a of actionsOf(view, 'move')) if (a.unitId === selection.unitId) mark(a.to, 'move');
        for (const a of actionsOf(view, 'attack')) if (a.unitId === selection.unitId) mark(unitPos(view, a.targetId), 'attack');
        // Armé d'éclats : les cases vides où il peut tirer (Flèche explosive).
        for (const a of actionsOf(view, 'attackCell')) if (a.unitId === selection.unitId) mark(a.pos, 'attack');
      } else {
        const effect = selection.effect ?? 0;
        for (const a of getEffectActions(view, selection.unitId, effect)) mark(effectTargetPos(view, a), 'effect');
        for (const pos of getEffectArea(view, selection.unitId, undefined, effect)) mark(pos, 'effect');
      }
      break;
    case 'card':
      for (const a of actionsOf(view, 'playCard')) {
        if (a.cardId !== selection.cardId) continue;
        if (a.target.kind === 'all') for (const pos of getSpellAllies(view, a.cardId)) mark(pos, 'target');
        else mark(cardTargetPos(view, a), 'target');
      }
      break;
    case 'push':
      mark(unitPos(view, selection.unitId), 'target');
      break;
    case 'attack':
      mark(unitPos(view, selection.targetId), 'attack');
      break;
    case 'shoot':
      mark(selection.pos, 'attack');
      break;
    case 'summonAt':
    case 'reviveAt':
      mark(selection.pos, 'effect');
      break;
    case 'cardTeleport':
      mark(unitPos(view, selection.targetId), 'target');
      for (const pos of getCardTeleportCells(view, selection)) mark(pos, 'target');
      break;
    case 'teleport':
      mark(unitPos(view, selection.targetId), 'target');
      for (const pos of getTeleportCells(view, selection)) mark(pos, 'effect');
      break;
    case 'areaDirection':
      for (const pos of getEffectArea(view, selection.unitId, selection.direction)) mark(pos, 'effect');
      break;
    case 'none':
    case 'inspect':
    case 'effects':
    case 'cardMenu':
      break;
  }
  return highlights;
}

/** Portée d'un effet survolé (bulle, fiche) : ses cases en violet, par-dessus les autres surbrillances le temps du survol. */
export function withReach(highlights: ReadonlyMap<string, Highlight>, reach: readonly Position[]): Map<string, Highlight> {
  const out = new Map(highlights);
  for (const pos of reach) out.set(posKey(pos), 'effect');
  return out;
}

/** Cible que `unitId` peut attaquer sur cette case. */
function attackTargetAt(view: PlayerView, unitId: UnitId, pos: Position): UnitId | undefined {
  return actionsOf(view, 'attack').find((a) => a.unitId === unitId && samePos(unitPos(view, a.targetId) ?? { row: -1, col: -1 }, pos))
    ?.targetId;
}

export function clickCell(view: PlayerView, selection: Selection, pos: Position): ClickResult {
  const isHere = (target: Position | undefined) => target !== undefined && samePos(target, pos);

  // Bulle ouverte : le plateau ne déplace ni ne sélectionne rien. Un clic sur une autre cible de l'attaquant y déplace
  // la bulle ; tout autre clic la ferme, et désélectionne (sinon les cases de déplacement reviendraient sous la souris).
  if (isBubble(selection)) {
    const other = selection.kind === 'attack' ? attackTargetAt(view, selection.unitId, pos) : undefined;
    if (selection.kind === 'attack' && other && other !== selection.targetId) {
      return { selection: { kind: 'attack', unitId: selection.unitId, targetId: other, page: 'main' } };
    }
    return { selection: NO_SELECTION };
  }

  if (selection.kind === 'unit' && selection.mode === 'act') {
    // Armé d'éclats, une case vide où il peut tirer ouvre la bulle du tir (qui propose aussi d'y aller, s'il le peut).
    if (actionsOf(view, 'attackCell').some((a) => a.unitId === selection.unitId && isHere(a.pos))) {
      return { selection: { kind: 'shoot', unitId: selection.unitId, pos } };
    }
    const move = actionsOf(view, 'move').find((a) => a.unitId === selection.unitId && isHere(a.to));
    if (move) return { action: move };
    // Une cible à portée : la bulle d'action s'ouvre au-dessus d'elle, l'attaque n'est jamais immédiate.
    const target = attackTargetAt(view, selection.unitId, pos);
    if (target) return { selection: { kind: 'attack', unitId: selection.unitId, targetId: target, page: 'main' } };
  }

  if (selection.kind === 'cardTeleport') {
    const teleport = actionsOf(view, 'playCard').find(
      (a) => a.cardId === selection.cardId && a.target.kind === 'unitAndCell' && a.target.unitId === selection.targetId && isHere(a.target.pos),
    );
    if (teleport) return { action: teleport };
    // Un autre allié qu'il peut téléporter : il devient la cible.
    const other = actionsOf(view, 'playCard').find((a) => a.cardId === selection.cardId && a.target.kind === 'unitAndCell' && isHere(unitPos(view, a.target.unitId)));
    if (other?.target.kind === 'unitAndCell') return { selection: { ...selection, targetId: other.target.unitId } };
    return { selection: NO_SELECTION };
  }

  if (selection.kind === 'teleport') {
    const teleport = getEffectActions(view, selection.unitId).find(
      (a) => a.target.kind === 'unitAndCell' && a.target.unitId === selection.targetId && isHere(a.target.pos),
    );
    if (teleport) return { action: teleport };
  }

  const effect = selection.kind === 'unit' ? (selection.effect ?? 0) : undefined;
  if (selection.kind === 'teleport' || (selection.kind === 'unit' && selection.mode === 'effect')) {
    const here = getEffectActions(view, selection.unitId, effect).filter((a) => isHere(effectTargetPos(view, a)));
    // Invocation : la case est choisie, le monstre se choisit dans la bulle.
    if (here[0]?.target.kind === 'cellAndCard') return { selection: { kind: 'summonAt', unitId: selection.unitId, pos } };
    // Téléportation : l'allié est choisi, la case se choisit ensuite sur le plateau.
    const ally = here[0]?.target.kind === 'unitAndCell' ? here[0].target.unitId : null;
    if (ally) return { selection: { kind: 'teleport', unitId: selection.unitId, targetId: ally } };
  }

  if (selection.kind === 'unit' && selection.mode === 'effect') {
    const action = getEffectActions(view, selection.unitId, effect).find((a) => isHere(effectTargetPos(view, a)));
    if (action) return { action };
    // Effet de zone : un clic sur la zone le lance, s'il n'y a plus rien à choisir. En ligne, le clic choisit d'abord
    // la direction de la ligne cliquée ; s'il reste une distance de recul à choisir, elle se choisit dans la bulle.
    if (getEffectArea(view, selection.unitId, undefined, effect).some(isHere)) {
      const direction = areaDirectionAt(view, selection.unitId, pos, effect);
      const area = getEffectActions(view, selection.unitId, effect).filter(
        (a) => a.target.kind === 'area' && a.target.direction === direction,
      );
      if (area.length === 1) return { action: area[0]! };
      if (direction) return { selection: { kind: 'areaDirection', unitId: selection.unitId, direction } };
      return { selection };
    }
  }

  if (selection.kind === 'card') {
    // Sort sans choix de cible : un clic sur un des monstres touchés le lance.
    const all = actionsOf(view, 'playCard').find((a) => a.cardId === selection.cardId && a.target.kind === 'all');
    if (all && getSpellAllies(view, all.cardId).some(isHere)) return { action: all };
    const play = actionsOf(view, 'playCard').find((a) => a.cardId === selection.cardId && isHere(cardTargetPos(view, a)));
    if (play?.target.kind === 'unitAndDirection') {
      return { selection: { kind: 'push', cardId: play.cardId, unitId: play.target.unitId } };
    }
    // Téléportation : l'allié est choisi, la case se choisit ensuite sur le plateau.
    if (play?.target.kind === 'unitAndCell') return { selection: { kind: 'cardTeleport', cardId: play.cardId, targetId: play.target.unitId } };
    // Réanimation : la case est choisie, le monstre se choisit dans la bulle.
    if (play?.target.kind === 'cellAndCard') return { selection: { kind: 'reviveAt', cardId: play.cardId, pos } };
    if (play) return { action: play };
  }

  return { selection: selectAt(view, selection, pos) };
}

/**
 * Clic droit (handoff V10, lot 11) : sur un de ses monstres, à son tour, la bulle de ses effets s'ouvre au-dessus de lui ;
 * ailleurs, il ferme la bulle ouverte (et ne change rien sinon).
 */
export function contextCell(view: PlayerView, selection: Selection, pos: Position): Selection {
  const monster = getUnitsAt(view, pos).find((u) => u.kind === 'monster');
  const canAct = view.activePlayer === view.viewer && view.winner === null;
  if (monster && monster.owner === view.viewer && canAct) return { kind: 'effects', unitId: monster.id, page: 'effects' };
  return isBubble(selection) ? NO_SELECTION : selection;
}

/** Sélection après un clic qui ne joue rien : un de ses monstres, une unité à consulter, ou rien. */
function selectAt(view: PlayerView, current: Selection, pos: Position): Selection {
  const units = getUnitsAt(view, pos);
  const unit = units.find((u) => u.kind === 'monster') ?? units[0];
  if (!unit || selectedUnitId(current) === unit.id) return NO_SELECTION;
  const canAct = view.activePlayer === view.viewer && view.winner === null;
  return unit.kind === 'monster' && unit.owner === view.viewer && canAct
    ? { kind: 'unit', unitId: unit.id, mode: 'act' }
    : { kind: 'inspect', unitId: unit.id };
}

export function canPlay(view: PlayerView, cardId: CardId): boolean {
  return actionsOf(view, 'playCard').some((a) => a.cardId === cardId);
}

/** Clic droit sur une carte de son grimoire : sa bulle (l'invoquer, la lancer ou la poser, ou pourquoi pas). */
export function contextCard(view: PlayerView, cardId: CardId): Selection {
  return view.me.grimoire.includes(cardId) ? { kind: 'cardMenu', cardId } : NO_SELECTION;
}

/**
 * Cliquer une carte jouable la sélectionne ; la recliquer la désélectionne. Un sort sans cible ni monstre touché (Élixir
 * de mana) ouvre sa bulle : il se lance de là.
 */
export function clickCard(view: PlayerView, selection: Selection, cardId: CardId): Selection {
  if (selection.kind === 'card' && selection.cardId === cardId) return NO_SELECTION;
  if (!canPlay(view, cardId)) return selection;
  const plays = actionsOf(view, 'playCard').filter((a) => a.cardId === cardId);
  if (plays.length === 1 && plays[0]!.target.kind === 'all' && getSpellAllies(view, cardId).length === 0) return { kind: 'cardMenu', cardId };
  return { kind: 'card', cardId };
}

/** Actions d'effet actif du monstre ; `effect` : seulement celles de cet effet (rang sur la carte, 0 : le premier). */
export function getEffectActions(view: PlayerView, unitId: UnitId, effect?: number): ActionOf<'activateEffect'>[] {
  return actionsOf(view, 'activateEffect').filter((a) => a.unitId === unitId && (effect === undefined || (a.effect ?? 0) === effect));
}

/** Monstres que l'Invocateur peut invoquer sur la case choisie, avec l'action correspondante. */
export function getSummonChoices(view: PlayerView, selection: Selection): { cardId: CardId; action: Action }[] {
  if (selection.kind !== 'summonAt') return [];
  return getEffectActions(view, selection.unitId).flatMap((action) =>
    action.target.kind === 'cellAndCard' && samePos(action.target.pos, selection.pos) ? [{ cardId: action.target.cardId, action }] : [],
  );
}

/** Monstres de son cimetière que la Réanimation peut invoquer sur la case choisie, avec l'action correspondante. */
export function getReviveChoices(view: PlayerView, selection: Selection): { cardId: CardId; action: Action }[] {
  if (selection.kind !== 'reviveAt') return [];
  return actionsOf(view, 'playCard').flatMap((action) =>
    action.cardId === selection.cardId && action.target.kind === 'cellAndCard' && samePos(action.target.pos, selection.pos)
      ? [{ cardId: action.target.cardId, action }]
      : [],
  );
}

/** Cases où un sort de téléportation peut poser l'allié choisi. */
export function getCardTeleportCells(view: PlayerView, selection: Selection): Position[] {
  if (selection.kind !== 'cardTeleport') return [];
  return actionsOf(view, 'playCard').flatMap((action) =>
    action.cardId === selection.cardId && action.target.kind === 'unitAndCell' && action.target.unitId === selection.targetId ? [action.target.pos] : [],
  );
}

/** Cases où le Téléporteur peut poser l'allié choisi. */
export function getTeleportCells(view: PlayerView, selection: Selection): Position[] {
  if (selection.kind !== 'teleport') return [];
  return getEffectActions(view, selection.unitId).flatMap((action) =>
    action.target.kind === 'unitAndCell' && action.target.unitId === selection.targetId ? [action.target.pos] : [],
  );
}

export interface PushChoice {
  readonly direction: Direction;
  /** Case où le monstre finira. */
  readonly destination: Position;
  readonly action: Action;
}

/** Directions possibles pour Bourrasque, avec la case d'arrivée du monstre poussé. */
export function getPushChoices(view: PlayerView, selection: Selection): PushChoice[] {
  if (selection.kind !== 'push') return [];
  const monster = view.units[selection.unitId];
  const card = getCard(view.cards, selection.cardId);
  const effect = card.kind === 'spell' ? card.ability.effects.find((e) => e.type === 'push') : undefined;
  if (monster?.kind !== 'monster' || effect?.type !== 'push') return [];

  return actionsOf(view, 'playCard').flatMap((action): PushChoice[] => {
    const { target } = action;
    if (action.cardId !== selection.cardId || target.kind !== 'unitAndDirection' || target.unitId !== monster.id) {
      return [];
    }
    const destination = getPushDestination(view, monster, target.direction, effect.distance);
    return [{ direction: target.direction, destination, action }];
  });
}

/**
 * Chemin que suivra le monstre sélectionné jusqu'à la case survolée, si c'est une de ses destinations : c'est
 * celui que le moteur prendra au clic. Pour en suivre un autre, on avance case par case.
 */
export function getPathPreview(view: PlayerView, selection: Selection, hovered: Position | null): Position[] {
  if (selection.kind !== 'unit' || selection.mode !== 'act' || !hovered) return [];
  const monster = view.units[selection.unitId];
  const canGo = actionsOf(view, 'move').some((a) => a.unitId === selection.unitId && samePos(a.to, hovered));
  if (monster?.kind !== 'monster' || !canGo) return [];
  return getMovePath(view, monster, hovered) ?? [];
}

/**
 * Zones à montrer (handoff « zones », SPEC.md §10), relatives au monstre sujet : `moves`, où il peut aller (halos cyan) ;
 * `attacks`, ce qu'il peut attaquer (halos orange) ; `danger`, les cases que l'équipe adverse peut atteindre (contour
 * violet), avec les côtés du contour ; vide sans sujet.
 */
export interface ZoneView {
  readonly unitId: UnitId | null;
  readonly moves: ReadonlySet<string>;
  /** Mobilité que coûte chaque case d'aller, écrite sur la case. */
  readonly moveCosts: ReadonlyMap<string, number>;
  readonly attacks: ReadonlySet<string>;
  /** Cases d'attaque occupées par un monstre ennemi visible : en rouge vif (validé le 2026-11-08). */
  readonly targets: ReadonlySet<string>;
  readonly danger: ReadonlyMap<string, DangerEdges>;
}

export const NO_ZONE_VIEW: ZoneView = { unitId: null, moves: new Set(), moveCosts: new Map(), attacks: new Set(), targets: new Set(), danger: new Map() };

/** Zones d'un monstre, en clés de cases ; ses cibles : les cases d'attaque d'un monstre ennemi que voit le joueur. */
function zoneSets(view: PlayerView, unitId: UnitId): Pick<ZoneView, 'moves' | 'moveCosts' | 'attacks' | 'targets'> {
  const owner = view.units[unitId]?.owner;
  const zones = getUnitZones(view, unitId);
  const enemyAt = (pos: Position) => getUnitsAt(view, pos).some((u) => u.kind === 'monster' && u.owner !== owner);
  return {
    moves: new Set(zones.moves.map(posKey)),
    moveCosts: getMoveCosts(view, unitId),
    attacks: new Set(zones.attacks.map(posKey)),
    targets: new Set(zones.attacks.filter(enemyAt).map(posKey)),
  };
}

/**
 * Le sujet des zones : le monstre sélectionné pour agir, ou le monstre consulté (un monstre adverse cliqué, ou le sien
 * hors de son tour) ; sans sélection d'un monstre, le monstre survolé. Le danger ne s'affiche que pour un monstre
 * sélectionné (validé), et seulement si `danger` (bouton « Menace ennemie »).
 */
export function getZoneView(view: PlayerView, selection: Selection, hovered: Position | null, danger = true): ZoneView {
  const monsterAt = (pos: Position | null) => (pos ? getUnitsAt(view, pos).find((u) => u.kind === 'monster') : undefined);
  const selected =
    (selection.kind === 'unit' && selection.mode === 'act') || selection.kind === 'inspect' ? view.units[selection.unitId] : undefined;
  if (selected?.kind === 'monster') {
    return {
      unitId: selected.id,
      ...zoneSets(view, selected.id),
      danger: danger ? getDangerEdges(getDangerZone(view, selected.owner)) : new Map(),
    };
  }
  // Un effet en préparation montre ses propres cibles : pas de zones.
  if (selection.kind === 'unit') return NO_ZONE_VIEW;
  const hover = monsterAt(hovered);
  if (!hover) return NO_ZONE_VIEW;
  return { unitId: hover.id, ...zoneSets(view, hover.id), danger: new Map() };
}

/** Dégâts prévus sur chaque cible d'attaque mise en surbrillance ; `behind` : bonus par derrière (`assassin`, `sournois`). */
export interface AttackPreview {
  readonly damage: number;
  readonly behind: boolean;
}

export function getAttackPreviews(view: PlayerView, selection: Selection): Map<string, AttackPreview> {
  const previews = new Map<string, AttackPreview>();
  const unitId = selection.kind === 'unit' && selection.mode === 'act' ? selection.unitId : selection.kind === 'attack' ? selection.unitId : null;
  const attacker = unitId ? view.units[unitId] : undefined;
  if (attacker?.kind !== 'monster') return previews;
  for (const action of actionsOf(view, 'attack')) {
    const target = view.units[action.targetId];
    const beacon = target ? undefined : view.beacons.find((b) => b.id === action.targetId);
    if (action.unitId === attacker.id && beacon && (selection.kind !== 'attack' || beacon.id === selection.targetId)) {
      // Une balise : l'ATK du moment, sans bonus de dos.
      previews.set(posKey(beacon.pos), { damage: getAtk(view, attacker), behind: false });
      continue;
    }
    if (action.unitId !== attacker.id || !target) continue;
    if (selection.kind === 'attack' && target.id !== selection.targetId) continue;
    const behind = hitsFromBehind(view.cards, attacker, target);
    previews.set(posKey(target.pos), { damage: attackDamage(view, attacker, target), behind });
  }
  return previews;
}

/** Sélection qui attend une case précise : le reste du plateau est atténué. */
export function isFocused(selection: Selection): boolean {
  return (
    selection.kind === 'unit' ||
    selection.kind === 'card' ||
    selection.kind === 'push' ||
    selection.kind === 'attack' ||
    selection.kind === 'effects' ||
    selection.kind === 'summonAt' ||
    selection.kind === 'teleport' ||
    selection.kind === 'cardTeleport' ||
    selection.kind === 'reviveAt' ||
    selection.kind === 'shoot' ||
    selection.kind === 'areaDirection'
  );
}

/** Monstre du joueur qui n'a plus rien à faire ce tour : ni déplacement, ni attaque, ni effet. */
export function isExhausted(view: PlayerView, unitId: UnitId): boolean {
  const unit = view.units[unitId];
  if (unit?.kind !== 'monster' || unit.owner !== view.viewer || view.activePlayer !== view.viewer) return false;
  return !view.legalActions.some(
    (a) => (a.type === 'move' || a.type === 'attack' || a.type === 'attackCell' || a.type === 'activateEffect') && a.unitId === unitId,
  );
}
