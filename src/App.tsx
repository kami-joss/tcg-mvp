// Racine : l'accueil (`/`) règle la partie ; le jeu (`/game`, réglages dans l'adresse) fait vivre la session (état
// complet, journal, passage d'écran) dans un reducer ; la logique est dans ui/session.ts et l'écran ne reçoit que la vue
// du joueur actif (SPEC.md §2). Deux pages de consultation, ouvertes depuis l'accueil : les decks (`/decks`) et les
// règles (`/regles`).
import { useEffect, useReducer, useState } from 'react';
import { DecksScreen } from './ui/DecksScreen';
import { HomeScreen } from './ui/HomeScreen';
import { RulesScreen } from './ui/RulesScreen';
import { SessionScreen } from './ui/SessionScreen';
import { deckFromQuery, decksUrl, loadLastSetup, pageOf, pageUrl, saveLastSetup, setupFromQuery } from './ui/routes';
import type { Page } from './ui/routes';
import { newSession, rollOpening, updateSession } from './ui/session';
import type { Setup } from './ui/session';

const BASE = import.meta.env.BASE_URL;

const currentLocation = () => ({ pathname: window.location.pathname, search: window.location.search });

export function App() {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const sync = () => setLocation(currentLocation());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const navigate = (url: string) => {
    window.history.pushState(null, '', url);
    setLocation(currentLocation());
    window.scrollTo(0, 0);
  };
  const toPage = (page: Page) => navigate(pageUrl(page, null, BASE));

  const page = pageOf(location.pathname, BASE);
  if (page === 'decks') {
    return (
      <DecksScreen
        initial={deckFromQuery(location.search)}
        onDeck={(deck) => window.history.replaceState(null, '', decksUrl(deck, BASE))}
        onNavigate={toPage}
      />
    );
  }
  if (page === 'rules') return <RulesScreen onNavigate={toPage} />;
  if (page === 'game') {
    // Sans réglages dans l'adresse : ceux de la dernière partie lancée.
    const setup = location.search ? setupFromQuery(location.search) : loadLastSetup();
    return <GamePage key={location.search} setup={setup} onHome={() => navigate(pageUrl('home', null, BASE))} />;
  }
  return (
    <HomeScreen
      initial={loadLastSetup()}
      onNavigate={toPage}
      onStart={(setup) => {
        saveLastSetup(setup);
        navigate(pageUrl('game', setup, BASE));
      }}
    />
  );
}

function GamePage({ setup, onHome }: { setup: Setup; onHome: () => void }) {
  const [session, dispatch] = useReducer(updateSession, setup, (initial) => newSession(1, initial, rollOpening()));
  // En développement, la partie est jouable depuis la console (essais en navigateur : `__game.dispatch(…)`).
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __game: { session, dispatch } });
  }, [session]);
  return <SessionScreen session={session} dispatch={dispatch} onHome={onHome} />;
}
