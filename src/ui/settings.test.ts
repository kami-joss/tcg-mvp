import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_TOKEN_STATS, GRIMOIRE_LAYOUTS, ZOOMS, loadSettings, saveSettings, stepZoom } from './settings';

function fakeStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('réglages d’affichage (handoff, lots 3 à 6)', () => {
  it('par défaut : vue isométrique, plateau retourné, animations, son à 0,7, zoom 100 %, grimoire à 2 cartes par ligne', () => {
    fakeStorage();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      view: 'iso',
      flip: true,
      animations: true,
      sound: true,
      volume: 0.7,
      zoom: 1,
      grimoireLayout: 'grid2',
      tokenStats: { hp: true, mobility: true, enemyMobility: false, atk: false, statuses: true },
    });
  });

  it('mémorisés sous les clés de la maquette', () => {
    const data = fakeStorage();
    const saved = {
      view: 'tilt',
      flip: false,
      animations: true,
      sound: false,
      volume: 0.4,
      zoom: 1.5,
      grimoireLayout: 'list',
      tokenStats: { ...DEFAULT_TOKEN_STATS, atk: true, statuses: false },
    } as const;
    saveSettings(saved);
    expect(data.get('tcg-plateau-vue-v5')).toBe('45');
    expect(data.get('tcg-plateau-son')).toBe('0');
    expect(data.get('tcg-plateau-zoom-v5')).toBe('1.5');
    expect(data.get('tcg-grimoire-affichage')).toBe('liste');
    expect(JSON.parse(data.get('tcg-plateau-stats-v6')!)).toEqual({ pv: true, mob: true, mobE: false, atk: true, st: false });
    expect(loadSettings()).toEqual(saved);
  });

  it('une valeur inconnue revient à la valeur par défaut', () => {
    const data = fakeStorage();
    data.set('tcg-plateau-vue-v5', 'nimporte');
    data.set('tcg-plateau-zoom-v5', '3');
    data.set('tcg-grimoire-affichage', '4');
    data.set('tcg-plateau-stats-v6', '{"pv": "oui", "atk": true}');
    expect(loadSettings()).toMatchObject({ view: 'iso', zoom: 1, grimoireLayout: 'grid2', tokenStats: { ...DEFAULT_TOKEN_STATS, atk: true } });
  });

  it('grimoire : 3, 2 ou 1 carte par ligne, ou liste, chacun retrouvé tel quel', () => {
    expect(GRIMOIRE_LAYOUTS).toEqual(['grid3', 'grid2', 'grid1', 'list']);
    const data = fakeStorage();
    for (const [layout, stored] of [['grid3', '3'], ['grid2', '2'], ['grid1', '1'], ['list', 'liste']] as const) {
      saveSettings({ ...DEFAULT_SETTINGS, grimoireLayout: layout });
      expect(data.get('tcg-grimoire-affichage')).toBe(stored);
      expect(loadSettings().grimoireLayout).toBe(layout);
    }
  });

  it('zoom par paliers de 25 %, de 100 à 200 %', () => {
    expect(ZOOMS).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect(stepZoom(1, -1)).toBe(1);
    expect(stepZoom(1.75, 1)).toBe(2);
    expect(stepZoom(2, 1)).toBe(2);
  });
});
