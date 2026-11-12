import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_15, DECKS, applyAction, createGame, getHiddenUnitIds, getLegalActions, getPlayerView } from '.';
import type { Action, GameEvent, GameState, PlayerId } from '.';

// Parties en ligne (SPEC.md §7 ter) : tout ce que reçoit un joueur se lit dans son navigateur. Sur des parties jouées au
// hasard (graines fixes) avec les decks qui cachent le plus (camouflage, Pénombre, pièges, sablier, pièges électriques), à chaque position :
// les actions légales du joueur actif ne dépendent pas de ce qu'il ne voit pas, et la vue de chaque joueur ne contient
// ni un monstre qui lui est invisible ni sa case, ni un piège adverse, ni le grimoire adverse, ni le chemin d'un monstre
// adverse. Un événement peut nommer un monstre invisible sans sa case : une carte jouée vers lui, l'effet d'un monstre
// visible sur lui, le poseur du piège où entre un monstre (§10).

/** Tirage pseudo-aléatoire rejouable (xorshift 32 bits), dans [0, 1[. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const other = (player: PlayerId): PlayerId => (player === 1 ? 2 : 1);

/** L'état tel que le connaît `player` : sans les monstres qui lui sont invisibles, ni les pièges et le grimoire adverses. */
function seenBy(state: GameState, player: PlayerId): GameState {
  const hidden = new Set(getHiddenUnitIds(state, player));
  return {
    ...state,
    units: Object.fromEntries(Object.entries(state.units).filter(([id]) => !hidden.has(id))),
    traps: state.traps.filter((trap) => trap.owner === player),
    players: { ...state.players, [other(player)]: { ...state.players[other(player)], grimoire: [] } },
  };
}

const cardsOf = (id: string) => DECKS.find((deck) => deck.id === id)!.cards;

/** Les positions d'une partie jouée au hasard : une action légale tirée au sort, « Fin du tour » une fois sur cinq. */
function playedPositions(a: string, b: string, seed: number, actions: number): GameState[] {
  const random = seeded(seed);
  let state = createGame(BATTLEFIELD_15, { 1: cardsOf(a), 2: cardsOf(b) }, { 1: [], 2: [] }, 'contestation', 1, 'reserve');
  const positions: GameState[] = [];
  for (let n = 0; n < actions && state.winner === null; n++) {
    positions.push(state);
    const legal = getLegalActions(state);
    const others = legal.filter((action) => action.type !== 'endTurn');
    const action: Action = others.length === 0 || random() < 0.2 ? { type: 'endTurn' } : others[Math.floor(random() * others.length)]!;
    state = applyAction(state, action);
  }
  return positions;
}

const GAMES = [
  ['pieges', 'explorateur-du-temps', 1],
  ['explorateur-du-temps', 'pieges', 2],
  ['pieges', 'pieges', 3],
  ['pieges', 'vampire', 4],
  // Pièges électriques qui restent (Archi), aimant de Blitz contre des monstres camouflés (2026-11-12).
  ['ingenieurs', 'pieges', 5],
  ['pieges', 'ingenieurs', 6],
] as const;

const POSITIONS = GAMES.flatMap(([a, b, seed]) => playedPositions(a, b, seed, 220));

const key = (action: Action) => JSON.stringify(action);

/** Un événement nomme-t-il cette unité ? */
const names = (event: GameEvent, id: string) => JSON.stringify(event).includes(`"${id}"`);

describe('parties en ligne : rien de caché ne part vers un joueur', () => {
  it('les parties jouées cachent bien des monstres et des pièges', () => {
    const hidden = POSITIONS.filter((state) => getHiddenUnitIds(state, 1).length + getHiddenUnitIds(state, 2).length > 0);
    const traps = POSITIONS.filter((state) => state.traps.length > 0);
    expect(hidden.length).toBeGreaterThan(20);
    expect(traps.length).toBeGreaterThan(20);
  });

  it('les actions légales du joueur actif sont les mêmes avec ou sans ce qu’il ne voit pas', () => {
    for (const state of POSITIONS) {
      const real = getLegalActions(state).map(key).sort();
      const seen = getLegalActions(seenBy(state, state.activePlayer)).map(key).sort();
      expect(real, `tour ${state.turn}`).toEqual(seen);
    }
  });

  it('la vue de chaque joueur : ni ses ennemis invisibles, ni les pièges adverses, ni le grimoire adverse, ni le chemin d’un monstre adverse', () => {
    for (const state of POSITIONS) {
      for (const player of [1, 2] as const) {
        const view = getPlayerView(state, player);
        const hidden = getHiddenUnitIds(state, player);
        for (const id of hidden) expect(view.units[id], `tour ${state.turn}, J${player}`).toBeUndefined();
        expect(view.traps.every((trap) => trap.owner === player)).toBe(true);
        expect('grimoire' in view.opponent).toBe(false);
        for (const unit of Object.values(view.units)) if (unit.kind === 'monster' && unit.owner !== player) expect(unit.trail).toHaveLength(1);
        if (player !== state.activePlayer) expect(view.legalActions).toEqual([]);
        // Un événement ne nomme un monstre invisible que pour une carte jouée vers lui ou l'effet d'un monstre visible
        // sur lui (sans sa case), ou comme poseur du piège où un autre monstre vient d'entrer : jamais avec sa case. (Les
        // VP et le mana d'une mana zone donnent la case de la zone, même tenue par un invisible : c'est public, §10.)
        for (const event of view.events) {
          for (const id of hidden) {
            if (!names(event, id)) continue;
            const unit = state.units[id]!;
            const cell = `{"row":${unit.pos.row},"col":${unit.pos.col}}`;
            expect(JSON.stringify(event).includes(cell), `${event.type} donne la case de ${id}`).toBe(false);
            if (event.type === 'trapTriggered') {
              expect(event.trap.sourceId === id && event.unitId !== id, `trapTriggered nomme ${id}`).toBe(true);
              continue;
            }
            expect(event.type === 'cardPlayed' || event.type === 'effect', `${event.type} nomme ${id}`).toBe(true);
            expect('pos' in event && event.pos, `${event.type} donne la case de ${id}`).toBeNull();
          }
        }
      }
    }
  });
});
