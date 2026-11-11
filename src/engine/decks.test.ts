import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { CARDS, COMMON_CARDS, DECKS, TEST_GRIMOIRE, getCard } from './cards';
import { MAX_COPIES_PER_DECK } from './config';
import { getBaseMana } from './turns';
import { createGame } from './game';
import { getPlayerView } from './view';
import { getLegalActions } from './actions';
import { at, gameWith } from './test-utils';
import { statusAmount } from './statuses';
import type { Action, CardId, Direction, GameState, Position, Trap, UnitId } from './types';

const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const move = (unitId: UnitId, to: Position, path?: Position[]): Action =>
  path ? { type: 'move', unitId, to, path } : { type: 'move', unitId, to };
const END_TURN: Action = { type: 'endTurn' };
const MANA = { players: { 1: { mana: 10 } } };
const withTraps = (state: GameState, ...traps: Trap[]): GameState => ({ ...state, traps: [...state.traps, ...traps] });
/** Effets des pièges du deck : le filet du Poseur de piège, la bombe du Poseur de bombe (3 dégâts). */
const NET: Trap['effects'] = [{ type: 'status', kind: 'immobilise', turns: 0 }];
const bomb = (amount: number): Trap['effects'] => [{ type: 'damage', amount }];
const trap = (owner: 1 | 2, pos: Position, effects: Trap['effects'], cardId: CardId = 'poseur-de-piege'): Trap => ({
  owner,
  pos,
  effects,
  cardId,
  sourceId: 'u1',
  expiresAtTurn: 3, // posé au tour 1 : jusqu'au début du prochain tour de son poseur
});

describe('decks pré-construits (SPEC.md §6 bis)', () => {
  const deck = (id: string) => DECKS.find((d) => d.id === id)!;
  const count = (cards: readonly CardId[], id: CardId) => cards.filter((c) => c === id).length;

  it('sept decks de 30 cartes (Classique, le deck d’essai : 25) ; plus de Bodybuilder (2026-11-10)', () => {
    expect(DECKS.map((d) => d.id)).toEqual(['classique', 'archers', 'pieges', 'dragons', 'sorciers-du-feu', 'explorateur-du-temps', 'vampire']);
    for (const d of DECKS) expect(d.cards, d.id).toHaveLength(d.id === 'classique' ? 25 : 30);
    expect(deck('classique').cards).toBe(TEST_GRIMOIRE);
    // Les cartes du Bodybuilder gardent leurs données, sans deck.
    for (const id of ['rudy', 'arnold', 'tibo', 'ki-ne', 'seringue', 'salle-de-sport'] as const) {
      expect(CARDS[id], id).toBeDefined();
      for (const d of DECKS) expect(d.cards, `${d.id} · ${id}`).not.toContain(id);
    }
  });

  it('compositions du 2026-11-10 (§6 bis) : les cartes de l’archétype ×3, puis des cartes de base et communes', () => {
    const composition = (id: string) => Object.fromEntries([...new Set(deck(id).cards)].map((c) => [c, count(deck(id).cards, c)]));
    expect(composition('archers')).toEqual({
      'ecuyer-archers': 3,
      'archer-imperial': 3,
      'arbaletrier-imperial': 3,
      'trebuchet-archers': 3,
      'fleche-divine': 3,
      'camps-de-tir': 3,
      bourrasque: 3,
      charge: 3,
      bastion: 1,
      'zone-invocation': 1,
      'terrain-piege': 1,
      teleporteur: 1,
      flash: 1,
      carapace: 1,
    });
    expect(composition('pieges')).toEqual({
      'poseur-de-piege': 3,
      farceur: 3,
      'poseur-de-bombe': 3,
      'clown-assassin': 3,
      penombre: 3,
      'terrain-de-jeu': 3,
      flash: 1,
      repli: 3,
      reanimation: 1,
      carapace: 3,
      'zone-invocation': 1,
      'terrain-piege': 2,
      fatigue: 1,
    });
    expect(composition('explorateur-du-temps')).toEqual({
      'apprenti-temps': 3,
      chronomancienne: 3,
      'dragonnet-temps': 3,
      'maitre-du-temps': 3,
      'piege-temporel': 3,
      'fissure-temporelle': 3,
      fatigue: 3,
      puissance: 3,
      flash: 1,
      teleportation: 2,
      'zone-invocation': 1,
      'terrain-piege': 2,
    });
    // Vampire : le Terrain de chasse est de l'archétype (×3, à la place des Autels de mana).
    expect(composition('vampire')).toEqual({
      delta: 3,
      emma: 3,
      vladimir: 3,
      zoldik: 3,
      'appel-du-sang': 3,
      'sacrifice-sanguinaire': 3,
      'terrain-de-chasse': 3,
      cure: 3,
      carapace: 3,
      flash: 1,
      puissance: 2,
    });
    expect(composition('dragons')).toEqual({
      'jeune-dragon': 3,
      'dragon-feu': 3,
      'dragon-eau': 3,
      'dragon-vent': 3,
      'dragon-terre': 3,
      hurlements: 3,
      'nid-de-dragons': 3,
      'autel-de-mana': 3,
      invocateur: 1,
      'elixir-de-mana': 2,
      fortification: 3,
    });
    expect(composition('sorciers-du-feu')).toEqual({
      apprenti: 3,
      'lutin-brasier': 3,
      archimage: 3,
      'golem-de-lave': 3,
      'brulure-en-chaine': 3,
      'terrain-drainant': 3,
      fatigue: 3,
      'zone-invocation': 3,
      teleportation: 3,
      flash: 1,
      puissance: 2,
    });
    // La chauve-souris est une forme d'Emma : dans aucun deck.
    for (const d of DECKS) expect(d.cards, d.id).not.toContain('emma-chauve-souris');
  });

  it('3 exemplaires au plus d’une même carte par deck', () => {
    expect(MAX_COPIES_PER_DECK).toBe(3);
    for (const d of DECKS) {
      for (const id of new Set(d.cards)) expect(count(d.cards, id), `${d.id} · ${id}`).toBeLessThanOrEqual(MAX_COPIES_PER_DECK);
    }
  });

  it('hors de l’archétype, un deck n’a que des cartes génériques : du grimoire de test ou des cartes communes', () => {
    const generic = new Set<CardId>([...TEST_GRIMOIRE, ...COMMON_CARDS]);
    for (const d of DECKS) {
      for (const id of d.cards) {
        // Une carte d'archétype s'appelle « Nom - Archétype » (§5.1).
        if (!getCard(CARDS, id).name.includes(' - ')) expect(generic.has(id), `${d.id} · ${id}`).toBe(true);
      }
    }
  });

  it('chaque joueur reçoit le deck choisi', () => {
    const game = createGame(undefined, { 1: deck('archers').cards, 2: deck('pieges').cards });
    expect(game.players[1].grimoire).toEqual(deck('archers').cards);
    expect(game.players[2].grimoire).toEqual(deck('pieges').cards);
  });

  it('caractéristiques des nouvelles cartes', () => {
    expect(CARDS['archer-leger']).toMatchObject({ cost: 1, atk: 1, range: 2, mobility: 5, hp: 3 });
    expect(CARDS['archer-lourd']).toMatchObject({ cost: 3, atk: 3, range: 2, mobility: 3, hp: 3 });
    expect(CARDS['archer-de-glace']).toMatchObject({ cost: 3, atk: 2, range: 2, mobility: 3, hp: 3 });
    expect(CARDS['archer-du-feu']).toMatchObject({ cost: 3, atk: 2, range: 2, mobility: 3, hp: 3 });
    expect(CARDS.trebuchet).toMatchObject({ cost: 5, atk: 4, range: 5, mobility: 2, hp: 1 });
    // Monstre de test (§10) : stats extrêmes, sans effet ni archétype.
    expect(CARDS['monstre-de-test']).toMatchObject({ cost: 10, atk: 3, range: 1, mobility: 9, hp: 7, keywords: [], activated: [], archetype: null });
    expect(CARDS['poseur-de-piege']).toMatchObject({ cost: 2, atk: 1, range: 1, mobility: 7, hp: 1 });
    expect(CARDS.farceur).toMatchObject({ cost: 3, atk: 2, range: 1, mobility: 7, hp: 1 });
    expect(CARDS['poseur-de-bombe']).toMatchObject({ cost: 2, atk: 1, range: 1, mobility: 7, hp: 1 });
    expect(CARDS['clown-assassin']).toMatchObject({ cost: 4, atk: 3, range: 1, mobility: 7, hp: 2 });
    const ability = (id: CardId) => {
      const card = getCard(CARDS, id);
      return card.kind === 'monster' ? (card.activated[0] ?? null) : null;
    };
    expect(ability('poseur-de-piege')?.manaCost).toBe(1);
    expect(ability('farceur')).toBeNull();
    expect(CARDS.farceur).toMatchObject({
      keywords: [
        { keyword: 'camouflage' },
        { keyword: 'assassin', multiplier: 2 },
      ],
    });
    expect(ability('poseur-de-bombe')?.manaCost).toBe(1); // Bombe : 1 mana (2 avant le 2026-11-08)
    expect(ability('poseur-de-bombe')?.effects[0]).toMatchObject({ type: 'placeTrap', turns: 3 });
    expect(ability('poseur-de-piege')?.effects[0]).toMatchObject({ type: 'placeTrap', turns: 3 });
  });
});

describe('deck archer', () => {
  it('Archer léger : détruire un monstre adjacent rapporte +1 VP ; à distance, non', () => {
    const near = gameWith([
      { monster: 'archer-leger', owner: 1, at: at(8, 1) },
      { monster: 'eclaireur', owner: 2, at: at(8, 2) },
    ]);
    expect(applyAction(near, attack('u1', 'u2')).players[1].vp).toBe(2);
    const far = gameWith([
      { monster: 'archer-leger', owner: 1, at: at(8, 1) },
      { monster: 'eclaireur', owner: 2, at: at(8, 3) },
    ]);
    expect(applyAction(far, attack('u1', 'u2')).players[1].vp).toBe(1);
  });

  it('Archer lourd : détruire un monstre adjacent rapporte +1 mana ; à distance, non', () => {
    const near = gameWith(
      [
        { monster: 'archer-lourd', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 2, at: at(8, 2) },
      ],
      { players: { 1: { mana: 0 } } },
    );
    expect(applyAction(near, attack('u1', 'u2')).players[1].mana).toBe(1);
    const far = gameWith(
      [
        { monster: 'archer-lourd', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 2, at: at(8, 3) },
      ],
      { players: { 1: { mana: 0 } } },
    );
    expect(applyAction(far, attack('u1', 'u2')).players[1].mana).toBe(0);
  });

  it('Archer de glace : la cible est slow 1 jusqu’à la fin de son prochain tour, cumulable, puis revient à la normale', () => {
    let state = gameWith([
      { monster: 'archer-de-glace', owner: 1, at: at(8, 1) },
      { monster: 'archer-de-glace', owner: 1, at: at(9, 3) },
      { monster: 'golem', owner: 2, at: at(8, 3) }, // mobilité 2
    ]);
    state = applyAction(state, attack('u1', 'u3'));
    state = applyAction(state, attack('u2', 'u3'));
    expect(state.units.u3?.statuses).toEqual([
      { kind: 'slow', amount: 1, turns: 1, expiresAtTurn: 3 },
      { kind: 'slow', amount: 1, turns: 1, expiresAtTurn: 3 },
    ]);
    state = applyAction(state, END_TURN); // tour 2, de J2 : slow 2
    expect(state.units.u3).toMatchObject({ mobilityLeft: 0 });
    state = applyAction(state, END_TURN); // tour 3 : le slow a disparu
    expect(state.units.u3?.statuses).toEqual([]);
    state = applyAction(state, END_TURN); // tour suivant de J2
    expect(state.units.u3).toMatchObject({ mobilityLeft: 2 });
  });

  it('Archer de glace : sans effet sur un terrain', () => {
    const state = gameWith([
      { monster: 'archer-de-glace', owner: 1, at: at(5, 3) },
      { terrain: 'bastion', owner: 2, at: at(5, 4) },
    ]);
    expect(applyAction(state, attack('u1', 'u2')).units.u2?.statuses).toEqual([]);
  });

  it('Archer du feu : la cible est burn 1 et perd 1 PV au début de son prochain tour, cumulable', () => {
    let state = gameWith([
      { monster: 'archer-du-feu', owner: 1, at: at(8, 1) },
      { monster: 'archer-du-feu', owner: 1, at: at(9, 3) },
      { monster: 'golem', owner: 2, at: at(8, 3) }, // PV 7
    ]);
    state = applyAction(state, attack('u1', 'u3')); // 5
    state = applyAction(state, attack('u2', 'u3')); // 3
    expect(state.units.u3?.statuses.map((s) => [s.kind, statusAmount(s)])).toEqual([
      ['burn', 1],
      ['burn', 1],
    ]);
    state = applyAction(state, END_TURN);
    expect(state.units.u3).toMatchObject({ hp: 1 });
    state = applyAction(state, END_TURN); // fin de son tour : la brûlure s'éteint, rien de plus
    expect(state.units.u3).toMatchObject({ hp: 1, statuses: [] });
  });

  it('Archer du feu : la brûlure peut détruire, et le VP revient au joueur de l’archer ; les terrains brûlent', () => {
    let state = gameWith([
      { monster: 'archer-du-feu', owner: 1, at: at(5, 2) },
      { monster: 'golem', owner: 2, at: at(5, 3), hp: 3 },
      { monster: 'archer-du-feu', owner: 1, at: at(8, 7) },
      { terrain: 'bastion', owner: 2, at: at(8, 5) },
    ]);
    state = applyAction(state, attack('u1', 'u2')); // 1 PV, brûlure 1
    state = applyAction(state, attack('u3', 'u4')); // Bastion 8 PV, brûlure 1
    state = applyAction(state, END_TURN);
    expect(state.units.u2).toBeUndefined();
    expect(state.players[1].vp).toBe(1);
    expect(state.units.u4?.hp).toBe(7);
  });

  it('Trébuchet : portée 5, dégâts doublés contre un terrain seulement', () => {
    const state = gameWith([
      { monster: 'trebuchet', owner: 1, at: at(9, 8) },
      { terrain: 'bastion', owner: 2, at: at(9, 4), hp: 8 }, // à 4 cases
      { monster: 'trebuchet', owner: 1, at: at(1, 0) },
      { monster: 'golem', owner: 2, at: at(1, 5) }, // à 5 cases
    ]);
    // Bastion à 8 PV − 8 → détruit.
    expect(applyAction(state, attack('u1', 'u2')).units.u2).toBeUndefined();
    expect(applyAction(state, attack('u3', 'u4')).units.u4?.hp).toBe(3);
  });
});

describe('orientation et Clown assassin (SPEC.md §10)', () => {
  const facing = (state: GameState, id: UnitId): Direction | undefined => {
    const unit = state.units[id];
    return unit?.kind === 'monster' ? unit.facing : undefined;
  };

  it('un monstre regarde d’abord vers le camp adverse, puis dans le sens de son dernier pas', () => {
    let state = gameWith([
      { monster: 'eclaireur', owner: 1, at: at(8, 1) },
      { monster: 'eclaireur', owner: 2, at: at(1, 1) },
    ]);
    expect(facing(state, 'u1')).toBe('down');
    expect(facing(state, 'u2')).toBe('up');
    state = applyAction(state, move('u1', at(7, 2), [at(8, 2), at(7, 2)]));
    expect(facing(state, 'u1')).toBe('up');
  });

  it('attaquer un monstre par derrière triple les dégâts', () => {
    // Le Golem de J2 regarde vers le haut : son arrière est en dessous de lui.
    const state = gameWith([
      { monster: 'clown-assassin', owner: 1, at: at(6, 3) }, // derrière
      { monster: 'golem', owner: 2, at: at(5, 3) },
      { monster: 'clown-assassin', owner: 1, at: at(1, 3) }, // devant
      { monster: 'golem', owner: 2, at: at(2, 3) },
    ]);
    expect(applyAction(state, attack('u1', 'u2')).units.u2).toBeUndefined(); // 3 × 3 = 9 ≥ 7 PV
    expect(applyAction(state, attack('u3', 'u4')).units.u4?.hp).toBe(7 - 3);
  });

  it('Farceur (`assassin` ×2) : dégâts doublés par derrière seulement, pas contre un terrain', () => {
    const state = gameWith([
      { monster: 'farceur', owner: 1, at: at(6, 3) }, // derrière
      { monster: 'golem', owner: 2, at: at(5, 3) },
      { monster: 'farceur', owner: 1, at: at(1, 3) }, // devant
      { monster: 'golem', owner: 2, at: at(2, 3) },
      { monster: 'farceur', owner: 1, at: at(4, 5) },
      { terrain: 'bastion', owner: 2, at: at(5, 5) },
    ]);
    const behind = applyAction(state, attack('u1', 'u2'));
    expect(behind.units.u2?.hp).toBe(7 - 4);
    expect(behind.events[0]).toMatchObject({ type: 'attack', behind: true });
    expect(applyAction(state, attack('u3', 'u4')).units.u4?.hp).toBe(7 - 2);
    expect(applyAction(state, attack('u5', 'u6')).units.u6?.hp).toBe(10 - 2);
  });

  it('les bonus d’ATK sont triplés aussi', () => {
    const state = gameWith([
      { monster: 'clown-assassin', owner: 1, at: at(6, 3), atk: 3 },
      { monster: 'golem', owner: 2, at: at(5, 3), hp: 10 },
    ]);
    expect(applyAction(state, attack('u1', 'u2')).units.u2?.hp).toBe(1);
  });

  it('l’avancée oriente le monstre dans le sens de l’attaque', () => {
    const state = gameWith([
      { monster: 'clown-assassin', owner: 1, at: at(6, 3) },
      { monster: 'eclaireur', owner: 2, at: at(5, 3) },
    ]);
    const after = applyAction(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: true });
    expect(after.units.u1).toMatchObject({ pos: at(5, 3), facing: 'up' });
  });
});

describe('pièges (SPEC.md §6 bis, §10)', () => {
  const placeTrap = (unitId: UnitId, pos: Position): Action => ({
    type: 'activateEffect',
    unitId,
    target: { kind: 'cell', pos },
  });

  it('se pose sur une case adjacente libre, une fois par tour, en payant son coût', () => {
    const state = gameWith(
      [
        { monster: 'poseur-de-piege', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 1, at: at(8, 2) },
      ],
      MANA,
    );
    const after = applyAction(state, placeTrap('u1', at(7, 1)));
    expect(after.traps).toEqual([{ ...trap(1, at(7, 1), NET), expiresAtTurn: 7 }]); // posé au tour 1 : 3 tours adverses
    expect(after.players[1].mana).toBe(9);
    expect(() => applyAction(state, placeTrap('u1', at(8, 2)))).toThrow(); // occupée
    expect(() => applyAction(state, placeTrap('u1', at(6, 1)))).toThrow(); // pas adjacente
    expect(() => applyAction(after, placeTrap('u1', at(9, 1)))).toThrow(/déjà utilisé/);
  });

  it('se pose aussi en diagonale (les 8 cases autour)', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(8, 1) }], MANA);
    expect(applyAction(state, placeTrap('u1', at(7, 2))).traps).toEqual([{ ...trap(1, at(7, 2), NET), expiresAtTurn: 7 }]);
  });

  it('Filet : le piège dure 3 tours adverses ; plusieurs filets s’accumulent (1 pose par tour et par poseur)', () => {
    let state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(8, 1) }], MANA);
    state = applyAction(state, placeTrap('u1', at(7, 1))); // tour 1
    state = applyAction(applyAction(state, END_TURN), END_TURN); // tour 3 : le premier filet est encore là
    expect(state.traps).toHaveLength(1);
    state = applyAction(state, placeTrap('u1', at(7, 2))); // un 2e filet
    expect(state.traps).toHaveLength(2);
    state = applyAction(applyAction(state, END_TURN), END_TURN); // tour 5
    expect(state.traps).toHaveLength(2);
    state = applyAction(applyAction(state, END_TURN), END_TURN); // tour 7 : le premier disparaît, pas le second (posé au tour 3 : tour 9)
    expect(state.traps.map((t) => t.pos)).toEqual([at(7, 2)]);
    // Jamais deux pièges du même camp sur la même case.
    expect(() => applyAction(state, placeTrap('u1', at(7, 2)))).toThrow();
  });

  it('pas de pose à travers une falaise', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(5, 3) }], MANA);
    expect(() => applyAction(state, placeTrap('u1', at(5, 2)))).toThrow();
  });

  it('caché pour l’adversaire, visible pour son poseur', () => {
    const state = withTraps(gameWith([]), trap(1, at(7, 1), NET));
    expect(getPlayerView(state, 1).traps).toHaveLength(1);
    expect(getPlayerView(state, 2).traps).toEqual([]);
    // Les cartes de la partie, publiques, nomment toutes les cartes : le piège, lui, n'apparaît nulle part ailleurs.
    const { cards: _cards, ...rest } = getPlayerView(state, 2);
    expect(JSON.stringify(rest)).not.toMatch(/poseur-de-piege|root/);
  });

  it('ne change rien aux actions proposées à l’adversaire : rien ne le trahit', () => {
    const base = gameWith([{ monster: 'milicien', owner: 2, at: at(8, 1) }], { activePlayer: 2, players: { 2: { mana: 10 } } });
    const trapped = withTraps(base, trap(1, at(8, 2), bomb(3), 'poseur-de-bombe'));
    expect(getLegalActions(trapped)).toEqual(getLegalActions(base));
  });

  it('piège à PV : l’ennemi qui passe perd ses PV et continue ; le piège disparaît', () => {
    const state = withTraps(
      gameWith([{ monster: 'milicien', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      trap(1, at(8, 2), bomb(1)),
    );
    const after = applyAction(state, move('u1', at(8, 3), [at(8, 2), at(8, 3)]));
    expect(after.units.u1).toMatchObject({ pos: at(8, 3), hp: 2 });
    expect(after.traps).toEqual([]);
  });

  it('Poseur de piège : l’ennemi s’arrête sur la case piégée et ne bouge plus de ce tour', () => {
    const state = withTraps(
      gameWith([{ monster: 'chevalier', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      trap(1, at(8, 2), NET),
    );
    const after = applyAction(state, move('u1', at(8, 4), [at(8, 2), at(8, 3), at(8, 4)]));
    expect(after.units.u1).toMatchObject({ pos: at(8, 2), mobilityLeft: 0 });
    expect(() => applyAction(after, move('u1', at(8, 3)))).toThrow();
  });

  it('Poseur de bombe : 3 dégâts ; s’ils détruisent le monstre, le poseur gagne 1 VP', () => {
    const state = withTraps(
      gameWith([{ monster: 'milicien', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      trap(1, at(8, 2), bomb(3), 'poseur-de-bombe'),
    );
    const after = applyAction(state, move('u1', at(8, 3), [at(8, 2), at(8, 3)]));
    expect(after.units.u1).toBeUndefined();
    expect(after.players[1].vp).toBe(1);
  });

  it('le joueur choisit son chemin : il peut contourner la case', () => {
    const state = withTraps(
      gameWith([{ monster: 'eclaireur', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      trap(1, at(8, 2), bomb(1)),
    );
    const around = applyAction(state, move('u1', at(9, 3), [at(9, 1), at(9, 2), at(9, 3)]));
    expect(around.units.u1).toMatchObject({ pos: at(9, 3), hp: 1 });
    expect(around.traps).toHaveLength(1);
  });

  it('un chemin invalide est refusé : pas non adjacents, trop long, ou qui n’arrive pas à destination', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }]); // mobilité 2
    expect(() => applyAction(state, move('u1', at(8, 3), [at(8, 3)]))).toThrow();
    expect(() => applyAction(state, move('u1', at(7, 3), [at(8, 2), at(8, 3), at(7, 3)]))).toThrow();
    expect(() => applyAction(state, move('u1', at(8, 3), [at(8, 2), at(7, 2)]))).toThrow();
  });

  it('ses propres pièges ne se déclenchent pas', () => {
    const own = withTraps(gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }]), trap(1, at(8, 2), NET));
    expect(applyAction(own, move('u1', at(8, 3), [at(8, 2), at(8, 3)])).units.u1?.pos).toEqual(at(8, 3));
  });

  it('un monstre vol déclenche les pièges sur son passage', () => {
    const damage = withTraps(
      gameWith([{ monster: 'dragonnet', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      trap(1, at(8, 2), bomb(3)),
    );
    const hurt = applyAction(damage, move('u1', at(8, 3), [at(8, 2), at(8, 3)]));
    expect(hurt.units.u1).toMatchObject({ pos: at(8, 3), hp: 3 });
    expect(hurt.traps).toEqual([]);
    const root = withTraps(
      gameWith([{ monster: 'dragonnet', owner: 2, at: at(8, 1) }], { activePlayer: 2 }),
      trap(1, at(8, 2), NET),
    );
    expect(applyAction(root, move('u1', at(8, 3), [at(8, 2), at(8, 3)])).units.u1).toMatchObject({ pos: at(8, 2), mobilityLeft: 0 });
  });

  it('Bourrasque fait déclencher le piège, même à un monstre vol', () => {
    const state = withTraps(
      gameWith([{ monster: 'dragonnet', owner: 2, at: at(8, 1) }], MANA),
      trap(1, at(8, 2), bomb(3)),
    );
    const gust: Action = {
      type: 'playCard',
      cardId: 'bourrasque',
      target: { kind: 'unitAndDirection', unitId: 'u1', direction: 'right' },
    };
    expect(applyAction(state, gust).units.u1).toMatchObject({ pos: at(8, 3), hp: 3 });
  });

  it('un ennemi invoqué sur une case piégée la déclenche', () => {
    const state = withTraps(
      gameWith([], { activePlayer: 2, players: { 2: { mana: 10 } } }),
      trap(1, at(10, 4), bomb(3), 'poseur-de-bombe'),
    );
    const summon: Action = { type: 'playCard', cardId: 'eclaireur', target: { kind: 'cell', pos: at(10, 4) } };
    const after = applyAction(state, summon);
    expect(Object.keys(after.units)).toEqual([]);
    expect(after.players[1].vp).toBe(1);
  });

  it('un piège ne dure que jusqu’au prochain tour de son poseur', () => {
    let state = withTraps(gameWith([]), trap(1, at(7, 1), NET));
    state = applyAction(state, END_TURN); // tour de J2 : le piège est actif
    expect(state.traps).toHaveLength(1);
    state = applyAction(state, END_TURN); // retour à J1 : il disparaît
    expect(state.traps).toEqual([]);
    expect(state.players[1].mana).toBe(getBaseMana(3)); // son mana ne se cumule pas
  });
});
