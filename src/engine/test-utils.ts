// Outils réservés aux tests : construire des positions de jeu sans passer par les règles.
import { getCard } from './cards';
import { createGame } from './game';
import { addStatus } from './statuses';
import { createMonsterUnit, createTerrainUnit } from './units';
import type { Board, CardId, GameMode, GameState, MonsterUnit, PlayerId, PlayerState, Position, StatusKind, StatusSpec, Unit } from './types';

export const at = (row: number, col: number): Position => ({ row, col });

type MonsterSpec = { monster: CardId; owner: PlayerId; at: Position } & Partial<
  Pick<MonsterUnit, 'hp' | 'atk' | 'mobilityLeft' | 'hasAttacked' | 'usedEffects' | 'trail' | 'hasRiposted' | 'revealed' | 'facing'>
>;
type TerrainSpec = { terrain: CardId; owner: PlayerId; at: Position; hp?: number };
export type UnitSpec = MonsterSpec | TerrainSpec;

/**
 * Partie neuve où les unités sont posées directement, avec les ids u1, u2… dans l'ordre de `units`.
 * Aucune règle n'est vérifiée : c'est au test de décrire une position cohérente.
 * Par défaut, on est pendant le premier tour du joueur actif (tour 1 pour J1, tour 2 pour J2).
 */
export function gameWith(
  units: readonly UnitSpec[],
  options: {
    activePlayer?: PlayerId;
    board?: Board;
    mode?: GameMode;
    turn?: number;
    players?: Partial<Record<PlayerId, Partial<PlayerState>>>;
  } = {},
): GameState {
  const base = createGame(options.board, undefined, undefined, options.mode);
  const placed: Record<string, Unit> = {};
  units.forEach((spec, i) => {
    const id = `u${i + 1}`;
    if ('monster' in spec) {
      const { monster, owner, at: pos, ...overrides } = spec;
      const card = getCard(monster);
      if (card.kind !== 'monster') throw new Error(`${monster} n'est pas un monstre`);
      placed[id] = { ...createMonsterUnit(id, card, owner, pos, 0, base.board.mobilityBonus), ...overrides };
    } else {
      const { terrain, owner, at: pos, ...overrides } = spec;
      const card = getCard(terrain);
      if (card.kind !== 'terrain') throw new Error(`${terrain} n'est pas un terrain`);
      placed[id] = { ...createTerrainUnit(id, card, owner, pos), ...overrides };
    }
  });
  const activePlayer = options.activePlayer ?? base.activePlayer;
  return {
    ...base,
    activePlayer,
    turn: options.turn ?? (activePlayer === 2 ? 2 : 1),
    players: {
      1: { ...base.players[1], ...options.players?.[1] },
      2: { ...base.players[2], ...options.players?.[2] },
    },
    units: placed,
    nextUnitId: units.length + 1,
  };
}

/** Gèle récursivement un objet : toute mutation lèvera une erreur. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Pose un statut comme le ferait une carte, au tour en cours (sans garder l'événement). `amount` ne compte que pour
 * slow, burn et invisible ; `turns` : sa durée (§5.5), 0 = jusqu'au prochain tour de l'unité.
 */
export function withStatus(state: GameState, unitId: string, kind: StatusKind, amount = 0, turns = 1): GameState {
  const spec: StatusSpec =
    kind === 'slow' || kind === 'burn' || kind === 'camouflage' ? { kind, amount, turns } : { kind, turns };
  return { ...addStatus(state, unitId, spec), events: state.events };
}
