// Barre du haut (handoff V11, lot 12 §1 et lot 13 §5), toujours sur une ligne, en trois colonnes : rien à gauche ;
// au centre, le score de J1 · « Fin du tour » · le score de J2 (places fixes, J2 en miroir) ; à droite, « Tour N »,
// l'icône de l'aide et la roue des options (`OptionsMenu`).
import type { PlayerView } from '../engine';
import { Icon } from './Icon';
import { OptionsMenu } from './OptionsMenu';
import { ScoreBox } from './ScoreBox';
import type { Setup } from './session';
import type { BoardView, DisplaySettings } from './settings';

interface TopBarProps {
  view: PlayerView;
  setup: Setup;
  /** « Fin du tour » cliquable (mon tour, rien en cours d'animation). */
  canEndTurn: boolean;
  onEndTurn: () => void;
  helpOpen: boolean;
  onHelp: () => void;
  settings: DisplaySettings;
  boardView: BoardView;
  isoAvailable: boolean;
  onSettings: (patch: Partial<DisplaySettings>) => void;
  onSound: (on: boolean) => void;
  /** Retour à l'accueil, pour régler une nouvelle partie. */
  onHome: () => void;
  /** Animations permises (orbes de mana). */
  animated?: boolean;
}

export function TopBar(props: TopBarProps) {
  const { view, setup, canEndTurn, onEndTurn, helpOpen, onHelp, animated = true } = props;
  return (
    <header className="topbar">
      <div />
      <div className="topbar__center">
        <ScoreBox view={view} player={1} deckName={setup.decks[1].name} ai={setup.ai === 1} animated={animated} />
        <button type="button" className="btn btn--end-turn" disabled={!canEndTurn} onClick={onEndTurn}>
          Fin du tour
        </button>
        <ScoreBox view={view} player={2} deckName={setup.decks[2].name} ai={setup.ai === 2} animated={animated} />
      </div>
      <div className="topbar__end">
        <span className="topbar__turn">Tour {view.turn}</span>
        <button
          type="button"
          className="topbar__icon-btn btn--help"
          aria-pressed={helpOpen}
          title={helpOpen ? 'Masquer l’aide' : 'Aide'}
          onClick={onHelp}
        >
          <Icon name="help-circle-outline" />
        </button>
        <OptionsMenu
          settings={props.settings}
          boardView={props.boardView}
          isoAvailable={props.isoAvailable}
          onChange={props.onSettings}
          onSound={props.onSound}
          confirmHome={view.winner === null}
          onHome={props.onHome}
        />
      </div>
    </header>
  );
}
