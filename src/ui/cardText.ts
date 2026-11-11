// Notation compacte des cartes, générée à partir de leurs données avec les mots du lexique (SPEC.md §5) : le format des
// tableaux de cartes de SPEC.md (§6, §6 bis), qu'un test compare aux données. C'est la référence interne ; les joueurs
// lisent les phrases de `rulesText.ts`. Noms (`splitCardName`, `cardTitle`), noms d'effets et journal s'en servent aussi.
import { getCard, normalStatus } from '../engine';
import { statusLabel } from './statusInfo';
import type {
  Ability,
  ActivatedAbility,
  AreaZone,
  Card,
  CardSet,
  AllyZoneEffect,
  CardId,
  Effect,
  Archetype,
  Keyword,
  KeywordSpec,
  MonsterCard,
  StatAura,
  StatusSpec,
  Targeting,
  TerrainCard,
  TerrainPassage,
  Trap,
} from '../engine';

export const KEYWORD_NAMES: Readonly<Record<Keyword, string>> = {
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
  assassin: 'Attaque par surprise',
  camouflage: 'Camouflage',
  soif: 'Soif',
};

/** Durée d'un statut (§5.5) : « pendant 2 tours », « jusqu’à son prochain tour ». */
export function durationText(turns: number): string {
  return turns === 0 ? 'jusqu’à son prochain tour' : `pendant ${turns} tour${turns > 1 ? 's' : ''}`;
}

/** Mot-clé avec sa valeur, comme sur la carte : « Givre 1 », « Sournois +1 », « Attaque par surprise ×3 », « Givre 1, 2 tours ». */
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
    case 'soif':
      return `${name} ${spec.amount}`;
    case 'camouflage':
      return name;
  }
}

/** Définition d'un mot-clé avec ses valeurs (§5.6), sans majuscule initiale. */
export function keywordText(spec: KeywordSpec): string {
  switch (spec.keyword) {
    case 'riposte':
      return 'attaqué au contact et encore en vie, il inflige son ATK à l’attaquant (une fois par tour/carte).';
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
    case 'camouflage':
      return 'invisible pour l’adversaire à plus de 2 cases : tant qu’aucun monstre ni terrain adverse n’est dans un carré de 2 autour de lui.';
    case 'soif':
      return `en attaquant un monstre (pas un terrain), il récupère ${spec.amount} PV (soin sur lui-même, sans dépasser ses PV max), après les dégâts et avant une riposte.`;
  }
}

const ZONE_TEXT: Readonly<Record<AreaZone, string>> = {
  front3: '3 cases devant',
  square1: 'carré de 1',
  line3: '3 cases en ligne, direction au choix',
  square2: 'carré de 2',
  line3Diagonals: '3 cases en ligne et 2 diagonales devant, direction au choix',
};

/** Familles (§5.1) : nom sur la carte, puis au singulier et au pluriel dans un effet (« un allié bodybuilder »). */
export const ARCHETYPE_NAMES: Readonly<Record<Archetype, { readonly title: string; readonly one: string; readonly many: string }>> = {
  bodybuilder: { title: 'Bodybuilder', one: 'bodybuilder', many: 'bodybuilders' },
  archer: { title: 'Archers impériaux', one: 'archer impérial', many: 'archers impériaux' },
  dragon: { title: 'Dragons élémentaires', one: 'dragon élémentaire', many: 'dragons élémentaires' },
  piege: { title: 'Maîtres des pièges', one: 'maître des pièges', many: 'maîtres des pièges' },
  sorcier: { title: 'Sorciers du feu', one: 'sorcier du feu', many: 'sorciers du feu' },
  temps: { title: 'Explorateur du temps', one: 'explorateur du temps', many: 'explorateurs du temps' },
  vampire: { title: 'Vampire', one: 'vampire', many: 'vampires' },
};

/**
 * Nom d'une carte de deck, « Nom - Archétype » (« Feria - Sorciers du feu ») : le nom seul, et l'archétype (vide
 * pour une carte de base ou commune). L'interface les affiche sur deux lignes.
 */
export function splitCardName(name: string): { readonly title: string; readonly archetype: string } {
  const at = name.lastIndexOf(' - ');
  return at < 0 ? { title: name, archetype: '' } : { title: name.slice(0, at), archetype: name.slice(at + 3) };
}

/** Le nom d'une carte sans son archétype, pour une phrase : « un Jeune dragon élémentaire ». */
export const cardTitle = (cards: CardSet, cardId: CardId): string => splitCardName(getCard(cards, cardId).name).title;

/** Le monstre visé : « un allié dans un carré de 1 », « un ennemi en ligne, portée 2 », « un allié bodybuilder ». */
function monsterTargetText({ side, reach, archetype }: Extract<Targeting, { type: 'monster' }>): string {
  const who = `${side === 'ally' ? 'un allié' : 'un ennemi'}${archetype ? ` ${ARCHETYPE_NAMES[archetype].one}` : ''}`;
  switch (reach.type) {
    case 'anywhere':
      return who;
    case 'square1':
      return `${who} dans un carré de 1`;
    case 'line':
      return `${who} en ligne, portée ${reach.range}`;
    case 'nearOwnMonster':
      return `${who} à ${reach.steps} pas d’un de vos monstres`;
    case 'nearOwnUnit':
      return `${who} dans un carré de ${reach.square} d’une de vos unités`;
  }
}

/** Ce que vise un effet (§5.3) : un monstre, « 3 cases devant », une case, « lui-même ». */
export function targetText(targeting: Targeting): string {
  switch (targeting.type) {
    case 'monster':
      return monsterTargetText(targeting);
    case 'zone':
      return ZONE_TEXT[targeting.zone];
    case 'emptySquareCell':
      return 'une case libre, carré de 1';
    case 'self':
      return 'lui-même';
    case 'allies':
      return `tous les ${ARCHETYPE_NAMES[targeting.archetype].many} alliés`;
    case 'emptyCell':
      return 'une case libre, carré de 2';
    case 'enemies':
      return 'tous les ennemis';
    case 'enemiesNearAllies':
      return 'tous les ennemis dans un carré de 1 d’une de tes unités';
    case 'enemiesAroundAlly':
      return `un ${ARCHETYPE_NAMES[targeting.archetype].one} allié · ennemis, carré de ${targeting.square} de la cible`;
    case 'trail':
      return 'une case de son chemin du tour';
    case 'terrain':
      return 'un de ses terrains';
    case 'graveyard':
      return 'un monstre de son cimetière';
    case 'none':
      return '';
  }
}

/** Où une téléportation pose le monstre (§5.4). */
function teleportText(to: Extract<Effect, { type: 'teleport' }>['to']): string {
  switch (to?.type) {
    case undefined:
      return 'téléportation sur une case libre, carré de 1';
    case 'around':
      return `téléportation sur une case libre à ${to.square} cases au plus de la cible, sans obstacle`;
    case 'summonCell':
      return 'téléportation sur une case d’invocation libre de son camp';
    case 'ownTerrain':
      return 'téléportation sur un de ses terrains sans monstre';
  }
}

/** Les alliés d'une famille autour de la source, pour une aura ou un effet de début de tour : « bodybuilders alliés, carré de 1 ». */
function allyZoneText({ zone, archetype }: AllyZoneEffect | StatAura): string {
  const where = zone === 'cellAndSquare' ? 'sa case et carré de 1' : ZONE_TEXT[zone];
  return `${ARCHETYPE_NAMES[archetype].many} alliés, ${where}`;
}

/** Statut avec sa durée : « burn 1 pendant 1 tour », « immobilisé jusqu’à son prochain tour », « requiem ». */
export function statusText(posed: StatusSpec): string {
  const spec = normalStatus(posed); // « mobilité −1 » s'écrit « slow 1 »
  if (spec.kind === 'requiem') return 'requiem';
  // « slow 1 », « stun », « récupération 2 », « ATK +2 » : le nom du lexique (§5 bis), en minuscules sauf une stat.
  const label = statusLabel(spec);
  return `${spec.kind === 'stat' ? label : label.toLowerCase()} ${durationText(spec.turns)}`;
}

/** Un effet (§5.4) : « 2 dégâts », « soin 2 », « recul de 1 à 3 au choix, vers l’avant ». Vide pour l'évolution. */
export function effectText(cards: CardSet, effect: Effect): string {
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
      return `+${effect.amount} ATK${effect.perHpLost ? ' par PV perdu' : ''} (pour ce tour)`;
    case 'addRangeThisTurn':
      return `+${effect.amount} portée (pour ce tour)`;
    case 'arm': {
      const bonus = [effect.atk ? `+${effect.atk} ATK` : null, effect.splash ? `${effect.splash} dégât${effect.splash > 1 ? 's' : ''} aux ennemis, carré de 1 de la cible (ou d’une case vide visée)` : null];
      return `armé : prochaine attaque, ${bonus.filter(Boolean).join(' + ')}`;
    }
    case 'multiplyAtkThisTurn':
      return `ATK ×${effect.multiplier} (pour ce tour)`;
    case 'addStats': {
      const bonus = [effect.atk ? `+${effect.atk} ATK` : null, effect.hp ? `+${effect.hp} PV` : null].filter(Boolean);
      return `${bonus.join(' ')} (définitivement)`;
    }
    case 'placeTrap':
      return effect.effects.map((effect) => effectText(cards, effect)).join(' + ');
    case 'burnCell':
      return `case brûlée ${durationText(effect.turns)} : ${effect.effects.map((effect) => effectText(cards, effect)).join(' + ')}`;
    case 'summon':
      return 'invocation';
    case 'teleport':
      return teleportText(effect.to);
    case 'gainMana':
      return `+${effect.amount} mana`;
    case 'cleanse':
      return 'retire ses malus';
    case 'reanimate':
      return 'invoqué sur une case d’invocation libre de son camp, sans payer son coût';
    case 'returnOnTrail':
      return 'retour';
    case 'rewind':
      return `remonte ${effect.steps} case${effect.steps > 1 ? 's' : ''}`;
    case 'absorb':
      return 'downTo' in effect ? `absorbe tous ses PV sauf ${effect.downTo}` : `absorbe ${effect.amount} PV`;
    case 'loseHp':
      return `perd tous ses PV sauf ${effect.downTo}`;
    case 'transform':
      return `se transforme en ${cardTitle(cards, effect.into)}`;
    case 'evolve':
      return '';
  }
}

/**
 * Effets enchaînés par « + » (§5.4). Un bonus d'ATK suivi d'un bonus de portée pour ce tour s'écrit d'un bloc, comme
 * « +A ATK +P PV (définitivement) » : « +1 ATK +1 portée (pour ce tour) ».
 */
function effectsText(cards: CardSet, effects: readonly Effect[]): string {
  const parts: string[] = [];
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i]!;
    const next = effects[i + 1];
    if (effect.type === 'addAtkThisTurn' && next?.type === 'addRangeThisTurn') {
      parts.push(`+${effect.amount} ATK +${next.amount} portée (pour ce tour)`);
      i++;
    } else parts.push(effectText(cards, effect));
  }
  return parts.filter(Boolean).join(' + ');
}

/** Durée et limite d'un piège : « (3 tours adverses, un seul à la fois) » ; rien pour un piège d'un tour adverse. */
function trapQualifiers(ability: Ability): string {
  const placed = ability.effects.find((effect) => effect.type === 'placeTrap');
  if (placed?.type !== 'placeTrap') return '';
  const parts = [placed.turns && placed.turns > 1 ? `${placed.turns} tours adverses` : null, placed.single ? 'un seul à la fois' : null].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * Un effet complet au format du lexique (§5.2), sans son déclencheur : « Déflagration · 3 cases devant · 2 dégâts +
 * burn 1 pendant 1 tour ». `named` : commencer par le nom de l'effet, s'il en a un.
 */
export function abilityText(cards: CardSet, ability: Ability, named = true): string {
  // L'évolution, le retour et la transformation s'écrivent seuls (« Actif (2 mana) · Évolution », « Actif (1 mana) ·
  // retour ») : leur cible va de soi.
  const alone = ability.effects.some((effect) => ['evolve', 'returnOnTrail', 'transform', 'arm'].includes(effect.type));
  const target = alone ? '' : targetText(ability.targeting);
  const trap = ability.effects.some((effect) => effect.type === 'placeTrap');
  const { backlash }: Partial<ActivatedAbility> = ability;
  const parts = [
    named ? ability.name : undefined,
    // Un piège s'écrit « piège une case libre, carré de 1 », suivi de ce qu'il fait à l'ennemi qui y entre.
    trap ? `piège ${target}${trapQualifiers(ability)}` : target,
    effectsText(cards, ability.effects),
    // Contre-coup (§5.2) : ce que le lanceur subit en retour.
    backlash ? `contre-coup : ${effectsText(cards, backlash)}` : undefined,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Nom d'un effet actif (bulle, fiche) : le sien, sinon ce qu'il fait (« Poser une bombe », « Poser un filet », « Retour »…). */
export function effectName(ability: ActivatedAbility): string {
  if (ability.name) return ability.name;
  const effect = ability.effects[0];
  switch (effect?.type) {
    case 'placeTrap':
      if (effect.effects.some((e) => e.type === 'rewind')) return 'Poser un sablier';
      return effect.effects.some((e) => e.type === 'damage') ? 'Poser une bombe' : 'Poser un filet';
    case 'returnOnTrail':
      return 'Retour';
    case 'transform':
      return 'Se transformer';
    case 'absorb':
      return 'Absorber';
    case 'burnCell':
      return 'Mettre le feu';
    case 'heal':
      return 'Soigner';
    case 'damage':
      return 'Frapper';
    case 'summon':
      return 'Invoquer';
    case 'teleport':
      return 'Téléporter';
    case 'status':
      return effect.kind === 'burn' ? 'Embraser' : effect.kind === 'stun' ? 'Stun' : effect.kind === 'requiem' ? 'Requiem' : 'Effet actif';
    default:
      return 'Effet actif';
  }
}

/**
 * Déclencheur d'un effet actif : « Actif (3 mana) », « Actif (1 mana, sans limite par tour) » (Emma), « Actif (3 mana,
 * puis plus d'attaque ce tour) » (Zoldik).
 */
export function activatedTrigger(ability: ActivatedAbility): string {
  const limits = [ability.unlimited ? 'sans limite par tour' : null, ability.endsAttack ? 'puis plus d’attaque ce tour' : null];
  return `Actif (${[`${ability.manaCost} mana`, ...limits].filter(Boolean).join(', ')})`;
}

/** Déclencheur et effet de chaque effet actif, dans l'ordre de la carte : « Actif (3 mana) · Déflagration · … ». */
export function activatedTexts(cards: CardSet, card: MonsterCard): string[] {
  return card.activated.map((ability) => `${activatedTrigger(ability)} · ${abilityText(cards, ability)}`);
}

/** Déclencheur « Quand il détruit une unité » (§5.2) : « Quand il détruit une unité · +1 ATK +1 PV (définitivement) ». */
export function onKillText(cards: CardSet, card: MonsterCard): string | null {
  return card.onKill ? `Quand il détruit une unité · ${card.onKill.map((effect) => effectText(cards, effect)).join(' + ')}` : null;
}

/** Bonus d'une aura : « +2 ATK », « +1 ATK +1 PV +1 mobilité ». */
export function auraBonusText({ atk, hp, mobility, range, attacks, stealth, effectCost }: Pick<StatAura, 'atk' | 'hp' | 'mobility' | 'range' | 'attacks' | 'stealth' | 'effectCost'>): string {
  return [
    atk ? `+${atk} ATK` : null,
    hp ? `+${hp} PV` : null,
    mobility ? `+${mobility} mobilité` : null,
    range ? `+${range} portée` : null,
    attacks ? `${attacks} attaques par tour` : null,
    stealth ?? null,
    effectCost !== undefined ? `effets actifs à ${effectCost} mana` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Aura (§5.2) : « Aura · bodybuilders alliés, carré de 1 · +2 ATK ». */
export function auraText(card: MonsterCard | TerrainCard): string | null {
  return card.aura ? `Aura · ${card.aura.name ? `${card.aura.name} · ` : ''}${allyZoneText(card.aura)} · ${auraBonusText(card.aura)}` : null;
}

/** `no_cac` (Trébuchet des archers) : « ne peut pas attaquer au contact » ; null pour les autres cartes. */
export const noContactText = (card: MonsterCard): string | null => (card.noContact ? 'ne peut pas attaquer au contact' : null);

/** Déclencheur « Début de tour » (§5.2) : « Début de tour · bodybuilders alliés, carré de 2 · soin 1 ». */
export function turnStartText(cards: CardSet, card: MonsterCard): string | null {
  return card.turnStart
    ? `Début de tour · ${allyZoneText(card.turnStart)} · ${card.turnStart.effects.map((effect) => effectText(cards, effect)).join(' + ')}`
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
export function passiveLines(cards: CardSet, card: MonsterCard): PassiveLine[] {
  const lines: PassiveLine[] = [];
  if (card.onKill) {
    lines.push({
      name: 'Quand il détruit une unité',
      rule: card.onKill.map((effect) => effectText(cards, effect)).join(' + '),
      explain: 'chaque fois que son attaque détruit un monstre ou un terrain.',
    });
  }
  if (card.aura) {
    lines.push({
      name: card.aura.name ? `Aura · ${card.aura.name}` : 'Aura',
      rule: `${allyZoneText(card.aura)} · ${auraBonusText(card.aura)}`,
      explain: [
        `${card.aura.zone === 'square2' ? 'dans un carré de 2 autour de lui (falaises et cases X coupent la zone)' : 'dans un carré de 1 autour de lui'}, pas lui-même ; plusieurs auras se cumulent.`,
        card.aura.hp ? 'Les PV (et PV max) se gagnent en entrant dans l’aura et se perdent en la quittant, sans descendre sous 1 PV.' : null,
        card.aura.mobility ? 'La mobilité compte au début de leur tour.' : null,
        card.aura.attacks ? 'Le total est de 2 attaques par tour quel que soit le nombre d’auras ; la zone est vérifiée au moment de chaque attaque.' : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  if (card.passage) {
    lines.push({
      name: passageName(card.passage),
      rule: `${ZONE_TEXT[card.passage.zone]} · ${card.passage.effects.map((effect) => effectText(cards, effect)).join(' + ')}`,
      explain: card.passage.lingering
        ? 'chaque monstre ennemi dans un carré de 1 autour de lui le subit : quand il y entre, quand il arrive à côté de lui (une fois par déplacement), et au début de son tour s’il y est encore.'
        : 'chaque monstre ennemi qui entre dans un carré de 1 autour de lui le subit, à chaque case où il entre (une fois par recul).',
    });
  }
  if (card.turnStart) {
    lines.push({
      name: 'Début de tour',
      rule: `${allyZoneText(card.turnStart)} · ${card.turnStart.effects.map((effect) => effectText(cards, effect)).join(' + ')}`,
      explain: 'au début de chacun de vos tours, après les revenus et avant les statuts, sans dépasser leurs PV max.',
    });
  }
  return lines;
}

/**
 * Colonne « Effet » d'une carte, comme dans les tableaux de SPEC.md : mots-clés, effets passifs (quand il détruit,
 * aura, début de tour) puis effet actif, séparés par « ; » (« Vol ; Actif (3 mana) · … »), « — » sans effet. Pour un
 * sort : sa cible et ses effets.
 */
export function cardEffectLine(cards: CardSet, card: Card): string {
  switch (card.kind) {
    case 'monster': {
      const parts = [
        ...card.keywords.map(keywordLabel),
        noContactText(card),
        onKillText(cards, card),
        auraText(card),
        turnStartText(cards, card),
        passageText(cards, card),
        ...activatedTexts(cards, card),
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' ; ') : '—';
    }
    case 'spell':
      return capitalize(abilityText(cards, card.ability));
    case 'terrain': {
      const parts = [
        card.zoneManaBonus > 0 ? `La zone rapporte +${card.zoneManaBonus} mana` : null,
        auraText(card),
        passageText(cards, card),
        card.summonPoint ? SUMMON_POINT : null,
        onMoveText(cards, card),
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' ; ') : '—';
    }
  }
}

/** Mot-clé des terrains « Point d'invocation » (§5.6). */
const SUMMON_POINT = 'Point d’invocation';

/** Nom de l'effet : « Passage », ou « Zone » quand elle agit aussi sur celui qui reste et quand sa source approche (§10). */
export const passageName = (passage: TerrainPassage) => (passage.lingering ? 'Zone' : 'Passage');

/** Effet « Passage » d'un terrain ou d'un monstre, au format du lexique : « Passage · carré de 1 · 1 dégât ». */
export function passageText(cards: CardSet, card: TerrainCard | MonsterCard): string | null {
  if (!card.passage) return null;
  return `${passageName(card.passage)} · ${ZONE_TEXT[card.passage.zone]} · ${card.passage.effects.map((effect) => effectText(cards, effect)).join(' + ')}`;
}

/**
 * Effet « Au déplacement » d'un terrain : « Au déplacement · vampires alliés, sa case et carré de 1 · +1 mobilité (pour
 * ce tour) » (sans archétype : « sa case et carré de 1 »).
 */
export function onMoveText(cards: CardSet, card: TerrainCard): string | null {
  if (!card.onMove) return null;
  const { archetype } = card.onMove;
  const who = archetype ? `${ARCHETYPE_NAMES[archetype].many} alliés, sa case et carré de 1` : 'sa case et carré de 1';
  return `Au déplacement · ${who} · ${effectText(cards, { type: 'addMobility', amount: card.onMove.mobility })}`;
}

/** Nom court d'un piège : « Bombe » s'il fait des dégâts, « Filet » s'il immobilise, « Sablier » s'il fait remonter le temps. */
export function trapLabel(trap: Trap): string {
  if (trap.effects.some((effect) => effect.type === 'damage')) return 'Bombe';
  if (trap.effects.some((effect) => effect.type === 'rewind')) return 'Sablier';
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
export function describeCard(cards: CardSet, card: Card): string[] {
  switch (card.kind) {
    case 'monster': {
      return [
        `ATK ${card.atk} · PV ${card.hp} · Mob. ${card.mobility} · Portée ${card.range}`,
        ...(card.archetype ? [`Archétype ${ARCHETYPE_NAMES[card.archetype].title}.`] : []),
        ...(card.evolvesFrom ? [`Peut aussi apparaître par l’évolution d’un ${cardTitle(cards, card.evolvesFrom)}.`] : []),
        ...card.keywords.map((spec) => `Passif · ${keywordLabel(spec)} : ${keywordText(spec)}`),
        ...(card.noContact ? ['Passif · ne peut pas attaquer au contact : il ne frappe jamais une cible à 1 case en ligne droite (une cible en diagonale reste possible).'] : []),
        ...passiveLines(cards, card).map((line) => `Passif · ${line.name} · ${line.rule} : ${line.explain}`),
        ...activatedTexts(cards, card),
      ];
    }
    case 'spell':
      return [capitalize(abilityText(cards, card.ability))];
    case 'terrain': {
      const passage = passageText(cards, card);
      return [
        `PV ${card.hp} · se pose sur une mana zone occupée par un de vos monstres.`,
        ...(card.zoneManaBonus > 0 ? [`La zone rapporte +${card.zoneManaBonus} mana.`] : []),
        ...(passage
          ? [`Passif · ${passage} : chaque monstre ennemi qui entre dans un carré de 1 autour le subit, à chaque case où il entre (une fois par recul).`]
          : []),
        ...(card.aura
          ? [`Passif · ${auraText(card)} : sur la case du terrain et dans un carré de 1 ; plusieurs auras se cumulent.${card.aura.hp ? ' Les PV (et PV max) se gagnent en entrant dans l’aura et se perdent en la quittant, sans descendre sous 1 PV.' : ''}`]
          : []),
        ...(card.summonPoint
          ? [`Passif · ${SUMMON_POINT} : sa case est une case d’invocation pour vous, tant qu’aucun monstre ne s’y trouve.`]
          : []),
        ...(card.onMove
          ? [`Passif · ${onMoveText(cards, card)} : un de vos ${card.onMove.archetype ? ARCHETYPE_NAMES[card.onMove.archetype].many : 'monstres'} qui commence un déplacement sur sa case ou dans un carré de 1 a +${card.onMove.mobility} mobilité ce tour, une fois par tour.`]
          : []),
      ];
    }
  }
}
