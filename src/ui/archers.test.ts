import { describe, expect, it } from 'vitest';
import { applyAction, getCard, getPlayerView } from '../engine';
import type { Action, CardId, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { cardEffectLine, describeCard } from './cardText';
import { applyEvent } from './fx/patch';
import { getAttackPreviews, posKey } from './interaction';
import { describeAction } from './log';
import { eventSounds } from './sfx/events';
import { getSheet } from './sheet';

// Interface de Flèche divine (SPEC.md §6 bis) : texte, famille Archer, portée du tour dans la fiche, journal, animation.

const ARROW: Action = { type: 'playCard', cardId: 'fleche-divine', target: { kind: 'unit', unitId: 'u1' } };
const state = gameWith(
  [
    { monster: 'archer-leger', owner: 1, at: at(9, 0) },
    { monster: 'golem', owner: 2, at: at(6, 0) },
  ],
  { players: { 1: { mana: 10, grimoire: ['fleche-divine'] as CardId[] } } },
);
const after = applyAction(state, ARROW);
const view = (s: GameState) => getPlayerView(s, 1);

describe('Flèche divine et famille Archer', () => {
  it('textes : « un allié archer », bonus d’un bloc ; famille sur les 4 archers, pas sur le Trébuchet', () => {
    expect(describeCard(getCard('fleche-divine'))).toEqual(['Un allié archer · +1 ATK +1 portée (pour ce tour)']);
    expect(cardEffectLine(getCard('fleche-divine'))).toBe('Un allié archer · +1 ATK +1 portée (pour ce tour)');
    expect(describeCard(getCard('archer-leger'))[1]).toBe('Famille Archer.');
    expect(describeCard(getCard('trebuchet'))).not.toContain('Famille Archer.');
  });

  it('journal : +1 ATK et +1 portée ce tour', () => {
    expect(describeAction(view(state), ARROW, view(after))).toEqual([
      'J1 lance Flèche divine sur Archer léger de J1.',
      'Archer léger de J1 : +1 ATK ce tour.',
      'Archer léger de J1 : +1 portée ce tour.',
    ]);
  });

  it('fiche : portée 3 et puce du bonus ; dégâts annoncés à 3 cases', () => {
    const sheet = getSheet(view(after), { kind: 'cell', pos: at(9, 0) })!;
    expect(sheet.stats?.find((s) => s.label === 'Portée')?.value).toBe('3');
    expect(sheet.chips).toContainEqual({ text: '+1 portée jusqu’à la fin du tour', tone: 'ok' });
    expect(getAttackPreviews(view(after), { kind: 'unit', unitId: 'u1', mode: 'act' }).get(posKey(at(6, 0)))?.damage).toBe(2);
  });

  it('animation et son du bonus de portée', () => {
    const reach = view(after).events.find((e) => e.type === 'reach')!;
    expect(applyEvent(view(state), reach, view(after)).units.u1).toMatchObject({ rangeBonus: 1 });
    expect(eventSounds([reach]).map(([sound]) => sound)).toEqual(['charge']);
  });
});
