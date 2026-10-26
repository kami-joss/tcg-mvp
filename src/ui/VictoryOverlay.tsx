// Écran de victoire (SPEC.md §7) : rejouer avec les mêmes réglages, ou revenir à l'accueil pour en changer.
import type { PlayerId, PlayerView } from '../engine';

interface VictoryOverlayProps {
  view: PlayerView;
  onRestart: () => void;
  onHome: () => void;
}

export function VictoryOverlay({ view, onRestart, onHome }: VictoryOverlayProps) {
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
        <div className="overlay__actions">
          <button type="button" className="btn btn--gold" onClick={onRestart}>
            Rejouer
          </button>
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            Nouvelle partie
          </button>
        </div>
      </div>
    </div>
  );
}
