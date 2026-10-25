// Journal des actions (SPEC.md §7) : phrases déduites de l'action et des vues avant/après.
// Les vues ne contiennent que des informations publiques : le journal ne révèle rien de caché. Les deux joueurs le
// lisent : la case d'un de ses monstres invisibles pour l'adversaire n'y apparaît jamais (§10).
import { getCard, getCell, samePos } from '../engine';
import type { Action, Board, Direction, ManaZoneId, PlayerId, PlayerView, Position, Unit, UnitId } from '../engine';

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
function describeUnitChanges(before: PlayerView, action: Action, after: PlayerView): string[] {
  const lines: string[] = [];
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
          ? `${unitName(unit)} disparaît.`
          : requiem
            ? `${unitName(unit)} succombe (requiem).`
            : `${unitName(unit)} est détruit.`,
      );
      continue;
    }
    if (next.hp !== unit.hp) lines.push(`${unitName(unit)} : ${unit.hp} → ${next.hp} PV.`);
    if (next.kind !== 'monster' || unit.kind !== 'monster') continue;
    if (next.atk !== unit.atk) lines.push(`${unitName(unit)} : ATK ${unit.atk} → ${next.atk}.`);
    if (next.atkBonus > unit.atkBonus) lines.push(`${unitName(unit)} : +${next.atkBonus - unit.atkBonus} ATK ce tour.`);
    if (next.rangeBonus > unit.rangeBonus) lines.push(`${unitName(unit)} : +${next.rangeBonus - unit.rangeBonus} portée ce tour.`);
    const requiems = (u: Unit) => u.statuses.filter((status) => status.kind === 'requiem');
    const requiem = requiems(next).at(-1);
    if (requiem && requiems(next).length > requiems(unit).length) lines.push(`${unitName(unit)} : requiem ${requiem.turns}.`);
    if (action.type === 'playCard' && next.mobilityLeft > unit.mobilityLeft) {
      lines.push(`${unitName(unit)} : +${next.mobilityLeft - unit.mobilityLeft} mobilité ce tour.`);
    }
    const teleported = action.type === 'activateEffect' && action.target.kind === 'unitAndCell' && action.target.unitId === unit.id;
    if (!samePos(next.pos, unit.pos) && action.type !== 'move' && !teleported) {
      const where = isSecret(after, unit.id) ? '' : ` ${place(after.board, next.pos)}`;
      lines.push(`${unitName(unit)} ${action.type === 'attack' ? 'avance' : 'recule'}${where}.`);
    }
  }
  return lines;
}

/**
 * Piège caché révélé par ses effets : un monstre qui perd des PV ou s'arrête en route pendant son déplacement,
 * ou un monstre invoqué qui disparaît aussitôt.
 */
function describeTrap(before: PlayerView, action: Action, after: PlayerView, blockers: readonly Unit[]): string[] {
  const trapped = after.events.some((event) => event.type === 'trapTriggered');
  if (action.type === 'move') {
    const unit = before.units[action.unitId];
    const moved = after.units[action.unitId];
    if (!unit) return [];
    if (trapped && (!moved || moved.hp < unit.hp)) return [`${unitName(unit)} déclenche un piège !`];
    if (!moved) return [];
    if (!samePos(moved.pos, action.to) && blockers.length > 0) {
      return [`${unitName(unit)} est arrêté ${place(after.board, moved.pos)} et ne peut plus bouger de ce tour.`];
    }
    if (!samePos(moved.pos, action.to)) {
      return [`${unitName(unit)} est pris au piège ${place(after.board, moved.pos)} et ne peut plus bouger de ce tour.`];
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
    return [`${getCard(summoned.cardId).name} de J${before.activePlayer} ${how}.`];
  }
  return [];
}

/** Unités « Passage » et cases brûlées déclenchées pendant l'action (publiques : elles sont sur le plateau). */
function describePassages(before: PlayerView, after: PlayerView): string[] {
  return after.events.flatMap((event) => {
    if (event.type === 'burningCell') {
      const unit = before.units[event.unitId] ?? after.units[event.unitId];
      return unit ? [`${unitName(unit)} marche dans le feu ${place(after.board, event.cell.pos)}.`] : [];
    }
    if (event.type !== 'passage') return [];
    const terrain = after.units[event.sourceId] ?? before.units[event.sourceId];
    const unit = before.units[event.unitId] ?? after.units[event.unitId];
    if (!terrain || !unit) return [];
    return [`${unitName(terrain)} se déclenche sur ${unitName(unit)}.`];
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

function describeReveal(action: Action, revealed: readonly Unit[], blockers: readonly Unit[], after: PlayerView): string[] {
  return revealed.map((unit) =>
    action.type === 'attack' && blockers.includes(unit)
      ? `${unitName(unit)} apparaît ${place(after.board, unit.pos)} et arrête le tir !`
      : `${unitName(unit)} apparaît ${place(after.board, unit.pos)} !`,
  );
}

export function describeAction(before: PlayerView, action: Action, after: PlayerView): string[] {
  const revealed = getRevealed(before, action, after);
  const blockers = getBlockers(before, after);
  const lines = [
    describeIntent(before, action, after),
    ...describeReveal(action, revealed, blockers, after),
    ...describeTrap(before, action, after, blockers),
    ...describePassages(before, after),
    ...describeUnitChanges(before, action, after),
  ];

  if (action.type === 'endTurn') {
    const player = after.activePlayer;
    const gain = (key: 'mana' | 'vp') => publicInfo(after, player)[key] - publicInfo(before, player)[key];
    lines.push(`Tour ${after.turn} : J${player} reçoit ${gain('mana')} mana et ${gain('vp')} VP.`);
  } else {
    for (const player of [1, 2] as const) {
      const gain = publicInfo(after, player).vp - publicInfo(before, player).vp;
      if (gain > 0) lines.push(`J${player} gagne ${gain} VP (${publicInfo(after, player).vp} au total).`);
    }
  }

  if (after.winner !== null && before.winner === null) lines.push(`J${after.winner} remporte la partie !`);
  return lines;
}
