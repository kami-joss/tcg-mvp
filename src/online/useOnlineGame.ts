// Connexion d'un écran à sa partie en ligne (SPEC.md §7 ter) : la salle existe-t-elle, puis le WebSocket, la
// présentation (version du jeu et jeton gardé par ce navigateur), la reconnexion après une coupure (de plus en plus
// espacée, jusqu'à 10 s), et rien de plus après une erreur qui arrête tout. Les messages passent par `onlineReducer`.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { FATAL_ERRORS, initialOnlineState, loadToken, onlineReducer, saveToken, socketUrl } from './client';
import type { OnlineState } from './client';
import { BUILD_ID } from './version';
import type { ClientMessage, ServerMessage } from './protocol';

/** La partie existe-t-elle ? `true`, `false` (le serveur dit non), ou `null` s'il ne répond pas. */
async function exists(roomId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`/api/parties/${roomId}`);
    return response.ok ? true : response.status === 404 ? false : null;
  } catch {
    return null;
  }
}

export function useOnlineGame(roomId: string): { readonly state: OnlineState; readonly send: (message: ClientMessage) => void } {
  const [state, dispatch] = useReducer(onlineReducer, roomId, initialOnlineState);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let fatal = false;
    let failures = 0;
    let timer: number | undefined;

    const retry = () => {
      timer = window.setTimeout(connect, Math.min(10_000, 500 * 2 ** Math.min(failures, 5)));
    };
    /** Deux échecs de suite : la partie a peut-être été effacée. */
    const check = (then: () => void) =>
      void exists(roomId).then((found) => {
        if (stopped) return;
        if (found === false) dispatch({ type: 'notFound' });
        else then();
      });

    function connect() {
      if (stopped) return;
      const ws = new WebSocket(socketUrl(roomId, window.location));
      socket.current = ws;
      let opened = false;
      ws.addEventListener('open', () => {
        opened = true;
        failures = 0;
        dispatch({ type: 'opened' });
        const hello: ClientMessage = { type: 'hello', version: BUILD_ID, token: loadToken(roomId) };
        ws.send(JSON.stringify(hello));
      });
      ws.addEventListener('message', (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === 'welcome') saveToken(roomId, message.token);
        if (message.type === 'error' && FATAL_ERRORS.includes(message.code)) fatal = true;
        dispatch({ type: 'message', message });
      });
      ws.addEventListener('close', () => {
        if (socket.current === ws) socket.current = null;
        if (stopped || fatal) return;
        dispatch({ type: 'closed' });
        if (!opened) failures++;
        if (failures >= 2) check(retry);
        else retry();
      });
    }

    check(connect);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
    };
  }, [roomId]);

  const send = useCallback((message: ClientMessage) => {
    const ws = socket.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  return { state, send };
}
