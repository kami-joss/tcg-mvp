// Carte mise en avant (« cut-in », façon Master Duel) : la carte qui agit surgit en grand au centre de l'écran, sur le
// plateau assombri, dans des rayons à la couleur de son joueur, puis file vers son jeton ou sa case (`fx/cutIn.ts`).
// Montée par l'écran de jeu le temps de l'animation (1,2 s), sans clics ; seulement quand les animations sont permises.
// Exemplaire brillant : illustration brillante, cadre doré, holo, reflet et étincelles, badge « ★ Brillante ». Carte à
// overframe : le personnage sort du cadre avec ses particules, comme sur la fiche (`OverframeStage`).
import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { getCard } from '../engine';
import type { Card } from '../engine';
import { CUT_IN_FRAME, artFit, cardArtFor, fitBackground } from './art';
import { CUT_IN_BACKDROP, CUT_IN_MS, cutInFrames, cutInRays, cutInScale } from './fx/cutIn';
import type { CutIn, CutInKind } from './fx/cutIn';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { OverframeStage, SHEET_W, ShinyLayers } from './Overframe';
import type { OverframeLayers } from './Overframe';
import { OVERFRAMES } from './overframes';

const ACTION_ICONS: Readonly<Record<CutInKind, IconName>> = {
  attack: 'broadsword',
  effect: 'magic-swirl',
  spell: 'spell-book',
  terrain: 'castle',
  summon: 'card-play',
};

const KIND_ICONS: Readonly<Record<Card['kind'], IconName>> = {
  monster: 'dragon-head',
  spell: 'spell-book',
  terrain: 'castle',
};

/** Fond de la carte : l'illustration sur toute la carte (flou dessous s'il reste du vide en bas), ou l'icône du type. */
function CutInArt({ cutIn, kind }: { cutIn: CutIn; kind: Card['kind'] }) {
  const art = cardArtFor(cutIn.cardId, cutIn.shiny);
  if (!art) {
    return (
      <div className={`sheet__bg sheet__bg--plain sheet__bg--p${cutIn.owner} cutin__plain`} aria-hidden="true">
        <Icon name={KIND_ICONS[kind]} />
      </div>
    );
  }
  const fit = artFit(art, CUT_IN_FRAME);
  const gap = fit.edge < 99.5;
  const mask = gap ? `linear-gradient(180deg, #000 ${(fit.edge - 12).toFixed(1)}%, transparent ${fit.edge.toFixed(1)}%)` : undefined;
  const image: CSSProperties = { background: fitBackground(art, fit, SHEET_W), maskImage: mask, WebkitMaskImage: mask };
  return (
    <>
      {gap && <div className="sheet__bg sheet__bg--blur" style={{ backgroundImage: `url("${art.src}")` }} aria-hidden="true" />}
      <div className="sheet__bg" style={image} aria-hidden="true" />
    </>
  );
}

/** Le cadre de la carte : illustration (ou calques de l'overframe), reflets, éclair d'entrée, plaque du nom. */
function CutInFrame({ cutIn, layers }: { cutIn: CutIn; layers?: OverframeLayers }) {
  const kind = getCard(cutIn.cardId).kind;
  const classes = [
    'sheet',
    'sheet--card',
    `sheet--${cutIn.owner}`,
    `is-jewel jewel--${kind}`,
    'cutin__frame',
    layers && 'sheet--of',
    cutIn.shiny && 'sheet--shiny',
  ];
  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {layers ? layers.back : <CutInArt cutIn={cutIn} kind={kind} />}
      {!layers && cutIn.shiny && <ShinyLayers animated />}
      <div className="cutin__veil" aria-hidden="true" />
      <div className="cutin__flash" aria-hidden="true" />
      <div className="cutin__plate">
        <span className="cutin__action">
          <Icon name={ACTION_ICONS[cutIn.kind]} />
          {cutIn.action}
        </span>
        <h2 className="cutin__title">
          {cutIn.title}
          {cutIn.archetype && <small className="cutin__archetype">{cutIn.archetype}</small>}
        </h2>
        {cutIn.effect && <p className="cutin__effect">{cutIn.effect}</p>}
        {cutIn.shiny && <span className="sheet__shiny">★ Brillante</span>}
      </div>
      {layers?.glare}
    </div>
  );
}

interface CutInOverlayProps {
  cutIn: CutIn;
  /** Centre à l'écran de la case d'arrivée (`cutIn.to`), ou `null` : la carte s'efface sur place. */
  target: { readonly x: number; readonly y: number } | null;
  /** Fin de l'animation (ou rien à animer). */
  onDone: () => void;
}

export function CutInOverlay({ cutIn, target, onDone }: CutInOverlayProps) {
  const card = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const rays = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const overframe = OVERFRAMES[cutIn.cardId];
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const height = typeof window === 'undefined' ? 800 : window.innerHeight;
  const scale = cutInScale({ width, height }, overframe?.headroom ?? 0);

  useLayoutEffect(() => {
    const el = card.current;
    if (!el || typeof el.animate !== 'function') {
      done.current();
      return;
    }
    const exit = target && { dx: target.x - width / 2, dy: target.y - height / 2 };
    const timing: KeyframeAnimationOptions = { duration: CUT_IN_MS, fill: 'both' };
    const main = el.animate(cutInFrames(scale, exit), timing);
    const others = [backdrop.current?.animate(CUT_IN_BACKDROP, timing), rays.current?.animate(cutInRays(scale), timing)];
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      done.current();
    };
    main.finished.then(finish, finish);
    // Une page en arrière-plan n'avance pas ses animations : la lecture ne reste jamais bloquée au-delà de sa durée.
    const timer = window.setTimeout(finish, CUT_IN_MS + 100);
    return () => {
      // Démontée avant la fin (lecture interrompue, double montage en mode strict) : l'écran de jeu s'en charge.
      over = true;
      window.clearTimeout(timer);
      main.cancel();
      others.forEach((animation) => animation?.cancel());
    };
    // Une seule animation par cut-in, depuis sa place au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`cutin cutin--p${cutIn.owner} cutin--${cutIn.kind}${cutIn.shiny ? ' cutin--shiny' : ''}`} aria-hidden="true">
      <div ref={backdrop} className="cutin__backdrop" />
      <div ref={rays} className="cutin__rays" />
      <div ref={card} className="cutin__card" style={{ width: SHEET_W }}>
        {overframe ? (
          <OverframeStage def={overframe} shiny={cutIn.shiny} animated>
            {(layers) => <CutInFrame cutIn={cutIn} layers={layers} />}
          </OverframeStage>
        ) : (
          <CutInFrame cutIn={cutIn} />
        )}
      </div>
    </div>
  );
}
