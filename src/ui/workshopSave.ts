// Enregistrer les réglages de l'atelier dans le projet (étape 4, en développement seulement) : le fichier des cartes
// réécrit avec les cartes réglées, et leurs lignes dans les tableaux de cartes de SPEC.md (§6, §6 bis), qu'un test compare
// aux données. Calcul pur ; le serveur de développement (`vite.config.ts`) lit SPEC.md et écrit les fichiers.
import { CARDS } from '../engine';
import type { Card, CardId, CardSet } from '../engine';
import { cardsModuleSource } from '../engine/cardsSource';
import { cardEffectLine } from './cardText';
import { importPatches, workshopCards } from './workshop';

/** Les fichiers écrits, depuis la racine du projet. */
export const CARDS_FILE = 'src/engine/cards.data.ts';
export const SPEC_FILE = 'SPEC.md';

/** Les tableaux de SPEC.md écrivent l'apostrophe droite, le jeu l'apostrophe typographique. */
const straight = (text: string) => text.replace(/’/g, "'").trim();

/** Colonnes chiffrées des tableaux de cartes, comme dans le test qui les compare aux données. */
const STAT_COLUMNS: Readonly<Record<string, (card: Card) => number | undefined>> = {
  Coût: (card) => card.cost,
  ATK: (card) => (card.kind === 'monster' ? card.atk : undefined),
  PV: (card) => (card.kind === 'spell' ? undefined : card.hp),
  'Mob.': (card) => (card.kind === 'monster' ? card.mobility : undefined),
  Portée: (card) => (card.kind === 'monster' ? card.range : undefined),
};

/**
 * SPEC.md avec les lignes des cartes `changed` à jour : coût et stats, et la colonne « Effet » quand elle est le texte
 * tiré des données (mots-clés et leurs valeurs). Les autres lignes ne bougent pas d'un caractère.
 */
export function specWithCards(spec: string, before: CardSet, after: CardSet, changed: readonly CardId[]): string {
  const byName = new Map(changed.map((id) => [straight(before[id].name), id]));
  let header: string[] | null = null;
  return spec
    .split('\n')
    .map((line) => {
      if (!line.startsWith('|')) {
        header = null;
        return line;
      }
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      if (cells[0] === 'Carte') {
        header = cells;
        return line;
      }
      const id = header && !cells[0]?.startsWith('---') ? byName.get(straight(cells[0] ?? '')) : undefined;
      if (!header || !id) return line;
      const old = before[id];
      const next = after[id];
      const updated = header.map((column, i) => {
        const cell = cells[i] ?? '';
        const stat = STAT_COLUMNS[column];
        if (stat) return String(stat(next) ?? cell);
        if (column === 'Effet' && straight(cell) === straight(cardEffectLine(before, old))) return straight(cardEffectLine(after, next));
        return cell;
      });
      return `| ${updated.join(' | ')} |`;
    })
    .join('\n');
}

export type SaveResult =
  | { readonly files: Readonly<Record<string, string>>; readonly cards: readonly CardId[] }
  | { readonly error: string };

/**
 * Ce qu'enregistre l'atelier, à partir de ses réglages (le format du fichier exporté, vérifié comme à l'import) : le
 * fichier des cartes réglées et SPEC.md. Après l'enregistrement, ces cartes sont les cartes d'origine.
 */
export function saveToProject(text: string, spec: string): SaveResult {
  const result = importPatches(text);
  if ('error' in result) return result;
  const changed = Object.keys(result.patches) as CardId[];
  if (changed.length === 0) return { error: 'Aucun réglage à enregistrer.' };
  const after = workshopCards(result.patches);
  return {
    files: { [CARDS_FILE]: cardsModuleSource(after), [SPEC_FILE]: specWithCards(spec, CARDS, after, changed) },
    cards: changed,
  };
}
