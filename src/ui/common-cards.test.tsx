import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView } from '../engine';
import type { Action, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { applyEvent } from './fx/patch';
import { NO_SELECTION, clickCell, getHighlights, getSummonChoices, getTeleportCells, posKey } from './interaction';
import type { Selection } from './interaction';
import { Board } from './Board';
import { describeAction } from './log';
import { diceLayout, getZoneMarks } from './zoneMarks';

// Interface des cartes communes (SPEC.md §6 ter) : choix en deux temps de l'Invocateur et du Téléporteur, journal,
// mise à jour pas à pas pendant les animations.

const activeView = (state: GameState) => getPlayerView(state, state.activePlayer);
const selectionOf = (result: ReturnType<typeof clickCell>): Selection => {
  if (!('selection' in result)) throw new Error('sélection attendue');
  return result.selection;
};
const logOf = (state: GameState, action: Action) =>
  describeAction(getPlayerView(state, state.activePlayer), action, getPlayerView(applyAction(state, action), state.activePlayer));

describe('Invocateur : la case, puis le monstre', () => {
  const state = gameWith([{ monster: 'invocateur', owner: 1, at: at(2, 2) }], { players: { 1: { mana: 5 } } });
  const view = activeView(state);
  const effect: Selection = { kind: 'unit', unitId: 'u1', mode: 'effect' };

  it('ses cases adjacentes libres sont en violet ; un clic choisit la case, la bulle propose les monstres payables', () => {
    expect(getHighlights(view, effect).get(posKey(at(3, 3)))).toBe('effect');
    const pick = selectionOf(clickCell(view, effect, at(3, 3)));
    expect(pick).toEqual({ kind: 'summonAt', unitId: 'u1', pos: at(3, 3) });
    const cards = getSummonChoices(view, pick).map((c) => c.cardId);
    expect(cards).toContain('golem');
    expect(cards).not.toContain('dragonnet');
    expect(cards).not.toContain('charge');
  });

  it('journal : l’Invocateur invoque le monstre sur sa case', () => {
    const action: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'cellAndCard', pos: at(3, 3), cardId: 'golem' } };
    expect(logOf(state, action)[0]).toBe('Invocateur de J1 invoque Golem en (3, 3).');
  });
});

describe('Téléporteur : l’allié, puis la case', () => {
  const state = gameWith(
    [
      { monster: 'teleporteur', owner: 1, at: at(2, 2) },
      { monster: 'golem', owner: 1, at: at(9, 0) },
    ],
    { players: { 1: { mana: 1 } } },
  );
  const view = activeView(state);
  const effect: Selection = { kind: 'unit', unitId: 'u1', mode: 'effect' };

  it('les alliés sont en violet ; un clic choisit l’allié, puis une case adjacente libre joue l’action', () => {
    expect(getHighlights(view, effect).get(posKey(at(9, 0)))).toBe('effect');
    const pick = selectionOf(clickCell(view, effect, at(9, 0)));
    expect(pick).toEqual({ kind: 'teleport', unitId: 'u1', targetId: 'u2' });
    expect(getTeleportCells(view, pick)).toHaveLength(8);
    expect(getHighlights(view, pick).get(posKey(at(1, 1)))).toBe('effect');
    expect(clickCell(view, pick, at(1, 1))).toEqual({
      action: { type: 'activateEffect', unitId: 'u1', target: { kind: 'unitAndCell', unitId: 'u2', pos: at(1, 1) } },
    });
    expect(selectionOf(clickCell(view, pick, at(5, 5)))).toEqual(NO_SELECTION);
  });

  it('journal et animation : le monstre change de case sans « reculer »', () => {
    const action: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'unitAndCell', unitId: 'u2', pos: at(1, 1) } };
    expect(logOf(state, action)).toEqual(['Téléporteur de J1 téléporte Golem de J1 en (1, 1).']);
    const after = getPlayerView(applyAction(state, action), 1);
    const teleport = after.events.find((e) => e.type === 'teleport')!;
    expect(applyEvent(view, teleport, after).units.u2?.pos).toEqual(at(1, 1));
  });
});

describe('Passage : journal', () => {
  it('le terrain qui se déclenche, puis la perte de PV', () => {
    const state = gameWith([
      { terrain: 'terrain-drainant', owner: 2, at: at(5, 4) },
      { monster: 'chevalier', owner: 1, at: at(3, 3) },
    ]);
    expect(logOf(state, { type: 'move', unitId: 'u2', to: at(4, 3) })).toEqual([
      'J1 déplace Chevalier en (4, 3).',
      'Terrain drainant de J2 se déclenche sur Chevalier de J1.',
      'Chevalier de J1 : 4 → 3 PV.',
    ]);
  });
});

describe('terrains debout : un blason garni de l’illustration de la carte', () => {
  it('Terrain drainant, Terrain piégé, Zone d’invocation', () => {
    const view = getPlayerView(
      gameWith([
        { terrain: 'terrain-drainant', owner: 1, at: at(5, 4) },
        { terrain: 'terrain-piege', owner: 2, at: at(5, 1) },
        { terrain: 'zone-invocation', owner: 1, at: at(5, 7) },
      ]),
      1,
    );
    const html = renderToStaticMarkup(
      <Board
        view={view}
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
    // Cadrée comme un jeton (lot 10), en cqw : le blason est le conteneur.
    expect(html.match(/class="crest__face crest__face--art"><span class="art-fit" style="background:url\(&quot;[^"]*cqw/g)).toHaveLength(3);
    for (const art of ['terrain-drainant', 'terrain-piege', 'zone-invocation']) expect(html).toContain(art);
  });
});

describe('zone des terrains « Passage » : l’icône de ce qu’ils infligent sur chaque case touchée', () => {
  const view = getPlayerView(
    gameWith([
      { terrain: 'terrain-drainant', owner: 2, at: at(5, 4) },
      { terrain: 'terrain-piege', owner: 1, at: at(2, 4) },
      { terrain: 'bastion', owner: 1, at: at(8, 4) },
    ]),
    1,
  );

  it('dégâts : un cœur « −1 » ; slow 1 : l’escargot ; rien autour d’un terrain sans Passage', () => {
    const marks = getZoneMarks(view);
    // Forge (5, 4) : ses 6 cases adjacentes (les cases X ne comptent pas).
    for (const key of ['4,3', '5,3', '6,3', '4,5', '5,5', '6,5']) {
      expect(marks.get(key), key).toEqual([expect.objectContaining({ sourceId: 'u1', owner: 2, icon: 'hearts', label: '−1' })]);
    }
    expect(marks.get('1,4')).toEqual([expect.objectContaining({ sourceId: 'u2', owner: 1, icon: 'snail', label: null })]);
    expect(marks.has('7,4') || marks.has('9,4') || marks.has('8,3')).toBe(false);
    expect(marks.get('5,3')?.[0]?.title).toBe('Terrain drainant de J2 : 1 dégât à l’ennemi qui entre ici (à chaque case en marchant).');
  });

  it('dessinées au sol des cases, dans toutes les vues', () => {
    for (const mode of ['top', 'tilt'] as const) {
      const html = renderToStaticMarkup(
        <Board
          view={view}
          highlights={new Map()}
          attacks={new Map()}
          selectedUnitId={null}
          focused={false}
          path={[]}
          reach={new Map()}
          showArt
          mode={mode}
          zoom={1}
          animated={false}
          flipped={false}
          onCellClick={() => {}}
          onCellHover={() => {}}
        />,
      );
      expect(html.match(/class="zone-mark zone-mark--p2"/g)).toHaveLength(6);
      expect(html.match(/class="zone-mark zone-mark--p1"/g)?.length).toBeGreaterThan(0);
    }
  });
});

describe('plusieurs marques sur une case : rangées comme les points d’un dé', () => {
  it('une au centre, deux en diagonale, quatre aux coins', () => {
    expect(diceLayout(1)).toEqual([{ x: 50, y: 50, size: 68 }]);
    expect(diceLayout(2).map(({ x, y }) => [x, y])).toEqual([[28, 28], [72, 72]]);
    expect(diceLayout(4).map(({ x, y }) => [x, y])).toEqual([[27, 27], [73, 27], [27, 73], [73, 73]]);
    expect(new Set(diceLayout(3).map((s) => s.size)).size).toBe(1);
  });
});
