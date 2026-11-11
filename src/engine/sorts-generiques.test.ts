import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { IllegalActionError } from './errors';
import { at, gameWith, withStatus } from './test-utils';
import { getAtk } from './units';
import type { Action, CardId, EffectTarget, GameState, MonsterUnit, PlayerState, Position, UnitId } from './types';

// Sorts génériques du 2026-11-10 (SPEC.md §6 ter, §10) : cartes communes, sans archétype. Plateau classique (11 × 9) :
// cases d'invocation de J1 en (0, 3), (0, 4), (0, 5) ; cases X en (3, 4), (4, 4), (6, 4), (7, 4) ; falaise de la Scierie
// entre les colonnes 2 et 3 (lignes 4 à 6) ; Forge en (5, 4), mana zone du haut en (2, 4).

const END_TURN: Action = { type: 'endTurn' };
const play = (cardId: CardId, target: EffectTarget): Action => ({ type: 'playCard', cardId, target });
const on = (unitId: UnitId): EffectTarget => ({ kind: 'unit', unitId });
const monster = (state: GameState, id: UnitId) => state.units[id] as MonsterUnit;
const targets = (state: GameState, cardId: CardId) =>
  getLegalActions(state).flatMap((a) => (a.type === 'playCard' && a.cardId === cardId ? [a.target] : []));
/** Cases où une téléportation de `cardId` peut poser `unitId`. */
const cells = (state: GameState, cardId: CardId, unitId: UnitId): Position[] =>
  targets(state, cardId).flatMap((t) => (t.kind === 'unitAndCell' && t.unitId === unitId ? [t.pos] : []));
const key = (pos: Position) => `${pos.row},${pos.col}`;
/** J1 a ces cartes en main et 10 mana. */
const hand = (cards: CardId[], player: Partial<PlayerState> = {}) => ({ players: { 1: { mana: 10, grimoire: cards, ...player } } });

describe('Puissance : un allié · +2 ATK (pour ce tour)', () => {
  it('n’importe où, jusqu’à la fin du tour ; 2 mana', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], hand(['puissance']));
    const after = applyAction(state, play('puissance', on('u1')));
    expect(getAtk(after, monster(after, 'u1'))).toBe(4);
    expect(after.players[1].mana).toBe(8);
    expect(getAtk(applyAction(after, END_TURN), monster(applyAction(after, END_TURN), 'u1'))).toBe(2);
  });
});

describe('Soin : un allié · soin 5', () => {
  it('rend 5 PV, sans dépasser ses PV max ; jamais sur un allié qui a tous ses PV', () => {
    const state = gameWith(
      [
        { monster: 'golem', owner: 1, at: at(8, 1), hp: 1 },
        { monster: 'milicien', owner: 1, at: at(8, 3) },
      ],
      hand(['soin', 'soin']),
    );
    expect(targets(state, 'soin')).toEqual([on('u1')]);
    const after = applyAction(state, play('soin', on('u1')));
    expect(monster(after, 'u1').hp).toBe(6);
    expect(monster(applyAction(after, play('soin', on('u1'))), 'u1').hp).toBe(7);
  });
});

describe('Flash : un allié · téléportation sur une case libre à 2 cases au plus de lui', () => {
  const scene = () =>
    gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(5, 3), mobilityLeft: 1 },
        { monster: 'golem', owner: 2, at: at(5, 2) },
      ],
      hand(['flash']),
    );

  it('diagonales comprises, par-dessus les cases X et les falaises ; jamais sur une case occupée ou une case X', () => {
    const reach = cells(scene(), 'flash', 'u1').map(key);
    expect(reach).toContain('3,5'); // la case X (4, 4) entre les deux
    expect(reach).toContain('5,1'); // de l'autre côté de la falaise de la Scierie
    expect(reach).toContain('7,1');
    expect(reach).not.toContain('5,2'); // le Golem
    expect(reach).not.toContain('4,4'); // case X
    expect(reach).not.toContain('5,6'); // 3 cases
    expect(reach).toHaveLength(19); // 24 cases autour, moins 4 cases X et le Golem
  });

  it('ce n’est pas un déplacement : il garde sa mobilité et son orientation, même immobilisé', () => {
    const state = scene();
    const after = applyAction(state, play('flash', { kind: 'unitAndCell', unitId: 'u1', pos: at(3, 5) }));
    expect(monster(after, 'u1')).toMatchObject({ pos: at(3, 5), mobilityLeft: 1, facing: monster(state, 'u1').facing });
    expect(after.players[1].mana).toBe(7);
    expect(cells(withStatus(state, 'u1', 'immobilise', 0, 0), 'flash', 'u1')).toHaveLength(19);
  });
});

describe('Fatigue : un ennemi · slow 2 pendant 1 tour', () => {
  it('jusqu’à la fin de son prochain tour : 2 de mobilité en moins à ce tour-là, puis plus rien', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'chevalier', owner: 2, at: at(2, 2) },
      ],
      hand(['fatigue']),
    );
    expect(targets(state, 'fatigue')).toEqual([on('u2')]);
    const after = applyAction(state, play('fatigue', on('u2')));
    expect(monster(after, 'u2').statuses).toEqual([expect.objectContaining({ kind: 'slow', amount: 2, turns: 1 })]);
    const hisTurn = applyAction(after, END_TURN);
    expect(monster(hisTurn, 'u2').mobilityLeft).toBe(1);
    const nextOne = applyAction(applyAction(hisTurn, END_TURN), END_TURN);
    expect(monster(nextOne, 'u2')).toMatchObject({ mobilityLeft: 3, statuses: [] });
  });
});

describe('Carapace : un allié · carapace jusqu’à son prochain tour (ne descend pas sous 1 PV)', () => {
  it('une attaque qui le détruirait le laisse à 1 PV, sans VP pour l’adversaire ; elle tombe au début de son tour', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2) },
      ],
      hand(['carapace']),
    );
    expect(targets(state, 'carapace')).toEqual([on('u1')]);
    const shielded = applyAction(applyAction(state, play('carapace', on('u1'))), END_TURN);
    const hit = applyAction(shielded, { type: 'attack', unitId: 'u2', targetId: 'u1', advance: false });
    expect(monster(hit, 'u1').hp).toBe(1);
    expect(hit.players[2].vp).toBe(shielded.players[2].vp);
    expect(monster(applyAction(hit, END_TURN), 'u1').statuses).toEqual([]);
  });

  it('une absorption sur un ennemi à 1 PV sous carapace ne rend rien à la source (Vladimir)', () => {
    const state = gameWith([
      { monster: 'vladimir', owner: 1, at: at(8, 1), hp: 3 },
      { monster: 'milicien', owner: 2, at: at(8, 2), hp: 1 },
    ]);
    const shielded = withStatus(state, 'u2', 'carapace', 0, 1);
    const after = applyAction({ ...shielded, players: { ...shielded.players, 1: { ...shielded.players[1], mana: 5 } } }, {
      type: 'activateEffect',
      unitId: 'u1',
      target: { kind: 'area' },
    });
    expect(monster(after, 'u2').hp).toBe(1);
    expect(monster(after, 'u1').hp).toBe(3);
  });
});

describe('Élixir de mana : +1 mana, pour 0 mana', () => {
  it('sans cible ; pas jouable à la limite de mana', () => {
    const state = gameWith([], hand(['elixir-de-mana', 'elixir-de-mana'], { mana: 9 }));
    expect(targets(state, 'elixir-de-mana')).toEqual([{ kind: 'all' }]);
    const after = applyAction(state, play('elixir-de-mana', { kind: 'all' }));
    expect(after.players[1].mana).toBe(10);
    expect(targets(after, 'elixir-de-mana')).toEqual([]);
    expect(() => applyAction(after, play('elixir-de-mana', { kind: 'all' }))).toThrow(IllegalActionError);
  });
});

describe('Cure : un allié · retire ses malus', () => {
  it('tous ses malus, requiem compris ; ses bonus restent ; jamais sur un allié sans malus', () => {
    let state = gameWith(
      [
        { monster: 'chevalier', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 1, at: at(8, 3) },
      ],
      hand(['cure']),
    );
    state = withStatus(withStatus(withStatus(withStatus(state, 'u1', 'burn', 1, 2), 'u1', 'requiem'), 'u1', 'stat', -1), 'u1', 'camouflage', 0, 1);
    expect(getAtk(state, monster(state, 'u1'))).toBe(2);
    expect(targets(state, 'cure')).toEqual([on('u1')]);
    const after = applyAction(state, play('cure', on('u1')));
    expect(monster(after, 'u1').statuses.map((s) => s.kind)).toEqual(['camouflage']);
    expect(getAtk(after, monster(after, 'u1'))).toBe(3);
    expect(after.events.find((e) => e.type === 'cleansed')).toMatchObject({ unitId: 'u1', removed: [{ kind: 'burn' }, { kind: 'requiem' }, { kind: 'stat' }] });
  });

  it('il retrouve la mobilité que ses malus lui ont prise ce tour : un slow du début de tour, un stun reçu en route', () => {
    // Slow 2 posé pendant le tour adverse : au début de son tour, le Chevalier (mobilité 3) n'a qu'un pas.
    const slowed = withStatus(gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }], { activePlayer: 2, players: { 1: { grimoire: ['cure'] } } }), 'u1', 'slow', 2, 1);
    const myTurn = applyAction(slowed, END_TURN);
    expect(monster(myTurn, 'u1').mobilityLeft).toBe(1);
    expect(monster(applyAction(myTurn, play('cure', on('u1'))), 'u1').mobilityLeft).toBe(3);
    // Stun après un pas : il avait encore 2 pas, il les retrouve.
    const walked = applyAction(gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }], hand(['cure'])), { type: 'move', unitId: 'u1', to: at(8, 2) });
    const stunned = withStatus(walked, 'u1', 'stun', 0, 0);
    expect(monster(stunned, 'u1').mobilityLeft).toBe(0);
    expect(monster(applyAction(stunned, play('cure', on('u1'))), 'u1').mobilityLeft).toBe(2);
  });
});

describe('Repli : un allié · téléportation sur une de ses cases d’invocation libres', () => {
  it('les cases d’invocation de son camp, et la case d’une de ses Zones d’invocation ; même stun ou immobilisé', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { terrain: 'zone-invocation', owner: 1, at: at(5, 4) },
      ],
      hand(['repli']),
    );
    expect(cells(state, 'repli', 'u1').map(key).sort()).toEqual(['0,3', '0,4', '0,5', '5,4']);
    const after = applyAction(withStatus(state, 'u1', 'stun', 0, 1), play('repli', { kind: 'unitAndCell', unitId: 'u1', pos: at(0, 4) }));
    expect(monster(after, 'u1').pos).toEqual(at(0, 4));
    expect(after.players[1].mana).toBe(9);
  });

  it('pas jouable si elles sont toutes occupées', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(0, 3) },
        { monster: 'golem', owner: 2, at: at(0, 4) },
        { monster: 'golem', owner: 2, at: at(0, 5) },
      ],
      hand(['repli']),
    );
    expect(targets(state, 'repli')).toEqual([]);
  });
});

describe('Téléportation : un allié · téléportation sur un de ses terrains sans monstre', () => {
  it('sur la case du terrain, qu’il partage alors ; pas sur un terrain où se tient déjà un monstre', () => {
    const state = gameWith(
      [
        { monster: 'milicien', owner: 1, at: at(8, 1) },
        { terrain: 'bastion', owner: 1, at: at(5, 4) },
        { terrain: 'autel-de-mana', owner: 1, at: at(2, 4) },
        { monster: 'golem', owner: 1, at: at(2, 4) },
      ],
      hand(['teleportation']),
    );
    expect(cells(state, 'teleportation', 'u1').map(key)).toEqual(['5,4']);
    const after = applyAction(state, play('teleportation', { kind: 'unitAndCell', unitId: 'u1', pos: at(5, 4) }));
    expect(monster(after, 'u1').pos).toEqual(at(5, 4));
    expect(after.players[1].mana).toBe(7);
    expect(targets(gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], hand(['teleportation'])), 'teleportation')).toEqual([]);
  });
});

describe('Réanimation : un monstre de son cimetière · invoqué sur une de ses cases d’invocation libres, sans payer son coût', () => {
  const scene = (graveyard: PlayerState['graveyard']) =>
    gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], hand(['reanimation'], { graveyard }));

  it('un monstre au choix (pas un sort) ; il revient avec tous ses PV et peut agir aussitôt ; il quitte le cimetière', () => {
    const state = scene([{ cardId: 'golem' }, { cardId: 'boule-de-feu' }]);
    expect(targets(state, 'reanimation')).toEqual(
      ['0,3', '0,4', '0,5'].map((cell) => ({ kind: 'cellAndCard', pos: at(Number(cell[0]), Number(cell[2])), cardId: 'golem' })),
    );
    const after = applyAction(state, play('reanimation', { kind: 'cellAndCard', pos: at(0, 4), cardId: 'golem' }));
    expect(after.players[1].mana).toBe(5);
    expect(monster(after, 'u2')).toMatchObject({ cardId: 'golem', owner: 1, pos: at(0, 4), hp: 7, maxHp: 7, mobilityLeft: 2, statuses: [] });
    expect(getLegalActions(after).some((a) => a.type === 'move' && a.unitId === 'u2')).toBe(true);
    expect(after.players[1].graveyard).toEqual([{ cardId: 'boule-de-feu' }, { cardId: 'reanimation' }]);
  });

  it('un exemplaire brillant revient brillant ; pas jouable sans monstre au cimetière', () => {
    const after = applyAction(scene([{ cardId: 'golem', shiny: true }]), play('reanimation', { kind: 'cellAndCard', pos: at(0, 3), cardId: 'golem' }));
    expect(monster(after, 'u2').shiny).toBe(true);
    expect(targets(scene([{ cardId: 'boule-de-feu' }]), 'reanimation')).toEqual([]);
  });
});

describe('Fortification : un de ses terrains · carapace jusqu’à son prochain tour', () => {
  it('ni une attaque ni le burn du début de son tour ne le font descendre sous 1 PV ; ensuite, le burn le détruit', () => {
    const state = withStatus(
      gameWith(
        [
          { terrain: 'bastion', owner: 1, at: at(5, 4), hp: 3 },
          { monster: 'golem', owner: 2, at: at(5, 5) },
          { monster: 'milicien', owner: 1, at: at(8, 1) },
        ],
        hand(['fortification']),
      ),
      'u1',
      'burn',
      5,
      2,
    );
    // Seulement un de ses terrains, jamais un monstre.
    expect(targets(state, 'fortification')).toEqual([on('u1')]);
    const fortified = applyAction(applyAction(state, play('fortification', on('u1'))), END_TURN);
    const hit = applyAction(fortified, { type: 'attack', unitId: 'u2', targetId: 'u1', advance: false });
    expect(hit.units.u1?.hp).toBe(1);
    const myTurn = applyAction(hit, END_TURN);
    expect(myTurn.units.u1).toMatchObject({ hp: 1, statuses: [expect.objectContaining({ kind: 'burn' })] });
    expect(applyAction(applyAction(myTurn, END_TURN), END_TURN).units.u1).toBeUndefined();
  });
});
