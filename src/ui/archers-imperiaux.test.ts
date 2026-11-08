import { describe, expect, it } from 'vitest';
import { applyAction, getCard, getPlayerView } from '../engine';
import type { MonsterCard } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { cardEffectLine, describeCard } from './cardText';
import { abilityRules, GLOSSARY, passiveRules, plainRules, rulesSegments } from './rulesText';
import { getSheet, reasonStatus } from './sheet';

// Deck Archers impériaux dans l'interface : notation du lexique, textes naturels, fiche (puce « Armé », 2 attaques).

const monster = (id: string) => getCard(id as never) as MonsterCard;
const view = (state: ReturnType<typeof gameWith>) => getPlayerView(state, 1);

describe('textes des cartes du deck Archers impériaux', () => {
  it('notation du lexique', () => {
    expect(cardEffectLine(getCard('ecuyer-archers'))).toBe('Aura · Carquois prêt ! · archers impériaux alliés, carré de 1 · 2 attaques par tour');
    expect(cardEffectLine(getCard('archer-imperial'))).toBe(
      'Actif (1 mana, sans limite par tour) · Flèche explosive · armé : prochaine attaque, 1 dégât aux ennemis, carré de 1 de la cible',
    );
    expect(cardEffectLine(getCard('arbaletrier-imperial'))).toBe('Actif (1 mana, sans limite par tour) · Carreau perforant · armé : prochaine attaque, +2 ATK');
    expect(cardEffectLine(getCard('trebuchet-archers'))).toBe('Siège ×2 ; ne peut pas attaquer au contact');
    expect(cardEffectLine(getCard('camps-de-tir'))).toBe('Aura · archers impériaux alliés, sa case et carré de 1 · +1 portée');
    expect(describeCard(getCard('archer-imperial'))[1]).toBe('Archétype Archers impériaux.');
  });

  it('phrases naturelles : Carquois prêt !, armé, Camps de tir, Trébuchet', () => {
    const plain = (text: string) => plainRules(text);
    expect(passiveRules(getCard('ecuyer-archers')).map((i) => [i.name, plain(i.text)])).toEqual([
      ['Carquois prêt !', 'Tes archers impériaux dans un carré de 1 peuvent attaquer 2 fois par tour.'],
    ]);
    expect(plain(abilityRules(monster('archer-imperial').activated[0]!))).toBe(
      'Arme ce monstre : sa prochaine attaque ce tour inflige aussi 1 dégât à chaque ennemi dans un carré de 1 de sa cible. Sans limite par tour.',
    );
    expect(plain(abilityRules(monster('arbaletrier-imperial').activated[0]!))).toBe('Arme ce monstre : sa prochaine attaque ce tour a +2 ATK. Sans limite par tour.');
    expect(passiveRules(getCard('camps-de-tir')).map((i) => plain(i.text))).toEqual(['Tes archers impériaux sur ce terrain ou dans un carré de 1 ont +1 portée.']);
    expect(passiveRules(getCard('trebuchet-archers')).map((i) => plain(i.text))).toEqual(['Dégâts ×2 contre un terrain.', 'Ne peut pas attaquer une cible au contact.']);
    expect(rulesSegments(abilityRules(monster('archer-imperial').activated[0]!)).filter((s) => s.term).map((s) => s.term)).toEqual(['arme', 'carre']);
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
    const chips = (s: typeof state) => getSheet(view(s), { kind: 'unit', unitId: 'u1' })!.status?.map((c) => c.text) ?? [];
    expect(chips(state)).toContain('Aura');
    expect(getSheet(view(state), { kind: 'unit', unitId: 'u1' })!.status?.find((c) => c.text === 'Aura')?.detail).toMatch(/2 attaques par tour/);
    const armed = applyAction(state, { type: 'activateEffect', unitId: 'u1', target: { kind: 'unit', unitId: 'u1' } });
    expect(chips(armed)).toContain('Armé');
    expect(getSheet(view(armed), { kind: 'unit', unitId: 'u1' })!.status?.find((c) => c.text === 'Armé')?.detail).toMatch(/\+2 ATK/);
  });

  it('raisons d’indisponibilité : déjà armé, plus d’attaque ce tour', () => {
    expect(reasonStatus({ kind: 'armed' }, 'déjà utilisé').text).toMatch(/armé/i);
    expect(reasonStatus({ kind: 'noAttack' }, 'déjà utilisé').text).toMatch(/attaque/);
  });
});
