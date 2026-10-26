// Écran affiché selon la session : passage hotseat entre deux tours, ou jeu vu par le joueur actif ; contre l'IA,
// toujours vu par le joueur humain, et l'IA joue son tour une action à la fois (chaque action est animée).
import { useMemo } from 'react';
import { chooseAction } from '../ai/bot';
import { applyAction, getPlayerView } from '../engine';
import type { Action } from '../engine';
import { GameScreen } from './GameScreen';
import { HandoffScreen } from './HandoffScreen';
import { viewerOf } from './session';
import type { Session, SessionEvent } from './session';

interface SessionScreenProps {
  session: Session;
  dispatch: (event: SessionEvent) => void;
  /** Retour à l'accueil, pour régler une nouvelle partie. */
  onHome: () => void;
}

export function SessionScreen({ session, dispatch, onHome }: SessionScreenProps) {
  const { game, previous } = session;
  const viewer = viewerOf(session);
  const view = useMemo(() => getPlayerView(game, viewer), [game, viewer]);
  // L'état d'avant la dernière action, vu par le même joueur : point de départ des animations.
  const before = useMemo(() => (previous ? getPlayerView(previous, viewer) : null), [previous, viewer]);
  const { ai } = session.setup;
  const aiTurn = ai !== undefined && ai !== null && game.activePlayer === ai && game.winner === null;
  const aiStep = () => {
    let action: Action = chooseAction(game, game.activePlayer);
    try {
      applyAction(game, action);
    } catch {
      action = { type: 'endTurn' }; // Ne jamais bloquer la partie sur une action refusée.
    }
    dispatch({ type: 'play', action });
  };

  // Pendant le passage, rien de la partie n'est rendu, pas même dans la page.
  if (session.handoffTo !== null) {
    return <HandoffScreen player={session.handoffTo} onReady={() => dispatch({ type: 'ready' })} />;
  }

  return (
    <GameScreen
      key={session.id}
      view={view}
      before={before}
      log={session.log}
      onAction={(action) => dispatch({ type: 'play', action })}
      setup={session.setup}
      onRestart={() => dispatch({ type: 'restart' })}
      onHome={onHome}
      autoPlay={aiTurn ? aiStep : null}
    />
  );
}
