import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CARDS, applyAction, getMonsterCard, getPlayerView } from '../engine';
import type { Action, Card, CardId, CardSet } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { Tile } from './Grimoire';
import { describeAction } from './log';
import { unitVisuals } from './pixi/tokenModel';
import { ALL_TOKEN_STATS } from './settings';
import { abilityRules } from './rulesText';
import { getSheet } from './sheet';

// L'écran de jeu lit les cartes de la partie (`view.cards`), jamais celles d'origine : une carte modifiée se voit
// partout, fiche, grimoire, textes, journal et jetons.

const withCard = (id: CardId, change: Partial<Card>): CardSet => ({ ...CARDS, [id]: { ...CARDS[id], ...change } as Card });

const duel = (cards: CardSet) =>
  gameWith(
    [
      { monster: 'chevalier', owner: 1, at: at(8, 1) },
      { monster: 'gardien', owner: 2, at: at(8, 2) },
    ],
    { cards, players: { 1: { grimoire: ['chevalier'], mana: 3 } } },
  );

describe('l’écran lit les cartes de la partie', () => {
  it('fiche : les stats du monstre et le coût de la carte du grimoire', () => {
    const view = getPlayerView(duel(withCard('chevalier', { atk: 6, cost: 5 })), 1);
    const unit = getSheet(view, { kind: 'unit', unitId: 'u1' })!;
    expect(unit.stats.find((s) => s.label === 'ATK')?.value).toBe('6');
    expect(getSheet(view, { kind: 'card', cardId: 'chevalier' })?.cost).toBe(5);
  });

  it('grimoire : la tuile montre le coût de la carte de la partie', () => {
    const tile = (cards: CardSet) =>
      renderToStaticMarkup(
        <Tile
          cards={cards}
          cardId="chevalier"
          list={false}
          focused={false}
          shiny={false}
          animated={false}
          onClick={() => {}}
          onHover={() => {}}
        />,
      );
    expect(tile(CARDS)).toMatch(/tile__cost[^>]*>(<[^>]*>)*3</);
    expect(tile(withCard('chevalier', { cost: 7 }))).toMatch(/tile__cost[^>]*>(<[^>]*>)*7</);
  });

  it('texte d’une transformation : la forme et ses stats viennent des cartes de la partie', () => {
    const cards = withCard('emma-chauve-souris', { atk: 4 });
    const transform = getMonsterCard(cards, 'emma').activated[0]!;
    expect(abilityRules(CARDS, transform)).toContain('ATK 1');
    expect(abilityRules(cards, transform)).toContain('ATK 4');
  });

  it('journal : le nom des unités vient des cartes de la partie', () => {
    const state = duel(withCard('chevalier', { name: 'Chevalier d’essai' }));
    const attack: Action = { type: 'attack', unitId: 'u1', targetId: 'u2', advance: false };
    const lines = describeAction(getPlayerView(state, 1), attack, getPlayerView(applyAction(state, attack), 1));
    expect(lines[0]).toContain('Chevalier d’essai de J1 attaque Gardien de J2');
  });

  it('jetons : la mobilité d’un monstre adverse est celle de sa carte de la partie', () => {
    const view = getPlayerView(duel(withCard('gardien', { mobility: 4 })), 1);
    const { tokens } = unitVisuals({
      view,
      highlights: new Map(),
      attacks: new Map(),
      selectedUnitId: null,
      flipped: false,
      stats: ALL_TOKEN_STATS,
    });
    const gardien = tokens.find((t) => t.cardId === 'gardien')!;
    expect(gardien.stats.find((s) => s.kind === 'mob')?.value).toBe(4);
  });
});
