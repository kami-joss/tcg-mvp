// Écran de jeu (SPEC.md §7). Il ne reçoit que des PlayerView : jamais l'état complet de la partie.
// Après chaque action, il rejoue en animation les événements de la vue (handoff, lot 2) : pendant la lecture, l'écran
// montre un état intermédiaire et les clics sont bloqués ; à la fin, il reprend la vraie vue. Les sons (lot 4) suivent
// la même file d'événements ; sans animation, chaque événement joue seulement son son.
// Mise en page : l'écran occupe toute la hauteur de la fenêtre et ne défile jamais ; ce sont les colonnes qui défilent.
// À gauche, l'adversaire, la fiche au survol et le journal ; au centre, le bandeau et le plateau, ajusté à sa zone ;
// à droite, le grimoire (3, 2 ou 1 carte par ligne, ou liste : la colonne s'élargit en conséquence) et, dessous,
// l'encart du joueur qui regarde.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { Action, CardId, GameEvent, PlayerId, PlayerView, Position } from '../engine';
import type { Setup } from './session';
import { ActionLog } from './ActionLog';
import { boardArt } from './art';
import { Board } from './Board';
import { applyEvent } from './fx/patch';
import { playEvents } from './fx/player';
import { GRIMOIRE_DISPLAY, Grimoire } from './Grimoire';
import { GuideBanner } from './GuideBanner';
import { HoverSheet } from './HoverSheet';
import {
  NO_SELECTION,
  clickCard,
  clickCell,
  getAttackPreviews,
  getHighlights,
  getPathPreview,
  getReach,
  isFocused,
  posKey,
  selectedUnitId,
} from './interaction';
import type { Selection } from './interaction';
import { isoScenery } from './iso/scenery';
import { Legend } from './Legend';
import { PlayerBox } from './PlayerBox';
import { ALL_TOKEN_STATS, loadSettings, prefersReducedMotion, saveSettings } from './settings';
import type { BoardView, DisplaySettings } from './settings';
import { eventSounds } from './sfx/events';
import { configureSound, sfx, unlockAudio } from './sfx/sound';
import { getSheet } from './sheet';
import type { HoverSubject } from './sheet';
import { TopBar } from './TopBar';
import { VictoryOverlay } from './VictoryOverlay';

interface GameScreenProps {
  view: PlayerView;
  /** La vue du même joueur avant la dernière action, d'où partent les animations ; `null` en début de partie. */
  before: PlayerView | null;
  log: readonly string[];
  onAction: (action: Action) => void;
  setup: Setup;
  onRestart: (setup: Setup) => void;
  /** Tour de l'IA : l'action suivante à jouer, appelée quand l'écran a fini d'animer la précédente. */
  autoPlay?: (() => void) | null;
}

/** Pause entre deux actions de l'IA, pour qu'on puisse les suivre. */
const AI_PAUSE_MS = 450;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function GameScreen({ view, before, log, onAction, setup, onRestart, autoPlay = null }: GameScreenProps) {
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [hover, setHover] = useState<{ subject: HoverSubject; rect: DOMRect } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showArt, setShowArt] = useState(true);
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings);
  /** Alt (ou le bouton œil) maintenu : toutes les stats sur les jetons (lot 6). */
  const [peek, setPeek] = useState(false);
  /** Vue affichée pendant une animation ; `null` : la vraie vue. */
  const [shown, setShown] = useState<PlayerView | null>(null);
  const shownRef = useRef<PlayerView | null>(null);
  const played = useRef<PlayerView | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const busy = shown !== null;
  const display = shown ?? view;
  // La vue isométrique n'existe que pour le Champ de bataille : ailleurs, elle se replie sur la vue inclinée.
  const isoAvailable = isoScenery(display.board) !== null;
  const mode: BoardView = settings.view === 'iso' && !isoAvailable ? 'tilt' : settings.view;
  const tilted = mode === 'tilt';
  // Le camp du joueur actif toujours en bas : J1 joue en haut du plateau, on le retourne pour lui.
  const flipped = settings.flip && display.viewer === 1;
  const animated = settings.animations && !prefersReducedMotion();

  const hovered = hover?.subject.kind === 'cell' ? hover.subject.pos : null;
  const activeSelection = busy ? NO_SELECTION : selection;
  const highlights = useMemo(() => getHighlights(display, activeSelection), [display, activeSelection]);
  const attacks = useMemo(() => getAttackPreviews(display, activeSelection), [display, activeSelection]);
  const reach = useMemo(() => {
    const threat = getReach(display, activeSelection, hovered);
    return new Map<string, 'move' | 'strike'>([
      ...threat.moves.map((pos) => [posKey(pos), 'move'] as const),
      ...threat.strikes.map((pos) => [posKey(pos), 'strike'] as const),
    ]);
  }, [display, activeSelection, hovered]);
  const path = useMemo(() => getPathPreview(display, activeSelection, hovered), [display, activeSelection, hovered]);
  const sheet = hover ? getSheet(display, hover.subject) : null;

  const changeSettings = (patch: Partial<DisplaySettings>) =>
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });

  useEffect(() => configureSound({ enabled: settings.sound, volume: settings.volume }), [settings.sound, settings.volume]);

  // L'AudioContext ne peut démarrer qu'après un geste de l'utilisateur (règle d'autoplay des navigateurs).
  useEffect(() => {
    document.addEventListener('pointerdown', unlockAudio);
    return () => document.removeEventListener('pointerdown', unlockAudio);
  }, []);

  // Fanfare de victoire.
  const winner = useRef(view.winner);
  useEffect(() => {
    if (view.winner !== null && winner.current === null) sfx('win', 0.3);
    winner.current = view.winner;
  }, [view.winner]);

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSelection(NO_SELECTION);
      setHelpOpen(false);
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, []);

  // Alt maintenu : toutes les stats ; relâcher, ou quitter la fenêtre, revient au choix du joueur.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      event.preventDefault();
      setPeek(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setPeek(false);
    };
    const release = () => setPeek(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, []);

  // Nouvelle vue : on rejoue ses événements depuis la vue d'avant, avant que l'écran ne soit peint.
  useLayoutEffect(() => {
    if (played.current === view) return;
    played.current = view;
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!animated || !before || !root || !layer || view.events.length === 0) {
      shownRef.current = null;
      setShown(null);
      // Sans animation, les sons de l'action s'enchaînent seuls.
      if (before) {
        const cardOf = (id: string) => (before.units[id] ?? view.units[id])?.cardId;
        for (const [name, delay] of eventSounds(view.events, cardOf)) sfx(name, delay);
      }
      return;
    }

    let stopped = false;
    shownRef.current = before;
    setShown(before);
    const patch = async (event: GameEvent) => {
      if (stopped || !shownRef.current) return;
      const next = applyEvent(shownRef.current, event, view);
      shownRef.current = next;
      flushSync(() => setShown(next));
      await nextFrame();
    };
    void (async () => {
      await nextFrame();
      try {
        await playEvents(view.events, {
          stage: { root, layer, tilted },
          shown: () => shownRef.current ?? view,
          patch,
          stopped: () => stopped,
        });
      } finally {
        if (!stopped) {
          shownRef.current = null;
          setShown(null);
        }
      }
    })();
    return () => {
      stopped = true;
      // Lecture interrompue (nouvelle vue, ou double montage en mode strict) : la prochaine reprend tout.
      played.current = null;
    };
    // Seule une nouvelle vue déclenche une lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Tour de l'IA : une action après chaque animation (ou chaque nouvelle vue, sans animation).
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;
  const aiTurn = autoPlay !== null;
  useEffect(() => {
    if (!aiTurn || busy) return;
    const timer = window.setTimeout(() => autoPlayRef.current?.(), AI_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [aiTurn, busy, view]);

  const play = (action: Action) => {
    if (busy) return;
    setSelection(NO_SELECTION);
    // Une carte jouée quitte le grimoire : sa fiche ne doit pas rester affichée.
    setHover((current) => (current?.subject.kind === 'card' ? null : current));
    onAction(action);
  };
  const handleCellClick = (pos: Position) => {
    if (busy) return;
    const result = clickCell(view, selection, pos);
    if ('action' in result) play(result.action);
    else setSelection(result.selection);
  };
  const handleCardClick = (cardId: CardId) => {
    if (busy) return;
    const next = clickCard(view, selection, cardId);
    if (next.kind === 'card' && !(selection.kind === 'card' && selection.cardId === next.cardId)) sfx('select');
    setSelection(next);
  };
  const handleCellHover = (pos: Position | null, rect?: DOMRect) =>
    setHover(pos && rect ? { subject: { kind: 'cell', pos }, rect } : null);
  const handleCardHover = (cardId: CardId | null, rect?: DOMRect) =>
    setHover(cardId && rect ? { subject: { kind: 'card', cardId }, rect } : null);
  const selectedCard = activeSelection.kind === 'card' || activeSelection.kind === 'push' ? activeSelection.cardId : null;
  const opponent: PlayerId = display.viewer === 1 ? 2 : 1;

  const classes = ['game', animated && 'game--anim', busy && 'is-busy'].filter(Boolean).join(' ');
  const layout = { '--grimoire-w': `${GRIMOIRE_DISPLAY[settings.grimoireLayout].width}px` } as CSSProperties;
  return (
    <div className={classes} ref={rootRef} style={layout}>
      <TopBar
        view={display}
        setup={setup}
        busy={busy}
        boardView={mode}
        isoAvailable={isoAvailable}
        onView={(next) => changeSettings({ view: next })}
        stats={settings.tokenStats}
        onStats={(tokenStats) => changeSettings({ tokenStats })}
        peek={peek}
        onPeek={setPeek}
        zoom={settings.zoom}
        onZoom={(zoom) => changeSettings({ zoom })}
        sound={settings.sound}
        onSound={(sound) => {
          changeSettings({ sound });
          if (sound) {
            configureSound({ enabled: true, volume: settings.volume });
            sfx('ui');
          }
        }}
        onEndTurn={() => {
          sfx('ui');
          play({ type: 'endTurn' });
        }}
        onRestart={onRestart}
      />

      <div className="game__main">
        {/* Colonne de gauche : l'adversaire, la fiche au survol (jamais sur le plateau), le journal. */}
        <aside className="game__left">
          <PlayerBox view={display} player={opponent} deckName={setup.decks[opponent].name} ai={setup.ai === opponent} />
          <div className="game__sheet">{sheet && hover && <HoverSheet sheet={sheet} />}</div>
          <ActionLog lines={log} opponentUsed={display.opponent.used} />
        </aside>

        <main className="game__play">
          <GuideBanner
            view={display}
            selection={activeSelection}
            highlights={highlights}
            helpOpen={helpOpen}
            onToggleHelp={() => setHelpOpen((open) => !open)}
            onToggleArt={boardArt(view.board) ? () => setShowArt((show) => !show) : null}
            onAction={play}
            onSelect={(next) => !busy && setSelection(next)}
            flipped={flipped}
            busy={busy}
          />
          <Board
            view={display}
            highlights={highlights}
            attacks={attacks}
            selectedUnitId={selectedUnitId(activeSelection)}
            focused={isFocused(activeSelection)}
            path={path}
            reach={reach}
            showArt={showArt}
            mode={mode}
            zoom={settings.zoom}
            animated={animated}
            flipped={flipped}
            stats={peek ? ALL_TOKEN_STATS : settings.tokenStats}
            onCellClick={handleCellClick}
            onCellHover={handleCellHover}
          />
          {helpOpen && <Legend settings={settings} onChange={changeSettings} onClose={() => setHelpOpen(false)} />}
        </main>

        <aside className="game__side">
          <Grimoire
            view={display}
            selectedCard={selectedCard}
            layout={settings.grimoireLayout}
            onLayout={(grimoireLayout) => changeSettings({ grimoireLayout })}
            onCardClick={handleCardClick}
            onCardHover={handleCardHover}
          />
          <PlayerBox view={display} player={display.viewer} deckName={setup.decks[display.viewer].name} />
        </aside>
      </div>

      {!busy && <VictoryOverlay view={view} setup={setup} onRestart={onRestart} />}
      <div className="fx-stage" ref={layerRef} aria-hidden="true" />
    </div>
  );
}
