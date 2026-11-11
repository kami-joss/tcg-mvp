import { describe, expect, it } from 'vitest';
import { CARDS, applyAction, cardAvailability, getCard, getPlayerView } from '../engine';
import type { Action, CardId, GameState } from '../engine';
import { at, gameWith, withStatus } from '../engine/test-utils';
import { getBubble } from './bubble';
import { cardEffectLine } from './cardText';
import { applyEvent } from './fx/patch';
import { clickCard, clickCell, getCardTeleportCells, getHighlights, getReviveChoices, posKey } from './interaction';
import type { Selection } from './interaction';
import { describeAction } from './log';
import { abilityRules, plainRules, rulesSegments } from './rulesText';
import { reasonStatus } from './sheet';

// Sorts génériques du 2026-11-10 dans l'interface (SPEC.md §6 ter, §10) : textes pour les joueurs, choix en deux temps
// (l'allié puis la case ; la case puis le monstre du cimetière), Élixir de mana lancé depuis sa bulle, raisons, journal.

const view = (state: GameState) => getPlayerView(state, state.activePlayer);
const hand = (cards: CardId[], extra: Record<string, unknown> = {}) => ({ players: { 1: { mana: 10, grimoire: cards, ...extra } } });
const selectionOf = (result: ReturnType<typeof clickCell>): Selection => {
  if (!('selection' in result)) throw new Error('sélection attendue');
  return result.selection;
};
const rules = (id: CardId) => {
  const card = getCard(CARDS, id);
  if (card.kind !== 'spell') throw new Error(`${id} n'est pas un sort`);
  return abilityRules(CARDS, card.ability);
};
const logOf = (state: GameState, action: Action) => describeAction(view(state), action, view(applyAction(state, action)));

describe('textes des sorts génériques, avec les mots du lexique', () => {
  it('en phrases naturelles', () => {
    expect(plainRules(rules('puissance'))).toBe('Donne +2 ATK à un allié ce tour.');
    expect(plainRules(rules('soin'))).toBe('Rend 5 PV à un allié.');
    expect(plainRules(rules('fatigue'))).toBe('Inflige slow 2 pendant 1 tour à un ennemi.');
    expect(plainRules(rules('carapace'))).toBe('Donne carapace jusqu’à son prochain tour à un allié.');
    expect(plainRules(rules('fortification'))).toBe('Donne carapace jusqu’à ton prochain tour à un de tes terrains.');
    expect(plainRules(rules('elixir-de-mana'))).toBe('Tu gagnes 1 mana.');
    expect(plainRules(rules('repli'))).toBe('Téléporte un allié sur une de tes cases d’invocation libres.');
    expect(plainRules(rules('teleportation'))).toBe('Téléporte un allié sur un de tes terrains où aucun monstre ne se trouve.');
    expect(plainRules(rules('boule-de-feu'))).toBe('Inflige 1 dégât à un ennemi dans un carré de 3 d’une de tes unités.');
  });

  it('Flash ne dit pas « carré » : rien entre les deux ne compte, ni case X ni falaise', () => {
    expect(plainRules(rules('flash'))).toBe(
      'Téléporte un allié sur une case libre à 2 cases au plus de lui, diagonales comprises, même de l’autre côté d’une case X ou d’une falaise.',
    );
    expect(rulesSegments(rules('flash')).flatMap((s) => (s.term ? [s.term] : []))).toEqual(['teleporter']);
  });

  it('Cure « retire » les malus (un soin rend des PV) ; Réanimation invoque depuis le cimetière', () => {
    expect(rulesSegments(rules('cure')).flatMap((s) => (s.term ? [s.term] : []))).toEqual(['malus']);
    expect(plainRules(rules('reanimation'))).toBe(
      'Invoque un monstre de ton cimetière sur une de tes cases d’invocation libres, sans payer son coût. Il revient avec tous ses PV et peut agir aussitôt.',
    );
    expect(rulesSegments(rules('reanimation')).flatMap((s) => (s.term ? [s.term] : []))).toEqual(['invoquer', 'cimetiere', 'caseInvocation']);
  });

  it('notation du lexique (tableau §6 ter de SPEC.md)', () => {
    expect(cardEffectLine(CARDS, getCard(CARDS, 'flash'))).toBe('Un allié · téléportation sur une case libre à 2 cases au plus de la cible, sans obstacle');
    expect(cardEffectLine(CARDS, getCard(CARDS, 'elixir-de-mana'))).toBe('+1 mana');
  });
});

describe('Flash, Repli, Téléportation : l’allié, puis la case', () => {
  const state = gameWith(
    [
      { monster: 'milicien', owner: 1, at: at(8, 1) },
      { terrain: 'bastion', owner: 1, at: at(5, 4) },
    ],
    hand(['repli', 'teleportation']),
  );

  it('la carte choisie, un clic sur l’allié le choisit ; ses cases s’allument ; un clic sur l’une joue le sort', () => {
    const card: Selection = { kind: 'card', cardId: 'repli' };
    expect(getHighlights(view(state), card).get(posKey(at(8, 1)))).toBe('target');
    const pick = selectionOf(clickCell(view(state), card, at(8, 1)));
    expect(pick).toEqual({ kind: 'cardTeleport', cardId: 'repli', targetId: 'u1' });
    expect(getCardTeleportCells(view(state), pick).map(posKey).sort()).toEqual(['0,3', '0,4', '0,5']);
    expect(getHighlights(view(state), pick).get(posKey(at(0, 4)))).toBe('target');
    expect(clickCell(view(state), pick, at(0, 4))).toEqual({
      action: { type: 'playCard', cardId: 'repli', target: { kind: 'unitAndCell', unitId: 'u1', pos: at(0, 4) } },
    });
  });

  it('journal : il est téléporté, sans « reculer »', () => {
    const action: Action = { type: 'playCard', cardId: 'teleportation', target: { kind: 'unitAndCell', unitId: 'u1', pos: at(5, 4) } };
    expect(logOf(state, action)).toEqual(['J1 lance Téléportation : Milicien de J1 est téléporté sur la Forge.']);
  });
});

describe('Réanimation : la case, puis le monstre du cimetière', () => {
  const state = gameWith([{ monster: 'milicien', owner: 1, at: at(8, 1) }], hand(['reanimation'], { graveyard: [{ cardId: 'golem' }, { cardId: 'chevalier' }] }));

  it('un clic sur une case d’invocation libre ouvre la bulle : ses monstres du cimetière, sans coût', () => {
    const pick = selectionOf(clickCell(view(state), { kind: 'card', cardId: 'reanimation' }, at(0, 4)));
    expect(pick).toEqual({ kind: 'reviveAt', cardId: 'reanimation', pos: at(0, 4) });
    expect(getReviveChoices(view(state), pick).map((c) => c.cardId)).toEqual(['golem', 'chevalier']);
    const bubble = getBubble(view(state), pick)!;
    expect(bubble.header).toMatchObject({ kind: 'page', title: 'Réanimation', note: '· sans payer son coût' });
    expect(bubble.rows.map((row) => [row.title, row.cost])).toEqual([
      ['Golem', null],
      ['Chevalier', null],
    ]);
  });

  it('journal, et l’animation retire l’exemplaire du cimetière', () => {
    const action: Action = { type: 'playCard', cardId: 'reanimation', target: { kind: 'cellAndCard', pos: at(0, 4), cardId: 'golem' } };
    expect(logOf(state, action)[0]).toBe('J1 lance Réanimation : Golem revient en (0, 4).');
    const after = view(applyAction(state, action));
    const revived = after.events.find((e) => e.type === 'revived')!;
    expect(applyEvent(view(state), revived, after).me.graveyard).toEqual([{ cardId: 'chevalier' }]);
  });

  it('sans monstre au cimetière : la raison est dite', () => {
    const empty = gameWith([], hand(['reanimation'], { graveyard: [{ cardId: 'boule-de-feu' }] }));
    const availability = cardAvailability(view(empty), 'reanimation');
    expect(availability.ok ? null : reasonStatus(availability.reason, '').text).toBe('Aucun monstre dans ton cimetière');
  });
});

describe('Élixir de mana : sans cible', () => {
  it('cliquer la carte ouvre sa bulle, qui le lance d’un coup ; à la limite, la raison est dite', () => {
    const state = gameWith([], hand(['elixir-de-mana'], { mana: 3 }));
    const opened = clickCard(view(state), { kind: 'none' }, 'elixir-de-mana');
    expect(opened).toEqual({ kind: 'cardMenu', cardId: 'elixir-de-mana' });
    expect(getBubble(view(state), opened)!.rows[0]!.pick).toEqual({ action: { type: 'playCard', cardId: 'elixir-de-mana', target: { kind: 'all' } } });
    const full = gameWith([], hand(['elixir-de-mana'], { mana: 10 }));
    const availability = cardAvailability(view(full), 'elixir-de-mana');
    expect(availability.ok ? null : reasonStatus(availability.reason, '').text).toBe('Déjà à la limite de mana');
  });

  it('journal : le mana gagné', () => {
    const state = gameWith([], hand(['elixir-de-mana'], { mana: 3 }));
    expect(logOf(state, { type: 'playCard', cardId: 'elixir-de-mana', target: { kind: 'all' } })).toEqual(['J1 lance Élixir de mana.', 'J1 gagne 1 mana.']);
  });
});

describe('Cure et carapace : journal', () => {
  it('Cure : les malus retirés ; sans allié qui en a, la raison est dite', () => {
    const state = withStatus(gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }], hand(['cure'])), 'u1', 'burn', 1, 2);
    expect(logOf(state, { type: 'playCard', cardId: 'cure', target: { kind: 'unit', unitId: 'u1' } })).toContain(
      'Chevalier de J1 : malus retirés (Burn 1).',
    );
    const clean = gameWith([{ monster: 'chevalier', owner: 1, at: at(8, 1) }], hand(['cure']));
    const availability = cardAvailability(view(clean), 'cure');
    expect(availability.ok ? null : reasonStatus(availability.reason, '').text).toBe('Aucun allié n’a de malus');
  });

  it('carapace : il tient à 1 PV', () => {
    const state = withStatus(
      gameWith([
        { monster: 'golem', owner: 1, at: at(8, 1) },
        { monster: 'milicien', owner: 2, at: at(8, 2) },
      ]),
      'u2',
      'carapace',
      0,
      1,
    );
    expect(logOf(state, { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false })).toContain('Milicien de J2 tient à 1 PV (carapace).');
  });
});
