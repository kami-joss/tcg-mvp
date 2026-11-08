import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DANGER_HINT, ZoneLegend } from './ZoneLegend';

// Légende des zones (handoff « zones ») : trois lignes, le cas superposé, l'aide au survol du danger, deux boutons.

const render = (props: Partial<Parameters<typeof ZoneLegend>[0]> = {}) =>
  renderToStaticMarkup(<ZoneLegend danger path hint={false} onToggleDanger={() => {}} onTogglePath={() => {}} {...props} />);

describe('légende des zones', () => {
  it('trois lignes et la lecture du cas superposé', () => {
    const html = render();
    expect(html).toContain('Là où je peux aller');
    expect(html).toContain('Là où je peux attaquer');
    expect(html).toContain('Zone de danger ennemie (aller ou taper)');
    expect(html).toContain('je peux y aller, mais je m’expose');
    expect(html).not.toContain(DANGER_HINT);
  });

  it('au survol d’une case de danger : « Zone de danger : un ennemi peut vous atteindre ici. »', () => {
    expect(render({ hint: true })).toContain('Zone de danger : un ennemi peut vous atteindre ici.');
  });

  it('boutons « Menace ennemie » et « Chemin au survol », enfoncés selon les réglages', () => {
    const on = render();
    expect(on).toMatch(/aria-pressed="true"[^>]*>Menace ennemie/);
    expect(on).toMatch(/aria-pressed="true"[^>]*>Chemin au survol/);
    const off = render({ danger: false, path: false });
    expect(off).toMatch(/aria-pressed="false"[^>]*>Menace ennemie/);
    expect(off).toMatch(/aria-pressed="false"[^>]*>Chemin au survol/);
  });
});
