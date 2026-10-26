// Journal des actions (SPEC.md §7) : une entrée par action, déduite de l'action et des vues avant/après — sa phrase,
// son icône, le camp qui agit, et ses conséquences (dégâts, destructions, VP…), chacune avec son icône.
// Les vues ne contiennent que des informations publiques : le journal ne révèle rien de caché. Les deux joueurs le
// lisent : la case d'un de ses monstres invisibles pour l'adversaire n'y apparaît jamais (§10).
import { getCard, getCell, getMonsterCard, samePos } from '../engine';
import type { Action, Board, Direction, ManaZoneId, PlayerId, PlayerView, Position, Unit, UnitId } from '../engine';
import type { IconName } from './Icon';

/** Couleur d'une conséquence : perte (PV, destruction, piège), gain (bonus), VP, information. */
export type LogTone = 'hurt' | 'good' | 'vp' | 'info';

/** Conséquence d'une action, avec son icône. */
export interface LogItem {
  readonly icon: IconName;
  readonly text: string;
  readonly tone: LogTone;
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

const unitName = (unit: Unit) => `${getCard(unit.cardId).name} de J${unit.owner}`;

/** « sur la Forge » pour une mana zone, « en (8, 1) » sinon. */
export function place(board: Board, pos: Position): string {
  const cell = getCell(board, pos);
  return cell.kind === 'plain' && cell.manaZone ? `sur ${ZONE_NAMES[cell.manaZone]}` : `en (${pos.row}, ${pos.col})`;
}

/** Mana et VP publics d'un joueur, quel que soit celui qui regarde. */
const publicInfo = (view: PlayerView, player: PlayerId) => (player === view.viewer ? view.me : view.opponent);

/** Le monstre est invisible pour l'adversaire de celui qui regarde : sa case ne doit pas apparaître. */
const isSecret = (view: PlayerView, unitId: UnitId) => view.hiddenFromOpponent.includes(unitId);

/** Nom de l'effet actif d'un monstre (« Dopage »), ou « son effet ». */
function effectName(view: PlayerView, unitId: UnitId): string {
  const unit = view.units[unitId];
  const card = unit ? getCard(unit.cardId) : null;
  return card?.kind === 'monster' && card.activated?.name ? card.activated.name : 'son effet';
}

function describeIntent(view: PlayerView, action: Action, after: PlayerView): string {
  const actor = `J${view.activePlayer}`;
  const name = (unitId: UnitId) => {
    const unit = view.units[unitId];
    return unit ? unitName(unit) : unitId;
  };

  switch (action.type) {
    case 'playCard': {
      const card = getCard(action.cardId);
      const { target } = action;
      if (target.kind === 'cell') {
        const summoned = Object.values(after.units).find((u) => !view.units[u.id] && samePos(u.pos, target.pos));
        if (summoned && isSecret(after, summoned.id)) return `${actor} invoque ${card.name}, invisible.`;
        return `${actor} ${card.kind === 'monster' ? 'invoque' : 'pose'} ${card.name} ${place(view.board, target.pos)}.`;
      }
      if (target.kind === 'area' || target.kind === 'card' || target.kind === 'cellAndCard' || target.kind === 'all') {
        return `${actor} lance ${card.name}.`;
      }
      const direction = target.kind === 'unitAndDirection' ? ` vers ${DIRECTION_NAMES[target.direction]}` : '';
      return `${actor} lance ${card.name} sur ${name(target.unitId)}${direction}.`;
    }
    case 'move': {
      const unit = view.units[action.unitId];
      const unitLabel = unit ? getCard(unit.cardId).name : action.unitId;
      if (isSecret(after, action.unitId)) {
        return isSecret(view, action.unitId)
          ? `${actor} déplace ${unitLabel}, invisible.`
          : `${actor} déplace ${unitLabel}, qui disparaît.`;
      }
      return `${actor} déplace ${unitLabel} ${place(view.board, action.to)}.`;
    }
    case 'attack':
      return `${name(action.unitId)} attaque ${name(action.targetId)}.`;
    case 'activateEffect':
      // Un piège reste secret : sa case n'apparaît pas dans le journal, que les deux joueurs lisent.
      if (action.target.kind === 'cell') {
        // Une case brûlée est publique ; un piège reste secret.
        const burned = after.events.find((event) => event.type === 'cellBurned');
        if (burned) return `${name(action.unitId)} met le feu ${place(view.board, action.target.pos)}.`;
        return `${name(action.unitId)} pose un piège.`;
      }
      if (action.target.kind === 'cellAndCard') {
        const { pos, cardId } = action.target;
        const summoned = Object.values(after.units).find((u) => !view.units[u.id] && samePos(u.pos, pos));
        if (summoned && isSecret(after, summoned.id)) return `${name(action.unitId)} invoque ${getCard(cardId).name}, invisible.`;
        return `${name(action.unitId)} invoque ${getCard(cardId).name} ${place(view.board, pos)}.`;
      }
      if (action.target.kind === 'unitAndCell') {
        const where = isSecret(after, action.target.unitId) ? '' : ` ${place(view.board, action.target.pos)}`;
        return `${name(action.unitId)} téléporte ${name(action.target.unitId)}${where}.`;
      }
      if (action.target.kind === 'card') {
        return `${name(action.unitId)} évolue en ${getCard(action.target.cardId).name} ${place(view.board, view.units[action.unitId]?.pos ?? { row: 0, col: 0 })}.`;
      }
      if (action.target.kind === 'all') return `${name(action.unitId)} utilise ${effectName(view, action.unitId)}.`;
      if (action.target.kind === 'area') {
        const direction = action.target.direction ? ` vers ${DIRECTION_NAMES[action.target.direction]}` : '';
        const distance = action.target.distance ? ` (recul de ${action.target.distance})` : '';
        return `${name(action.unitId)} lance ${effectName(view, action.unitId)}${direction}${distance}.`;
      }
      // Effet sur lui-même (Dopage).
      if (action.target.unitId === action.unitId) return `${name(action.unitId)} utilise ${effectName(view, action.unitId)}.`;
      return `${name(action.unitId)} utilise son effet sur ${name(action.target.unitId)}.`;
    case 'endTurn':
      return `${actor} termine son tour.`;
  }
}

/** Icône de l'action : invocation, terrain, sort, déplacement, attaque (au contact ou à distance), effet. */
function intentIcon(view: PlayerView, action: Action, after: PlayerView): IconName {
  switch (action.type) {
    case 'playCard': {
      const { kind } = getCard(action.cardId);
      return kind === 'monster' ? 'dragon-head' : kind === 'terrain' ? 'castle' : 'spell-book';
    }
    case 'move':
      return 'walking-boot';
    case 'attack': {
      const attacker = view.units[action.unitId];
      const target = view.units[action.targetId];
      const far = attacker && target && Math.abs(attacker.pos.row - target.pos.row) + Math.abs(attacker.pos.col - target.pos.col) > 1;
      return attacker?.kind === 'monster' && far && getMonsterCard(attacker.cardId).range > 1 ? 'high-shot' : 'broadsword';
    }
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
    case 'move':
    case 'endTurn':
      return null;
  }
}

/** Conséquences visibles sur les unités : dégâts, soins, destructions, bonus, reculs, avancées. */
function describeUnitChanges(before: PlayerView, action: Action, after: PlayerView): LogItem[] {
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
      lines.push(
        after.hiddenEnemies.includes(unit.id)
          ? item('eye-slash', `${unitName(unit)} disparaît.`, 'info')
          : requiem
            ? item('death-skull', `${unitName(unit)} succombe (requiem).`, 'hurt')
            : item('death-skull', `${unitName(unit)} est détruit.`, 'hurt'),
      );
      continue;
    }
    if (next.hp !== unit.hp) lines.push(item('hearts', `${unitName(unit)} : ${unit.hp} → ${next.hp} PV.`, next.hp < unit.hp ? 'hurt' : 'good'));
    if (next.kind !== 'monster' || unit.kind !== 'monster') continue;
    if (next.atk !== unit.atk) {
      lines.push(item('broadsword', `${unitName(unit)} : ATK ${unit.atk} → ${next.atk}.`, next.atk > unit.atk ? 'good' : 'hurt'));
    }
    if (next.atkBonus > unit.atkBonus) lines.push(item('broadsword', `${unitName(unit)} : +${next.atkBonus - unit.atkBonus} ATK ce tour.`, 'good'));
    if (next.rangeBonus > unit.rangeBonus) {
      lines.push(item('high-shot', `${unitName(unit)} : +${next.rangeBonus - unit.rangeBonus} portée ce tour.`, 'good'));
    }
    const requiems = (u: Unit) => u.statuses.filter((status) => status.kind === 'requiem');
    const requiem = requiems(next).at(-1);
    if (requiem && requiems(next).length > requiems(unit).length) {
      lines.push(item('death-skull', `${unitName(unit)} : requiem ${requiem.turns}.`, 'hurt'));
    }
    if (action.type === 'playCard' && next.mobilityLeft > unit.mobilityLeft) {
      lines.push(item('walking-boot', `${unitName(unit)} : +${next.mobilityLeft - unit.mobilityLeft} mobilité ce tour.`, 'good'));
    }
    const teleported = action.type === 'activateEffect' && action.target.kind === 'unitAndCell' && action.target.unitId === unit.id;
    if (!samePos(next.pos, unit.pos) && action.type !== 'move' && !teleported) {
      const where = isSecret(after, unit.id) ? '' : ` ${place(after.board, next.pos)}`;
      lines.push(item('walking-boot', `${unitName(unit)} ${action.type === 'attack' ? 'avance' : 'recule'}${where}.`, 'info'));
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
    if (trapped && (!moved || moved.hp < unit.hp)) return [item('fishing-net', `${unitName(unit)} déclenche un piège !`, 'hurt')];
    if (!moved) return [];
    if (!samePos(moved.pos, action.to) && blockers.length > 0) {
      return [item('eye', `${unitName(unit)} est arrêté ${place(after.board, moved.pos)} et ne peut plus bouger de ce tour.`, 'hurt')];
    }
    if (!samePos(moved.pos, action.to)) {
      return [item('fishing-net', `${unitName(unit)} est pris au piège ${place(after.board, moved.pos)} et ne peut plus bouger de ce tour.`, 'hurt')];
    }
  }
  const summoned =
    action.type === 'playCard' && action.target.kind === 'cell' && getCard(action.cardId).kind === 'monster'
      ? { pos: action.target.pos, cardId: action.cardId }
      : action.type === 'activateEffect' && action.target.kind === 'cellAndCard'
        ? action.target
        : null;
  if (summoned && !Object.values(after.units).some((u) => u.kind === 'monster' && samePos(u.pos, summoned.pos))) {
    const how = trapped ? 'tombe dans un piège et est détruit' : 'est détruit à son arrivée';
    return [item('death-skull', `${getCard(summoned.cardId).name} de J${before.activePlayer} ${how}.`, 'hurt')];
  }
  return [];
}

/** Unités « Passage » et cases brûlées déclenchées pendant l'action (publiques : elles sont sur le plateau). */
function describePassages(before: PlayerView, after: PlayerView): LogItem[] {
  return after.events.flatMap((event) => {
    if (event.type === 'burningCell') {
      const unit = before.units[event.unitId] ?? after.units[event.unitId];
      return unit ? [item('flame', `${unitName(unit)} marche dans le feu ${place(after.board, event.cell.pos)}.`, 'hurt')] : [];
    }
    if (event.type !== 'passage') return [];
    const terrain = after.units[event.sourceId] ?? before.units[event.sourceId];
    const unit = before.units[event.unitId] ?? after.units[event.unitId];
    if (!terrain || !unit) return [];
    return [item('magic-swirl', `${unitName(terrain)} se déclenche sur ${unitName(unit)}.`, 'hurt')];
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
        ? `${unitName(unit)} apparaît ${place(after.board, unit.pos)} et arrête le tir !`
        : `${unitName(unit)} apparaît ${place(after.board, unit.pos)} !`,
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
}

function outcome(before: PlayerView, action: Action, after: PlayerView): Outcome {
  const revealed = getRevealed(before, action, after);
  const blockers = getBlockers(before, after);
  const items = [
    ...describeReveal(action, revealed, blockers, after),
    ...describeTrap(before, action, after, blockers),
    ...describePassages(before, after),
    ...describeUnitChanges(before, action, after),
  ];
  const gains: LogItem[] = [];
  let turn: LogEntry['turn'];
  if (action.type === 'endTurn') {
    const player = after.activePlayer;
    const gain = (key: 'mana' | 'vp') => publicInfo(after, player)[key] - publicInfo(before, player)[key];
    turn = { number: after.turn, player, mana: gain('mana'), vp: gain('vp') };
    gains.push(item('water-drop', `Tour ${after.turn} : J${player} reçoit ${turn.mana} mana et ${turn.vp} VP.`, 'info'));
  } else {
    for (const player of [1, 2] as const) {
      const gain = publicInfo(after, player).vp - publicInfo(before, player).vp;
      if (gain > 0) gains.push(item('laurels', `J${player} gagne ${gain} VP (${publicInfo(after, player).vp} au total).`, 'vp'));
    }
  }
  const winner = after.winner !== null && before.winner === null ? item('laurels', `J${after.winner} remporte la partie !`, 'vp') : null;
  return { intent: describeIntent(before, action, after), icon: intentIcon(before, action, after), items, gains, winner, turn };
}

/** Phrases du journal pour une action : la sienne, puis ses conséquences. */
export function describeAction(before: PlayerView, action: Action, after: PlayerView): string[] {
  const { intent, items, gains, winner } = outcome(before, action, after);
  return [intent, ...items.map((i) => i.text), ...gains.map((i) => i.text), ...(winner ? [winner.text] : [])];
}

/**
 * Entrée du journal pour une action. Fin de tour : une entrée « tour » (numéro, joueur, mana et VP reçus), avec ce
 * qui s'est passé au début du tour (statuts, requiem…).
 */
export function logEntry(before: PlayerView, action: Action, after: PlayerView): LogEntry {
  const { intent, icon, items, gains, winner, turn } = outcome(before, action, after);
  const tail = winner ? [winner] : [];
  if (action.type === 'endTurn' && turn) {
    return { kind: 'turn', player: turn.player, icon, text: intent, items: [...items, ...tail], turn };
  }
  return { kind: 'action', player: before.activePlayer, icon, text: intent, items: [...items, ...gains, ...tail] };
}
