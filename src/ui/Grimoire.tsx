// Grimoire du joueur actif (SPEC.md §7) : coût, type, nombre d'exemplaires, caractéristiques, en trois sections
// (monstres, sorts, terrains ; une section vide disparaît).
// Quatre affichages, choisis par les boutons de l'en-tête : tuiles à 3, 2 ou 1 par ligne, ou liste compacte (une ligne
// par carte, sans illustration : la fiche la montre). L'affichage règle aussi la largeur de son panneau, qui flotte à
// droite du plateau et se replie contre le bord par son onglet (`GrimoireTab`, handoff V11, lot 13 §4).
// Tuiles illustrées au format 3:4 (handoff V8, lot 9) : l'illustration cadrée sur les yeux, coût en haut à gauche, type
// et exemplaires en haut à droite, nom et caractéristiques en bas. Jouable : liseré vert ; injouable : ternie ;
// choisie : anneau doré ; montrée par la fiche : anneau blanc. En liste, fond teinté selon le type (monstre rouge, sort
// bleu, terrain vert), vif si la carte est jouable, sombre sinon. Clic : la sélectionner (cases dorées) ; clic droit : sa
// bulle d'action (l'invoquer, la lancer, la poser, ou pourquoi elle ne peut pas l'être).
// Overframes et exemplaires brillants (handoff V11, §6.2 du handoff overframe) : pas de débordement dans la grille ; au
// repos, une tuile brillante garde son holo, son reflet, son cadre doré et un « ★ » ; au survol d'une carte à overframe,
// la tuile s'incline, l'illustration respire et la moitié des particules arrière passent.
import { useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { getCard } from '../engine';
import type { Card, CardId, PlayerView } from '../engine';
import { TILE_FRAME, artFit, cardArtFor, fitBackground } from './art';
import { groupCards, splitCardName } from './cardText';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { canPlay } from './interaction';
import { ShinyLayers, TileParticles, useMotionGate } from './Overframe';
import { OVERFRAMES } from './overframes';
import { GRIMOIRE_LAYOUTS } from './settings';
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
  grid3: { icon: 'layout-3', label: '3 cartes par ligne', columns: 3, width: 414 },
  grid2: { icon: 'layout-2', label: '2 cartes par ligne', columns: 2, width: 304 },
  grid1: { icon: 'layout-1', label: '1 carte par ligne', columns: 1, width: 240 },
  list: { icon: 'layout-list', label: 'Liste', columns: 1, width: 260 },
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
          const cards = groups.filter(({ cardId }) => getCard(cardId).kind === kind);
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
                    key={cardId}
                    cardId={cardId}
                    count={count}
                    list={layout === 'list'}
                    playable={canPlay(view, cardId)}
                    selected={selectedCard === cardId}
                    focused={focusedCard === cardId}
                    shiny={view.me.shiny?.includes(cardId) ?? false}
                    animated={animated}
                    onCardClick={onCardClick}
                    onCardContextMenu={onCardContextMenu}
                    onCardHover={onCardHover}
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
  cardId: CardId;
  count: number;
  /** Vue liste : une ligne, sans illustration. */
  list: boolean;
  playable: boolean;
  selected: boolean;
  focused: boolean;
  /** Il reste un exemplaire brillant de la carte (il sera joué en premier). */
  shiny: boolean;
  animated: boolean;
  onCardClick: (cardId: CardId) => void;
  /** Clic droit sur une carte (le menu du navigateur est bloqué). */
  onCardContextMenu?: (cardId: CardId) => void;
  onCardHover: (cardId: CardId | null, rect?: DOMRect) => void;
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

function Tile(props: TileProps) {
  const { cardId, count, list, playable, selected, focused, shiny, animated } = props;
  const { onCardClick, onCardContextMenu, onCardHover } = props;
  const card = getCard(cardId);
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
      <Icon name={KIND_ICONS[card.kind]} />×{count}
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
        aria-disabled={!playable}
        aria-pressed={selected}
        data-card={cardId}
        onClick={() => onCardClick(cardId)}
        onContextMenu={(event) => {
          event.preventDefault();
          onCardContextMenu?.(cardId);
        }}
        onMouseEnter={(event: MouseEvent<HTMLElement>) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (overframe && animated) setHoverScale(box.width / 280);
          onCardHover(cardId, box);
        }}
        onMouseMove={tilt}
        onMouseLeave={(event: MouseEvent<HTMLElement>) => {
          event.currentTarget.style.transform = '';
          setHoverScale(null);
          onCardHover(null);
        }}
      >
        {list ? (
          <>
            {cost}
            <span className="tile__body">
              <TileName name={card.name} />
              {card.kind === 'spell' ? <span className="tile__note">Sort · effet immédiat</span> : <Stats card={card} />}
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
                <span className="tile__note">Ou par évolution d’un {getCard(card.evolvesFrom).name}</span>
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
