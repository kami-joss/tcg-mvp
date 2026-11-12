// Infobulle d'un jeton (refonte de la fiche, option J validée le 2026-11-11) : l'état de l'unité dans la partie, que la
// fiche ne montre plus (elle ne dit que ce que fait la carte). Au survol du jeton : ce qu'il peut encore faire ce tour
// (attaque, chaque effet actif, riposte), sa menace s'il est à l'adversaire, ses statuts avec leur durée, puis les
// effets en cours (bonus du tour, aura, armé, camouflage, zone tenue, terrain…), et ses stats du moment comme sur la
// fiche (2026-11-12). Pure et testée ; tirée de la vue du
// joueur seulement. La pastille au-dessus du jeton (`readiness`) résume les deux premières lignes.
import {
  MANA_ZONE_NAMES,
  VP_PER_CONTROLLED_ZONE,
  attackAvailability,
  attackLimit,
  auraAtk,
  auraHp,
  auraMobility,
  auraRange,
  auraSources,
  auraStealth,
  effectAvailability,
  getCard,
  getCell,
  getMonsterCard,
  getNextTurnMobility,
  getUnitsAt,
  getViewZoneStatus,
  getZoneMana,
  getZoneOf,
  ownerNextTurn,
  pendingOnMove,
  statusTurnsLeft,
} from '../engine';
import type { CardSet, EffectSource, MonsterUnit, PlayerId, PlayerView, Position, Status, TerrainUnit, TurnBonus, Unit, UnitId } from '../engine';
import { auraBonusText, cardTitle, durationText, splitCardName } from './cardText';
import type { IconName } from './Icon';
import { OK, ZONE_ICONS, activeName, availabilityStatus, getSheet, reasonStatus, subjectAt, zoneIncome } from './sheet';
import type { ChipKind, SheetChip, SheetLine, SheetStat } from './sheet';
import { isBonus, statusEffect, statusIcon, statusLabel } from './statusInfo';

export interface UnitTip {
  /** Nom de la carte (sans l'archétype). */
  readonly title: string;
  readonly owner: PlayerId;
  /** « ton tour », « tour adverse », « adversaire ». */
  readonly when: string;
  /** Ses stats du moment, comme sur la fiche (bonus et malus par rapport à la carte) ; un terrain : ses PV. */
  readonly stats: readonly SheetStat[];
  /** Attaque, effets actifs, riposte ; menace d'un monstre adverse. */
  readonly lines: readonly SheetLine[];
  /** Statuts (avec les tours qu'il leur reste), puis effets en cours. */
  readonly chips: readonly SheetChip[];
}

/** Ce que le jeton peut encore faire ce tour : la pastille au-dessus de lui (son camp, à son tour seulement). */
export interface Readiness {
  readonly attack: boolean;
  readonly effect: boolean;
}

/** Monstre à soi, pendant son tour, partie en cours. */
const isMyTurn = (view: PlayerView, unit: Unit) =>
  unit.owner === view.viewer && view.activePlayer === view.viewer && view.winner === null;

/** La pastille d'un jeton : `null` si rien n'y est (pas son tour, ou plus rien à faire ce tour). */
export function readiness(view: PlayerView, unitId: UnitId): Readiness | null {
  const unit = view.units[unitId];
  if (!unit || unit.kind !== 'monster' || !isMyTurn(view, unit)) return null;
  const card = getMonsterCard(view.cards, unit.cardId);
  const attack = attackAvailability(view, unitId).ok;
  const effect = card.activated.some((_, i) => effectAvailability(view, unitId, i)?.ok === true);
  return attack || effect ? { attack, effect } : null;
}

export function getUnitTip(view: PlayerView, unitId: UnitId): UnitTip | null {
  const unit = view.units[unitId];
  if (!unit) return null;
  const { title } = splitCardName(getCard(view.cards, unit.cardId).name);
  const mine = unit.owner === view.viewer;
  const when = mine ? (view.activePlayer === view.viewer ? 'ton tour' : 'tour adverse') : 'adversaire';
  const stats = getSheet(view, { kind: 'unit', unitId })?.stats ?? [];
  if (unit.kind === 'terrain') return { title, owner: unit.owner, when, stats, lines: [], chips: terrainChips(view, unit) };
  return { title, owner: unit.owner, when, stats, lines: monsterLines(view, unit), chips: monsterChips(view, unit) };
}

/** Attaque et effets actifs (à son tour), riposte ; menace d'un monstre adverse au prochain tour. */
function monsterLines(view: PlayerView, monster: MonsterUnit): SheetLine[] {
  const card = getMonsterCard(view.cards, monster.cardId);
  const lines: SheetLine[] = [];
  if (isMyTurn(view, monster)) {
    const attack = attackAvailability(view, monster.id);
    const status = attack.ok
      ? OK
      : attack.reason.kind === 'noTarget'
        ? { text: 'Aucune cible depuis cette case', tone: 'off' as const }
        : reasonStatus(attack.reason, 'Utilisée ce tour');
    lines.push({ icon: 'broadsword', label: 'Attaque', status });
    card.activated.forEach((_, i) => {
      const availability = effectAvailability(view, monster.id, i);
      if (!availability) return;
      lines.push({
        icon: 'magic-swirl',
        label: activeName(card, i) ?? 'Effet actif',
        status: availabilityStatus(availability, 'Déjà utilisé ce tour'),
      });
    });
  } else if (monster.owner !== view.viewer) {
    const mobility = getNextTurnMobility(view.cards, monster, view.turn, view.activePlayer);
    lines.push({
      icon: 'crosshair',
      label: 'Menace',
      status: { text: `Prochain tour : mobilité ${mobility}, portée ${card.range}`, tone: 'info' },
    });
  }
  if (card.keywords.some((spec) => spec.keyword === 'riposte')) {
    lines.push({
      icon: 'shield',
      label: 'Riposte',
      status: monster.hasRiposted ? { text: 'Utilisée ce tour', tone: 'off' } : { text: 'Prête', tone: 'ok' },
    });
  }
  return lines;
}

/** Effets en cours d'un terrain : ses statuts, la mana zone qu'il tient, le monstre posé dessus. */
function terrainChips(view: PlayerView, terrain: TerrainUnit): SheetChip[] {
  const chips: SheetChip[] = [...statusChips(view, terrain)];
  const zone = getCell(view.board, terrain.pos);
  if (zone.kind === 'plain' && zone.manaZone) {
    const name = MANA_ZONE_NAMES[zone.manaZone];
    chips.push(effect(ZONE_ICONS[zone.manaZone], name, `Tient ${name} pour J${terrain.owner}`, 'zone'));
  }
  const above = getUnitsAt(view, terrain.pos).find((u) => u.kind === 'monster');
  if (above) {
    const name = getCard(view.cards, above.cardId).name;
    chips.push(effect('dragon-head', name, `Sous ${name} (J${above.owner})`, 'terrain'));
  }
  return chips;
}

/** Puce de la mana zone où se trouve un monstre : celle qu'il tient, contestée, ou tenue par l'adversaire. */
function zoneChip(view: PlayerView, monster: MonsterUnit): SheetChip | null {
  const area = getZoneOf(view.board, view.mode, monster.pos);
  if (!area) return null;
  const name = MANA_ZONE_NAMES[area.zone];
  const { controller, contested } = getViewZoneStatus(view, area.pos);
  // La puce ne montre que le nom de la zone (§10) ; contestée ou tenue par l'adversaire, elle est en alerte.
  if (contested) return effect(ZONE_ICONS[area.zone], name, `${name} contestée : ni mana ni VP pour personne, pas de terrain`, 'warn');
  if (controller === null) return null;
  if (controller !== monster.owner) {
    return effect(ZONE_ICONS[area.zone], name, `${name} tenue par J${controller} : il faut y avoir plus de monstres, et détruire son terrain s’il y en a un`, 'warn');
  }
  return effect(ZONE_ICONS[area.zone], name, `Tient ${name} : ${zoneIncome(getZoneMana(view, area.pos, controller))}, +${VP_PER_CONTROLLED_ZONE} VP`, 'zone');
}

/** Nom d'une source : son effet s'il en a un (« Dopage », « Passage »), sinon la carte (« Charge »). */
export const sourceName = (cards: CardSet, source: EffectSource) => source.effect ?? cardTitle(cards, source.cardId);

/** « (Jean Bon) » : la carte d'un effet nommé ; rien quand le nom est déjà celui de la carte. */
const sourceCard = (cards: CardSet, source: EffectSource) => (source.effect ? ` (${cardTitle(cards, source.cardId)})` : '');

function turnBonusChip(cards: CardSet, { source, atk, range, mobility }: TurnBonus): SheetChip {
  const now = [atk > 0 ? `+${atk} ATK` : null, range > 0 ? `+${range} portée` : null].filter(Boolean).join(' ');
  const parts = [now ? `${now} jusqu’à la fin du tour` : null, mobility > 0 ? `+${mobility} mobilité ce tour` : null].filter(Boolean);
  const icon: IconName = atk > 0 ? 'broadsword' : range > 0 ? 'high-shot' : 'sprint';
  return effect(icon, sourceName(cards, source), `${parts.join(', ')}${sourceCard(cards, source)}`, 'boost');
}

const effect = (icon: IconName, text: string, detail: string, kind: ChipKind): SheetChip => ({ icon, text, detail, kind, group: 'effect' });

/** « Effets en cours » d'un monstre : ses statuts, puis les effets qui le touchent (bonus du tour, auras, plateau, camouflage, zone, terrain). */
function monsterChips(view: PlayerView, monster: MonsterUnit): SheetChip[] {
  const card = getMonsterCard(view.cards, monster.cardId);
  const terrain = getUnitsAt(view, monster.pos).find((u): u is TerrainUnit => u.kind === 'terrain');
  const chips: SheetChip[] = [...statusChips(view, monster)];
  // Bonus du tour, un par source : son nom (« Dopage », « Charge »), le bonus et la carte au survol.
  for (const bonus of monster.turnBonuses) chips.push(turnBonusChip(view.cards, bonus));
  // Dans la zone d'un Terrain de chasse allié, son +1 l'attend (à son tour, s'il n'est pas encore parti d'une telle zone).
  const hunt = monster.owner === view.viewer && view.activePlayer === view.viewer ? pendingOnMove(view, monster) : null;
  if (hunt) {
    const detail = `+${hunt.onMove.mobility} mobilité en commençant un déplacement ici, une fois par tour`;
    chips.push(effect('sprint', cardTitle(view.cards, hunt.unit.cardId), detail, 'boost'));
  }
  const limit = attackLimit(view, monster);
  const aura = {
    atk: auraAtk(view, monster),
    hp: auraHp(view, monster),
    mobility: auraMobility(view, monster),
    range: auraRange(view, monster),
    attacks: limit > 1 ? limit : 0,
    stealth: auraStealth(view, monster) >= 2 ? ('camouflage' as const) : auraStealth(view, monster) === 1 ? ('invisible' as const) : undefined,
  };
  if (monster.armed) {
    const { atk, splash, source } = monster.armed;
    const bonus = [atk ? `+${atk} ATK` : null, splash ? `${splash} dégât aux ennemis du carré de 1 de la cible` : null].filter(Boolean).join(', ');
    chips.push(effect('crosshair', 'Armé', `Sa prochaine attaque de ce tour : ${bonus}${sourceCard(view.cards, source)}`, 'boost'));
  }
  if (aura.atk > 0 || aura.hp > 0 || aura.mobility > 0 || aura.range > 0 || aura.attacks > 0 || aura.stealth !== undefined) {
    const sources = auraSources(view, monster).map((other) => getCard(view.cards, other.cardId).name);
    chips.push(effect('aura', 'Aura', `${auraBonusText(aura)} (${sources.join(', ')})`, 'boost'));
  }
  // Camouflage par mot-clé (Pénombre le donne en statut, avec sa puce) : caché ou repéré, vu par son joueur.
  const mine = monster.owner === view.viewer;
  const camouflage = card.keywords.find((spec) => spec.keyword === 'camouflage');
  const auraRadius = auraStealth(view, monster);
  if (mine && (camouflage || auraRadius > 0) && !monster.statuses.some((s) => s.kind === 'camouflage' || s.kind === 'invisible')) {
    const radius = Math.max(camouflage ? 2 : 0, auraRadius);
    chips.push(
      view.hiddenFromOpponent.includes(monster.id)
        ? effect('eye-slash', 'Camouflé', `Invisible pour l’adversaire : aucun de ses monstres ni terrains dans un carré de ${radius}`, 'info')
        : effect('eye', 'Repéré', `Visible : un monstre ou un terrain adverse est dans un carré de ${radius}`, 'warn'),
    );
  }
  const zone = zoneChip(view, monster);
  if (zone) chips.push(zone);
  if (terrain) {
    const name = getCard(view.cards, terrain.cardId).name;
    chips.push(effect('castle', name, `Sur ${name} (${terrain.hp} PV)`, 'terrain'));
  }
  return chips;
}

/** Ce qu'il reste d'un statut, vu depuis le tour en cours (§5.5). */
function remainingText(view: PlayerView, unit: Unit, status: Status): string {
  const left = statusTurnsLeft(status, unit.owner, view.turn, view.activePlayer);
  if (left === 0) return durationText(0);
  if (unit.owner !== view.activePlayer) return left === 1 ? 'pendant son prochain tour' : `pendant ses ${left} prochains tours`;
  if (left === 1) return 'jusqu’à la fin de ce tour';
  return `jusqu’à la fin de ce tour et de ${left === 2 ? 'son prochain' : `ses ${left - 1} prochains`}`;
}

/** Couleur de la puce : bonus en vert, malus selon leur nature (froid pour le slow, braise pour le burn), alerte sinon. */
function statusChipKind(status: Status): ChipKind {
  if (status.kind === 'slow') return 'frost';
  if (status.kind === 'burn') return 'burn';
  if (status.kind === 'camouflage' || status.kind === 'invisible' || status.kind === 'carapace') return 'info';
  return isBonus(status) ? 'boost' : 'warn';
}

/** Une puce par statut en cours sur `unit` : son nom ; au survol, son effet et ce qu'il lui reste à durer (§5 bis, §5.5). */
export function statusChips(view: PlayerView, unit: Unit): SheetChip[] {
  return unit.statuses.map((status) => ({
    icon: statusIcon(status),
    text: statusLabel(status),
    detail: statusText(view, unit, status),
    kind: statusChipKind(status),
    group: 'status',
    // Requiem compte ses tours à part (il tue au début du N-ième) : son détail le dit.
    ...(status.kind === 'requiem' ? {} : { turns: statusTurnsLeft(status, unit.owner, view.turn, view.activePlayer) }),
  }));
}

function statusText(view: PlayerView, unit: Unit, status: Status): string {
  const until = remainingText(view, unit, status);
  switch (status.kind) {
    case 'requiem': {
      const left = Math.max(1, (status.expiresAtTurn - ownerNextTurn(view.turn, view.activePlayer, unit.owner)) / 2 + 1);
      const when = left === 1 ? 'son prochain tour' : `son ${left}e prochain tour`;
      return `Requiem : meurt au début de ${when}, sans VP pour personne`;
    }
    case 'carapace':
      return `Carapace : ${statusEffect(status)} ; sinon ${until}`;
    case 'camouflage':
    case 'invisible': {
      const radius = status.kind === 'invisible' ? 1 : 2;
      const seen = unit.owner === view.viewer && !view.hiddenFromOpponent.includes(unit.id);
      return `${statusLabel(status)} ${until} : invisible pour l’adversaire sans monstre ni terrain à lui dans un carré de ${radius}${seen ? ' (repéré en ce moment)' : ''}`;
    }
    default:
      return `${statusLabel(status)} : ${statusEffect(status)} ${until}`;
  }
}

/** L'infobulle de l'unité d'une case (le monstre avant le terrain), ou `null` s'il n'y en a pas. */
export function getTipAt(view: PlayerView, pos: Position): UnitTip | null {
  const subject = subjectAt(view, pos);
  return subject.kind === 'unit' ? getUnitTip(view, subject.unitId) : null;
}
