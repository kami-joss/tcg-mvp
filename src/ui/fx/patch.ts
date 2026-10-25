// Pendant qu'une animation se joue, l'écran montre un état intermédiaire : la vue d'avant l'action, à laquelle on
// applique les événements un par un. Pure et testée : à la fin, l'écran reprend la vraie vue.
import { directionBetween, samePos } from '../../engine';
import type { GameEvent, PlayerId, PlayerView, Unit } from '../../engine';

function setPlayer(view: PlayerView, player: PlayerId, patch: { mana?: number; vp?: number }): PlayerView {
  return player === view.viewer ? { ...view, me: { ...view.me, ...patch } } : { ...view, opponent: { ...view.opponent, ...patch } };
}

const publicOf = (view: PlayerView, player: PlayerId) => (player === view.viewer ? view.me : view.opponent);

function updateUnit(view: PlayerView, unitId: string, update: (unit: Unit) => Unit): PlayerView {
  const unit = view.units[unitId];
  return unit ? { ...view, units: { ...view.units, [unitId]: update(unit) } } : view;
}

/** La vue `view` après l'événement `event`. `final` (la vraie vue d'après l'action) complète ce qui manque. */
export function applyEvent(view: PlayerView, event: GameEvent, final: PlayerView): PlayerView {
  switch (event.type) {
    case 'mana':
      return setPlayer(view, event.player, { mana: publicOf(view, event.player).mana + event.amount });
    case 'vp':
      return setPlayer(view, event.player, { vp: publicOf(view, event.player).vp + event.amount });
    case 'cardPlayed': {
      if (event.player !== view.viewer) return view;
      const index = view.me.grimoire.indexOf(event.cardId);
      if (index < 0) return view;
      const grimoire = [...view.me.grimoire.slice(0, index), ...view.me.grimoire.slice(index + 1)];
      return { ...view, me: { ...view.me, grimoire, used: [...view.me.used, event.cardId] } };
    }
    case 'summon':
      return { ...view, units: { ...view.units, [event.unit.id]: event.unit } };
    case 'revealed':
      return { ...view, units: { ...view.units, [event.unit.id]: final.units[event.unit.id] ?? event.unit } };
    case 'step':
      return updateUnit(view, event.unitId, (unit) =>
        unit.kind === 'monster'
          ? {
              ...unit,
              pos: event.to,
              facing: event.kind === 'push' ? unit.facing : directionBetween(event.from, event.to),
              mobilityLeft: event.kind === 'walk' ? Math.max(0, unit.mobilityLeft - 1) : unit.mobilityLeft,
            }
          : { ...unit, pos: event.to },
      );
    case 'stopped':
      return updateUnit(view, event.unitId, (unit) => ({ ...unit, pos: event.pos }));
    case 'teleport':
      return updateUnit(view, event.unitId, (unit) => ({ ...unit, pos: event.to }));
    case 'attack':
      return updateUnit(view, event.unitId, (unit) => (unit.kind === 'monster' ? { ...unit, hasAttacked: true } : unit));
    case 'damage':
      return updateUnit(view, event.unitId, (unit) => ({ ...unit, hp: event.hp }));
    case 'heal':
      return updateUnit(view, event.unitId, (unit) => ({ ...unit, hp: unit.hp + event.amount }));
    case 'buff':
      return updateUnit(view, event.unitId, (unit) =>
        unit.kind === 'monster' ? { ...unit, atk: unit.atk + event.atk, hp: unit.hp + event.hp, maxHp: unit.maxHp + event.hp } : unit,
      );
    case 'mobility':
      return updateUnit(view, event.unitId, (unit) =>
        unit.kind === 'monster' ? { ...unit, mobilityLeft: unit.mobilityLeft + event.amount } : unit,
      );
    case 'boost':
      return updateUnit(view, event.unitId, (unit) => (unit.kind === 'monster' ? { ...unit, atkBonus: unit.atkBonus + event.atk } : unit));
    case 'auraHp':
      return updateUnit(view, event.unitId, (unit) =>
        unit.kind === 'monster' ? { ...unit, hp: event.hp, maxHp: unit.maxHp + event.amount, auraHp: unit.auraHp + event.amount } : unit,
      );
    case 'reach':
      return updateUnit(view, event.unitId, (unit) =>
        unit.kind === 'monster' ? { ...unit, rangeBonus: unit.rangeBonus + event.amount } : unit,
      );
    case 'status': {
      const { kind } = event.status;
      return updateUnit(view, event.unitId, (unit) => {
        const statuses = [...unit.statuses, event.status];
        if (unit.kind !== 'monster') return { ...unit, statuses };
        if (kind === 'stun' || kind === 'immobilise') return { ...unit, statuses, mobilityLeft: 0 };
        // Un slow pris pendant son propre tour retire aussitôt de la mobilité (Terrain piégé, §5 bis).
        if (event.status.kind === 'slow' && unit.owner === view.activePlayer) {
          return { ...unit, statuses, mobilityLeft: Math.max(0, unit.mobilityLeft - event.status.amount) };
        }
        return { ...unit, statuses };
      });
    }
    case 'sacrifice':
    case 'requiem':
    case 'destroyed': {
      const { [event.unitId]: _gone, ...units } = view.units;
      return { ...view, units };
    }
    case 'trapPlaced':
      return { ...view, traps: [...view.traps, event.trap] };
    case 'trapTriggered':
      return { ...view, traps: view.traps.filter((t) => !(t.owner === event.trap.owner && samePos(t.pos, event.trap.pos))) };
    case 'effect':
      // L'effet est utilisé ; zone en ligne : la source se tourne vers la direction choisie.
      return updateUnit(view, event.unitId, (unit) =>
        unit.kind === 'monster' ? { ...unit, hasUsedEffect: true, ...(event.facing ? { facing: event.facing } : {}) } : unit,
      );
    case 'cellBurned':
      return { ...view, burningCells: [...view.burningCells, event.cell] };
    case 'turnStart':
    case 'passage':
    case 'burningCell':
    case 'shotBlocked':
    case 'riposte':
      return view;
  }
}
