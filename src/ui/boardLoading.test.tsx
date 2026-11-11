import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_15, createGame, getPlayerView } from '../engine';
import {
  BOARD_DRAWN,
  LOADER_DELAY_MS,
  LOADER_HINT_MS,
  LOADER_MAX_MS,
  WORLD_GRACE_MS,
  boardDrawn,
  loadingDone,
  loadingSteps,
} from './boardLoading';
import type { BoardProgress } from './boardLoading';
import { BoardLoadingScreen } from './BoardLoadingScreen';
import type { BoardLoading } from './BoardLoadingScreen';
import { GameScreen } from './GameScreen';
import { DEFAULT_SETUP } from './session';

// Écran de chargement du plateau : il couvre l'écran de jeu jusqu'à ce que le plateau soit dessiné (moteur, sol peint,
// cases et unités), attend un peu le décor extérieur, puis se lève.

const start: BoardProgress = { engine: 'loading', ground: 'none', worldExpected: true, pieces: false };
const engine: BoardProgress = { ...start, engine: 'ready' };
const board: BoardProgress = { ...engine, ground: 'board', pieces: true };
const world: BoardProgress = { ...board, ground: 'world' };

describe('les étapes du chargement', () => {
  it('moteur, sol, pièces, puis le décor autour du plateau s’il en a un', () => {
    expect(loadingSteps(start)).toEqual({ step: 'engine', done: 0, total: 4 });
    expect(loadingSteps(engine)).toEqual({ step: 'ground', done: 1, total: 4 });
    expect(loadingSteps({ ...engine, ground: 'board' })).toEqual({ step: 'pieces', done: 2, total: 4 });
    expect(loadingSteps(board)).toEqual({ step: 'world', done: 3, total: 4 });
    expect(loadingSteps(world)).toEqual({ step: null, done: 4, total: 4 });
    expect(loadingSteps({ ...board, worldExpected: false })).toEqual({ step: null, done: 3, total: 3 });
  });

  it('le plateau est dessiné avec son sol peint, ses cases et ses unités (le vert uni d’attente ne compte pas)', () => {
    expect(boardDrawn({ ...engine, pieces: true })).toBe(false);
    expect(boardDrawn({ ...engine, ground: 'board' })).toBe(false);
    expect(boardDrawn(board)).toBe(true);
    expect(boardDrawn(BOARD_DRAWN)).toBe(true);
  });
});

describe('quand l’écran se lève', () => {
  it('tout est là : tout de suite', () => {
    expect(loadingDone(world, 0, 300)).toBe(true);
    expect(loadingDone({ ...board, worldExpected: false }, 0, 300)).toBe(true);
    expect(loadingDone(BOARD_DRAWN, 0, 0)).toBe(true);
  });

  it('le plateau dessiné sans son décor extérieur : on l’attend encore un peu, puis il viendra pendant la partie', () => {
    expect(loadingDone(board, 0, 500)).toBe(false);
    expect(loadingDone(board, WORLD_GRACE_MS - 1, 2000)).toBe(false);
    expect(loadingDone(board, WORLD_GRACE_MS, 2000)).toBe(true);
  });

  it('sans moteur de dessin (WebGL), rien ne viendra : il se lève', () => {
    expect(loadingDone({ ...start, engine: 'failed' }, 0, 10)).toBe(true);
  });

  it('pas encore dessiné : il reste ; le garde-fou le lève quoi qu’il arrive', () => {
    expect(loadingDone(null, null, 5000)).toBe(false);
    expect(loadingDone(engine, null, LOADER_MAX_MS - 1)).toBe(false);
    expect(loadingDone(engine, null, LOADER_MAX_MS)).toBe(true);
    expect(loadingDone(null, null, LOADER_MAX_MS)).toBe(true);
  });
});

describe('l’écran', () => {
  const screen = (loading: BoardLoading, progress: BoardProgress | null, animated = true) =>
    renderToStaticMarkup(<BoardLoadingScreen loading={loading} progress={progress} boardName="Champ de bataille (15 × 15)" animated={animated} />);

  it('d’abord un fond seul : un plateau prêt aussitôt ne fait pas clignoter de texte', () => {
    const html = screen({ done: false, elapsed: 0, doneAt: null }, engine);
    expect(html).toContain('class="board-loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('Champ de bataille');
  });

  it('puis le nom de la carte, la barre des étapes et l’étape en cours', () => {
    const html = screen({ done: false, elapsed: LOADER_DELAY_MS, doneAt: null }, engine);
    expect(html).toContain('Chargement du plateau');
    expect(html).toContain('<h1 class="board-loading__title">Champ de bataille (15 × 15)</h1>');
    expect(html).toContain('role="progressbar" aria-label="Chargement du plateau" aria-valuemin="0" aria-valuemax="4" aria-valuenow="1"');
    expect(html).toContain('Peinture du sol…');
    expect(html).not.toContain('La première fois sur un appareil');
  });

  it('un sol qui se peint longtemps : l’explication du premier chargement', () => {
    expect(screen({ done: false, elapsed: LOADER_HINT_MS, doneAt: null }, engine)).toContain('La première fois sur un appareil, le sol du plateau se peint');
    // Le sol est là, les pièces se placent : pas d'explication.
    expect(screen({ done: false, elapsed: LOADER_HINT_MS, doneAt: null }, { ...engine, ground: 'board' })).not.toContain('La première fois');
  });

  it('levé : il s’efface en fondu ; sans animation, ou levé avant d’être vu, il disparaît', () => {
    expect(screen({ done: true, elapsed: 2000, doneAt: 2000 }, world)).toContain('class="board-loading is-done"');
    expect(screen({ done: true, elapsed: 2000, doneAt: 2000 }, world, false)).toBe('');
    expect(screen({ done: true, elapsed: 0, doneAt: 5 }, BOARD_DRAWN)).toBe('');
  });

  it('l’écran de jeu commence couvert, tant que le plateau ne s’est pas dit dessiné', () => {
    const game = createGame(BATTLEFIELD_15);
    const html = renderToStaticMarkup(
      <GameScreen view={getPlayerView(game, 1)} before={null} log={[]} onAction={() => {}} setup={{ ...DEFAULT_SETUP, board: BATTLEFIELD_15 }} onRestart={() => {}} onHome={() => {}} />,
    );
    expect(html).toContain('class="board-loading"');
  });
});
