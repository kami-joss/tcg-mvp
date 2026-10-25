// Fiche affichée au survol (case du plateau ou carte du grimoire), construite à partir de la vue du joueur :
// elle ne montre que ce qu'il a le droit de voir (ses propres pièges, rien du grimoire adverse).
import {
  MANA_PER_CONTROLLED_ZONE,
  MANA_ZONE_NAMES,
  VP_PER_CONTROLLED_ZONE,
  auraAtk,
  auraHp,
  auraMobility,
  auraSources,
  getAtk,
  getCard,
  getCell,
  getMonsterCard,
  getNextTurnMobility,
  getRange,
  getUnitsAt,
  getViewZoneController,
  getZoneMana,
  ownerNextTurn,
  samePos,
  statusTurnsLeft,
} from '../engine';
import type { BurningCell, Card, CardId, MonsterUnit, PlayerId, PlayerView, Position, Status, TerrainUnit, Trap, Unit } from '../engine';
import {
  FAMILY_NAMES,
  abilityExplanation,
  auraBonusText,
  capitalize,
  describeCard,
  durationText,
  effectText,
  keywordLabel,
  keywordText,
  passiveLines,
  trapLabel,
} from './cardText';
import type { IconName } from './Icon';
import { canPlay } from './interaction';
import { isWater } from './iso/scenery';

export type HoverSubject = { readonly kind: 'cell'; readonly pos: Position } | { readonly kind: 'card'; readonly cardId: CardId };

export interface SheetStat {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
}

export interface SheetChip {
  readonly text: string;
  readonly tone: 'ok' | 'warn' | 'neutral';
}

export interface SheetData {
  readonly title: string;
  readonly cost: number | null;
  /** Couleur du cadre : un joueur, ou un type de case. */
  readonly frame: PlayerId | 'card' | 'zone' | 'blocked' | 'trap';
  /** Type de la carte (fond rubis, saphir ou émeraude, comme dans le grimoire) ; `null` pour une case, un piège. */
  readonly kind: Card['kind'] | null;
  /** Illustration : celle de la carte, aux couleurs de son propriétaire s'il y en a un. */
  readonly art: { readonly cardId: CardId; readonly owner: PlayerId | null } | null;
  readonly typeIcon: IconName | null;
  readonly type: string;
  readonly stats: readonly SheetStat[];
  readonly keywords: readonly { readonly name: string; readonly text: string }[];
  readonly text: readonly string[];
  readonly effect: { readonly head: string; readonly text: string } | null;
  readonly chips: readonly SheetChip[];
}

const FACING_NAMES = { up: 'le haut', down: 'le bas', left: 'la gauche', right: 'la droite' } as const;


const empty = (title: string, frame: SheetData['frame'], type: string): SheetData => ({
  title,
  cost: null,
  frame,
  kind: null,
  art: null,
  typeIcon: null,
  type,
  stats: [],
  keywords: [],
  text: [],
  effect: null,
  chips: [],
});

/** Mots-clés : nom avec sa valeur (« Givre 1 »), puis sa définition. */
function keywordLines(card: Card): SheetData['keywords'] {
  if (card.kind !== 'monster') return [];
  return [
    ...card.keywords.map((spec) => ({ name: keywordLabel(spec), text: capitalize(keywordText(spec)) })),
    ...passiveLines(card).map((line) => ({ name: line.name, text: `${capitalize(line.rule)} : ${line.explain}` })),
  ];
}

/** « · Bodybuilder » après le type d'un monstre d'une famille (§5.1). */
const familySuffix = (card: Card) => (card.kind === 'monster' && card.family ? ` · ${FAMILY_NAMES[card.family].title}` : '');

function activatedEffect(card: Card): SheetData['effect'] {
  if (card.kind !== 'monster' || !card.activated) return null;
  const name = card.activated.name ? ` · ${card.activated.name}` : '';
  return { head: `Effet actif${name} · ${card.activated.manaCost} mana`, text: abilityExplanation(card.activated) };
}

export function getSheet(view: PlayerView, subject: HoverSubject): SheetData | null {
  return subject.kind === 'card' ? cardSheet(view, subject.cardId) : cellSheet(view, subject.pos);
}

function cardSheet(view: PlayerView, cardId: CardId): SheetData {
  const card = getCard(cardId);
  const base = { ...empty(card.name, 'card', ''), kind: card.kind, cost: card.cost, art: { cardId, owner: null } };
  const chips: SheetChip[] = [];
  const myTurn = view.activePlayer === view.viewer && view.winner === null;
  if (myTurn && card.kind === 'spell' && view.me.spellsThisTurn.includes(cardId)) {
    chips.push({ text: 'Déjà lancé ce tour : un même sort une fois par tour', tone: 'warn' });
  } else if (myTurn && view.me.mana < card.cost) chips.push({ text: `Il te manque ${card.cost - view.me.mana} mana`, tone: 'warn' });
  else if (myTurn && !canPlay(view, cardId)) chips.push({ text: 'Aucune cible possible pour l’instant', tone: 'warn' });

  switch (card.kind) {
    case 'monster':
      return {
        ...base,
        typeIcon: 'dragon-head',
        type: `Carte monstre${familySuffix(card)}`,
        stats: [
          { icon: 'broadsword', label: 'ATK', value: String(card.atk) },
          { icon: 'hearts', label: 'PV', value: String(card.hp) },
          { icon: 'walking-boot', label: 'Mobilité', value: String(card.mobility) },
          { icon: 'high-shot', label: 'Portée', value: String(card.range) },
        ],
        keywords: keywordLines(card),
        text: card.evolvesFrom ? [evolutionLine(card.evolvesFrom)] : [],
        effect: activatedEffect(card),
        chips,
      };
    case 'spell':
      return { ...base, typeIcon: 'spell-book', type: 'Carte sort · effet immédiat', text: describeCard(card), chips };
    case 'terrain':
      return {
        ...base,
        typeIcon: 'castle',
        type: 'Carte terrain',
        stats: [{ icon: 'hearts', label: 'PV', value: String(card.hp) }],
        text: describeCard(card).slice(1).concat('Se pose sur une mana zone occupée par un de tes monstres.'),
        chips,
      };
  }
}

function cellSheet(view: PlayerView, pos: Position): SheetData | null {
  const cell = getCell(view.board, pos);
  if (cell.kind === 'offBoard') return null;
  if (cell.kind === 'blocked') {
    // La rivière du Champ de bataille n'est qu'un rendu : mêmes règles qu'une case bloquée.
    const title = isWater(view.board, pos) ? 'Rivière' : 'Case bloquée';
    return { ...empty(title, 'blocked', 'Obstacle'), text: ['Infranchissable à pied (le vol la survole). Coupe aussi les tirs.'] };
  }

  const units = getUnitsAt(view, pos);
  const monster = units.find((u): u is MonsterUnit => u.kind === 'monster');
  const terrain = units.find((u): u is TerrainUnit => u.kind === 'terrain');
  if (monster) return monsterSheet(view, monster, terrain);
  if (terrain) return terrainSheet(view, terrain);

  const burning = view.burningCells.find((c) => samePos(c.pos, pos));
  if (burning) return burningSheet(view, burning);

  if (cell.manaZone) {
    const controller = getViewZoneController(view, pos);
    return {
      ...empty(MANA_ZONE_NAMES[cell.manaZone], 'zone', 'Mana zone'),
      typeIcon: 'crystal-growth',
      text: [
        `Celui qui l’occupe (monstre, ou terrain seul) gagne +${MANA_PER_CONTROLLED_ZONE} mana et +${VP_PER_CONTROLLED_ZONE} VP au début de son tour.`,
      ],
      chips: [controller ? { text: `Contrôlée par J${controller}`, tone: 'neutral' } : { text: 'Neutre : personne ne la tient', tone: 'warn' }],
    };
  }

  const trap = view.traps.find((t) => samePos(t.pos, pos));
  if (trap) return trapSheet(trap);

  if (cell.summonZoneOf !== null) {
    const p = cell.summonZoneOf;
    return {
      ...empty(`Invocation J${p}`, p, 'Zone d’invocation'),
      text: [`Le Joueur ${p} y pose ses nouveaux monstres. L’occuper bloque ses invocations.`],
    };
  }
  return null;
}

function monsterSheet(view: PlayerView, monster: MonsterUnit, terrain: TerrainUnit | undefined): SheetData {
  const card = getMonsterCard(monster.cardId);
  const mine = monster.owner === view.viewer;
  const myTurn = mine && view.activePlayer === view.viewer;
  const chips: SheetChip[] = [];
  if (myTurn) {
    chips.push(monster.hasAttacked ? { text: 'Attaque utilisée', tone: 'neutral' } : { text: 'Attaque disponible', tone: 'ok' });
    if (card.activated) {
      const ready = view.legalActions.some((a) => a.type === 'activateEffect' && a.unitId === monster.id);
      chips.push(
        monster.hasUsedEffect
          ? { text: 'Effet utilisé', tone: 'neutral' }
          : ready
            ? { text: 'Effet disponible', tone: 'ok' }
            : { text: 'Effet indisponible pour l’instant', tone: 'neutral' },
      );
    }
  }
  if (card.keywords.some((spec) => spec.keyword === 'riposte')) {
    chips.push(monster.hasRiposted ? { text: 'Riposte utilisée ce tour', tone: 'neutral' } : { text: 'Riposte prête', tone: 'ok' });
  }
  if (monster.atkBonus > 0) chips.push({ text: `+${monster.atkBonus} ATK jusqu’à la fin du tour`, tone: 'ok' });
  if (monster.rangeBonus > 0) chips.push({ text: `+${monster.rangeBonus} portée jusqu’à la fin du tour`, tone: 'ok' });
  const aura = { atk: auraAtk(view, monster), hp: auraHp(view, monster), mobility: auraMobility(view, monster) };
  if (aura.atk > 0 || aura.hp > 0 || aura.mobility > 0) {
    const sources = auraSources(view, monster).map((other) => getCard(other.cardId).name);
    chips.push({ text: `${auraBonusText(aura)} (aura${sources.length > 1 ? 's' : ''} : ${sources.join(', ')})`, tone: 'ok' });
  }
  chips.push(...statusChips(view, monster));
  if (mine && (card.keywords.some((spec) => spec.keyword === 'invisible') || monster.statuses.some((s) => s.kind === 'invisible'))) {
    chips.push(
      view.hiddenFromOpponent.includes(monster.id)
        ? { text: 'Invisible pour l’adversaire', tone: 'ok' }
        : { text: 'Visible : une unité adverse est proche', tone: 'warn' },
    );
  }
  chips.push({ text: `Regarde vers ${FACING_NAMES[monster.facing]}`, tone: 'neutral' });
  const cell = getCell(view.board, monster.pos);
  if (cell.kind === 'plain' && cell.manaZone) {
    chips.push({
      text: `Tient ${MANA_ZONE_NAMES[cell.manaZone]} : +${getZoneMana(view, monster.pos)} mana, +${VP_PER_CONTROLLED_ZONE} VP`,
      tone: 'neutral',
    });
  }
  if (terrain) chips.push({ text: `Sur ${getCard(terrain.cardId).name} (${terrain.hp} PV)`, tone: 'neutral' });

  return {
    ...empty(card.name, monster.owner, `Monstre${familySuffix(card)} · Joueur ${monster.owner}${mine ? '' : ' (adversaire)'}`),
    cost: card.cost,
    kind: 'monster',
    art: { cardId: card.id, owner: monster.owner },
    typeIcon: 'dragon-head',
    stats: [
      { icon: 'broadsword', label: 'ATK', value: String(getAtk(view, monster)) },
      { icon: 'hearts', label: 'PV', value: `${monster.hp}/${monster.maxHp}` },
      myTurn
        ? { icon: 'walking-boot', label: 'Pas rest.', value: `${monster.mobilityLeft}/${card.mobility}` }
        : { icon: 'walking-boot', label: 'Mobilité', value: String(card.mobility) },
      { icon: 'high-shot', label: 'Portée', value: String(getRange(monster)) },
    ],
    keywords: keywordLines(card),
    effect: activatedEffect(card),
    text: mine
      ? []
      : [
          `À son prochain tour : hachures orange, là où il pourra aller (mobilité ${getNextTurnMobility(monster, view.turn, view.activePlayer)}) ; rouges, là où il pourra frapper (portée ${card.range}).`,
        ],
    chips,
  };
}

function terrainSheet(view: PlayerView, terrain: TerrainUnit): SheetData {
  const card = getCard(terrain.cardId);
  const zone = getCell(view.board, terrain.pos);
  const chips: SheetChip[] = [];
  if (zone.kind === 'plain' && zone.manaZone) {
    chips.push({ text: `Tient ${MANA_ZONE_NAMES[zone.manaZone]} pour J${terrain.owner}`, tone: 'neutral' });
  }
  chips.push(...statusChips(view, terrain));
  return {
    ...empty(card.name, terrain.owner, `Terrain · Joueur ${terrain.owner}`),
    kind: 'terrain',
    cost: card.cost,
    art: { cardId: card.id, owner: terrain.owner },
    typeIcon: 'castle',
    stats: [{ icon: 'hearts', label: 'PV', value: `${terrain.hp}/${terrain.maxHp}` }],
    text: describeCard(card).slice(1),
    chips,
  };
}

/** Case brûlée (Lutin brasier) : publique ; ce qu'elle inflige et combien de temps elle dure (§10). */
function burningSheet(view: PlayerView, cell: BurningCell): SheetData {
  const what = cell.effects.map(effectText).join(' + ');
  // Tours de son camp où elle brûle encore, le tour en cours compris s'il est le sien.
  const mine = cell.owner === view.activePlayer;
  const left = Math.max(1, Math.ceil((cell.expiresAtTurn - (mine ? view.turn : view.turn + 1)) / 2));
  const until = mine
    ? left === 1
      ? 'jusqu’à la fin de ce tour'
      : `jusqu’à la fin de ce tour et ${left === 2 ? 'du prochain tour' : `des ${left - 1} prochains tours`} de J${cell.owner}`
    : left === 1
      ? `jusqu’à la fin du prochain tour de J${cell.owner}`
      : `jusqu’à la fin du ${left}e prochain tour de J${cell.owner}`;
  return {
    ...empty('Case brûlée', cell.owner, `Brûlée par ${getCard(cell.cardId).name} · Joueur ${cell.owner}`),
    typeIcon: 'flame',
    text: [`Chaque monstre ennemi qui y entre subit : ${what}. La case reste.`, `Elle brûle ${until}.`],
  };
}

function trapSheet(trap: Trap): SheetData {
  const what = trap.effects.map(effectText).join(' + ');
  return {
    ...empty(`Ton piège · ${trapLabel(trap)}`, 'trap', 'Piège caché · visible par toi seul'),
    text: [`Posé par ${getCard(trap.cardId).name}. L’ennemi qui entre ici subit : ${what}.`, 'Disparaît au début de ton prochain tour.'],
  };
}

/** Ce qu'il reste d'un statut, vu depuis le tour en cours (§5.5). */
function remainingText(view: PlayerView, unit: Unit, status: Status): string {
  const left = statusTurnsLeft(status, unit.owner, view.turn, view.activePlayer);
  if (left === 0) return durationText(0);
  if (unit.owner !== view.activePlayer) return left === 1 ? 'pendant son prochain tour' : `pendant ses ${left} prochains tours`;
  if (left === 1) return 'jusqu’à la fin de ce tour';
  return `jusqu’à la fin de ce tour et de ${left === 2 ? 'son prochain' : `ses ${left - 1} prochains`}`;
}

/** Une puce par statut en cours sur `unit`, avec ce qu'il lui reste à durer (§5 bis, §5.5). */
export function statusChips(view: PlayerView, unit: Unit): SheetChip[] {
  return unit.statuses.map((status) => {
    const until = remainingText(view, unit, status);
    switch (status.kind) {
      case 'stun':
        return { text: `Stun : aucune action ${until}`, tone: 'warn' };
      case 'immobilise':
        return { text: `Immobilisé : ne peut plus bouger ${until}`, tone: 'warn' };
      case 'slow':
        return { text: `Slow ${status.amount} : −${status.amount} mobilité ${until}`, tone: 'warn' };
      case 'burn':
        return { text: `Burn ${status.amount} : −${status.amount} PV au début de chacun de ses tours, ${until}`, tone: 'warn' };
      case 'requiem': {
        const left = Math.max(1, (status.expiresAtTurn - ownerNextTurn(view.turn, view.activePlayer, unit.owner)) / 2 + 1);
        const when = left === 1 ? 'son prochain tour' : `son ${left}e prochain tour`;
        return { text: `Requiem : meurt au début de ${when}, sans VP pour personne`, tone: 'warn' };
      }
      case 'invisible':
        return { text: `Invisible ${status.amount} (Pénombre) ${until}`, tone: 'ok' };
    }
  });
}

/** Une carte qui peut aussi arriver par l'évolution d'un autre monstre (dragons élémentaires). */
function evolutionLine(from: CardId): string {
  const source = getMonsterCard(from);
  const cost = source.activated ? ` (${source.activated.manaCost} mana)` : '';
  return `Ou par l’effet ${source.activated?.name ?? 'actif'} d’un ${source.name}${cost} : il apparaît à sa place, sans payer ce coût, et n’agit qu’au tour suivant.`;
}
