// Page d'une partie en ligne (`/partie/<id>`, SPEC.md §7 ter) : la connexion à la salle, puis, selon où elle en est,
// la salle d'attente de l'hôte (le lien à envoyer), la page de l'invité (les réglages de l'hôte, son deck à choisir), le
// lancer de dés (seul le gagnant choisit), et l'écran de jeu habituel, nourri par le serveur : les coups adverses s'y
// animent comme ceux de l'IA, le chrono est celui du serveur, et l'écran lui dit quand il a fini d'animer. Logique dans
// `src/online/client.ts` ; `OnlineView` affiche un état donné (sans connexion : testable).
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DECKS } from '../engine';
import { onlineBanner, onlinePhase, onlineSetup, settingsLines } from '../online/client';
import { boardOf } from '../online/protocol';
import type { OnlineState } from '../online/client';
import type { ClientMessage, RoomDecks, RoomSettings } from '../online/protocol';
import { useOnlineGame } from '../online/useOnlineGame';
import { DiceScreen } from './DiceScreen';
import { GameScreen } from './GameScreen';
import { preloadBoard } from './pixi/preload';
import { Icon } from './Icon';

/** Quitter une partie en ligne en cours ne l'abandonne pas : elle continue sans lui. */
export const LEAVE_WARNING = 'Quitter la partie ? Elle continue sans toi : tes tours passeront à la fin de ton temps. Pour la finir, abandonne-la.';

/** Titres des pages d'erreur. */
const ERROR_TITLES: Readonly<Record<string, string>> = {
  full: 'Lien déjà utilisé',
  version: 'Jeu mis à jour',
  token: 'Place déjà prise',
  notFound: 'Partie introuvable',
};

interface OnlineScreenProps {
  roomId: string;
  /** Le lien d'invitation complet, à copier. */
  link: string;
  onHome: () => void;
}

export function OnlineScreen({ roomId, link, onHome }: OnlineScreenProps) {
  const { state, send } = useOnlineGame(roomId);
  return <OnlineView state={state} send={send} link={link} onHome={onHome} />;
}

interface OnlineViewProps {
  state: OnlineState;
  send: (message: ClientMessage) => void;
  link: string;
  onHome: () => void;
  /** Rechargement de la page (autre version du jeu) ; la vraie par défaut. */
  onReload?: () => void;
}

export function OnlineView({ state, send, link, onHome, onReload = () => window.location.reload() }: OnlineViewProps) {
  const latest = useRef(state);
  latest.current = state;
  const phase = onlinePhase(state);
  // Le plateau se prépare dès que la carte est connue (salle d'attente, page pour rejoindre, dés).
  const board = state.settings ? boardOf(state.settings.board) : null;
  useEffect(() => {
    if (board) preloadBoard(board);
  }, [board]);

  if (phase === 'error') {
    const { code, text } = state.fatal!;
    return (
      <OnlinePage title={ERROR_TITLES[code] ?? 'Partie inaccessible'} lead={text}>
        <div className="online__actions">
          {code === 'version' && (
            <button type="button" className="btn btn--gold" onClick={onReload}>
              Recharger la page
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            Retour à l’accueil
          </button>
        </div>
      </OnlinePage>
    );
  }

  if (phase === 'loading') {
    return <OnlinePage title="Connexion à la partie…" lead={state.status === 'reconnecting' ? 'Connexion perdue : reconnexion…' : ''} />;
  }

  if (phase === 'waiting') return <WaitingPage state={state} link={link} onHome={onHome} />;
  if (phase === 'join') return <JoinPage settings={state.settings!} decks={state.decks!} status={state.status} onJoin={(deck) => send({ type: 'join', deck })} />;

  if (phase === 'opening') {
    return <DiceScreen opening={state.opening!} seat={state.seat} onChoose={(first) => send({ type: 'chooseFirst', first })} onReady={() => {}} />;
  }

  const setup = onlineSetup(state.settings!, state.decks!);
  if (!setup) {
    return (
      <OnlinePage title="Partie inaccessible" lead="Cette partie utilise une carte ou un deck que ce jeu ne connaît pas : recharge la page.">
        <div className="online__actions">
          <button type="button" className="btn btn--gold" onClick={onReload}>
            Recharger la page
          </button>
        </div>
      </OnlinePage>
    );
  }
  return (
    <GameScreen
      key={state.roomId}
      view={state.view!}
      before={state.before}
      log={state.log}
      onAction={(action) => send({ type: 'play', action })}
      setup={setup}
      onHome={onHome}
      clock={state.clock}
      onIdle={(view) => {
        // L'écran a fini d'animer la dernière nouvelle : le chrono du serveur peut repartir.
        if (view === latest.current.view) send({ type: 'idle', seq: latest.current.seq });
      }}
      onConcede={() => send({ type: 'concede' })}
      banner={onlineBanner(state)}
      homeWarning={LEAVE_WARNING}
    />
  );
}

/** La mise en page des pages d'une partie en ligne, comme l'accueil. */
function OnlinePage({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <main className="home online">
      <header className="home__header">
        <p className="home__kicker">Partie en ligne</p>
        <h1>{title}</h1>
        {lead && (
          <p className="home__lead" role="status">
            {lead}
          </p>
        )}
      </header>
      {children}
    </main>
  );
}

function Settings({ settings, decks }: { settings: RoomSettings; decks: RoomDecks }) {
  return (
    <section className="home__section" aria-labelledby="online-settings">
      <h2 id="online-settings">Réglages de la partie</h2>
      <ul className="online__settings">
        {settingsLines(settings, decks).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/** Salle d'attente de l'hôte : le lien à envoyer, les réglages, et la partie qui commence dès que l'invité arrive. */
function WaitingPage({ state, link, onHome }: { state: OnlineState; link: string; onHome: () => void }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const copy = () => {
    const done = () => setCopied(true);
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(link).then(done, () => input.current?.select());
    } else {
      input.current?.select();
    }
  };
  return (
    <OnlinePage
      title="En attente de ton adversaire"
      lead={state.status === 'reconnecting' ? 'Connexion perdue : reconnexion…' : 'Envoie-lui ce lien : le premier qui l’ouvre prend la place de J2 et choisit son deck. La partie commence alors par le lancer de dés.'}
    >
      <section className="home__section" aria-labelledby="online-link">
        <h2 id="online-link">Lien d’invitation</h2>
        <div className="online__link">
          <input ref={input} type="text" readOnly value={link} aria-label="Lien d’invitation" onFocus={(event) => event.target.select()} />
          <button type="button" className="btn btn--gold" onClick={copy}>
            <Icon name="card-play" />
            {copied ? 'Lien copié' : 'Copier le lien'}
          </button>
        </div>
      </section>
      <Settings settings={state.settings!} decks={state.decks!} />
      <div className="online__actions">
        <button type="button" className="btn btn--ghost" onClick={onHome}>
          Retour à l’accueil
        </button>
        <p className="online__note">La partie reste ouverte 24 heures : tu peux revenir par ce même lien.</p>
      </div>
    </OnlinePage>
  );
}

/** Page de l'invité : les réglages de l'hôte, son deck à choisir, puis « Rejoindre ». */
function JoinPage({ settings, decks, status, onJoin }: { settings: RoomSettings; decks: RoomDecks; status: OnlineState['status']; onJoin: (deck: string) => void }) {
  const [deck, setDeck] = useState(DECKS[0]!.id);
  return (
    <OnlinePage title="Rejoindre la partie" lead={status === 'reconnecting' ? 'Connexion perdue : reconnexion…' : 'Tu joues J2. Choisis ton deck, puis rejoins la partie : elle commence par le lancer de dés.'}>
      <Settings settings={settings} decks={decks} />
      <section className="home__section" aria-labelledby="online-deck">
        <h2 id="online-deck">Ton deck</h2>
        <div className="home__player home__player--p2 online__deck">
          <div className="home__decks">
            {DECKS.map((d) => (
              <label key={d.id} className="home__deck">
                <input type="radio" name="deck-invite" value={d.id} checked={deck === d.id} onChange={() => setDeck(d.id)} />
                {d.name}
              </label>
            ))}
          </div>
        </div>
      </section>
      <button type="button" className="btn btn--gold home__start" disabled={status !== 'open'} onClick={() => onJoin(deck)}>
        <Icon name="broadsword" />
        Rejoindre la partie
      </button>
    </OnlinePage>
  );
}
