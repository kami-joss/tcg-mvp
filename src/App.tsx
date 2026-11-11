// Racine : l'accueil (`/`) règle la partie ; le jeu (`/game`, réglages dans l'adresse) fait vivre la session (état
// complet, journal, passage d'écran) dans un reducer ; la logique est dans ui/session.ts et l'écran ne reçoit que la vue
// du joueur actif (SPEC.md §2). Pages ouvertes depuis l'accueil : les decks (`/decks`), les règles (`/regles`), les
// barèmes de coût des monstres (`/baremes`) et l'atelier de cartes (`/atelier`).
import { useEffect, useReducer, useState } from 'react';
import { createOnlineGame, saveToken } from './online/client';
import { DecksScreen } from './ui/DecksScreen';
import { HomeScreen } from './ui/HomeScreen';
import { OnlineScreen } from './ui/OnlineScreen';
import { RulesScreen } from './ui/RulesScreen';
import { ScalesScreen } from './ui/ScalesScreen';
import { SessionScreen } from './ui/SessionScreen';
import { WorkshopScreen } from './ui/WorkshopScreen';
import { deckFromQuery, decksUrl, loadLastSetup, onlineRoomOf, onlineUrl, pageOf, pageUrl, saveLastSetup, setupFromQuery } from './ui/routes';
import type { Page } from './ui/routes';
import { newSession, rollOpening, updateSession } from './ui/session';
import type { Setup } from './ui/session';
import { loadPatches } from './ui/workshop';

const BASE = import.meta.env.BASE_URL;

const currentLocation = () => ({ pathname: window.location.pathname, search: window.location.search });

export function App() {
  const [location, setLocation] = useState(currentLocation);
  // Partie en ligne : création en cours, et la raison d'un échec, montrée à l'accueil.
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
  if (page === 'scales') return <ScalesScreen onNavigate={toPage} />;
  if (page === 'workshop') {
    // « Tester en partie » : l'accueil, avec les cartes de l'atelier déjà choisies.
    const test = () => {
      saveLastSetup({ ...loadLastSetup(), workshop: loadPatches() });
      toPage('home');
    };
    return <WorkshopScreen onNavigate={toPage} onTest={test} />;
  }
  if (page === 'online') {
    const roomId = onlineRoomOf(location.pathname, BASE)!;
    return (
      <OnlineScreen
        key={roomId}
        roomId={roomId}
        link={`${window.location.origin}${onlineUrl(roomId, BASE)}`}
        onHome={() => navigate(pageUrl('home', null, BASE))}
      />
    );
  }
  if (page === 'game') {
    // Sans réglages dans l'adresse : ceux de la dernière partie lancée.
    const setup = location.search ? setupFromQuery(location.search, loadPatches()) : loadLastSetup();
    return <GamePage key={location.search} setup={setup} onHome={() => navigate(pageUrl('home', null, BASE))} />;
  }
  // « Joueur 2 : en ligne » : la partie est créée sur le serveur, l'hôte garde son jeton et arrive dans sa salle d'attente.
  const startOnline = async (setup: Setup) => {
    setCreating(true);
    setCreateError(null);
    const result = await createOnlineGame(setup);
    setCreating(false);
    if ('error' in result) return setCreateError(result.error);
    saveToken(result.id, result.token);
    navigate(onlineUrl(result.id, BASE));
  };
  return (
    <HomeScreen
      initial={loadLastSetup()}
      workshop={loadPatches()}
      onNavigate={toPage}
      busy={creating}
      error={createError}
      onStart={(setup) => {
        saveLastSetup(setup);
        if (setup.online) void startOnline(setup);
        else navigate(pageUrl('game', setup, BASE));
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
