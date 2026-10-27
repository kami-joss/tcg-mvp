import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../engine';
import type { CardId, GameState } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { CARD_ART, CARD_ART_SHINY, cardArtFor } from './art';
import { Grimoire } from './Grimoire';
import { HoverSheet, SheetPreview, overframeFit, sheetPlacement } from './HoverSheet';
import { POP_FADE, RISE, popMask } from './Overframe';
import { MAX_HEADROOM, OVERFRAMES, PARTICLES, breathOrigin, hasShinyImages, overframeLook, overframeUrl } from './overframes';
import { getSheet } from './sheet';

// Overframes et exemplaires brillants (handoff overframe v1 et v2, handoff V11 lot 12 §4).

const glace = OVERFRAMES['archer-de-glace']!;
/** L'entrée `archer_feu` du kit : c'est l'Apprenti - Sorciers du feu. */
const feu = OVERFRAMES.apprenti!;
const chrono = OVERFRAMES.chronomancienne!;
const maitre = OVERFRAMES['maitre-des-heures']!;

const withGrimoire = (grimoire: CardId[], shiny: CardId[] = []): GameState =>
  gameWith([], { players: { 1: { mana: 10, grimoire, shiny } } });
const cardSheet = (cardId: CardId, shiny: CardId[] = []) =>
  getSheet(getPlayerView(withGrimoire([cardId, 'chevalier'], shiny), 1), { kind: 'card', cardId })!;

describe('données des overframes', () => {
  it('Archer de glace, Apprenti - Sorciers du feu, Chronomancienne, Maître des heures ; l’Archer du feu n’en a pas', () => {
    expect([glace, feu, chrono, maitre].map((def) => def.headroom)).toEqual([118, 152, 186, 162]);
    expect(OVERFRAMES['archer-du-feu']).toBeUndefined();
    expect(feu.parts.map((part) => part.anim)).toEqual(['swayL', 'swayR', 'blink']);
    expect(chrono.parts.map((part) => part.anim)).toEqual(['hairWind', 'blink']);
    expect(maitre.parts.map((part) => part.anim)).toEqual(['hairWind', 'blink']);
    expect([glace, feu, chrono, maitre].map((def) => def.glow.layer)).toEqual(['inside', 'outside', 'outside', 'inside']);
    expect([chrono.particles, maitre.particles]).toEqual(['motesAmethyst', 'motesGold']);
    expect([chrono.shine?.opacity, maitre.shine?.opacity]).toEqual([0.75, 0.7]);
    expect(chrono.dial).toBeNull();
    expect(maitre.dial).toMatchObject({ x: 161.4, y: 32.7, size: 80, outer: { anim: 'tick' }, inner: { anim: 'spinBack', inset: 7 } });
  });

  it('couleurs : brillante propre (Apprenti) ou générique (lot 2 : couleurs normales)', () => {
    expect(overframeLook(feu, true)).toBe(feu.looks.shiny);
    expect(overframeLook(chrono, true)).toBe(chrono.looks.normal);
    expect(overframeLook(maitre, false).glowStop).toBe('55%');
  });

  it('respiration : l’ancre de la carte dans le repère de chaque calque (art, pop et bouts restent superposés)', () => {
    expect(breathOrigin(glace, glace.art)).toBe('167.0px 276.0px');
    expect(breathOrigin(glace, glace.pop)).toBe('114.5px 262.0px');
    expect(breathOrigin(feu, feu.art)).toBe('240.0px 393.6px');
    expect(breathOrigin(feu, feu.pop)).toBe('198.0px 299.1px');
    expect(breathOrigin(feu, feu.sides!)).toBe('198.0px 150.0px');
    expect(breathOrigin(chrono, chrono.art)).toBe('203.0px 350.0px');
    expect(breathOrigin(chrono, chrono.pop)).toBe('154.6px 322.8px');
    expect(breathOrigin(maitre, maitre.art)).toBe('220.0px 365.0px');
    expect(breathOrigin(maitre, maitre.pop)).toBe('161.2px 298.6px');
  });

  it('images brillantes : la version _shiny si elle existe, sinon l’image normale (shiny générique)', () => {
    expect(hasShinyImages(glace)).toBe(true);
    expect(hasShinyImages(chrono)).toBe(false);
    expect(overframeUrl('archer_glace.jpg', true)).toMatch(/archer_glace_shiny\.jpg$/);
    expect(overframeUrl('archer_glace.jpg', false)).toMatch(/archer_glace\.jpg$/);
    expect(overframeUrl('inconnue.png', true)).toBe('inconnue.png');
  });

  it('particules tirées une fois : neige 16 + 6, braises 14 + 6, étincelles 14 + 6 (toute brillante), poussière 14 + 8', () => {
    expect([PARTICLES.snow.back.length, PARTICLES.snow.front.length]).toEqual([16, 6]);
    expect([PARTICLES.embers.back.length, PARTICLES.embers.front.length]).toEqual([14, 6]);
    expect([PARTICLES.sparks.back.length, PARTICLES.sparks.front.length]).toEqual([14, 6]);
    expect([PARTICLES.motesGold.back.length, PARTICLES.motesGold.front.length]).toEqual([14, 8]);
    expect(PARTICLES.embers.back[0]!.style).toMatchObject({ '--dy': '-540px', top: '505px' });
    expect(PARTICLES.sparks.front[0]!.style).toMatchObject({ '--rot': '180deg' });
  });

  it('poussière d’or : même tirage que la maquette (graines 47 et 31), une étoile sur 4, une améthyste sur 3', () => {
    const gold = PARTICLES.motesGold.back;
    expect(gold[0]!.style).toMatchObject({ clipPath: expect.stringContaining('polygon'), '--rot': '180deg' });
    expect(gold[1]!.style).toMatchObject({ borderRadius: '50%', boxShadow: expect.stringContaining('0 0 5px 1px') });
    expect(PARTICLES.motesAmethyst.back[0]!.style).toMatchObject({ '--rot': '0deg' });
    const hue = (style: object) => Number(/oklch\(0\.95 0\.1 (\d+)\)/.exec(String((style as { background: string }).background))![1]);
    expect(hue(PARTICLES.motesAmethyst.back[2]!.style)).toBeGreaterThanOrEqual(300);
    expect(hue(PARTICLES.motesAmethyst.back[1]!.style)).toBeLessThanOrEqual(95);
    for (const particle of gold) expect(parseFloat(String(particle.style['--dy' as keyof typeof particle.style]))).toBeLessThan(0);
  });

  it('illustrations : l’Archer du feu retrouve la sienne ; l’Apprenti - Sorciers du feu a sa version brillante', () => {
    expect(CARD_ART['archer-du-feu']).toMatchObject({ w: 572, h: 1024, eye: [50, 14.1], face: 25 });
    expect(cardArtFor('apprenti', true)!.src).toBe(CARD_ART_SHINY.apprenti);
    expect(CARD_ART_SHINY['archer-du-feu']).toBeUndefined();
    expect(cardArtFor('archer-de-glace', true)!.src).toBe(CARD_ART_SHINY['archer-de-glace']);
    expect(cardArtFor('archer-de-glace', false)!.src).toBe(CARD_ART['archer-de-glace']!.src);
    expect(cardArtFor('chevalier', true)).toBe(CARD_ART.chevalier);
  });
});

describe('fiche à overframe', () => {
  it('scène : débordement réservé, cadre, pop et pièces, bouts, lueur extérieure, particules devant et derrière', () => {
    const html = renderToStaticMarkup(<HoverSheet sheet={cardSheet('apprenti')} animated onOpen={() => {}} />);
    expect(html).toContain('class="of of--anim of--clickable"');
    expect(html).toContain('padding-top:152px');
    expect(html).toContain('sheet--of');
    expect(html).not.toContain('sheet--shiny');
    expect(html.match(/of__part of__part--/g)).toHaveLength(3);
    expect(html).toContain('of__sides');
    expect(html).toContain('of__glow of__glow--outside');
    expect(html.match(/of__particle/g)).toHaveLength(20);
    expect(html).toContain('feu2_pop.png');
    expect(html).not.toContain('_shiny');
  });

  it('exemplaire brillant : images _shiny, holo, reflet arc-en-ciel, étincelles, badge « ★ Brillante »', () => {
    const sheet = cardSheet('archer-de-glace', ['archer-de-glace']);
    expect(sheet.shiny).toBe(true);
    const html = renderToStaticMarkup(<HoverSheet sheet={sheet} animated />);
    expect(html).toContain('sheet--of sheet--shiny');
    expect(html).toContain('archer_glace_shiny.jpg');
    expect(html).toContain('archer_glace_buste_shiny.png');
    expect(html).toContain('of__holo');
    expect(html).toContain('of__sweep of__sweep--shiny');
    expect(html).toContain('<span class="sheet__shiny">★ Brillante</span>');
    expect(html).toContain('--rot:180deg');
  });

  it('sans liseré en haut : l’illustration continue au-dessus du cadre en s’effaçant ; le bas du pop s’efface aussi', () => {
    // Le pop de la Chronomancienne (x −14,6, y −172,8) est coupé au haut du cadre : fondu de 160,8 à 172,8 px dans son
    // repère ; ses colonnes hors du cadre (avant 14,6 px, après 294,6 px) restent entières.
    expect(POP_FADE).toBe(12);
    expect(popMask(chrono)).toBe(
      'linear-gradient(180deg, #000 160.8px, transparent 172.8px), linear-gradient(90deg, #000 14.6px, transparent 14.6px, transparent 294.6px, #000 294.6px)',
    );
    const html = renderToStaticMarkup(<HoverSheet sheet={cardSheet('chronomancienne')} animated />);
    expect(html).toMatch(new RegExp(`<div class="of__rise" style="top:-${RISE}px;height:${RISE + 6}px;mask-image:linear-gradient\\(180deg, transparent, rgb\\(0 0 0 / 0.12\\) 8px, rgb\\(0 0 0 / 0.38\\) 16px, rgb\\(0 0 0 / 0.75\\) 24px, #000 32px\\)`));
    expect(html).toMatch(new RegExp(`<div class="of__art of__breath"[^>]*top:${-200 + RISE}px`));
    expect(html).toContain('class="of__pop-img"');
  });

  it('Maître des heures : reflet dans l’illustration, cadran à deux anneaux, mèches, poussière d’or, reflet en 4,2 s', () => {
    const html = renderToStaticMarkup(<HoverSheet sheet={cardSheet('maitre-des-heures')} animated />);
    expect(html).toContain('padding-top:162px');
    expect(html).toMatch(/<div class="of__art of__breath"[^>]*><div class="of__shine"[^>]*temporel\.jpg/);
    expect(html).toContain('mask-size:300% 100%');
    expect(html).toContain('class="of__dial"');
    expect(html).toContain('of__ring of__ring--tick');
    expect(html).toContain('of__ring of__ring--spinBack');
    expect(html).toContain('of__part of__part--hairWind');
    expect(html).toContain('transform-origin:170.1px 89.04px');
    expect(html).toContain('animation-duration:4200ms');
    expect(html).toContain('oklch(0.8 0.14 75 / .25) 55%');
    expect(html.match(/of__particle/g)).toHaveLength(22);
  });

  it('Chronomancienne brillante : shiny générique (images normales, étincelles, holo), reflet métallique gardé', () => {
    const sheet = cardSheet('chronomancienne', ['chronomancienne']);
    const html = renderToStaticMarkup(<HoverSheet sheet={sheet} animated />);
    expect(html).toContain('sheet--of sheet--shiny');
    expect(html).toContain('chrono.jpg');
    expect(html).not.toMatch(/_shiny\.(jpg|png)/);
    expect(html).toContain('of__holo');
    expect(html).toContain('of__shine');
    expect(html).toContain('oklch(0.9 0.1 310 / .7)');
    expect(html).toContain('--rot:180deg');
    expect(html.match(/of__particle/g)).toHaveLength(20);
    expect(html).toContain('★ Brillante');
  });

  it('animations coupées : rendu fixe, sans particules', () => {
    const html = renderToStaticMarkup(<HoverSheet sheet={cardSheet('archer-de-glace')} />);
    expect(html).toContain('class="of"');
    expect(html).not.toContain('of__particle');
    expect(html).toContain('of__pop');
  });

  it('carte sans overframe mais brillante : shiny générique sur son illustration habituelle', () => {
    const html = renderToStaticMarkup(<HoverSheet sheet={cardSheet('chevalier', ['chevalier'])} animated />);
    expect(html).not.toMatch(/class="of[ "]/);
    expect(html).toContain('sheet--shiny');
    expect(html).toContain('of__holo');
    expect(html).toContain('★ Brillante');
  });

  it('unité brillante sur le plateau : sa fiche aussi', () => {
    const state = gameWith([{ monster: 'archer-du-feu', owner: 1, at: at(5, 4) }]);
    const shiny = { ...state, units: { u1: { ...state.units.u1!, shiny: true as const } } };
    expect(getSheet(getPlayerView(shiny, 2), { kind: 'cell', pos: at(5, 4) })!.shiny).toBe(true);
    expect(getSheet(getPlayerView(state, 2), { kind: 'cell', pos: at(5, 4) })!.shiny).toBe(false);
  });

  it('le haut du cadre toujours au même endroit : la place du plus grand débordement (186 px) au-dessus de chaque fiche', () => {
    expect(MAX_HEADROOM).toBe(186);
    expect(sheetPlacement(undefined, 1)).toEqual({ paddingTop: 186, '--sheet-fit': 1 });
    expect(sheetPlacement(chrono, 1)).toEqual({ paddingTop: 0, '--sheet-fit': 1 });
    expect(sheetPlacement(glace, 1)).toMatchObject({ paddingTop: 68 });
    // Fenêtre basse : même réduction pour toutes les fiches, les cadres restent alignés et de même taille.
    expect(sheetPlacement(undefined, 0.8)).toEqual({ paddingTop: 148.8, '--sheet-fit': 0.8 });
    expect(sheetPlacement(feu, 0.8)).toMatchObject({ paddingTop: 27.2 });
    expect(sheetPlacement(feu, 0.8).paddingTop as number + feu.headroom * 0.8).toBeCloseTo(148.8, 5);
  });

  it('fenêtre basse : la fiche à overframe est réduite pour laisser 84 px au journal (0,6 au moins)', () => {
    expect(overframeFit(Infinity, 186)).toBe(1);
    expect(overframeFit(900, 186)).toBe(1);
    expect(overframeFit(722, 186)).toBeCloseTo((722 - 84) / 684, 5);
    expect(overframeFit(300, 186)).toBe(0.6);
  });

  it('aperçu plein écran : centré, à l’échelle de la fenêtre (1,8 au plus)', () => {
    const html = renderToStaticMarkup(<SheetPreview sheet={cardSheet('apprenti')} animated={false} onClose={() => {}} />);
    // Fenêtre de 900 px par défaut hors navigateur : (900 − 80) / (498 + 152).
    expect(html).toContain('transform:translate(-50%, -50%) scale(1.262)');
    expect(html).toContain('sheet-preview__backdrop');
  });
});

describe('tuiles du grimoire', () => {
  const tiles = (shiny: CardId[]) =>
    renderToStaticMarkup(
      <Grimoire
        view={getPlayerView(withGrimoire(['archer-de-glace', 'archer-de-glace', 'chevalier'], shiny), 1)}
        selectedCard={null}
        layout="grid2"
        onLayout={() => {}}
        onCardClick={() => {}}
        onCardHover={() => {}}
        animated
      />,
    );

  it('overframe : pas de débordement dans la grille ; brillante : cadre doré, holo, reflet, « ★ », illustration brillante', () => {
    const html = tiles(['archer-de-glace']);
    expect(html).toMatch(/class="tile tile--monster tile--card tile--playable tile--shiny tile--of of--anim"/);
    expect(html).toContain('<span class="tile__star" title="Exemplaire brillant">★</span>');
    expect(html).toContain('archer-de-glace-shiny');
    expect(html).toContain('of__holo');
    expect(html).not.toContain('of__pop');
  });

  it('sans exemplaire brillant : ni ★ ni reflets', () => {
    const html = tiles([]);
    expect(html).not.toContain('tile--shiny');
    expect(html).not.toContain('tile__star');
    expect(html).not.toContain('of__holo');
  });
});
