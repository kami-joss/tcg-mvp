import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CARDS, COMMON_CARDS, DECKS, createGame, getLegalActions, getMonsterCard, getPlayerView } from '../engine';
import { at, gameWith } from '../engine/test-utils';
import { HomeScreen } from './HomeScreen';
import { pageOf, pageUrl } from './routes';
import { DEFAULT_SETUP } from './session';
import { abilityRules, plainRules } from './rulesText';
import { cardSheetOf } from './sheet';
import { WorkshopScreen } from './WorkshopScreen';
import { DEFAULT_SCALES, scaleOf, setScaleSetting, settingFields } from './costScales';
import {
  exportPatches,
  importPatches,
  loadPatches,
  matchesQuery,
  parseFieldValue,
  resetCard,
  setField,
  workshopCards,
  workshopFields,
  workshopGroups,
} from './workshop';
import type { ImportResult } from './workshop';

// Atelier de cartes (`/atelier`, étape 2) : régler le coût, les stats et la valeur des mots-clés, sans toucher aux cartes
// d'origine ; les réglages se gardent dans le navigateur et passent par un fichier.

const errorOf = (result: ImportResult) => ('error' in result ? result.error : null);
const file = (cards: unknown) => JSON.stringify({ format: 'tcg-atelier', version: 1, cards });

describe('champs réglables', () => {
  it('monstre : coût, stats et valeurs de ses mots-clés ; terrain : coût et PV ; sort : coût', () => {
    expect(workshopFields(CARDS['clown-assassin']).map((f) => f.id)).toEqual(['cost', 'atk', 'hp', 'mobility', 'range', 'assassin.multiplier']);
    expect(workshopFields(CARDS['clown-assassin'])[5]).toMatchObject({ label: 'Attaque par surprise : multiplicateur', original: 3, min: 1 });
    // Brûlure 1 pendant 2 tours (Feria) : deux valeurs ; la durée peut valoir 0 (jusqu'à son prochain tour).
    expect(workshopFields(CARDS.apprenti).filter((f) => f.id.startsWith('brulure.'))).toMatchObject([
      { id: 'brulure.amount', original: 1, min: 1 },
      { id: 'brulure.turns', original: 2, min: 0 },
    ]);
    // Riposte n'a pas de valeur : rien à régler.
    expect(workshopFields(CARDS.gardien).map((f) => f.id)).toEqual(['cost', 'atk', 'hp', 'mobility', 'range']);
    expect(workshopFields(CARDS['terrain-piege']).map((f) => f.id)).toEqual(['cost', 'hp']);
    expect(workshopFields(CARDS.charge).map((f) => f.id)).toEqual(['cost']);
  });

  it('une saisie doit être un entier dans les bornes du champ', () => {
    const hp = workshopFields(CARDS.gardien).find((f) => f.id === 'hp')!;
    expect(parseFieldValue(hp, ' 12 ')).toBe(12);
    expect(['', '0', '2.5', 'abc', '41'].map((text) => parseFieldValue(hp, text))).toEqual([null, null, null, null, null]);
  });
});

describe('réglages', () => {
  it('ils changent la carte de l’atelier, jamais celle d’origine ; les autres cartes restent les mêmes', () => {
    const patches = setField(setField({}, 'clown-assassin', 'atk', 5), 'clown-assassin', 'assassin.multiplier', 2);
    const cards = workshopCards(patches);
    expect(getMonsterCard(cards, 'clown-assassin')).toMatchObject({ atk: 5, keywords: [{ keyword: 'assassin', multiplier: 2 }] });
    expect(getMonsterCard(CARDS, 'clown-assassin')).toMatchObject({ atk: 3, keywords: [{ keyword: 'assassin', multiplier: 3 }] });
    expect(cards.gardien).toBe(CARDS.gardien);
    expect(workshopCards({})).toBe(CARDS);
  });

  it('une valeur remise à celle d’origine efface le réglage ; « revenir à l’original » efface la carte', () => {
    const patches = setField(setField({}, 'eclaireur', 'atk', 4), 'eclaireur', 'cost', 2);
    expect(patches).toEqual({ eclaireur: { atk: 4, cost: 2 } });
    expect(setField(patches, 'eclaireur', 'atk', CARDS.eclaireur.kind === 'monster' ? CARDS.eclaireur.atk : 0)).toEqual({ eclaireur: { cost: 2 } });
    expect(setField(setField({}, 'eclaireur', 'cost', 2), 'eclaireur', 'cost', CARDS.eclaireur.cost)).toEqual({});
    expect(resetCard(patches, 'eclaireur')).toEqual({});
    // Un champ que la carte n'a pas ne se règle pas.
    expect(setField({}, 'charge', 'atk', 3)).toEqual({});
  });

  it('les cartes de l’atelier se jouent : une partie les prend telles quelles', () => {
    const cards = workshopCards(setField({}, 'eclaireur', 'cost', 2));
    const state = createGame(undefined, undefined, undefined, 'normal', 1, 'classic', undefined, cards);
    expect(getPlayerView(state, 1).cards.eclaireur.cost).toBe(2);
  });

  it('la fiche suit les réglages', () => {
    const cards = workshopCards(setField({}, 'clown-assassin', 'atk', 6));
    expect(cardSheetOf(cards, 'clown-assassin').stats.find((s) => s.label === 'ATK')?.value).toBe('6');
  });
});

describe('coût des effets actifs', () => {
  const effectFields = (id: keyof typeof CARDS) => workshopFields(CARDS[id]).filter((field) => field.effect !== undefined);

  it('un champ par effet actif, à son nom (sinon « Effet actif »), de 0 à 15 mana ; ni sort ni terrain n’en a', () => {
    expect(effectFields('archer-imperial')).toEqual([
      { id: 'activated.0.manaCost', label: 'Flèche explosive : coût en mana', min: 0, max: 15, original: 1, effect: 0 },
    ]);
    expect(effectFields('lutin-brasier').map((field) => field.label)).toEqual(['Effet actif : coût en mana']);
    expect(effectFields('chronomancienne').map((field) => [field.id, field.label])).toEqual([
      ['activated.0.manaCost', 'Retour vers le futur : coût en mana'],
      ['activated.1.manaCost', 'Sablier du temps : coût en mana'],
    ]);
    expect(effectFields('charge')).toEqual([]);
    expect(effectFields('terrain-piege')).toEqual([]);
  });

  it('le coût réglé ne change que l’effet visé, sur la carte de l’atelier et sa fiche, jamais sur celle d’origine', () => {
    const cards = workshopCards(setField({}, 'chronomancienne', 'activated.1.manaCost', 3));
    expect(getMonsterCard(cards, 'chronomancienne').activated.map((ability) => ability.manaCost)).toEqual([1, 3]);
    expect(getMonsterCard(CARDS, 'chronomancienne').activated.map((ability) => ability.manaCost)).toEqual([1, 1]);
    expect(cardSheetOf(cards, 'chronomancienne').active.map((block) => block.cost)).toEqual([1, 3]);
  });

  it('en partie, l’effet coûte ce que dit l’atelier', () => {
    // L'Archimage (effet actif : burn 2 sur les ennemis de son carré de 2) à côté d'un Milicien adverse.
    const cards = workshopCards(setField({}, 'archimage', 'activated.0.manaCost', 3));
    const withMana = (mana: number) =>
      gameWith(
        [
          { monster: 'archimage', owner: 1, at: at(1, 1) },
          { monster: 'milicien', owner: 2, at: at(1, 2) },
        ],
        { cards, players: { 1: { mana } } },
      );
    const canBurn = (mana: number) => getLegalActions(withMana(mana)).some((action) => action.type === 'activateEffect');
    expect([canBurn(2), canBurn(3)]).toEqual([false, true]);
  });

  it('export puis import : les mêmes réglages ; un coût hors bornes est refusé', () => {
    const patches = setField({}, 'archer-imperial', 'activated.0.manaCost', 0);
    expect(importPatches(exportPatches(patches))).toEqual({ patches });
    expect(errorOf(importPatches(file({ 'archer-imperial': { 'activated.0.manaCost': 16 } })))).toContain('Flèche explosive : coût en mana');
    expect(errorOf(importPatches(file({ 'archer-imperial': { 'activated.1.manaCost': 2 } })))).toContain('ne se règle pas');
  });

  it('une carte sortie de l’atelier (deck Bodybuilder retiré) : refusée dans un fichier, laissée de côté dans le navigateur', () => {
    const text = file({ rudy: { cost: 5 }, 'archer-imperial': { 'activated.0.manaCost': 0 } });
    expect(errorOf(importPatches(text))).toContain('Carte inconnue de l’atelier');
    expect(importPatches(text, true)).toEqual({ patches: setField({}, 'archer-imperial', 'activated.0.manaCost', 0) });
  });

  it('dans l’atelier : un bloc « Effets actifs », chaque coût avec le texte de son effet', () => {
    const html = renderToStaticMarkup(
      <WorkshopScreen
        onNavigate={() => {}}
        initial={setField({}, 'archer-imperial', 'activated.0.manaCost', 2)}
        initialCard="archer-imperial"
      />,
    );
    const block = html.slice(html.indexOf('class="workshop__effects"'), html.indexOf('class="workshop__note"'));
    expect(block).toContain('<h3>Effets actifs</h3>');
    expect(block).toContain('>Flèche explosive : coût en mana</span>');
    expect(block).toContain(`<span class="workshop__detail">${plainRules(abilityRules(CARDS, getMonsterCard(CARDS, 'archer-imperial').activated[0]!))}</span>`);
    expect(block).toContain('value="2"');
    expect(block).toContain('D’origine : 1');
    expect(html).toContain('Le coût des effets actifs se règle ici');
    // Un monstre sans effet actif n'a pas ce bloc.
    expect(renderToStaticMarkup(<WorkshopScreen onNavigate={() => {}} initial={{}} initialCard="golem-de-lave" />)).not.toContain('workshop__effects');
  });
});

describe('cartes de l’atelier', () => {
  it('celles des decks, chacune une fois, la forme d’Emma juste après elle, les cartes communes à la fin', () => {
    const groups = workshopGroups();
    const listed = groups.flatMap((g) => g.cards);
    expect(new Set(listed).size).toBe(listed.length);
    for (const deck of DECKS) for (const id of deck.cards) expect(listed).toContain(id);
    expect(listed.indexOf('emma-chauve-souris')).toBe(listed.indexOf('emma') + 1);
    // Les cartes communes à la fin, monstres, puis sorts, puis terrains, puis balises.
    const kinds = ['monster', 'spell', 'terrain', 'beacon'];
    const sorted = [...COMMON_CARDS].sort((a, b) => kinds.indexOf(CARDS[a].kind) - kinds.indexOf(CARDS[b].kind));
    expect(groups[groups.length - 1]).toEqual({ title: 'Cartes communes', cards: sorted });
  });

  it('recherche par nom ou archétype, sans accents ni majuscules', () => {
    expect(matchesQuery(CARDS, 'apprenti', 'feria')).toBe(true);
    expect(matchesQuery(CARDS, 'apprenti', 'SORCIERS')).toBe(true);
    expect(matchesQuery(CARDS, 'eclaireur', 'eclair')).toBe(true);
    expect(matchesQuery(CARDS, 'eclaireur', 'golem')).toBe(false);
  });
});

describe('fichier des réglages', () => {
  it('export puis import : les mêmes réglages', () => {
    const patches = setField(setField({}, 'apprenti', 'brulure.turns', 3), 'terrain-piege', 'hp', 6);
    expect(importPatches(exportPatches(patches))).toEqual({ patches });
  });

  it('les réglages des barèmes suivent ceux des cartes ; un fichier de la version 1 se lit encore', () => {
    const step = settingFields(scaleOf('threat')).find((f) => f.id === 'step')!;
    const scales = setScaleSetting(DEFAULT_SCALES, 'threat', step, 4)!;
    const patches = setField({}, 'eclaireur', 'cost', 2);
    expect(importPatches(exportPatches(patches, scales))).toEqual({ patches, scales });
    expect(importPatches(JSON.stringify({ format: 'tcg-atelier', version: 1, cards: { eclaireur: { cost: 2 } } }))).toEqual({ patches });
    expect(errorOf(importPatches(JSON.stringify({ format: 'tcg-atelier', version: 2, cards: {}, scales: { inconnu: {} } })))).toContain('Barème inconnu');
  });

  it('un fichier invalide est refusé tout entier, avec la raison', () => {
    expect(errorOf(importPatches('pas du json'))).toContain('JSON');
    expect(errorOf(importPatches(JSON.stringify({ format: 'autre', version: 1, cards: {} })))).toContain('ne vient pas de l’atelier');
    expect(errorOf(importPatches(file({ inconnue: { cost: 1 } })))).toContain('Carte inconnue');
    expect(errorOf(importPatches(file({ charge: { atk: 3 } })))).toContain('ne se règle pas');
    expect(errorOf(importPatches(file({ eclaireur: { cost: 2.5 } })))).toContain('entier');
    expect(errorOf(importPatches(file({ eclaireur: { cost: 2 }, gardien: { hp: 0 } })))).toContain('de 1 à 40');
  });

  it('une valeur égale à celle d’origine n’est pas gardée', () => {
    expect(importPatches(file({ eclaireur: { cost: CARDS.eclaireur.cost } }))).toEqual({ patches: {} });
  });

  it('sans stockage (navigation privée, tests), aucun réglage', () => {
    expect(loadPatches()).toEqual({});
  });
});

describe('page de l’atelier', () => {
  it('à l’adresse /atelier, depuis l’accueil et les autres pages', () => {
    expect(pageOf('/atelier')).toBe('workshop');
    expect(pageUrl('workshop', null, '/tcg/')).toBe('/tcg/atelier');
    expect(renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={() => {}} />)).toContain('Atelier');
  });

  it('la carte choisie : ses champs, sa valeur d’origine quand elle change, ses prix dans les barèmes et sa fiche', () => {
    const first = workshopGroups()[0]!.cards[0]!;
    const card = getMonsterCard(CARDS, first);
    const html = renderToStaticMarkup(<WorkshopScreen onNavigate={() => {}} initial={setField({}, first, 'atk', card.atk + 4)} />);
    for (const label of ['Coût', 'ATK', 'PV', 'Mobilité', 'Portée']) expect(html).toContain(`>${label}</span>`);
    expect(html).toContain(`value="${card.atk + 4}"`);
    expect(html).toContain(`D’origine : ${card.atk}`);
    expect(html).toContain('modifiée');
    expect(html).toContain('1 carte modifiée');
    expect(html).toContain('Prix dans les barèmes');
    expect(html).toContain('Corps × allonge');
    expect(html).toContain('Revenir à l’original');
    expect(html).toContain('class="sheet');
  });

  it('coût suggéré : chaque prix d’un barème se clique pour devenir le coût de la carte', () => {
    // La première carte de la liste, réglée par le test en 1/1/3/1 à 1 mana : 1 mana dans les barèmes, déjà son coût,
    // donc rien à cliquer ; à 4 mana, chaque barème propose 1 mana.
    const first = workshopGroups()[0]!.cards[0]!;
    const weak = Object.entries({ cost: 1, atk: 1, hp: 1, mobility: 3, range: 1 }).reduce((patches, [field, value]) => setField(patches, first, field, value), {});
    const html = renderToStaticMarkup(<WorkshopScreen onNavigate={() => {}} initial={weak} />);
    expect(html).toContain('Clique un prix pour en faire le coût de la carte.');
    expect(html.match(/class="workshop__scale is-same" disabled=""/g)?.length).toBeGreaterThan(0);
    const pricier = renderToStaticMarkup(<WorkshopScreen onNavigate={() => {}} initial={setField(weak, first, 'cost', 4)} />);
    expect(pricier).toContain('title="Coût suggéré : mettre la carte à 1 mana"');
  });

  it('sans réglage : les cartes d’origine, rien à exporter', () => {
    const html = renderToStaticMarkup(<WorkshopScreen onNavigate={() => {}} initial={{}} />);
    expect(html).toContain('Cartes d’origine');
    expect(html).not.toContain('D’origine :');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Exporter<\/button>/);
  });
});
