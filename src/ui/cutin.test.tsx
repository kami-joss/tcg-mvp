import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CardId } from '../engine';
import { CARD_ART, CARD_ART_SHINY, CUT_IN_FRAME, artFit } from './art';
import { CutInOverlay } from './CutIn';
import { CUT_IN_ACTIONS } from './fx/cutIn';
import type { CutIn, CutInKind } from './fx/cutIn';

// Carte mise en avant (cut-in) : son rendu, sans navigateur (l'animation part au montage, dans le navigateur).

const cutIn = (cardId: CardId, kind: CutInKind, extra: Partial<CutIn> = {}): CutIn => ({
  kind,
  cardId,
  owner: 1,
  shiny: false,
  title: 'Titre',
  archetype: '',
  action: CUT_IN_ACTIONS[kind],
  effect: null,
  to: null,
  ...extra,
});
const render = (value: CutIn) => renderToStaticMarkup(<CutInOverlay cutIn={value} target={null} onDone={() => {}} />);

describe('carte mise en avant', () => {
  it('l’illustration, l’action, le nom, l’archétype et le nom de l’effet, aux couleurs de son joueur', () => {
    const html = render(
      cutIn('dragon-feu', 'effect', { owner: 2, title: 'Dragon élémentaire de feu', archetype: 'Dragons', effect: 'Déflagration' }),
    );
    expect(html).toContain('cutin--p2');
    expect(html).toContain('sheet--2');
    expect(html).toContain('jewel--monster');
    expect(html).toContain(CARD_ART['dragon-feu']!.src);
    expect(html).toContain('Effet actif');
    expect(html).toContain('Dragon élémentaire de feu');
    expect(html).toContain('Dragons');
    expect(html).toContain('Déflagration');
    expect(html).not.toContain('Brillante');
  });

  it('un sort, un terrain, une invocation : la pierre de leur type', () => {
    expect(render(cutIn('boule-de-feu', 'spell'))).toContain('jewel--spell');
    expect(render(cutIn('bastion', 'terrain'))).toContain('jewel--terrain');
    expect(render(cutIn('milicien', 'summon'))).toContain('Invocation');
  });

  it('carte sans illustration : l’icône de son type sur les rayures de son joueur', () => {
    expect(CARD_ART.eclaireur).toBeUndefined();
    const html = render(cutIn('eclaireur', 'attack'));
    expect(html).toContain('sheet__bg--plain sheet__bg--p1');
    expect(html).toContain('Attaque');
  });

  it('exemplaire brillant : illustration brillante, cadre doré, reflets et badge', () => {
    const html = render(cutIn('apprenti', 'attack', { shiny: true }));
    expect(html).toContain('cutin--shiny');
    expect(html).toContain('sheet--shiny');
    expect(html).toContain('★ Brillante');
    const plain = render(cutIn('archer-du-feu', 'attack', { shiny: true }));
    expect(CARD_ART_SHINY['archer-du-feu']).toBeUndefined();
    expect(plain).toContain('of__holo');
  });

  it('carte à overframe : le personnage sort du cadre, avec ses particules', () => {
    const html = render(cutIn('chronomancienne', 'effect'));
    expect(html).toContain('of of--anim');
    expect(html).toContain('of__pop');
    expect(html).toContain('of__particle');
    expect(html).toContain('sheet--of');
  });

  it('l’illustration couvre la carte, sans vide en haut ni sur les côtés ; le vide en bas (flou, sous le nom) reste court', () => {
    for (const art of Object.values(CARD_ART)) {
      const fit = artFit(art!, CUT_IN_FRAME);
      expect(fit.y).toBeLessThanOrEqual(0);
      expect(fit.x + fit.size).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(fit.edge, art!.src).toBeGreaterThan(75);
    }
  });
});
