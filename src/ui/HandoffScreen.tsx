// Écran de passage hotseat (SPEC.md §4.3) : masque tout jusqu'au clic du joueur suivant.
import type { PlayerId } from '../engine';

export function HandoffScreen({ player, onReady }: { player: PlayerId; onReady: () => void }) {
  return (
    <main className={`handoff handoff--p${player}`}>
      <span className={`shape shape--p${player} shape--handoff`} />
      <p className="handoff__kicker">Fin du tour</p>
      <h1>Passe l’écran au Joueur {player}</h1>
      <p className="handoff__hint">Le jeu reste masqué jusqu’à ce que le Joueur {player} clique.</p>
      <button type="button" className="btn btn--handoff" onClick={onReady} autoFocus>
        Je suis le Joueur {player} · commencer
      </button>
    </main>
  );
}
