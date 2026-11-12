import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { BOARD } from './board';
import { CARDS } from './cards';
import { at, gameWith, withStatus } from './test-utils';
import { chainBetween } from './traps';
import { getPlayerView } from './view';
import type { Action, CardId, EffectTarget, GameState, PlayerId, Position, Trap, UnitId } from './types';

// Deck Ingénieurs foudroyants (SPEC.md §6 bis, §10, 2026-11-12) : Archi (pièges électriques reliés par des chaînes),
// Elek (Statik 2), Blitz (Aimant), Champ magnétique (Passage et début du tour adverse), Chaînes d'éclair, Onde de choc.

const END_TURN: Action = { type: 'endTurn' };
const move = (unitId: UnitId, to: Position): Action => ({ type: 'move', unitId, to });
const attack = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const effect = (unitId: UnitId, target: EffectTarget): Action => ({ type: 'activateEffect', unitId, target });
const play = (cardId: CardId, target: EffectTarget): Action => ({ type: 'playCard', cardId, target });
const effectTargets = (state: GameState, unitId: UnitId) =>
  getLegalActions(state).flatMap((a) => (a.type === 'activateEffect' && a.unitId === unitId ? [a.target] : []));
const cardTargets = (state: GameState, cardId: CardId) =>
  getLegalActions(state).flatMap((a) => (a.type === 'playCard' && a.cardId === cardId ? [a.target] : []));
const hpOf = (state: GameState, id: UnitId) => state.units[id]?.hp;

/** Un piège électrique d'Archi déjà posé (reste, chaîne à 4 cases). */
const electric = (pos: Position, owner: PlayerId = 1): Trap => ({
  owner,
  pos,
  effects: [
    { type: 'damage', amount: 1 },
    { type: 'status', kind: 'immobilise', turns: 0 },
  ],
  cardId: 'archi',
  sourceId: 'u1',
  expiresAtTurn: null,
  chain: 4,
});

describe('cartes du deck Ingénieurs foudroyants', () => {
  it('archétype Ingénieurs foudroyants, noms « Nom - Ingénieurs foudroyants »', () => {
    for (const id of ['archi', 'elek', 'blitz', 'joy', 'champ-magnetique', 'chaines-eclair', 'onde-de-choc'] as const) {
      const card = CARDS[id];
      expect(card.name, id).toMatch(/ - Ingénieurs foudroyants$/);
      if (card.kind === 'monster') expect(card.archetype, id).toBe('ingenieur');
    }
    expect(CARDS.elek).toMatchObject({ keywords: [{ keyword: 'statik' }] });
    // Joy, « flingue électrique » : le mot-clé Entrave (ex-Givre).
    expect(CARDS.joy).toMatchObject({ keywords: [{ keyword: 'entrave', amount: 2, turns: 1 }] });
  });
});

describe('Joy : Entrave 2', () => {
  it('à l’attaque, la cible qui survit est slow 2 pendant 1 tour, même en diagonale', () => {
    const state = gameWith([
      { monster: 'joy', owner: 1, at: at(1, 1) },
      { monster: 'golem', owner: 2, at: at(1, 4) },
      { monster: 'golem', owner: 2, at: at(2, 2) },
    ]);
    expect(applyAction(state, attack('u1', 'u2')).units.u2?.statuses).toMatchObject([{ kind: 'slow', amount: 2, turns: 1 }]);
    expect(applyAction(state, attack('u1', 'u3')).units.u3?.statuses).toMatchObject([{ kind: 'slow', amount: 2, turns: 1 }]);
  });
});

describe('Onde de choc', () => {
  const units = [
    { monster: 'archi', owner: 1, at: at(2, 2) },
    { monster: 'milicien', owner: 1, at: at(8, 2) },
    { monster: 'chevalier', owner: 2, at: at(2, 4) },
    { monster: 'golem', owner: 2, at: at(2, 6) },
  ] as const;
  const state = gameWith(units, { players: { 1: { mana: 10, grimoire: ['onde-de-choc'] } } });

  it('vise un allié ingénieur foudroyant seulement', () => {
    expect(cardTargets(state, 'onde-de-choc')).toEqual([{ kind: 'unit', unitId: 'u1' }]);
  });

  it('2 dégâts aux ennemis du carré de 2 de cet allié', () => {
    const next = applyAction(state, play('onde-de-choc', { kind: 'unit', unitId: 'u1' }));
    expect(hpOf(next, 'u3')).toBe(hpOf(state, 'u3')! - 2);
    expect(hpOf(next, 'u4')).toBe(hpOf(state, 'u4')); // à 4 cases
  });

  it('jouable même sans ennemi autour, comme Hurlements', () => {
    const alone = gameWith([units[0]], { players: { 1: { mana: 10, grimoire: ['onde-de-choc'] } } });
    expect(cardTargets(alone, 'onde-de-choc')).toHaveLength(1);
  });
});

describe('Champ magnétique : Passage et début du tour adverse', () => {
  const state = gameWith(
    [
      { terrain: 'champ-magnetique', owner: 1, at: at(2, 2) },
      { monster: 'milicien', owner: 1, at: at(1, 2) },
      { monster: 'chevalier', owner: 2, at: at(2, 4) },
    ],
    { activePlayer: 2 },
  );

  it('l’ennemi qui entre dans le carré de 1 subit 1 dégât et slow 1 jusqu’à son prochain tour', () => {
    const entered = applyAction(state, move('u3', at(2, 3)));
    expect(hpOf(entered, 'u3')).toBe(hpOf(state, 'u3')! - 1);
    expect(entered.units.u3?.statuses).toMatchObject([{ kind: 'slow', amount: 1 }]);
  });

  it('de nouveau au début de chaque tour adverse s’il y est encore, pas au début du tour de son propriétaire', () => {
    const entered = applyAction(state, move('u3', at(2, 3)));
    const ownerTurn = applyAction(entered, END_TURN); // tour de J1
    expect(hpOf(ownerTurn, 'u3')).toBe(hpOf(entered, 'u3'));
    const enemyTurn = applyAction(ownerTurn, END_TURN); // tour de J2
    expect(hpOf(enemyTurn, 'u3')).toBe(hpOf(entered, 'u3')! - 1);
    expect(enemyTurn.events.some((e) => e.type === 'passage' && e.unitId === 'u3')).toBe(true);
    // Le slow pris au début de son tour compte dans sa mobilité de ce tour.
    const card = state.cards.chevalier;
    expect(enemyTurn.units.u3).toMatchObject({ mobilityLeft: card.kind === 'monster' ? card.mobility - 1 : NaN });
    // Son propre monstre n'est jamais touché.
    expect(hpOf(enemyTurn, 'u2')).toBe(hpOf(state, 'u2'));
  });
});

describe('Blitz : Aimant', () => {
  const base = (more: Parameters<typeof gameWith>[0] = []) =>
    gameWith([{ monster: 'blitz', owner: 1, at: at(1, 1) }, { monster: 'chevalier', owner: 2, at: at(1, 5) }, ...more], {
      players: { 1: { mana: 10 } },
    });

  it('attire jusqu’au contact un ennemi en ligne, portée 4 ; Blitz se tourne vers lui', () => {
    const state = base();
    expect(effectTargets(state, 'u1')).toEqual([{ kind: 'unit', unitId: 'u2' }]);
    const pulled = applyAction(state, effect('u1', { kind: 'unit', unitId: 'u2' }));
    expect(pulled.units.u2?.pos).toEqual(at(1, 2));
    expect(pulled.units.u1).toMatchObject({ facing: 'right' });
    expect(pulled.events.filter((e) => e.type === 'step').every((e) => e.type === 'step' && e.kind === 'pull')).toBe(true);
  });

  it('s’arrête avant le premier obstacle : un allié de Blitz, transparent pour la vue, bloque le trajet', () => {
    const state = base([{ monster: 'milicien', owner: 1, at: at(1, 3) }]);
    const pulled = applyAction(state, effect('u1', { kind: 'unit', unitId: 'u2' }));
    expect(pulled.units.u2?.pos).toEqual(at(1, 4));
  });

  it('ne vise ni un ennemi déjà au contact, ni hors de portée, ni en diagonale', () => {
    const contact = gameWith([{ monster: 'blitz', owner: 1, at: at(1, 1) }, { monster: 'chevalier', owner: 2, at: at(1, 2) }], { players: { 1: { mana: 10 } } });
    expect(effectTargets(contact, 'u1')).toEqual([]);
    const far = gameWith([{ monster: 'blitz', owner: 1, at: at(1, 1) }, { monster: 'chevalier', owner: 2, at: at(1, 6) }], { players: { 1: { mana: 10 } } });
    expect(effectTargets(far, 'u1')).toEqual([]);
    const diagonal = gameWith([{ monster: 'blitz', owner: 1, at: at(1, 1) }, { monster: 'chevalier', owner: 2, at: at(3, 3) }], { players: { 1: { mana: 10 } } });
    expect(effectTargets(diagonal, 'u1')).toEqual([]);
  });

  it('la cible entre sur chaque case : un piège sur le trajet se déclenche', () => {
    const bomb: Trap = { owner: 1, pos: at(1, 3), effects: [{ type: 'damage', amount: 3 }], cardId: 'poseur-de-bombe', sourceId: 'u1', expiresAtTurn: 3 };
    const state = { ...base(), traps: [bomb] };
    const pulled = applyAction(state, effect('u1', { kind: 'unit', unitId: 'u2' }));
    expect(hpOf(pulled, 'u2')).toBe(hpOf(state, 'u2')! - 3);
    expect(pulled.units.u2?.pos).toEqual(at(1, 2)); // une bombe n'arrête pas
  });
});

describe('Elek : Statik 2', () => {
  // Cible au contact, puis une file d'ennemis reliés de proche en proche (chacun dans le carré de 1 du précédent).
  const state = gameWith([
    { monster: 'elek', owner: 1, at: at(1, 1) },
    { monster: 'golem', owner: 2, at: at(1, 2) }, // cible
    { monster: 'golem', owner: 2, at: at(2, 3) }, // 1er saut
    { monster: 'golem', owner: 2, at: at(3, 3) }, // 2e saut
    { monster: 'golem', owner: 2, at: at(4, 3) }, // 3e saut
    { monster: 'golem', owner: 2, at: at(5, 3) }, // 4e saut
    { monster: 'golem', owner: 2, at: at(1, 6) }, // relié à personne
  ]);
  const hit = applyAction(state, attack('u1', 'u2'));
  const lost = (id: UnitId) => hpOf(state, id)! - (hpOf(hit, id) ?? 0);

  it('les ennemis reliés à la cible perdent 2 de moins à chaque saut, jamais moins de 1', () => {
    expect(lost('u2')).toBe(6);
    expect(lost('u3')).toBe(4);
    expect(lost('u4')).toBe(2);
    expect(lost('u5')).toBe(1);
    expect(lost('u6')).toBe(1);
    expect(lost('u7')).toBe(0);
  });

  it('dégâts d’effet ; un monstre détruit par la propagation rapporte son VP', () => {
    expect(hit.events.filter((e) => e.type === 'damage' && e.unitId !== 'u2').every((e) => e.type === 'damage' && e.cause === 'effect')).toBe(true);
    const weak = gameWith([
      { monster: 'elek', owner: 1, at: at(1, 1) },
      { monster: 'golem', owner: 2, at: at(1, 2) },
      { monster: 'golem', owner: 2, at: at(2, 3), hp: 4 },
      { monster: 'golem', owner: 2, at: at(3, 3) },
    ]);
    const after = applyAction(weak, attack('u1', 'u2'));
    expect(after.units.u3).toBeUndefined();
    expect(after.players[1].vp).toBe(weak.players[1].vp + 1);
    // La propagation est calculée avant les dégâts : le 2e saut passe encore par la case du détruit.
    expect(hpOf(after, 'u4')).toBe(hpOf(weak, 'u4')! - 2);
  });

  it('un terrain attaqué ne lance pas la propagation', () => {
    const wall = gameWith([
      { monster: 'elek', owner: 1, at: at(1, 1) },
      { terrain: 'bastion', owner: 2, at: at(1, 2) },
      { monster: 'golem', owner: 2, at: at(2, 3) },
    ]);
    const after = applyAction(wall, attack('u1', 'u2'));
    expect(hpOf(after, 'u3')).toBe(hpOf(wall, 'u3'));
  });
});

describe('Chaînes d’éclair', () => {
  const grimoire = { players: { 1: { mana: 10, grimoire: ['chaines-eclair'] as CardId[] } } };

  it('4 dégâts à chaque unité ennemie sur une chaîne, terrains compris ; 8 sur deux chaînes', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(1, 0) },
        { monster: 'milicien', owner: 1, at: at(1, 6) },
        { monster: 'milicien', owner: 1, at: at(0, 3) },
        { monster: 'milicien', owner: 1, at: at(2, 3) },
        { monster: 'dragon-eau', owner: 2, at: at(1, 3) }, // sur la chaîne de la ligne et sur celle de la colonne
        { monster: 'golem', owner: 2, at: at(1, 5) },
        { terrain: 'bastion', owner: 2, at: at(1, 1) },
        { monster: 'golem', owner: 2, at: at(8, 8) },
      ],
      grimoire,
    );
    const next = applyAction(state, play('chaines-eclair', { kind: 'all' }));
    expect(hpOf(next, 'u5')).toBe(hpOf(state, 'u5')! - 8);
    expect(hpOf(next, 'u6')).toBe(hpOf(state, 'u6')! - 4);
    expect(hpOf(next, 'u7')).toBe(hpOf(state, 'u7')! - 4);
    expect(hpOf(next, 'u8')).toBe(hpOf(state, 'u8'));
  });

  it('une chaîne va d’un monstre au suivant ; une case X la coupe', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 0) },
        { monster: 'milicien', owner: 1, at: at(8, 4) },
        { monster: 'milicien', owner: 1, at: at(8, 8) },
        { monster: 'golem', owner: 2, at: at(8, 2) },
        { monster: 'milicien', owner: 1, at: at(2, 4) },
        { monster: 'golem', owner: 2, at: at(5, 4) }, // entre (2, 4) et (8, 4), derrière les cases X
      ],
      grimoire,
    );
    const next = applyAction(state, play('chaines-eclair', { kind: 'all' }));
    expect(hpOf(next, 'u4')).toBe(hpOf(state, 'u4')! - 4);
    expect(hpOf(next, 'u6')).toBe(hpOf(state, 'u6'));
  });

  it('toujours jouable, même sans ennemi visible', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 0) }], grimoire);
    expect(cardTargets(state, 'chaines-eclair')).toEqual([{ kind: 'all' }]);
  });
});

describe('Archi : pièges électriques', () => {
  it('pose sans limite par tour ; les pièges restent ; 3 à la fois, le plus ancien disparaît', () => {
    const state = gameWith([{ monster: 'archi', owner: 1, at: at(1, 4) }], { players: { 1: { mana: 10 } } });
    const cells = [at(0, 3), at(0, 5), at(2, 3), at(2, 5)];
    const placed = cells.reduce((s, pos) => applyAction(s, effect('u1', { kind: 'cell', pos })), state);
    expect(placed.traps.map((trap) => trap.pos)).toEqual(cells.slice(1));
    expect(placed.traps.every((trap) => trap.expiresAtTurn === null && trap.chain === 4)).toBe(true);
    expect(placed.players[1].mana).toBe(10 - 4);
    // Ils passent les tours, cachés à l'adversaire.
    const later = applyAction(applyAction(placed, END_TURN), END_TURN);
    expect(later.traps).toHaveLength(3);
    expect(getPlayerView(applyAction(placed, END_TURN), 2).traps).toEqual([]);
  });

  it('reliés seulement alignés à 4 cases au plus, sans case X ni falaise entre eux', () => {
    expect(chainBetween(BOARD, at(1, 1), at(1, 4), 4)).toEqual([at(1, 2), at(1, 3)]);
    expect(chainBetween(BOARD, at(1, 1), at(1, 6), 4)).toBeNull(); // 5 cases
    expect(chainBetween(BOARD, at(1, 1), at(2, 3), 4)).toBeNull(); // pas alignés
    expect(chainBetween(BOARD, at(2, 4), at(5, 4), 4)).toBeNull(); // cases X
    expect(chainBetween(BOARD, at(5, 1), at(5, 3), 4)).toBeNull(); // falaise de la Scierie
  });

  describe('un ennemi qui entre sur une chaîne déclenche tout le réseau', () => {
    const state: GameState = {
      ...gameWith(
        [
          { monster: 'archi', owner: 1, at: at(9, 8) },
          { monster: 'golem', owner: 2, at: at(2, 3) }, // il va entrer sur la chaîne
          { monster: 'golem', owner: 2, at: at(2, 2) }, // carré de 1 du piège (1, 1)
          { monster: 'golem', owner: 2, at: at(0, 4) }, // carré de 1 du piège (1, 4)
          { monster: 'golem', owner: 2, at: at(8, 0) }, // loin
          { monster: 'milicien', owner: 1, at: at(2, 1) }, // allié du poseur
          { monster: 'golem', owner: 2, at: at(2, 6) },
        ],
        { activePlayer: 2 },
      ),
      traps: [electric(at(1, 1)), electric(at(1, 4))],
    };
    const fired = applyAction(state, move('u2', at(1, 3)));

    it('1 dégât et immobilisé : à lui, et aux ennemis du carré de 1 de ses pièges ; il s’arrête', () => {
      expect(fired.units.u2).toMatchObject({ pos: at(1, 3), hp: hpOf(state, 'u2')! - 1 });
      expect(fired.units.u2?.statuses).toMatchObject([{ kind: 'immobilise' }]);
      expect(hpOf(fired, 'u3')).toBe(hpOf(state, 'u3')! - 1);
      expect(hpOf(fired, 'u4')).toBe(hpOf(state, 'u4')! - 1);
      expect(hpOf(fired, 'u5')).toBe(hpOf(state, 'u5'));
      expect(hpOf(fired, 'u6')).toBe(hpOf(state, 'u6'));
    });

    it('les pièges restent et se rechargent jusqu’au début du prochain tour de leur poseur', () => {
      expect(fired.traps).toHaveLength(2);
      expect(fired.traps.every((trap) => trap.rearmsAtTurn === state.turn + 1)).toBe(true);
      // Le même tour, un autre ennemi qui passe sur la chaîne ne déclenche rien.
      const dormant: GameState = {
        ...gameWith([{ monster: 'archi', owner: 1, at: at(9, 8) }, { monster: 'golem', owner: 2, at: at(2, 3) }], { activePlayer: 2 }),
        traps: fired.traps,
      };
      const crossed = applyAction(dormant, move('u2', at(1, 3)));
      expect(hpOf(crossed, 'u2')).toBe(hpOf(dormant, 'u2'));
      // Au tour de leur poseur, ils sont rechargés.
      const ownerTurn = applyAction(fired, END_TURN);
      expect(ownerTurn.traps).toHaveLength(2);
      expect(ownerTurn.traps.every((trap) => trap.rearmsAtTurn! <= ownerTurn.turn)).toBe(true);
    });
  });

  it('un ennemi qui entre sur un piège déclenche tout le réseau relié', () => {
    const state: GameState = {
      ...gameWith(
        [
          { monster: 'archi', owner: 1, at: at(9, 8) },
          { monster: 'golem', owner: 2, at: at(2, 1) },
          { monster: 'golem', owner: 2, at: at(2, 8) }, // carré de 1 du piège (1, 8), au bout du réseau
        ],
        { activePlayer: 2 },
      ),
      traps: [electric(at(1, 1)), electric(at(1, 4)), electric(at(1, 8))],
    };
    const fired = applyAction(state, move('u2', at(1, 1)));
    expect(hpOf(fired, 'u3')).toBe(hpOf(state, 'u3')! - 1);
    expect(fired.traps.every((trap) => trap.rearmsAtTurn !== undefined)).toBe(true);
  });

  it('des pièges trop loin ne sont pas reliés : rien sur la case entre eux', () => {
    const state: GameState = {
      ...gameWith([{ monster: 'archi', owner: 1, at: at(9, 8) }, { monster: 'golem', owner: 2, at: at(2, 3) }], { activePlayer: 2 }),
      traps: [electric(at(1, 1)), electric(at(1, 6))],
    };
    const moved = applyAction(state, move('u2', at(1, 3)));
    expect(hpOf(moved, 'u2')).toBe(hpOf(state, 'u2'));
  });

  it('déclenché pendant le tour de son poseur (attiré par Blitz) : rechargé au début de son tour d’après', () => {
    const state: GameState = {
      ...gameWith([{ monster: 'blitz', owner: 1, at: at(0, 3) }, { monster: 'golem', owner: 2, at: at(3, 3) }], { players: { 1: { mana: 10 } } }),
      traps: [electric(at(2, 1)), electric(at(2, 4))],
    };
    const pulled = applyAction(state, effect('u1', { kind: 'unit', unitId: 'u2' }));
    // Immobilisé sur la chaîne, il s'arrête là.
    expect(pulled.units.u2).toMatchObject({ pos: at(2, 3), hp: hpOf(state, 'u2')! - 1 });
    expect(pulled.traps.every((trap) => trap.rearmsAtTurn === state.turn + 2)).toBe(true);
  });
});

describe('arcs électriques (animation)', () => {
  const arcsOf = (state: GameState) => state.events.flatMap((e) => (e.type === 'arcs' ? e.arcs : []));

  it('Statik : un arc de chaque ennemi à celui qu’il relie', () => {
    const state = gameWith([
      { monster: 'elek', owner: 1, at: at(1, 1) },
      { monster: 'golem', owner: 2, at: at(1, 2) },
      { monster: 'golem', owner: 2, at: at(2, 3) },
      { monster: 'golem', owner: 2, at: at(3, 3) },
    ]);
    const hit = applyAction(state, attack('u1', 'u2'));
    expect(arcsOf(hit)).toEqual([
      { from: at(1, 2), to: at(2, 3), fromId: 'u2', toId: 'u3' },
      { from: at(2, 3), to: at(3, 3), fromId: 'u3', toId: 'u4' },
    ]);
  });

  it('un arc vers un monstre caché au joueur n’est pas dans sa vue', () => {
    const state = withStatus(
      gameWith([
        { monster: 'elek', owner: 1, at: at(1, 1) },
        { monster: 'golem', owner: 2, at: at(1, 2) },
        { monster: 'golem', owner: 2, at: at(5, 3) },
        { monster: 'golem', owner: 2, at: at(4, 3) },
        { monster: 'golem', owner: 2, at: at(3, 3) },
        { monster: 'golem', owner: 2, at: at(2, 3) },
      ]),
      'u3',
      'camouflage',
    );
    const hit = applyAction(state, attack('u1', 'u2'));
    expect(arcsOf(hit).some((arc) => arc.toId === 'u3')).toBe(true);
    const seen = getPlayerView(hit, 1).events.flatMap((e) => (e.type === 'arcs' ? e.arcs : []));
    expect(seen.some((arc) => arc.toId === 'u3' || arc.fromId === 'u3')).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('réseau d’Archi : d’un piège à l’autre, puis vers chaque ennemi touché', () => {
    const state: GameState = {
      ...gameWith([{ monster: 'archi', owner: 1, at: at(9, 8) }, { monster: 'golem', owner: 2, at: at(2, 3) }], { activePlayer: 2 }),
      traps: [electric(at(1, 1)), electric(at(1, 4))],
    };
    const fired = applyAction(state, move('u2', at(1, 3)));
    expect(arcsOf(fired)).toEqual([
      { from: at(1, 1), to: at(1, 4) },
      { from: at(1, 4), to: at(1, 3), toId: 'u2' },
    ]);
  });

  it('Chaînes d’éclair et Onde de choc : le long des chaînes, de l’allié vers chaque ennemi', () => {
    const chains = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(1, 0) },
        { monster: 'milicien', owner: 1, at: at(1, 5) },
      ],
      { players: { 1: { mana: 10, grimoire: ['chaines-eclair'] } } },
    );
    expect(arcsOf(applyAction(chains, play('chaines-eclair', { kind: 'all' })))).toEqual([{ from: at(1, 0), to: at(1, 5), fromId: 'u1', toId: 'u2' }]);
    const wave = gameWith(
      [
        { monster: 'archi', owner: 1, at: at(2, 2) },
        { monster: 'chevalier', owner: 2, at: at(2, 4) },
      ],
      { players: { 1: { mana: 10, grimoire: ['onde-de-choc'] } } },
    );
    expect(arcsOf(applyAction(wave, play('onde-de-choc', { kind: 'unit', unitId: 'u1' })))).toEqual([
      { from: at(2, 2), to: at(2, 4), fromId: 'u1', toId: 'u2' },
    ]);
  });
});

