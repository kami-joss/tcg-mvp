import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Legend } from './Legend';
import { OptionsMenu } from './OptionsMenu';
import { DEFAULT_SETTINGS } from './settings';
import { WHEEL_STEP_PX, wheelZoom, zoomKey } from './zoomShortcuts';

// Raccourcis du zoom du plateau : + et − au clavier, 0 pour la taille ajustée, Ctrl ou ⌘ + molette (et pincement).

const key = (key: string, code = '', mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  zoomKey({ key, code, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe('au clavier', () => {
  it('+ zoome, − dézoome, 0 revient à la taille ajustée', () => {
    expect(key('+', 'Equal')).toBe(1);
    expect(key('-', 'Minus')).toBe(-1);
    expect(key('0', 'Digit0')).toBe('reset');
  });

  it('en AZERTY : « = » (la touche du +) zoome, la touche 0 (« à ») revient à 100 % ; le pavé numérique aussi', () => {
    expect(key('=', 'Slash')).toBe(1);
    expect(key('à', 'Digit0')).toBe('reset');
    expect(key('+', 'NumpadAdd')).toBe(1);
    expect(key('-', 'NumpadSubtract')).toBe(-1);
    expect(key('0', 'Numpad0')).toBe('reset');
  });

  it('avec Ctrl, ⌘ ou Alt : rien (Ctrl/⌘ + et − restent le zoom du navigateur) ; les autres touches non plus', () => {
    expect(key('+', 'Equal', { ctrlKey: true })).toBeNull();
    expect(key('-', 'Minus', { metaKey: true })).toBeNull();
    expect(key('0', 'Digit0', { altKey: true })).toBeNull();
    expect(key('1', 'Digit1')).toBeNull();
    expect(key('Escape', 'Escape')).toBeNull();
  });
});

describe('à la molette, avec Ctrl ou ⌘', () => {
  it('un cran de molette fait un cran de zoom : vers le haut zoome, vers le bas dézoome', () => {
    expect(wheelZoom(0, -100, 0)).toEqual({ accumulated: 0, step: 1 });
    expect(wheelZoom(0, 100, 0)).toEqual({ accumulated: 0, step: -1 });
    expect(wheelZoom(0, -3, 1)).toEqual({ accumulated: 0, step: 1 });
  });

  it('un pincement envoie de petits pas : ils s’additionnent jusqu’à un cran ; un changement de sens repart de zéro', () => {
    let state = { accumulated: 0, step: 0 as 1 | -1 | 0 };
    const steps: number[] = [];
    for (let i = 0; i < 10; i++) {
      state = wheelZoom(state.accumulated, -8, 0);
      steps.push(state.step);
    }
    expect(steps.filter((s) => s === 1)).toHaveLength(Math.floor(80 / WHEEL_STEP_PX));
    expect(wheelZoom(-50, 8, 0)).toEqual({ accumulated: 8, step: 0 });
  });
});

describe('où on les apprend', () => {
  it('l’aide les liste ; les boutons du zoom des options les rappellent', () => {
    expect(renderToStaticMarkup(<Legend onClose={() => {}} mode="normal" />)).toContain('+ et − : zoomer et dézoomer (ou Ctrl / ⌘ + molette, ou pincer le pavé tactile) · 0 : taille ajustée.');
    const options = renderToStaticMarkup(
      <OptionsMenu settings={DEFAULT_SETTINGS} boardView="iso" isoAvailable tiltAvailable onChange={() => {}} onSound={() => {}} confirmHome onHome={() => {}} initialOpen />,
    );
    expect(options).toContain('title="Zoomer (+)"');
    expect(options).toContain('title="Dézoomer (−)"');
    expect(options).toContain('title="Revenir à la taille ajustée (0)"');
  });
});
