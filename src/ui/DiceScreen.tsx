// Lancer de dés d'ouverture (SPEC.md §4.1) : un dé à 6 faces par joueur, relancé en cas d'égalité ; le gagnant choisit s'il
// commence. Rien de la partie n'est rendu jusqu'au choix (contre l'IA qui gagne, jusqu'au clic pour commencer).
import type { PlayerId } from '../engine';
import type { Opening } from './session';

/** Cases (rangée, colonne) des points de chaque face, sur une grille 3 × 3. */
const PIPS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]],
};

function Die({ value, player, lost }: { value: number; player: PlayerId; lost: boolean }) {
  return (
    <span className={`die die--p${player}${lost ? ' is-lost' : ''}`} role="img" aria-label={`Dé de J${player} : ${value}`} data-die={player}>
      {(PIPS[value] ?? []).map(([row, col]) => (
        <i key={`${row}${col}`} className="die__pip" style={{ gridRow: row, gridColumn: col }} />
      ))}
    </span>
  );
}

const other = (player: PlayerId): PlayerId => (player === 1 ? 2 : 1);

interface DiceScreenProps {
  opening: Opening;
  /** Le joueur tenu par l'IA, s'il y en a un (il ne choisit pas : il commence). */
  ai?: PlayerId | null;
  onChoose: (first: PlayerId) => void;
  onReady: () => void;
}

export function DiceScreen({ opening, ai = null, onChoose, onReady }: DiceScreenProps) {
  const { rolls, winner, chosen } = opening;
  return (
    <main className={`handoff dice handoff--p${winner}`}>
      <p className="handoff__kicker">Lancer de dés</p>
      <h1>Qui commence ?</h1>
      <ol className="dice__rolls">
        {rolls.map((roll, i) => {
          const last = i === rolls.length - 1;
          return (
            <li key={i} className={`dice__roll${last ? ' is-final' : ''}`}>
              {([1, 2] as const).map((player) => (
                <span key={player} className="dice__side">
                  <span className="dice__who">J{player}</span>
                  <Die value={roll[player]} player={player} lost={last && winner !== player} />
                </span>
              ))}
              {!last && <span className="dice__tie">Égalité : on relance</span>}
            </li>
          );
        })}
      </ol>
      {chosen === null ? (
        <>
          <p className="handoff__hint">
            J{winner} a le plus gros chiffre : J{winner} choisit s’il commence.
          </p>
          <div className="dice__choices">
            <button type="button" className="btn btn--handoff" onClick={() => onChoose(winner)} autoFocus>
              J{winner} commence
            </button>
            <button type="button" className="btn btn--handoff" onClick={() => onChoose(other(winner))}>
              J{other(winner)} commence
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="handoff__hint">
            J{winner}{ai === winner ? ' (IA)' : ''} a le plus gros chiffre et choisit de commencer.
          </p>
          <button type="button" className="btn btn--handoff" onClick={onReady} autoFocus>
            Commencer la partie
          </button>
        </>
      )}
    </main>
  );
}
