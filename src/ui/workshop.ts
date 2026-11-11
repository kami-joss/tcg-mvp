// Atelier de cartes (`/atelier`) : régler le coût, les stats, la valeur des mots-clés et le coût des effets actifs des
// cartes, sans toucher aux cartes d'origine (`CARDS`). Un réglage est un écart à la carte d'origine, champ par champ ;
// les réglages se gardent dans le navigateur et s'exportent en fichier. Le reste des effets (ciblages, types d'effets,
// statuts) ne se règle pas ici (SPEC.md §9).
import { CARDS, COMMON_CARDS, DECKS } from '../engine';
import type { Card, CardId, CardSet, KeywordSpec } from '../engine';
import { KEYWORD_NAMES, splitCardName } from './cardText';
import { checkScales } from './costScales';
import type { ScalesSettings } from './costScales';

/**
 * Un champ réglable : « cost », « atk », « hp », « mobility », « range », « mot-clé.valeur » (« givre.amount »), ou le
 * coût d'un effet actif, « activated.rang.manaCost » (« activated.0.manaCost » : le premier effet actif de la carte).
 */
export type FieldId = string;

/** Les réglages d'une carte : la nouvelle valeur de chaque champ changé. */
export type CardPatch = Readonly<Record<FieldId, number>>;

/** Les réglages de l'atelier : seulement les cartes changées. */
export type WorkshopPatches = Readonly<Partial<Record<CardId, CardPatch>>>;

export interface WorkshopField {
  readonly id: FieldId;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  /** Valeur de la carte d'origine. */
  readonly original: number;
  /** Le coût d'un effet actif : son rang sur la carte (0 : le premier). */
  readonly effect?: number;
}

type StatId = 'cost' | 'atk' | 'hp' | 'mobility' | 'range';

/** Bornes larges : c'est un outil de création, pas une règle. */
const STAT_FIELDS: Readonly<Record<StatId, { readonly label: string; readonly min: number; readonly max: number }>> = {
  cost: { label: 'Coût', min: 0, max: 15 },
  atk: { label: 'ATK', min: 0, max: 30 },
  hp: { label: 'PV', min: 1, max: 40 },
  mobility: { label: 'Mobilité', min: 0, max: 15 },
  range: { label: 'Portée', min: 0, max: 10 },
};

/** Les valeurs d'un mot-clé (§5.6) : une quantité, un multiplicateur, une durée en tours (0 : jusqu'à son prochain tour). */
const KEYWORD_PARAMS: Readonly<Record<string, { readonly label: string; readonly min: number }>> = {
  amount: { label: 'valeur', min: 1 },
  multiplier: { label: 'multiplicateur', min: 1 },
  turns: { label: 'durée en tours', min: 0 },
};

const KEYWORD_MAX = 20;

/** Préfixe du coût d'un effet actif : « activated.0.manaCost ». */
const ACTIVATED = 'activated';
const effectCostId = (rank: number): FieldId => `${ACTIVATED}.${rank}.manaCost`;

/** Nom d'un effet actif dans l'atelier : le sien (« Flèche explosive »), sinon « Effet actif » (numéroté s'il y en a deux). */
export function activeEffectName(card: Card, rank: number): string {
  if (card.kind !== 'monster') return 'Effet actif';
  return card.activated[rank]?.name ?? (card.activated.length > 1 ? `Effet actif ${rank + 1}` : 'Effet actif');
}

const statsOf = (card: Card): readonly StatId[] =>
  card.kind === 'monster' ? ['cost', 'atk', 'hp', 'mobility', 'range'] : card.kind === 'terrain' ? ['cost', 'hp'] : ['cost'];

function statValue(card: Card, id: StatId): number {
  if (id === 'cost') return card.cost;
  if (id === 'hp') return card.kind === 'spell' ? 0 : card.hp;
  return card.kind === 'monster' ? card[id] : 0;
}

/**
 * Les champs réglables d'une carte : coût ; PV d'un terrain ; stats, valeurs des mots-clés et coût de chaque effet actif
 * d'un monstre.
 */
export function workshopFields(card: Card): WorkshopField[] {
  const fields: WorkshopField[] = statsOf(card).map((id) => ({ id, ...STAT_FIELDS[id], original: statValue(card, id) }));
  if (card.kind !== 'monster') return fields;
  for (const spec of card.keywords) {
    for (const [param, value] of Object.entries(spec)) {
      const meta = KEYWORD_PARAMS[param];
      if (!meta || typeof value !== 'number') continue;
      fields.push({
        id: `${spec.keyword}.${param}`,
        label: `${KEYWORD_NAMES[spec.keyword]} : ${meta.label}`,
        min: meta.min,
        max: KEYWORD_MAX,
        original: value,
      });
    }
  }
  card.activated.forEach((ability, rank) => {
    fields.push({
      ...STAT_FIELDS.cost,
      id: effectCostId(rank),
      label: `${activeEffectName(card, rank)} : coût en mana`,
      original: ability.manaCost,
      effect: rank,
    });
  });
  return fields;
}

/** La carte avec ses réglages (des champs déjà vérifiés). */
export function applyPatch(card: Card, patch: CardPatch): Card {
  let next = card;
  for (const [id, value] of Object.entries(patch)) {
    const dot = id.indexOf('.');
    if (dot < 0) {
      next = { ...next, [id]: value } as Card;
    } else if (next.kind === 'monster' && id.startsWith(`${ACTIVATED}.`)) {
      const rank = Number(id.split('.')[1]);
      next = { ...next, activated: next.activated.map((ability, i) => (i === rank ? { ...ability, manaCost: value } : ability)) };
    } else if (next.kind === 'monster') {
      const keyword = id.slice(0, dot);
      const param = id.slice(dot + 1);
      next = {
        ...next,
        keywords: next.keywords.map((spec) => (spec.keyword === keyword ? ({ ...spec, [param]: value } as KeywordSpec) : spec)),
      };
    }
  }
  return next;
}

/** Les cartes avec les réglages de l'atelier : `CARDS` lui-même s'il n'y en a pas, les cartes inchangées telles quelles. */
export function workshopCards(patches: WorkshopPatches): CardSet {
  const changed = Object.entries(patches) as [CardId, CardPatch][];
  if (changed.length === 0) return CARDS;
  return { ...CARDS, ...Object.fromEntries(changed.map(([id, patch]) => [id, applyPatch(CARDS[id], patch)])) } as CardSet;
}

/** Règle un champ ; une valeur égale à celle d'origine efface le réglage (une carte sans réglage n'est plus « modifiée »). */
export function setField(patches: WorkshopPatches, cardId: CardId, fieldId: FieldId, value: number): WorkshopPatches {
  const field = workshopFields(CARDS[cardId]).find((f) => f.id === fieldId);
  if (!field) return patches;
  const { [fieldId]: _previous, ...rest } = patches[cardId] ?? {};
  const patch = value === field.original ? rest : { ...rest, [fieldId]: value };
  const { [cardId]: _card, ...others } = patches;
  return Object.keys(patch).length > 0 ? { ...others, [cardId]: patch } : others;
}

/** La carte revient à l'original. */
export function resetCard(patches: WorkshopPatches, cardId: CardId): WorkshopPatches {
  const { [cardId]: _card, ...others } = patches;
  return others;
}

/** Valeur saisie : un entier dans les bornes du champ, sinon `null`. */
export function parseFieldValue(field: WorkshopField, text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= field.min && value <= field.max ? value : null;
}

export interface WorkshopGroup {
  readonly title: string;
  readonly cards: readonly CardId[];
}

const KIND_ORDER: Readonly<Record<Card['kind'], number>> = { monster: 0, spell: 1, terrain: 2 };

const byKind = (ids: readonly CardId[]) => [...ids].sort((a, b) => KIND_ORDER[CARDS[a].kind] - KIND_ORDER[CARDS[b].kind]);

/** Formes hors grimoire d'une carte (la chauve-souris d'Emma) : elles se règlent avec elle. */
const formsOf = (id: CardId): CardId[] =>
  (Object.values(CARDS) as Card[]).filter((card) => card.kind === 'monster' && card.formOf === id).map((card) => card.id);

/**
 * Les cartes de l'atelier : celles des decks, chacune une fois sous le premier deck qui l'a (monstres, puis sorts, puis
 * terrains), la forme d'un monstre juste après lui, et les cartes communes à la fin.
 */
export function workshopGroups(): readonly WorkshopGroup[] {
  const listed = new Set<CardId>(COMMON_CARDS);
  const groups: WorkshopGroup[] = [];
  for (const deck of DECKS) {
    const cards: CardId[] = [];
    for (const id of deck.cards) {
      if (listed.has(id)) continue;
      listed.add(id);
      cards.push(id);
      for (const form of formsOf(id)) {
        if (!listed.has(form)) {
          listed.add(form);
          cards.push(form);
        }
      }
    }
    if (cards.length > 0) groups.push({ title: deck.name, cards: byKind(cards) });
  }
  groups.push({ title: 'Cartes communes', cards: byKind(COMMON_CARDS) });
  return groups;
}

const EDITABLE: ReadonlySet<CardId> = new Set(workshopGroups().flatMap((group) => group.cards));

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** La carte répond à la recherche : son nom (archétype compris), sans accents ni majuscules. */
export function matchesQuery(cards: CardSet, cardId: CardId, query: string): boolean {
  return fold(cards[cardId].name).includes(fold(query.trim()));
}

/** Nom sans l'archétype, pour la liste. */
export const workshopTitle = (cards: CardSet, cardId: CardId): string => splitCardName(cards[cardId].name).title;

/** Les cartes réglées, par leur nom (sans archétype), dans l'ordre des réglages. */
export const workshopNames = (cards: CardSet, patches: WorkshopPatches): string[] =>
  (Object.keys(patches) as CardId[]).map((id) => workshopTitle(cards, id));

/** « 2 cartes modifiées : Clown assassin, Feria ». */
export function modifiedText(cards: CardSet, patches: WorkshopPatches): string {
  const names = workshopNames(cards, patches);
  return `${names.length} carte${names.length > 1 ? 's' : ''} modifiée${names.length > 1 ? 's' : ''} : ${names.join(', ')}`;
}

/** La partie se joue-t-elle avec des réglages de l'atelier ? */
export const hasPatches = (patches: WorkshopPatches | undefined): patches is WorkshopPatches =>
  patches !== undefined && Object.keys(patches).length > 0;

const FORMAT = 'tcg-atelier';
/** Version 2 : les réglages des barèmes peuvent suivre ceux des cartes (`scales`) ; un fichier en version 1 se lit encore. */
const VERSION = 2;

/** Fichier des réglages (export, et ce que garde le navigateur) ; `scales` : les réglages des barèmes, s'il faut les garder. */
export function exportPatches(patches: WorkshopPatches, scales?: ScalesSettings): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, cards: patches, ...(scales ? { scales } : {}) }, null, 2);
}

export type ImportResult =
  | { readonly patches: WorkshopPatches; readonly scales?: ScalesSettings }
  | { readonly error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Lit un fichier de réglages ; à la moindre erreur, rien n'est pris et l'erreur dit pourquoi. `skipGone` : une carte qui
 * n'est plus dans l'atelier (son deck a été retiré, comme Bodybuilder) est laissée de côté au lieu de tout refuser (les
 * réglages gardés par le navigateur).
 */
export function importPatches(text: string, skipGone = false): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Ce fichier n’est pas un fichier JSON valide.' };
  }
  if (!isRecord(data) || data.format !== FORMAT || (data.version !== 1 && data.version !== VERSION) || !isRecord(data.cards)) {
    return { error: 'Ce fichier ne vient pas de l’atelier, ou d’une autre version de l’atelier.' };
  }
  const scales = data.scales === undefined ? null : checkScales(data.scales);
  if (scales && 'error' in scales) return scales;
  let patches: WorkshopPatches = {};
  for (const [cardId, fields] of Object.entries(data.cards)) {
    if (!EDITABLE.has(cardId as CardId)) {
      if (skipGone) continue;
      return { error: `Carte inconnue de l’atelier : « ${cardId} ».` };
    }
    if (!isRecord(fields)) return { error: `Réglages illisibles pour « ${cardId} ».` };
    const known = new Map(workshopFields(CARDS[cardId as CardId]).map((field) => [field.id, field]));
    for (const [fieldId, value] of Object.entries(fields)) {
      const field = known.get(fieldId);
      if (!field) return { error: `« ${fieldId} » ne se règle pas sur « ${cardId} ».` };
      if (typeof value !== 'number' || !Number.isInteger(value) || value < field.min || value > field.max) {
        return { error: `${field.label} de « ${cardId} » : ${String(value)} n’est pas un entier de ${field.min} à ${field.max}.` };
      }
      patches = setField(patches, cardId as CardId, fieldId, value);
    }
  }
  return scales ? { patches, scales: scales.settings } : { patches };
}

const STORAGE_KEY = 'tcg-atelier';

/** Réglages gardés par ce navigateur ; aucun s'il n'y en a pas, si le stockage est indisponible ou s'ils sont illisibles. */
export function loadPatches(): WorkshopPatches {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return {};
    const result = importPatches(saved, true);
    return 'patches' in result ? result.patches : {};
  } catch {
    return {};
  }
}

export function savePatches(patches: WorkshopPatches): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, exportPatches(patches));
  } catch {
    // Stockage indisponible : les réglages durent le temps de la page ; l'export les garde.
  }
}
