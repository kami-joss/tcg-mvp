// Le fichier des cartes (`cards.data.ts`), écrit à partir d'un jeu de cartes : c'est ce que l'atelier enregistre dans le
// projet (étape 4), et la forme exacte du fichier versionné (un test le vérifie), pour qu'un enregistrement sans
// changement ne change rien. Données pures : pas de fonction, chaque carte en entier.
import type { CardSet } from './types';

/** Largeur au-delà de laquelle un objet ou une liste passe sur plusieurs lignes. */
const WIDTH = 120;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const key = (name: string) => (IDENTIFIER.test(name) ? name : quote(name));

function quote(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/** Une valeur de données en TypeScript, sur une ligne si elle tient dans la largeur, sinon une entrée par ligne. */
function print(value: unknown, indent: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => print(item, inner));
    const flat = `[${items.join(', ')}]`;
    if (!flat.includes('\n') && indent.length + flat.length <= WIDTH) return flat;
    return `[\n${items.map((item) => `${inner}${item},`).join('\n')}\n${indent}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const items = entries.map(([name, v]) => `${key(name)}: ${print(v, inner)}`);
    const flat = `{ ${items.join(', ')} }`;
    if (!flat.includes('\n') && indent.length + flat.length <= WIDTH) return flat;
    return `{\n${items.map((item) => `${inner}${item},`).join('\n')}\n${indent}}`;
  }
  throw new Error(`Valeur impossible à écrire dans le fichier des cartes : ${String(value)}`);
}

const HEADER = `// Les cartes du jeu, décrites en données avec les mots du lexique (SPEC.md §5, §6, §6 bis).
// Fichier écrit par l'atelier de cartes (« Enregistrer dans le projet », page /atelier) : il fait foi pour les données
// des cartes. Il peut aussi se modifier à la main (nouvelle carte, effet) ; l'atelier le réécrit dans cette forme.
// Rappels : les dragons élémentaires arrivent aussi par l'Évolution draconique d'un Jeune dragon ; la chauve-souris
// d'Emma est une forme hors grimoire (\`formOf\`) ; les cartes sans deck gardent leurs données pour leurs mécaniques.
import type { CardSet } from './types';
`;

/** Le fichier `cards.data.ts` de ces cartes. */
export function cardsModuleSource(cards: CardSet): string {
  const body = Object.entries(cards)
    .map(([id, card]) => `  ${key(id)}: ${print(card, '  ')},`)
    .join('\n');
  return `${HEADER}\nexport const CARD_DATA: CardSet = {\n${body}\n};\n`;
}
