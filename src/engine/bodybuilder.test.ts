import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { COMMON_CARDS, DECKS, TEST_GRIMOIRE } from './cards';
import { attackDamage } from './combat';
import { IllegalActionError } from './errors';
import { at, gameWith } from './test-utils';
import { requiemCountdown } from './statuses';
import { getAtk } from './units';
import type { Action, CardId, GameState, MonsterUnit, UnitId } from './types';

// Deck Bodybuilder (SPEC.md §6 bis, §10) : Jeune Gomuscu, Jean Bon, Arnold, Ki né, Seringue.

const END_TURN: Action = { type: 'endTurn' };
const attack = (unitId: UnitId, targetId: UnitId, advance = false): Action => ({ type: 'attack', unitId, targetId, advance });
const monster = (state: GameState, id: UnitId) => state.units[id] as MonsterUnit;
const inject = (_state: GameState, unitId: UnitId): Action => ({
  type: 'playCard',
  cardId: 'seringue',
  target: { kind: 'unit', unitId },
});

describe('deck Bodybuilder (SPEC.md §6 bis)', () => {
  it('25 cartes : ses 4 monstres ×3 et Seringue ×2, complétés par le grimoire de test et les cartes communes', () => {
    const deck = DECKS.find((d) => d.id === 'bodybuilder')!;
    const own: CardId[] = ['jeune-gomuscu', 'jean-bon', 'arnold', 'ki-ne', 'seringue'];
    expect(deck.name).toBe('Bodybuilder');
    expect(deck.cards).toHaveLength(25);
    for (const id of own) expect(deck.cards.filter((c) => c === id), id).toHaveLength(id === 'seringue' ? 2 : 3);
    for (const id of deck.cards.filter((c) => !own.includes(c) && !COMMON_CARDS.includes(c))) expect(TEST_GRIMOIRE).toContain(id);
  });
});

describe('Jeune Gomuscu : quand il détruit une unité, +1 ATK +1 PV', () => {
  it('en détruisant un monstre, définitivement (PV max compris), avant l’avancée', () => {
    const state = gameWith([
      { monster: 'jeune-gomuscu', owner: 1, at: at(8, 1), hp: 1 },
      { monster: 'eclaireur', owner: 2, at: at(8, 2) },
    ]);
    const after = applyAction(state, attack('u1', 'u2', true));
    expect(monster(after, 'u1')).toMatchObject({ pos: at(8, 2), atk: 3, hp: 2, maxHp: 3 });
  });

  it('en détruisant un terrain aussi ; rien si la cible survit', () => {
    const altar = gameWith([
      { monster: 'jeune-gomuscu', owner: 1, at: at(1, 4) },
      { terrain: 'autel-de-mana', owner: 2, at: at(2, 4) },
    ]);
    expect(monster(applyAction(altar, attack('u1', 'u2')), 'u1')).toMatchObject({ atk: 3, hp: 3, maxHp: 3 });
    const golem = gameWith([
      { monster: 'jeune-gomuscu', owner: 1, at: at(1, 3) },
      { monster: 'golem', owner: 2, at: at(1, 2) },
    ]);
    expect(monster(applyAction(golem, attack('u1', 'u2')), 'u1')).toMatchObject({ atk: 2, maxHp: 2 });
  });
});

describe('Arnold : aura · bodybuilders alliés adjacents · +2 ATK', () => {
  it('+2 ATK aux bodybuilders alliés autour de lui (diagonales comprises), pas à lui-même ni aux autres monstres', () => {
    const state = gameWith([
      { monster: 'arnold', owner: 1, at: at(8, 2) },
      { monster: 'jean-bon', owner: 1, at: at(9, 3) },
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'ki-ne', owner: 1, at: at(1, 1) },
    ]);
    expect(getAtk(state, monster(state, 'u1'))).toBe(7);
    expect(getAtk(state, monster(state, 'u2'))).toBe(7);
    expect(getAtk(state, monster(state, 'u3'))).toBe(3);
    expect(getAtk(state, monster(state, 'u4'))).toBe(2);
  });

  it('les auras se cumulent : deux Arnold donnent +4, et se donnent +2 l’un à l’autre', () => {
    const state = gameWith([
      { monster: 'arnold', owner: 1, at: at(8, 1) },
      { monster: 'arnold', owner: 1, at: at(8, 3) },
      { monster: 'jeune-gomuscu', owner: 1, at: at(8, 2) },
      { monster: 'golem', owner: 2, at: at(7, 2) },
    ]);
    expect(getAtk(state, monster(state, 'u3'))).toBe(6);
    expect(getAtk(state, monster(state, 'u1'))).toBe(7);
    expect(attackDamage(state, monster(state, 'u3'), state.units.u4!)).toBe(6);
    expect(monster(applyAction(state, attack('u3', 'u4')), 'u4').hp).toBe(1);
  });

  it('pas pour l’adversaire', () => {
    const state = gameWith([
      { monster: 'arnold', owner: 2, at: at(8, 2) },
      { monster: 'jeune-gomuscu', owner: 1, at: at(8, 1) },
    ]);
    expect(getAtk(state, monster(state, 'u2'))).toBe(2);
  });
});

describe('Jean Bon : Dopage · lui-même · +2 ATK (pour ce tour) + burn 1 pendant 2 tours', () => {
  const doped = () => {
    const state = gameWith(
      [
        { monster: 'jean-bon', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2), hp: 9 },
      ],
      { players: { 1: { mana: 2 } } },
    );
    return applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } });
  };

  it('+2 ATK pour ce tour : son attaque fait 7 dégâts', () => {
    const after = doped();
    expect(monster(after, 'u1')).toMatchObject({ atk: 5, atkBonus: 2 });
    expect(after.players[1].mana).toBe(0);
    expect(monster(applyAction(after, attack('u1', 'u2')), 'u2').hp).toBe(2);
  });

  it('le bonus s’arrête à la fin du tour ; Jean Bon perd 1 PV au début de ses 2 prochains tours', () => {
    let next = applyAction(doped(), END_TURN);
    expect(monster(next, 'u1')).toMatchObject({ atkBonus: 0, hp: 3 });
    next = applyAction(next, END_TURN);
    expect(monster(next, 'u1').hp).toBe(2);
    next = applyAction(applyAction(next, END_TURN), END_TURN);
    expect(monster(next, 'u1').hp).toBe(1);
    next = applyAction(applyAction(next, END_TURN), END_TURN);
    expect(monster(next, 'u1').hp).toBe(1);
  });
});

describe('Ki né : début de tour · bodybuilders alliés adjacents · soin 1', () => {
  it('au début de chacun de ses tours, après le burn ; sans dépasser les PV max ; pas lui-même ni les autres', () => {
    const state = gameWith(
      [
        { monster: 'ki-ne', owner: 1, at: at(8, 2), hp: 1 },
        { monster: 'arnold', owner: 1, at: at(9, 3), hp: 3 },
        { monster: 'jean-bon', owner: 1, at: at(8, 1), hp: 3 },
        { monster: 'chevalier', owner: 1, at: at(7, 2), hp: 2 },
        { monster: 'jeune-gomuscu', owner: 2, at: at(9, 1), hp: 1 },
      ],
      { activePlayer: 2 },
    );
    const after = applyAction(state, END_TURN);
    expect(after.activePlayer).toBe(1);
    expect(monster(after, 'u2').hp).toBe(4);
    expect(monster(after, 'u3').hp).toBe(3);
    expect(monster(after, 'u1').hp).toBe(1);
    expect(monster(after, 'u4').hp).toBe(2);
    expect(monster(after, 'u5').hp).toBe(1);
    expect(after.events.filter((e) => e.type === 'heal')).toEqual([{ type: 'heal', unitId: 'u2', pos: at(9, 3), amount: 1 }]);
  });
});

describe('Seringue : un allié bodybuilder · ATK ×2 (pour ce tour) + requiem 2', () => {
  const syringe = (units: Parameters<typeof gameWith>[0]) =>
    gameWith(units, { players: { 1: { mana: 5, grimoire: ['seringue', 'seringue'] } } });

  it('seulement sur un de ses bodybuilders', () => {
    const state = syringe([
      { monster: 'jean-bon', owner: 1, at: at(8, 1) },
      { monster: 'chevalier', owner: 1, at: at(8, 3) },
      { monster: 'arnold', owner: 2, at: at(2, 2) },
    ]);
    const targets = getLegalActions(state).flatMap((a) =>
      a.type === 'playCard' && a.cardId === 'seringue' && a.target.kind === 'unit' ? [a.target.unitId] : [],
    );
    expect(targets).toEqual(['u1']);
    expect(() => applyAction(state, inject(state, 'u2'))).toThrow(IllegalActionError);
  });

  it('ATK ×2 pour ce tour (bonus du tour compris) ; une aura d’Arnold s’ajoute sans être doublée', () => {
    const state = syringe([
      { monster: 'jean-bon', owner: 1, at: at(8, 1) },
      { monster: 'arnold', owner: 1, at: at(8, 2) },
    ]);
    const after = applyAction(state, inject(state, 'u1'));
    expect(monster(after, 'u1')).toMatchObject({ atk: 5, atkBonus: 5 });
    expect(getAtk(after, monster(after, 'u1'))).toBe(12);
    expect(monster(applyAction(after, END_TURN), 'u1').atkBonus).toBe(0);
  });

  it('requiem 2 : il joue ce tour et son prochain tour, puis meurt au début du suivant, avant les revenus, sans VP', () => {
    const state = syringe([
      { monster: 'jean-bon', owner: 1, at: at(2, 4) },
      { monster: 'eclaireur', owner: 2, at: at(9, 1) },
    ]);
    let next = applyAction(state, inject(state, 'u1'));
    const countdown = (s: GameState) => requiemCountdown(s.units.u1!, s.turn, s.activePlayer);
    expect(countdown(next)).toBe(2);
    expect(countdown(applyAction(next, END_TURN))).toBe(2);
    next = applyAction(applyAction(next, END_TURN), END_TURN);
    expect(next.turn).toBe(3);
    expect(next.units.u1).toBeDefined();
    expect(countdown(next)).toBe(1);
    next = applyAction(applyAction(next, END_TURN), END_TURN);
    expect(next.turn).toBe(5);
    expect(next.units.u1).toBeUndefined();
    expect(next.events).toContainEqual({ type: 'requiem', unitId: 'u1', pos: at(2, 4) });
    expect(next.players[2].vp).toBe(0);
    // Il tenait l'Écurie : mort avant les revenus, elle ne rapporte plus rien à ce tour.
    expect(next.events.filter((e) => e.type === 'vp')).toEqual([]);
  });
});
