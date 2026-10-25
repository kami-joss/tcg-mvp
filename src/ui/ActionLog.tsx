// Journal des actions (SPEC.md §7), toujours défilé jusqu'à la dernière ligne, et cartes utilisées par
// l'adversaire (information publique).
import { useEffect, useRef } from 'react';
import { getCard } from '../engine';
import type { CardId } from '../engine';
import { groupCards } from './cardText';

export function ActionLog({ lines, opponentUsed }: { lines: readonly string[]; opponentUsed: readonly CardId[] }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lines]);
  const used = groupCards(opponentUsed).map(({ cardId, count }) => `${getCard(cardId).name}${count > 1 ? ` ×${count}` : ''}`);

  return (
    <section className="panel">
      <h2 className="panel__title">Journal</h2>
      <ol className="log" ref={list}>
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <p className="log__used">Cartes jouées par l’adversaire : {used.length > 0 ? used.join(', ') : '—'}</p>
    </section>
  );
}
