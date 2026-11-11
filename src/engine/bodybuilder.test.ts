import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { CARDS, DECKS, getCard } from './cards';
import { attackDamage, previewAttack } from './combat';
import { syncAuraHp } from './auras';
import { dealDamage } from './damage';
import { IllegalActionError } from './errors';
import { at, gameWith } from './test-utils';
import { requiemCountdown } from './statuses';
import { getAtk, removeUnit } from './units';
import type { Action, CardId, GameState, MonsterUnit, UnitId } from './types';

// Deck Bodybuilder (SPEC.md §6 bis, §10) : Rudy, Arnold, Tibo, Ki né, Seringue. Jeune Gomuscu et Jean Bon ne sont plus dans le
// deck : leurs données restent pour les mécaniques « Quand il détruit une unité » et Dopage.

const END_TURN: Action = { type: 'endTurn' };
const attack = (unitId: UnitId, targetId: UnitId, advance = false): Action => ({ type: 'attack', unitId, targetId, advance });
const monster = (state: GameState, id: UnitId) => state.units[id] as MonsterUnit;
const inject = (_state: GameState, unitId: UnitId): Action => ({
  type: 'playCard',
  cardId: 'seringue',
  target: { kind: 'unit', unitId },
});

describe('cartes du Bodybuilder (SPEC.md §6 bis)', () => {
  it('plus de deck depuis le 2026-11-10 : ses cartes gardent leurs données, dans aucun deck', () => {
    expect(DECKS.find((d) => d.id === 'bodybuilder')).toBeUndefined();
    const own: CardId[] = ['rudy', 'arnold', 'tibo', 'ki-ne', 'seringue', 'salle-de-sport'];
    for (const id of own) {
      expect(getCard(CARDS, id).name, id).toContain(' - Bodybuilder');
      for (const deck of DECKS) expect(deck.cards, `${deck.id} · ${id}`).not.toContain(id);
    }
  });
});

describe('Jeune Gomuscu (hors deck) : quand il détruit une unité, +1 ATK +1 PV', () => {
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

describe('Arnold : aura · bodybuilders alliés, rayon 2 · +1 ATK', () => {
  it('+1 ATK aux bodybuilders alliés dans un rayon de 2 (diagonales comprises), pas à lui-même, ni plus loin, ni aux autres monstres', () => {
    const state = gameWith([
      { monster: 'arnold', owner: 1, at: at(8, 2) },
      { monster: 'tibo', owner: 1, at: at(9, 3) }, // adjacent
      { monster: 'rudy', owner: 1, at: at(8, 4) }, // à 2 cases
      { monster: 'ki-ne', owner: 1, at: at(10, 4) }, // diagonale à 2 cases
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'ki-ne', owner: 1, at: at(1, 1) }, // loin
    ]);
    expect(getAtk(state, monster(state, 'u1'))).toBe(8);
    expect(getAtk(state, monster(state, 'u2'))).toBe(4);
    expect(getAtk(state, monster(state, 'u3'))).toBe(4);
    expect(getAtk(state, monster(state, 'u4'))).toBe(4);
    expect(getAtk(state, monster(state, 'u5'))).toBe(3);
    expect(getAtk(state, monster(state, 'u6'))).toBe(3);
  });

  it('une case trop loin (3 cases) n’est pas dans le rayon', () => {
    const state = gameWith([
      { monster: 'arnold', owner: 1, at: at(8, 1) },
      { monster: 'tibo', owner: 1, at: at(8, 4) },
    ]);
    expect(getAtk(state, monster(state, 'u2'))).toBe(3);
  });

  it('les auras se cumulent : deux Arnold donnent +2, et se donnent +1 l’un à l’autre', () => {
    const state = gameWith([
      { monster: 'arnold', owner: 1, at: at(8, 1) },
      { monster: 'arnold', owner: 1, at: at(8, 3) },
      { monster: 'tibo', owner: 1, at: at(8, 2) },
      { monster: 'golem', owner: 2, at: at(7, 2) },
    ]);
    expect(getAtk(state, monster(state, 'u3'))).toBe(5);
    expect(getAtk(state, monster(state, 'u1'))).toBe(9);
    expect(attackDamage(state, monster(state, 'u3'), state.units.u4!)).toBe(5);
    expect(monster(applyAction(state, attack('u3', 'u4')), 'u4').hp).toBe(2);
  });

  it('pas pour l’adversaire', () => {
    const state = gameWith([
      { monster: 'arnold', owner: 2, at: at(8, 2) },
      { monster: 'tibo', owner: 1, at: at(8, 1) },
    ]);
    expect(getAtk(state, monster(state, 'u2'))).toBe(3);
  });
});

describe('Salle de sport : aura · bodybuilders alliés sur sa case et adjacents · +1 ATK +1 PV', () => {
  const gym = () =>
    gameWith([
      { terrain: 'salle-de-sport', owner: 1, at: at(8, 3) },
      { monster: 'tibo', owner: 1, at: at(8, 3), hp: 8 }, // sur le terrain
      { monster: 'rudy', owner: 1, at: at(8, 4), hp: 3 }, // adjacent
      { monster: 'ki-ne', owner: 1, at: at(8, 6), hp: 3 }, // à 3 cases
      { monster: 'chevalier', owner: 1, at: at(8, 2) },
      { monster: 'tibo', owner: 2, at: at(9, 3), hp: 8 },
    ]);

  it('+1 ATK tout de suite, +1 PV et +1 PV max une fois l’action jouée, sur sa case comme à côté, pour ses bodybuilders seulement', () => {
    const state = gym();
    expect(getAtk(state, monster(state, 'u2'))).toBe(4);
    expect(getAtk(state, monster(state, 'u3'))).toBe(4);
    expect(getAtk(state, monster(state, 'u4'))).toBe(3);
    expect(getAtk(state, monster(state, 'u5'))).toBe(3);
    expect(getAtk(state, monster(state, 'u6'))).toBe(3);
    const after = applyAction(state, END_TURN);
    expect(monster(after, 'u2')).toMatchObject({ hp: 9, maxHp: 9 });
    expect(monster(after, 'u3')).toMatchObject({ hp: 4, maxHp: 4 });
    expect(monster(after, 'u4')).toMatchObject({ hp: 3, maxHp: 3 });
    expect(monster(after, 'u6')).toMatchObject({ hp: 8, maxHp: 8 });
  });

  it('le bonus de PV se perd en sortant de la zone, ou si le terrain est détruit, sans descendre sous 1 PV', () => {
    const state = applyAction(gym(), END_TURN);
    const gone = syncAuraHp(removeUnit(state, 'u1'));
    expect(monster(gone, 'u2')).toMatchObject({ hp: 8, maxHp: 8 });
    expect(monster(gone, 'u3')).toMatchObject({ hp: 3, maxHp: 3 });
    const hurt = syncAuraHp(removeUnit({ ...state, units: { ...state.units, u3: { ...monster(state, 'u3'), hp: 1 } } }, 'u1'));
    expect(monster(hurt, 'u3').hp).toBe(1);
  });

  it('se cumule avec l’aura d’Arnold', () => {
    const state = gameWith([
      { terrain: 'salle-de-sport', owner: 1, at: at(8, 3) },
      { monster: 'arnold', owner: 1, at: at(8, 5) },
      { monster: 'tibo', owner: 1, at: at(8, 4) },
    ]);
    expect(getAtk(state, monster(state, 'u3'))).toBe(5);
  });

  it('un terrain adverse ne donne rien', () => {
    const state = gameWith([
      { terrain: 'salle-de-sport', owner: 2, at: at(8, 3) },
      { monster: 'tibo', owner: 1, at: at(8, 4) },
    ]);
    expect(getAtk(state, monster(state, 'u2'))).toBe(3);
  });
});

describe('Rudy : aura · bodybuilders alliés, rayon 2 · +1 mobilité (au début de leur tour)', () => {
  const nextTurn = (units: Parameters<typeof gameWith>[0]) => applyAction(gameWith(units, { activePlayer: 2 }), END_TURN);

  it('+1 mobilité au début du tour des bodybuilders alliés à 2 cases ou moins, pas à lui-même ni aux autres', () => {
    const after = nextTurn([
      { monster: 'rudy', owner: 1, at: at(8, 2) },
      { monster: 'tibo', owner: 1, at: at(8, 4) }, // à 2 cases
      { monster: 'ki-ne', owner: 1, at: at(1, 1) }, // loin
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
    ]);
    expect(monster(after, 'u1').mobilityLeft).toBe(7);
    expect(monster(after, 'u2').mobilityLeft).toBe(4);
    expect(monster(after, 'u3').mobilityLeft).toBe(4);
    expect(monster(after, 'u4').mobilityLeft).toBe(3);
  });

  it('deux Rudy se cumulent : +2', () => {
    const after = nextTurn([
      { monster: 'rudy', owner: 1, at: at(8, 1) },
      { monster: 'rudy', owner: 1, at: at(8, 3) },
      { monster: 'tibo', owner: 1, at: at(8, 2) },
    ]);
    expect(monster(after, 'u3').mobilityLeft).toBe(5);
    expect(monster(after, 'u1').mobilityLeft).toBe(8);
  });
});

describe('Jean Bon (hors deck) : Dopage · lui-même · +2 ATK (pour ce tour) + burn 1 pendant 2 tours', () => {
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

describe('Ki né : début de tour · bodybuilders alliés, rayon 2 · soin 1', () => {
  it('au début de chacun de ses tours, après les revenus, dans un rayon de 2 ; sans dépasser les PV max ; pas lui-même ni les autres', () => {
    const state = gameWith(
      [
        { monster: 'ki-ne', owner: 1, at: at(8, 2), hp: 1 },
        { monster: 'arnold', owner: 1, at: at(9, 3), hp: 3 }, // adjacent
        { monster: 'tibo', owner: 1, at: at(8, 4), hp: 5 }, // à 2 cases
        { monster: 'rudy', owner: 1, at: at(8, 5), hp: 2 }, // à 3 cases
        { monster: 'chevalier', owner: 1, at: at(7, 2), hp: 2 },
        { monster: 'tibo', owner: 2, at: at(9, 1), hp: 1 },
      ],
      { activePlayer: 2 },
    );
    const after = applyAction(state, END_TURN);
    expect(after.activePlayer).toBe(1);
    expect(monster(after, 'u2').hp).toBe(4);
    expect(monster(after, 'u3').hp).toBe(6);
    expect(monster(after, 'u4').hp).toBe(2);
    expect(monster(after, 'u1').hp).toBe(1);
    expect(monster(after, 'u5').hp).toBe(2);
    expect(monster(after, 'u6').hp).toBe(1);
    expect(after.events.filter((e) => e.type === 'heal')).toEqual([
      { type: 'heal', unitId: 'u2', pos: at(9, 3), amount: 1 },
      { type: 'heal', unitId: 'u3', pos: at(8, 4), amount: 1 },
    ]);
  });

  it('les passifs passent avant les statuts (§4.2) : soigné puis brûlé, un bodybuilder à 1 PV survit', () => {
    const state = gameWith(
      [
        { monster: 'ki-ne', owner: 1, at: at(8, 2) },
        { monster: 'arnold', owner: 1, at: at(9, 2), hp: 1 },
      ],
      { activePlayer: 2 },
    );
    const burning = { ...state, units: { ...state.units, u2: { ...monster(state, 'u2'), statuses: [{ kind: 'burn' as const, amount: 1, turns: 1, expiresAtTurn: 9 }] } } };
    const after = applyAction(burning, END_TURN);
    expect(monster(after, 'u2').hp).toBe(1);
    const types = after.events.map((e) => e.type);
    expect(types.indexOf('heal')).toBeLessThan(types.lastIndexOf('damage'));
  });
});

describe('Tibo : Tortank · lui-même · carapace jusqu’à son prochain tour', () => {
  const tortank = (extra: Parameters<typeof gameWith>[0] = [], hp = 8) =>
    applyAction(
      gameWith([{ monster: 'tibo', owner: 1, at: at(8, 2), hp }, ...extra], { players: { 1: { mana: 3 } } }),
      { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } },
    );

  it('1 mana, sur lui-même : carapace jusqu’à son prochain tour', () => {
    const after = tortank();
    expect(after.players[1].mana).toBe(2);
    expect(monster(after, 'u1').statuses).toEqual([expect.objectContaining({ kind: 'carapace', turns: 0 })]);
  });

  // Carapace (§5 bis, nouveau sens du 2026-11-10) : ses PV ne descendent pas sous 1, quels que soient les dégâts.
  it('une attaque qui le détruirait le laisse à 1 PV, et la carapace reste ; une attaque moins forte passe entière', () => {
    const after = tortank([{ monster: 'arnold', owner: 2, at: at(8, 3) }], 4);
    const hit = applyAction(applyAction(after, END_TURN), attack('u2', 'u1'));
    expect(monster(hit, 'u1').hp).toBe(1);
    expect(monster(hit, 'u1').statuses).toEqual([expect.objectContaining({ kind: 'carapace' })]);
    expect(hit.events.find((e) => e.type === 'damage')).toMatchObject({ amount: 3, hp: 1, held: true });
    const scratch = applyAction(applyAction(tortank([{ monster: 'milicien', owner: 2, at: at(8, 3) }], 8), END_TURN), attack('u2', 'u1'));
    expect(monster(scratch, 'u1').hp).toBe(6);
  });

  it('l’aperçu de l’attaque annonce ce qui le laisse à 1 PV, et « attaquer et avancer » n’est plus proposé', () => {
    const after = applyAction(tortank([{ monster: 'arnold', owner: 2, at: at(8, 3) }], 2), END_TURN);
    const preview = previewAttack(after, monster(after, 'u2'), after.units.u1!);
    expect(preview).toMatchObject({ damage: 1, hpAfter: 1, destroys: false, canAdvance: false });
  });

  it('un sort, un effet ou le burn ne le font pas non plus descendre sous 1 PV', () => {
    const after = tortank([], 8);
    expect(monster(dealDamage(after, 'u1', 3, 2, 'spell'), 'u1').hp).toBe(5);
    expect(monster(dealDamage(after, 'u1', 20, 2, 'spell'), 'u1').hp).toBe(1);
    expect(monster(dealDamage(after, 'u1', 20, 2, 'burn'), 'u1')).toMatchObject({ hp: 1, statuses: [expect.objectContaining({ kind: 'carapace' })] });
  });

  it('elle tombe au début du prochain tour de Tibo, juste après le burn de ce début de tour (§10)', () => {
    const after = tortank([], 2);
    const burning = { ...after, units: { ...after.units, u1: { ...monster(after, 'u1'), statuses: [...monster(after, 'u1').statuses, { kind: 'burn' as const, amount: 5, turns: 1, expiresAtTurn: 9 }] } } };
    expect(monster(applyAction(burning, END_TURN), 'u1').statuses).toHaveLength(2);
    const back = applyAction(applyAction(burning, END_TURN), END_TURN);
    expect(monster(back, 'u1').hp).toBe(1);
    expect(monster(back, 'u1').statuses.map((s) => s.kind)).toEqual(['burn']);
  });

  it('la riposte qui le détruirait le laisse aussi à 1 PV', () => {
    const state = gameWith([
      { monster: 'tibo', owner: 1, at: at(8, 2), hp: 3 },
      { monster: 'gardien', owner: 2, at: at(8, 3), atk: 5 },
    ]);
    const shielded = { ...state, units: { ...state.units, u1: { ...monster(state, 'u1'), statuses: [{ kind: 'carapace' as const, turns: 0, expiresAtTurn: 9 }] } } };
    expect(previewAttack(shielded, monster(shielded, 'u1'), state.units.u2!).riposte).toBe(2);
    const next = applyAction(shielded, attack('u1', 'u2'));
    expect(monster(next, 'u2').hp).toBe(3);
    expect(monster(next, 'u1')).toMatchObject({ hp: 1, statuses: [expect.objectContaining({ kind: 'carapace' })] });
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
    expect(getAtk(after, monster(after, 'u1'))).toBe(11);
    expect(monster(applyAction(after, END_TURN), 'u1').atkBonus).toBe(0);
  });

  it('requiem 2 : il joue ce tour et son prochain tour, puis meurt au début du suivant, après les revenus, sans VP', () => {
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
    // Il tenait l'Écurie : les revenus passent avant les statuts (§4.2), elle rapporte encore son VP à ce tour.
    const types = next.events.map((e) => e.type);
    expect(next.events.filter((e) => e.type === 'vp')).toHaveLength(1);
    expect(types.indexOf('vp')).toBeLessThan(types.indexOf('requiem'));
  });
});
