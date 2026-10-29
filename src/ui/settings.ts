// Réglages d'affichage propres à ce navigateur (handoff, lots 2 à 6) : vue du plateau, plateau retourné vers le joueur
// actif, animations, son, zoom, affichage du grimoire, stats sur les jetons. Mémorisés dans localStorage, avec repli sur les valeurs par défaut
// s'il est indisponible.

/** Vue du plateau : de dessus, inclinée à 45° ou isométrique (lot 5). */
export type BoardView = 'top' | 'tilt' | 'iso';

/** Niveaux de zoom du plateau (lot 5 ; lot 11 : de 50 à 200 %). 100 % : le plateau ajusté à sa zone. */
export const ZOOMS: readonly number[] = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 1.75, 2];

/** Affichage du grimoire : 3, 2 ou 1 carte par ligne, ou liste compacte. */
export type GrimoireLayout = 'grid3' | 'grid2' | 'grid1' | 'list';

/** Les affichages du grimoire, dans l'ordre de leurs boutons. */
export const GRIMOIRE_LAYOUTS: readonly GrimoireLayout[] = ['grid3', 'grid2', 'grid1', 'list'];

/** Stats affichées sur les jetons (lot 6, menu « Stats ») ; Alt maintenu les montre toutes. */
export interface TokenStats {
  readonly hp: boolean;
  /** Mobilité restante de ses monstres, pendant son tour. */
  readonly mobility: boolean;
  /** Mobilité des monstres adverses. */
  readonly enemyMobility: boolean;
  readonly atk: boolean;
  /** Statuts (burn, slow, stun…). */
  readonly statuses: boolean;
}

export const DEFAULT_TOKEN_STATS: TokenStats = { hp: true, mobility: true, enemyMobility: false, atk: false, statuses: true };

export const ALL_TOKEN_STATS: TokenStats = { hp: true, mobility: true, enemyMobility: true, atk: true, statuses: true };

/** Clés mémorisées des stats (celles de la maquette). */
const STAT_KEYS: Readonly<Record<keyof TokenStats, string>> = {
  hp: 'pv',
  mobility: 'mob',
  enemyMobility: 'mobE',
  atk: 'atk',
  statuses: 'st',
};

export interface DisplaySettings {
  readonly view: BoardView;
  /** Animations des actions et boucles (respiration des jetons, halos, décor). */
  readonly animations: boolean;
  /** Sons (lot 4). */
  readonly sound: boolean;
  /** Volume des sons, de 0 à 1. */
  readonly volume: number;
  /** Zoom du plateau, un des `ZOOMS`. */
  readonly zoom: number;
  /** Affichage du grimoire (il règle aussi la largeur de son panneau). */
  readonly grimoireLayout: GrimoireLayout;
  /** Panneau du grimoire ouvert, ou replié contre le bord droit (handoff V11, lot 13 §4). */
  readonly grimoireOpen: boolean;
  /** Stats sur les jetons. */
  readonly tokenStats: TokenStats;
}

export const DEFAULT_SETTINGS: DisplaySettings = {
  view: 'iso',
  animations: true,
  sound: true,
  volume: 0.7,
  zoom: 1,
  grimoireLayout: 'grid2',
  grimoireOpen: true,
  tokenStats: DEFAULT_TOKEN_STATS,
};

const KEYS = {
  view: 'tcg-plateau-vue-v5',
  animations: 'tcg-animations',
  sound: 'tcg-plateau-son',
  volume: 'tcg-plateau-volume',
  zoom: 'tcg-plateau-zoom-v5',
  grimoireLayout: 'tcg-grimoire-affichage',
  grimoireOpen: 'tcg-grimoire-ouvert',
  tokenStats: 'tcg-plateau-stats-v6',
} as const;

/** Valeur mémorisée de chaque vue (celles de la maquette). */
const VIEW_VALUES: Readonly<Record<BoardView, string>> = { top: '0', tilt: '45', iso: 'iso' };

/** Valeur mémorisée de chaque affichage du grimoire. */
const LAYOUT_VALUES: Readonly<Record<GrimoireLayout, string>> = { grid3: '3', grid2: '2', grid1: '1', list: 'liste' };

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readTokenStats(): TokenStats {
  try {
    const saved: unknown = JSON.parse(read(KEYS.tokenStats) ?? '{}');
    if (!saved || typeof saved !== 'object') return DEFAULT_TOKEN_STATS;
    const entries = (Object.keys(STAT_KEYS) as (keyof TokenStats)[]).map((key) => {
      const value = (saved as Record<string, unknown>)[STAT_KEYS[key]];
      return [key, typeof value === 'boolean' ? value : DEFAULT_TOKEN_STATS[key]] as const;
    });
    return Object.fromEntries(entries) as unknown as TokenStats;
  } catch {
    return DEFAULT_TOKEN_STATS;
  }
}

export function loadSettings(): DisplaySettings {
  const view = read(KEYS.view);
  const animations = read(KEYS.animations);
  const sound = read(KEYS.sound);
  const volume = Number.parseFloat(read(KEYS.volume) ?? '');
  const zoom = Number.parseFloat(read(KEYS.zoom) ?? '');
  const grimoireLayout = read(KEYS.grimoireLayout);
  const grimoireOpen = read(KEYS.grimoireOpen);
  return {
    view: (Object.keys(VIEW_VALUES) as BoardView[]).find((v) => VIEW_VALUES[v] === view) ?? DEFAULT_SETTINGS.view,
    animations: animations === null ? DEFAULT_SETTINGS.animations : animations === '1',
    sound: sound === null ? DEFAULT_SETTINGS.sound : sound !== '0',
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_SETTINGS.volume,
    zoom: ZOOMS.includes(zoom) ? zoom : DEFAULT_SETTINGS.zoom,
    grimoireLayout: GRIMOIRE_LAYOUTS.find((l) => LAYOUT_VALUES[l] === grimoireLayout) ?? DEFAULT_SETTINGS.grimoireLayout,
    grimoireOpen: grimoireOpen === null ? DEFAULT_SETTINGS.grimoireOpen : grimoireOpen === '1',
    tokenStats: readTokenStats(),
  };
}

export function saveSettings(settings: DisplaySettings): void {
  try {
    window.localStorage.setItem(KEYS.view, VIEW_VALUES[settings.view]);
    window.localStorage.setItem(KEYS.animations, settings.animations ? '1' : '0');
    window.localStorage.setItem(KEYS.sound, settings.sound ? '1' : '0');
    window.localStorage.setItem(KEYS.volume, String(settings.volume));
    window.localStorage.setItem(KEYS.zoom, String(settings.zoom));
    window.localStorage.setItem(KEYS.grimoireLayout, LAYOUT_VALUES[settings.grimoireLayout]);
    window.localStorage.setItem(KEYS.grimoireOpen, settings.grimoireOpen ? '1' : '0');
    const stats = Object.fromEntries((Object.keys(STAT_KEYS) as (keyof TokenStats)[]).map((k) => [STAT_KEYS[k], settings.tokenStats[k]]));
    window.localStorage.setItem(KEYS.tokenStats, JSON.stringify(stats));
  } catch {
    // Stockage indisponible (navigation privée…) : les réglages valent pour cette page seulement.
  }
}

/** Zoom suivant (+1) ou précédent (−1), borné aux niveaux disponibles. */
export function stepZoom(zoom: number, step: 1 | -1): number {
  const i = Math.max(0, ZOOMS.indexOf(zoom));
  return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + step))]!;
}

/** L'utilisateur a demandé moins d'animations dans son système. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
