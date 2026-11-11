import { describe, expect, it } from 'vitest';
import { applyAction, getCard, getPlayerView } from '../engine';
import type { MonsterCard } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { getBubble } from './bubble';
import { clickCell, getHighlights, posKey } from './interaction';
import { describeAction } from './log';
import { cardEffectLine, describeCard } from './cardText';
import { abilityRules, GLOSSARY, passiveRules, plainRules, rulesSegments } from './rulesText';
import { reasonStatus } from './sheet';
import { getUnitTip } from './unitTip';
import { CARDS } from '../engine';

// Deck Archers impériaux dans l'interface : notation du lexique, textes naturels, fiche (puce « Armé », 2 attaques).

const monster = (id: string) => getCard(CARDS, id as never) as MonsterCard;
const view = (state: ReturnType<typeof gameWith>) => getPlayerView(state, 1);

describe('textes des cartes du deck Archers impériaux', () => {
  it('notation du lexique', () => {
    expect(cardEffectLine(CARDS, getCard(CARDS, 'ecuyer-archers'))).toBe('Aura · Carquois prêt ! · archers impériaux alliés, carré de 1 · 2 attaques par tour');
    expect(cardEffectLine(CARDS, getCard(CARDS, 'archer-imperial'))).toBe(
      'Actif (1 mana, sans limite par tour) · Flèche explosive · armé : prochaine attaque, 1 dégât aux ennemis, carré de 1 de la cible (ou d’une case vide visée)',
    );
    expect(cardEffectLine(CARDS, getCard(CARDS, 'arbaletrier-imperial'))).toBe('Actif (1 mana, sans limite par tour) · Carreau perforant · armé : prochaine attaque, +2 ATK');
    expect(cardEffectLine(CARDS, getCard(CARDS, 'trebuchet-archers'))).toBe('Siège ×2 ; ne peut pas attaquer au contact');
    expect(cardEffectLine(CARDS, getCard(CARDS, 'camps-de-tir'))).toBe('Aura · archers impériaux alliés, sa case et carré de 1 · +1 portée');
    expect(describeCard(CARDS, getCard(CARDS, 'archer-imperial'))[1]).toBe('Archétype Archers impériaux.');
  });

  it('phrases naturelles : Carquois prêt !, armé, Camps de tir, Trébuchet', () => {
    const plain = (text: string) => plainRules(text);
    expect(passiveRules(getCard(CARDS, 'ecuyer-archers')).map((i) => [i.name, plain(i.text)])).toEqual([
      ['Carquois prêt !', 'Tes archers impériaux dans un carré de 1 peuvent attaquer 2 fois par tour.'],
    ]);
    expect(plain(abilityRules(CARDS, monster('archer-imperial').activated[0]!))).toBe(
      'Arme ce monstre : sa prochaine attaque ce tour inflige aussi 1 dégât à chaque ennemi dans un carré de 1 de sa cible. Il peut aussi tirer sur une case vide à sa portée : les éclats touchent les ennemis autour. Sans limite par tour.',
    );
    expect(plain(abilityRules(CARDS, monster('arbaletrier-imperial').activated[0]!))).toBe('Arme ce monstre : sa prochaine attaque ce tour a +2 ATK. Sans limite par tour.');
    expect(passiveRules(getCard(CARDS, 'camps-de-tir')).map((i) => plain(i.text))).toEqual(['Tes archers impériaux sur ce terrain ou dans un carré de 1 ont +1 portée.']);
    expect(passiveRules(getCard(CARDS, 'trebuchet-archers')).map((i) => plain(i.text))).toEqual(['Dégâts ×2 contre un terrain.', 'Ne peut pas attaquer une cible au contact.']);
    expect(rulesSegments(abilityRules(CARDS, monster('archer-imperial').activated[0]!)).filter((s) => s.term).map((s) => s.term)).toEqual(['arme', 'carre']);
    expect(GLOSSARY.arme).toMatch(/prochaine attaque/);
  });
});

describe('fiche en jeu', () => {
  const base = () =>
    gameWith(
      [
        { monster: 'arbaletrier-imperial', owner: 1, at: at(9, 2) },
        { monster: 'ecuyer-archers', owner: 1, at: at(8, 2) },
        { monster: 'golem', owner: 2, at: at(9, 5) },
      ],
      { players: { 1: { mana: 10 } } },
    );

  it('puces : 2 attaques par tour (aura de l’Écuyer), puis « Armé » après Carreau perforant', () => {
    const state = base();
    const chips = (s: typeof state) => getUnitTip(view(s), 'u1')!.chips.map((c) => c.text);
    expect(chips(state)).toContain('Aura');
    expect(getUnitTip(view(state), 'u1')!.chips.find((c) => c.text === 'Aura')?.detail).toMatch(/2 attaques par tour/);
    const armed = applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } });
    expect(chips(armed)).toContain('Armé');
    expect(getUnitTip(view(armed), 'u1')!.chips.find((c) => c.text === 'Armé')?.detail).toMatch(/\+2 ATK/);
  });

  it('raisons d’indisponibilité : déjà armé, plus d’attaque ce tour', () => {
    expect(reasonStatus({ kind: 'armed' }, 'déjà utilisé').text).toMatch(/armé/i);
    expect(reasonStatus({ kind: 'noAttack' }, 'déjà utilisé').text).toMatch(/attaque/);
  });
});

describe('Flèche explosive sur une case vide : à l’écran (2026-11-10)', () => {
  const armed = applyAction(
    gameWith(
      [
        { monster: 'archer-imperial', owner: 1, at: at(9, 0) },
        { monster: 'milicien', owner: 2, at: at(8, 3) },
      ],
      { players: { 1: { mana: 5 } } },
    ),
    { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } },
  );
  const selected = { kind: 'unit', unitId: 'u1', mode: 'act' } as const;

  it('les cases vides où il peut tirer sont en orange ; un clic ouvre la bulle du tir, qui propose aussi d’y aller', () => {
    expect(getHighlights(view(armed), selected).get(posKey(at(9, 3)))).toBe('attack');
    const result = clickCell(view(armed), selected, at(9, 2));
    expect(result).toEqual({ selection: { kind: 'shoot', unitId: 'u1', pos: at(9, 2) } });
    const bubble = getBubble(view(armed), { kind: 'shoot', unitId: 'u1', pos: at(9, 2) })!;
    expect(bubble.rows.map((row) => [row.title, row.subtitle])).toEqual([
      ['Tirer ici', 'Éclats : 1 dégât à chaque ennemi du carré de 1 · 1 ennemi autour'],
      ['Y aller', 'Se déplacer sur cette case'],
    ]);
    expect(bubble.rows[0]!.pick).toEqual({ action: { type: 'attackCell', unitId: 'u1', pos: at(9, 2) } });
  });

  it('journal : le tir, puis les éclats', () => {
    const action = { type: 'attackCell', unitId: 'u1', pos: at(9, 3) } as const;
    expect(describeAction(view(armed), action, view(applyAction(armed, action)))).toEqual([
      'Archer impérial - Archers impériaux de J1 tire en (9, 3).',
      'Milicien de J2 : 3 → 2 PV.',
    ]);
  });
});

describe('direction à choisir en vue isométrique (2026-11-10)', () => {
  it('la croix de manette, couchée dans le plan du plateau, allume le bras de la direction', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { DirectionPad } = await import('./ActionBubble');
    const html = renderToStaticMarkup(createElement(DirectionPad, { direction: 'right' }));
    expect(html).toContain('matrix(0.955 0.551 -0.955 0.551 0 0)');
    expect(html.match(/<polygon[^>]*opacity="1"/g)).toHaveLength(1);
    expect(html).toMatch(/rotate\(90\)"[^>]*opacity="1"/);
  });
});
