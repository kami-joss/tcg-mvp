// Essai de bout en bout du serveur des parties en ligne (SPEC.md §7 ter) : `npm run online` dans un terminal (le site
// et le serveur sur http://127.0.0.1:8787), puis `npm run online:check` : le site, la création d'une partie, deux
// joueurs en WebSocket, un coup, le chrono, une déconnexion, l'abandon. Sur le site en ligne :
// `node scripts/online-check.mjs https://… <version>` (la version du jeu mis en ligne, que `npm run deploy` affiche).
const BASE = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const WS = BASE.replace(/^http/, 'ws');
const VERSION = process.argv[3] ?? 'dev';
const SETTINGS = { board: 'champ-de-bataille-13x13', mode: 'normal', economy: 'classic', manaRules: { baseCap: 5, limit: 10 }, timer: true };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (label, ok, detail = '') => results.push(`${ok ? 'OK  ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);

async function ready() {
  for (let i = 0; i < 180; i++) {
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return true;
    } catch {}
    await wait(500);
  }
  return false;
}

/** Un joueur : sa connexion et tous les messages reçus. */
function player(id) {
  const ws = new WebSocket(`${WS}/api/parties/${id}/ws`);
  const inbox = [];
  const waiting = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    inbox.push(message);
    for (const w of [...waiting]) if (w.test(message)) { waiting.splice(waiting.indexOf(w), 1); w.resolve(message); }
  });
  const opened = new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  const next = (type, test = () => true, ms = 5000) =>
    new Promise((resolve, reject) => {
      const found = inbox.find((m) => m.type === type && test(m) && !m.__taken);
      if (found) { found.__taken = true; return resolve(found); }
      const entry = { test: (m) => m.type === type && test(m), resolve: (m) => { m.__taken = true; resolve(m); } };
      waiting.push(entry);
      setTimeout(() => reject(new Error(`pas de « ${type} » en ${ms} ms`)), ms);
    });
  return { ws, inbox, opened, next, send: (message) => ws.send(JSON.stringify(message)) };
}

if (!(await ready())) {
  console.log('Le serveur ne répond pas.');
  process.exit(1);
}
try {
  // Le site : la page d'accueil, et une adresse de page qui renvoie index.html.
  const home = await fetch(`${BASE}/`);
  const page = await fetch(`${BASE}/partie/abc`, { headers: { accept: 'text/html' } });
  check('le site est servi, et /partie/… renvoie la page', home.ok && page.ok && (await page.text()).includes('<div id="root">'));

  // Création.
  const created = await fetch(`${BASE}/api/parties`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: SETTINGS, deck: 'classique' }) });
  const { id, token } = await created.json();
  check('création d’une partie', created.status === 201 && /^[a-z2-9]{12}$/.test(id) && /^[0-9a-f]{32}$/.test(token), `lien /partie/${id}`);
  const refused = await fetch(`${BASE}/api/parties`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: { ...SETTINGS, board: 'x' }, deck: 'classique' }) });
  check('des réglages faux sont refusés', refused.status === 400, (await refused.json()).error);

  // L'hôte et l'invité.
  const host = player(id);
  await host.opened;
  host.send({ type: 'hello', version: VERSION, token });
  const hostWelcome = await host.next('welcome');
  await host.next('lobby');
  const guest = player(id);
  await guest.opened;
  guest.send({ type: 'hello', version: VERSION, token: null });
  const lobby = await guest.next('lobby');
  check('l’invité voit les réglages et le deck de l’hôte', lobby.decks[1] === 'classique' && lobby.settings.board === SETTINGS.board);
  guest.send({ type: 'join', deck: 'vampire' });
  const guestWelcome = await guest.next('welcome');
  const opening = await host.next('opening');
  await guest.next('opening');
  check('places : hôte J1, invité J2 ; lancer de dés pour les deux', hostWelcome.seat === 1 && guestWelcome.seat === 2, `J${opening.opening.winner} gagne les dés`);

  // Un curieux avec le même lien.
  const curious = player(id);
  await curious.opened;
  curious.send({ type: 'hello', version: VERSION, token: null });
  check('le lien ne sert qu’une fois', (await curious.next('error')).code === 'full');
  curious.ws.close();

  // Le gagnant choisit : J1 commence.
  (opening.opening.winner === 1 ? host : guest).send({ type: 'chooseFirst', first: 1 });
  const start = await host.next('state');
  const guestStart = await guest.next('state');
  check('la partie commence : chacun a sa vue', start.view.viewer === 1 && guestStart.view.viewer === 2 && start.view.activePlayer === 1, `${start.log.length} lignes au journal`);
  check('le chrono attend la fin des animations', start.clock && start.clock.running === false);
  host.send({ type: 'idle', seq: start.seq });
  const clock = await guest.next('clock');
  check('fin des animations signalée : le chrono repart, l’adversaire le voit', clock.clock.running === true);

  // Un coup : fin du tour.
  host.send({ type: 'play', action: { type: 'endTurn' } });
  const afterHost = await host.next('state', (m) => m.view.activePlayer === 2);
  const afterGuest = await guest.next('state', (m) => m.view.activePlayer === 2);
  check('un coup : la nouvelle arrive aux deux', afterHost.seq === afterGuest.seq && afterGuest.view.legalActions.length > 0 && afterHost.view.legalActions.length === 0);
  guest.send({ type: 'play', action: { type: 'endTurn' } });
  check('l’invité joue à son tour', (await host.next('state', (m) => m.view.activePlayer === 1)).view.turn === 3);
  host.send({ type: 'play', action: { type: 'endTurn' } });
  await guest.next('state', (m) => m.view.activePlayer === 2);
  host.send({ type: 'play', action: { type: 'endTurn' } });
  check('hors de son tour : refusé, à l’auteur seul', (await host.next('error')).code === 'refused');

  // L'invité se déconnecte, puis revient avec son jeton.
  guest.ws.close();
  check('l’hôte sait que l’invité est parti', (await host.next('presence', (m) => m.opponentConnected === false)).opponentConnected === false);
  const back = player(id);
  await back.opened;
  back.send({ type: 'hello', version: VERSION, token: guestWelcome.token });
  const again = await back.next('welcome');
  const resumed = await back.next('state');
  await host.next('presence', (m) => m.opponentConnected === true);
  check('reconnexion avec son jeton : sa place et la partie', again.seat === 2 && resumed.view.viewer === 2 && resumed.view.turn === afterGuest.view.turn + 2);

  // Abandon.
  back.send({ type: 'concede' });
  const end = await host.next('state', (m) => m.view.winner !== null);
  check('abandon : l’autre gagne, l’écran de victoire le dira', end.view.winner === 1 && end.view.concession?.reason === 'abandon', end.log.at(-1).text);
  const size = JSON.stringify(end).length;
  check('taille d’une nouvelle de la partie', size < 1_000_000, `${Math.round(size / 1024)} Ko`);
  host.ws.close();
  back.ws.close();
} catch (error) {
  check('déroulé', false, String(error));
}
console.log(results.join('\n'));
process.exit(results.every((r) => r.startsWith('OK')) ? 0 : 1);
