import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { attackAvailability, cardAvailability, effectAvailability } from './availability';
import { createGame } from './game';
import { getFreeSummonCells } from './summon';
import { at, gameWith, withStatus } from './test-utils';
import type { UnitSpec } from './test-utils';
import type { Action, CardId, GameState, MonsterUnit, PlayerState } from './types';
import { getPlayerView } from './view';

// Ce qui rend une carte, une attaque ou un effet indisponible, avec la raison (handoff V8, lot 9 : fiche de carte).

const END_TURN: Action = { type: 'endTurn' };
const view = (state: GameState) => getPlayerView(state, 1);
const me = (player: Partial<PlayerState>) => ({ players: { 1: player } });

describe('carte du grimoire', () => {
  const hand = (grimoire: CardId[], mana = 10, extra: Partial<PlayerState> = {}) => me({ grimoire, mana, ...extra });

  it('jouable : il a la carte, le mana et une cible', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], hand(['charge', 'golem']));
    expect(cardAvailability(view(state), 'charge')).toEqual({ ok: true });
    expect(cardAvailability(view(state), 'golem')).toEqual({ ok: true });
  });

  it('mana insuffisant : combien il en manque', () => {
    const state = gameWith([], hand(['golem'], 1));
    expect(cardAvailability(view(state), 'golem')).toEqual({ ok: false, reason: { kind: 'mana', missing: 3 } });
  });

  it('plus d’exemplaire, ou pas son tour', () => {
    const state = gameWith([], hand(['golem']));
    expect(cardAvailability(view(state), 'milicien')).toEqual({ ok: false, reason: { kind: 'noCopy' } });
    expect(cardAvailability(getPlayerView(state, 2), 'golem')).toEqual({ ok: false, reason: { kind: 'notYourTurn' } });
  });

  it('un sort déjà lancé ce tour, même s’il en reste un exemplaire', () => {
    const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], hand(['charge', 'charge']));
    const after = applyAction(state, { type: 'playCard', cardId: 'charge', target: { kind: 'unit', unitId: 'u1' } });
    expect(cardAvailability(view(after), 'charge')).toEqual({ ok: false, reason: { kind: 'alreadyUsed' } });
  });

  it('aucune cible : sort sans monstre, monstre sans case libre dans la zone d’invocation', () => {
    expect(cardAvailability(view(gameWith([], hand(['charge']))), 'charge')).toEqual({
      ok: false,
      reason: { kind: 'noTarget', target: 'monster' },
    });
    const full: UnitSpec[] = getFreeSummonCells(createGame(), 1).map((pos) => ({ monster: 'eclaireur', owner: 1, at: pos }));
    expect(cardAvailability(view(gameWith(full, hand(['golem']))), 'golem')).toEqual({
      ok: false,
      reason: { kind: 'noTarget', target: 'summonZone' },
    });
  });
});

describe('attaque d’un monstre', () => {
  const duel = (attacker: Partial<MonsterUnit> = {}) =>
    gameWith([
      { monster: 'milicien', owner: 1, at: at(5, 4), ...attacker },
      { monster: 'golem', owner: 2, at: at(5, 5) },
    ]);

  it('possible au contact d’un ennemi ; sinon, aucune cible', () => {
    expect(attackAvailability(view(duel()), 'u1')).toEqual({ ok: true });
    const alone = gameWith([{ monster: 'milicien', owner: 1, at: at(5, 4) }]);
    expect(attackAvailability(view(alone), 'u1')).toEqual({ ok: false, reason: { kind: 'noTarget', target: 'monster' } });
  });

  it('déjà attaqué, stun, monstre adverse', () => {
    expect(attackAvailability(view(duel({ hasAttacked: true })), 'u1')).toEqual({ ok: false, reason: { kind: 'alreadyUsed' } });
    expect(attackAvailability(view(withStatus(duel(), 'u1', 'stun')), 'u1')).toEqual({ ok: false, reason: { kind: 'stunned' } });
    expect(attackAvailability(view(duel()), 'u2')).toEqual({ ok: false, reason: { kind: 'notYourTurn' } });
  });
});

describe('effet actif d’un monstre', () => {
  it('aucun pour un monstre sans effet actif', () => {
    expect(effectAvailability(view(gameWith([{ monster: 'golem', owner: 1, at: at(5, 4) }])), 'u1')).toBeNull();
  });

  it('utilisable ; puis déjà utilisé ce tour', () => {
    const state = gameWith([{ monster: 'invocateur', owner: 1, at: at(5, 4) }], me({ mana: 5 }));
    expect(effectAvailability(view(state), 'u1')).toEqual({ ok: true });
    const used = { ...state, units: { ...state.units, u1: { ...(state.units.u1 as MonsterUnit), usedEffects: [0] } } };
    expect(effectAvailability(view(used), 'u1')).toEqual({ ok: false, reason: { kind: 'alreadyUsed' } });
  });

  it('mana insuffisant pour son coût', () => {
    const state = gameWith([{ monster: 'invocateur', owner: 1, at: at(5, 4) }], me({ mana: 0 }));
    expect(effectAvailability(view(state), 'u1')).toEqual({ ok: false, reason: { kind: 'mana', missing: 1 } });
  });

  it('aucune case libre autour pour invoquer', () => {
    const state = gameWith(
      [
        { monster: 'invocateur', owner: 1, at: at(5, 4) },
        ...[at(4, 3), at(4, 4), at(4, 5), at(5, 3), at(5, 5), at(6, 3), at(6, 4), at(6, 5)].map(
          (pos): UnitSpec => ({ monster: 'eclaireur', owner: 1, at: pos }),
        ),
      ],
      me({ mana: 5, grimoire: ['eclaireur'] }),
    );
    expect(effectAvailability(view(state), 'u1')).toEqual({ ok: false, reason: { kind: 'noTarget', target: 'cell' } });
  });

  it('aucun monstre qu’il peut payer à invoquer', () => {
    const state = gameWith([{ monster: 'invocateur', owner: 1, at: at(5, 4) }], me({ mana: 2, grimoire: ['golem'] }));
    expect(effectAvailability(view(state), 'u1')).toEqual({ ok: false, reason: { kind: 'noTarget', target: 'summonCard' } });
  });

  it('aucun ennemi à portée de l’effet', () => {
    const state = gameWith([{ monster: 'mage', owner: 1, at: at(5, 4) }], me({ mana: 5 }));
    expect(effectAvailability(view(state), 'u1')).toEqual({ ok: false, reason: { kind: 'noTarget', target: 'monster' } });
  });

  it('évolution : pas le tour où il arrive, ni sans carte d’évolution dans le grimoire', () => {
    const state = gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(5, 4) }], { ...me({ mana: 5, grimoire: ['dragon-feu'] }), turn: 3 });
    const fresh = { ...state, units: { ...state.units, u1: { ...(state.units.u1 as MonsterUnit), summonedOnTurn: 3 } } };
    expect(effectAvailability(view(fresh), 'u1')).toEqual({ ok: false, reason: { kind: 'justSummoned' } });
    expect(effectAvailability(view(state), 'u1')).toEqual({ ok: true });
    const none = { ...state, players: { ...state.players, 1: { ...state.players[1], grimoire: [] } } };
    expect(effectAvailability(view(none), 'u1')).toEqual({ ok: false, reason: { kind: 'noTarget', target: 'evolution' } });
  });

  it('stun : rien', () => {
    const state = withStatus(gameWith([{ monster: 'invocateur', owner: 1, at: at(5, 4) }], me({ mana: 5 })), 'u1', 'stun');
    expect(effectAvailability(view(state), 'u1')).toEqual({ ok: false, reason: { kind: 'stunned' } });
  });
});

describe('mobilité retirée (froze) et ajoutée (boost) pour le tour', () => {
  it('un slow reçu pendant son tour retire des pas tout de suite ; recalculé à son tour suivant', () => {
    let state = withStatus(gameWith([{ monster: 'golem', owner: 1, at: at(8, 1) }]), 'u1', 'slow', 1, 1);
    expect(state.units.u1).toMatchObject({ mobilityLeft: 1, froze: 1, boost: 0 });
    state = applyAction(applyAction(state, END_TURN), END_TURN); // son tour suivant : toujours ralenti
    expect(state.units.u1).toMatchObject({ mobilityLeft: 1, froze: 1 });
    state = applyAction(applyAction(state, END_TURN), END_TURN); // le slow est fini
    expect(state.units.u1).toMatchObject({ mobilityLeft: 2, froze: 0 });
  });

  it('un slow reçu hors de son tour compte au début de son tour', () => {
    let state = withStatus(gameWith([{ monster: 'golem', owner: 2, at: at(8, 1) }]), 'u1', 'slow', 1);
    expect(state.units.u1).toMatchObject({ froze: 0 });
    state = applyAction(state, END_TURN);
    expect(state.units.u1).toMatchObject({ mobilityLeft: 1, froze: 1 });
  });

  it('Charge : +2 pas ce tour-ci, remis à 0 à son tour suivant', () => {
    let state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], me({ mana: 10, grimoire: ['charge'] }));
    state = applyAction(state, { type: 'playCard', cardId: 'charge', target: { kind: 'unit', unitId: 'u1' } });
    expect(state.units.u1).toMatchObject({ mobilityLeft: 4, boost: 2 });
    state = applyAction(applyAction(state, END_TURN), END_TURN);
    expect(state.units.u1).toMatchObject({ mobilityLeft: 2, boost: 0 });
  });
});
