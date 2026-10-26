import { describe, expect, it } from 'vitest';
import { CARD_ART, SHEET_FRAME, TILE_FRAME, TOKEN_STEP_BACK, artFit, fitBackground, tokenFit } from './art';
import type { CardArt } from './art';

// Illustrations de n'importe quel format, cadrées sur les yeux (handoff V8, lot 10).

const image = (w: number, h: number, eye: [number, number], face = 25): CardArt => ({ src: 'x.jpg', w, h, eye, face });

/** Hauteur des yeux dans la boîte, en largeurs de boîte. */
const eyeY = (art: CardArt, fit: { y: number; size: number }) => fit.y + (art.eye[1] / 100) * fit.size * (art.h / art.w);

describe('cadrage sur les yeux', () => {
  // Critère d'acceptation du lot 10 : deux images de formats différents, les yeux dans le bandeau clair de la fiche
  // (112 px sur 280) et en haut de la tuile du grimoire.
  const tall = image(572, 1024, [50, 37]);
  const film = image(1080, 1920, [50, 12]);

  it('fiche : les yeux dans le bandeau clair, quel que soit le format', () => {
    for (const art of [tall, film]) {
      const y = eyeY(art, artFit(art, SHEET_FRAME)) * 280;
      expect(y, `${art.w}×${art.h}`).toBeGreaterThan(20);
      expect(y, `${art.w}×${art.h}`).toBeLessThan(112);
    }
  });

  it('tuile du grimoire : les yeux dans son tiers haut', () => {
    for (const art of [tall, film]) expect(eyeY(art, artFit(art, TILE_FRAME))).toBeLessThan(TILE_FRAME.ratio / 3);
  });

  it('jamais de vide en haut ni sur les côtés ; l’image couvre au moins la part demandée de la hauteur', () => {
    for (const art of [tall, film, image(1024, 559, [10, 90]), image(1024, 1024, [95, 5]), image(687, 1024, [50, 50])]) {
      for (const frame of [SHEET_FRAME, TILE_FRAME]) {
        const fit = artFit(art, frame);
        expect(fit.y).toBeLessThanOrEqual(0);
        expect(fit.x).toBeLessThanOrEqual(0);
        expect(fit.x + fit.size).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(fit.size * (art.h / art.w)).toBeGreaterThanOrEqual(frame.cover * frame.ratio - 1e-9);
      }
    }
  });

  it('une image paysage dans la fiche laisse du vide en bas (comblé par un flou) ; une 9:16, non', () => {
    expect(artFit(image(1024, 559, [50, 20]), SHEET_FRAME).edge).toBeLessThan(99.5);
    expect(artFit(film, SHEET_FRAME).edge).toBeGreaterThanOrEqual(99.5);
  });

  it('jeton : il montre `face` % de la largeur (avec un peu de recul), les yeux au centre, au quart de sa hauteur', () => {
    const art = image(1000, 2000, [40, 10], 20);
    const fit = tokenFit(art);
    expect(fit.size).toBeCloseTo(100 / (20 * TOKEN_STEP_BACK));
    expect(fit.x + 0.4 * fit.size).toBeCloseTo(0.5);
    expect(eyeY(art, fit)).toBeCloseTo(0.25);
  });

  it('jeton : l’image couvre tout le rond, même large et peu zoomée, ou les yeux près d’un bord', () => {
    for (const art of [image(1024, 559, [50, 45], 45), image(1024, 559, [2, 2], 30), image(960, 960, [98, 95], 70)]) {
      const fit = tokenFit(art);
      expect(fit.x).toBeLessThanOrEqual(0);
      expect(fit.y).toBeLessThanOrEqual(0);
      expect(fit.x + fit.size).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(fit.edge).toBeGreaterThanOrEqual(100 - 1e-6);
    }
  });

  it('fond CSS en positions absolues : cqw pour un conteneur, px pour une largeur connue', () => {
    const art = image(1000, 1000, [50, 50], 50);
    expect(fitBackground(art, { x: -0.5, y: -0.25, size: 2, edge: 0 }, 'cqw')).toBe('url("x.jpg") -50cqw -25cqw / 200cqw auto no-repeat');
    expect(fitBackground(art, { x: -0.123456, y: 0, size: 1, edge: 0 }, 280)).toBe('url("x.jpg") -34.57px 0px / 280px auto no-repeat');
  });
});

describe('données des illustrations', () => {
  it('yeux dans l’image et zoom du jeton plausible, pour chaque carte illustrée', () => {
    for (const [id, art] of Object.entries(CARD_ART)) {
      expect(art.w, id).toBeGreaterThan(0);
      expect(art.h, id).toBeGreaterThan(0);
      for (const v of art.eye) expect(v, id).toBeGreaterThanOrEqual(0);
      for (const v of art.eye) expect(v, id).toBeLessThanOrEqual(100);
      expect(art.face, id).toBeGreaterThan(5);
      expect(art.face, id).toBeLessThanOrEqual(100);
    }
  });

  it('l’Archer de glace du handoff, au format 9:16', () => {
    expect(CARD_ART['archer-de-glace']).toMatchObject({ w: 576, h: 1024, eye: [44.5, 12.3], face: 24 });
  });
});
