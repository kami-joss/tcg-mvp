import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getCard } from '../engine';
import type { MonsterCard, SpellCard } from '../engine';
import { CardRules } from './CardRules';
import { GLOSSARY, abilityRules, capitalize, passiveRules, plainRules, rulesSegments } from './rulesText';

// Textes des cartes en phrases naturelles (SPEC.md §5, « Style des textes ») : un mot du lexique garde son sens.

const monster = (id: string) => getCard(id as never) as MonsterCard;
const spell = (id: string) => getCard(id as never) as SpellCard;
const plain = (text: string) => plainRules(text);

describe('textes des cartes, façon Hearthstone', () => {
  it('Miroir de souvenirs : le contre-coup est dit après l’effet, silence et contre-coup sont des mots du lexique', () => {
    const miroir = abilityRules(monster('dragonnet-temps').activated[1]!);
    expect(plain(miroir)).toBe('Inflige stun pendant 1 tour à un ennemi dans un carré de 1. Contre-coup : il s’inflige silence pendant 1 tour.');
    expect(rulesSegments(miroir).filter((s) => s.term).map((s) => s.term)).toEqual(['stun', 'carre', 'contreCoup', 'silence']);
    expect(GLOSSARY.silence).toMatch(/effets actifs/);
    expect(GLOSSARY.contreCoup).toMatch(/en retour/);
  });

  it('le sablier téléporte : jamais « recule » ni « remonte »', () => {
    const sablier = plain(abilityRules(monster('chronomancienne').activated[1]!));
    expect(sablier).toBe(
      'Pose un piège sur une case libre dans un carré de 1 : l’ennemi qui y entre est téléporté 3 cases en arrière sur son chemin du tour, et ne peut plus se déplacer ce tour. Il dure 3 tours adverses. Ce monstre n’en a qu’un à la fois : le précédent disparaît.',
    );
    expect(sablier).not.toMatch(/recule|remonte/);
    expect(plain(abilityRules(monster('chronomancienne').activated[0]!))).toBe(
      'Téléporte ce monstre sur une case libre de son chemin du tour. Il ne peut plus se déplacer ce tour.',
    );
  });

  it('un recul s’écrit « repousse », et les effets s’enchaînent en une phrase', () => {
    expect(plain(abilityRules(spell('bourrasque').ability))).toBe('Repousse de 2 cases un ennemi, dans la direction de ton choix.');
    expect(plain(abilityRules(monster('jean-bon').activated[0]!))).toBe('Donne +2 ATK à ce monstre ce tour et lui inflige burn 1 pendant 2 tours.');
    expect(plain(abilityRules(spell('seringue').ability))).toBe('Double l’ATK d’un allié bodybuilder ce tour et lui inflige requiem.');
    expect(plain(abilityRules(spell('fleche-divine').ability))).toBe('Donne +1 ATK et +1 portée à un allié archer impérial ce tour.');
  });

  it('Passage et passifs : l’ennemi qui entre, l’aura, quand il détruit', () => {
    expect(passiveRules(monster('golem-de-lave')).map((i) => [plain(i.name), plain(i.text)])).toEqual([
      ['Zone', 'Le carré de 1 forme une zone : l’ennemi qui y entre, ou près duquel ce monstre arrive, subit burn 1 pendant 1 tour, de nouveau au début de ton tour s’il y est encore.'],
    ]);
    expect(plain(passiveRules(monster('arnold'))[0]!.text)).toBe('Tes bodybuilders dans un carré de 2 ont +1 ATK.');
    expect(plain(passiveRules(getCard('salle-de-sport'))[0]!.text)).toBe('Tes bodybuilders sur ce terrain ou dans un carré de 1 ont +1 ATK et +1 PV.');
    expect(plain(passiveRules(monster('rudy'))[0]!.text)).toBe('Tes bodybuilders dans un carré de 2 ont +1 mobilité.');
    expect(plain(abilityRules(monster('tibo').activated[0]!))).toBe('Donne carapace jusqu’à son prochain tour à ce monstre.');
    expect(plain(passiveRules(monster('jeune-gomuscu'))[0]!.text)).toBe('Il gagne définitivement +1 ATK et +1 PV.');
  });

  it('mots du lexique balisés : en gras, définition au survol', () => {
    const text = abilityRules(monster('chronomancienne').activated[1]!);
    expect(rulesSegments(text).filter((s) => s.term).map((s) => s.term)).toEqual(['piege', 'carre', 'entrer', 'teleporter', 'chemin']);
    const html = renderToStaticMarkup(<CardRules text={text} />);
    expect(html).toContain(`<b class="term" title="${GLOSSARY.teleporter.replace(/’/g, '’')}">téléporté</b>`);
    expect(capitalize('{{teleporter|téléporte}} ce monstre')).toBe('{{teleporter|Téléporte}} ce monstre');
  });
});
