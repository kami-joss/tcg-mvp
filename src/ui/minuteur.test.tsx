import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TURN_TIMER_SECONDS, getPlayerView } from '../engine';
import { HomeScreen } from './HomeScreen';
import { setupFromQuery, setupToQuery } from './routes';
import { DEFAULT_SETUP, newSession, updateSession } from './session';
import type { Session, Setup } from './session';
import { DEFAULT_SETTINGS } from './settings';
import { TopBar } from './TopBar';
import { TurnTimer } from './TurnTimerBadge';
import { TIMER_WARNING_MS, TURN_TIMER_MS, isTimeUp, remainingMs, spend, timerDisplay, timerRuns, timerState, timerText } from './turnTimer';
import { GameScreen } from './GameScreen';

// Minuteur de tour (option de l'accueil, SPEC.md §4.2) : 3 minutes de réflexion par tour, sans compter les actions ni
// leurs animations ; au-delà, le tour finit.

const timed: Setup = { ...DEFAULT_SETUP, timer: true };
const noop = () => {};

describe('le temps de réflexion', () => {
  it('3 minutes par tour', () => {
    expect(TURN_TIMER_SECONDS).toBe(180);
    expect(TURN_TIMER_MS).toBe(180_000);
  });

  it('n’avance que quand le chrono tourne ; le tour finit à 0:00', () => {
    expect(spend(1000, 250, true)).toBe(1250);
    expect(spend(1000, 250, false)).toBe(1000);
    expect(spend(1000, -5, true)).toBe(1000);
    expect(remainingMs(TURN_TIMER_MS - 1)).toBe(1);
    expect([isTimeUp(TURN_TIMER_MS - 1), isTimeUp(TURN_TIMER_MS)]).toEqual([false, true]);
  });

  it('le chrono tourne pendant le tour du joueur de l’écran, sans action en cours, et seulement avec un minuteur', () => {
    expect(timerRuns(true, true, false)).toBe(true);
    expect(timerRuns(true, true, true)).toBe(false); // Une action se joue (animation).
    expect(timerRuns(true, false, false)).toBe(false); // Tour adverse : l'IA n'est pas minutée.
    expect(timerRuns(false, true, false)).toBe(false);
  });

  it('affichage : minutes et secondes arrondies au-dessus, alerte sous 30 secondes, pause pendant une action', () => {
    expect([timerText(180_000), timerText(9_100), timerText(400), timerText(0)]).toEqual(['3:00', '0:10', '0:01', '0:00']);
    expect(timerState(0, true)).toEqual({ text: '3:00', low: false, paused: false });
    expect(timerState(TURN_TIMER_MS - TIMER_WARNING_MS, false)).toEqual({ text: '0:30', low: true, paused: true });
  });
});

describe('à l’accueil et dans l’adresse', () => {
  it('« Minuteur : Sans / 3 minutes », sans minuteur par défaut', () => {
    const html = renderToStaticMarkup(<HomeScreen initial={DEFAULT_SETUP} onStart={noop} />);
    expect(html).toContain('id="home-timer">Minuteur</h2>');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Sans<\/button>/);
    expect(html).toContain('Pas de limite de temps');
    const on = renderToStaticMarkup(<HomeScreen initial={timed} onStart={noop} />);
    expect(on).toMatch(/aria-pressed="true"[^>]*>3 minutes<\/button>/);
    expect(on).toContain('Chaque joueur a 3 minutes de réflexion par tour : les actions et leurs animations ne comptent pas.');
  });

  it('`minuteur=1` dans l’adresse du jeu, seulement s’il est choisi', () => {
    expect(setupToQuery(timed)).toContain('minuteur=1');
    expect(setupToQuery(DEFAULT_SETUP)).not.toContain('minuteur');
    expect(setupFromQuery(setupToQuery(timed)).timer).toBe(true);
    expect(setupFromQuery(setupToQuery(DEFAULT_SETUP)).timer).toBeUndefined();
  });
});

describe('le temps écoulé', () => {
  const ended = (session: Session) => updateSession(session, { type: 'timeout' });

  it('le journal le dit dès le début de la partie', () => {
    expect(newSession(1, timed).log[0]!.text).toContain(', minuteur de 3 minutes par tour,');
    expect(newSession(1, DEFAULT_SETUP).log[0]!.text).not.toContain('minuteur');
  });

  it('le tour du joueur actif finit, et le journal le dit', () => {
    const session = ended(newSession(1, timed));
    expect(session.game.activePlayer).toBe(2);
    expect(session.handoffTo).toBe(2);
    const [timeout, turn] = session.log.slice(-2);
    expect(timeout).toMatchObject({ kind: 'action', player: 1, icon: 'timer-outline', text: 'Temps de réflexion écoulé : fin du tour de J1.' });
    expect(turn!.kind).toBe('turn');
  });

  it('sans minuteur, pendant le passage d’écran ou au tour de l’IA, rien ne se passe', () => {
    const plain = newSession(1, DEFAULT_SETUP);
    expect(ended(plain)).toBe(plain);
    const handoff = ended(newSession(1, timed));
    expect(ended(handoff)).toBe(handoff);
    const againstAi = updateSession(newSession(1, { ...timed, ai: 2 }), { type: 'play', action: { type: 'endTurn' } });
    expect(againstAi.game.activePlayer).toBe(2);
    expect(ended(againstAi)).toBe(againstAi);
  });
});

describe('dans la barre du haut', () => {
  const topBar = (setup: Setup, timer: Parameters<typeof TopBar>[0]['timer']) =>
    renderToStaticMarkup(
      <TopBar
        view={getPlayerView(newSession(1, setup).game, 1)}
        setup={setup}
        canEndTurn
        onEndTurn={noop}
        helpOpen={false}
        onHelp={noop}
        settings={DEFAULT_SETTINGS}
        boardView="iso"
        isoAvailable
        tiltAvailable
        onSettings={noop}
        onSound={noop}
        onHome={noop}
        pile={null}
        onPile={noop}
        timer={timer}
      />,
    );

  it('à côté de « Fin du tour » pendant son tour ; sa place reste réservée au tour adverse ; rien sans minuteur', () => {
    const mine = topBar(timed, { shown: true, key: '1', spent: 0, running: true, local: true, onTimeUp: noop });
    expect(mine).toContain('class="topbar__end-turn has-timer"');
    expect(mine).toMatch(/<span class="turn-timer" role="timer" aria-label="Temps de réflexion restant : 3:00"/);
    const theirs = topBar(timed, { shown: false, key: '2', spent: 0, running: false, local: true, onTimeUp: noop });
    expect(theirs).toContain('<span class="topbar__timer"></span>');
    expect(theirs).not.toContain('role="timer"');
    expect(topBar(DEFAULT_SETUP, null)).not.toContain('topbar__timer');
  });

  it('en alerte sous 30 secondes, en pause pendant une action', () => {
    const low = renderToStaticMarkup(<TurnTimer running onTimeUp={noop} initialSpent={TURN_TIMER_MS - 20_000} />);
    expect(low).toContain('class="turn-timer is-low"');
    expect(low).toContain('0:20');
    expect(renderToStaticMarkup(<TurnTimer running={false} onTimeUp={noop} />)).toContain('class="turn-timer is-paused"');
  });
});

describe('minuteur suivi (partie en ligne)', () => {
  const base = { enabled: true, clock: null, myTurn: true, busy: false, turn: 3, over: false };

  it('en local : pendant son tour, de 3:00 à chaque tour ; il finit lui-même le tour', () => {
    expect(timerDisplay(base)).toEqual({ shown: true, key: '3', spent: 0, running: true, local: true });
    expect(timerDisplay({ ...base, myTurn: false })).toMatchObject({ shown: false, running: false });
    expect(timerDisplay({ ...base, busy: true })).toMatchObject({ shown: true, running: false });
    expect(timerDisplay({ ...base, enabled: false })).toBeNull();
  });

  it('avec une horloge suivie : pendant le tour de chacun, du temps qu’elle donne, sans finir le tour lui-même', () => {
    const clock = { id: 7, spent: 60_000, running: true };
    expect(timerDisplay({ ...base, enabled: false, myTurn: false, clock })).toEqual({ shown: true, key: '3:7', spent: 60_000, running: true, local: false });
    // Arrêté pendant les animations de cet écran, ou quand l'horloge ne tourne pas ; rien une fois la partie finie.
    expect(timerDisplay({ ...base, clock, busy: true })).toMatchObject({ running: false });
    expect(timerDisplay({ ...base, clock: { ...clock, running: false } })).toMatchObject({ running: false });
    expect(timerDisplay({ ...base, clock, over: true })).toMatchObject({ shown: false });
  });

  it('l’écran de jeu affiche l’horloge du serveur, même pendant le tour adverse', () => {
    const session = newSession(1, DEFAULT_SETUP);
    const screen = (clock: { id: number; spent: number; running: boolean } | null) =>
      renderToStaticMarkup(
        <GameScreen view={getPlayerView(session.game, 2)} before={null} log={session.log} onAction={noop} setup={DEFAULT_SETUP} onHome={noop} clock={clock} />,
      );
    expect(screen({ id: 1, spent: 60_000, running: true })).toContain('aria-label="Temps de réflexion restant : 2:00"');
    expect(screen(null)).not.toContain('role="timer"');
  });
});
