// Mise en avant de la carte qui agit (« cut-in », façon Master Duel) : avant l'animation d'une attaque, d'un effet
// actif, d'un sort, d'un terrain ou d'une invocation, la carte surgit en grand au centre de l'écran sur le plateau
// assombri, puis file vers le jeton qui agit ou la case visée (validé : 1,2 s, sans clic pour la passer). Une seule par
// action : la première carte qui agit (une riposte, un piège ou un Passage n'en ont pas). Ce module, pur et testé,
// choisit la carte, ses textes, son trajet et ses images clés ; `CutIn.tsx` l'affiche.
import { getCard, getMonsterCard } from '../../engine';
import type { CardId, GameEvent, PlayerId, PlayerView, Position } from '../../engine';
import { splitCardName } from '../cardText';

export type CutInKind = 'attack' | 'effect' | 'spell' | 'terrain' | 'summon';

export interface CutIn {
  readonly kind: CutInKind;
  readonly cardId: CardId;
  readonly owner: PlayerId;
  /** Exemplaire brillant. */
  readonly shiny: boolean;
  /** Nom de la carte sans son archétype, et son archétype (vide pour une carte de base ou commune). */
  readonly title: string;
  readonly archetype: string;
  /** L'action, dans le bandeau de la carte. */
  readonly action: string;
  /** Nom de l'effet actif, s'il en a un (« Déflagration »). */
  readonly effect: string | null;
  /** Case vers laquelle la carte file à la fin : l'unité qui agit, ou la case visée ; `null` : elle s'efface sur place. */
  readonly to: Position | null;
}

export const CUT_IN_ACTIONS: Readonly<Record<CutInKind, string>> = {
  attack: 'Attaque',
  effect: 'Effet actif',
  spell: 'Sort',
  terrain: 'Terrain',
  summon: 'Invocation',
};

function cutIn(kind: CutInKind, cardId: CardId, owner: PlayerId, shiny: boolean, effect: string | null, to: Position | null): CutIn {
  const { title, archetype } = splitCardName(getCard(cardId).name);
  return { kind, cardId, owner, shiny, title, archetype, action: CUT_IN_ACTIONS[kind], effect, to };
}

/** Rang du premier événement de l'action qui peut ouvrir son cut-in (attaque, effet actif, carte jouée), ou −1. */
export function cutInIndex(events: readonly GameEvent[]): number {
  return events.findIndex((event) => event.type === 'attack' || event.type === 'effect' || event.type === 'cardPlayed');
}

/**
 * Le cut-in de `event`, d'après la vue affichée juste avant lui ; `after` : les événements qui le suivent (l'unité posée
 * dit si l'exemplaire joué est brillant). `null` si l'événement n'en a pas, ou si l'unité qui agit n'est pas visible.
 */
export function cutInOf(event: GameEvent, view: PlayerView, after: readonly GameEvent[]): CutIn | null {
  switch (event.type) {
    case 'attack': {
      const unit = view.units[event.unitId];
      return unit?.kind === 'monster' ? cutIn('attack', unit.cardId, unit.owner, unit.shiny === true, null, event.from) : null;
    }
    case 'effect': {
      const unit = view.units[event.unitId];
      if (unit?.kind !== 'monster') return null;
      const ability = getMonsterCard(unit.cardId).activated[event.effect ?? 0];
      return cutIn('effect', unit.cardId, unit.owner, unit.shiny === true, ability?.name ?? null, unit.pos);
    }
    case 'cardPlayed': {
      const card = getCard(event.cardId);
      if (card.kind === 'spell') {
        // Un sort qui vise un monstre file vers lui ; un sort sans cible (Pénombre, Piège temporel) s'efface sur place.
        return cutIn('spell', card.id, event.player, false, null, card.ability.targeting.type === 'monster' ? event.pos : null);
      }
      const placed = after.find((next) => next.type === 'summon' && next.unit.cardId === card.id);
      const shiny = placed?.type === 'summon' && placed.unit.shiny === true;
      return cutIn(card.kind === 'terrain' ? 'terrain' : 'summon', card.id, event.player, shiny, null, event.pos);
    }
    default:
      return null;
  }
}

/** Durée du cut-in (validé : 1,2 s). */
export const CUT_IN_MS = 1200;

/** La carte surgit jusqu'à `SETTLE`, se pose, reste jusqu'à `LEAVE`, puis file vers sa case. */
const BURST = 0.24;
const SETTLE = 0.34;
const LEAVE = 0.7;

/** Marge gardée en haut et en bas de la fenêtre, en px. */
const MARGIN = 56;
/** Largeur de la carte (cadre de la fiche, 280 × 498) et sa largeur en arrivant sur la case : celle d'un jeton. */
const CARD_W = 280;
const CARD_H = 498;
const LANDING_W = 56;

/**
 * Échelle de la carte au centre : la plus grande qui tient dans la fenêtre (débordement d'overframe `headroom`
 * compris, `MARGIN` px en haut et en bas, 16 px sur les côtés), entre 0,5 et 1,25.
 */
export function cutInScale(viewport: { readonly width: number; readonly height: number }, headroom: number): number {
  const fit = Math.min((viewport.height - 2 * MARGIN) / (CARD_H + headroom), (viewport.width - 32) / CARD_W);
  return Number(Math.min(1.25, Math.max(0.5, fit)).toFixed(3));
}

/** Écart entre le centre de l'écran et le centre de la case d'arrivée, en px. */
export interface CutInExit {
  readonly dx: number;
  readonly dy: number;
}

const px = (value: number) => `${Number(value.toFixed(1))}px`;
const pose = (dx: number, dy: number, scale: number, turn: number, tilt: number) =>
  `translate(-50%, -50%) translate(${px(dx)}, ${px(dy)}) perspective(1400px) rotateY(${turn}deg) rotateZ(${tilt}deg) scale(${Number(scale.toFixed(3))})`;

/**
 * Images clés de la carte, centrée sur le centre de l'écran : elle surgit en pivotant dans un éclair, se pose à
 * l'échelle `scale`, reste, puis file vers sa case (`exit`) en rapetissant jusqu'à la taille d'un jeton ; sans case, elle
 * grossit en s'effaçant sur place.
 */
export function cutInFrames(scale: number, exit: CutInExit | null): Keyframe[] {
  const out = exit
    ? { transform: pose(exit.dx, exit.dy, LANDING_W / CARD_W, 0, 0), opacity: 0.4, filter: 'brightness(1.6)' }
    : { transform: pose(0, 0, scale * 1.18, 0, 0), opacity: 0, filter: 'brightness(2.2)' };
  return [
    { transform: pose(0, 40, scale * 0.62, -32, -4), opacity: 0, filter: 'brightness(2.4)', easing: 'cubic-bezier(.2,.8,.3,1)' },
    { transform: pose(0, 0, scale * 1.06, 4, 0.6), opacity: 1, filter: 'brightness(1.5)', offset: BURST, easing: 'ease-out' },
    { transform: pose(0, 0, scale, 0, 0), opacity: 1, filter: 'brightness(1)', offset: SETTLE, easing: 'linear' },
    { transform: pose(0, 0, scale * 1.025, 0, 0), opacity: 1, filter: 'brightness(1)', offset: LEAVE, easing: 'cubic-bezier(.45,0,.55,1)' },
    out,
  ];
}

/** Voile sur le plateau : il fonce l'écran pendant que la carte est au centre, et s'en va avec elle. */
export const CUT_IN_BACKDROP: Keyframe[] = [
  { opacity: 0 },
  { opacity: 1, offset: 0.18 },
  { opacity: 1, offset: LEAVE },
  { opacity: 0 },
];

/** Rayons derrière la carte : ils s'ouvrent avec elle, tournent un peu, et s'éteignent quand elle repart. */
export function cutInRays(scale: number): Keyframe[] {
  const at = (s: number, deg: number) => `translate(-50%, -50%) rotate(${deg}deg) scale(${Number(s.toFixed(3))})`;
  return [
    { transform: at(scale * 0.3, 0), opacity: 0 },
    { transform: at(scale, 10), opacity: 1, offset: SETTLE },
    { transform: at(scale * 1.08, 24), opacity: 0.85, offset: LEAVE },
    { transform: at(scale * 1.2, 30), opacity: 0 },
  ];
}
