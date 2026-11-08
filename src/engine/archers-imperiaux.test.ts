import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { DECKS, getMonsterCard, getTerrainCard as getTerrain } from './cards';
import { IllegalActionError } from './errors';
import { at, gameWith } from './test-utils';
import { attackLimit, canAttack, getAtk, getRange } from './units';
import { effectAvailability } from './availability';
import { getPlayerView } from './view';
import type { Action, GameState, MonsterUnit, UnitId } from './types';

// Deck Archers impériaux (SPEC.md §6 bis, §10, remaniement du 2026-11-08) : Carquois prêt ! (2 attaques par tour),
// armé (Flèche explosive, Carreau perforant), Trébuchet sans attaque au contact, Camps de tir (+1 portée).

const MANA = { players: { 1: { mana: 10 } } };
const monster = (state: GameState, id: UnitId) => state.units[id] as MonsterUnit;
const shoot = (unitId: UnitId, targetId: UnitId): Action => ({ type: 'attack', unitId, targetId, advance: false });
const arm = (unitId: UnitId): Action => ({ type: 'activateEffect', unitId, target: { kind: 'unit', unitId } });
const move = (unitId: UnitId, ...path: ReturnType<typeof at>[]): Action => ({ type: 'move', unitId, to: path.at(-1)!, path });
const endTurn: Action = { type: 'endTurn' };
const canShoot = (state: GameState, unitId: UnitId, targetId: UnitId) =>
  getLegalActions(state).some((a) => a.type === 'attack' && a.unitId === unitId && a.targetId === targetId);
const canArm = (state: GameState, unitId: UnitId) => getLegalActions(state).some((a) => a.type === 'activateEffect' && a.unitId === unitId);

describe('les cartes et le deck', () => {
  it('stats : Écuyer 0/3/6 portée 0, Archer impérial 2/2/3 portée 4, Arbalétrier 4/2/3 portée 3, Trébuchet 5/2/2 portée 6', () => {
    expect(getMonsterCard('ecuyer-archers')).toMatchObject({ cost: 1, atk: 0, hp: 3, mobility: 6, range: 0, archetype: 'archer' });
    expect(getMonsterCard('archer-imperial')).toMatchObject({ cost: 2, atk: 2, hp: 2, mobility: 3, range: 4, archetype: 'archer' });
    expect(getMonsterCard('arbaletrier-imperial')).toMatchObject({ cost: 3, atk: 4, hp: 2, mobility: 3, range: 3, archetype: 'archer' });
    expect(getMonsterCard('trebuchet-archers')).toMatchObject({ cost: 4, atk: 5, hp: 2, mobility: 2, range: 6, archetype: 'archer', noContact: true });
  });

  it('le deck fait 26 cartes, sans exemplaire brillant', () => {
    const deck = DECKS.find((d) => d.id === 'archers')!;
    expect(deck.name).toBe('Archers impériaux');
    expect(deck.cards).toHaveLength(26);
    expect(deck.shiny).toBeUndefined();
  });
});

describe('Écuyer · Carquois prêt ! : 2 attaques par tour pour ses archers impériaux du carré de 1', () => {
  const base = (extra: Parameters<typeof gameWith>[0] = []) =>
    gameWith(
      [
        { monster: 'archer-imperial', owner: 1, at: at(9, 2) },
        { monster: 'ecuyer-archers', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(9, 6) },
        ...extra,
      ],
      MANA,
    );

  it('deux attaques dans la zone, pas trois ; sans l’Écuyer, une seule', () => {
    let state = base();
    expect(attackLimit(state, monster(state, 'u1'))).toBe(2);
    state = applyAction(state, shoot('u1', 'u3'));
    expect(monster(state, 'u1')).toMatchObject({ hasAttacked: true, attacksMade: 1 });
    expect(canShoot(state, 'u1', 'u3')).toBe(true);
    state = applyAction(state, shoot('u1', 'u3'));
    expect(state.units.u3?.hp).toBe(3);
    expect(canShoot(state, 'u1', 'u3')).toBe(false);
    expect(() => applyAction(state, shoot('u1', 'u3'))).toThrow(IllegalActionError);
    // Le tour suivant, le compteur repart de 0.
    const later = applyAction(applyAction(state, endTurn), endTurn);
    expect(monster(later, 'u1').attacksMade).toBe(0);
    expect(canShoot(later, 'u1', 'u3')).toBe(true);

    const alone = gameWith([{ monster: 'archer-imperial', owner: 1, at: at(9, 2) }, { monster: 'golem', owner: 2, at: at(9, 6) }], MANA);
    const once = applyAction(alone, shoot('u1', 'u2'));
    expect(canShoot(once, 'u1', 'u2')).toBe(false);
  });

  it('l’Écuyer n’attaque jamais (ATK 0, portée 0) et ne profite pas de sa propre aura', () => {
    const state = gameWith([{ monster: 'ecuyer-archers', owner: 1, at: at(9, 3) }, { monster: 'golem', owner: 2, at: at(9, 4) }], MANA);
    expect(getLegalActions(state).filter((a) => a.type === 'attack')).toEqual([]);
    expect(canAttack(state, monster(state, 'u1'))).toBe(true); // il en aurait le droit, mais sa portée est 0
    expect(attackLimit(state, monster(state, 'u1'))).toBe(1);
  });

  it('la zone est vérifiée à chaque attaque : un archer qui sort de la zone ne tire plus', () => {
    let state = gameWith(
      [
        { monster: 'archer-imperial', owner: 1, at: at(9, 1) },
        { monster: 'ecuyer-archers', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(9, 4) },
      ],
      MANA,
    );
    state = applyAction(state, shoot('u1', 'u3'));
    state = applyAction(state, move('u1', at(9, 0)));
    expect(canShoot(state, 'u1', 'u3')).toBe(false);
  });

  it('… et un archer qui a déjà tiré une fois retrouve une 2e attaque quand l’Écuyer le rejoint', () => {
    let state = gameWith(
      [
        { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
        { monster: 'ecuyer-archers', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(9, 4) },
      ],
      MANA,
    );
    state = applyAction(state, shoot('u1', 'u3'));
    expect(canShoot(state, 'u1', 'u3')).toBe(false);
    state = applyAction(state, move('u2', at(8, 1)));
    expect(canShoot(state, 'u1', 'u3')).toBe(true);
  });

  it('plusieurs Écuyers ne s’additionnent pas ; l’aura ne sert pas un archer adverse ni un autre monstre', () => {
    const two = gameWith(
      [
        { monster: 'archer-imperial', owner: 1, at: at(9, 2) },
        { monster: 'ecuyer-archers', owner: 1, at: at(9, 1) },
        { monster: 'ecuyer-archers', owner: 1, at: at(9, 3) },
        { monster: 'archer-imperial', owner: 2, at: at(8, 2) },
        { monster: 'milicien', owner: 1, at: at(8, 3) },
      ],
      MANA,
    );
    expect(attackLimit(two, monster(two, 'u1'))).toBe(2);
    expect(attackLimit(two, monster(two, 'u4'))).toBe(1);
    expect(attackLimit(two, monster(two, 'u5'))).toBe(1);
  });

  it('le Trébuchet des archers est un archer impérial : l’Écuyer lui donne aussi 2 attaques', () => {
    const state = gameWith(
      [
        { monster: 'trebuchet-archers', owner: 1, at: at(9, 2) },
        { monster: 'ecuyer-archers', owner: 1, at: at(9, 3) },
      ],
      MANA,
    );
    expect(attackLimit(state, monster(state, 'u1'))).toBe(2);
  });
});

describe('armé : Flèche explosive et Carreau perforant (1 mana, sans limite par tour)', () => {
  it('Flèche explosive : l’attaque inflige 1 dégât aux ennemis du carré de 1 de la cible, jamais à la cible ni à un allié', () => {
    let state = gameWith(
      [
        { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
        { monster: 'golem', owner: 2, at: at(9, 4) },
        { monster: 'milicien', owner: 2, at: at(8, 5) }, // diagonale de la cible : touché
        { monster: 'milicien', owner: 1, at: at(9, 5) }, // allié à côté de la cible : épargné
        { monster: 'milicien', owner: 2, at: at(9, 7) }, // trop loin
      ],
      MANA,
    );
    state = applyAction(state, arm('u1'));
    expect(state.players[1].mana).toBe(9);
    expect(monster(state, 'u1').armed).toMatchObject({ atk: 0, splash: 1 });
    state = applyAction(state, shoot('u1', 'u2'));
    expect(state.units.u2?.hp).toBe(5); // 7 - ATK 2 (pas de dégât en plus sur la cible)
    expect(state.units.u3?.hp).toBe(2);
    expect(state.units.u4?.hp).toBe(3);
    expect(state.units.u5?.hp).toBe(3);
    expect(monster(state, 'u1').armed).toBeUndefined();
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'damage', unitId: 'u3', amount: 1, cause: 'effect' }));
  });

  it('un ennemi détruit par l’éclat rapporte 1 VP, même si la cible est détruite par l’attaque', () => {
    let state = gameWith(
      [
        { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
        { monster: 'eclaireur', owner: 2, at: at(9, 3) },
        { monster: 'eclaireur', owner: 2, at: at(8, 3) },
      ],
      MANA,
    );
    state = applyAction(state, arm('u1'));
    const vp = state.players[1].vp;
    state = applyAction(state, shoot('u1', 'u2'));
    expect(state.units.u2).toBeUndefined();
    expect(state.units.u3).toBeUndefined();
    expect(state.players[1].vp).toBe(vp + 2);
  });

  it('Carreau perforant : +2 ATK pour cette attaque seulement', () => {
    let state = gameWith([{ monster: 'arbaletrier-imperial', owner: 1, at: at(9, 0) }, { monster: 'golem', owner: 2, at: at(9, 3) }], MANA);
    state = applyAction(state, arm('u1'));
    expect(getAtk(state, monster(state, 'u1'))).toBe(6);
    state = applyAction(state, shoot('u1', 'u2'));
    expect(state.units.u2?.hp).toBe(1); // 7 - 6
    expect(getAtk(state, monster(state, 'u1'))).toBe(4);
  });

  it('un seul effet armé à la fois, et seulement s’il lui reste une attaque : il faut attaquer avant de réarmer', () => {
    let state = gameWith([{ monster: 'archer-imperial', owner: 1, at: at(9, 0) }, { monster: 'golem', owner: 2, at: at(9, 4) }], MANA);
    state = applyAction(state, arm('u1'));
    expect(canArm(state, 'u1')).toBe(false);
    expect(() => applyAction(state, arm('u1'))).toThrow(IllegalActionError);
    expect(effectAvailability(getPlayerView(state, 1), 'u1')).toEqual({ ok: false, reason: { kind: 'armed' } });
    state = applyAction(state, shoot('u1', 'u2'));
    // Une seule attaque : plus rien à armer.
    expect(canArm(state, 'u1')).toBe(false);
    expect(effectAvailability(getPlayerView(state, 1), 'u1')).toEqual({ ok: false, reason: { kind: 'noAttack' } });
  });

  it('avec Carquois prêt ! : armer, tirer, réarmer, tirer ; l’effet n’est jamais noté comme utilisé', () => {
    let state = gameWith(
      [
        { monster: 'arbaletrier-imperial', owner: 1, at: at(9, 2) },
        { monster: 'ecuyer-archers', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(9, 5) },
      ],
      MANA,
    );
    state = applyAction(state, arm('u1'));
    state = applyAction(state, shoot('u1', 'u3'));
    expect(canArm(state, 'u1')).toBe(true);
    state = applyAction(state, arm('u1'));
    state = applyAction(state, shoot('u1', 'u3'));
    expect(state.units.u3).toBeUndefined(); // 4 + 2 = 6, puis 6 : 7 PV détruits
    expect(state.players[1].mana).toBe(8);
    expect(monster(state, 'u1').usedEffects).toEqual([]);
    expect(canArm(state, 'u1')).toBe(false);
  });

  it('armé sans attaquer : le bonus est perdu à la fin du tour', () => {
    let state = gameWith([{ monster: 'arbaletrier-imperial', owner: 1, at: at(9, 0) }, { monster: 'golem', owner: 2, at: at(9, 3) }], MANA);
    state = applyAction(state, arm('u1'));
    state = applyAction(state, endTurn);
    expect(monster(state, 'u1').armed).toBeUndefined();
    expect(getAtk(state, monster(state, 'u1'))).toBe(4);
  });

  it('un tir bloqué par un monstre invisible consomme l’armé, sans éclats', () => {
    let state = gameWith(
      [
        { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
        { monster: 'farceur', owner: 2, at: at(9, 3) },
        { monster: 'golem', owner: 2, at: at(9, 4) },
        { monster: 'milicien', owner: 2, at: at(8, 4) },
      ],
      MANA,
    );
    state = applyAction(state, arm('u1'));
    state = applyAction(state, shoot('u1', 'u3'));
    expect(monster(state, 'u1').armed).toBeUndefined();
    expect(state.units.u4?.hp).toBe(3);
  });
});

describe('Trébuchet des archers : Siège ×2, jamais au contact', () => {
  it('pas de cible au contact (1 case en ligne droite) ; la diagonale reste possible', () => {
    const state = gameWith(
      [
        { monster: 'trebuchet-archers', owner: 1, at: at(9, 1) },
        { monster: 'golem', owner: 2, at: at(9, 2) }, // au contact
        { monster: 'golem', owner: 2, at: at(8, 2) }, // en diagonale
      ],
      MANA,
    );
    expect(canShoot(state, 'u1', 'u2')).toBe(false);
    expect(canShoot(state, 'u1', 'u3')).toBe(true);
    expect(() => applyAction(state, shoot('u1', 'u2'))).toThrow(IllegalActionError);
  });

  it('une cible à 2 cases ou plus reste possible', () => {
    const state = gameWith([{ monster: 'trebuchet-archers', owner: 1, at: at(9, 0) }, { monster: 'golem', owner: 2, at: at(9, 5) }], MANA);
    expect(canShoot(state, 'u1', 'u2')).toBe(true);
  });

  it('Siège ×2 : 10 dégâts à un terrain', () => {
    const state = gameWith([{ monster: 'trebuchet-archers', owner: 1, at: at(9, 0) }, { terrain: 'bastion', owner: 2, at: at(9, 4) }], MANA);
    const after = applyAction(state, shoot('u1', 'u2'));
    expect(after.units.u2).toBeUndefined();
  });

  it('un autre monstre de portée 1 reste libre de frapper au contact', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(9, 1) }, { monster: 'golem', owner: 2, at: at(9, 2) }], MANA);
    expect(canShoot(state, 'u1', 'u2')).toBe(true);
  });
});

describe('Camps de tir : +1 portée aux archers impériaux, sur sa case et son carré de 1', () => {
  it('terrain à 2 mana, 5 PV', () => {
    expect(getCardOf('camps-de-tir')).toMatchObject({ cost: 2, hp: 5, aura: { zone: 'cellAndSquare', archetype: 'archer', range: 1 } });
  });

  it('portée +1 sur la case du terrain et à 1 case, pas au-delà ; ni un autre monstre ni un archer adverse', () => {
    const state = gameWith(
      [
        { terrain: 'camps-de-tir', owner: 1, at: at(9, 2) },
        { monster: 'archer-imperial', owner: 1, at: at(9, 2) }, // sur le terrain
        { monster: 'archer-imperial', owner: 1, at: at(9, 3) }, // dans le carré de 1
        { monster: 'archer-imperial', owner: 1, at: at(9, 5) }, // dehors
        { monster: 'milicien', owner: 1, at: at(8, 2) },
        { monster: 'archer-imperial', owner: 2, at: at(8, 3) },
      ],
      MANA,
    );
    expect(getRange(state, monster(state, 'u2'))).toBe(5);
    expect(getRange(state, monster(state, 'u3'))).toBe(5);
    expect(getRange(state, monster(state, 'u4'))).toBe(4);
    expect(getRange(state, monster(state, 'u5'))).toBe(1);
    expect(getRange(state, monster(state, 'u6'))).toBe(4);
  });

  it('l’archer tire à 5 cases tant qu’il est à côté du terrain', () => {
    const state = gameWith(
      [
        { terrain: 'camps-de-tir', owner: 1, at: at(8, 0) },
        { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
        { monster: 'golem', owner: 2, at: at(9, 5) },
      ],
      MANA,
    );
    expect(canShoot(state, 'u2', 'u3')).toBe(true);
    const without = gameWith([{ monster: 'archer-imperial', owner: 1, at: at(9, 0) }, { monster: 'golem', owner: 2, at: at(9, 5) }], MANA);
    expect(canShoot(without, 'u1', 'u2')).toBe(false);
  });
});

function getCardOf(id: 'camps-de-tir') {
  return getTerrain(id);
}
