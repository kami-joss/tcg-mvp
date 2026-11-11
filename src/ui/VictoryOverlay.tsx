// Écran de victoire (SPEC.md §7) : rejouer avec les mêmes réglages, ou revenir à l'accueil pour en changer. Une partie
// perdue par abandon ou par absence (parties en ligne, §7 ter) le dit.
import type { Concession, PlayerId, PlayerView } from '../engine';

interface VictoryOverlayProps {
  view: PlayerView;
  /** Rejouer avec les mêmes réglages ; absent (partie en ligne), pas de « Rejouer ». */
  onRestart?: () => void;
  onHome: () => void;
}

/** « Le Joueur 2 abandonne. », « Le Joueur 2 a quitté la partie. » */
export function concessionText({ player, reason }: Concession): string {
  return reason === 'abandon' ? `Le Joueur ${player} abandonne.` : `Le Joueur ${player} a quitté la partie.`;
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
        {view.concession && <p className="overlay__reason">{concessionText(view.concession)}</p>}
        <p className="overlay__score">
          J1 : {vp(1)} VP · J2 : {vp(2)} VP
        </p>
        <div className="overlay__actions">
          {onRestart && (
            <button type="button" className="btn btn--gold" onClick={onRestart}>
              Rejouer
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            Nouvelle partie
          </button>
        </div>
      </div>
    </div>
  );
}
