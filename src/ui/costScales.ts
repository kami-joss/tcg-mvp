// Page des barèmes (`/baremes`) : le coût en mana d'un monstre selon plusieurs barèmes, pour comparer leurs prix et voir
// quand un monstre sort de l'un d'eux ; tranches et valeurs de chaque formule se règlent (étape 5 de l'atelier). Outil d'équilibrage, sans effet sur la partie : le coût d'une carte reste celui
// de `cards.ts`. Les justes prix des 7 types viennent du banc d'essai de l'IA (tournois des types du 9 novembre 2026,
// hors du dépôt : `Claude outputs/banc-ia/`).
import { CARDS, COMMON_CARDS, DECKS, getCard } from '../engine';
import type { CardId } from '../engine';
import { splitCardName } from './cardText';

export interface MonsterStats {
  readonly atk: number;
  readonly hp: number;
  readonly mobility: number;
  readonly range: number;
}

export type ScaleStat = keyof MonsterStats;

/** Ordre des stats sur la page. */
export const SCALE_STATS: readonly ScaleStat[] = ['atk', 'hp', 'mobility', 'range'];

/** Nom et bornes de chaque curseur : 9 au plus, 12 pour les PV, au moins 1 PV. */
export const STAT_BOUNDS: Readonly<Record<ScaleStat, { readonly label: string; readonly min: number; readonly max: number }>> = {
  atk: { label: 'ATK', min: 0, max: 9 },
  hp: { label: 'PV', min: 1, max: 12 },
  mobility: { label: 'Mobilité', min: 0, max: 9 },
  range: { label: 'Portée', min: 0, max: 9 },
};

/** Un nombre à l'écran : deux décimales au plus, virgule française. */
export const formatPoints = (value: number): string => value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

export type ScaleId = 'bodyReach' | 'bodyReachRoot' | 'surface' | 'weighted' | 'threat' | 'additive';

/**
 * Les tranches d'un barème : 1 mana jusqu'à `first` points (ou sous `first`), puis +1 mana tous les `step` points ;
 * au-delà de `max`, fin de la tranche la plus chère, le monstre est hors barème.
 */
export interface ScaleTable {
  readonly first: number;
  readonly step: number;
  readonly max: number;
}

/** Les valeurs d'une formule, par réglage (« atk », « cap »…). */
export type ScaleValues = Readonly<Record<string, number>>;

/** Un réglage d'une formule : son nom, sa valeur d'origine et ses bornes. */
export interface ScaleValue {
  readonly id: string;
  readonly label: string;
  readonly initial: number;
  readonly min: number;
  readonly max: number;
}

export interface CostScale {
  readonly id: ScaleId;
  readonly name: string;
  /** La formule, en mots, avec ses valeurs. */
  readonly formula: (values: ScaleValues) => string;
  /**
   * Une valeur pile sur une limite : `lower`, dans la tranche du dessus (« 10–20 », barèmes de l'utilisateur, 1 mana
   * sous `first`) ; `upper`, dans celle du dessous (« ≤ 11 », 1 mana jusqu'à `first`).
   */
  readonly boundary: 'lower' | 'upper';
  /** Ses points sont entiers quand ses valeurs le sont : tranches écrites « 7–11 » plutôt que « ≤ 11 ». */
  readonly integer: boolean;
  /** Ses tranches d'origine. */
  readonly table: ScaleTable;
  readonly values: readonly ScaleValue[];
  /** Points d'un monstre, et le calcul écrit. */
  readonly points: (stats: MonsterStats, values: ScaleValues) => { readonly points: number; readonly detail: string };
}

/** Réglages d'un barème : ses tranches et les valeurs de sa formule. */
export interface ScaleSettings {
  readonly table: ScaleTable;
  readonly values: ScaleValues;
}

export type ScalesSettings = Readonly<Record<ScaleId, ScaleSettings>>;

const n = formatPoints;

/** Arrondi au millionième : des valeurs comme 1,1 ne laissent pas 19,999… sous une limite. */
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** « × 1,25 » après un mot de la formule, rien pour une valeur de 1. */
const times = (value: number | undefined) => (value === undefined || value === 1 ? '' : ` × ${n(value)}`);

const statValues = (atk: number, hp: number, mobility: number, range: number): ScaleValue[] => [
  { id: 'atk', label: 'ATK', initial: atk, min: 0, max: 10 },
  { id: 'hp', label: 'PV', initial: hp, min: 0, max: 10 },
  { id: 'mobility', label: 'Mobilité', initial: mobility, min: 0, max: 10 },
  { id: 'range', label: 'Portée', initial: range, min: 0, max: 10 },
];

/** Les stats d'un monstre, chacune fois sa valeur dans la formule. */
const weighted = ({ atk, hp, mobility, range }: MonsterStats, v: ScaleValues) => ({
  a: atk * (v.atk ?? 1),
  h: hp * (v.hp ?? 1),
  m: mobility * (v.mobility ?? 1),
  r: range * (v.range ?? 1),
});

/**
 * Les six barèmes, chacun arrêté à la fin de sa tranche la plus chère (tranches et valeurs réglables sur la page des
 * barèmes ; ici, celles d'origine) :
 * - corps × allonge (formule de l'utilisateur, 9 novembre ; ses taux du 10 : ATK 1, PV 0,75, mobilité 1,33, portée 1) :
 *   (ATK + PV) × (mobilité + portée), de 10 en 10, une valeur pile sur une limite prenant la tranche du dessus, 100 au
 *   plus (10 mana) ;
 * - corps × allonge, racine : 10 × √ de la même formule, qui croît comme les stats ; 1 mana sous 50, puis +1 tous les
 *   6, 100 au plus ;
 * - surface + impact (formule de l'utilisateur) : mobilité × portée + ATK × PV, valeurs 1,25 / 1,25 / 1 / 0,75, de 10 en
 *   10, 80 au plus ;
 * - pondéré (son barème par stat, corrigé le 9 novembre) : 1 mana jusqu'à 11 points, puis +1 tous les 2, 23 au plus ;
 * - menace × force (formule proposée le 9 novembre) : 1 mana jusqu'à 6, puis +1 tous les 5, 36 au plus ;
 * - additif (le premier barème) : 1 mana jusqu'à 9, puis +1 tous les 2, 20 au plus.
 */
export const COST_SCALES: readonly CostScale[] = [
  {
    id: 'bodyReach',
    name: 'Corps × allonge',
    formula: (v) => `(ATK${times(v.atk)} + PV${times(v.hp)}) × (mobilité${times(v.mobility)} + portée${times(v.range)})`,
    boundary: 'lower',
    integer: true,
    table: { first: 10, step: 10, max: 100 },
    // Taux de l'utilisateur (10 novembre) : l'ATK sert de base ; la mobilité vaut un peu plus que la portée (elle prend
    // les terrains, en s'exposant), les PV un peu moins.
    values: statValues(1, 0.75, 1.33, 1),
    points: (stats, v) => {
      const { a, h, m, r } = weighted(stats, v);
      const points = round((a + h) * (m + r));
      return { points, detail: `(${n(a)} + ${n(h)}) × (${n(m)} + ${n(r)}) = ${n(points)}` };
    },
  },
  {
    // La même formule en racine carrée (10 novembre) : le produit de deux sommes croît comme le carré des stats (tout
    // doubler multiplie les points par 4) et atteint vite la fin du barème ; sa racine croît comme les stats (×2), dans
    // le même ordre. Fois 10 pour des nombres ronds ; table calée sur le coût moyen des monstres des 6 decks.
    id: 'bodyReachRoot',
    name: 'Corps × allonge, racine',
    formula: (v) => `10 × √[(ATK${times(v.atk)} + PV${times(v.hp)}) × (mobilité${times(v.mobility)} + portée${times(v.range)})]`,
    boundary: 'lower',
    integer: false,
    table: { first: 50, step: 6, max: 100 },
    values: statValues(1, 0.75, 1.33, 1),
    points: (stats, v) => {
      const { a, h, m, r } = weighted(stats, v);
      const points = round(10 * Math.sqrt((a + h) * (m + r)));
      return { points, detail: `10 × √(${n(a + h)} × ${n(m + r)}) = ${n(points)}` };
    },
  },
  {
    id: 'surface',
    name: 'Surface + impact',
    formula: (v) => `mobilité${times(v.mobility)} × portée${times(v.range)} + ATK${times(v.atk)} × PV${times(v.hp)}`,
    boundary: 'lower',
    integer: true,
    table: { first: 10, step: 10, max: 80 },
    values: statValues(1, 0.75, 1.25, 1.25),
    points: (stats, v) => {
      const { a, h, m, r } = weighted(stats, v);
      const points = round(m * r + a * h);
      return { points, detail: `${n(m)} × ${n(r)} + ${n(a)} × ${n(h)} = ${n(points)}` };
    },
  },
  {
    id: 'weighted',
    name: 'Barème pondéré',
    formula: (v) =>
      `ATK ${n(v.atk ?? 1)} et PV ${n(v.hp ?? 1)} par point (au plus ${n(v.cap ?? 2)} fois l’autre), mobilité ${n(v.mobility ?? 1)} (${n(v.beyond ?? 1)} au-delà de ${n(v.limit ?? 0)}), portée ${n(v.range ?? 1)}`,
    boundary: 'upper',
    integer: false,
    table: { first: 11, step: 2, max: 23 },
    values: [
      { id: 'atk', label: 'ATK', initial: 1, min: 0, max: 10 },
      { id: 'hp', label: 'PV', initial: 0.75, min: 0, max: 10 },
      { id: 'cap', label: 'ATK et PV : au plus N fois l’autre', initial: 2, min: 1, max: 10 },
      { id: 'mobility', label: 'Mobilité', initial: 1.5, min: 0, max: 10 },
      { id: 'limit', label: 'Mobilité : pleine jusqu’à', initial: 6, min: 0, max: 20 },
      { id: 'beyond', label: 'Mobilité au-delà', initial: 0.5, min: 0, max: 10 },
      { id: 'range', label: 'Portée', initial: 1.5, min: 0, max: 10 },
    ],
    points: ({ atk, hp, mobility, range }, v) => {
      const cap = v.cap ?? 2;
      const limit = v.limit ?? 6;
      const parts = [
        (v.atk ?? 1) * Math.min(atk, cap * hp),
        (v.hp ?? 0.75) * Math.min(hp, cap * atk),
        (v.mobility ?? 1.5) * Math.min(mobility, limit) + (v.beyond ?? 0.5) * Math.max(0, mobility - limit),
        (v.range ?? 1.5) * range,
      ].map(round);
      const points = round(parts.reduce((sum, part) => sum + part, 0));
      return { points, detail: `${parts.map(n).join(' + ')} = ${n(points)}` };
    },
  },
  {
    id: 'threat',
    name: 'Menace × force',
    formula: (v) => `(mobilité${times(v.mobility)} + portée${times(v.range)}) × la plus petite d’ATK et PV`,
    boundary: 'upper',
    integer: true,
    table: { first: 6, step: 5, max: 36 },
    values: [
      { id: 'mobility', label: 'Mobilité', initial: 1, min: 0, max: 10 },
      { id: 'range', label: 'Portée', initial: 1, min: 0, max: 10 },
    ],
    points: (stats, v) => {
      const { m, r } = weighted(stats, v);
      const force = Math.min(stats.atk, stats.hp);
      const points = round((m + r) * force);
      return { points, detail: `(${n(m)} + ${n(r)}) × ${force} = ${n(points)}` };
    },
  },
  {
    id: 'additive',
    name: 'Barème additif',
    formula: (v) => `ATK${times(v.atk)} + PV${times(v.hp)} + mobilité${times(v.mobility)} + portée${times(v.range)}`,
    boundary: 'upper',
    integer: true,
    table: { first: 9, step: 2, max: 20 },
    values: statValues(1, 1, 1, 1),
    points: (stats, v) => {
      const { a, h, m, r } = weighted(stats, v);
      const points = round(a + h + m + r);
      return { points, detail: `${n(a)} + ${n(h)} + ${n(m)} + ${n(r)} = ${n(points)}` };
    },
  },
];

export const scaleOf = (id: ScaleId): CostScale => COST_SCALES.find((scale) => scale.id === id)!;

const initialValues = (scale: CostScale): ScaleValues => Object.fromEntries(scale.values.map((value) => [value.id, value.initial]));

/** Les réglages d'origine des barèmes. */
export const DEFAULT_SCALES: ScalesSettings = Object.fromEntries(
  COST_SCALES.map((scale) => [scale.id, { table: scale.table, values: initialValues(scale) }]),
) as unknown as ScalesSettings;

/** Nombre de tranches avant « hors barème » : la dernière finit à `max`. */
export const tierCount = (table: ScaleTable): number => 1 + Math.max(0, Math.ceil((table.max - table.first) / table.step - 1e-9));

/** Coût en mana pour ces points ; `null` au-delà du barème. */
export function priceOf(scale: CostScale, table: ScaleTable, points: number): number | null {
  const p = round(points);
  if (p > table.max) return null;
  const position = (p - table.first) / table.step;
  const mana =
    scale.boundary === 'lower'
      ? p < table.first
        ? 1
        : Math.floor(position + 1e-9) + 2
      : p <= table.first
        ? 1
        : Math.ceil(position - 1e-9) + 1;
  return Math.min(tierCount(table), mana);
}

/** Les tranches écrites, de la moins chère à la plus chère : la tranche i coûte i + 1 mana. */
export function tierLabels(scale: CostScale, settings: ScaleSettings): string[] {
  const { table, values } = settings;
  const whole = scale.integer && [...Object.values(values), table.first, table.step, table.max].every(Number.isInteger);
  return Array.from({ length: tierCount(table) }, (_, i) => {
    if (scale.boundary === 'lower') {
      if (i === 0) return `< ${n(table.first)}`;
      const from = table.first + (i - 1) * table.step;
      return `${n(from)}–${n(Math.min(table.max, from + table.step))}`;
    }
    const end = Math.min(table.max, table.first + i * table.step);
    if (!whole) return `≤ ${n(end)}`;
    const start = i === 0 ? 0 : Math.min(table.max, table.first + (i - 1) * table.step) + 1;
    return start === end ? n(end) : `${n(start)}–${n(end)}`;
  });
}

export interface ScaleResult {
  readonly scale: CostScale;
  /** Les réglages du barème pour ce calcul. */
  readonly settings: ScaleSettings;
  readonly points: number;
  /** Coût en mana ; `null` hors barème. */
  readonly mana: number | null;
  readonly outOfScale: boolean;
  /** Le calcul, chiffres compris. */
  readonly detail: string;
  /** Les tranches du barème réglé. */
  readonly tiers: readonly string[];
}

/** Le coût d'un monstre dans chaque barème, avec leurs réglages (ceux d'origine par défaut), dans l'ordre de `COST_SCALES`. */
export function costScales(stats: MonsterStats, settings: ScalesSettings = DEFAULT_SCALES): readonly ScaleResult[] {
  return COST_SCALES.map((scale) => {
    const own = settings[scale.id];
    const { points, detail } = scale.points(stats, own.values);
    const mana = priceOf(scale, own.table, points);
    return { scale, settings: own, points, mana, outOfScale: mana === null, detail, tiers: tierLabels(scale, own) };
  });
}

/** Un champ de réglage d'un barème : une limite de ses tranches, ou une valeur de sa formule. */
export interface SettingField {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly initial: number;
  readonly group: 'table' | 'values';
}

/** Les champs de réglage d'un barème : ses tranches, puis les valeurs de sa formule. */
export function settingFields(scale: CostScale): SettingField[] {
  return [
    { id: 'first', label: scale.boundary === 'lower' ? '1 mana sous' : '1 mana jusqu’à', min: 0, max: 500, initial: scale.table.first, group: 'table' },
    { id: 'step', label: 'puis +1 mana tous les', min: 0.25, max: 200, initial: scale.table.step, group: 'table' },
    { id: 'max', label: 'hors barème au-delà de', min: 1, max: 2000, initial: scale.table.max, group: 'table' },
    ...scale.values.map((value) => ({ ...value, group: 'values' as const })),
  ];
}

/** Valeur saisie : un nombre (virgule ou point) dans les bornes du champ, sinon `null`. */
export function parseSettingValue(field: Pick<SettingField, 'min' | 'max'>, text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  return value >= field.min && value <= field.max ? value : null;
}

/** La valeur d'un champ dans les réglages d'un barème. */
export const settingValue = (settings: ScaleSettings, field: SettingField): number =>
  field.group === 'table' ? settings.table[field.id as keyof ScaleTable] : (settings.values[field.id] ?? field.initial);

/** Des tranches possibles : un pas positif, et la fin après la première limite. */
const validTable = (table: ScaleTable) => table.step > 0 && table.max > table.first;

/** Règle un champ d'un barème ; `null` si les tranches deviendraient impossibles (fin avant la première limite). */
export function setScaleSetting(settings: ScalesSettings, id: ScaleId, field: SettingField, value: number): ScalesSettings | null {
  const own = settings[id];
  const next: ScaleSettings =
    field.group === 'table' ? { ...own, table: { ...own.table, [field.id]: value } } : { ...own, values: { ...own.values, [field.id]: value } };
  return validTable(next.table) ? { ...settings, [id]: next } : null;
}

/** Le barème revient à ses réglages d'origine. */
export const resetScale = (settings: ScalesSettings, id: ScaleId): ScalesSettings => ({ ...settings, [id]: DEFAULT_SCALES[id] });

/** Les barèmes dont les réglages ne sont plus ceux d'origine. */
export const changedScales = (settings: ScalesSettings): ScaleId[] =>
  COST_SCALES.filter((scale) => JSON.stringify(settings[scale.id]) !== JSON.stringify(DEFAULT_SCALES[scale.id])).map((scale) => scale.id);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Réglages des barèmes lus dans un fichier ou le navigateur, vérifiés : chaque barème connu, chaque champ connu et dans
 * ses bornes, des tranches possibles. Un barème absent garde ses réglages d'origine.
 */
export function checkScales(raw: unknown): { readonly settings: ScalesSettings } | { readonly error: string } {
  if (!isRecord(raw)) return { error: 'Réglages des barèmes illisibles.' };
  let settings = DEFAULT_SCALES;
  for (const [id, entry] of Object.entries(raw)) {
    const scale = COST_SCALES.find((s) => s.id === id);
    if (!scale) return { error: `Barème inconnu : « ${id} ».` };
    if (!isRecord(entry) || !isRecord(entry.table) || !isRecord(entry.values)) return { error: `Réglages illisibles pour « ${scale.name} ».` };
    const fields = settingFields(scale);
    const read = (group: 'table' | 'values', source: Record<string, unknown>) =>
      Object.fromEntries(
        fields
          .filter((field) => field.group === group)
          .map((field) => {
            const value = source[field.id] ?? field.initial;
            return [field.id, typeof value === 'number' && value >= field.min && value <= field.max ? value : NaN];
          }),
      );
    const table = read('table', entry.table) as unknown as ScaleTable;
    const values = read('values', entry.values);
    const wrong = fields.find((field) => Number.isNaN(field.group === 'table' ? table[field.id as keyof ScaleTable] : values[field.id]));
    if (wrong) return { error: `${scale.name} : « ${wrong.label} » doit valoir de ${n(wrong.min)} à ${n(wrong.max)}.` };
    if (!validTable(table)) return { error: `${scale.name} : la fin du barème doit venir après sa première limite.` };
    settings = { ...settings, [scale.id]: { table, values } };
  }
  return { settings };
}

const SCALES_KEY = 'tcg-baremes';

/** Réglages des barèmes gardés par ce navigateur ; ceux d'origine s'il n'y en a pas ou s'ils sont illisibles. */
export function loadScalesSettings(): ScalesSettings {
  try {
    const saved = window.localStorage.getItem(SCALES_KEY);
    if (!saved) return DEFAULT_SCALES;
    const result = checkScales(JSON.parse(saved));
    return 'settings' in result ? result.settings : DEFAULT_SCALES;
  } catch {
    return DEFAULT_SCALES;
  }
}

export function saveScalesSettings(settings: ScalesSettings): void {
  try {
    window.localStorage.setItem(SCALES_KEY, JSON.stringify(settings));
  } catch {
    // Stockage indisponible : les réglages durent le temps de la page.
  }
}

export interface MeasuredType {
  readonly name: string;
  readonly stats: MonsterStats;
  /** Coût auquel il gagnerait une partie sur deux, estimé sur les trois tournois des types. */
  readonly fairPrice: number;
}

const stats = (atk: number, hp: number, mobility: number, range: number): MonsterStats => ({ atk, hp, mobility, range });

/** Les 7 types de monstres sans effet du banc d'essai, du plus cher au moins cher selon la mesure. */
export const MEASURED_TYPES: readonly MeasuredType[] = [
  { name: 'Équilibré', stats: stats(4, 4, 5, 1), fairPrice: 5.5 },
  { name: 'Tireur', stats: stats(3, 3, 4, 4), fairPrice: 5.4 },
  { name: 'Rapide équilibré', stats: stats(3, 3, 7, 1), fairPrice: 5.3 },
  { name: 'Rapide fragile', stats: stats(2, 2, 9, 1), fairPrice: 3.5 },
  { name: 'Costaud lent', stats: stats(5, 5, 3, 1), fairPrice: 3.1 },
  { name: 'Brute', stats: stats(8, 2, 3, 1), fairPrice: 1.3 },
  { name: 'Tank', stats: stats(2, 8, 3, 1), fairPrice: 0.9 },
];

export const sameStats = (a: MonsterStats, b: MonsterStats): boolean => SCALE_STATS.every((stat) => a[stat] === b[stat]);

/** Le type mesuré qui a exactement ces stats, s'il y en a un. */
export const measuredTypeOf = (value: MonsterStats): MeasuredType | undefined =>
  MEASURED_TYPES.find((type) => sameStats(type.stats, value));

export interface MonsterChoice {
  readonly cardId: CardId;
  /** Nom sans l'archétype : le groupe dit déjà le deck. */
  readonly name: string;
  readonly stats: MonsterStats;
  /** Coût actuel de la carte, effets compris. */
  readonly cost: number;
}

export interface MonsterGroup {
  readonly title: string;
  readonly monsters: readonly MonsterChoice[];
}

function monsterChoice(cardId: CardId): MonsterChoice | null {
  const card = getCard(CARDS, cardId);
  if (card.kind !== 'monster') return null;
  return { cardId, name: splitCardName(card.name).title, stats: stats(card.atk, card.hp, card.mobility, card.range), cost: card.cost };
}

/** Les monstres des decks, chacun une fois : sous le premier deck qui l'a, les cartes communes à part, à la fin. */
export function monsterGroups(): readonly MonsterGroup[] {
  const listed = new Set<CardId>(COMMON_CARDS);
  const groups: MonsterGroup[] = [];
  for (const deck of DECKS) {
    const monsters: MonsterChoice[] = [];
    for (const cardId of deck.cards) {
      if (listed.has(cardId)) continue;
      const choice = monsterChoice(cardId);
      if (!choice) continue;
      listed.add(cardId);
      monsters.push(choice);
    }
    if (monsters.length > 0) groups.push({ title: deck.name, monsters });
  }
  const commons = COMMON_CARDS.map(monsterChoice).filter((choice): choice is MonsterChoice => choice !== null);
  if (commons.length > 0) groups.push({ title: 'Cartes communes', monsters: commons });
  return groups;
}

export interface Verdict {
  readonly ok: boolean;
  readonly text: string;
}

/**
 * Survie (règles des combinaisons tirées des tournois des types, 9 novembre 2026) : un monstre doit encaisser (3 PV ou
 * plus), fuir (mobilité 6 ou plus) ou rester loin (portée 3 ou plus).
 */
export function survivalVerdict({ hp, mobility, range }: MonsterStats): Verdict {
  const ways = [
    hp >= 3 ? `encaisse (${hp} PV)` : null,
    mobility >= 6 ? `fuit (mobilité ${mobility})` : null,
    range >= 3 ? `reste loin (portée ${range})` : null,
  ].filter((way): way is string => way !== null);
  if (ways.length > 0) return { ok: true, text: `Survie : il ${ways.join(', il ')}.` };
  return {
    ok: false,
    text: 'Survie : lent et fragile, il meurt au premier coup et donne 1 VP à l’adversaire. Il lui faut une protection ou un soutien.',
  };
}

/** Action : 2 d'ATK ou plus, mobilité + portée de 5 ou plus, et ni l'ATK ni les PV au-delà du double de l'autre. */
export function actionVerdict({ atk, hp, mobility, range }: MonsterStats): Verdict {
  const reach = mobility + range;
  const balanced = atk <= 2 * hp && hp <= 2 * atk;
  let text: string;
  if (atk === 0) text = 'Action : sans ATK, il ne se bat pas. Sa valeur, c’est son effet.';
  else if (atk < 2) text = `Action : ${atk} d’ATK ne tue presque rien. Il a besoin d’un effet ou d’un bonus.`;
  else if (reach < 5) text = `Action : il frappe, mais n’atteint pas grand-chose (mobilité + portée = ${reach}).`;
  else text = `Action : il frappe et atteint ses cibles (mobilité + portée = ${reach}).`;
  if (!balanced) text += ' ATK et PV déséquilibrés : au-delà du double de l’autre, les points ne servent pas.';
  return { ok: atk >= 2 && reach >= 5 && balanced, text };
}
