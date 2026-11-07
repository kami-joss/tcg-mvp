// Journal des actions (SPEC.md §7), toujours défilé jusqu'à la dernière entrée. Une entrée par action : l'icône de
// l'action à la couleur du camp, sa phrase, puis ses conséquences, chacune avec son icône. Chaque nouveau tour est un
// séparateur : numéro, joueur, mana et VP reçus. Les cartes jouées et le cimetière de chaque joueur sont dans le
// panneau qu'ouvrent leurs compteurs (`CardPiles`).
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import type { LogEntry, LogItem } from './log';

/** Les conséquences se lisent comme des étiquettes : sans point final. */
const label = (text: string) => text.replace(/\.$/, '');

function Items({ items }: { items: readonly LogItem[] }) {
  return items.map((item, i) => (
    <span key={i} className={`log__item log__item--${item.tone}`}>
      <Icon name={item.icon} />
      {label(item.text)}
    </span>
  ));
}

function Entry({ entry }: { entry: LogEntry }) {
  if (entry.kind === 'turn' && entry.turn) {
    const { number, player, mana, vp } = entry.turn;
    return (
      <li className={`log__turn log__turn--p${player}`}>
        <span className="log__turn-label">
          Tour {number} · J{player}
        </span>
        <span className="log__item log__item--mana" title={`J${player} reçoit ${mana} mana`}>
          <Icon name="water-drop" />+{mana}
        </span>
        {vp > 0 && (
          <span className="log__item log__item--vp" title={`J${player} reçoit ${vp} VP`}>
            <Icon name="laurels" />+{vp} VP
          </span>
        )}
        <Items items={entry.items} />
      </li>
    );
  }
  const side = entry.player ? ` log__entry--p${entry.player}` : '';
  return (
    <li className={`log__entry log__entry--${entry.kind}${side}`}>
      <span className="log__icon">
        <Icon name={entry.icon} />
      </span>
      <span className="log__body">
        <span className="log__text">{entry.text}</span>
        <Items items={entry.items} />
      </span>
    </li>
  );
}

export function ActionLog({ entries }: { entries: readonly LogEntry[] }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [entries]);

  return (
    <section className="panel">
      <h2 className="panel__title">Journal</h2>
      <ol className="log" ref={list}>
        {entries.map((entry, i) => (
          <Entry key={i} entry={entry} />
        ))}
      </ol>
    </section>
  );
}
