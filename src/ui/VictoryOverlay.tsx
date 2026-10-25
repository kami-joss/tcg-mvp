// Écran de victoire (SPEC.md §7).
import type { PlayerId, PlayerView } from '../engine';
import type { Setup } from './session';
import { NewGameControl } from './NewGameControl';

interface VictoryOverlayProps {
  view: PlayerView;
  setup: Setup;
  onRestart: (setup: Setup) => void;
}

export function VictoryOverlay({ view, setup, onRestart }: VictoryOverlayProps) {
  if (view.winner === null) return null;
  const vp = (player: PlayerId) => (player === view.viewer ? view.me.vp : view.opponent.vp);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="victory-title">
      <div className={`overlay__box overlay__box--p${view.winner}`}>
        <span className={`shape shape--p${view.winner} shape--large`} />
        <p className="overlay__kicker">Victoire</p>
        <h2 id="victory-title">Le Joueur {view.winner} l’emporte</h2>
        <p className="overlay__score">
          J1 : {vp(1)} VP · J2 : {vp(2)} VP
        </p>
        <NewGameControl current={setup} confirm={false} onRestart={onRestart} />
      </div>
    </div>
  );
}
