// Barre du haut, aussi fine que possible : le tour, puis la vue du plateau, les stats des jetons (lot 6), le zoom, le son, la nouvelle partie et
// « Fin du tour » (handoff, lots 3 à 5). Les encarts des joueurs (SPEC.md §7) sont dans les colonnes (`PlayerBox`).
import type { PlayerView } from '../engine';
import { Icon } from './Icon';
import { NewGameControl } from './NewGameControl';
import type { Setup } from './session';
import { StatsControl } from './StatsControl';
import { ZOOMS, stepZoom } from './settings';
import type { BoardView, TokenStats } from './settings';

interface TopBarProps {
  view: PlayerView;
  setup: Setup;
  /** Une animation se joue : « Fin du tour » attend. */
  busy: boolean;
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
  onEndTurn: () => void;
  onRestart: (setup: Setup) => void;
}

const VIEWS: [BoardView, string][] = [
  ['top', 'Dessus'],
  ['tilt', 'Inclinée 45°'],
  ['iso', 'Isométrique'],
];

export function TopBar(props: TopBarProps) {
  const { view, setup, busy, boardView, isoAvailable, onView, stats, onStats, peek, onPeek, zoom, onZoom, sound, onSound } = props;
  const { onEndTurn, onRestart } = props;
  const myTurn = view.activePlayer === view.viewer && view.winner === null;
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
        <NewGameControl current={setup} confirm={view.winner === null} onRestart={onRestart} compact />
        <button type="button" className="btn btn--end-turn" disabled={!myTurn || busy} onClick={onEndTurn}>
          Fin du tour
        </button>
      </div>
    </header>
  );
}
