import { describe, expect, it } from 'vitest';
import { CARDS, applyAction, getCard, getPlayerView } from '../engine';
import type { Action, Beacon, GameState, PlayerId, Position } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { getBubble } from './bubble';
import { cardEffectLine, describeCard } from './cardText';
import { NO_ZONE_VIEW, getAttackPreviews } from './interaction';
import { describeAction } from './log';
import { pileOf } from './piles';
import { cellVisuals } from './pixi/cellModel';
import { passiveRules, plainRules } from './rulesText';

// Balise de vision à l'écran (SPEC.md §6 ter, §10, 2026-11-12) : textes, plateau, bulle d'attaque, journal, piles.

const withBeacon = (state: GameState, owner: PlayerId, pos: Position, hp = 3): GameState => {
  const beacon: Beacon = { id: `u${state.nextUnitId}`, cardId: 'balise-de-vision', owner, pos, hp, maxHp: 3 };
  return { ...state, beacons: [beacon], nextUnitId: state.nextUnitId + 1 };
};

describe('Balise de vision : textes', () => {
  const card = getCard(CARDS, 'balise-de-vision');

  it('notation et phrases : où elle se pose, ce qu’elle révèle', () => {
    expect(cardEffectLine(CARDS, card)).toBe(
      'Balise · une case libre, carré de 3 d’un de tes monstres, hors case centrale d’une mana zone tenue · révèle les pièges ennemis, carré de 5',
    );
    expect(describeCard(CARDS, card)[0]).toMatch(/^PV 3 · se pose sur une case libre dans un carré de 3/);
    const [where, vision] = passiveRules(card).map((item) => plainRules(item.text));
    expect(where).toBe('Pose une balise sur une case libre dans un carré de 3 d’un de tes monstres, sauf la case centrale d’une mana zone que tu tiens.');
    expect(vision).toBe('Révèle les pièges ennemis sur sa case et dans un carré de 5 autour d’elle.');
  });
});

describe('Balise de vision : en partie', () => {
  const state = withBeacon(gameWith([{ monster: 'milicien', owner: 2, at: at(1, 1) }], { activePlayer: 2 }), 1, at(1, 2));
  const id = state.beacons![0]!.id;
  const view = getPlayerView(state, 2);

  it('dessinée sur sa case, à la couleur de son joueur, avec ses PV', () => {
    const cells = cellVisuals({
      view,
      highlights: new Map(),
      attacks: new Map(),
      selectedUnitId: null,
      focused: false,
      path: [],
      zones: NO_ZONE_VIEW,
      hovered: null,
      flipped: false,
      animated: false,
    });
    expect(cells.find((v) => v.key === '1,2')?.beacon).toEqual({ owner: 1, hp: 3 });
  });

  it('bulle d’attaque : les dégâts annoncés, détruite ou non', () => {
    const bubble = getBubble(view, { kind: 'attack', unitId: 'u1', targetId: id, page: 'main' });
    expect(bubble?.header).toMatchObject({ kind: 'unit', name: 'Balise de vision', owner: 1, hp: { before: 3, after: 1 } });
    expect(bubble?.rows.map((row) => [row.title, row.subtitle])).toEqual([['Attaquer la balise', '−2 PV']]);
    expect(getAttackPreviews(view, { kind: 'attack', unitId: 'u1', targetId: id, page: 'main' }).get('1,2')).toEqual({ damage: 2, behind: false });
  });

  it('journal : l’attaque et ses PV perdus, puis sa destruction', () => {
    const action: Action = { type: 'attack', unitId: 'u1', targetId: id, advance: false };
    const hit = applyAction(state, action);
    expect(describeAction(view, action, getPlayerView(hit, 2))).toEqual([
      'Milicien de J2 attaque Balise de vision de J1.',
      'Balise de vision de J1 : −2 PV (1 PV).',
    ]);
    const weak = withBeacon(gameWith([{ monster: 'milicien', owner: 2, at: at(1, 1) }], { activePlayer: 2 }), 1, at(1, 2), 1);
    const gone = applyAction(weak, action);
    expect(describeAction(getPlayerView(weak, 2), action, getPlayerView(gone, 2))).toContain('Balise de vision de J1 est détruite.');
  });

  it('dans la liste « Sur le plateau » de son joueur', () => {
    expect(pileOf(view, 1, 'board')).toEqual([{ cardId: 'balise-de-vision' }]);
  });
});
