// Journal des actions (SPEC.md §7) : une entrée par action, déduite de l'action et des vues avant/après — sa phrase,
// son icône, le camp qui agit, et ses conséquences (dégâts, destructions, VP…), chacune avec son icône, en arborescence :
// une conséquence qui en entraîne une autre la porte sous elle (destruction → VP, dégâts → carapace).
// Les vues ne contiennent que des informations publiques : le journal ne révèle rien de caché. Les deux joueurs le
// lisent : la case d'un de ses monstres invisibles pour l'adversaire n'y apparaît jamais (§10).
import { getCard, getCell, getMonsterCard, samePos } from '../engine';
import type { Action, Board, CardId, CardSet, Direction, ManaZoneId, PlayerId, PlayerView, Position, Unit, UnitId } from '../engine';
import type { IconName } from './Icon';
import { cardTitle } from './cardText';
import { statusLabel } from './statusInfo';

/** Couleur d'une conséquence : perte (PV, destruction, piège), gain (bonus), VP, information. */
export type LogTone = 'hurt' | 'good' | 'vp' | 'info';

/** Conséquence d'une action, avec son icône ; ce qu'elle a entraîné à son tour, dessous. */
export interface LogItem {
  readonly icon: IconName;
  readonly text: string;
  readonly tone: LogTone;
  readonly children?: readonly LogItem[];
}

/** Un nom de carte dans les phrases d'une entrée (`text` : tel qu'écrit, « Milicien de J1 »), à la couleur de son camp. */
export interface LogName {
  readonly text: string;
  readonly name: string;
  readonly player: PlayerId;
}

/** Entrée du journal : une par action (et le début de partie, et les actions refusées). */
export interface LogEntry {
  /** `turn` : fin d'un tour et début du suivant ; `start` : début de partie ; `refused` : action refusée. */
  readonly kind: 'action' | 'turn' | 'start' | 'refused';
  /** Camp qui agit (ou qui commence son tour), `null` pour le début de partie. */
  readonly player: PlayerId | null;
  readonly icon: IconName;
  readonly text: string;
  readonly items: readonly LogItem[];
  /** Début de tour : son numéro, son joueur, le mana et les VP reçus. */
  readonly turn?: { readonly number: number; readonly player: PlayerId; readonly mana: number; readonly vp: number };
  /** Noms des cartes dans ses phrases (`logSegments`). */
  readonly names?: readonly LogName[];
}

const item = (icon: IconName, text: string, tone: LogTone): LogItem => ({ icon, text, tone });

const ZONE_NAMES: Readonly<Record<ManaZoneId, string>> = {
  ecurie: 'l’Écurie',
  ferme: 'la Ferme',
  forge: 'la Forge',
  scierie: 'la Scierie',
  mine: 'la Mine',
};

const DIRECTION_NAMES: Readonly<Record<Direction, string>> = {
  up: 'le haut',
  down: 'le bas',
  left: 'la gauche',
  right: 'la droite',
};

const unitName = (cards: CardSet, unit: Unit) => `${getCard(cards, unit.cardId).name} de J${unit.owner}`;

/** « sur la Forge » pour une mana zone, « en (8, 1) » sinon. */
export function place(board: Board, pos: Position): string {
  const cell = getCell(board, pos);
  return cell.kind === 'plain' && cell.manaZone ? `sur ${ZONE_NAMES[cell.manaZone]}` : `en (${pos.row}, ${pos.col})`;
}

/** Mana et VP publics d'un joueur, quel que soit celui qui regarde. */
const publicInfo = (view: PlayerView, player: PlayerId) => (player === view.viewer ? view.me : view.opponent);

/** Le monstre est invisible pour l'adversaire de celui qui regarde : sa case ne doit pas apparaître. */
const isSecret = (view: PlayerView, unitId: UnitId) => view.hiddenFromOpponent.includes(unitId);

/** L'effet actif de rang `effect` d'un monstre, s'il l'a. */
function abilityOf(view: PlayerView, unitId: UnitId, effect = 0) {
  const unit = view.units[unitId];
  const card = unit ? getCard(view.cards, unit.cardId) : null;
  return card?.kind === 'monster' ? card.activated[effect] : undefined;
}

/** Nom de l'effet actif d'un monstre (« Dopage »), ou « son effet ». */
function effectName(view: PlayerView, unitId: UnitId, effect = 0): string {
  return abilityOf(view, unitId, effect)?.name ?? 'son effet';
}

/**
 * Case où l'action a fait arriver un monstre : celle d'une invocation (`summon`), ou celle où `unitId` a été téléporté ou
 * est revenu. Elle diffère de la case visée quand un monstre caché l'occupait (§10, 2026-11-12) ; `fallback` sinon.
 */
function landedAt(after: PlayerView, fallback: Position, unitId?: UnitId): Position {
  for (const event of after.events) {
    if (!unitId && event.type === 'summon' && event.unit.kind === 'monster') return event.unit.pos;
    if (unitId && (event.type === 'teleport' || event.type === 'rewind') && event.unitId === unitId) return event.to;
  }
  return fallback;
}

/**
 * Rien n'a été joué : la case d'arrivée portait un monstre caché, et aucune autre case valide (§10, 2026-11-12). Seule la
 * révélation reste ; ni carte jouée, ni effet lancé.
 */
function blockedArrival(action: Action, after: PlayerView): boolean {
  if (action.type === 'playCard') return !after.events.some((event) => event.type === 'cardPlayed');
  if (action.type === 'activateEffect') return !after.events.some((event) => event.type === 'effect');
  return false;
}

const BLOCKED = 'mais un monstre caché occupe la case : rien n’est joué';

function describeIntent(view: PlayerView, action: Action, after: PlayerView): string {
  const actor = `J${view.activePlayer}`;
  const name = (unitId: UnitId) => {
    const unit = view.units[unitId];
    return unit ? unitName(after.cards, unit) : unitId;
  };

  if (blockedArrival(action, after)) {
    if (action.type === 'playCard') {
      const card = getCard(after.cards, action.cardId);
      return card.kind === 'monster' && action.target.kind === 'cell'
        ? `${actor} veut invoquer ${card.name} ${place(view.board, action.target.pos)}, ${BLOCKED}.`
        : `${actor} veut lancer ${card.name}, ${BLOCKED}.`;
    }
    if (action.type === 'activateEffect') return `${name(action.unitId)} veut utiliser ${effectName(view, action.unitId, action.effect)}, ${BLOCKED}.`;
  }

  switch (action.type) {
    case 'playCard': {
      const card = getCard(after.cards, action.cardId);
      const { target } = action;
      if (target.kind === 'cell') {
        if (card.kind === 'monster') {
          const at = landedAt(after, target.pos);
          const summoned = Object.values(after.units).find((u) => !view.units[u.id] && samePos(u.pos, at));
          if (summoned && isSecret(after, summoned.id)) return `${actor} invoque ${card.name}, invisible.`;
          return `${actor} invoque ${card.name} ${place(view.board, at)}.`;
        }
        return `${actor} pose ${card.name} ${place(view.board, target.pos)}.`;
      }
      if (target.kind === 'cellAndCard') {
        // Réanimation : le monstre revient de son cimetière.
        const at = landedAt(after, target.pos);
        const back = Object.values(after.units).find((u) => !view.units[u.id] && samePos(u.pos, at));
        const where = back && isSecret(after, back.id) ? ', invisible' : ` ${place(view.board, at)}`;
        return `${actor} lance ${card.name} : ${getCard(after.cards, target.cardId).name} revient${where}.`;
      }
      if (target.kind === 'unitAndCell') {
        const where = isSecret(after, target.unitId) ? '' : ` ${place(view.board, landedAt(after, target.pos, target.unitId))}`;
        return `${actor} lance ${card.name} : ${name(target.unitId)} est téléporté${where}.`;
      }
      if (target.kind === 'area' || target.kind === 'card' || target.kind === 'all') {
        return `${actor} lance ${card.name}.`;
      }
      const direction = target.kind === 'unitAndDirection' ? ` vers ${DIRECTION_NAMES[target.direction]}` : '';
      return `${actor} lance ${card.name} sur ${name(target.unitId)}${direction}.`;
    }
    case 'move': {
      const unit = view.units[action.unitId];
      const unitLabel = unit ? getCard(after.cards, unit.cardId).name : action.unitId;
      if (isSecret(after, action.unitId)) {
        return isSecret(view, action.unitId)
          ? `${actor} déplace ${unitLabel}, invisible.`
          : `${actor} déplace ${unitLabel}, qui disparaît.`;
      }
      return `${actor} déplace ${unitLabel} ${place(view.board, action.to)}.`;
    }
    case 'attack':
      return `${name(action.unitId)} attaque ${name(action.targetId)}.`;
    case 'attackCell':
      // Flèche explosive sur une case vide (2026-11-10) : la case est publique, le tir se voit.
      return `${name(action.unitId)} tire ${place(view.board, action.pos)}.`;
    case 'activateEffect':
      // Un piège reste secret : sa case n'apparaît pas dans le journal, que les deux joueurs lisent.
      if (action.target.kind === 'cell') {
        // Retour (Explorateur du temps) : il revient sur une case de son chemin, que tout le monde voit.
        if (abilityOf(view, action.unitId, action.effect)?.effects.some((effect) => effect.type === 'returnOnTrail')) {
          return `${name(action.unitId)} revient dans le temps ${place(view.board, landedAt(after, action.target.pos, action.unitId))}.`;
        }
        // Une case brûlée est publique ; un piège reste secret.
        const burned = after.events.find((event) => event.type === 'cellBurned');
        if (burned) return `${name(action.unitId)} met le feu ${place(view.board, action.target.pos)}.`;
        return `${name(action.unitId)} pose un piège.`;
      }
      if (action.target.kind === 'cellAndCard') {
        const { cardId } = action.target;
        const pos = landedAt(after, action.target.pos);
        const summoned = Object.values(after.units).find((u) => !view.units[u.id] && samePos(u.pos, pos));
        if (summoned && isSecret(after, summoned.id)) return `${name(action.unitId)} invoque ${getCard(after.cards, cardId).name}, invisible.`;
        return `${name(action.unitId)} invoque ${getCard(after.cards, cardId).name} ${place(view.board, pos)}.`;
      }
      if (action.target.kind === 'unitAndCell') {
        const { unitId, pos } = action.target;
        const where = isSecret(after, unitId) ? '' : ` ${place(view.board, landedAt(after, pos, unitId))}`;
        return `${name(action.unitId)} téléporte ${name(unitId)}${where}.`;
      }
      if (action.target.kind === 'card') {
        return `${name(action.unitId)} évolue en ${getCard(after.cards, action.target.cardId).name} ${place(view.board, view.units[action.unitId]?.pos ?? { row: 0, col: 0 })}.`;
      }
      if (action.target.kind === 'all') return `${name(action.unitId)} utilise ${effectName(view, action.unitId, action.effect)}.`;
      if (action.target.kind === 'area') {
        const direction = action.target.direction ? ` vers ${DIRECTION_NAMES[action.target.direction]}` : '';
        const distance = action.target.distance ? ` (recul de ${action.target.distance})` : '';
        return `${name(action.unitId)} lance ${effectName(view, action.unitId, action.effect)}${direction}${distance}.`;
      }
      // Effet sur lui-même : transformation (Emma), Dopage.
      if (action.target.unitId === action.unitId) {
        const transform = abilityOf(view, action.unitId, action.effect)?.effects.find((effect) => effect.type === 'transform');
        if (transform?.type === 'transform') return `${name(action.unitId)} se transforme en ${cardTitle(after.cards, transform.into)}.`;
        return `${name(action.unitId)} utilise ${effectName(view, action.unitId, action.effect)}.`;
      }
      return `${name(action.unitId)} utilise son effet sur ${name(action.target.unitId)}.`;
    case 'endTurn':
      return `${actor} termine son tour.`;
  }
}

/** Icône de l'action : invocation, terrain, sort, déplacement, attaque (au contact ou à distance), effet. */
function intentIcon(view: PlayerView, action: Action, after: PlayerView): IconName {
  switch (action.type) {
    case 'playCard': {
      const { kind } = getCard(after.cards, action.cardId);
      return kind === 'monster' ? 'dragon-head' : kind === 'terrain' ? 'castle' : 'spell-book';
    }
    case 'move':
      return 'walking-boot';
    case 'attack': {
      const attacker = view.units[action.unitId];
      const target = view.units[action.targetId];
      const far = attacker && target && Math.abs(attacker.pos.row - target.pos.row) + Math.abs(attacker.pos.col - target.pos.col) > 1;
      return attacker?.kind === 'monster' && far && getMonsterCard(after.cards, attacker.cardId).range > 1 ? 'high-shot' : 'broadsword';
    }
    case 'attackCell':
      return 'high-shot';
    case 'activateEffect':
      return after.events.some((event) => event.type === 'cellBurned') ? 'flame' : 'magic-swirl';
    case 'endTurn':
      return 'water-drop';
  }
}

/** Unité visée par l'action, dont les conséquences sont décrites en premier. */
function targetOf(action: Action): UnitId | null {
  switch (action.type) {
    case 'attack':
      return action.targetId;
    case 'activateEffect':
    case 'playCard':
      return action.target.kind === 'unit' || action.target.kind === 'unitAndDirection' || action.target.kind === 'unitAndCell'
        ? action.target.unitId
        : null;
    case 'attackCell':
    case 'move':
    case 'endTurn':
      return null;
  }
}

/** Une destruction du journal et le camp de l'unité détruite (pour y rattacher les VP gagnés). */
interface Destroyed {
  readonly item: LogItem;
  readonly owner: PlayerId;
}

/**
 * Conséquences visibles sur les unités : dégâts, soins, destructions, bonus, reculs, avancées. Les destructions sont
 * aussi rendues à part, dans `destroyed`.
 */
function describeUnitChanges(before: PlayerView, action: Action, after: PlayerView, destroyed: Destroyed[] = []): LogItem[] {
  const lines: LogItem[] = [];
  const target = targetOf(action);
  const units = Object.values(before.units).sort((a, b) => Number(b.id === target) - Number(a.id === target));
  for (const unit of units) {
    const next = after.units[unit.id];
    if (!next && action.type === 'activateEffect' && action.target.kind === 'card' && action.unitId === unit.id) {
      continue; // Sacrifié pour évoluer : déjà dit dans la phrase de l'action.
    }
    if (!next) {
      // Un monstre adverse invisible qui sort de la vue n'est pas détruit ; un requiem arrivé à son terme le tue.
      const requiem = after.events.some((event) => event.type === 'requiem' && event.unitId === unit.id);
      if (after.hiddenEnemies.includes(unit.id)) {
        lines.push(item('eye-slash', `${unitName(after.cards, unit)} disparaît.`, 'info'));
      } else if (requiem) {
        lines.push(item('death-skull', `${unitName(after.cards, unit)} succombe (requiem).`, 'hurt'));
      } else {
        const gone = item('tombstone', `${unitName(after.cards, unit)} est détruit.`, 'hurt');
        destroyed.push({ item: gone, owner: unit.owner });
        lines.push(gone);
      }
      continue;
    }
    // Carapace : des dégâts qui l'auraient fait descendre sous 1 PV ont été retenus ; sous la perte de PV, s'il y en a une.
    const held = after.events.some((event) => event.type === 'damage' && event.unitId === unit.id && event.held)
      ? item('shield', `${unitName(after.cards, unit)} tient à 1 PV (carapace).`, 'info')
      : null;
    if (next.hp !== unit.hp) {
      const lost = next.hp < unit.hp;
      const hp = item(lost ? 'health-decrease' : 'health-increase', `${unitName(after.cards, unit)} : ${unit.hp} → ${next.hp} PV.`, lost ? 'hurt' : 'good');
      lines.push(held ? { ...hp, children: [held] } : hp);
    } else if (held) {
      lines.push(held);
    }
    // Cure : ses malus retirés.
    for (const event of after.events) {
      if (event.type !== 'cleansed' || event.unitId !== unit.id) continue;
      const names = [...new Set(event.removed.map(statusLabel))].join(', ');
      lines.push(item('magic-swirl', `${unitName(after.cards, unit)} : malus retirés (${names}).`, 'good'));
    }
    if (next.kind !== 'monster' || unit.kind !== 'monster') continue;
    if (next.atk !== unit.atk) {
      lines.push(item('broadsword', `${unitName(after.cards, unit)} : ATK ${unit.atk} → ${next.atk}.`, next.atk > unit.atk ? 'good' : 'hurt'));
    }
    if (next.atkBonus > unit.atkBonus) lines.push(item('broadsword', `${unitName(after.cards, unit)} : +${next.atkBonus - unit.atkBonus} ATK ce tour.`, 'good'));
    if (next.rangeBonus > unit.rangeBonus) {
      lines.push(item('high-shot', `${unitName(after.cards, unit)} : +${next.rangeBonus - unit.rangeBonus} portée ce tour.`, 'good'));
    }
    const requiems = (u: Unit) => u.statuses.filter((status) => status.kind === 'requiem');
    const requiem = requiems(next).at(-1);
    if (requiem && requiems(next).length > requiems(unit).length) {
      lines.push(item('death-skull', `${unitName(after.cards, unit)} : requiem.`, 'hurt'));
    }
    if (action.type === 'playCard' && next.mobilityLeft > unit.mobilityLeft) {
      lines.push(item('walking-boot', `${unitName(after.cards, unit)} : +${next.mobilityLeft - unit.mobilityLeft} mobilité ce tour.`, 'good'));
    }
    // Parti de la zone d'un Terrain de chasse ; rien pour un monstre caché à l'adversaire (ce serait dire où il était).
    for (const event of after.events) {
      if (event.type !== 'mobility' || event.unitId !== unit.id || !event.source || isSecret(after, unit.id)) continue;
      lines.push(item('walking-boot', `${unitName(after.cards, unit)} : +${event.amount} mobilité ce tour (${getCard(after.cards, event.source).name}).`, 'good'));
    }
    const teleported = (action.type === 'activateEffect' || action.type === 'playCard') && action.target.kind === 'unitAndCell' && action.target.unitId === unit.id;
    const returned = action.type === 'activateEffect' && action.target.kind === 'cell' && action.unitId === unit.id;
    if (!samePos(next.pos, unit.pos) && action.type !== 'move' && !teleported && !returned) {
      const where = isSecret(after, unit.id) ? '' : ` ${place(after.board, next.pos)}`;
      const rewound = after.events.some((event) => event.type === 'rewind' && event.unitId === unit.id);
      const verb = rewound ? 'remonte le temps et revient' : action.type === 'attack' ? 'avance' : 'recule';
      lines.push(item('walking-boot', `${unitName(after.cards, unit)} ${verb}${where}.`, 'info'));
    }
  }
  return lines;
}

/**
 * Piège caché révélé par ses effets : un monstre qui perd des PV ou s'arrête en route pendant son déplacement,
 * ou un monstre invoqué qui disparaît aussitôt.
 */
function describeTrap(before: PlayerView, action: Action, after: PlayerView, blockers: readonly Unit[]): LogItem[] {
  const trapped = after.events.some((event) => event.type === 'trapTriggered');
  if (action.type === 'move') {
    const unit = before.units[action.unitId];
    const moved = after.units[action.unitId];
    if (!unit) return [];
    if (trapped && (!moved || moved.hp < unit.hp)) return [item('fishing-net', `${unitName(after.cards, unit)} déclenche un piège !`, 'hurt')];
    if (!moved) return [];
    if (!samePos(moved.pos, action.to) && blockers.length > 0) {
      return [item('eye', `${unitName(after.cards, unit)} est arrêté ${place(after.board, moved.pos)}.`, 'hurt')];
    }
    if (after.events.some((event) => event.type === 'rewind' && event.unitId === action.unitId)) {
      return [item('fishing-net', `${unitName(after.cards, unit)} déclenche un sablier : il remonte le temps ${place(after.board, moved.pos)} et ne peut plus bouger de ce tour.`, 'hurt')];
    }
    if (!samePos(moved.pos, action.to)) {
      return [item('fishing-net', `${unitName(after.cards, unit)} est pris au piège ${place(after.board, moved.pos)} et ne peut plus bouger de ce tour.`, 'hurt')];
    }
  }
  const summoned = blockedArrival(action, after)
    ? null
    : action.type === 'playCard' && action.target.kind === 'cell' && getCard(after.cards, action.cardId).kind === 'monster'
      ? { pos: landedAt(after, action.target.pos), cardId: action.cardId }
      : action.type === 'activateEffect' && action.target.kind === 'cellAndCard'
        ? { pos: landedAt(after, action.target.pos), cardId: action.target.cardId }
        : null;
  if (summoned && !Object.values(after.units).some((u) => u.kind === 'monster' && samePos(u.pos, summoned.pos))) {
    const how = trapped ? 'tombe dans un piège et est détruit' : 'est détruit à son arrivée';
    return [item('tombstone', `${getCard(after.cards, summoned.cardId).name} de J${before.activePlayer} ${how}.`, 'hurt')];
  }
  return [];
}

/** Unités « Passage » et cases brûlées déclenchées pendant l'action (publiques : elles sont sur le plateau). */
function describePassages(before: PlayerView, after: PlayerView): LogItem[] {
  return after.events.flatMap((event) => {
    if (event.type === 'burningCell') {
      const unit = before.units[event.unitId] ?? after.units[event.unitId];
      return unit ? [item('flame', `${unitName(after.cards, unit)} marche dans le feu ${place(after.board, event.cell.pos)}.`, 'hurt')] : [];
    }
    if (event.type !== 'passage') return [];
    const terrain = after.units[event.sourceId] ?? before.units[event.sourceId];
    const unit = before.units[event.unitId] ?? after.units[event.unitId];
    if (!terrain || !unit) return [];
    return [item('magic-swirl', `${unitName(after.cards, terrain)} se déclenche sur ${unitName(after.cards, unit)}.`, 'hurt')];
  });
}

/**
 * Monstres adverses invisibles jusque-là qui apparaissent : approchés, ou révélés pour avoir bloqué l'action (§10).
 * Hors fin de tour, où la vue change de tour mais pas de plateau.
 */
function getRevealed(before: PlayerView, action: Action, after: PlayerView): Unit[] {
  if (action.type === 'endTurn') return [];
  return Object.values(after.units).filter((u) => u.owner !== after.viewer && before.hiddenEnemies.includes(u.id));
}

/** Ceux qui viennent de bloquer l'action : déplacement, tir ou recul. */
function getBlockers(before: PlayerView, after: PlayerView): Unit[] {
  return Object.values(after.units).filter(
    (u) => {
      const was = before.units[u.id];
      return u.kind === 'monster' && u.revealed && !(was?.kind === 'monster' && was.revealed);
    },
  );
}

function describeReveal(action: Action, revealed: readonly Unit[], blockers: readonly Unit[], after: PlayerView): LogItem[] {
  return revealed.map((unit) =>
    item(
      'eye',
      action.type === 'attack' && blockers.includes(unit)
        ? `${unitName(after.cards, unit)} apparaît ${place(after.board, unit.pos)} et arrête le tir !`
        : `${unitName(after.cards, unit)} apparaît ${place(after.board, unit.pos)} !`,
      'info',
    ),
  );
}

/** Ce qu'une action a fait, dans l'ordre du journal. */
interface Outcome {
  readonly intent: string;
  readonly icon: IconName;
  /** Apparitions, pièges, Passage, conséquences sur les unités. */
  readonly items: readonly LogItem[];
  /** VP gagnés, ou revenus du début de tour. */
  readonly gains: readonly LogItem[];
  readonly winner: LogItem | null;
  readonly turn?: LogEntry['turn'];
  /** Unités détruites (parmi `items`). */
  readonly destroyed: readonly Destroyed[];
  /** VP gagnés pendant l'action (parmi `gains`), par joueur. */
  readonly vpGains: readonly { readonly item: LogItem; readonly player: PlayerId }[];
}

function outcome(before: PlayerView, action: Action, after: PlayerView): Outcome {
  const revealed = getRevealed(before, action, after);
  const blockers = getBlockers(before, after);
  const destroyed: Destroyed[] = [];
  const vpGains: { item: LogItem; player: PlayerId }[] = [];
  const items = [
    ...describeReveal(action, revealed, blockers, after),
    ...describeTrap(before, action, after, blockers),
    ...describePassages(before, after),
    ...describeUnitChanges(before, action, after, destroyed),
  ];
  const gains: LogItem[] = [];
  let turn: LogEntry['turn'];
  if (action.type === 'endTurn') {
    const player = after.activePlayer;
    const gain = (key: 'vp') => publicInfo(after, player)[key] - publicInfo(before, player)[key];
    // Le mana non dépensé est perdu au début du tour : ce qu'il a maintenant, c'est ce qu'il reçoit.
    turn = { number: after.turn, player, mana: publicInfo(after, player).mana, vp: gain('vp') };
    gains.push(item('water-drop', `Tour ${after.turn} : J${player} reçoit ${turn.mana} mana et ${turn.vp} VP.`, 'info'));
  } else {
    // Mana gagné pendant le tour (Élixir de mana, Pillage).
    for (const event of after.events) {
      if (event.type === 'mana' && event.amount > 0) gains.push(item('water-drop', `J${event.player} gagne ${event.amount} mana.`, 'good'));
    }
    for (const player of [1, 2] as const) {
      const gain = publicInfo(after, player).vp - publicInfo(before, player).vp;
      if (gain > 0) {
        const vp = item('crown', `J${player} gagne ${gain} VP (${publicInfo(after, player).vp} au total).`, 'vp');
        vpGains.push({ item: vp, player });
        gains.push(vp);
      }
    }
  }
  const winner = after.winner !== null && before.winner === null ? item('crown', `J${after.winner} remporte la partie !`, 'vp') : null;
  return { intent: describeIntent(before, action, after), icon: intentIcon(before, action, after), items, gains, winner, turn, destroyed, vpGains };
}

/** Les conséquences et ce qu'elles ont entraîné, dans l'ordre de lecture. */
const flatten = (items: readonly LogItem[]): LogItem[] => items.flatMap((i) => [i, ...flatten(i.children ?? [])]);

/** Phrases du journal pour une action : la sienne, puis ses conséquences. */
export function describeAction(before: PlayerView, action: Action, after: PlayerView): string[] {
  const { intent, items, gains, winner } = outcome(before, action, after);
  return [intent, ...flatten(items).map((i) => i.text), ...gains.map((i) => i.text), ...(winner ? [winner.text] : [])];
}

/**
 * Noms des cartes dans les phrases d'une entrée : chaque unité des deux vues (« Milicien de J1 »), et la carte jouée ou
 * visée par le joueur actif, que la phrase nomme seule (« J1 invoque Milicien »), comme le monstre qu'il déplace.
 */
function namesOf(before: PlayerView, action: Action, after: PlayerView): LogName[] {
  const names = new Map<string, LogName>();
  const add = (name: string, player: PlayerId, bare = false) => {
    for (const text of bare ? [`${name} de J${player}`, name] : [`${name} de J${player}`]) {
      if (!names.has(text)) names.set(text, { text, name, player });
    }
  };
  for (const unit of [...Object.values(before.units), ...Object.values(after.units)]) {
    add(getCard(after.cards, unit.cardId).name, unit.owner);
  }
  const actor = before.activePlayer;
  const cardName = (cardId: CardId) => getCard(after.cards, cardId).name;
  if (action.type === 'playCard') add(cardName(action.cardId), actor, true);
  if ((action.type === 'playCard' || action.type === 'activateEffect') && (action.target.kind === 'cellAndCard' || action.target.kind === 'card')) {
    add(cardName(action.target.cardId), actor, true);
  }
  if (action.type === 'move') {
    const unit = before.units[action.unitId];
    if (unit) add(cardName(unit.cardId), unit.owner, true);
  }
  return [...names.values()];
}

/**
 * Entrée du journal pour une action. Fin de tour : une entrée « tour » (numéro, joueur, mana et VP reçus), avec ce
 * qui s'est passé au début du tour (statuts, requiem…). Les VP d'une destruction se rangent sous elle quand elle est la
 * seule unité adverse détruite.
 */
export function logEntry(before: PlayerView, action: Action, after: PlayerView): LogEntry {
  const { intent, icon, items, gains, winner, turn, destroyed, vpGains } = outcome(before, action, after);
  const names = namesOf(before, action, after);
  const tail = winner ? [winner] : [];
  if (action.type === 'endTurn' && turn) {
    return { kind: 'turn', player: turn.player, icon, text: intent, items: [...items, ...tail], turn, names };
  }
  const nested = new Map<LogItem, LogItem>();
  for (const { item: vp, player } of vpGains) {
    const victims = destroyed.filter((d) => d.owner !== player);
    if (victims.length === 1) nested.set(victims[0]!.item, vp);
  }
  const under = new Set(nested.values());
  const tree = items.map((i) => (nested.has(i) ? { ...i, children: [...(i.children ?? []), nested.get(i)!] } : i));
  return { kind: 'action', player: before.activePlayer, icon, text: intent, items: [...tree, ...gains.filter((g) => !under.has(g)), ...tail], names };
}

/** Morceau d'une phrase du journal : du texte, le nom d'une carte (à la couleur de son camp) ou un joueur (« J1 »). */
export type LogSegment =
  | string
  | { readonly kind: 'name'; readonly name: string; readonly player: PlayerId; readonly title: string }
  | { readonly kind: 'player'; readonly player: PlayerId };

const WORD = /[\p{L}\p{N}]/u;

/**
 * Découpe une phrase du journal : les noms des cartes de l'entrée (le plus long d'abord, entre deux mots) et les
 * joueurs (« J1 », « J2 »), pour les écrire à la couleur de leur camp.
 */
export function logSegments(text: string, names: readonly LogName[] = []): LogSegment[] {
  const sorted = [...names].sort((a, b) => b.text.length - a.text.length);
  const out: LogSegment[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push(plain);
    plain = '';
  };
  const bounded = (from: number, length: number) =>
    (from === 0 || !WORD.test(text[from - 1]!)) && (from + length === text.length || !WORD.test(text[from + length]!));
  let i = 0;
  while (i < text.length) {
    const hit = sorted.find((n) => text.startsWith(n.text, i) && bounded(i, n.text.length));
    if (hit) {
      flush();
      out.push({ kind: 'name', name: hit.name, player: hit.player, title: hit.text });
      i += hit.text.length;
      continue;
    }
    const who = /^J([12])/.exec(text.slice(i, i + 2));
    if (who && bounded(i, 2)) {
      flush();
      out.push({ kind: 'player', player: Number(who[1]) as PlayerId });
      i += 2;
      continue;
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

/**
 * Actions de l'adversaire pendant son dernier tour, si le tour en cours est celui de `viewer` : ce que le badge du
 * journal replié compte (`key` : l'entrée du début de son tour, pour ne le montrer qu'une fois).
 */
export function unreadActions(entries: readonly LogEntry[], viewer: PlayerId): { player: PlayerId; count: number; key: number } | null {
  let mine = -1;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i]!.kind !== 'turn') continue;
    if (entries[i]!.player !== viewer) return null;
    mine = i;
    break;
  }
  if (mine < 0) return null;
  let from = mine - 1;
  while (from >= 0 && entries[from]!.kind !== 'turn') from -= 1;
  const player: PlayerId = viewer === 1 ? 2 : 1;
  const count = entries.slice(from + 1, mine).filter((e) => e.kind === 'action' && e.player === player).length;
  return { player, count, key: mine };
}
