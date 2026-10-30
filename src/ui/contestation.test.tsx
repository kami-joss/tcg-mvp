import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_13, BATTLEFIELD_15, getPlayerView } from '../engine';
import type { PlayerView } from '../engine';
import { at, gameWith, type UnitSpec } from '../engine/test-utils';
import { Board } from './Board';
import { getZoneTiles } from './contestZones';
import { Legend } from './Legend';
import { getSheet } from './sheet';
import type { BoardView } from './settings';

// Mode contestation (SPEC.md §4.4 bis) à l'écran : zones de 9 cases au sol, état de la zone dans la fiche et l'aide.
// Champ de bataille 13 × 13 : la Forge est en (6, 6).

const FORGE = at(6, 6);
const view = (units: readonly UnitSpec[], board = BATTLEFIELD_13) =>
  getPlayerView(gameWith(units, { board, mode: 'contestation' }), 1);
const contested = () =>
  view([
    { monster: 'golem', owner: 1, at: at(5, 5) },
    { monster: 'eclaireur', owner: 2, at: at(7, 7) },
  ]);

const render = (v: PlayerView, mode: BoardView = 'top') =>
  renderToStaticMarkup(
    <Board
      view={v}
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

describe('mode contestation : zones au sol', () => {
  it('9 cases par mana zone, avec le bord du carré sur leurs côtés extérieurs', () => {
    const tiles = getZoneTiles(view([]));
    expect(tiles.size).toBe(5 * 9);
    expect(tiles.get('5,5')).toEqual({ zone: 'forge', look: 'neutral', edges: ['top', 'left'] });
    expect(tiles.get('6,6')).toEqual({ zone: 'forge', look: 'neutral', edges: [] });
    expect(tiles.get('7,6')?.edges).toEqual(['bottom']);
    expect(tiles.has('8,6')).toBe(false);
  });

  it('à la couleur de celui qui la tient, ou contestée', () => {
    expect(getZoneTiles(view([{ monster: 'golem', owner: 2, at: at(7, 5) }])).get('5,7')?.look).toBe('p2');
    expect(getZoneTiles(contested()).get('6,6')?.look).toBe('contested');
  });

  it('aucune en mode Normal', () => {
    expect(getZoneTiles(getPlayerView(gameWith([], { board: BATTLEFIELD_13 }), 1)).size).toBe(0);
  });

  it('le plateau les dessine dans toutes les vues, cases X comprises (Mine du 15 × 15)', () => {
    for (const mode of ['top', 'tilt', 'iso'] as const) {
      expect(render(contested(), mode).match(/cell__area cell__area--/g)).toHaveLength(5 * 9);
    }
    const mine = render(view([], BATTLEFIELD_15));
    expect(mine.match(/cell__area cell__area--/g)).toHaveLength(5 * 9);
    expect(render(getPlayerView(gameWith([], { board: BATTLEFIELD_13 }), 1))).not.toContain('cell__area');
  });

  it('la mana zone contestée : sa case et son étiquette le disent', () => {
    const html = render(contested());
    expect(html).toContain('cell--contested');
    expect(html).toContain('Contestée · Forge');
    expect(html.match(/cell__area--contested/g)).toHaveLength(9);
  });
});

describe('mode contestation : fiche et aide', () => {
  it('la fiche d’une mana zone dit qu’elle est contestée, même survolée sur une case vide de sa zone', () => {
    const v = contested();
    const center = getSheet(v, { kind: 'cell', pos: FORGE });
    expect(center?.title).toBe('Forge');
    expect(center?.lines[0]?.status).toEqual({ text: 'Contestée · personne', tone: 'warn' });
    expect(center?.text.join(' ')).toContain('contestée');
    expect(getSheet(v, { kind: 'cell', pos: at(5, 6) })?.title).toBe('Forge');
    expect(getSheet(v, { kind: 'cell', pos: at(8, 6) })).toBeNull();
  });

  it('tenue : le joueur et le mana qu’elle rapporte', () => {
    const v = view([{ monster: 'porte-etendard', owner: 1, at: at(5, 5) }]);
    expect(getSheet(v, { kind: 'cell', pos: FORGE })?.lines[0]?.status).toEqual({ text: 'Joueur 1 · +2 mana', tone: 'info' });
  });

  it('la puce de la zone d’un monstre : tenue, contestée, ou tenue par un terrain adverse', () => {
    const chip = (v: PlayerView, unitId: string) =>
      getSheet(v, { kind: 'unit', unitId })?.status?.find((c) => c.text === 'Forge');
    expect(chip(view([{ monster: 'golem', owner: 1, at: at(5, 5) }]), 'u1')).toMatchObject({ kind: 'zone', detail: 'Tient Forge : +1 mana, +1 VP' });
    expect(chip(contested(), 'u1')).toMatchObject({ kind: 'warn', detail: expect.stringContaining('contestée') });
    const enemyTerrain = view([
      { monster: 'golem', owner: 1, at: at(5, 5) },
      { terrain: 'bastion', owner: 2, at: FORGE },
    ]);
    expect(chip(enemyTerrain, 'u1')).toMatchObject({ kind: 'warn', detail: expect.stringContaining('tenue par J2') });
  });

  it('l’aide explique la zone contestée en mode contestation seulement', () => {
    expect(renderToStaticMarkup(<Legend onClose={() => {}} mode="contestation" />)).toContain('Zone contestée');
    expect(renderToStaticMarkup(<Legend onClose={() => {}} />)).not.toContain('Zone contestée');
  });
});
