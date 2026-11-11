// Serveur des parties en ligne (SPEC.md §7 ter) : un Worker Cloudflare. Il sert le site (les fichiers de `dist/`, par
// l'option `assets` de wrangler, l'adresse d'une page renvoyant `index.html`) et transmet à la salle de chaque partie
// (Durable Object `GameRoom`) :
//   POST /api/parties            créer une partie : { settings, deck } → { id, token } (l'hôte garde son jeton)
//   GET  /api/parties/<id>       la partie existe-t-elle ? { phase } (200) ou 404 : « partie introuvable » plutôt qu'une coupure
//   GET  /api/parties/<id>/ws    la connexion WebSocket d'un joueur à la salle (lien d'invitation : /partie/<id>)
import { isRoomId, newRoomId, newToken } from './ids';

export { GameRoom } from './game-room';

interface Env {
  readonly ROOMS: DurableObjectNamespace;
}

/** Taille au plus d'une demande de création (des réglages et un nom de deck). */
const MAX_BODY = 16 * 1024;

const ROOM_PATH = /^\/api\/parties\/([^/]+)(\/ws)?$/;

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/parties') {
      return request.method === 'POST' ? createParty(request, env) : json({ error: 'Seulement POST.' }, 405);
    }
    const room = ROOM_PATH.exec(url.pathname);
    if (room) {
      const id = room[1]!;
      if (!isRoomId(id)) return json({ error: 'Partie introuvable.' }, 404);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(id));
      return room[2] ? stub.fetch(request) : stub.fetch('https://salle/etat');
    }
    return new Response('Introuvable.', { status: 404 });
  },
};

/** Une nouvelle partie : son identifiant (le lien d'invitation) et le jeton de l'hôte sont tirés ici, la salle vérifie le reste. */
async function createParty(request: Request, env: Env): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'Demande trop longue.' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Demande illisible.' }, 400);
  }
  const { settings, deck } = (typeof body === 'object' && body !== null ? body : {}) as { settings?: unknown; deck?: unknown };
  if (typeof deck !== 'string') return json({ error: 'Deck manquant.' }, 400);
  const id = newRoomId();
  return env.ROOMS.get(env.ROOMS.idFromName(id)).fetch('https://salle/creer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, token: newToken(), settings, deck }),
  });
}
