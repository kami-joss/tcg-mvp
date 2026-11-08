import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions } from './actions';
import { CARDS } from './cards';
import { getAreaCells } from './effects';
import { DECKS } from './cards';
import { getAtk } from './units';
import { at, gameWith } from './test-utils';
import type { Action, CardId, Direction, GameState, MonsterUnit } from './types';

// Deck Dragons élémentaires (SPEC.md §6 bis, §10, refait le 2026-11-08) : Évolution draconique (3 mana, stun du dragon),
// zone « 3 cases en ligne et 2 diagonales devant », Tempête (recul de 2), Nid de dragons (effets à 1 mana), et les zones
// qui touchent aussi les ennemis invisibles.

const monster = (state: GameState, id: string) => state.units[id] as MonsterUnit;
const area = (unitId: string, direction?: Direction): Action => ({ type: 'activateEffect', unitId, target: { kind: 'area', ...(direction ? { direction } : {}) } });
const evolveInto = (cardId: CardId, unitId = 'u1'): Action => ({ type: 'activateEffect', unitId, target: { kind: 'card', cardId } });
const MANA = { players: { 1: { mana: 10 } } };

describe('cartes', () => {
  it('noms, stats et effets du texte de l’utilisateur', () => {
    expect(CARDS['jeune-dragon']).toMatchObject({ name: 'Jeune dragon - Dragons élémentaires', cost: 2, atk: 3, hp: 2, mobility: 4, range: 1 });
    expect(CARDS['jeune-dragon']).toMatchObject({ activated: [{ name: 'Évolution draconique', manaCost: 3, effects: [{ type: 'evolve', status: { kind: 'stun', turns: 0 } }] }] });
    expect(CARDS['dragon-feu']).toMatchObject({ name: 'Ignis - Dragons élémentaires', cost: 7, atk: 5, hp: 5, mobility: 5, range: 3, keywords: [{ keyword: 'vol' }] });
    expect(CARDS['dragon-eau']).toMatchObject({ name: 'Aqua - Dragons élémentaires', atk: 4, hp: 9, mobility: 4, range: 1 });
    expect(CARDS['dragon-vent']).toMatchObject({ name: 'Ventus - Dragons élémentaires', atk: 4, hp: 4, mobility: 9, range: 1 });
    expect(CARDS['dragon-terre']).toMatchObject({ name: 'Terra - Dragons élémentaires', atk: 9, hp: 4, mobility: 4, range: 1 });
    expect(CARDS['nid-de-dragons']).toMatchObject({ kind: 'terrain', cost: 3, hp: 5, aura: { zone: 'cellAndSquare', archetype: 'dragon', effectCost: 1 } });
  });
});

describe('zone : 3 cases en ligne et les 2 diagonales devant, direction au choix', () => {
  it('5 cases : la ligne de 3 et les 2 coins devant ; la source se tourne', () => {
    const state = gameWith([{ monster: 'dragon-feu', owner: 1, at: at(9, 4) }]);
    const cells = getAreaCells(state, { ...monster(state, 'u1'), facing: 'right' }, 'line3Diagonals').map((p) => `${p.row},${p.col}`);
    expect(cells.sort()).toEqual(['10,5', '8,5', '9,5', '9,6', '9,7']);
  });

  it('Lance-flamme : 2 dégâts et burn 2 pendant 1 tour aux ennemis de la zone, pas aux alliés ni hors zone', () => {
    let state = gameWith(
      [
        { monster: 'dragon-feu', owner: 1, at: at(9, 4) },
        { monster: 'golem', owner: 2, at: at(9, 6) }, // en ligne
        { monster: 'golem', owner: 2, at: at(8, 5) }, // diagonale devant
        { monster: 'milicien', owner: 1, at: at(9, 5) }, // allié en ligne : épargné, ne coupe pas la zone
        { monster: 'golem', owner: 2, at: at(9, 8) }, // hors zone
      ],
      MANA,
    );
    state = applyAction(state, area('u1', 'right'));
    expect(monster(state, 'u1').facing).toBe('right');
    expect(state.units.u2?.hp).toBe(5);
    expect(state.units.u3?.hp).toBe(5);
    expect(monster(state, 'u2').statuses).toMatchObject([{ kind: 'burn', amount: 2, turns: 1 }]);
    expect(state.units.u4?.hp).toBe(3);
    expect(state.units.u5?.hp).toBe(7);
    expect(state.players[1].mana).toBe(7);
  });

  it('les ennemis invisibles de la zone sont touchés aussi : être caché ne protège de rien', () => {
    let state = gameWith(
      [
        { monster: 'dragon-feu', owner: 1, at: at(9, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2) }, // visible, diagonale devant (direction : haut)
        { monster: 'farceur', owner: 2, at: at(6, 1) }, // camouflé, à 3 cases : invisible pour J1
      ],
      MANA,
    );
    state = applyAction(state, area('u1', 'up'));
    expect(state.units.u3).toBeUndefined(); // Farceur 1 PV : détruit
    expect(state.units.u2?.hp).toBe(5);
  });

  it('Tempête : 2 dégâts puis recul de 2 cases, loin du dragon dans la direction choisie', () => {
    let state = gameWith(
      [
        { monster: 'dragon-vent', owner: 1, at: at(9, 1) },
        { monster: 'golem', owner: 2, at: at(8, 1) },
      ],
      MANA,
    );
    state = applyAction(state, area('u1', 'up'));
    expect(monster(state, 'u2')).toMatchObject({ hp: 5, pos: at(6, 1) });
  });

  it('Tsunami : slow 2 pendant 1 tour', () => {
    let state = gameWith([{ monster: 'dragon-eau', owner: 1, at: at(9, 1) }, { monster: 'golem', owner: 2, at: at(8, 1) }], MANA);
    state = applyAction(state, area('u1', 'up'));
    expect(monster(state, 'u2').statuses).toMatchObject([{ kind: 'slow', amount: 2, turns: 1 }]);
  });
});

describe('Évolution draconique', () => {
  const young = (extra: Parameters<typeof gameWith>[0] = [], mana = 3) =>
    gameWith([{ monster: 'jeune-dragon', owner: 1, at: at(8, 4) }, ...extra], {
      turn: 3,
      players: { 1: { mana, grimoire: ['dragon-feu', 'dragon-terre', 'dragon-origine'] } },
    });

  it('3 mana : le dragon arrive à sa place sans payer son coût, stun jusqu’à son prochain tour ; jamais Origine', () => {
    const choices = getLegalActions(young()).flatMap((a) => (a.type === 'activateEffect' && a.target.kind === 'card' ? [a.target.cardId] : []));
    expect(choices).toEqual(['dragon-feu', 'dragon-terre']);
    const after = applyAction(young(), evolveInto('dragon-feu'));
    expect(after.players[1].mana).toBe(0);
    expect(monster(after, 'u2')).toMatchObject({ cardId: 'dragon-feu', pos: at(8, 4) });
    expect(monster(after, 'u2').statuses).toMatchObject([{ kind: 'stun', turns: 0 }]);
    const next = applyAction(applyAction(after, { type: 'endTurn' }), { type: 'endTurn' });
    expect(monster(next, 'u2').statuses).toEqual([]);
  });

  it('pas assez de mana sans Nid (2 < 3) ; dans un Nid de dragons, elle coûte 1 mana', () => {
    expect(getLegalActions(young([], 2)).some((a) => a.type === 'activateEffect')).toBe(false);
    const nest = young([{ terrain: 'nid-de-dragons', owner: 1, at: at(8, 4) }], 1);
    const after = applyAction(nest, evolveInto('dragon-terre'));
    expect(after.players[1].mana).toBe(0);
  });
});

describe('Nid de dragons : les effets de ses dragons élémentaires coûtent 1 mana dans sa zone', () => {
  it('sur sa case et dans son carré de 1, 1 mana ; ailleurs, 3 ; pas pour un dragon adverse', () => {
    const scene = (dragonAt: ReturnType<typeof at>) =>
      gameWith(
        [
          { terrain: 'nid-de-dragons', owner: 1, at: at(8, 4) },
          { monster: 'dragon-terre', owner: 1, at: dragonAt },
          { monster: 'golem', owner: 2, at: at(9, 2) },
        ],
        MANA,
      );
    expect(applyAction(scene(at(9, 3)), area('u2')).players[1].mana).toBe(9);
    expect(applyAction(scene(at(9, 1)), area('u2')).players[1].mana).toBe(7);
  });
});

describe('Hurlements : ATK −1 pendant 1 tour aux ennemis du carré de 5 d’un dragon élémentaire allié', () => {
  const HOWL = (unitId: string): Action => ({ type: 'playCard', cardId: 'hurlements', target: { kind: 'unit', unitId } });
  const withHowl = (units: Parameters<typeof gameWith>[0]) =>
    gameWith(units, { players: { 1: { mana: 10, grimoire: ['hurlements', 'hurlements'] } } });

  it('1 mana ; un dragon élémentaire allié au choix (Jeune dragon compris), jamais un autre allié', () => {
    expect(CARDS.hurlements).toMatchObject({ kind: 'spell', name: 'Hurlements - Dragons élémentaires', cost: 1 });
    const state = withHowl([
      { monster: 'jeune-dragon', owner: 1, at: at(9, 1) },
      { monster: 'milicien', owner: 1, at: at(9, 3) },
      { monster: 'dragon-terre', owner: 2, at: at(1, 1) },
    ]);
    const targets = getLegalActions(state).filter((a) => a.type === 'playCard' && a.cardId === 'hurlements');
    expect(targets).toEqual([HOWL('u1')]); // jouable même sans ennemi dans la zone (validé le 2026-11-08)
  });

  it('les ennemis à 5 cases au plus (diagonales comprises), invisibles compris ; ni les alliés ni ceux plus loin', () => {
    let state = withHowl([
      { monster: 'dragon-terre', owner: 1, at: at(9, 4) },
      { monster: 'golem', owner: 2, at: at(4, 8) }, // 5 rangées plus haut : dans le carré de 5
      { monster: 'farceur', owner: 2, at: at(9, 8) }, // camouflé, invisible pour J1 : touché aussi
      { monster: 'golem', owner: 2, at: at(3, 4) }, // 6 cases : hors du carré
      { monster: 'milicien', owner: 1, at: at(9, 5) },
    ]);
    state = applyAction(state, HOWL('u1'));
    expect(state.players[1].mana).toBe(9);
    expect(monster(state, 'u2').statuses).toMatchObject([{ kind: 'stat', stat: 'atk', amount: -1, turns: 1 }]);
    expect(getAtk(state, monster(state, 'u2'))).toBe(CARDS.golem.kind === 'monster' ? CARDS.golem.atk - 1 : NaN);
    expect(monster(state, 'u3').statuses.some((s) => s.kind === 'stat')).toBe(true);
    expect(monster(state, 'u4').statuses).toEqual([]);
    expect(monster(state, 'u5').statuses).toEqual([]);
    expect(monster(state, 'u1').statuses).toEqual([]);
  });

  it('deux Hurlements se cumulent : ATK −2 (§5 bis)', () => {
    let state = withHowl([
      { monster: 'dragon-terre', owner: 1, at: at(9, 4) },
      { monster: 'golem', owner: 2, at: at(8, 4) },
    ]);
    state = applyAction(applyAction(state, HOWL('u1')), HOWL('u1'));
    expect(getAtk(state, monster(state, 'u2'))).toBe(CARDS.golem.kind === 'monster' ? CARDS.golem.atk - 2 : NaN);
  });
});

describe('composition (donnée le 2026-11-08)', () => {
  it('monstres ×3, Hurlements ×3, Nid de dragons ×3, Autel de mana ×3, Invocateur ×1 : 25 cartes, sans Origine', () => {
    const cards = DECKS.find((d) => d.id === 'dragons')!.cards;
    const count = (id: CardId) => cards.filter((c) => c === id).length;
    expect(cards).toHaveLength(25);
    for (const id of ['jeune-dragon', 'dragon-feu', 'dragon-eau', 'dragon-vent', 'dragon-terre', 'hurlements', 'nid-de-dragons', 'autel-de-mana'] as const) {
      expect(count(id), id).toBe(3);
    }
    expect(count('invocateur')).toBe(1);
    expect(count('dragon-origine')).toBe(0);
  });
});
