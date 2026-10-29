import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { CARDS, COMMON_CARDS, DECKS, TEST_GRIMOIRE, getCard } from './cards';
import { BASE_MANA_PER_TURN, MAX_COPIES_PER_DECK } from './config';
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
});

describe('decks pré-construits (SPEC.md §6 bis)', () => {
  const deck = (id: string) => DECKS.find((d) => d.id === id)!;
  const count = (cards: readonly CardId[], id: CardId) => cards.filter((c) => c === id).length;

  it('sept decks de 25 cartes : classique, archers, pièges, bodybuilder, dragons, sorciers du feu, explorateur du temps', () => {
    expect(DECKS.map((d) => d.id)).toEqual(['classique', 'archers', 'pieges', 'bodybuilder', 'dragons', 'sorciers-du-feu', 'explorateur-du-temps']);
    for (const d of DECKS) expect(d.cards, d.id).toHaveLength(25);
    expect(deck('classique').cards).toBe(TEST_GRIMOIRE);
  });

  it('compositions du doc « Cartes du TCG » (§6 bis) : cartes du deck, complément de cartes de base, cartes communes', () => {
    const composition = (id: string) => Object.fromEntries([...new Set(deck(id).cards)].map((c) => [c, count(deck(id).cards, c)]));
    const commons = { invocateur: 1, teleporteur: 1, 'terrain-drainant': 1, 'terrain-piege': 1, 'zone-invocation': 1 };
    expect(composition('archers')).toEqual({
      'archer-leger': 3,
      'archer-lourd': 3,
      'archer-de-glace': 3,
      'archer-du-feu': 3,
      trebuchet: 2,
      'fleche-divine': 1,
      'boule-de-feu': 1,
      charge: 1,
      bourrasque: 1,
      benediction: 1,
      bastion: 1,
      ...commons,
    });
    expect(composition('pieges')).toEqual({
      'poseur-de-piege': 3,
      farceur: 3,
      'poseur-de-bombe': 3,
      'clown-assassin': 3,
      penombre: 2,
      'boule-de-feu': 1,
      charge: 1,
      bourrasque: 1,
      benediction: 1,
      'autel-de-mana': 1,
      invocateur: 1,
      'terrain-drainant': 1,
      'terrain-piege': 2,
      'zone-invocation': 2,
    });
    expect(composition('bodybuilder')).toEqual({
      'jeune-gomuscu': 3,
      'jean-bon': 3,
      arnold: 3,
      'ki-ne': 3,
      seringue: 2,
      'boule-de-feu': 1,
      charge: 3,
      benediction: 1,
      bastion: 1,
      ...commons,
    });
    expect(composition('dragons')).toEqual({
      'jeune-dragon': 3,
      'dragon-feu': 2,
      'dragon-eau': 2,
      'dragon-vent': 2,
      'dragon-terre': 2,
      'dragon-origine': 1,
      'boule-de-feu': 2,
      charge: 3,
      benediction: 1,
      'autel-de-mana': 2,
      ...commons,
    });
    expect(composition('sorciers-du-feu')).toEqual({
      apprenti: 3,
      'lutin-brasier': 3,
      archimage: 2,
      'golem-de-lave': 3,
      gardien: 1,
      chevalier: 1,
      'boule-de-feu': 2,
      charge: 2,
      benediction: 1,
      'autel-de-mana': 1,
      bastion: 1,
      ...commons,
    });
  });

  it('3 exemplaires au plus d’une même carte par deck', () => {
    expect(MAX_COPIES_PER_DECK).toBe(3);
    for (const d of DECKS) {
      for (const id of new Set(d.cards)) expect(count(d.cards, id), `${d.id} · ${id}`).toBeLessThanOrEqual(MAX_COPIES_PER_DECK);
    }
  });

  it('le complément vient du grimoire de test ou des cartes communes', () => {
    const archers: CardId[] = ['archer-leger', 'archer-lourd', 'archer-de-glace', 'archer-du-feu', 'trebuchet', 'fleche-divine'];
    const traps: CardId[] = ['poseur-de-piege', 'farceur', 'poseur-de-bombe', 'clown-assassin', 'penombre'];
    for (const id of COMMON_CARDS) expect(TEST_GRIMOIRE, id).toContain(id);
    const filler = (d: string, own: CardId[]) => deck(d).cards.filter((c) => !own.includes(c));
    for (const id of filler('archers', archers)) expect(TEST_GRIMOIRE, id).toContain(id);
    for (const id of filler('pieges', traps)) expect(TEST_GRIMOIRE, id).toContain(id);
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
    expect(CARDS['poseur-de-piege']).toMatchObject({ cost: 1, atk: 1, range: 1, mobility: 7, hp: 1 });
    expect(CARDS.farceur).toMatchObject({ cost: 2, atk: 2, range: 1, mobility: 6, hp: 1 });
    expect(CARDS['poseur-de-bombe']).toMatchObject({ cost: 1, atk: 2, range: 1, mobility: 7, hp: 1 });
    expect(CARDS['clown-assassin']).toMatchObject({ cost: 4, atk: 2, range: 1, mobility: 7, hp: 2 });
    const ability = (id: CardId) => {
      const card = getCard(id);
      return card.kind === 'monster' ? (card.activated[0] ?? null) : null;
    };
    expect(ability('poseur-de-piege')?.manaCost).toBe(1);
    expect(ability('farceur')).toBeNull();
    expect(CARDS.farceur).toMatchObject({
      keywords: [
        { keyword: 'camouflage', amount: 2 },
        { keyword: 'sournois', amount: 1 },
      ],
    });
    expect(ability('poseur-de-bombe')?.manaCost).toBe(2);
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
    expect(applyAction(state, attack('u1', 'u2')).units.u2?.hp).toBe(7 - 6);
    expect(applyAction(state, attack('u3', 'u4')).units.u4?.hp).toBe(7 - 2);
  });

  it('Farceur (`sournois`) : +1 ATK par derrière seulement, pas contre un terrain', () => {
    const state = gameWith([
      { monster: 'farceur', owner: 1, at: at(6, 3) }, // derrière
      { monster: 'golem', owner: 2, at: at(5, 3) },
      { monster: 'farceur', owner: 1, at: at(1, 3) }, // devant
      { monster: 'golem', owner: 2, at: at(2, 3) },
      { monster: 'farceur', owner: 1, at: at(4, 5) },
      { terrain: 'bastion', owner: 2, at: at(5, 5) },
    ]);
    const behind = applyAction(state, attack('u1', 'u2'));
    expect(behind.units.u2?.hp).toBe(7 - 3);
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
    expect(after.traps).toEqual([trap(1, at(7, 1), NET)]);
    expect(after.players[1].mana).toBe(9);
    expect(() => applyAction(state, placeTrap('u1', at(8, 2)))).toThrow(); // occupée
    expect(() => applyAction(state, placeTrap('u1', at(6, 1)))).toThrow(); // pas adjacente
    expect(() => applyAction(after, placeTrap('u1', at(9, 1)))).toThrow(/déjà utilisé/);
  });

  it('se pose aussi en diagonale (les 8 cases autour)', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(8, 1) }], MANA);
    expect(applyAction(state, placeTrap('u1', at(7, 2))).traps).toEqual([trap(1, at(7, 2), NET)]);
  });

  it('pas de pose à travers une falaise', () => {
    const state = gameWith([{ monster: 'poseur-de-piege', owner: 1, at: at(5, 3) }], MANA);
    expect(() => applyAction(state, placeTrap('u1', at(5, 2)))).toThrow();
  });

  it('caché pour l’adversaire, visible pour son poseur', () => {
    const state = withTraps(gameWith([]), trap(1, at(7, 1), NET));
    expect(getPlayerView(state, 1).traps).toHaveLength(1);
    expect(getPlayerView(state, 2).traps).toEqual([]);
    expect(JSON.stringify(getPlayerView(state, 2))).not.toMatch(/poseur-de-piege|root/);
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
    expect(state.players[1].mana).toBe(2 * BASE_MANA_PER_TURN);
  });
});
