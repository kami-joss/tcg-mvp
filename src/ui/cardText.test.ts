import { describe, expect, it } from 'vitest';
import { CARDS, getCard } from '../engine';
import type { Card } from '../engine';
import spec from '../../SPEC.md?raw';
import { cardEffectLine, describeCard, keywordLabel, statusText } from './cardText';

/** Les tableaux de SPEC.md utilisent l'apostrophe droite, le jeu l'apostrophe typographique. */
const normalize = (text: string) => text.replace(/’/g, "'").trim();

/** Lignes des tableaux de cartes de SPEC.md (§6, §6 bis), indexées par le nom de colonne. */
function specCardRows(): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let header: string[] | null = null;
  for (const line of spec.split('\n')) {
    if (!line.startsWith('|')) {
      header = null;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map(normalize);
    if (cells[0] === 'Carte') header = cells;
    else if (header && !cells[0]?.startsWith('---')) rows.push(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
  }
  return rows;
}

const byName = new Map(Object.values(CARDS).map((card) => [normalize(card.name), card]));

describe('textes des cartes', () => {
  it('mots-clés avec leur valeur, comme sur la carte (§5.6)', () => {
    expect(keywordLabel({ keyword: 'vol' })).toBe('Vol');
    expect(keywordLabel({ keyword: 'prime', amount: 1 })).toBe('Prime 1');
    expect(keywordLabel({ keyword: 'sournois', amount: 1 })).toBe('Sournois +1');
    expect(keywordLabel({ keyword: 'assassin', multiplier: 3 })).toBe('Assassin ×3');
    expect(keywordLabel({ keyword: 'givre', amount: 1, turns: 1 })).toBe('Givre 1');
    expect(keywordLabel({ keyword: 'brulure', amount: 2, turns: 3 })).toBe('Brûlure 2, 3 tours');
  });

  it('statuts avec leur durée en tours (§5.5)', () => {
    expect(statusText({ kind: 'burn', amount: 1, turns: 1 })).toBe('burn 1 pendant 1 tour');
    expect(statusText({ kind: 'stun', turns: 2 })).toBe('stun pendant 2 tours');
    expect(statusText({ kind: 'immobilise', turns: 0 })).toBe('immobilisé jusqu’à son prochain tour');
  });

  it('monstre : caractéristiques, mots-clés expliqués, puis effet actif et son coût', () => {
    expect(describeCard(getCard('chaman'))).toEqual(['ATK 1 · PV 3 · Mob. 2 · Portée 1', 'Actif (1 mana) · un allié adjacent · soin 2']);
    expect(describeCard(getCard('gardien'))[1]).toMatch(/^Passif · Riposte : .*\(une fois par tour\/carte\)\.$/);
    expect(describeCard(getCard('archer-de-glace'))[1]).toBe('Archétype Archers.');
    expect(describeCard(getCard('archer-de-glace'))[2]).toBe(
      'Passif · Givre 1 : à l’attaque, sa cible est slow 1 (−1 mobilité) pendant 1 tour.',
    );
  });

  it('sort : sa cible puis ses effets', () => {
    expect(describeCard(getCard('bourrasque'))).toEqual(['Un ennemi · recul 2, direction au choix']);
  });

  it('terrains : PV et bonus de mana éventuel', () => {
    expect(describeCard(getCard('autel-de-mana'))).toEqual([
      'PV 1 · se pose sur une mana zone occupée par un de vos monstres.',
      'La zone rapporte +1 mana.',
    ]);
    expect(describeCard(getCard('bastion'))).toHaveLength(1);
  });

  it('cartes communes (§6 ter) : Passage, Point d’invocation, invocation, téléportation', () => {
    expect(cardEffectLine(getCard('terrain-drainant'))).toBe('Passage · adjacents · 1 dégât');
    expect(cardEffectLine(getCard('terrain-piege'))).toBe('Passage · adjacents · slow 1 jusqu’à son prochain tour');
    expect(cardEffectLine(getCard('zone-invocation'))).toBe('Point d’invocation');
    expect(cardEffectLine(getCard('invocateur'))).toBe('Actif (1 mana) · une case adjacente libre · invocation');
    expect(cardEffectLine(getCard('teleporteur'))).toBe('Actif (1 mana) · un allié · téléportation sur une case adjacente libre');
    expect(describeCard(getCard('terrain-drainant'))[1]).toMatch(/^Passif · Passage · adjacents · 1 dégât : .*à chaque case où il entre \(une fois par recul\)\.$/);
  });
});

describe('SPEC.md et les données des cartes disent la même chose (§6, §6 bis)', () => {
  const rows = specCardRows();
  const STATS: readonly [string, (card: Card) => number | undefined][] = [
    ['Coût', (card) => card.cost],
    ['ATK', (card) => (card.kind === 'monster' ? card.atk : undefined)],
    ['PV', (card) => (card.kind === 'spell' ? undefined : card.hp)],
    ['Mob.', (card) => (card.kind === 'monster' ? card.mobility : undefined)],
    ['Portée', (card) => (card.kind === 'monster' ? card.range : undefined)],
  ];

  it('chaque carte du jeu a sa ligne dans SPEC.md, et chaque ligne une carte', () => {
    const names = rows.map((row) => row.Carte);
    for (const card of Object.values(CARDS)) expect(names, card.name).toContain(normalize(card.name));
    for (const name of names) expect(byName.has(name ?? ''), name).toBe(true);
  });

  it('coût et caractéristiques identiques', () => {
    for (const row of rows) {
      const card = byName.get(row.Carte ?? '');
      if (!card) continue;
      for (const [column, value] of STATS) {
        if (row[column] !== undefined) expect(row[column], `${card.name} · ${column}`).toBe(String(value(card)));
      }
    }
  });

  it('colonne « Effet » identique au texte généré depuis les données (monstres, sorts, terrains à Passage ou Point d’invocation)', () => {
    for (const row of rows) {
      const card = byName.get(row.Carte ?? '');
      if (!card || (card.kind === 'terrain' && !card.passage && !card.summonPoint)) continue;
      expect(normalize(cardEffectLine(card)), card.name).toBe(row.Effet);
    }
  });
});
