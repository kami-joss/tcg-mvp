// Barre du haut, aussi fine que possible : le tour, puis la vue du plateau, les stats des jetons (lot 6), le zoom, le son et la nouvelle
// partie (retour à l'accueil). « Fin du tour » est en haut de la colonne de droite, au-dessus du grimoire (lot 11) ; les encarts des
// joueurs (SPEC.md §7) sont dans les colonnes (`PlayerBox`).
import { useState } from 'react';
import type { PlayerView } from '../engine';
import { Icon } from './Icon';
import { StatsControl } from './StatsControl';
import { ZOOMS, stepZoom } from './settings';
import type { BoardView, TokenStats } from './settings';

interface TopBarProps {
  view: PlayerView;
  boardView: BoardView;
  /** La vue isométrique existe pour ce plateau. */
  isoAvailable: boolean;
  onView: (view: BoardView) => void;
  stats: TokenStats;
  onStats: (stats: TokenStats) => void;
  peek: boolean;
  onPeek: (on: boolean) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  sound: boolean;
  onSound: (on: boolean) => void;
  /** Retour à l'accueil, pour régler une nouvelle partie. */
  onHome: () => void;
}

const VIEWS: [BoardView, string][] = [
  ['top', 'Dessus'],
  ['tilt', 'Inclinée 45°'],
  ['iso', 'Isométrique'],
];

export function TopBar(props: TopBarProps) {
  const { view, boardView, isoAvailable, onView, stats, onStats, peek, onPeek, zoom, onZoom, sound, onSound, onHome } = props;
  const zoomIndex = ZOOMS.indexOf(zoom);
  return (
    <header className="topbar">
      <span className="topbar__turn">Tour {view.turn}</span>
      <div className="topbar__end">
        <div className="view-switch" role="group" aria-label="Vue du plateau">
          {VIEWS.filter(([value]) => value !== 'iso' || isoAvailable).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={boardView === value} onClick={() => onView(value)}>
              {label}
            </button>
          ))}
        </div>
        <StatsControl stats={stats} onChange={onStats} peek={peek} onPeek={onPeek} />
        <div className="view-switch zoom-switch" role="group" aria-label="Zoom du plateau">
          <button type="button" title="Dézoomer" disabled={zoomIndex <= 0} onClick={() => onZoom(stepZoom(zoom, -1))}>
            −
          </button>
          <button type="button" className="zoom-switch__value" title="Revenir à la taille ajustée" onClick={() => onZoom(1)}>
            {Math.round(zoom * 100)} %
          </button>
          <button
            type="button"
            title="Zoomer"
            disabled={zoomIndex >= ZOOMS.length - 1}
            onClick={() => onZoom(stepZoom(zoom, 1))}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="sound-toggle"
          aria-pressed={sound}
          title={sound ? 'Couper le son' : 'Activer le son'}
          onClick={() => onSound(!sound)}
        >
          <Icon name={sound ? 'speaker' : 'speaker-off'} />
          Son
        </button>
        <NewGameButton confirm={view.winner === null} onHome={onHome} />
      </div>
    </header>
  );
}

/** « Nouvelle partie » : retour à l'accueil ; en cours de partie, une confirmation évite d'abandonner par erreur. */
function NewGameButton({ confirm, onHome }: { confirm: boolean; onHome: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="new-game-button">
      <button type="button" className="btn btn--ghost" onClick={() => (confirm ? setConfirming(!confirming) : onHome())}>
        Nouvelle partie
      </button>
      {confirming && (
        <div className="new-game new-game--popover" role="dialog" aria-label="Nouvelle partie">
          <span>Abandonner la partie en cours ?</span>
          <button type="button" className="btn btn--gold" onClick={onHome}>
            Oui, retour à l’accueil
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
            Non
          </button>
        </div>
      )}
    </div>
  );
}
