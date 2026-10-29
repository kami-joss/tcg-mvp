// Textes des cartes pour les joueurs (SPEC.md §5, « Style des textes ») : des phrases naturelles et courtes, façon
// Hearthstone, générées à partir des données. Les mots du lexique sont balisés `{{terme|mot affiché}}` : l'interface
// les écrit en gras, avec leur définition au survol (`GLOSSARY`). Un mot n'y prend jamais un autre sens que le sien.
// La notation compacte de SPEC.md (« Actif (2 mana) · … ») reste dans `cardText.ts`, comparée aux tableaux de SPEC.md.
import type {
  Ability,
  AllyZoneEffect,
  AreaZone,
  Archetype,
  Card,
  Effect,
  KeywordSpec,
  MonsterCard,
  StatAura,
  StatusSpec,
  Targeting,
  TerrainCard,
} from '../engine';
import { ARCHETYPE_NAMES } from './cardText';

/** Mots du lexique qu'un texte de carte met en gras, et leur définition (survol). */
export const GLOSSARY = {
  piege: 'Piège : caché à l’adversaire, il se déclenche quand un monstre ennemi entre sur sa case, puis disparaît. Il disparaît aussi au début de ton prochain tour.',
  entrer: 'Entrer sur une case : y arriver en se déplaçant (à chaque case du chemin), en étant repoussé, en avançant après une attaque ou en étant invoqué. Jamais par téléportation.',
  teleporter: 'Téléportation : le monstre est posé directement sur la case, sans y entrer : rien ne s’y déclenche (ni piège, ni Passage, ni case brûlée). Ce n’est pas un déplacement : il garde sa mobilité, son attaque et son orientation.',
  repousser: 'Repousser : le monstre recule case par case et entre sur chaque case. Il s’arrête avant le premier obstacle (case bloquée, case occupée, falaise).',
  chemin: 'Chemin du tour : les cases où le monstre a été depuis le début du tour de son camp, sa case de départ comprise.',
  adjacent: 'Adjacent : une des 8 cases autour, diagonales comprises.',
  rayon: 'Rayon N : toutes les cases à N cases au plus, diagonales comprises (rayon 2 = 24 cases). Falaises et cases X coupent la zone.',
  enLigne: 'En ligne : en ligne droite, avec ligne de vue, comme une attaque.',
  auContact: 'Au contact : à 1 case en ligne droite, sans diagonale.',
  parDerriere: 'Par derrière : l’attaquant frappe dans le sens où regarde sa cible.',
  pas: 'À N pas : à N cases au plus par un chemin orthogonal, en L possible, sans ligne de vue.',
  invoquer: 'Invoquer : poser un monstre de ton grimoire sur une case. Il entre sur la case.',
  sacrifier: 'Sacrifier : le monstre quitte le plateau sans être détruit. Personne ne gagne de VP ; il va au cimetière.',
  caseBrulee: 'Case brûlée : visible des deux joueurs. Chaque monstre ennemi qui y entre en subit les effets ; elle reste jusqu’à la fin de sa durée.',
  passage: 'Passage : se déclenche à chaque case où l’ennemi entre en se déplaçant, une fois par recul. Pas sur une téléportation.',
  stun: 'Stun : plus aucune action (ni déplacement, ni attaque, ni effet actif, ni riposte).',
  slow: 'Slow N : −N mobilité. Les slow se cumulent.',
  burn: 'Burn N : perd N PV au début de chacun de ses tours touchés. Les burn se cumulent.',
  immobilise: 'Immobilisé : ne peut plus bouger (ni avancer après une attaque), mais peut attaquer et activer ses effets.',
  requiem: 'Requiem N : meurt au début de son N-ième prochain tour. Personne ne gagne de VP.',
  camouflage: 'Camouflage N : caché à l’adversaire tant qu’aucun de ses monstres ni terrains n’est dans un rayon de N.',
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;

/** Un mot du lexique dans un texte : « {{teleporter|téléporté}} ». */
const t = (term: GlossaryTerm, shown: string) => `{{${term}|${shown}}}`;

export interface RulesSegment {
  readonly text: string;
  readonly term?: GlossaryTerm;
}

/** Découpe un texte balisé en morceaux : texte simple, ou mot du lexique. */
export function rulesSegments(text: string): RulesSegment[] {
  const segments: RulesSegment[] = [];
  const pattern = /\{\{(\w+)\|([^}]*)\}\}/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    segments.push({ text: match[2]!, term: match[1] as GlossaryTerm });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

/** Le texte sans balises (bulle d'action, tests). */
export const plainRules = (text: string) => rulesSegments(text).map((s) => s.text).join('');

/** Majuscule au premier mot, même s'il est balisé (« {{teleporter|Téléporte}} … »). */
export const capitalize = (text: string) =>
  text.replace(/^(\{\{\w+\|)?(.)/, (_all, tag: string | undefined, first: string) => `${tag ?? ''}${first.toUpperCase()}`);

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Ce que vise un effet, sous toutes les formes dont une phrase a besoin. */
interface Target {
  /** « un ennemi adjacent », « les ennemis des 3 cases devant ». */
  readonly noun: string;
  /** « à un ennemi adjacent », « aux ennemis… », « à ce monstre ». */
  readonly to: string;
  /** « d’un allié », « des ennemis… », « de ce monstre ». */
  readonly of: string;
  /** Pronoms : « lui » / « leur », « le » / « les », « son » / « leur ». */
  readonly them: string;
  readonly it: string;
  readonly its: string;
}

const one = (noun: string): Target => {
  const of = noun.startsWith('un ') ? `d’${noun}` : noun.startsWith('ce ') ? `de ${noun}` : `de ${noun}`;
  return { noun, to: `à ${noun}`, of, them: 'lui', it: 'le', its: 'son' };
};

const many = (noun: string): Target => {
  const rest = noun.replace(/^les /, '');
  return {
    noun,
    to: noun.startsWith('les ') ? `aux ${rest}` : `à ${noun}`,
    of: noun.startsWith('les ') ? `des ${rest}` : `de ${noun}`,
    them: 'leur',
    it: 'les',
    its: 'leur',
  };
};

const ZONES: Readonly<Record<AreaZone, string>> = {
  front3: 'des 3 cases devant',
  adjacent: t('adjacent', 'adjacents'),
  line3: 'sur 3 cases en ligne dans la direction de ton choix',
  adjacent2: `dans un ${t('rayon', 'rayon')} de 2`,
};

const archetypeOne = (archetype: Archetype | undefined) => (archetype ? ` ${ARCHETYPE_NAMES[archetype].one}` : '');

function targetOf(targeting: Targeting): Target {
  switch (targeting.type) {
    case 'monster': {
      const who = `${targeting.side === 'ally' ? 'un allié' : 'un ennemi'}${archetypeOne(targeting.archetype)}`;
      const { reach } = targeting;
      switch (reach.type) {
        case 'anywhere':
          return one(who);
        case 'adjacent':
          return one(`${who} ${t('adjacent', 'adjacent')}`);
        case 'line':
          return one(`${who} ${t('enLigne', 'en ligne')}, portée ${reach.range}`);
        case 'nearOwnMonster':
          return one(`${who} à ${t('pas', `${reach.steps} pas`)} d’un de tes monstres`);
      }
      break;
    }
    case 'zone':
      return many(`les ennemis ${ZONES[targeting.zone]}`);
    case 'allies':
      return many(`tous tes ${ARCHETYPE_NAMES[targeting.archetype].many}`);
    case 'enemies':
      return many('tous les ennemis');
    case 'self':
    case 'trail':
      return one('ce monstre');
    case 'emptyAdjacentCell':
    case 'emptyCell':
      return one('la case');
  }
}

/** Un statut, en gras : « {{burn|burn 1}} », « {{requiem|requiem 2}} ». */
function statusWord(spec: StatusSpec): string {
  switch (spec.kind) {
    case 'slow':
    case 'burn':
      return t(spec.kind, `${spec.kind} ${spec.amount}`);
    case 'camouflage':
      return t('camouflage', `camouflage ${spec.amount}`);
    case 'requiem':
      return t('requiem', `requiem ${spec.turns}`);
    case 'stun':
      return t('stun', 'stun');
    case 'immobilise':
      return t('immobilise', 'immobilisé');
  }
}

/** Durée d'un statut, au possessif de la cible : « pendant 1 tour », « jusqu’à son prochain tour ». */
function duration(spec: StatusSpec, its: string): string {
  if (spec.kind === 'requiem') return '';
  return spec.turns === 0 ? ` jusqu’à ${its} prochain tour` : ` pendant ${plural(spec.turns, 'tour')}`;
}

/**
 * Un effet appliqué à une cible, en clause : la première fois avec la cible en toutes lettres (« inflige 2 dégâts aux
 * ennemis… »), ensuite avec un pronom (« leur inflige burn 1 pendant 1 tour »). `next` : l'effet suivant, pour écrire
 * un bonus d'ATK et de portée d'un bloc ; renvoie aussi le nombre d'effets consommés.
 */
function clause(effect: Effect, next: Effect | undefined, target: Target, first: boolean, targeting: Targeting): [string, number] {
  const to = first ? target.to : '';
  const give = (what: string, when = '') => (first ? `donne ${what} ${target.to}${when}` : `${target.them} donne ${what}${when}`);
  switch (effect.type) {
    case 'damage':
      return [first ? `inflige ${plural(effect.amount, 'dégât')} ${to}` : `${target.them} inflige ${plural(effect.amount, 'dégât')}`, 1];
    case 'heal':
      return [first ? `rend ${effect.amount} PV ${to}` : `${target.them} rend ${effect.amount} PV`, 1];
    case 'status': {
      if (effect.kind === 'camouflage') {
        const what = `${statusWord(effect)}${duration(effect, target.its)}`;
        return [first ? `donne ${what} ${target.to}` : `${target.them} donne ${what}`, 1];
      }
      if (effect.kind === 'immobilise') {
        const verb = t('immobilise', 'immobilise');
        return [first ? `${verb} ${target.noun}${duration(effect, target.its)}` : `${target.it} ${verb}${duration(effect, target.its)}`, 1];
      }
      const what = `${statusWord(effect)}${duration(effect, target.its)}`;
      return [first ? `inflige ${what} ${to}` : `${target.them} inflige ${what}`, 1];
    }
    case 'push': {
      const distance = effect.chooseDistance ? `de 1 à ${effect.distance} cases` : `de ${plural(effect.distance, 'case')}`;
      const way =
        effect.direction === 'chosen'
          ? ', dans la direction de ton choix'
          : targeting.type === 'zone' && targeting.zone === 'line3'
            ? '' // La zone dit déjà la direction : il recule dans celle-ci.
            : ', vers l’avant';
      const verb = t('repousser', 'repousse');
      return [first ? `${verb} ${distance} ${target.noun}${way}` : `${target.it} ${verb} ${distance}${way}`, 1];
    }
    case 'addMobility':
      return [give(`+${effect.amount} mobilité`, ' ce tour'), 1];
    case 'addAtkThisTurn':
      if (next?.type === 'addRangeThisTurn') return [give(`+${effect.amount} ATK et +${next.amount} portée`, ' ce tour'), 2];
      return [give(`+${effect.amount} ATK`, ' ce tour'), 1];
    case 'addRangeThisTurn':
      return [give(`+${effect.amount} portée`, ' ce tour'), 1];
    case 'multiplyAtkThisTurn': {
      const factor = effect.multiplier === 2 ? 'double' : `multiplie par ${effect.multiplier}`;
      return [first ? `${factor} l’ATK ${target.of} ce tour` : `${factor} ${target.its} ATK ce tour`, 1];
    }
    case 'addStats': {
      const bonus = [effect.atk ? `+${effect.atk} ATK` : null, effect.hp ? `+${effect.hp} PV` : null].filter(Boolean).join(' et ');
      return [first ? `donne définitivement ${bonus} ${to}` : `${target.them} donne définitivement ${bonus}`, 1];
    }
    default:
      return ['', 1];
  }
}

/** Effets enchaînés sur une même cible : « Inflige 2 dégâts aux ennemis… et leur inflige burn 1 pendant 1 tour ». */
function clauses(effects: readonly Effect[], target: Target, targeting: Targeting): string {
  const parts: string[] = [];
  for (let i = 0; i < effects.length; ) {
    const [text, used] = clause(effects[i]!, effects[i + 1], target, parts.length === 0, targeting);
    if (text) parts.push(text);
    i += used;
  }
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

/** Ce que subit l'ennemi qui entre (piège, case brûlée, Passage) : « subit 3 dégâts », « est immobilisé jusqu’à… ». */
function suffers(effects: readonly Effect[]): string {
  const parts = effects.map((effect) => {
    switch (effect.type) {
      case 'damage':
        return `subit ${plural(effect.amount, 'dégât')}`;
      case 'status':
        if (effect.kind === 'immobilise') return `est ${t('immobilise', 'immobilisé')}${duration(effect, 'son')}`;
        return `subit ${statusWord(effect)}${duration(effect, 'son')}`;
      case 'rewind':
        return `est ${t('teleporter', 'téléporté')} ${plural(effect.steps, 'case')} en arrière sur son ${t('chemin', 'chemin du tour')}, et ne peut plus se déplacer ce tour`;
      default:
        return '';
    }
  });
  // « subit 1 dégât et burn 1 » : le verbe ne se répète pas.
  const done = parts.filter(Boolean).map((part, i, all) => (i > 0 && part.startsWith('subit ') && all[i - 1]!.startsWith('subit ') ? part.slice(6) : part));
  if (done.length <= 1) return done.join('');
  return `${done.slice(0, -1).join(', ')} et ${done[done.length - 1]}`;
}

const ENEMY_ENTERS = `l’ennemi qui y ${t('entrer', 'entre')}`;

/**
 * Le texte d'un effet (sort ou effet actif d'un monstre), en phrases : « Inflige 2 dégâts à un ennemi en ligne,
 * portée 2. », « Pose un piège sur une case adjacente libre : l’ennemi qui y entre subit 3 dégâts. ».
 */
export function abilityRules(ability: Ability): string {
  const { targeting, effects } = ability;
  const first = effects[0];
  switch (first?.type) {
    case 'placeTrap':
      return `Pose un ${t('piege', 'piège')} sur une case ${t('adjacent', 'adjacente')} libre : ${ENEMY_ENTERS} ${suffers(first.effects)}.`;
    case 'burnCell':
      return `Fait d’une case libre dans un ${t('rayon', 'rayon')} de 2 une ${t('caseBrulee', 'case brûlée')} pendant ${plural(first.turns, 'tour')} : ${ENEMY_ENTERS} ${suffers(first.effects)}.`;
    case 'summon':
      return `${capitalize(t('invoquer', 'invoque'))} sur une case ${t('adjacent', 'adjacente')} libre un monstre de ton grimoire, en payant son coût. Il peut agir aussitôt.`;
    case 'teleport':
      return `${capitalize(t('teleporter', 'téléporte'))} ${targetOf(targeting).noun} sur une case ${t('adjacent', 'adjacente')} libre.`;
    case 'returnOnTrail':
      return `${capitalize(t('teleporter', 'téléporte'))} ce monstre sur une case libre de son ${t('chemin', 'chemin du tour')}. Il ne peut plus se déplacer ce tour.`;
    case 'evolve':
      return `${capitalize(t('sacrifier', 'sacrifie'))} ce monstre pour ${t('invoquer', 'invoquer')} à sa place, sans payer son coût, un monstre de ton grimoire qui en évolue. Le nouveau monstre ne peut pas agir ce tour. Pas le tour où ce monstre arrive.`;
    default:
      return `${capitalize(clauses(effects, targetOf(targeting), targeting))}.`;
  }
}

/** Un mot-clé, en une phrase (son nom et sa valeur sont écrits à côté) : « À l’attaque, inflige slow 1 à sa cible pendant 1 tour. » */
export function keywordRules(spec: KeywordSpec): string {
  switch (spec.keyword) {
    case 'riposte':
      return `Attaqué ${t('auContact', 'au contact')} et encore en vie, il inflige son ATK à l’attaquant. Une fois par tour.`;
    case 'vol':
      return 'En se déplaçant, survole les cases X et les falaises de la Scierie (pas celles de la Mine), mais pas les ennemis.';
    case 'prime':
      return `Quand il détruit un monstre : +${spec.amount} VP en plus.`;
    case 'trophee':
      return `Quand il détruit un monstre ${t('auContact', 'au contact')} : +${spec.amount} VP en plus.`;
    case 'pillage':
      return `Quand il détruit un monstre ${t('auContact', 'au contact')} : +${spec.amount} mana.`;
    case 'etendard':
      return `La mana zone qu’il occupe rapporte +${spec.amount} mana.`;
    case 'givre':
    case 'brulure': {
      const status: StatusSpec =
        spec.keyword === 'givre'
          ? { kind: 'slow', amount: spec.amount, turns: spec.turns }
          : { kind: 'burn', amount: spec.amount, turns: spec.turns };
      return `À l’attaque, inflige ${statusWord(status)} à sa cible${duration(status, 'son')}.`;
    }
    case 'siege':
      return `Dégâts ×${spec.multiplier} contre un terrain.`;
    case 'sournois':
      return `En attaquant ${t('parDerriere', 'par derrière')} : +${spec.amount} ATK pour cette attaque.`;
    case 'assassin':
      return `En attaquant ${t('parDerriere', 'par derrière')} : dégâts ×${spec.multiplier}.`;
    case 'camouflage':
      return `Caché à l’adversaire tant qu’aucun de ses monstres ni terrains n’est dans un ${t('rayon', `rayon de ${spec.amount}`)}.`;
  }
}

const alliesAround = ({ archetype }: AllyZoneEffect | StatAura) => `tes ${ARCHETYPE_NAMES[archetype].many} ${t('adjacent', 'adjacents')}`;

const statBonus = ({ atk, hp, mobility }: Pick<StatAura, 'atk' | 'hp' | 'mobility'>) => {
  const parts = [atk ? `+${atk} ATK` : null, hp ? `+${hp} PV` : null, mobility ? `+${mobility} mobilité` : null].filter(Boolean);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
};

/** Passage (terrain ou monstre) : « L’ennemi qui entre sur une case adjacente subit burn 1 pendant 1 tour. » */
const passageRules = (card: TerrainCard | MonsterCard) =>
  card.passage ? `L’ennemi qui ${t('entrer', 'entre')} sur une case ${t('adjacent', 'adjacente')} ${suffers(card.passage.effects)}.` : null;

/** Un passif d'une carte : son nom (gras sur la fiche) et sa règle. */
export interface RulesItem {
  readonly name: string;
  readonly text: string;
}

/** Les passifs d'une carte, dans l'ordre de la fiche : mots-clés, quand il détruit, aura, Passage, début de tour ; règles d'un terrain. */
export function passiveRules(card: Card): RulesItem[] {
  if (card.kind === 'spell') return [];
  if (card.kind === 'terrain') {
    return [
      card.zoneManaBonus > 0 ? { name: '', text: `La mana zone rapporte +${card.zoneManaBonus} mana.` } : null,
      card.passage ? { name: t('passage', 'Passage'), text: passageRules(card)! } : null,
      card.summonPoint ? { name: 'Point d’invocation', text: 'Sa case est une case d’invocation pour toi, tant qu’aucun monstre ne s’y trouve.' } : null,
    ].filter((item): item is RulesItem => item !== null);
  }
  const items: RulesItem[] = card.keywords.map((spec) => ({ name: keywordName(spec), text: keywordRules(spec) }));
  if (card.onKill) {
    // Il se renforce lui-même : « Il gagne définitivement +1 ATK et +1 PV. »
    const gains = card.onKill.every((effect) => effect.type === 'addStats')
      ? `Il gagne définitivement ${card.onKill.map((e) => (e.type === 'addStats' ? statBonus({ atk: e.atk, hp: e.hp, mobility: 0 }) : '')).join(' et ')}.`
      : `${capitalize(clauses(card.onKill, targetOf({ type: 'self' }), { type: 'self' }))}.`;
    items.push({ name: 'Quand il détruit une unité', text: gains });
  }
  if (card.aura) items.push({ name: 'Aura', text: `${capitalize(alliesAround(card.aura))} ont ${statBonus(card.aura)}.` });
  if (card.passage) items.push({ name: t('passage', 'Passage'), text: passageRules(card)! });
  if (card.turnStart) {
    const target = many(alliesAround(card.turnStart));
    items.push({ name: 'Début de tour', text: `Au début de ton tour, ${clauses(card.turnStart.effects, target, { type: 'self' })}.` });
  }
  return items;
}

/** Nom d'un mot-clé avec sa valeur, sans durée (elle est dans la phrase) : « Givre 1 », « Assassin ×3 ». */
function keywordName(spec: KeywordSpec): string {
  const names: Record<KeywordSpec['keyword'], string> = {
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
    camouflage: 'Camouflage',
  };
  const name = names[spec.keyword];
  switch (spec.keyword) {
    case 'riposte':
    case 'vol':
      return name;
    case 'siege':
    case 'assassin':
      return `${name} ×${spec.multiplier}`;
    case 'sournois':
      return `${name} +${spec.amount}`;
    default:
      return `${name} ${spec.amount}`;
  }
}
