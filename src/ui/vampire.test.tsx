import { describe, expect, it } from 'vitest';
import { DECKS, applyAction, getCard, getPlayerView } from '../engine';
import type { Action, CardId, GameState, MonsterCard, SpellCard } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { CARD_ART, CARD_ART_SHINY, SHEET_FRAME, TILE_FRAME, artFit, cardArtFor } from './art';
import { getBubble } from './bubble';
import { cardEffectLine, splitCardName } from './cardText';
import { describeAction } from './log';
import { abilityRules, passiveRules, plainRules, rulesSegments } from './rulesText';
import { MAX_HEADROOM, OVERFRAMES, PARTICLES, hasShinyImages, overframeLook, overframeUrl } from './overframes';
import { getSheet } from './sheet';

// Deck Vampire dans l'interface : textes des cartes (Soif, absorbe, se transforme), bulle, journal, fiche.

const monster = (id: CardId) => getCard(id) as MonsterCard;
const spell = (id: CardId) => getCard(id) as SpellCard;
const view = (state: GameState) => getPlayerView(state, state.activePlayer);
const MANA = { players: { 1: { mana: 10 } } };
const transform: Action = { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } };

describe('textes des cartes du deck Vampire', () => {
  it('les mots retenus : Soif, absorbe, se transforme ; jamais « vole » ni « sacrifie »', () => {
    expect(passiveRules(monster('delta')).map((item) => [item.name, plainRules(item.text)])).toEqual([['Soif 1', 'À l’attaque, il récupère 1 PV.']]);
    expect(plainRules(abilityRules(monster('vladimir').activated[0]!))).toBe('Absorbe 1 PV à chaque ennemi adjacent.');
    expect(plainRules(abilityRules(monster('zoldik').activated[0]!))).toBe(
      'Absorbe tous les PV d’un ennemi adjacent, sauf 1. Il ne peut plus attaquer ce tour.',
    );
    expect(plainRules(abilityRules(monster('emma').activated[0]!))).toBe(
      'Se transforme en chauve-souris (ATK 1, PV 1, mobilité 8, portée 1). Sans limite par tour.',
    );
    expect(plainRules(abilityRules(monster('emma-chauve-souris').activated[0]!))).toBe('Se transforme en Emma. Sans limite par tour.');
    expect(plainRules(abilityRules(spell('appel-du-sang').ability))).toBe('Donne +2 mobilité à tous tes vampires ce tour.');
    const sacrifice = plainRules(abilityRules(spell('sacrifice-sanguinaire').ability));
    expect(sacrifice).toBe('Un allié vampire perd tous ses PV sauf 1 et gagne +1 ATK par PV perdu ce tour.');
    expect(sacrifice).not.toMatch(/sacrifi/);
    // « absorbe » et « se transforme » sont des mots du lexique, en gras avec leur définition au survol.
    const terms = (text: string) => rulesSegments(text).flatMap((s) => (s.term ? [s.term] : []));
    expect(terms(abilityRules(monster('vladimir').activated[0]!))).toEqual(['absorber', 'adjacent']);
    expect(terms(abilityRules(monster('emma').activated[0]!))).toEqual(['transformer']);
  });

  it('notation du lexique (tableaux de SPEC.md) et noms « Nom - Vampire »', () => {
    expect(cardEffectLine(getCard('zoldik'))).toBe(
      'Soif 1 ; Actif (2 mana, puis plus d’attaque ce tour) · un ennemi adjacent · absorbe tous ses PV sauf 1',
    );
    expect(cardEffectLine(getCard('emma'))).toBe('Soif 1 ; Actif (1 mana, sans limite par tour) · se transforme en Emma chauve-souris');
    expect(splitCardName(getCard('emma-chauve-souris').name)).toEqual({ title: 'Emma chauve-souris', archetype: 'Vampire' });
    for (const id of ['delta', 'emma', 'emma-chauve-souris', 'vladimir', 'zoldik', 'appel-du-sang', 'sacrifice-sanguinaire'] as const) {
      expect(CARD_ART[id], id).toBeDefined();
    }
  });
});

describe('Emma dans l’interface', () => {
  const state = gameWith([{ monster: 'emma', owner: 1, at: at(5, 4) }], MANA);
  const bat = applyAction(state, transform);

  it('bulle de ses effets : « Se transformer », 1 mana, lancé directement, encore disponible après', () => {
    for (const s of [state, bat]) {
      expect(getBubble(view(s), { kind: 'effects', unitId: 'u1', page: 'effects' })!.rows[0]).toMatchObject({
        title: 'Se transformer',
        cost: 1,
        enabled: true,
        pick: { action: transform },
      });
    }
  });

  it('journal et fiche de la chauve-souris', () => {
    expect(describeAction(view(state), transform, view(bat))[0]).toBe('Emma - Vampire de J1 se transforme en Emma chauve-souris.');
    const sheet = getSheet(view(bat), { kind: 'cell', pos: at(5, 4) })!;
    expect(sheet).toMatchObject({ title: 'Emma chauve-souris', archetype: 'Vampire', art: { cardId: 'emma-chauve-souris', owner: 1 } });
    // Un seul effet actif, sans nom : la fiche ne le nomme pas ; sans limite par tour, il reste disponible.
    expect(sheet.active.map((a) => [a.name, a.cost, plainRules(a.text), a.foot?.text])).toEqual([
      [null, 1, 'Se transforme en Emma. Sans limite par tour.', 'Disponible'],
    ]);
  });
});

describe('illustrations et overframes du deck Vampire', () => {
  const VAMPIRE_ART = ['delta', 'emma', 'emma-chauve-souris', 'vladimir', 'zoldik', 'appel-du-sang', 'sacrifice-sanguinaire'] as const;

  it('recadrées serré : chaque illustration couvre toute la fiche (pas de bande floue) et toute la tuile', () => {
    for (const id of VAMPIRE_ART) {
      const art = CARD_ART[id]!;
      expect(art.h / art.w, id).toBeCloseTo(1.8, 1);
      expect(artFit(art, SHEET_FRAME).edge, id).toBeGreaterThanOrEqual(99.5);
      expect(artFit(art, TILE_FRAME).edge, id).toBeGreaterThanOrEqual(99.5);
    }
  });

  it('Emma, sa forme chauve-souris et Zoldik sortent du cadre, sans agrandir la place réservée au-dessus des fiches', () => {
    const [emma, bat, zoldik] = [OVERFRAMES.emma!, OVERFRAMES['emma-chauve-souris']!, OVERFRAMES.zoldik!];
    expect([emma, bat, zoldik].map((def) => def.headroom)).toEqual([128, 180, 125]);
    expect(MAX_HEADROOM).toBe(186);
    expect([emma.particles, bat.particles, zoldik.particles]).toEqual(['blood', 'bats', 'blood']);
    // L'illustration couvre tout le cadre (280 × 498) ; le pop part au-dessus et descend sous le haut du cadre.
    for (const def of [emma, bat, zoldik]) {
      expect(def.art.x).toBeLessThanOrEqual(0);
      expect(def.art.x + def.art.w * def.art.scale).toBeGreaterThanOrEqual(280);
      expect(def.art.y + def.art.h * def.art.scale).toBeGreaterThanOrEqual(498);
      expect(-def.pop.y).toBeLessThanOrEqual(def.headroom);
      expect(def.pop.y + def.pop.h * def.pop.scale).toBeGreaterThan(0);
    }
    // Les bras d'Emma et de Zoldik sortent du cadre à droite, devant le liseré (bouts posés 4 px avant le bord).
    for (const def of [emma, zoldik]) {
      expect(def.sides!.x).toBe(276);
      expect(def.sides!.x + def.sides!.w * def.sides!.scale).toBeGreaterThan(300);
    }
    expect(bat.sides).toBeNull();
    expect([PARTICLES.blood.back.length, PARTICLES.blood.front.length, PARTICLES.bats.back.length, PARTICLES.bats.front.length]).toEqual([14, 6, 10, 5]);
    expect(PARTICLES.bats.back[0]!.style).toMatchObject({ clipPath: expect.stringContaining('polygon') });
  });

  it('Zoldik brillant « Sang bleu » : ses propres images, dans le deck Vampire ; Emma garde le shiny générique', () => {
    expect(DECKS.find((d) => d.id === 'vampire')!.shiny).toEqual(['zoldik']);
    expect(hasShinyImages(OVERFRAMES.zoldik!)).toBe(true);
    expect(overframeLook(OVERFRAMES.zoldik!, true).label).toBe('Sang bleu');
    expect(cardArtFor('zoldik', true)!.src).toBe(CARD_ART_SHINY.zoldik);
    expect(hasShinyImages(OVERFRAMES.emma!)).toBe(false);
    expect(overframeUrl('zoldik_bras.png', true)).toMatch(/zoldik_bras_shiny\.png$/);
  });
});
