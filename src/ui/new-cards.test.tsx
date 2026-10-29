import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, getCard, getPlayerView } from '../engine';
import type { Action, CardId, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { CARD_ART } from './art';
import { Board } from './Board';
import { cardEffectLine, describeCard } from './cardText';
import { applyEvent } from './fx/patch';
import { clickCell, getHighlights, posKey } from './interaction';
import type { Selection } from './interaction';
import { describeAction } from './log';
import { getSheet } from './sheet';

// Interface d'Origine (aura +1 ATK +1 PV +1 mobilité) et de Pénombre (sort sans choix de cible), SPEC.md §6 bis.

const view = (state: GameState) => getPlayerView(state, 1);
const renderBoard = (state: GameState) =>
  renderToStaticMarkup(
    <Board
      view={view(state)}
      highlights={new Map()}
      attacks={new Map()}
      selectedUnitId={null}
      focused={false}
      path={[]}
      reach={new Map()}
      showArt
      mode="tilt"
      zoom={1}
      animated={false}
      flipped={false}
      onCellClick={() => {}}
      onCellHover={() => {}}
    />,
  );

describe('Dragon élémentaire - Origine', () => {
  it('texte : Vol ; aura sur les dragons élémentaires alliés adjacents', () => {
    expect(cardEffectLine(getCard('dragon-origine'))).toBe('Vol ; Aura · dragons élémentaires alliés adjacents · +1 ATK +1 PV +1 mobilité');
    expect(describeCard(getCard('dragon-origine'))[1]).toBe('Archétype Dragons.');
  });

  it('fiche et animation : le dragon adjacent gagne 1 PV, la puce dit d’où vient le bonus', () => {
    const state = gameWith([{ monster: 'dragon-origine', owner: 1, at: at(1, 4) }], {
      players: { 1: { mana: 10, grimoire: ['dragon-feu'] as CardId[] } },
    });
    const after = applyAction(state, { type: 'playCard', cardId: 'dragon-feu', target: { kind: 'cell', pos: at(0, 4) } });
    const sheet = getSheet(view(after), { kind: 'cell', pos: at(0, 4) })!;
    expect(sheet.stats.slice(0, 2).map((s) => [s.value, s.delta])).toEqual([
      ['6', 1],
      ['6/6', 1],
    ]);
    expect(sheet.status).toContainEqual({ icon: 'aura', text: 'Aura', detail: '+1 ATK +1 PV +1 mobilité (Origine - Dragons)', kind: 'boost', group: 'effect' });
    const aura = view(after).events.find((e) => e.type === 'auraHp')!;
    const before = { ...view(after), units: { ...view(after).units, u2: { ...view(after).units.u2!, hp: 5, maxHp: 5, auraHp: 0 } } };
    expect(applyEvent(before, aura, view(after)).units.u2).toMatchObject({ hp: 6, maxHp: 6, auraHp: 1 });
  });
});

describe('Pénombre', () => {
  const PENOMBRE: Action = { type: 'playCard', cardId: 'penombre', target: { kind: 'all' } };
  const state = gameWith(
    [
      { monster: 'poseur-de-piege', owner: 1, at: at(1, 1) },
      { monster: 'clown-assassin', owner: 1, at: at(2, 7) },
      { monster: 'milicien', owner: 1, at: at(1, 4) },
    ],
    { players: { 1: { mana: 10, grimoire: ['penombre'] as CardId[] } } },
  );
  const selection: Selection = { kind: 'card', cardId: 'penombre' };

  it('texte de la carte', () => {
    expect(describeCard(getCard('penombre'))).toEqual(['Tous les monstres piège alliés · camouflage 2 pendant 1 tour']);
  });

  it('sans cible à choisir : ses monstres piège en doré, un clic sur l’un d’eux la lance', () => {
    const highlights = getHighlights(view(state), selection);
    expect([...highlights.keys()].sort()).toEqual([posKey(at(1, 1)), posKey(at(2, 7))]);
    expect(clickCell(view(state), selection, at(2, 7))).toEqual({ action: PENOMBRE });
    expect(clickCell(view(state), selection, at(1, 4))).not.toEqual({ action: PENOMBRE });
  });

  it('journal, fiche et pastille du statut invisible', () => {
    const after = applyAction(state, PENOMBRE);
    expect(describeAction(view(state), PENOMBRE, view(after))[0]).toBe('J1 lance Pénombre - Pièges.');
    const chips = getSheet(view(after), { kind: 'cell', pos: at(1, 1) })!.status;
    // Un seul « Camouflé » : le statut de Pénombre, sans puce d'effet en double.
    expect(chips).toEqual([
      {
        icon: 'eye-slash',
        text: 'Camouflé',
        detail: 'Camouflé jusqu’à la fin de ce tour et de son prochain : invisible pour l’adversaire sans monstre ni terrain à lui dans un rayon de 2',
        kind: 'info',
        group: 'status',
      },
    ]);
    expect(renderBoard(after)).toContain('class="status status--camouflage"');
  });
});

describe('illustrations des nouvelles cartes', () => {
  it('Flèche divine, Pénombre et Origine ont la leur', () => {
    for (const id of ['fleche-divine', 'penombre', 'dragon-origine'] as const) expect(CARD_ART[id], id).toBeTruthy();
  });
});
