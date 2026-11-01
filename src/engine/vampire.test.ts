import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { effectAvailability } from './availability';
import { DECKS, getMonsterCard } from './cards';
import { previewAttack } from './combat';
import { at, gameWith, withStatus } from './test-utils';
import { getAtk } from './units';
import { getPlayerView } from './view';
import type { Action, CardId, GameState, MonsterUnit, Position } from './types';

// Deck Vampire (SPEC.md §6 bis, §10) : Soif, absorption (Vladimir, Zoldik), Appel du sang, Sacrifice sanguinaire,
// transformation d'Emma en chauve-souris.

const monster = (state: GameState, id: string) => state.units[id] as MonsterUnit;
const attack = (unitId: string, targetId: string, advance = false): Action => ({ type: 'attack', unitId, targetId, advance });
const move = (unitId: string, path: readonly Position[]): Action => ({ type: 'move', unitId, to: path.at(-1)!, path });
const activate = (unitId: string, target: Extract<Action, { type: 'activateEffect' }>['target']): Action => ({
  type: 'activateEffect',
  unitId,
  target,
});
const transform = (unitId: string): Action => activate(unitId, { kind: 'unit', unitId });
const cast = (cardId: CardId, target: Extract<Action, { type: 'playCard' }>['target']): Action => ({ type: 'playCard', cardId, target });
const endTurn: Action = { type: 'endTurn' };
const MANA = { players: { 1: { mana: 10 }, 2: { mana: 10 } } };
const withGrimoire = (...grimoire: CardId[]) => ({ players: { 1: { mana: 10, grimoire }, 2: { mana: 10 } } });
const canAttack = (state: GameState, unitId: string) => getLegalActions(state).some((a) => a.type === 'attack' && a.unitId === unitId);

describe('cartes du deck Vampire', () => {
  it('stats, archétype Vampire, Soif 1 ; la chauve-souris est une forme d’Emma, hors grimoire ; le deck fait 25 cartes', () => {
    const soif = [{ keyword: 'soif', amount: 1 }];
    expect(getMonsterCard('delta')).toMatchObject({ name: 'Delta - Vampire', cost: 1, atk: 2, hp: 2, mobility: 5, range: 1, archetype: 'vampire', keywords: soif });
    expect(getMonsterCard('emma')).toMatchObject({ cost: 2, atk: 3, hp: 3, mobility: 4, range: 1, archetype: 'vampire', keywords: soif });
    expect(getMonsterCard('emma-chauve-souris')).toMatchObject({ atk: 1, hp: 1, mobility: 8, range: 1, archetype: 'vampire', keywords: soif, formOf: 'emma' });
    expect(getMonsterCard('vladimir')).toMatchObject({ cost: 5, atk: 3, hp: 5, mobility: 5, range: 1, archetype: 'vampire' });
    expect(getMonsterCard('zoldik')).toMatchObject({ cost: 7, atk: 4, hp: 6, mobility: 5, range: 1, archetype: 'vampire' });
    expect(DECKS.find((d) => d.id === 'vampire')!.cards).toHaveLength(25);
  });
});

describe('Soif : à l’attaque, il récupère 1 PV', () => {
  it('après les dégâts, sans dépasser ses PV max', () => {
    const state = gameWith([
      { monster: 'delta', owner: 1, at: at(2, 1), hp: 1 },
      { monster: 'milicien', owner: 2, at: at(2, 2) },
    ]);
    const after = applyAction(state, attack('u1', 'u2'));
    expect(after.units.u2?.hp).toBe(1);
    expect(monster(after, 'u1').hp).toBe(2);
    expect(after.events.map((e) => e.type)).toEqual(['attack', 'damage', 'heal']);
    // Tous ses PV : rien.
    const full = applyAction(gameWith([{ monster: 'delta', owner: 1, at: at(2, 1) }, { monster: 'milicien', owner: 2, at: at(2, 2) }]), attack('u1', 'u2'));
    expect(monster(full, 'u1').hp).toBe(2);
    expect(full.events.some((e) => e.type === 'heal')).toBe(false);
  });

  it('avant la riposte : Delta à 1 PV contre le Gardien remonte à 2, puis retombe à 1 et survit', () => {
    const state = gameWith([
      { monster: 'delta', owner: 1, at: at(2, 1), hp: 1 },
      { monster: 'gardien', owner: 2, at: at(2, 2) },
    ]);
    expect(previewAttack(state, monster(state, 'u1'), state.units.u2!)).toMatchObject({ heal: 1, riposte: 1, attackerHpAfter: 1 });
    const after = applyAction(state, attack('u1', 'u2'));
    expect(monster(after, 'u1').hp).toBe(1);
    expect(after.players[2].vp).toBe(0);
  });

  it('aussi contre un terrain, et quand la cible est détruite (avant l’avancée)', () => {
    const terrain = applyAction(
      gameWith([{ monster: 'delta', owner: 1, at: at(2, 1), hp: 1 }, { terrain: 'bastion', owner: 2, at: at(2, 2) }]),
      attack('u1', 'u2'),
    );
    expect(monster(terrain, 'u1').hp).toBe(2);
    const state = gameWith([{ monster: 'delta', owner: 1, at: at(2, 1), hp: 1 }, { monster: 'eclaireur', owner: 2, at: at(2, 2) }]);
    const kill = applyAction(state, attack('u1', 'u2', true));
    expect(kill.units.u2).toBeUndefined();
    expect(monster(kill, 'u1')).toMatchObject({ hp: 2, pos: at(2, 2) });
    expect(kill.players[1].vp).toBe(1);
  });
});

describe('Vladimir : absorbe 1 PV à chaque ennemi adjacent', () => {
  const around = (vladimirHp: number) =>
    gameWith(
      [
        { monster: 'vladimir', owner: 1, at: at(2, 2), hp: vladimirHp },
        { monster: 'milicien', owner: 2, at: at(2, 3) },
        { monster: 'golem', owner: 2, at: at(3, 3) },
        { monster: 'delta', owner: 1, at: at(1, 2) },
      ],
      MANA,
    );

  it('chaque ennemi adjacent (diagonales comprises) perd 1 PV, jamais un allié ; Vladimir récupère 1 PV par ennemi', () => {
    const after = applyAction(around(2), activate('u1', { kind: 'area' }));
    expect(after.units.u2?.hp).toBe(2);
    expect(after.units.u3?.hp).toBe(6);
    expect(after.units.u4?.hp).toBe(2);
    expect(monster(after, 'u1').hp).toBe(4);
    expect(after.players[1].mana).toBe(8);
    // Pas une attaque : son attaque reste.
    expect(monster(after, 'u1').hasAttacked).toBe(false);
  });

  it('jouable même avec tous ses PV, sans les dépasser ; une fois par tour', () => {
    const after = applyAction(around(5), activate('u1', { kind: 'area' }));
    expect(monster(after, 'u1').hp).toBe(5);
    expect(getLegalActions(after).some((a) => a.type === 'activateEffect' && a.unitId === 'u1')).toBe(false);
  });

  it('un ennemi détruit rapporte 1 VP ; sans ennemi adjacent, pas d’effet', () => {
    const state = gameWith(
      [{ monster: 'vladimir', owner: 1, at: at(2, 2), hp: 4 }, { monster: 'eclaireur', owner: 2, at: at(1, 1) }],
      MANA,
    );
    const after = applyAction(state, activate('u1', { kind: 'area' }));
    expect(after.units.u2).toBeUndefined();
    expect(after.players[1].vp).toBe(1);
    expect(monster(after, 'u1').hp).toBe(5);
    const alone = gameWith([{ monster: 'vladimir', owner: 1, at: at(2, 2) }, { monster: 'eclaireur', owner: 2, at: at(5, 5) }], MANA);
    expect(getLegalActions(alone).some((a) => a.type === 'activateEffect')).toBe(false);
  });
});

describe('Zoldik : absorbe tous les PV d’un ennemi adjacent, sauf 1', () => {
  const duel = (zoldikHp: number, golemHp = 7) =>
    gameWith(
      [
        { monster: 'zoldik', owner: 1, at: at(2, 2), hp: zoldikHp },
        { monster: 'golem', owner: 2, at: at(3, 3), hp: golemHp },
        { monster: 'milicien', owner: 2, at: at(2, 3) },
      ],
      MANA,
    );

  it('la cible tombe à 1 PV ; Zoldik récupère les PV retirés, sans dépasser ses PV max ; jamais de VP', () => {
    const after = applyAction(duel(2), activate('u1', { kind: 'unit', unitId: 'u2' }));
    expect(after.units.u2?.hp).toBe(1);
    expect(monster(after, 'u1').hp).toBe(6);
    expect(after.players[1]).toMatchObject({ mana: 7, vp: 0 });
  });

  it('impossible sur un ennemi à 1 PV ; jouable même avec tous ses PV', () => {
    const targets = getLegalActions(duel(6, 1)).flatMap((a) => (a.type === 'activateEffect' && a.target.kind === 'unit' ? [a.target.unitId] : []));
    expect(targets).toEqual(['u3']);
  });

  it('il peut attaquer puis l’activer ; après l’activation, il ne peut plus attaquer ce tour', () => {
    const attacked = applyAction(duel(6), attack('u1', 'u3'));
    const drained = applyAction(attacked, activate('u1', { kind: 'unit', unitId: 'u2' }));
    expect(drained.units.u2?.hp).toBe(1);
    const first = applyAction(duel(6), activate('u1', { kind: 'unit', unitId: 'u2' }));
    expect(monster(first, 'u1').hasAttacked).toBe(true);
    expect(canAttack(first, 'u1')).toBe(false);
  });
});

describe('Appel du sang : +2 mobilité à tous ses vampires ce tour', () => {
  it('ses vampires seulement, au moment du sort ; 3 mana', () => {
    const state = gameWith(
      [
        { monster: 'delta', owner: 1, at: at(2, 0) },
        { monster: 'emma', owner: 1, at: at(2, 2) },
        { monster: 'milicien', owner: 1, at: at(2, 4) },
        { monster: 'delta', owner: 2, at: at(8, 0) },
      ],
      withGrimoire('appel-du-sang'),
    );
    const after = applyAction(state, cast('appel-du-sang', { kind: 'all' }));
    expect([1, 2, 3, 4].map((i) => monster(after, `u${i}`).mobilityLeft)).toEqual([7, 6, 2, 5]);
    expect(after.players[1].mana).toBe(7);
  });

  it('pas jouable sans vampire', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(2, 0) }], withGrimoire('appel-du-sang'));
    expect(getLegalActions(state).some((a) => a.type === 'playCard')).toBe(false);
  });
});

describe('Sacrifice sanguinaire : tous ses PV sauf 1, +1 ATK par PV perdu ce tour', () => {
  const board = () =>
    gameWith(
      [
        { monster: 'emma', owner: 1, at: at(2, 2) },
        { monster: 'delta', owner: 1, at: at(2, 0), hp: 1 },
        { monster: 'milicien', owner: 1, at: at(2, 4) },
        { monster: 'emma', owner: 2, at: at(8, 2) },
        { monster: 'milicien', owner: 2, at: at(2, 3) },
      ],
      withGrimoire('sacrifice-sanguinaire'),
    );

  it('un de ses vampires qui a plus de 1 PV', () => {
    const targets = getLegalActions(board()).flatMap((a) => (a.type === 'playCard' && a.target.kind === 'unit' ? [a.target.unitId] : []));
    expect(targets).toEqual(['u1']);
  });

  it('il tombe à 1 PV, sans être détruit ; le bonus d’ATK ne vaut que ce tour, les PV ne reviennent pas', () => {
    const after = applyAction(board(), cast('sacrifice-sanguinaire', { kind: 'unit', unitId: 'u1' }));
    expect(monster(after, 'u1')).toMatchObject({ hp: 1, maxHp: 3, atkBonus: 2 });
    expect(getAtk(after, monster(after, 'u1'))).toBe(5);
    expect(after.players[1].vp + after.players[2].vp).toBe(0);
    const later = applyAction(applyAction(after, endTurn), endTurn);
    expect(monster(later, 'u1')).toMatchObject({ hp: 1, atkBonus: 0 });
  });

  it('il peut être soigné ensuite (Soif)', () => {
    const after = applyAction(applyAction(board(), cast('sacrifice-sanguinaire', { kind: 'unit', unitId: 'u1' })), attack('u1', 'u5'));
    expect(after.units.u5).toBeUndefined();
    expect(monster(after, 'u1').hp).toBe(2);
  });
});

describe('Emma : se transforme en chauve-souris, et inversement', () => {
  const emma = (overrides: Partial<Pick<MonsterUnit, 'hp' | 'mobilityLeft'>> = {}) => gameWith([{ monster: 'emma', owner: 1, at: at(1, 0), ...overrides }], MANA);

  it('1 mana, sans limite par tour : stats de la forme, même monstre', () => {
    const bat = applyAction(emma(), transform('u1'));
    expect(monster(bat, 'u1')).toMatchObject({ cardId: 'emma-chauve-souris', atk: 1, hp: 1, maxHp: 1, pos: at(1, 0), usedEffects: [] });
    expect(bat.players[1].mana).toBe(9);
    expect(effectAvailability(getPlayerView(bat, 1), 'u1')).toEqual({ ok: true });
    const back = applyAction(bat, transform('u1'));
    expect(monster(back, 'u1')).toMatchObject({ cardId: 'emma', atk: 3, hp: 3, maxHp: 3 });
    const again = applyAction(back, transform('u1'));
    expect(monster(again, 'u1').cardId).toBe('emma-chauve-souris');
    expect(again.players[1].mana).toBe(7);
    expect(again.events.some((e) => e.type === 'transform')).toBe(true);
  });

  it('PV mis de côté : chaque forme garde ses PV perdus', () => {
    const bat = applyAction(emma({ hp: 1 }), transform('u1'));
    expect(monster(bat, 'u1')).toMatchObject({ hp: 1, maxHp: 1 });
    expect(monster(applyAction(bat, transform('u1')), 'u1')).toMatchObject({ hp: 1, maxHp: 3 });
    // Avec Bénédiction (+1 ATK +1 PV sur les deux formes) : la chauve-souris blessée le reste.
    const blessed = gameWith([{ monster: 'emma', owner: 1, at: at(1, 0), atk: 4, hp: 4 }], MANA);
    const strong = { ...blessed, units: { u1: { ...monster(blessed, 'u1'), maxHp: 4 } } };
    const wounded = applyAction(strong, transform('u1'));
    expect(monster(wounded, 'u1')).toMatchObject({ atk: 2, hp: 2, maxHp: 2 });
    const hurt: GameState = { ...wounded, units: { u1: { ...monster(wounded, 'u1'), hp: 1 } } };
    const emmaAgain = applyAction(hurt, transform('u1'));
    expect(monster(emmaAgain, 'u1')).toMatchObject({ atk: 4, hp: 4, maxHp: 4 });
    expect(monster(applyAction(emmaAgain, transform('u1')), 'u1')).toMatchObject({ hp: 1, maxHp: 2 });
  });

  it('mobilité : celle de la nouvelle forme moins ce qu’il a déjà dépensé ce tour', () => {
    const walked = applyAction(emma(), move('u1', [at(1, 1), at(1, 2), at(1, 3)]));
    const bat = applyAction(walked, transform('u1'));
    expect(monster(bat, 'u1').mobilityLeft).toBe(5);
    const flown = applyAction(bat, move('u1', [at(2, 3), at(2, 4), at(2, 5), at(2, 6), at(2, 7)]));
    const back = applyAction(flown, transform('u1'));
    expect(monster(back, 'u1').mobilityLeft).toBe(0);
    // Redevenue chauve-souris, elle ne regagne rien : 8 cases au plus ce tour.
    expect(monster(applyAction(back, transform('u1')), 'u1').mobilityLeft).toBe(0);
  });

  it('immobilisé, ou arrêté pour ce tour (sablier, arrêt forcé) : rien à regagner', () => {
    const net = withStatus(emma(), 'u1', 'immobilise', 0, 1);
    expect(monster(applyAction(net, transform('u1')), 'u1').mobilityLeft).toBe(0);
    const stopped = emma({ mobilityLeft: 0 });
    const halted: GameState = { ...stopped, units: { u1: { ...monster(stopped, 'u1'), halted: true } } };
    expect(monster(applyAction(halted, transform('u1')), 'u1').mobilityLeft).toBe(0);
  });

  it('une seule attaque par tour, quelle que soit la forme ; statuts gardés', () => {
    const state = withStatus(
      gameWith([{ monster: 'emma', owner: 1, at: at(2, 2) }, { monster: 'golem', owner: 2, at: at(2, 3) }], MANA),
      'u1',
      'burn',
      1,
      2,
    );
    const bat = applyAction(applyAction(state, attack('u1', 'u2')), transform('u1'));
    expect(monster(bat, 'u1').hasAttacked).toBe(true);
    expect(canAttack(bat, 'u1')).toBe(false);
    expect(monster(bat, 'u1').statuses.map((s) => s.kind)).toEqual(['burn']);
  });

  it('la forme reste d’un tour à l’autre, avec la mobilité de sa forme', () => {
    const bat = applyAction(emma({ mobilityLeft: 0 }), transform('u1'));
    const next = applyAction(applyAction(bat, endTurn), endTurn);
    expect(monster(next, 'u1')).toMatchObject({ cardId: 'emma-chauve-souris', mobilityLeft: 8 });
    expect(monster(next, 'u1').mobilityDebt).toBeUndefined();
    expect(monster(next, 'u1').halted).toBeUndefined();
  });

  it('chauve-souris détruite : Emma va au cimetière, l’adversaire marque 1 VP', () => {
    const state = gameWith(
      [{ monster: 'emma-chauve-souris', owner: 1, at: at(2, 2) }, { monster: 'milicien', owner: 2, at: at(2, 3) }],
      { activePlayer: 2 },
    );
    const after = applyAction(state, attack('u2', 'u1'));
    expect(after.units.u1).toBeUndefined();
    expect(after.players[1].graveyard).toEqual(['emma']);
    expect(after.players[2].vp).toBe(1);
  });
});
