// Écran de jeu (SPEC.md §7). Il ne reçoit que des PlayerView : jamais l'état complet de la partie.
// Après chaque action, il rejoue en animation les événements de la vue (handoff, lot 2) : pendant la lecture, l'écran
// montre un état intermédiaire et les clics sont bloqués ; à la fin, il reprend la vraie vue. La carte qui agit est
// d'abord mise en avant au centre de l'écran (cut-in, `CutInOverlay`). Les sons (lot 4) suivent la même file
// d'événements ; sans animation, chaque événement joue seulement son son.
// Mise en page : l'écran occupe toute la hauteur de la fenêtre et ne défile jamais (handoff V10, lot 11). En haut
// (handoff V11, lot 12), les scores de J1 et J2 de part et d'autre de « Fin du tour », le tour, l'aide et les options.
// Dessous, la zone de jeu (lot 13) : le plateau sur toute la largeur, et par-dessus, des panneaux flottants : à gauche
// la fiche et le journal (le plateau reste cliquable entre eux), à droite le grimoire (3, 2 ou 1 carte par ligne, ou
// liste : le panneau s'élargit en conséquence), repliable par son onglet ; l'aide flotte en haut du plateau. Des
// marges de glisse de part et d'autre du plateau permettent d'en sortir chaque bord de sous un panneau.
// Les choix passent par la bulle d'action (`ActionBubble`) : attaque d'une cible, effets (clic droit sur son monstre),
// carte du grimoire (clic droit : l'invoquer, la lancer, la poser), choix en plusieurs temps. Échap annule.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { Action, CardId, GameEvent, PlayerView, Position } from '../engine';
import type { Setup } from './session';
import { ActionBubble } from './ActionBubble';
import { ActionLog } from './ActionLog';
import { Board } from './Board';
import { bubbleBack, getBubble } from './bubble';
import type { BubbleRow } from './bubble';
import { CutInOverlay } from './CutIn';
import type { CutIn } from './fx/cutIn';
import { applyEvent } from './fx/patch';
import { playEvents } from './fx/player';
import { GRIMOIRE_DISPLAY, Grimoire, GrimoireTab } from './Grimoire';
import { HoverSheet, SheetPreview, overframeFit, sheetOverframe, sheetPlacement } from './HoverSheet';
import {
  NO_SELECTION,
  clickCard,
  clickCell,
  contextCard,
  contextCell,
  getAttackPreviews,
  getHighlights,
  getPathPreview,
  getReach,
  isBubble,
  isFocused,
  posKey,
  selectedUnitId,
} from './interaction';
import type { Selection } from './interaction';
import { isoScenery } from './iso/scenery';
import { Legend } from './Legend';
import { MAX_HEADROOM } from './overframes';
import { ALL_TOKEN_STATS, loadSettings, prefersReducedMotion, saveSettings } from './settings';
import type { BoardView, DisplaySettings } from './settings';
import { eventSounds } from './sfx/events';
import { configureSound, sfx, unlockAudio } from './sfx/sound';
import { getSheet, sameSubject, subjectAt } from './sheet';
import type { HoverSubject, SheetData } from './sheet';
import type { LogEntry } from './log';
import { TopBar } from './TopBar';
import { VictoryOverlay } from './VictoryOverlay';

interface GameScreenProps {
  view: PlayerView;
  /** La vue du même joueur avant la dernière action, d'où partent les animations ; `null` en début de partie. */
  before: PlayerView | null;
  log: readonly LogEntry[];
  onAction: (action: Action) => void;
  setup: Setup;
  /** Rejouer avec les mêmes réglages. */
  onRestart: () => void;
  /** Retour à l'accueil, pour régler une nouvelle partie. */
  onHome: () => void;
  /** Tour de l'IA : l'action suivante à jouer, appelée quand l'écran a fini d'animer la précédente. */
  autoPlay?: (() => void) | null;
}

/**
 * Marges de glisse du plateau (lot 13 §1) : à gauche la largeur de la colonne de la fiche, à droite celle du grimoire
 * ouvert (ou un peu d'air quand il est replié) ; aucune sous 900 px de large.
 */
const GLIDE_LEFT = 296;
const GLIDE_GAP = 12;
const GLIDE_COLLAPSED = 20;
const GLIDE_MIN_WIDTH = 900;

/** La fenêtre fait moins de `width` px de large (suivi au redimensionnement). */
function useNarrow(width: number): boolean {
  const query = `(max-width: ${width - 0.02}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return narrow;
}

/** Hauteur d'un élément, suivie au redimensionnement ; `Infinity` tant qu'elle n'est pas mesurée. */
function useHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(Infinity);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

/** Pause entre deux actions de l'IA, pour qu'on puisse les suivre. */
const AI_PAUSE_MS = 450;

/**
 * La fiche suit un nouvel élément survolé après ce délai (tout de suite s'il n'y a pas encore de fiche) : on peut
 * traverser le plateau jusqu'à elle sans la perdre (lot 9).
 */
const FOCUS_DELAY_MS = 100;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function GameScreen({ view, before, log, onAction, setup, onRestart, onHome, autoPlay = null }: GameScreenProps) {
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [hover, setHover] = useState<{ subject: HoverSubject; rect: DOMRect } | null>(null);
  /** Ce que montre la fiche : le dernier élément survolé 100 ms, ou cliqué ; « Fin du tour » la vide. */
  const [focus, setFocus] = useState<HoverSubject | null>(null);
  const focusRef = useRef<HoverSubject | null>(null);
  focusRef.current = focus;
  const focusTimer = useRef<number | undefined>(undefined);
  const [helpOpen, setHelpOpen] = useState(false);
  /** Fiche à overframe ouverte en grand (clic sur la fiche) ; Échap ou un clic sur le fond la referme. */
  const [preview, setPreview] = useState<SheetData | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  /** Trajet montré au survol d'une ligne de la bulle (« Attaquer et avancer »), pour la sélection où il a été montré. */
  const [bubblePath, setBubblePath] = useState<{ selection: Selection; path: readonly Position[] } | null>(null);
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings);
  /** Alt (ou le bouton œil) maintenu : toutes les stats sur les jetons (lot 6). */
  const [peek, setPeek] = useState(false);
  /** Vue affichée pendant une animation ; `null` : la vraie vue. */
  const [shown, setShown] = useState<PlayerView | null>(null);
  const shownRef = useRef<PlayerView | null>(null);
  const played = useRef<PlayerView | null>(null);
  /** Carte mise en avant pendant la lecture, et la suite de la lecture une fois son animation finie. */
  const [cutIn, setCutIn] = useState<{ id: number; cutIn: CutIn; target: { x: number; y: number } | null; done: () => void } | null>(
    null,
  );
  const cutInCount = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const busy = shown !== null;
  const display = shown ?? view;
  // La vue isométrique n'existe que pour le Champ de bataille : ailleurs, elle se replie sur la vue inclinée.
  const isoAvailable = isoScenery(display.board) !== null;
  const mode: BoardView = settings.view === 'iso' && !isoAvailable ? 'tilt' : settings.view;
  const tilted = mode === 'tilt';
  // Même angle pour les deux joueurs (validé) : J1 en haut du plateau, J2 en bas ; il n'est jamais retourné.
  const flipped = false;
  const animated = settings.animations && !prefersReducedMotion();

  const hovered = hover?.subject.kind === 'cell' ? hover.subject.pos : null;
  // Bulle d'action : pendant une animation, aucune ; une sélection de bulle qui n'a plus rien à proposer est oubliée.
  const bubble = useMemo(() => (busy ? null : getBubble(view, selection, flipped)), [busy, view, selection, flipped]);
  const activeSelection = busy || (isBubble(selection) && !bubble) ? NO_SELECTION : selection;
  const highlights = useMemo(() => getHighlights(display, activeSelection), [display, activeSelection]);
  const attacks = useMemo(() => getAttackPreviews(display, activeSelection), [display, activeSelection]);
  // Bulle ouverte : ni portée adverse ni chemin sous la souris, seulement le trajet de la ligne survolée.
  const reach = useMemo(() => {
    if (bubble) return new Map<string, 'move' | 'strike'>();
    const threat = getReach(display, activeSelection, hovered);
    return new Map<string, 'move' | 'strike'>([
      ...threat.moves.map((pos) => [posKey(pos), 'move'] as const),
      ...threat.strikes.map((pos) => [posKey(pos), 'strike'] as const),
    ]);
  }, [bubble, display, activeSelection, hovered]);
  const path = useMemo(
    () =>
      bubble
        ? bubblePath?.selection === activeSelection
          ? bubblePath.path
          : []
        : getPathPreview(display, activeSelection, hovered),
    [bubble, bubblePath, display, activeSelection, hovered],
  );
  const sheet = focus ? getSheet(display, focus) : null;
  // Fiche : le haut du cadre toujours au même endroit (place du plus grand débordement réservée au-dessus) ; fenêtre
  // basse, place et overframes réduites pour laisser la sienne au journal.
  const leftRef = useRef<HTMLElement>(null);
  const leftHeight = useHeight(leftRef);
  const sheetOf = sheet ? sheetOverframe(sheet) : undefined;
  const sheetFit = overframeFit(leftHeight, MAX_HEADROOM);
  const grimoireWidth = GRIMOIRE_DISPLAY[settings.grimoireLayout].width;
  const narrow = useNarrow(GLIDE_MIN_WIDTH);
  const glide = useMemo(
    () =>
      narrow
        ? { left: 0, right: 0 }
        : { left: GLIDE_LEFT, right: settings.grimoireOpen ? grimoireWidth + GLIDE_GAP : GLIDE_COLLAPSED },
    [narrow, settings.grimoireOpen, grimoireWidth],
  );
  const myTurn = view.activePlayer === view.viewer && view.winner === null;

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

  useEffect(() => () => window.clearTimeout(focusTimer.current), []);

  /** Survol : un élément qui a une fiche la prend après le délai ; une case vide, ou le même élément, ne change rien. */
  const aimAt = (subject: HoverSubject | null) => {
    window.clearTimeout(focusTimer.current);
    if (!subject || sameSubject(subject, focusRef.current) || !getSheet(display, subject)) return;
    if (focusRef.current === null) setFocus(subject);
    else focusTimer.current = window.setTimeout(() => setFocus(subject), FOCUS_DELAY_MS);
  };
  /** Clic : la fiche le montre tout de suite. */
  const focusNow = (subject: HoverSubject | null) => {
    window.clearTimeout(focusTimer.current);
    setFocus(subject);
  };

  // Fanfare de victoire.
  const winner = useRef(view.winner);
  useEffect(() => {
    if (view.winner !== null && winner.current === null) sfx('win', 0.3);
    winner.current = view.winner;
  }, [view.winner]);

  // Clavier : Échap annule (dans la bulle : retour depuis une sous-vue, sinon fermer) ; Retour arrière revient en arrière
  // dans la bulle ; 1 à 9 choisissent une de ses lignes.
  const bubbleRef = useRef(bubble);
  bubbleRef.current = bubble;
  const pickRef = useRef<(row: BubbleRow) => void>(() => {});
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const model = bubbleRef.current;
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      // Une case cliquée garde le focus : un raccourci ne doit pas y faire apparaître le contour du clavier.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.dataset.cell && /^(Escape|Backspace|[1-9])$/.test(event.key)) active.blur();
      if (event.key === 'Escape') {
        if (previewRef.current) {
          setPreview(null);
          return;
        }
        if (model) {
          setSelection(bubbleBack(model) ?? NO_SELECTION);
          return;
        }
        setSelection(NO_SELECTION);
        setHelpOpen(false);
        return;
      }
      if (!model || typing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Backspace') {
        const back = bubbleBack(model);
        if (back) {
          event.preventDefault();
          setSelection(back);
        }
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const row = model.rows[Number(event.key) - 1];
        if (row?.enabled) {
          event.preventDefault();
          pickRef.current(row);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Bulle ouverte : un clic hors d'elle et du plateau la ferme (et désélectionne). Sur le plateau, c'est `clickCell`
  // (ou le clic droit) qui décide : la déplacer sur une autre cible, ou la fermer.
  const bubbleOpen = bubble !== null;
  useEffect(() => {
    if (!bubbleOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.bubble, [data-cell]')) return;
      setSelection(NO_SELECTION);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [bubbleOpen]);

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
    let cutDone: (() => void) | null = null;
    shownRef.current = before;
    setShown(before);
    const patch = async (event: GameEvent) => {
      if (stopped || !shownRef.current) return;
      const next = applyEvent(shownRef.current, event, view);
      shownRef.current = next;
      flushSync(() => setShown(next));
      await nextFrame();
    };
    const showCutIn = (value: CutIn, target: { x: number; y: number } | null) =>
      new Promise<void>((resolve) => {
        if (stopped) return resolve();
        const done = () => {
          if (cutDone !== done) return;
          cutDone = null;
          setCutIn(null);
          resolve();
        };
        cutDone = done;
        const id = ++cutInCount.current;
        flushSync(() => setCutIn({ id, cutIn: value, target, done }));
      });
    void (async () => {
      await nextFrame();
      try {
        await playEvents(view.events, {
          stage: { root, layer, tilted },
          shown: () => shownRef.current ?? view,
          patch,
          stopped: () => stopped,
          cutIn: showCutIn,
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
      cutDone?.();
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
  /** Changer de sélection ; ouvrir une bulle (ou la déplacer sur une autre cible) fait le son de sélection. */
  const select = (next: Selection) => {
    if (isBubble(next) && getBubble(view, next, flipped) && JSON.stringify(next) !== JSON.stringify(selection)) sfx('select');
    setSelection(next);
  };
  const handleCellClick = (pos: Position) => {
    const subject = subjectAt(display, pos);
    if (subject.kind === 'unit') focusNow(subject);
    if (busy) return;
    const result = clickCell(view, activeSelection, pos);
    if ('action' in result) play(result.action);
    else select(result.selection);
  };
  const handleCellContextMenu = (pos: Position) => {
    if (busy) return;
    const next = contextCell(view, activeSelection, pos);
    const subject = subjectAt(display, pos);
    if (next.kind === 'effects' && subject.kind === 'unit') focusNow(subject);
    select(next);
  };
  const pickRow = (row: BubbleRow) => {
    if (busy || !row.enabled || !row.pick) return;
    if ('action' in row.pick) play(row.pick.action);
    else select(row.pick.selection);
  };
  pickRef.current = pickRow;
  const endTurn = () => {
    sfx('ui');
    focusNow(null);
    play({ type: 'endTurn' });
  };
  const handleCardClick = (cardId: CardId) => {
    focusNow({ kind: 'card', cardId });
    if (busy) return;
    const next = clickCard(view, activeSelection, cardId);
    if (next.kind === 'card' && !(selection.kind === 'card' && selection.cardId === next.cardId)) sfx('select');
    setSelection(next);
  };
  const handleCellHover = (pos: Position | null, rect?: DOMRect) => {
    setHover(pos && rect ? { subject: { kind: 'cell', pos }, rect } : null);
    aimAt(pos ? subjectAt(display, pos) : null);
  };
  /** Clic droit sur une carte du grimoire : sa bulle (l'invoquer, la lancer ou la poser). */
  const handleCardContextMenu = (cardId: CardId) => {
    focusNow({ kind: 'card', cardId });
    if (busy) return;
    select(contextCard(view, cardId));
  };
  const handleCardHover = (cardId: CardId | null, rect?: DOMRect) => {
    setHover(cardId && rect ? { subject: { kind: 'card', cardId }, rect } : null);
    aimAt(cardId ? { kind: 'card', cardId } : null);
  };
  const selectedCard =
    activeSelection.kind === 'card' || activeSelection.kind === 'cardMenu' || activeSelection.kind === 'push'
      ? activeSelection.cardId
      : null;

  const classes = ['game', animated && 'game--anim', busy && 'is-busy'].filter(Boolean).join(' ');
  const layout = { '--grimoire-w': `${grimoireWidth}px` } as CSSProperties;
  return (
    <div className={classes} ref={rootRef} style={layout}>
      <TopBar
        view={display}
        setup={setup}
        canEndTurn={myTurn && !busy}
        onEndTurn={endTurn}
        helpOpen={helpOpen}
        onHelp={() => setHelpOpen((open) => !open)}
        settings={settings}
        boardView={mode}
        isoAvailable={isoAvailable}
        onSettings={changeSettings}
        onSound={(sound) => {
          changeSettings({ sound });
          if (sound) {
            configureSound({ enabled: true, volume: settings.volume });
            sfx('ui');
          }
        }}
        onHome={onHome}
        animated={animated}
      />

      <div className="game__zone">
        {/* Le plateau, sur toute la largeur ; l'aide flotte par-dessus, en haut (lot 13 §5). */}
        <main className="game__play">
          <Board
            view={display}
            highlights={highlights}
            attacks={attacks}
            selectedUnitId={selectedUnitId(activeSelection)}
            anchor={bubble?.anchor ?? null}
            focused={isFocused(activeSelection)}
            path={path}
            reach={reach}
            showArt
            mode={mode}
            zoom={settings.zoom}
            animated={animated}
            flipped={flipped}
            stats={peek ? ALL_TOKEN_STATS : settings.tokenStats}
            margins={glide}
            onCellClick={handleCellClick}
            onCellContextMenu={handleCellContextMenu}
            onCellHover={handleCellHover}
          />
          {helpOpen && <Legend onClose={() => setHelpOpen(false)} mode={view.mode} />}
        </main>

        {/* À gauche, par-dessus le plateau : la fiche (rien sans fiche), le journal en bas. */}
        <aside ref={leftRef} className="game__left">
          {sheet && (
            <div
              className={`game__sheet${sheetOf ? ' game__sheet--of' : ''}`}
              style={sheetPlacement(sheetOf, sheetFit)}
            >
              <HoverSheet sheet={sheet} animated={animated} onOpen={() => setPreview(sheet)} />
            </div>
          )}
          <ActionLog entries={log} opponentGraveyard={display.opponent.graveyard} />
        </aside>

        {/* À droite, par-dessus le plateau : le grimoire, repliable par son onglet. */}
        <aside className={`game__side${settings.grimoireOpen ? '' : ' is-collapsed'}`}>
          <GrimoireTab
            open={settings.grimoireOpen}
            onToggle={() => changeSettings({ grimoireOpen: !settings.grimoireOpen })}
          />
          <Grimoire
            view={display}
            selectedCard={selectedCard}
            focusedCard={focus?.kind === 'card' ? focus.cardId : null}
            layout={settings.grimoireLayout}
            onLayout={(grimoireLayout) => changeSettings({ grimoireLayout })}
            onCardClick={handleCardClick}
            onCardContextMenu={handleCardContextMenu}
            onCardHover={handleCardHover}
            animated={animated}
          />
        </aside>
      </div>

      {bubble && (
        <ActionBubble
          model={bubble}
          layoutKey={`${mode}|${settings.zoom}|${flipped}|${settings.grimoireLayout}|${settings.grimoireOpen}`}
          onPick={pickRow}
          onBack={() => setSelection(bubbleBack(bubble) ?? NO_SELECTION)}
          onClose={() => setSelection(NO_SELECTION)}
          onHoverPath={(hoverPath) => setBubblePath(hoverPath ? { selection: activeSelection, path: hoverPath } : null)}
        />
      )}
      {cutIn && <CutInOverlay key={cutIn.id} cutIn={cutIn.cutIn} target={cutIn.target} onDone={cutIn.done} />}
      {preview && <SheetPreview sheet={preview} animated={animated} onClose={() => setPreview(null)} />}
      {!busy && <VictoryOverlay view={view} onRestart={onRestart} onHome={onHome} />}
      <div className="fx-stage" ref={layerRef} aria-hidden="true" />
    </div>
  );
}
