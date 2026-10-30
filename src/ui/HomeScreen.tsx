// Accueil (`/`) : on règle la partie (carte, mode, deck de chaque joueur, J2 humain ou IA), puis on la lance sur `/game`.
import { useState } from 'react';
import { BOARDS, DECKS } from '../engine';
import type { Board, GameMode, PlayerId } from '../engine';
import { Icon } from './Icon';
import { modeOf } from './session';
import type { Setup } from './session';

interface HomeScreenProps {
  initial: Setup;
  onStart: (setup: Setup) => void;
}

/** Qui joue J2 : un humain (hotseat) ou l'IA. */
const J2_PLAYED_BY = [
  [null, 'Un humain'],
  [2, 'L’IA'],
] as const;

/** Modes de jeu (SPEC.md §4.4, §4.4 bis) : nom et règle en une phrase. */
const MODES: readonly (readonly [GameMode, string, string])[] = [
  ['normal', 'Normal', 'Chaque mana zone est une case : on la tient en l’occupant.'],
  [
    'contestation',
    'Contestation',
    'Chaque mana zone devient une zone de 9 cases. Seul dedans, on la tient ; à deux, elle est contestée : ni mana ni VP, ni terrain posé. Un terrain la tient tant qu’il n’est pas détruit.',
  ],
];

/** Cartes qui proposent le mode contestation, pour le dire sur la carte qui ne le propose pas. */
const CONTEST_BOARDS = BOARDS.filter((board) => board.contestation)
  .map((board) => `${board.rows} × ${board.cols}`)
  .join(' et ');

/** Nom de la carte sans sa taille, et ce qu'elle a de particulier. */
function boardInfo(board: Board): { title: string; details: string[] } {
  const title = board.name.replace(/\s*\(.*\)$/, '');
  const details = [`${board.rows} × ${board.cols}`];
  if (board.scenery) details.push('vue isométrique');
  if (board.mobilityBonus > 0) details.push(`+${board.mobilityBonus} mobilité pour tous les monstres`);
  if (board.contestation) details.push('mode contestation');
  return { title, details };
}

export function HomeScreen({ initial, onStart }: HomeScreenProps) {
  const [setup, setSetup] = useState<Setup>(initial);
  const mode = modeOf(setup);
  const setDeck = (player: PlayerId, id: string) => {
    const deck = DECKS.find((d) => d.id === id);
    if (deck) setSetup({ ...setup, decks: { ...setup.decks, [player]: deck } });
  };

  const player = (id: PlayerId) => (
    <div className={`home__player home__player--p${id}`} role="group" aria-labelledby={`home-j${id}`}>
      <h3 id={`home-j${id}`}>
        <span className={`shape shape--p${id}`} />
        Joueur {id}
        {id === 1 && <small>commence</small>}
      </h3>
      {id === 2 && (
        <div className="home__switch" role="group" aria-label="Joueur 2 joué par">
          {J2_PLAYED_BY.map(([ai, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={(setup.ai ?? null) === ai}
              onClick={() => setSetup({ ...setup, ai })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="home__decks">
        {DECKS.map((deck) => (
          <label key={deck.id} className="home__deck">
            <input
              type="radio"
              name={`deck-j${id}`}
              value={deck.id}
              checked={setup.decks[id].id === deck.id}
              onChange={() => setDeck(id, deck.id)}
            />
            {deck.name}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <main className="home">
      <header className="home__header">
        <p className="home__kicker">TCG tactique</p>
        <h1>Nouvelle partie</h1>
        <p className="home__lead">Deux joueurs sur le même écran, ou contre l’IA. Choisis la carte et les decks.</p>
      </header>

      <section className="home__section" aria-labelledby="home-maps">
        <h2 id="home-maps">Carte</h2>
        <div className="home__maps">
          {BOARDS.map((board) => {
            const { title, details } = boardInfo(board);
            return (
              <label key={board.name} className="home__map">
                <input
                  type="radio"
                  name="carte"
                  value={board.name}
                  checked={setup.board === board}
                  onChange={() => setSetup({ ...setup, board })}
                />
                <span className="home__map-title">{title}</span>
                <span className="home__map-details">{details.join(' · ')}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="home__section" aria-labelledby="home-mode">
        <h2 id="home-mode">Mode</h2>
        <div className="home__mode">
          <div className="home__switch" role="group" aria-labelledby="home-mode">
            {MODES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                disabled={id === 'contestation' && !setup.board.contestation}
                onClick={() => setSetup({ ...setup, mode: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="home__mode-details">
            {MODES.find(([id]) => id === mode)![2]}
            {!setup.board.contestation && ` Contestation : sur les cartes ${CONTEST_BOARDS}.`}
          </p>
        </div>
      </section>

      <section className="home__section" aria-labelledby="home-players">
        <h2 id="home-players">Joueurs</h2>
        <div className="home__players">
          {player(1)}
          {player(2)}
        </div>
      </section>

      <button type="button" className="btn btn--gold home__start" onClick={() => onStart({ ...setup, mode })}>
        <Icon name="broadsword" />
        Lancer la partie
      </button>
    </main>
  );
}
