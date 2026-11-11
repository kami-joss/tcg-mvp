import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import { at, gameWith, withStatus } from '../engine/test-utils';
import { TIP_WIDTH, UnitTooltip, tipPosition, turnsShort } from './UnitTooltip';
import { getTipAt } from './unitTip';

describe('infobulle d’un jeton : rendu', () => {
  it('nom, moment, lignes d’état, statuts avec leurs tours, effets en cours en phrases', () => {
    const state = withStatus(
      gameWith([
        { monster: 'chevalier', owner: 1, at: at(8, 1) },
        { monster: 'golem', owner: 2, at: at(8, 2) },
        { terrain: 'bastion', owner: 1, at: at(5, 4) },
        { monster: 'milicien', owner: 1, at: at(5, 4) },
      ]),
      'u1',
      'burn',
      1,
      2,
    );
    const view = getPlayerView(state, 1);
    const html = renderToStaticMarkup(<UnitTooltip tip={getTipAt(view, at(8, 1))!} />);
    expect(html).toContain('role="tooltip"');
    expect(html).toMatch(/unit-tip__dot--p1.*<b>Chevalier<\/b>.*ton tour/);
    expect(html).toMatch(/<b>Attaque<\/b><span class="unit-tip__state tone--ok">.*Disponible/);
    // Ses stats du moment, sous son nom.
    expect(html).toMatch(/unit-tip__head.*class="unit-tip__stats".*<strong>3<\/strong>.*ATK.*<strong>4\/4<\/strong>.*PV.*Pas rest\..*Portée.*<b>Attaque/);
    // Son tour : celui-ci compte (« jusqu’à la fin de ce tour et de ses 2 prochains »).
    expect(html).toMatch(/class="chip chip--burn">.*Burn 1<small class="unit-tip__turns"> · 3 tours<\/small>/);
    // La zone tenue : la phrase dit déjà son nom, il n'est pas répété devant.
    const held = renderToStaticMarkup(<UnitTooltip tip={getTipAt(view, at(5, 4))!} />);
    expect(held).toContain('Tient Forge');
    expect(held).not.toContain('<b>Forge</b>');
  });

  it('tours d’un statut en court ; place à droite de la case, sinon à gauche, dans la fenêtre', () => {
    expect([0, 1, 3].map(turnsShort)).toEqual(['jusqu’à son tour', '1 tour', '3 tours']);
    const viewport = { width: 1280, height: 800 };
    expect(tipPosition({ left: 400, right: 470, top: 300, height: 40 }, viewport)).toEqual({ left: 480, top: 248 });
    expect(tipPosition({ left: 1100, right: 1170, top: 300, height: 40 }, viewport).left).toBe(1100 - 10 - TIP_WIDTH);
    expect(tipPosition({ left: 400, right: 470, top: 0, height: 40 }, viewport).top).toBe(10);
  });
});
