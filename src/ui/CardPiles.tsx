// Sur le plateau et cimetière de chaque joueur (SPEC.md §10) : deux compteurs dans son score, en haut de l'écran, et un
// panneau flottant en haut du plateau, comme l'aide, sur la liste choisie (un onglet passe à l'autre ; fermé par sa
// croix, Échap ou le même compteur). Une tuile par exemplaire, la plus récente en premier ; survol ou clic : sa fiche.
// Tout vient de la vue du joueur qui regarde : rien du grimoire, rien de ce qui est caché.
import type { CSSProperties } from 'react';
import type { PlayerId, PlayerView } from '../engine';
import { Tile } from './Grimoire';
import { Icon } from './Icon';
import { PILES, PILE_EMPTY, PILE_ICONS, PILE_LABELS, pileEntries, pileOf, pileTitle } from './piles';
import type { PileKind, PileSelection } from './piles';

interface PileCountersProps {
  view: PlayerView;
  player: PlayerId;
  /** La liste de ce joueur ouverte dans le panneau, s'il y en a une. */
  open: PileKind | null;
  onOpen: (pile: PileKind) => void;
}

/** Les deux compteurs d'un joueur, sous son nom : sur le plateau et cimetière, chacun avec son nom écrit. */
export function PileCounters({ view, player, open, onOpen }: PileCountersProps) {
  return (
    <span className="score__piles">
      {PILES.map((pile) => {
        const count = pileOf(view, player, pile).length;
        const title = pileTitle(player, pile, count);
        return (
          <button
            key={pile}
            type="button"
            className={`score__pile score__pile--${pile}`}
            aria-pressed={open === pile}
            aria-label={title}
            title={title}
            onClick={() => onOpen(pile)}
          >
            <Icon name={PILE_ICONS[pile]} />
            <b>{count}</b>
            <span className="score__pile-label">{PILE_LABELS[pile]}</span>
          </button>
        );
      })}
    </span>
  );
}

interface PilePanelProps {
  view: PlayerView;
  selection: PileSelection;
  /** Changer de liste (onglets). */
  onSelect: (selection: PileSelection) => void;
  onClose: () => void;
  /** Rang de l'exemplaire que montre la fiche, s'il est dans cette liste. */
  focused: number | null;
  /** Clic sur une tuile : sa fiche, tout de suite. */
  onCopyClick: (index: number) => void;
  /** Survol d'une tuile (`null` : la souris la quitte). */
  onCopyHover: (index: number | null) => void;
  animated?: boolean;
  /** Marges du panneau, pour ne cacher ni la fiche ni le grimoire. */
  style?: CSSProperties;
}

/** Le panneau d'une liste : le joueur, les onglets (avec leur nombre de cartes), puis les tuiles. */
export function PilePanel(props: PilePanelProps) {
  const { view, selection, onSelect, onClose, focused, onCopyClick, onCopyHover, animated = false, style } = props;
  const { player, pile } = selection;
  const entries = pileEntries(view, player, pile);
  return (
    <section className={`piles piles--p${player}`} aria-label={`Cartes de J${player}`} style={style}>
      <header className="piles__head">
        <h2 className="piles__title">Joueur {player}</h2>
        <div className="view-switch piles__tabs" role="group" aria-label="Liste">
          {PILES.map((tab) => (
            <button key={tab} type="button" aria-pressed={tab === pile} onClick={() => onSelect({ player, pile: tab })}>
              <Icon name={PILE_ICONS[tab]} />
              {PILE_LABELS[tab]}
              <span className="panel__count">{pileOf(view, player, tab).length}</span>
            </button>
          ))}
        </div>
        <button type="button" className="legend__close piles__close" title="Fermer (Échap)" aria-label="Fermer" onClick={onClose}>
          ×
        </button>
      </header>
      {entries.length === 0 ? (
        <p className="piles__empty">{PILE_EMPTY[pile]}</p>
      ) : (
        <ul className="grimoire__cards piles__cards">
          {entries.map(({ copy, index }) => (
            <Tile
              key={index}
              cards={view.cards}
              cardId={copy.cardId}
              list={false}
              focused={focused === index}
              shiny={copy.shiny === true}
              animated={animated}
              onClick={() => onCopyClick(index)}
              onContextMenu={() => onCopyClick(index)}
              onHover={(rect) => onCopyHover(rect ? index : null)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
