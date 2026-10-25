// Textes des cartes, générés à partir de leurs données avec les mots du lexique (SPEC.md §5). Le format suit celui des
// tableaux de cartes de SPEC.md (§6, §6 bis) : un test vérifie qu'ils disent la même chose.
import { getCard } from '../engine';
import type {
  Ability,
  AreaZone,
  Card,
  AllyZoneEffect,
  CardId,
  Effect,
  Family,
  Keyword,
  KeywordSpec,
  MonsterCard,
  StatAura,
  StatusSpec,
  Targeting,
  TerrainCard,
  Trap,
} from '../engine';

const KEYWORD_NAMES: Readonly<Record<Keyword, string>> = {
  riposte: 'Riposte',
  vol: 'Vol',
  prime: 'Prime',
  trophee: 'Trophée',
  pillage: 'Pillage',
  etendard: 'Étendard',
  givre: 'Givre',
  brulure: 'Brûlure',
  siege: 'Siège',
  sournois: 'Sournois',
  assassin: 'Assassin',
  invisible: 'Invisible',
};

/** Durée d'un statut (§5.5) : « pendant 2 tours », « jusqu’à son prochain tour ». */
export function durationText(turns: number): string {
  return turns === 0 ? 'jusqu’à son prochain tour' : `pendant ${turns} tour${turns > 1 ? 's' : ''}`;
}

/** Mot-clé avec sa valeur, comme sur la carte : « Givre 1 », « Sournois +1 », « Assassin ×3 », « Givre 1, 2 tours ». */
export function keywordLabel(spec: KeywordSpec): string {
  const name = KEYWORD_NAMES[spec.keyword];
  switch (spec.keyword) {
    case 'riposte':
    case 'vol':
      return name;
    case 'siege':
    case 'assassin':
      return `${name} ×${spec.multiplier}`;
    case 'sournois':
      return `${name} +${spec.amount}`;
    case 'givre':
    case 'brulure':
      // La durée ne s'écrit que si elle diffère de 1 tour (§5.6).
      if (spec.turns === 1) return `${name} ${spec.amount}`;
      return `${name} ${spec.amount}, ${spec.turns === 0 ? durationText(0) : `${spec.turns} tours`}`;
    case 'prime':
    case 'trophee':
    case 'pillage':
    case 'etendard':
    case 'invisible':
      return `${name} ${spec.amount}`;
  }
}

/** Définition d'un mot-clé avec ses valeurs (§5.6), sans majuscule initiale. */
export function keywordText(spec: KeywordSpec): string {
  switch (spec.keyword) {
    case 'riposte':
      return 'attaqué au contact et encore en vie, il inflige son ATK à l’attaquant (une fois par tour).';
    case 'vol':
      return 'en se déplaçant, survole les cases X et les falaises de la Scierie (pas celles de la Mine, zone fermée), mais pas les ennemis.';
    case 'prime':
      return `quand il détruit un monstre par son attaque, +${spec.amount} VP en plus du VP habituel.`;
    case 'trophee':
      return `quand il détruit un monstre au contact par son attaque, +${spec.amount} VP en plus du VP habituel.`;
    case 'pillage':
      return `quand il détruit un monstre au contact par son attaque, +${spec.amount} mana.`;
    case 'etendard':
      return `la mana zone qu’il occupe rapporte +${spec.amount} mana.`;
    case 'givre':
      return `à l’attaque, sa cible est slow ${spec.amount} (−${spec.amount} mobilité) ${durationText(spec.turns)}.`;
    case 'brulure':
      return `à l’attaque, sa cible est burn ${spec.amount} (−${spec.amount} PV au début de chacun de ses tours) ${durationText(spec.turns)}.`;
    case 'siege':
      return `dégâts ×${spec.multiplier} contre un terrain.`;
    case 'sournois':
      return `en attaquant un monstre par derrière, +${spec.amount} ATK pour cette attaque.`;
    case 'assassin':
      return `en attaquant un monstre par derrière, dégâts ×${spec.multiplier}.`;
    case 'invisible':
      return `invisible pour l’adversaire tant qu’il est à plus de ${spec.amount} cases de ses unités et de sa zone d’invocation.`;
  }
}

const ZONE_TEXT: Readonly<Record<AreaZone, string>> = {
  front3: '3 cases devant',
  adjacent: 'adjacents',
  line3: '3 cases en ligne, direction au choix',
  adjacent2: 'adjacents, rayon 2',
};

/** Familles (§5.1) : nom sur la carte, puis au singulier et au pluriel dans un effet (« un allié bodybuilder »). */
export const FAMILY_NAMES: Readonly<Record<Family, { readonly title: string; readonly one: string; readonly many: string }>> = {
  bodybuilder: { title: 'Bodybuilder', one: 'bodybuilder', many: 'bodybuilders' },
  archer: { title: 'Archer', one: 'archer', many: 'archers' },
  dragon: { title: 'Dragon élémentaire', one: 'dragon élémentaire', many: 'dragons élémentaires' },
  piege: { title: 'Piège', one: 'monstre piège', many: 'monstres piège' },
  sorcier: { title: 'Sorcier du feu', one: 'sorcier du feu', many: 'sorciers du feu' },
};

/** Le monstre visé : « un allié adjacent », « un ennemi en ligne, portée 2 », « un allié bodybuilder ». */
function monsterTargetText({ side, reach, family }: Extract<Targeting, { type: 'monster' }>): string {
  const who = `${side === 'ally' ? 'un allié' : 'un ennemi'}${family ? ` ${FAMILY_NAMES[family].one}` : ''}`;
  switch (reach.type) {
    case 'anywhere':
      return who;
    case 'adjacent':
      return `${who} adjacent`;
    case 'line':
      return `${who} en ligne, portée ${reach.range}`;
    case 'nearOwnMonster':
      return `${who} à ${reach.steps} pas d’un de vos monstres`;
  }
}

/** Ce que vise un effet (§5.3) : un monstre, « 3 cases devant », une case, « lui-même ». */
export function targetText(targeting: Targeting): string {
  switch (targeting.type) {
    case 'monster':
      return monsterTargetText(targeting);
    case 'zone':
      return ZONE_TEXT[targeting.zone];
    case 'emptyAdjacentCell':
      return 'une case adjacente libre';
    case 'self':
      return 'lui-même';
    case 'allies':
      return `tous les ${FAMILY_NAMES[targeting.family].many} alliés`;
    case 'emptyCell':
      return 'une case libre, rayon 2';
  }
}

/** Les alliés d'une famille autour de la source, pour une aura ou un effet de début de tour : « bodybuilders alliés adjacents ». */
function allyZoneText({ zone, family }: AllyZoneEffect | StatAura): string {
  return `${FAMILY_NAMES[family].many} alliés ${ZONE_TEXT[zone]}`;
}

/** Statut avec sa durée : « burn 1 pendant 1 tour », « immobilisé jusqu’à son prochain tour », « requiem 2 ». */
export function statusText(spec: StatusSpec): string {
  if (spec.kind === 'requiem') return `requiem ${spec.turns}`;
  if (spec.kind === 'invisible') return `invisible ${spec.amount} ${durationText(spec.turns)}`;
  const name =
    spec.kind === 'slow' || spec.kind === 'burn' ? `${spec.kind} ${spec.amount}` : spec.kind === 'stun' ? 'stun' : 'immobilisé';
  return `${name} ${durationText(spec.turns)}`;
}

/** Un effet (§5.4) : « 2 dégâts », « soin 2 », « recul de 1 à 3 au choix, vers l’avant ». Vide pour l'évolution. */
export function effectText(effect: Effect): string {
  switch (effect.type) {
    case 'damage':
      return `${effect.amount} dégât${effect.amount > 1 ? 's' : ''}`;
    case 'heal':
      return `soin ${effect.amount}`;
    case 'status':
      return statusText(effect);
    case 'push': {
      const distance = effect.chooseDistance ? `recul de 1 à ${effect.distance} au choix` : `recul ${effect.distance}`;
      return `${distance}, ${effect.direction === 'chosen' ? 'direction au choix' : 'vers l’avant'}`;
    }
    case 'addMobility':
      return `+${effect.amount} mobilité (pour ce tour)`;
    case 'addAtkThisTurn':
      return `+${effect.amount} ATK (pour ce tour)`;
    case 'addRangeThisTurn':
      return `+${effect.amount} portée (pour ce tour)`;
    case 'multiplyAtkThisTurn':
      return `ATK ×${effect.multiplier} (pour ce tour)`;
    case 'addStats': {
      const bonus = [effect.atk ? `+${effect.atk} ATK` : null, effect.hp ? `+${effect.hp} PV` : null].filter(Boolean);
      return `${bonus.join(' ')} (définitivement)`;
    }
    case 'placeTrap':
      return effect.effects.map(effectText).join(' + ');
    case 'burnCell':
      return `case brûlée ${durationText(effect.turns)} : ${effect.effects.map(effectText).join(' + ')}`;
    case 'summon':
      return 'invocation';
    case 'teleport':
      return 'téléportation sur une case adjacente libre';
    case 'evolve':
      return '';
  }
}

/**
 * Effets enchaînés par « + » (§5.4). Un bonus d'ATK suivi d'un bonus de portée pour ce tour s'écrit d'un bloc, comme
 * « +A ATK +P PV (définitivement) » : « +1 ATK +1 portée (pour ce tour) ».
 */
function effectsText(effects: readonly Effect[]): string {
  const parts: string[] = [];
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i]!;
    const next = effects[i + 1];
    if (effect.type === 'addAtkThisTurn' && next?.type === 'addRangeThisTurn') {
      parts.push(`+${effect.amount} ATK +${next.amount} portée (pour ce tour)`);
      i++;
    } else parts.push(effectText(effect));
  }
  return parts.filter(Boolean).join(' + ');
}

/**
 * Un effet complet au format du lexique (§5.2), sans son déclencheur : « Déflagration · 3 cases devant · 2 dégâts +
 * burn 1 pendant 1 tour ». `named` : commencer par le nom de l'effet, s'il en a un.
 */
export function abilityText(ability: Ability, named = true): string {
  // L'évolution s'écrit seule (« Actif (2 mana) · Évolution ») : sa cible, la source, va de soi.
  const evolve = ability.effects.some((effect) => effect.type === 'evolve');
  const target = evolve ? '' : targetText(ability.targeting);
  const trap = ability.effects.some((effect) => effect.type === 'placeTrap');
  const parts = [
    named ? ability.name : undefined,
    // Un piège s'écrit « piège une case adjacente libre », suivi de ce qu'il fait à l'ennemi qui y entre.
    trap ? `piège ${target}` : target,
    effectsText(ability.effects),
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Définition de l'évolution (§5.4, §10), sans majuscule initiale. */
export const EVOLVE_TEXT =
  'sacrifie ce monstre pour invoquer à sa place un monstre de ton grimoire qui en évolue, sans payer son coût ; le nouveau monstre ne peut pas agir ce tour. Pas le tour où ce monstre est invoqué.';

/** Définition de l'invocation (§5.4, §10), sans majuscule initiale. */
export const SUMMON_TEXT =
  'invoque sur une case adjacente libre un monstre de ton grimoire, en payant aussi son coût ; il peut agir aussitôt.';

/** Définition de la téléportation (§5.4, §10), sans majuscule initiale. */
export const TELEPORT_TEXT =
  'pose un de tes monstres, où qu’il soit, sur une case adjacente libre ; il garde sa mobilité, son attaque et son orientation.';

/**
 * Explication d'un effet pour la fiche et le bandeau : sa cible et ses effets (« Un ennemi · recul 2, direction au
 * choix »), ou la définition de l'évolution, de l'invocation ou de la téléportation.
 */
export function abilityExplanation(ability: Ability): string {
  if (ability.effects.some((effect) => effect.type === 'evolve')) return capitalize(EVOLVE_TEXT);
  if (ability.effects.some((effect) => effect.type === 'summon')) return capitalize(SUMMON_TEXT);
  if (ability.effects.some((effect) => effect.type === 'teleport')) return capitalize(TELEPORT_TEXT);
  return capitalize(abilityText(ability, false));
}

/** Déclencheur et effet d'un effet actif : « Actif (3 mana) · Déflagration · … ». */
export function activatedText(card: MonsterCard): string | null {
  return card.activated ? `Actif (${card.activated.manaCost} mana) · ${abilityText(card.activated)}` : null;
}

/** Déclencheur « Quand il détruit une unité » (§5.2) : « Quand il détruit une unité · +1 ATK +1 PV (définitivement) ». */
export function onKillText(card: MonsterCard): string | null {
  return card.onKill ? `Quand il détruit une unité · ${card.onKill.map(effectText).join(' + ')}` : null;
}

/** Bonus d'une aura : « +2 ATK », « +1 ATK +1 PV +1 mobilité ». */
export function auraBonusText({ atk, hp, mobility }: Pick<StatAura, 'atk' | 'hp' | 'mobility'>): string {
  return [atk ? `+${atk} ATK` : null, hp ? `+${hp} PV` : null, mobility ? `+${mobility} mobilité` : null].filter(Boolean).join(' ');
}

/** Aura (§5.2) : « Aura · bodybuilders alliés adjacents · +2 ATK ». */
export function auraText(card: MonsterCard): string | null {
  return card.aura ? `Aura · ${allyZoneText(card.aura)} · ${auraBonusText(card.aura)}` : null;
}

/** Déclencheur « Début de tour » (§5.2) : « Début de tour · bodybuilders alliés adjacents · soin 1 ». */
export function turnStartText(card: MonsterCard): string | null {
  return card.turnStart
    ? `Début de tour · ${allyZoneText(card.turnStart)} · ${card.turnStart.effects.map(effectText).join(' + ')}`
    : null;
}

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Un effet passif hors mots-clés : son déclencheur, sa règle au format du lexique et ce qu'elle veut dire. */
export interface PassiveLine {
  readonly name: string;
  readonly rule: string;
  readonly explain: string;
}

/** Effets passifs d'un monstre hors mots-clés (§5.2) : quand il détruit une unité, aura, début de tour. */
export function passiveLines(card: MonsterCard): PassiveLine[] {
  const lines: PassiveLine[] = [];
  if (card.onKill) {
    lines.push({
      name: 'Quand il détruit une unité',
      rule: card.onKill.map(effectText).join(' + '),
      explain: 'chaque fois que son attaque détruit un monstre ou un terrain.',
    });
  }
  if (card.aura) {
    lines.push({
      name: 'Aura',
      rule: `${allyZoneText(card.aura)} · ${auraBonusText(card.aura)}`,
      explain: [
        'sur les 8 cases autour de lui, pas lui-même ; plusieurs auras se cumulent.',
        card.aura.hp ? 'Les PV (et PV max) se gagnent en entrant dans l’aura et se perdent en la quittant, sans descendre sous 1 PV.' : null,
        card.aura.mobility ? 'La mobilité compte au début de leur tour.' : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  if (card.passage) {
    lines.push({
      name: 'Passage',
      rule: `${ZONE_TEXT[card.passage.zone]} · ${card.passage.effects.map(effectText).join(' + ')}`,
      explain: 'chaque monstre ennemi qui entre sur une des 8 cases autour de lui le subit, une fois par mouvement.',
    });
  }
  if (card.turnStart) {
    lines.push({
      name: 'Début de tour',
      rule: `${allyZoneText(card.turnStart)} · ${card.turnStart.effects.map(effectText).join(' + ')}`,
      explain: 'au début de chacun de vos tours, après les revenus et le burn, sans dépasser leurs PV max.',
    });
  }
  return lines;
}

/**
 * Colonne « Effet » d'une carte, comme dans les tableaux de SPEC.md : mots-clés, effets passifs (quand il détruit,
 * aura, début de tour) puis effet actif, séparés par « ; » (« Vol ; Actif (3 mana) · … »), « — » sans effet. Pour un
 * sort : sa cible et ses effets.
 */
export function cardEffectLine(card: Card): string {
  switch (card.kind) {
    case 'monster': {
      const parts = [
        ...card.keywords.map(keywordLabel),
        onKillText(card),
        auraText(card),
        turnStartText(card),
        passageText(card),
        activatedText(card),
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' ; ') : '—';
    }
    case 'spell':
      return capitalize(abilityText(card.ability));
    case 'terrain': {
      const parts = [
        card.zoneManaBonus > 0 ? `La zone rapporte +${card.zoneManaBonus} mana` : null,
        passageText(card),
        card.summonPoint ? SUMMON_POINT : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' ; ') : '—';
    }
  }
}

/** Mot-clé des terrains « Point d'invocation » (§5.6). */
const SUMMON_POINT = 'Point d’invocation';

/** Effet « Passage » d'un terrain ou d'un monstre, au format du lexique : « Passage · adjacents · 1 dégât ». */
export function passageText(card: TerrainCard | MonsterCard): string | null {
  if (!card.passage) return null;
  return `Passage · ${ZONE_TEXT[card.passage.zone]} · ${card.passage.effects.map(effectText).join(' + ')}`;
}

/** Nom court d'un piège : « Bombe » s'il fait des dégâts, « Filet » s'il immobilise. */
export function trapLabel(trap: Trap): string {
  if (trap.effects.some((effect) => effect.type === 'damage')) return 'Bombe';
  if (trap.effects.some((effect) => effect.type === 'status' && effect.kind === 'immobilise')) return 'Filet';
  return 'Piège';
}

/** Regroupe des cartes par identifiant, dans l'ordre de première apparition. */
export function groupCards(cardIds: readonly CardId[]): { cardId: CardId; count: number }[] {
  const counts = new Map<CardId, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([cardId, count]) => ({ cardId, count }));
}

/**
 * Lignes de description d'une carte : caractéristiques, famille, effets passifs (mots-clés, quand il détruit, aura,
 * début de tour : toujours actifs) et effet actif (à activer, en payant son coût).
 */
export function describeCard(card: Card): string[] {
  switch (card.kind) {
    case 'monster': {
      const activated = activatedText(card);
      return [
        `ATK ${card.atk} · PV ${card.hp} · Mob. ${card.mobility} · Portée ${card.range}`,
        ...(card.family ? [`Famille ${FAMILY_NAMES[card.family].title}.`] : []),
        ...(card.evolvesFrom ? [`Peut aussi apparaître par l’évolution d’un ${getCard(card.evolvesFrom).name}.`] : []),
        ...card.keywords.map((spec) => `Passif · ${keywordLabel(spec)} : ${keywordText(spec)}`),
        ...passiveLines(card).map((line) => `Passif · ${line.name} · ${line.rule} : ${line.explain}`),
        ...(activated ? [activated] : []),
      ];
    }
    case 'spell':
      return [capitalize(abilityText(card.ability))];
    case 'terrain': {
      const passage = passageText(card);
      return [
        `PV ${card.hp} · se pose sur une mana zone occupée par un de vos monstres.`,
        ...(card.zoneManaBonus > 0 ? [`La zone rapporte +${card.zoneManaBonus} mana.`] : []),
        ...(passage
          ? [`Passif · ${passage} : chaque monstre ennemi qui entre sur une des 8 cases autour le subit, une fois par mouvement.`]
          : []),
        ...(card.summonPoint
          ? [`Passif · ${SUMMON_POINT} : sa case est une case d’invocation pour vous, tant qu’aucun monstre ne s’y trouve.`]
          : []),
      ];
    }
  }
}
