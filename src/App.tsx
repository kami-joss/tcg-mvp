// Racine : deux pages. L'accueil (`/`) règle la partie ; le jeu (`/game`, réglages dans l'adresse) fait vivre la session
// (état complet, journal, passage d'écran) dans un reducer ; la logique est dans ui/session.ts et l'écran ne reçoit que
// la vue du joueur actif (SPEC.md §2).
import { useEffect, useReducer, useState } from 'react';
import { HomeScreen } from './ui/HomeScreen';
import { SessionScreen } from './ui/SessionScreen';
import { loadLastSetup, pageOf, pageUrl, saveLastSetup, setupFromQuery } from './ui/routes';
import { newSession, updateSession } from './ui/session';
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
  };

  if (pageOf(location.pathname, BASE) === 'game') {
    // Sans réglages dans l'adresse : ceux de la dernière partie lancée.
    const setup = location.search ? setupFromQuery(location.search) : loadLastSetup();
    return <GamePage key={location.search} setup={setup} onHome={() => navigate(pageUrl('home', null, BASE))} />;
  }
  return (
    <HomeScreen
      initial={loadLastSetup()}
      onStart={(setup) => {
        saveLastSetup(setup);
        navigate(pageUrl('game', setup, BASE));
      }}
    />
  );
}

function GamePage({ setup, onHome }: { setup: Setup; onHome: () => void }) {
  const [session, dispatch] = useReducer(updateSession, setup, (initial) => newSession(1, initial));
  return <SessionScreen session={session} dispatch={dispatch} onHome={onHome} />;
}
