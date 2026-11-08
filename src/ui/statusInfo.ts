// Vocabulaire des statuts pour l'interface (SPEC.md §5 bis) : noms, bonus ou malus, descriptions. Un seul endroit, pour que
// la fiche, les pastilles, le journal et les textes de cartes disent la même chose.
import type { StatKey, Status, StatusKind, StatusSpec } from '../engine';
import type { IconName } from './Icon';
import { STATUS_ICONS } from './zoneMarks';

/** Les statuts qui sont des bonus ; les autres sont des malus (un statut de stat l'est selon le signe de `amount`). */
const BONUS_KINDS: ReadonlySet<StatusKind> = new Set(['camouflage', 'invisible', 'carapace', 'absorbation', 'recuperation', 'vol']);

export const isBonus = (status: StatusSpec): boolean => (status.kind === 'stat' ? status.amount > 0 : BONUS_KINDS.has(status.kind));

/** Nom d'une stat dans « ATK +2 », « mobilité −1 ». */
export const STAT_NAMES: Readonly<Record<StatKey, string>> = { atk: 'ATK', mobility: 'mobilité', range: 'portée', maxHp: 'PV max' };

/** « +2 », « −1 » (vrai signe moins). */
export const signed = (amount: number): string => (amount < 0 ? `−${-amount}` : `+${amount}`);

/** Nom d'un statut avec sa valeur : « Slow 1 », « Burn 2 », « Absorbé », « ATK +2 », « Récupération 2 ». */
export function statusLabel(status: StatusSpec): string {
  switch (status.kind) {
    case 'stun':
      return 'Stun';
    case 'immobilise':
      return 'Immobilisé';
    case 'slow':
      return `Slow ${status.amount}`;
    case 'burn':
      return `Burn ${status.amount}`;
    case 'requiem':
      return 'Requiem';
    case 'camouflage':
      return 'Camouflage';
    case 'invisible':
      return 'Invisible';
    case 'carapace':
      return 'Carapace';
    case 'silence':
      return 'Silence';
    case 'epuise':
      return 'Épuisé';
    case 'vol':
      return 'Vol';
    case 'absorbe':
      return status.amount > 1 ? `Absorbé ${status.amount}` : 'Absorbé';
    case 'absorbation':
      return status.amount > 1 ? `Absorbation ${status.amount}` : 'Absorbation';
    case 'recuperation':
      return `Récupération ${status.amount}`;
    case 'stat':
      return `${STAT_NAMES[status.stat]} ${signed(status.amount)}`;
  }
}

/** Ce que fait un statut, en une phrase (survol de la fiche et des pastilles). */
export function statusEffect(status: StatusSpec): string {
  switch (status.kind) {
    case 'stun':
      return 'aucune action possible';
    case 'immobilise':
      return 'ne peut plus se déplacer';
    case 'slow':
      return `−${status.amount} mobilité`;
    case 'burn':
      return `perd ${status.amount} PV au début de chacun de ses tours`;
    case 'requiem':
      return 'meurt au début de son deuxième tour après affectation, sans VP pour personne';
    case 'camouflage':
      return 'invisible pour l’adversaire à plus de 2 cases';
    case 'invisible':
      return 'invisible pour l’adversaire à plus de 1 case';
    case 'carapace':
      return 'la prochaine attaque subie n’inflige que 1 PV, puis la carapace disparaît';
    case 'silence':
      return 'ne peut plus activer ses effets actifs';
    case 'epuise':
      return 'ne peut pas attaquer';
    case 'vol':
      return 'peut survoler les cases X';
    case 'absorbe':
      return `perd ${status.amount} PV au début du tour adverse, que l’absorbeur gagne`;
    case 'absorbation':
      return `gagne ${status.amount} PV au début de son tour`;
    case 'recuperation':
      return `gagne ${status.amount} PV au début de son tour`;
    case 'stat':
      return `${STAT_NAMES[status.stat]} ${signed(status.amount)}`;
  }
}

/** Les statuts à afficher en pastilles : un par type (et par stat pour les statuts de stat), cumulés. */
export function groupStatuses(statuses: readonly Status[]): { readonly key: string; readonly status: Status; readonly total: number }[] {
  const groups = new Map<string, { key: string; status: Status; total: number }>();
  for (const status of statuses) {
    const key = status.kind === 'stat' ? `stat:${status.stat}` : status.kind;
    const amount = 'amount' in status ? status.amount : 0;
    const group = groups.get(key);
    if (group) group.total += amount;
    else groups.set(key, { key, status, total: amount });
  }
  return [...groups.values()];
}

/** Icône d'un statut ; un statut de stat prend l'icône de sa stat. */
export function statusIcon(status: StatusSpec): IconName {
  if (status.kind !== 'stat') return STATUS_ICONS[status.kind];
  return { atk: 'broadsword', mobility: 'walking-boot', range: 'high-shot', maxHp: 'hearts' }[status.stat] as IconName;
}
