// Barre du haut (handoff V11, lot 12 §1 et lot 13 §5), toujours sur une ligne, en trois colonnes : rien à gauche ;
// au centre, le score de J1 · « Fin du tour » (et le minuteur de tour, s'il y en a un) · le score de J2 (places fixes, J2 en miroir), chacun avec les compteurs
// de ses cartes jouées et de son cimetière ; à droite, « Tour N », l'icône de l'aide et la roue des options
// (`OptionsMenu`).
import type { PlayerView } from '../engine';
import { Icon } from './Icon';
import { OptionsMenu } from './OptionsMenu';
import type { PileSelection } from './piles';
import { ScoreBox } from './ScoreBox';
import { TurnTimer } from './TurnTimerBadge';
import type { TimerDisplay } from './turnTimer';
import type { Setup } from './session';
import { hasPatches, modifiedText } from './workshop';
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
  tiltAvailable: boolean;
  onSettings: (patch: Partial<DisplaySettings>) => void;
  onSound: (on: boolean) => void;
  /** Retour à l'accueil, pour régler une nouvelle partie. */
  onHome: () => void;
  /** Animations permises (orbes de mana). */
  animated?: boolean;
  /** Liste ouverte dans le panneau des cartes jouées et du cimetière, s'il est ouvert. */
  pile: PileSelection | null;
  /** Clic sur un compteur de cartes jouées ou du cimetière. */
  onPile: (selection: PileSelection) => void;
  /**
   * Minuteur de tour, si la partie en a un (`timerDisplay`) ; `onTimeUp` : il finit lui-même le tour à 0:00 (partie
   * locale), absent avec une horloge suivie.
   */
  timer?: (TimerDisplay & { readonly onTimeUp?: () => void }) | null;
  /** Partie en ligne : « Abandonner la partie » dans les options. */
  onConcede?: () => void;
  /** Ce que demande « Nouvelle partie » avant de quitter une partie en cours. */
  homeWarning?: string;
}

export function TopBar(props: TopBarProps) {
  const { view, setup, canEndTurn, onEndTurn, helpOpen, onHelp, animated = true, pile, onPile, timer = null } = props;
  const piles = (player: 1 | 2) => ({
    pile: pile?.player === player ? pile.pile : null,
    onPile: (next: PileSelection['pile']) => onPile({ player, pile: next }),
  });
  return (
    <header className="topbar">
      <div />
      <div className="topbar__center">
        <ScoreBox view={view} player={1} deckName={setup.decks[1].name} ai={setup.ai === 1} animated={animated} {...piles(1)} />
        {/* Avec un minuteur, une place à sa taille de chaque côté du bouton : il reste au centre, et rien ne bouge d'un tour à l'autre. */}
        <div className={`topbar__end-turn${timer ? ' has-timer' : ''}`}>
          <button type="button" className="btn btn--end-turn" disabled={!canEndTurn} onClick={onEndTurn}>
            Fin du tour
          </button>
          {timer && (
            <span className="topbar__timer">
              {timer.shown && <TurnTimer key={timer.key} running={timer.running} initialSpent={timer.spent} onTimeUp={timer.onTimeUp} />}
            </span>
          )}
        </div>
        <ScoreBox view={view} player={2} deckName={setup.decks[2].name} ai={setup.ai === 2} animated={animated} {...piles(2)} />
      </div>
      <div className="topbar__end">
        {hasPatches(setup.workshop) && (
          <span className="topbar__workshop" title={`Cartes de l’atelier : ${modifiedText(view.cards, setup.workshop)}`}>
            <Icon name="anvil" />
            Atelier
          </span>
        )}
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
          tiltAvailable={props.tiltAvailable}
          onChange={props.onSettings}
          onSound={props.onSound}
          confirmHome={view.winner === null}
          onHome={props.onHome}
          onConcede={view.winner === null ? props.onConcede : undefined}
          homeWarning={props.homeWarning}
        />
      </div>
    </header>
  );
}
