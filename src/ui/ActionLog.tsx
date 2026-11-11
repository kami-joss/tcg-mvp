// Journal des actions (SPEC.md §7, §10), dans un panneau repliable. Ouvert : toujours défilé jusqu'à la dernière entrée,
// une entrée par action en arborescence — l'action (icône dans une pastille cerclée à la couleur du camp, sa phrase),
// puis ses conséquences reliées par un trait, chacune avec son icône et sa couleur (perte, gain, VP, information) ; une
// conséquence qui en entraîne une autre la porte sous elle. Chaque nouveau tour est un séparateur : numéro, joueur, mana
// et VP reçus. Les noms des cartes sont soulignés à la couleur de leur camp. Replié : une barre avec la dernière entrée,
// ou, au début de son tour, un badge qui compte les actions de l'adversaire pendant le sien.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PlayerId } from '../engine';
import { Icon } from './Icon';
import { logSegments, unreadActions } from './log';
import type { LogEntry, LogItem, LogName } from './log';

/** Les conséquences se lisent comme des étiquettes : sans point final. */
const label = (text: string) => text.replace(/\.$/, '');

/** Une phrase du journal, les noms des cartes et les joueurs à la couleur de leur camp. */
function Rich({ text, names }: { text: string; names?: readonly LogName[] }) {
  return logSegments(text, names).map((segment, i) => {
    if (typeof segment === 'string') return segment;
    if (segment.kind === 'player') {
      return (
        <b key={i} className={`log__who log__who--p${segment.player}`}>
          Joueur {segment.player}
        </b>
      );
    }
    return (
      <span key={i} className={`log__name log__name--p${segment.player}`} title={segment.title}>
        {segment.name}
        <span className="sr-only"> de J{segment.player}</span>
      </span>
    );
  });
}

/** Conséquences reliées par un trait à ce qui les a entraînées. */
function Tree({ items, names }: { items: readonly LogItem[]; names?: readonly LogName[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="log__tree">
      {items.map((item, i) => (
        <li key={i} className={`log__node log__node--${item.tone}`}>
          <span className="log__row">
            <span className="log__dot">
              <Icon name={item.icon} />
            </span>
            <span className="log__what">
              <Rich text={label(item.text)} names={names} />
            </span>
          </span>
          {item.children && <Tree items={item.children} names={names} />}
        </li>
      ))}
    </ul>
  );
}

function Entry({ entry, latest }: { entry: LogEntry; latest: boolean }) {
  if (entry.kind === 'turn' && entry.turn) {
    const { number, player, mana, vp } = entry.turn;
    return (
      <li className={`log__turn log__turn--p${player}`}>
        <span className="log__rule">
          <span className="log__turn-label">
            Tour {number} · Joueur {player}
          </span>
          <span className="log__pill log__pill--mana" title={`J${player} reçoit ${mana} mana`}>
            <Icon name="water-drop" />+{mana}
          </span>
          {vp > 0 && (
            <span className="log__pill log__pill--vp" title={`J${player} reçoit ${vp} VP`}>
              <Icon name="crown" />+{vp} VP
            </span>
          )}
        </span>
        {entry.items.length > 0 && (
          <div className="log__start">
            <span className="log__head">
              <span className="log__icon">
                <Icon name="timer-outline" />
              </span>
              <span className="log__text">
                Début du tour de <Rich text={`J${player}`} />
              </span>
            </span>
            <Tree items={entry.items} names={entry.names} />
          </div>
        )}
      </li>
    );
  }
  const side = entry.player ? ` log__entry--p${entry.player}` : '';
  return (
    <li className={`log__entry log__entry--${entry.kind}${side}${latest ? ' is-latest' : ''}`}>
      <span className="log__head">
        <span className="log__icon" data-icon={entry.icon}>
          <Icon name={entry.icon} />
        </span>
        <span className="log__text">
          <Rich text={entry.text} names={entry.names} />
        </span>
      </span>
      <Tree items={entry.items} names={entry.names} />
    </li>
  );
}

/** Ce que dit la barre du journal replié : la dernière entrée. */
function Summary({ entry }: { entry: LogEntry | undefined }) {
  if (!entry) return <span className="journal__summary">Les actions s’ajoutent ici.</span>;
  if (entry.kind === 'turn' && entry.turn) {
    return (
      <span className="journal__summary">
        Tour {entry.turn.number} · <Rich text={`J${entry.turn.player}`} /> · +{entry.turn.mana} mana
      </span>
    );
  }
  return (
    <>
      <span className={`log__icon journal__icon${entry.player ? ` log__entry--p${entry.player}` : ''}`} data-icon={entry.icon}>
        <Icon name={entry.icon} />
      </span>
      <span className="journal__summary">
        <Rich text={entry.text} names={entry.names} />
      </span>
    </>
  );
}

interface ActionLogProps {
  entries: readonly LogEntry[];
  /** Panneau ouvert (réglage `journalOpen`). */
  open?: boolean;
  /** Ouvrir ou replier ; sans lui, le panneau reste ouvert, sans bouton. */
  onToggle?: () => void;
  /** Joueur qui lit : replié, le badge compte les actions de son adversaire pendant son dernier tour. */
  viewer?: PlayerId;
  style?: CSSProperties;
}

export function ActionLog({ entries, open = true, onToggle, viewer, style }: ActionLogProps) {
  const list = useRef<HTMLOListElement>(null);
  const unread = viewer ? unreadActions(entries, viewer) : null;
  // Le badge disparaît une fois le journal ouvert à ce tour (ou s'il l'était déjà).
  const [seen, setSeen] = useState<number | null>(null);
  const unreadKey = unread?.key ?? null;
  useEffect(() => {
    if (open && unreadKey !== null) setSeen(unreadKey);
  }, [open, unreadKey]);
  useEffect(() => {
    if (open && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [entries, open]);

  if (!open && onToggle) {
    const badge = unread && unread.count > 0 && seen !== unread.key ? unread : null;
    return (
      <button
        type="button"
        className={`journal journal--closed${badge ? ' has-badge' : ''}`}
        style={style}
        aria-expanded={false}
        aria-label={badge ? `Ouvrir le journal : ${badge.count} actions de Joueur ${badge.player}` : 'Ouvrir le journal'}
        onClick={onToggle}
      >
        {badge ? (
          <>
            <span className="journal__title">Journal</span>
            <span className="journal__summary">
              Ce qu’a fait <Rich text={`J${badge.player}`} />
            </span>
            <span className="journal__badge">{badge.count}</span>
          </>
        ) : (
          <Summary entry={entries.at(-1)} />
        )}
        <Icon name="chevron-right" className="journal__chevron journal__chevron--up" />
      </button>
    );
  }

  // La dernière entrée, mise en avant, si c'est une action (pas un séparateur de tour).
  const latest = entries.length - 1;
  return (
    <section className="journal" style={style} aria-label="Journal">
      <header className="journal__head">
        <h2 className="journal__title">Journal</h2>
        {onToggle && (
          <button type="button" className="journal__toggle" aria-expanded={true} aria-label="Replier le journal" title="Replier le journal" onClick={onToggle}>
            <Icon name="chevron-right" className="journal__chevron journal__chevron--down" />
          </button>
        )}
      </header>
      <ol className="log" ref={list}>
        {entries.map((entry, i) => (
          <Entry key={i} entry={entry} latest={i === latest && entry.kind !== 'turn'} />
        ))}
      </ol>
    </section>
  );
}
