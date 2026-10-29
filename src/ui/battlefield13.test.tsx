import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import spec from '../../SPEC.md?raw';
import { BATTLEFIELD_13, getCell, getCliff, getPlayerView } from '../engine';
import type { PlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { Board } from './Board';
import { ALL_TOKEN_STATS } from './settings';
import type { BoardView } from './settings';
import { getSheet } from './sheet';

// Grande carte 13 × 13 (handoff V7, lot 7) : rendu des étangs, vue iso, +1 mobilité affichée.

const render = (view: PlayerView, mode: BoardView) =>
  renderToStaticMarkup(
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
      stats={ALL_TOKEN_STATS}
      onCellClick={() => {}}
      onCellHover={() => {}}
    />,
  );

const state = gameWith(
  [
    { monster: 'milicien', owner: 1, at: at(0, 0) },
    { monster: 'golem', owner: 2, at: at(12, 12) },
  ],
  { board: BATTLEFIELD_13 },
);
const view = getPlayerView(state, 1);

describe('plateau 13 × 13', () => {
  it('SPEC.md §3 dessine la même carte que les données (cases, eau, falaises)', () => {
    const block = spec.slice(spec.indexOf('### Grande carte « Champ de bataille » (13 × 13)')).split('```')[1]!.split('\n');
    const rows = block.filter((line) => /^r\d+ /.test(line));
    expect(rows).toHaveLength(13);
    const SYMBOL = { plain: 'P', blocked: 'X' } as const;
    const ZONES = { ecurie: 'E', ferme: 'R', forge: 'F', scierie: 'S', mine: 'M' } as const;
    rows.forEach((line, row) => {
      const symbols = line.replace(/\|/g, ' ').trim().split(/\s+/).slice(1);
      symbols.forEach((symbol, col) => {
        const cell = getCell(BATTLEFIELD_13, at(row, col));
        const water = BATTLEFIELD_13.scenery!.water.some((pos) => pos.row === row && pos.col === col);
        const plain = cell.kind === 'plain' && (cell.manaZone ? ZONES[cell.manaZone] : String(cell.summonZoneOf ?? 'P'));
        const expected = plain || (water ? '~' : SYMBOL[cell.kind as 'blocked']);
        expect(symbol, `(${row}, ${col})`).toBe(expected);
      });
      // « | » : falaise avec la case de droite.
      [...line.matchAll(/\|/g)].forEach((match) => {
        const col = (match.index! - 8) / 3;
        expect(getCliff(BATTLEFIELD_13, at(row, col), at(row, col + 1)), `(${row}, ${col})|`).toBeDefined();
      });
    });
    const bars = block.flatMap((line, i) => {
      const above = block.slice(0, i).filter((l) => /^r\d+ /.test(l)).length - 1;
      return [...line.matchAll(/‾‾/g)].map((match) => [above, (match.index! - 7) / 3] as const);
    });
    expect(bars).toHaveLength(BATTLEFIELD_13.cliffs.length - rows.join('').split('|').length + 1);
    for (const [row, col] of bars) expect(getCliff(BATTLEFIELD_13, at(row, col), at(row + 1, col)), `(${row}, ${col})‾`).toBeDefined();
  });

  it('169 cases ; les deux étangs, en bande verticale, dans les vues de dessus et inclinée', () => {
    const html = render(view, 'top');
    expect(html.match(/data-cell=/g)).toHaveLength(169);
    expect(html.match(/cell--water cell--pond/g)).toHaveLength(4);
    expect(html.match(/aria-label="Étang"/g)).toHaveLength(4);
    expect(getSheet(view, { kind: 'cell', pos: at(9, 6) })!.title).toBe('Étang');
  });

  it('vue inclinée : le même décor 2,5D, à la place des barres de falaise et des cases hachurées', () => {
    const html = render(view, 'tilt');
    expect(html).toContain('board--tilt board--decor');
    expect(html).toContain('iso-decor');
    expect(html).not.toContain('class="cliff');
    expect(render(view, 'top')).not.toContain('iso-decor');
  });

  it('vue isométrique disponible : décor, deux étangs creusés dans le bloc', () => {
    const html = render(view, 'iso');
    expect(html).toContain('board--iso');
    expect(html).toContain('iso-decor');
  });

  it('+1 mobilité : pastille de l’adversaire, fiche et puce « sur ce plateau »', () => {
    const html = render(view, 'top');
    expect(html).toMatch(/class="stat stat--mob is-mine" title="Pas restants">.*?<\/svg>3<\/span>/); // Milicien : 2 + 1
    expect(html).toMatch(/class="stat stat--mob" title="Mobilité">.*?<\/svg>3<\/span>/); // Golem : 2 + 1
    const sheet = getSheet(view, { kind: 'cell', pos: at(12, 12) })!;
    expect(sheet.stats).toContainEqual({ icon: 'walking-boot', label: 'Mobilité', value: '3', delta: 1, hurt: false });
    const chip = { icon: 'walking-boot', text: 'Champ de bataille (13 × 13)', detail: 'Plateau : +1 mobilité pour tous les monstres', kind: 'boost', group: 'effect' };
    expect(sheet.status).toContainEqual(chip);
    expect(sheet.text[0]).toContain('(mobilité 3)');
    const card = getSheet(view, { kind: 'card', cardId: 'golem' })!;
    expect(card.stats).toContainEqual({ icon: 'walking-boot', label: 'Mobilité', value: '3', delta: 1, hurt: false });
    expect(card.status).toEqual([chip]);
  });
});
