// Racine : la session de jeu (état complet, journal, passage d'écran) vit dans un reducer ; la logique
// est dans ui/session.ts et l'écran ne reçoit que la vue du joueur actif (SPEC.md §2).
import { useReducer } from 'react';
import { SessionScreen } from './ui/SessionScreen';
import { newSession, updateSession } from './ui/session';

export function App() {
  const [session, dispatch] = useReducer(updateSession, 1, newSession);
  return <SessionScreen session={session} dispatch={dispatch} />;
}
