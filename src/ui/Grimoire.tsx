// Grimoire du joueur actif (SPEC.md §7) : coût, type, nombre d'exemplaires, caractéristiques, en trois sections
// (monstres, sorts, terrains ; une section vide disparaît).
// Quatre affichages, choisis par les boutons de l'en-tête : tuiles à 3, 2 ou 1 par ligne, ou liste compacte (une ligne
// par carte, sans illustration : la fiche la montre). L'affichage règle aussi la largeur de la colonne.
// Tuiles illustrées au format 3:4 (handoff V8, lot 9) : l'illustration cadrée sur les yeux, coût en haut à gauche, type
// et exemplaires en haut à droite, nom et caractéristiques en bas. Jouable : liseré vert ; injouable : ternie ;
// choisie : anneau doré ; montrée par la fiche : anneau blanc. En liste, fond teinté selon le type (monstre rouge, sort
// bleu, terrain vert), vif si la carte est jouable, sombre sinon. Clic : la sélectionner (cases dorées) ; clic droit : sa
// bulle d'action (l'invoquer, la lancer, la poser, ou pourquoi elle ne peut pas l'être).
import type { CSSProperties, MouseEvent } from 'react';
import { getCard } from '../engine';
import type { Card, CardId, PlayerView } from '../engine';
import { CARD_ART, TILE_FRAME, artFit, fitBackground } from './art';
import { groupCards } from './cardText';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { canPlay } from './interaction';
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
}

/** Chaque affichage : bouton (icône, libellé), cartes par ligne et largeur de la colonne du grimoire (px). */
export const GRIMOIRE_DISPLAY: Readonly<
  Record<GrimoireLayout, { readonly icon: IconName; readonly label: string; readonly columns: number; readonly width: number }>
> = {
  grid3: { icon: 'layout-3', label: '3 cartes par ligne', columns: 3, width: 410 },
  grid2: { icon: 'layout-2', label: '2 cartes par ligne', columns: 2, width: 300 },
  grid1: { icon: 'layout-1', label: '1 carte par ligne', columns: 1, width: 236 },
  list: { icon: 'layout-list', label: 'Liste', columns: 1, width: 256 },
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
  onCardClick: (cardId: CardId) => void;
  /** Clic droit sur une carte (le menu du navigateur est bloqué). */
  onCardContextMenu?: (cardId: CardId) => void;
  onCardHover: (cardId: CardId | null, rect?: DOMRect) => void;
}

function Tile({ cardId, count, list, playable, selected, focused, onCardClick, onCardContextMenu, onCardHover }: TileProps) {
  const card = getCard(cardId);
  const art = CARD_ART[cardId];
  const classes = [
    'tile',
    `tile--${card.kind}`,
    list ? 'tile--row' : 'tile--card',
    playable && 'tile--playable',
    selected && 'is-selected',
    focused && 'is-focused',
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
      <Icon name={KIND_ICONS[card.kind]} />×{count}
    </span>
  );
  return (
    <li>
      <button
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
        onMouseEnter={(event: MouseEvent<HTMLElement>) => onCardHover(cardId, event.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => onCardHover(null)}
      >
        {list ? (
          <>
            {cost}
            <span className="tile__body">
              <span className="tile__name">{card.name}</span>
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
                  className="art-fit"
                  style={{ background: `${fitBackground(art, artFit(art, TILE_FRAME), 'cqw')}, oklch(0.2 0.014 60)` }}
                />
              ) : (
                <Icon name={KIND_ICONS[card.kind]} />
              )}
            </span>
            {cost}
            {kind}
            <span className="tile__body">
              <span className="tile__name">{card.name}</span>
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
