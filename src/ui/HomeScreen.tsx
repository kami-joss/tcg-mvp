// Accueil (`/`) : on règle la partie (carte, mode, économie, cartes d'origine ou de l'atelier, deck de chaque joueur, J2
// humain ou IA), puis on la lance sur `/game`. Des liens ouvrent les decks, les règles du jeu, les barèmes et l'atelier.
import { useEffect, useState } from 'react';
import { BASE_MANA_FIRST_TURN, BOARDS, DECKS, MANA_GROWTH_PER_TURN } from '../engine';
import type { Board, Economy, GameMode, ManaRules, PlayerId } from '../engine';
import { Icon } from './Icon';
import { preloadBoard } from './pixi/preload';
import type { Page } from './routes';
import { MANA_CHOICES, TIMER_TEXT, VICTORY_CHOICES, manaRulesOf, modeOf, victoryVpOf } from './session';
import type { Setup } from './session';
import { hasPatches, modifiedText, workshopCards } from './workshop';
import type { WorkshopPatches } from './workshop';

interface HomeScreenProps {
  initial: Setup;
  onStart: (setup: Setup) => void;
  /** Ouvrir une page de consultation (decks, règles, barèmes, atelier). */
  onNavigate?: (page: Page) => void;
  /** Réglages de l'atelier gardés par ce navigateur : « Cartes de l'atelier » les joue. */
  workshop?: WorkshopPatches;
  /** Partie en ligne en cours de création : le bouton attend. */
  busy?: boolean;
  /** La création d'une partie en ligne a échoué : pourquoi. */
  error?: string | null;
}

/** Qui joue J2 : un humain sur le même écran, l'IA, ou un adversaire en ligne (lien d'invitation, SPEC.md §7 ter). */
type J2Choice = 'human' | 'ai' | 'online';

const J2_PLAYED_BY: readonly (readonly [J2Choice, string])[] = [
  ['human', 'Un humain'],
  ['ai', 'L’IA'],
  ['online', 'En ligne'],
];

const j2Of = (setup: Setup): J2Choice => (setup.online ? 'online' : setup.ai ? 'ai' : 'human');

/** Les réglages avec ce J2 ; en ligne, les cartes d'origine (celles de l'atelier n'y passent pas encore). */
function withJ2(setup: Setup, choice: J2Choice): Setup {
  const { online: _online, ...rest } = setup;
  if (choice !== 'online') return { ...rest, ai: choice === 'ai' ? 2 : null };
  const { workshop: _workshop, ...origin } = rest;
  return { ...origin, ai: null, online: true };
}

/** Modes de jeu (SPEC.md §4.4, §4.4 bis) : nom et règle en une phrase. */
const MODES: readonly (readonly [GameMode, string, string])[] = [
  ['normal', 'Normal', 'Chaque mana zone est une case : on la tient en l’occupant.'],
  [
    'contestation',
    'Contestation',
    'Chaque mana zone devient une zone de 9 cases. Seul dedans, on la tient ; à deux, elle est contestée : ni mana ni VP, ni terrain posé. Un terrain la tient tant qu’il n’est pas détruit.',
  ],
];

/** Économies du mana (SPEC.md §4.2, §10) : nom et règle en une phrase. */
const ECONOMIES: readonly (readonly [Economy, string, string])[] = [
  ['classic', 'Classique', 'Le mana non dépensé est perdu à la fin du tour.'],
  ['reserve', 'Réserve', 'Le mana se garde d’un tour à l’autre.'],
];

/** Réglages du mana (SPEC.md §4.2) : nom affiché et champ. */
const MANA_SETTINGS: readonly (readonly [keyof ManaRules, string])[] = [
  ['baseCap', 'Génération max'],
  ['limit', 'Limite'],
];

/** Les réglages du mana en une phrase. */
const manaRulesText = ({ baseCap, limit }: ManaRules) =>
  `Mana de base : ${BASE_MANA_FIRST_TURN} au premier tour, +${MANA_GROWTH_PER_TURN} à chaque tour, jusqu’à ${baseCap}, plus le mana des mana zones. Jamais plus de ${limit} mana : le surplus est perdu.`;

/** Cartes qui proposent le mode contestation, pour le dire sur la carte qui ne le propose pas. */
const CONTEST_BOARDS = BOARDS.filter((board) => board.contestation)
  .map((board) => `${board.rows} × ${board.cols}`)
  .join(' et ');

/** Nom de la carte sans sa taille, et ce qu'elle a de particulier. */
function boardInfo(board: Board): { title: string; details: string[] } {
  const title = board.name.replace(/\s*\(.*\)$/, '');
  const details = [`${board.rows} × ${board.cols}`];
  if (board.scenery) details.push('vue isométrique');
  if (board.contestation) details.push('mode contestation');
  return { title, details };
}

export function HomeScreen({ initial, onStart, onNavigate, workshop = {}, busy = false, error = null }: HomeScreenProps) {
  const [setup, setSetup] = useState<Setup>(initial);
  // Le plateau choisi se prépare pendant qu'on règle la partie (sol peint, décor) : l'écran de chargement sera court.
  useEffect(() => preloadBoard(setup.board), [setup.board]);
  const usesWorkshop = hasPatches(setup.workshop);
  const setCards = (fromWorkshop: boolean) => {
    const { workshop: _previous, ...rest } = setup;
    setSetup(fromWorkshop ? { ...rest, workshop } : rest);
  };
  const mode = modeOf(setup);
  const manaRules = manaRulesOf(setup);
  const setManaRule = (key: keyof ManaRules, value: number) => setSetup({ ...setup, manaRules: { ...manaRules, [key]: value } });
  const victoryVp = victoryVpOf(setup);
  const setVictoryVp = (value: number) => setSetup({ ...setup, victoryVp: value });
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
          {J2_PLAYED_BY.map(([choice, label]) => (
            <button key={choice} type="button" aria-pressed={j2Of(setup) === choice} onClick={() => setSetup(withJ2(setup, choice))}>
              {label}
            </button>
          ))}
        </div>
      )}
      {id === 2 && setup.online ? (
        <p className="home__mode-details">Ton adversaire choisit son deck en arrivant par le lien que tu lui enverras.</p>
      ) : (
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
      )}
    </div>
  );

  return (
    <main className="home">
      <header className="home__header">
        <p className="home__kicker">TCG tactique</p>
        <h1>Nouvelle partie</h1>
        <p className="home__lead">Deux joueurs sur le même écran, contre l’IA, ou en ligne avec un lien d’invitation. Choisis la carte et les decks.</p>
        <nav className="home__links" aria-label="Avant de jouer">
          <button type="button" className="btn btn--ghost" onClick={() => onNavigate?.('decks')}>
            <Icon name="spell-book" />
            Voir les decks
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onNavigate?.('rules')}>
            <Icon name="help-circle-outline" />
            Règles du jeu
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onNavigate?.('scales')}>
            <Icon name="water-drop" />
            Barèmes
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onNavigate?.('workshop')}>
            <Icon name="anvil" />
            Atelier
          </button>
        </nav>
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
        <div className="home__mode">
          <div className="home__stepper">
            <span id="home-victory" className="home__stepper-label">
              Victoire
            </span>
            <div className="home__switch" role="group" aria-labelledby="home-victory">
              <button type="button" aria-label="VP pour gagner : moins" disabled={victoryVp <= VICTORY_CHOICES.min} onClick={() => setVictoryVp(victoryVp - VICTORY_CHOICES.step)}>
                −
              </button>
              <output aria-live="polite">{victoryVp}</output>
              <button type="button" aria-label="VP pour gagner : plus" disabled={victoryVp >= VICTORY_CHOICES.max} onClick={() => setVictoryVp(victoryVp + VICTORY_CHOICES.step)}>
                +
              </button>
            </div>
          </div>
          <p className="home__mode-details">{`Le premier à ${victoryVp} VP gagne la partie.`}</p>
        </div>
      </section>

      <section className="home__section" aria-labelledby="home-economy">
        <h2 id="home-economy">Économie</h2>
        <div className="home__mode">
          <div className="home__switch" role="group" aria-labelledby="home-economy">
            {ECONOMIES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={(setup.economy ?? 'classic') === id}
                onClick={() => setSetup({ ...setup, economy: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="home__mode-details">{ECONOMIES.find(([id]) => id === (setup.economy ?? 'classic'))![2]}</p>
        </div>
        <div className="home__mode">
          {MANA_SETTINGS.map(([key, label]) => {
            const value = manaRules[key];
            const { min, max } = MANA_CHOICES[key];
            return (
              <div key={key} className="home__stepper">
                <span id={`home-mana-${key}`} className="home__stepper-label">
                  {label}
                </span>
                <div className="home__switch" role="group" aria-labelledby={`home-mana-${key}`}>
                  <button type="button" aria-label={`${label} : moins`} disabled={value <= min} onClick={() => setManaRule(key, value - 1)}>
                    −
                  </button>
                  <output aria-live="polite">{value}</output>
                  <button type="button" aria-label={`${label} : plus`} disabled={value >= max} onClick={() => setManaRule(key, value + 1)}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
          <p className="home__mode-details">{manaRulesText(manaRules)}</p>
        </div>
      </section>

      <section className="home__section" aria-labelledby="home-timer">
        <h2 id="home-timer">Minuteur</h2>
        <div className="home__mode">
          <div className="home__switch" role="group" aria-labelledby="home-timer">
            <button type="button" aria-pressed={!setup.timer} onClick={() => setSetup({ ...setup, timer: false })}>
              Sans
            </button>
            <button type="button" aria-pressed={setup.timer === true} onClick={() => setSetup({ ...setup, timer: true })}>
              {TIMER_TEXT}
            </button>
          </div>
          <p className="home__mode-details">
            {setup.timer
              ? `Chaque joueur a ${TIMER_TEXT} de réflexion par tour : les actions et leurs animations ne comptent pas. À la fin du temps, son tour finit.`
              : 'Pas de limite de temps : chacun prend le temps qu’il veut.'}
          </p>
        </div>
      </section>

      <section className="home__section" aria-labelledby="home-cards">
        <h2 id="home-cards">Cartes</h2>
        <div className="home__mode">
          <div className="home__switch" role="group" aria-labelledby="home-cards">
            <button type="button" aria-pressed={!usesWorkshop} onClick={() => setCards(false)}>
              D’origine
            </button>
            <button type="button" aria-pressed={usesWorkshop} disabled={!hasPatches(workshop) || setup.online === true} onClick={() => setCards(true)}>
              De l’atelier
            </button>
          </div>
          <p className="home__mode-details">
            {setup.online
              ? 'En ligne, la partie se joue avec les cartes d’origine pour l’instant.'
              : usesWorkshop
              ? `La partie se joue avec tes réglages de l’atelier : ${modifiedText(workshopCards(setup.workshop!), setup.workshop!)}.`
              : hasPatches(workshop)
                ? `Les cartes du jeu, telles qu’elles sont. L’atelier a ${modifiedText(workshopCards(workshop), workshop)}.`
                : 'Les cartes du jeu, telles qu’elles sont. L’atelier n’a aucun réglage pour l’instant.'}
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

      <button type="button" className="btn btn--gold home__start" disabled={busy} onClick={() => onStart({ ...setup, mode })}>
        <Icon name="broadsword" />
        {setup.online ? (busy ? 'Création de la partie…' : 'Créer la partie en ligne') : 'Lancer la partie'}
      </button>
      {error && (
        <p className="home__error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
