import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMMON_CARDS, DECKS, getCard, getMonsterCard } from '../engine';
import {
  COST_SCALES,
  DEFAULT_SCALES,
  MEASURED_TYPES,
  actionVerdict,
  changedScales,
  checkScales,
  costScales,
  loadScalesSettings,
  measuredTypeOf,
  monsterGroups,
  parseSettingValue,
  priceOf,
  resetScale,
  scaleOf,
  setScaleSetting,
  settingFields,
  survivalVerdict,
  tierLabels,
} from './costScales';
import type { MonsterStats, ScaleId, ScalesSettings } from './costScales';
import { HomeScreen } from './HomeScreen';
import { pageOf, pageUrl } from './routes';
import { ScalesScreen } from './ScalesScreen';
import { DEFAULT_SETUP } from './session';
import { CARDS } from '../engine';

// Page des barèmes (`/baremes`) : le coût d'un monstre selon cinq barèmes, la tranche où il tombe et s'il en sort ; les
// tranches et les valeurs de chaque barème se règlent (étape 5 de l'atelier).

const s = (atk: number, hp: number, mobility: number, range: number): MonsterStats => ({ atk, hp, mobility, range });
const result = (id: ScaleId, stats: MonsterStats, settings: ScalesSettings = DEFAULT_SCALES) =>
  costScales(stats, settings).find((r) => r.scale.id === id)!;
const typeStats = (name: string) => MEASURED_TYPES.find((t) => t.name === name)!.stats;
/** Le prix de ces points dans un barème, réglages d'origine. */
const price = (id: ScaleId) => (points: number) => priceOf(scaleOf(id), DEFAULT_SCALES[id].table, points);
/** Les réglages d'origine, avec un champ d'un barème changé. */
const tuned = (id: ScaleId, fieldId: string, value: number) =>
  setScaleSetting(DEFAULT_SCALES, id, settingFields(scaleOf(id)).find((f) => f.id === fieldId)!, value)!;

describe('tranches de chaque barème', () => {
  it('corps × allonge : de 10 en 10, 1 mana sous 10, une limite pile prend la tranche du dessus, 100 au plus (10 mana)', () => {
    expect([0, 9, 10, 19, 20, 48, 90, 99, 100].map(price('bodyReach'))).toEqual([1, 1, 2, 2, 3, 5, 10, 10, 10]);
    expect(price('bodyReach')(101)).toBeNull();
  });

  it('surface + impact : tranches de 10 points, 1 mana sous 10, une limite pile prend la tranche du dessus, 80 au plus', () => {
    expect([0, 9.99, 10, 19.99, 20, 70, 79.99, 80].map(price('surface'))).toEqual([1, 1, 2, 2, 3, 8, 8, 8]);
    expect(price('surface')(80.01)).toBeNull();
  });

  it('pondéré : 1 mana jusqu’à 11 points, puis +1 tous les 2, 23 au plus', () => {
    expect([11, 11.25, 13, 13.25, 21, 21.25, 23].map(price('weighted'))).toEqual([1, 2, 2, 3, 6, 7, 7]);
    expect(price('weighted')(23.25)).toBeNull();
  });

  it('menace × force : 1 mana jusqu’à 6, puis +1 tous les 5, 36 au plus', () => {
    expect([6, 7, 11, 12, 31, 32, 36].map(price('threat'))).toEqual([1, 2, 2, 3, 6, 7, 7]);
    expect(price('threat')(37)).toBeNull();
  });

  it('additif : 1 mana jusqu’à 9, puis +1 tous les 2, 20 au plus', () => {
    expect([9, 10, 11, 12, 19, 20].map(price('additive'))).toEqual([1, 2, 2, 3, 6, 7]);
    expect(price('additive')(21)).toBeNull();
  });

  it('chaque tranche a son étiquette : la tranche i coûte i + 1 mana', () => {
    const labels = (id: ScaleId) => tierLabels(scaleOf(id), DEFAULT_SCALES[id]);
    expect(COST_SCALES.map((c) => labels(c.id).length)).toEqual([10, 10, 8, 7, 7, 7]);
    expect(labels('bodyReach')).toEqual(['< 10', '10–20', '20–30', '30–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100']);
    expect(labels('weighted')).toEqual(['≤ 11', '≤ 13', '≤ 15', '≤ 17', '≤ 19', '≤ 21', '≤ 23']);
    expect(labels('threat')).toEqual(['0–6', '7–11', '12–16', '17–21', '22–26', '27–31', '32–36']);
    expect(labels('additive')).toEqual(['0–9', '10–11', '12–13', '14–15', '16–17', '18–19', '20']);
  });
});

describe('points de chaque barème', () => {
  it('corps × allonge : (ATK + PV × 0,75) × (mobilité × 1,33 + portée), chaque point compte', () => {
    expect(result('bodyReach', typeStats('Équilibré'))).toMatchObject({ points: 53.55, mana: 6, detail: '(4 + 3) × (6,65 + 1) = 53,55' });
    // Un point d'ATK vaut plus qu'un point de PV, un point de mobilité plus qu'un point de portée.
    expect(result('bodyReach', typeStats('Brute')).points).toBeGreaterThan(result('bodyReach', typeStats('Tank')).points);
    expect(result('bodyReach', s(3, 3, 5, 1)).points).toBeGreaterThan(result('bodyReach', s(3, 3, 1, 5)).points);
    expect(result('bodyReach', s(5, 5, 5, 3))).toMatchObject({ points: 84.4375, mana: 9 });
    expect(result('bodyReach', s(9, 12, 9, 9))).toMatchObject({ outOfScale: true });
  });

  it('corps × allonge, racine : croît comme les stats (tout doubler double les points), dans le même ordre', () => {
    const equilibre = typeStats('Équilibré');
    expect(result('bodyReachRoot', equilibre)).toMatchObject({ points: 73.177866, mana: 5, detail: '10 × √(7 × 7,65) = 73,18' });
    const doubled = s(8, 8, 10, 2);
    expect(result('bodyReachRoot', doubled).points / result('bodyReachRoot', equilibre).points).toBeCloseTo(2, 5);
    expect(result('bodyReach', doubled).points / result('bodyReach', equilibre).points).toBeCloseTo(4, 5);
    const order = (id: ScaleId) => [...MEASURED_TYPES].sort((x, y) => result(id, y.stats).points - result(id, x.stats).points).map((t) => t.name);
    expect(order('bodyReachRoot')).toEqual(order('bodyReach'));
    expect(tierLabels(scaleOf('bodyReachRoot'), DEFAULT_SCALES.bodyReachRoot).slice(0, 3)).toEqual(['< 50', '50–56', '56–62']);
  });

  it('surface + impact : mobilité × portée + ATK × PV, chaque stat multipliée par sa valeur (1,25, 1,25, 1, 0,75)', () => {
    expect(result('surface', typeStats('Équilibré'))).toMatchObject({ points: 19.8125, mana: 2, detail: '6,25 × 1,25 + 4 × 3 = 19,81' });
    expect(result('surface', typeStats('Tireur'))).toMatchObject({ points: 31.75, mana: 4 });
    // Mobilité et portée à 1 : la formule de départ de l'utilisateur.
    const range = settingFields(scaleOf('surface')).find((f) => f.id === 'range')!;
    const plain = setScaleSetting(tuned('surface', 'mobility', 1), 'surface', range, 1)!;
    expect(result('surface', typeStats('Tireur'), plain).points).toBe(22.75);
  });

  it('pondéré : ATK et PV au plus le double de l’autre, mobilité à 0,5 au-delà de 6, portée 1,5', () => {
    expect(result('weighted', typeStats('Brute'))).toMatchObject({ points: 11.5, mana: 2, detail: '4 + 1,5 + 4,5 + 1,5 = 11,5' });
    expect(result('weighted', typeStats('Rapide fragile'))).toMatchObject({ points: 15.5, mana: 4 });
    expect(result('weighted', typeStats('Tank'))).toMatchObject({ points: 11, mana: 1 });
  });

  it('menace × force : (mobilité + portée) × la plus petite d’ATK et PV', () => {
    expect(result('threat', s(2, 10, 2, 1))).toMatchObject({ points: 6, mana: 1, detail: '(2 + 1) × 2 = 6' });
    expect(result('threat', typeStats('Équilibré'))).toMatchObject({ points: 24, mana: 5 });
  });

  it('additif : la somme des stats', () => {
    expect(result('additive', typeStats('Brute'))).toMatchObject({ points: 14, mana: 4, detail: '8 + 2 + 3 + 1 = 14' });
  });

  it('hors barème : au-delà de la dernière tranche, sans coût', () => {
    expect(result('threat', s(5, 5, 5, 3))).toMatchObject({ points: 40, mana: null, outOfScale: true });
    expect(result('additive', s(6, 6, 6, 3))).toMatchObject({ points: 21, outOfScale: true });
    expect(result('surface', s(9, 12, 9, 9))).toMatchObject({ outOfScale: true });
    expect(result('weighted', s(9, 12, 9, 9))).toMatchObject({ outOfScale: true });
  });
});

describe('barèmes réglables', () => {
  it('les tranches : première limite, pas et fin se règlent, les étiquettes suivent', () => {
    // Corps × allonge tous les 15 points : 53,55 tombe dans la tranche 40–55, la 4e (4 mana) au lieu de 6.
    const settings = tuned('bodyReach', 'step', 15);
    expect(result('bodyReach', typeStats('Équilibré'), settings)).toMatchObject({ points: 53.55, mana: 4 });
    expect(tierLabels(scaleOf('bodyReach'), settings['bodyReach'])).toEqual(['< 10', '10–25', '25–40', '40–55', '55–70', '70–85', '85–100']);
    expect(result('threat', typeStats('Équilibré'), tuned('threat', 'max', 20))).toMatchObject({ mana: null, outOfScale: true });
  });

  it('les valeurs de chaque formule : un poids par stat, et pour le pondéré le plafond et la mobilité', () => {
    expect(result('bodyReach', typeStats('Équilibré'), tuned('bodyReach', 'mobility', 2)).points).toBe(7 * 11);
    // Plafond à 1,5 fois l'autre : la Brute 8/2 compte 3 d'ATK.
    expect(result('weighted', typeStats('Brute'), tuned('weighted', 'cap', 1.5)).points).toBe(3 + 1.5 + 4.5 + 1.5);
    // La formule se lit avec ses valeurs : « × 2 » pour une valeur qui n'est pas 1.
    expect(scaleOf('additive').formula({ ...DEFAULT_SCALES.additive.values, range: 2 })).toBe('ATK + PV + mobilité + portée × 2');
  });

  it('des tranches impossibles sont refusées ; « revenir à l’origine » efface les réglages', () => {
    const max = settingFields(scaleOf('threat')).find((f) => f.id === 'max')!;
    expect(setScaleSetting(DEFAULT_SCALES, 'threat', max, 5)).toBeNull(); // fin avant la première limite (6)
    const settings = tuned('threat', 'step', 4);
    expect(changedScales(settings)).toEqual(['threat']);
    expect(changedScales(resetScale(settings, 'threat'))).toEqual([]);
  });

  it('une saisie se lit avec une virgule ou un point, dans les bornes du champ', () => {
    const cap = settingFields(scaleOf('weighted')).find((f) => f.id === 'cap')!;
    expect(parseSettingValue(cap, ' 1,5 ')).toBe(1.5);
    expect(['', 'abc', '0,5', '11'].map((text) => parseSettingValue(cap, text))).toEqual([null, null, null, null]);
  });

  it('réglages lus (fichier, navigateur) : vérifiés, un barème absent garde ceux d’origine', () => {
    expect(checkScales({ threat: { table: { first: 6, step: 4, max: 36 }, values: {} } })).toEqual({ settings: tuned('threat', 'step', 4) });
    expect(checkScales({ inconnu: {} })).toEqual({ error: 'Barème inconnu : « inconnu ».' });
    expect(checkScales({ threat: { table: { first: 6, step: 0, max: 36 }, values: {} } })).toHaveProperty('error');
    expect(checkScales({ threat: { table: { first: 40, step: 5, max: 36 }, values: {} } })).toHaveProperty('error');
    // Sans stockage (tests, navigation privée) : les réglages d'origine.
    expect(loadScalesSettings()).toBe(DEFAULT_SCALES);
  });
});

describe('types mesurés et monstres des decks', () => {
  it('les 7 types du banc d’essai, retrouvés par leurs stats, avec leur juste prix', () => {
    expect(MEASURED_TYPES).toHaveLength(7);
    expect(measuredTypeOf(s(4, 4, 5, 1))).toMatchObject({ name: 'Équilibré', fairPrice: 5.5 });
    expect(measuredTypeOf(s(4, 4, 5, 2))).toBeUndefined();
  });

  it('menace × force range les types comme la mesure (le plus cher d’abord)', () => {
    const points = MEASURED_TYPES.map((t) => result('threat', t.stats).points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it('chaque monstre des decks une fois, les cartes communes à part, avec le coût de sa carte', () => {
    const groups = monsterGroups();
    const listed = groups.flatMap((g) => g.monsters.map((m) => m.cardId));
    expect(new Set(listed).size).toBe(listed.length);
    for (const deck of DECKS) {
      for (const cardId of deck.cards) if (getCard(CARDS, cardId).kind === 'monster') expect(listed).toContain(cardId);
    }
    const commons = groups[groups.length - 1]!;
    expect(commons.title).toBe('Cartes communes');
    expect(commons.monsters.map((m) => m.cardId)).toEqual(COMMON_CARDS.filter((id) => getCard(CARDS, id).kind === 'monster'));
    for (const monster of groups.flatMap((g) => g.monsters)) expect(monster.cost).toBe(getCard(CARDS, monster.cardId).cost);
  });

  it('un monstre de deck s’affiche sans son archétype, sous son deck', () => {
    const golem = monsterGroups()
      .flatMap((g) => g.monsters.map((m) => ({ ...m, deck: g.title })))
      .find((m) => m.name === 'Golem de lave')!;
    const card = getMonsterCard(CARDS, 'golem-de-lave');
    expect(golem).toMatchObject({ deck: 'Sorciers du feu', stats: s(card.atk, card.hp, card.mobility, card.range), cost: card.cost });
  });
});

describe('combinaison des stats', () => {
  it('survie : encaisser (3 PV), fuir (mobilité 6) ou rester loin (portée 3)', () => {
    expect(survivalVerdict(typeStats('Brute'))).toMatchObject({ ok: false });
    expect(survivalVerdict(typeStats('Brute')).text).toContain('lent et fragile');
    expect(survivalVerdict(typeStats('Rapide fragile'))).toEqual({ ok: true, text: 'Survie : il fuit (mobilité 9).' });
    expect(survivalVerdict(typeStats('Tireur')).text).toBe('Survie : il encaisse (3 PV), il reste loin (portée 4).');
  });

  it('action : 2 d’ATK, mobilité + portée 5, ATK et PV pas au-delà du double de l’autre', () => {
    expect(actionVerdict(typeStats('Équilibré')).ok).toBe(true);
    expect(actionVerdict(s(2, 10, 2, 1))).toMatchObject({ ok: false });
    expect(actionVerdict(s(2, 10, 2, 1)).text).toContain('n’atteint pas grand-chose (mobilité + portée = 3)');
    expect(actionVerdict(s(2, 10, 2, 1)).text).toContain('déséquilibrés');
    expect(actionVerdict(s(0, 3, 6, 0)).text).toContain('sans ATK');
  });
});

describe('page des barèmes', () => {
  it('à l’adresse /baremes, sous la base de l’application', () => {
    expect(pageOf('/baremes')).toBe('scales');
    expect(pageOf('/tcg/baremes/', '/tcg/')).toBe('scales');
    expect(pageUrl('scales', null, '/tcg/')).toBe('/tcg/baremes');
  });

  it('ouverte sur l’Équilibré : son coût dans les quatre barèmes, la tranche de chacun, ses règles de combinaison', () => {
    const html = renderToStaticMarkup(<ScalesScreen onNavigate={() => {}} />);
    for (const c of COST_SCALES) expect(html).toContain(c.name);
    expect(html).toContain('Équilibré : juste prix mesuré 5,5 mana');
    expect(html).toContain('6,25 × 1,25 + 4 × 3 = 19,81');
    expect(html.match(/aria-current="true"/g)).toHaveLength(COST_SCALES.length);
    expect(html).toContain('(4 + 3) × (6,65 + 1) = 53,55');
    expect(html).toContain('hors barème');
    expect(html).not.toContain('Hors barème :');
    expect(html).toContain('Survie : il encaisse (4 PV).');
    expect(html).toContain('<optgroup label="Cartes communes">');
    expect(html).toContain('>Golem de lave</option>');
  });

  it('la valeur de chaque stat se règle en haut de la page, une ligne par barème', () => {
    const html = renderToStaticMarkup(<ScalesScreen onNavigate={() => {}} initial={DEFAULT_SCALES} />);
    expect(html).toContain('Valeur de chaque stat dans les barèmes');
    expect(html).toMatch(/aria-label="Surface \+ impact : valeur d’un point de PV"[^>]*value="0.75"|value="0.75"[^>]*aria-label="Surface \+ impact : valeur d’un point de PV"/);
    // Menace × force n'a pas de valeur pour l'ATK ni les PV : elle prend la plus petite des deux.
    expect(html).not.toContain('Menace × force : valeur d’un point de ATK');
    expect(html).toContain('Menace × force : valeur d’un point de Mobilité');
  });

  it('les tranches (et les plafonds du pondéré) se règlent sous chaque barème ; un repère quand il n’est plus d’origine', () => {
    const html = renderToStaticMarkup(<ScalesScreen onNavigate={() => {}} initial={DEFAULT_SCALES} />);
    expect(html.match(/<summary>Régler les tranches/g)).toHaveLength(COST_SCALES.length);
    expect(html).toContain('<summary>Régler les tranches et les plafonds</summary>');
    expect(html).toContain('1 mana sous (points)');
    expect(html).toContain('ATK et PV : au plus N fois l’autre');
    expect(html).not.toContain('scales__changed');
    const tunedHtml = renderToStaticMarkup(<ScalesScreen onNavigate={() => {}} initial={tuned('bodyReach', 'step', 15)} />);
    expect(tunedHtml).toContain('<span class="scales__changed">réglé</span>');
    expect(tunedHtml).toContain('10–25');
    expect(tunedHtml.match(/class="is-changed"/g)).toHaveLength(1);
  });

  it('l’accueil et les autres pages de consultation y mènent', () => {
    expect(renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={() => {}} />)).toContain('Barèmes');
    expect(renderToStaticMarkup(<ScalesScreen onNavigate={() => {}} />)).toContain('aria-pressed="true">Barèmes</button>');
  });
});
