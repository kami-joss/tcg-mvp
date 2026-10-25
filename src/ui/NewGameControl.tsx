// Nouvelle partie avec la carte et les decks choisis. En cours de partie, une confirmation évite d'abandonner
// par erreur. En version compacte (barre du haut), les choix s'ouvrent dans un panneau.
import { useState } from 'react';
import { BOARDS, DECKS } from '../engine';
import type { PlayerId } from '../engine';
import type { Setup } from './session';

interface NewGameControlProps {
  current: Setup;
  confirm: boolean;
  onRestart: (setup: Setup) => void;
  compact?: boolean;
}

const indexOf = <T,>(list: readonly T[], item: T) => Math.max(0, list.indexOf(item));

export function NewGameControl({ current, confirm, onRestart, compact = false }: NewGameControlProps) {
  const [open, setOpen] = useState(!compact);
  const [board, setBoard] = useState(() => indexOf(BOARDS, current.board));
  const [decks, setDecks] = useState(() => ({ 1: indexOf(DECKS, current.decks[1]), 2: indexOf(DECKS, current.decks[2]) }));
  const [aiJ2, setAiJ2] = useState(() => current.ai === 2);
  const [confirming, setConfirming] = useState(false);
  const setup: Setup = {
    board: BOARDS[board] ?? current.board,
    decks: { 1: DECKS[decks[1]] ?? current.decks[1], 2: DECKS[decks[2]] ?? current.decks[2] },
    ai: aiJ2 ? 2 : null,
  };

  const deckSelect = (player: PlayerId) => (
    <label>
      Deck J{player}{' '}
      <select value={decks[player]} onChange={(event) => setDecks({ ...decks, [player]: Number(event.target.value) })}>
        {DECKS.map((deck, i) => (
          <option key={deck.id} value={i}>
            {deck.name}
          </option>
        ))}
      </select>
    </label>
  );

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
        Nouvelle partie
      </button>
    );
  }

  const close = () => {
    setConfirming(false);
    setOpen(false);
  };

  return (
    <div className={compact ? 'new-game new-game--popover' : 'new-game'}>
      <label>
        Carte{' '}
        <select value={board} onChange={(event) => setBoard(Number(event.target.value))}>
          {BOARDS.map((b, i) => (
            <option key={b.name} value={i}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {deckSelect(1)}
      {deckSelect(2)}
      <label>
        J2 joué par{' '}
        <select value={aiJ2 ? 'ai' : 'human'} onChange={(event) => setAiJ2(event.target.value === 'ai')}>
          <option value="human">un humain</option>
          <option value="ai">l’IA</option>
        </select>
      </label>
      {confirming ? (
        <>
          <span>Abandonner la partie en cours ?</span>
          <button type="button" className="btn btn--gold" onClick={() => onRestart(setup)}>
            Oui, nouvelle partie
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
            Non
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn--gold" onClick={() => (confirm ? setConfirming(true) : onRestart(setup))}>
            {compact ? 'Lancer' : 'Rejouer'}
          </button>
          {compact && (
            <button type="button" className="btn btn--ghost" onClick={close}>
              Fermer
            </button>
          )}
        </>
      )}
    </div>
  );
}
