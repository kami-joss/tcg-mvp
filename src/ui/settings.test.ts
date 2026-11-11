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
  it('par défaut : vue isométrique, animations, son à 0,7, zoom 100 %, grimoire en liste', () => {
    fakeStorage();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      view: 'iso',
      animations: true,
      sound: true,
      volume: 0.7,
      zoom: 1,
      grimoireLayout: 'list',
      grimoireOpen: true,
      tokenStats: { hp: true, mobility: true, enemyMobility: false, atk: false, statuses: true },
      edgeScroll: false,
      grid: true,
      zoneDanger: true,
      zonePath: true,
    });
  });

  it('mémorisés sous les clés de la maquette', () => {
    const data = fakeStorage();
    const saved = {
      view: 'tilt',
      animations: true,
      sound: false,
      volume: 0.4,
      zoom: 1.5,
      grimoireLayout: 'list',
      grimoireOpen: false,
      tokenStats: { ...DEFAULT_TOKEN_STATS, atk: true, statuses: false },
      edgeScroll: true,
      grid: false,
      zoneDanger: false,
      zonePath: false,
    } as const;
    saveSettings(saved);
    expect(data.get('tcg-plateau-vue-v5')).toBe('45');
    expect(data.get('tcg-plateau-son')).toBe('0');
    expect(data.get('tcg-plateau-zoom-v5')).toBe('1.5');
    expect(data.get('tcg-grimoire-affichage')).toBe('liste');
    expect(data.get('tcg-grimoire-ouvert')).toBe('0');
    expect(data.get('tcg-plateau-defilement-bords-v2')).toBe('1');
    expect(data.get('tcg-plateau-quadrillage')).toBe('0');
    expect(data.get('tcg-zones-menace')).toBe('0');
    expect(data.get('tcg-zones-chemin')).toBe('0');
    expect(JSON.parse(data.get('tcg-plateau-stats-v6')!)).toEqual({ pv: true, mob: true, mobE: false, atk: true, st: false });
    expect(loadSettings()).toEqual(saved);
  });

  it('défilement aux bords : désactivé par défaut, activable et retrouvé tel quel ; l’ancien choix mémorisé ne compte plus', () => {
    const data = fakeStorage();
    expect(loadSettings().edgeScroll).toBe(false);
    // Activé sous l'ancienne clé, quand il l'était par défaut : il repart désactivé.
    data.set('tcg-plateau-defilement-bords', '1');
    expect(loadSettings().edgeScroll).toBe(false);
    saveSettings({ ...DEFAULT_SETTINGS, edgeScroll: true });
    expect(data.get('tcg-plateau-defilement-bords-v2')).toBe('1');
    expect(loadSettings().edgeScroll).toBe(true);
    saveSettings({ ...DEFAULT_SETTINGS, edgeScroll: false });
    expect(loadSettings().edgeScroll).toBe(false);
  });

  it('une valeur inconnue revient à la valeur par défaut', () => {
    const data = fakeStorage();
    data.set('tcg-plateau-vue-v5', 'nimporte');
    data.set('tcg-plateau-zoom-v5', '3');
    data.set('tcg-grimoire-affichage', '4');
    data.set('tcg-plateau-stats-v6', '{"pv": "oui", "atk": true}');
    expect(loadSettings()).toMatchObject({ view: 'iso', zoom: 1, grimoireLayout: 'list', tokenStats: { ...DEFAULT_TOKEN_STATS, atk: true } });
  });

  it('grimoire : tuiles ou liste (par défaut), chacun retrouvé tel quel ; les anciens 3 et 1 par ligne deviennent des tuiles', () => {
    expect(GRIMOIRE_LAYOUTS).toEqual(['grid2', 'list']);
    expect(DEFAULT_SETTINGS.grimoireLayout).toBe('list');
    const data = fakeStorage();
    for (const [layout, stored] of [['grid2', '2'], ['list', 'liste']] as const) {
      saveSettings({ ...DEFAULT_SETTINGS, grimoireLayout: layout });
      expect(data.get('tcg-grimoire-affichage')).toBe(stored);
      expect(loadSettings().grimoireLayout).toBe(layout);
    }
    for (const old of ['3', '1']) {
      data.set('tcg-grimoire-affichage', old);
      expect(loadSettings().grimoireLayout).toBe('grid2');
    }
  });

  it('zoom par paliers, de 50 à 200 % (lot 11)', () => {
    expect(ZOOMS).toEqual([0.5, 0.65, 0.8, 1, 1.25, 1.5, 1.75, 2]);
    expect(stepZoom(1, -1)).toBe(0.8);
    expect(stepZoom(0.5, -1)).toBe(0.5);
    expect(stepZoom(1.75, 1)).toBe(2);
    expect(stepZoom(2, 1)).toBe(2);
  });
});
