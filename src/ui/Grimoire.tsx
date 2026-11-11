// Grimoire du joueur actif (SPEC.md §7) : coût, type, nombre d'exemplaires, caractéristiques, en trois sections
// (monstres, sorts, terrains ; une section vide disparaît).
// Deux affichages (refonte du 2026-11-11), choisis par les boutons de l'en-tête : la liste, par défaut (une ligne par
// carte : coût, vignette de l'illustration, nom, stats d'un monstre ou, si la carte n'est pas jouable, pourquoi), ou
// des tuiles illustrées, 2 par ligne. L'affichage règle aussi la largeur de son panneau, qui flotte à droite du plateau
// et se replie contre le bord par son onglet (`GrimoireTab`, handoff V11, lot 13 §4).
// Tuiles illustrées au format 3:4 (handoff V8, lot 9) : l'illustration cadrée sur les yeux, coût en haut à gauche, type
// et exemplaires en haut à droite, nom et caractéristiques en bas. Jouable : liseré vert ; injouable : ternie ;
// choisie : anneau doré ; montrée par la fiche : anneau blanc. En liste, des lignes sobres : jouable, la pastille de
// coût est bleue ; injouable, la ligne est ternie et sa vignette grisée. Clic : la sélectionner (cases dorées) ; clic droit : sa
// bulle d'action (l'invoquer, la lancer, la poser, ou pourquoi elle ne peut pas l'être).
// Overframes et exemplaires brillants (handoff V11, §6.2 du handoff overframe) : pas de débordement dans la grille ; au
// repos, une tuile brillante garde son holo, son reflet, son cadre doré et un « ★ » ; au survol d'une carte à overframe,
// la tuile s'incline, l'illustration respire et la moitié des particules arrière passent.
import { useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { cardAvailability, getCard } from '../engine';
import type { Card, CardId, CardSet, PlayerView } from '../engine';
import { THUMB_FRAME, TILE_FRAME, artFit, cardArtFor, fitBackground } from './art';
import { groupCards, splitCardName } from './cardText';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { canPlay } from './interaction';
import { ShinyLayers, TileParticles, useMotionGate } from './Overframe';
import { OVERFRAMES } from './overframes';
import { GRIMOIRE_LAYOUTS } from './settings';
import { reasonStatus } from './sheet';
import type { GrimoireLayout } from './settings';

interface GrimoireProps {
  view: PlayerView;
  selectedCard: CardId | null;
  /** Carte montrée par la fiche. */
  focusedCard?: CardId | null;
  layout: GrimoireLayout;
  onLayout: (layout: GrimoireLayout) => void;
  onCardClick: (cardId: CardId) => void;
  /** Clic droit sur une carte (le menu du navigateur est bloqué). */
  onCardContextMenu?: (cardId: CardId) => void;
  onCardHover: (cardId: CardId | null, rect?: DOMRect) => void;
  /** Animations permises (réglage, mouvements réduits) : tuiles brillantes et overframes. */
  animated?: boolean;
}

/** Chaque affichage : bouton (icône, libellé), cartes par ligne et largeur du panneau du grimoire (px, marges comprises). */
export const GRIMOIRE_DISPLAY: Readonly<
  Record<GrimoireLayout, { readonly icon: IconName; readonly label: string; readonly columns: number; readonly width: number }>
> = {
  grid2: { icon: 'layout-2', label: 'Tuiles', columns: 2, width: 304 },
  list: { icon: 'layout-list', label: 'Liste', columns: 1, width: 300 },
};

const KIND_ICONS: Readonly<Record<Card['kind'], IconName>> = { monster: 'dragon-head', spell: 'spell-book', terrain: 'castle' };

/** Sections du grimoire, dans l'ordre d'affichage. */
export const GRIMOIRE_SECTIONS: readonly { readonly kind: Card['kind']; readonly title: string }[] = [
  { kind: 'monster', title: 'Monstres' },
  { kind: 'spell', title: 'Sorts' },
  { kind: 'terrain', title: 'Terrains' },
];

function tileStats(card: Card): [IconName, number][] {
  switch (card.kind) {
    case 'monster':
      return [
        ['broadsword', card.atk],
        ['hearts', card.hp],
        ['walking-boot', card.mobility],
        ['high-shot', card.range],
      ];
    case 'terrain':
      return [['hearts', card.hp]];
    case 'spell':
      return [];
  }
}

function Stats({ card }: { card: Card }) {
  return (
    <span className="tile__stats">
      {tileStats(card).map(([icon, value]) => (
        <span key={icon} className={`tile__stat tile__stat--${icon}`}>
          <Icon name={icon} />
          {value}
        </span>
      ))}
    </span>
  );
}

/** Pourquoi une carte du grimoire ne peut pas être jouée (« Aucune cible à portée »), ou rien si elle peut l'être. */
function whyNot(view: PlayerView, cardId: CardId): string | undefined {
  const availability = cardAvailability(view, cardId);
  return availability.ok ? undefined : reasonStatus(availability.reason, '').text;
}

export function Grimoire(props: GrimoireProps) {
  const { view, selectedCard, focusedCard = null, layout, onLayout, onCardClick, onCardContextMenu, onCardHover } = props;
  const { animated = false } = props;
  const { grimoire } = view.me;
  const columns = { '--grimoire-cols': GRIMOIRE_DISPLAY[layout].columns } as CSSProperties;
  const groups = groupCards(grimoire);
  return (
    <section className="panel panel--grimoire">
      <header className="panel__head">
        <h2 className="panel__title">
          Mon grimoire <span className="panel__count">{grimoire.length}</span>
        </h2>
        <div className="view-switch layout-switch" role="group" aria-label="Affichage du grimoire">
          {GRIMOIRE_LAYOUTS.map((value) => (
            <button
              key={value}
              type="button"
              title={GRIMOIRE_DISPLAY[value].label}
              aria-label={GRIMOIRE_DISPLAY[value].label}
              aria-pressed={layout === value}
              onClick={() => onLayout(value)}
            >
              <Icon name={GRIMOIRE_DISPLAY[value].icon} />
            </button>
          ))}
        </div>
      </header>
      <div className={`grimoire grimoire--${layout}`} style={columns}>
        {GRIMOIRE_SECTIONS.map(({ kind, title }) => {
          const cards = groups.filter(({ cardId }) => getCard(view.cards, cardId).kind === kind);
          if (cards.length === 0) return null;
          const total = cards.reduce((sum, { count }) => sum + count, 0);
          return (
            <section key={kind} className={`grimoire__section grimoire__section--${kind}`} aria-label={title}>
              <h3 className="grimoire__heading">
                <Icon name={KIND_ICONS[kind]} />
                {title}
                <span className="panel__count">{total}</span>
              </h3>
              <ul className="grimoire__cards">
                {cards.map(({ cardId, count }) => (
                  <Tile
                    cards={view.cards}
                    key={cardId}
                    cardId={cardId}
                    count={count}
                    list={layout === 'list'}
                    playable={canPlay(view, cardId)}
                    reason={whyNot(view, cardId)}
                    selected={selectedCard === cardId}
                    focused={focusedCard === cardId}
                    shiny={view.me.shiny?.includes(cardId) ?? false}
                    animated={animated}
                    fxAnchor
                    onClick={() => onCardClick(cardId)}
                    onContextMenu={onCardContextMenu && (() => onCardContextMenu(cardId))}
                    onHover={(rect) => (rect ? onCardHover(cardId, rect) : onCardHover(null))}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}

interface TileProps {
  /** Les cartes où lire celle de la tuile : celles de la partie, ou `CARDS` hors partie. */
  cards: CardSet;
  cardId: CardId;
  /** Exemplaires de la carte (grimoire) ; absent : la tuile est un seul exemplaire (cartes jouées, cimetière). */
  count?: number;
  /** Vue liste : une ligne, sans illustration. */
  list: boolean;
  /** Jouable (liseré vert) ou non (ternie) ; absent : ni l'un ni l'autre, la tuile ne fait que montrer sa fiche. */
  playable?: boolean;
  /** Pourquoi elle n'est pas jouable (en liste, sous son nom, à la place des stats d'un sort ou d'un terrain). */
  reason?: string;
  /** Choisie pour être jouée (grimoire seulement). */
  selected?: boolean;
  focused: boolean;
  /** Grimoire : il reste un exemplaire brillant de la carte (il sera joué en premier) ; ailleurs : l'exemplaire l'est. */
  shiny: boolean;
  animated: boolean;
  /** La tuile du grimoire d'où s'envole la carte jouée (`data-card`, animations) : une seule par carte. */
  fxAnchor?: boolean;
  onClick: () => void;
  /** Clic droit (le menu du navigateur est bloqué). */
  onContextMenu?: () => void;
  /** Survol : la boîte de la tuile ; `null` quand la souris la quitte. */
  onHover: (rect: DOMRect | null) => void;
}

/** Nom de la carte, et son archétype en petit dessous (« Apprenti » / « Sorciers du feu »). */
function TileName({ name }: { name: string }) {
  const { title, archetype } = splitCardName(name);
  return (
    <span className="tile__name">
      {title}
      {archetype && <small className="tile__archetype">{archetype}</small>}
    </span>
  );
}

/** Tuile d'une carte : grimoire, ou exemplaire des cartes jouées et du cimetière (`CardPiles`). */
export function Tile(props: TileProps) {
  const { cards, cardId, count, list, playable, reason, selected, focused, shiny, animated, fxAnchor = false } = props;
  const { onClick, onContextMenu, onHover } = props;
  const card = getCard(cards, cardId);
  const art = cardArtFor(cardId, shiny);
  const overframe = list ? undefined : OVERFRAMES[cardId];
  const button = useRef<HTMLButtonElement>(null);
  // Une tuile brillante s'anime au repos : seulement quand elle est visible dans le grimoire qui défile.
  const running = useMotionGate(button, animated && shiny && !list);
  /** Échelle du repère de la fiche dans la tuile, pendant le survol d'une overframe (particules) ; `null` hors survol. */
  const [hoverScale, setHoverScale] = useState<number | null>(null);
  const classes = [
    'tile',
    `tile--${card.kind}`,
    list ? 'tile--row' : 'tile--card',
    playable && 'tile--playable',
    playable === undefined && 'tile--pile',
    selected && 'is-selected',
    focused && 'is-focused',
    shiny && 'tile--shiny',
    overframe && 'tile--of',
    animated && !list && 'of--anim',
    animated && shiny && !list && !running && 'of--paused',
  ]
    .filter(Boolean)
    .join(' ');
  const cost = (
    <span className="tile__cost" title="Coût en mana">
      <Icon name="water-drop" />
      {card.cost}
    </span>
  );
  const kind = (
    <span className="tile__kind">
      {shiny && (
        <span className="tile__star" title="Exemplaire brillant">
          ★
        </span>
      )}
      {!list && <Icon name={KIND_ICONS[card.kind]} />}
      {count !== undefined && `×${count}`}
    </span>
  );
  // Survol d'une overframe : la tuile penche vers le pointeur.
  const tilt = (event: MouseEvent<HTMLButtonElement>) => {
    if (!overframe || !animated) return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width;
    const py = (event.clientY - box.top) / box.height;
    event.currentTarget.style.transform = `perspective(600px) rotateX(${((0.5 - py) * 12).toFixed(2)}deg) rotateY(${((px - 0.5) * 14).toFixed(2)}deg)`;
  };
  return (
    <li>
      <button
        ref={button}
        type="button"
        className={classes}
        aria-disabled={playable === undefined ? undefined : !playable}
        aria-pressed={selected}
        data-card={fxAnchor ? cardId : undefined}
        onClick={onClick}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu?.();
        }}
        onMouseEnter={(event: MouseEvent<HTMLElement>) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (overframe && animated) setHoverScale(box.width / 280);
          onHover(box);
        }}
        onMouseMove={tilt}
        onMouseLeave={(event: MouseEvent<HTMLElement>) => {
          event.currentTarget.style.transform = '';
          setHoverScale(null);
          onHover(null);
        }}
      >
        {list ? (
          <>
            {cost}
            <span
              className="tile__thumb"
              aria-hidden="true"
              style={art ? { background: `${fitBackground(art, artFit(art, THUMB_FRAME), 40)}, oklch(0.2 0.014 60)` } : undefined}
            >
              {!art && <Icon name={KIND_ICONS[card.kind]} />}
            </span>
            <span className="tile__body">
              <TileName name={card.name} />
              {reason && card.kind !== 'monster' ? (
                <span className="tile__note tile__reason">{reason}</span>
              ) : card.kind === 'spell' ? (
                <span className="tile__note">Sort</span>
              ) : (
                <Stats card={card} />
              )}
            </span>
            {kind}
          </>
        ) : (
          <>
            {/* La tuile est le conteneur : le cadrage s'écrit en cqw. */}
            <span className="tile__art" aria-hidden="true">
              {art ? (
                <span
                  className={`art-fit${overframe ? ' of__breath' : ''}`}
                  style={{ background: `${fitBackground(art, artFit(art, TILE_FRAME), 'cqw')}, oklch(0.2 0.014 60)` }}
                />
              ) : (
                <Icon name={KIND_ICONS[card.kind]} />
              )}
              {overframe && hoverScale !== null && (
                <span className="tile__fx" style={{ '--tile-k': hoverScale.toFixed(3) } as CSSProperties}>
                  <TileParticles def={overframe} shiny={shiny} />
                </span>
              )}
              {shiny && <ShinyLayers animated={false} />}
            </span>
            {cost}
            {kind}
            <span className="tile__body">
              <TileName name={card.name} />
              {card.kind !== 'spell' && <Stats card={card} />}
              {card.kind !== 'monster' && (
                <span className="tile__note">{card.kind === 'spell' ? 'Sort · effet immédiat' : 'Terrain'}</span>
              )}
              {card.kind === 'monster' && card.evolvesFrom && (
                <span className="tile__note">Ou par évolution d’un {getCard(cards, card.evolvesFrom).name}</span>
              )}
            </span>
          </>
        )}
      </button>
    </li>
  );
}

/** Onglet collé au bord gauche du panneau du grimoire, toujours visible : le replier ou le rouvrir (lot 13 §4). */
export function GrimoireTab({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? 'Replier le grimoire' : 'Ouvrir le grimoire';
  return (
    <button type="button" className="grimoire-tab" aria-expanded={open} aria-label={label} title={label} onClick={onToggle}>
      <Icon name="spell-book" className="grimoire-tab__book" />
      <Icon name="chevron-right" className="grimoire-tab__chevron" />
    </button>
  );
}
