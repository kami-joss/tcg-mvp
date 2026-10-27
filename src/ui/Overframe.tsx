// Overframe animée (handoff overframe v1 et v2, handoff V11 lot 12 §4) : le haut du personnage sort du cadre de la
// fiche. Du bas vers le haut : la scène (débordement réservé au-dessus, `headroom`) > le flottement > l'inclinaison, qui
// porte le cadre (rendu par l'appelant, avec les calques du fond que ce composant lui donne : illustration et son
// reflet métallique, lueur, particules, voile, cadran, holo, reflet qui balaie), puis le pop et ses pièces (tresses,
// mèches, paupières), les bouts qui passent devant les bords, la lueur extérieure et les particules de devant. Tout vient
// des données de la carte (`overframes.json`) : aucun code propre à une carte.
// Animations en CSS (images clés `of*` de game.css), sur `transform`, `opacity` et `background-position` seulement ;
// à l'arrêt quand la scène sort de l'écran ou que l'onglet est caché ; rendu fixe quand les animations sont coupées
// (pas de particules ni d'inclinaison). Le clignement (setTimeout) est annulé au démontage.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode, RefObject } from 'react';
import { HOLO, PARTICLES, SWEEPS, breathOrigin, hasShinyImages, imageBox, overframeLook, overframeUrl } from './overframes';
import type { OverframeDef, OverframeDial, OverframeRing, OverframeShine, Particle } from './overframes';

/** Taille de la fiche, repère de toutes les cotes. */
export const SHEET_W = 280;
export const SHEET_H = 498;

/**
 * Sans liseré en haut du cadre, deux fondus cachent les coupes :
 * - l'illustration continue au-dessus du cadre sur `RISE` px (entière sur les `POP_FADE` + 2 derniers, puis elle
 *   s'efface), pour que le fond ne s'arrête pas net autour du personnage ; elle recouvre aussi le haut du cadre de
 *   `RISE_OVERLAP` px (mêmes pixels), pour qu'aucun jour n'apparaisse quand elle respire ;
 * - le pop, coupé au ras du haut du cadre, s'efface sur les `POP_FADE` px au-dessus, sur cette illustration identique :
 *   son contour et son ombre n'y tracent plus de ligne en travers du personnage.
 */
export const RISE = 46;
export const RISE_OVERLAP = 6;
export const POP_FADE = 12;

const px = (value: number) => `${Number(value.toFixed(1))}px`;

/**
 * Masque de l'image du pop (dans son repère) : fondu vers le haut du cadre ; les colonnes hors du cadre (pan de cape
 * qui passe devant un bord) restent entières.
 */
export function popMask(def: OverframeDef): string {
  const cut = -def.pop.y;
  const left = -def.pop.x;
  const right = SHEET_W - def.pop.x;
  return (
    `linear-gradient(180deg, #000 ${px(cut - POP_FADE)}, transparent ${px(cut)}), ` +
    `linear-gradient(90deg, #000 ${px(left)}, transparent ${px(left)}, transparent ${px(right)}, #000 ${px(right)})`
  );
}

/** Masque du prolongement de l'illustration au-dessus du cadre : il s'efface vers le haut, en douceur (courbe). */
const RISE_FADE = RISE - POP_FADE - 2;
const RISE_MASK =
  `linear-gradient(180deg, transparent, rgb(0 0 0 / 0.12) ${px(RISE_FADE / 4)}, rgb(0 0 0 / 0.38) ${px(RISE_FADE / 2)}, ` +
  `rgb(0 0 0 / 0.75) ${px((RISE_FADE * 3) / 4)}, #000 ${px(RISE_FADE)})`;

/**
 * Animer seulement ce qui se voit : `animated` (réglage, mouvements réduits), et l'élément est dans l'écran, et
 * l'onglet est visible.
 */
export function useMotionGate(ref: RefObject<HTMLElement | null>, animated: boolean): boolean {
  const [visible, setVisible] = useState(true);
  const [shown, setShown] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const el = ref.current;
    if (!animated || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, animated]);
  useEffect(() => {
    if (!animated) return;
    const update = () => setShown(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [animated]);
  return animated && visible && shown;
}

function Particles({ list, half = false }: { list: readonly Particle[]; half?: boolean }) {
  return (
    <>
      {list
        .filter((_, i) => !half || i % 2 === 0)
        .map((particle, i) => (
          <span key={i} className="of__particle" style={particle.style} />
        ))}
    </>
  );
}

/**
 * Shiny générique, dans le cadre (z-index −1, sous le contenu) : reflet holographique, reflet arc-en-ciel qui balaie,
 * étincelles. Pour une carte sans images brillantes, ou sans overframe.
 */
export function ShinyLayers({ animated, holoRef }: { animated: boolean; holoRef?: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      {animated && (
        <div className="of__back" aria-hidden="true">
          <Particles list={PARTICLES.sparks.back} />
        </div>
      )}
      <div ref={holoRef} className="of__holo" style={{ background: HOLO }} aria-hidden="true" />
      <div className="of__sweep-box" aria-hidden="true">
        <div className="of__sweep of__sweep--shiny" style={{ background: SWEEPS.shiny }} />
      </div>
    </>
  );
}

/** Reflet métallique dans le calque de l'illustration : seule une bande masquée passe, sur les zones claires. */
function Shine({ shine, src }: { shine: OverframeShine; src: string }) {
  const style: CSSProperties = {
    backgroundImage: `url("${src}")`,
    opacity: shine.opacity,
    filter: shine.filter,
    mixBlendMode: shine.blend as CSSProperties['mixBlendMode'],
    maskImage: shine.mask,
    WebkitMaskImage: shine.mask,
    maskSize: shine.maskSize,
    WebkitMaskSize: shine.maskSize,
  };
  return <div className="of__shine" style={style} aria-hidden="true" />;
}

function Ring({ ring }: { ring: OverframeRing }) {
  const style: CSSProperties = {
    inset: ring.inset ?? 0,
    background: ring.background,
    maskImage: ring.mask,
    WebkitMaskImage: ring.mask,
    opacity: ring.opacity,
  };
  return <div className={`of__ring of__ring--${ring.anim}`} style={style} />;
}

/** Cadran qui avance : anneau extérieur d'un cran par seconde, anneau intérieur à l'envers, liseré. */
function Dial({ dial }: { dial: OverframeDial }) {
  return (
    <div
      className="of__dial"
      style={{ left: dial.x, top: dial.y, width: dial.size, height: dial.size, transform: dial.transform }}
      aria-hidden="true"
    >
      <Ring ring={dial.outer} />
      <Ring ring={dial.inner} />
      <div className="of__ring" style={{ boxShadow: dial.rim }} />
    </div>
  );
}

/** Ce que l'overframe donne au cadre : les calques du fond (sous le contenu), et le reflet du pointeur (par-dessus). */
export interface OverframeLayers {
  readonly back: ReactNode;
  readonly glare: ReactNode;
}

interface OverframeStageProps {
  def: OverframeDef;
  shiny: boolean;
  animated: boolean;
  /** Rang de la carte affichée, pour décaler les flottements et les reflets entre cartes. */
  index?: number;
  className?: string;
  onClick?: () => void;
  title?: string;
  /** Le cadre de la fiche, avec les calques reçus. */
  children: (layers: OverframeLayers) => ReactNode;
}

export function OverframeStage({ def, shiny, animated, index = 0, className, onClick, title, children }: OverframeStageProps) {
  const stage = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const holo = useRef<HTMLDivElement>(null);
  const eyes = useRef<HTMLDivElement>(null);
  const running = useMotionGate(stage, animated);
  const look = overframeLook(def, shiny);
  const ownShiny = shiny && hasShinyImages(def);
  const particles = PARTICLES[shiny ? 'sparks' : def.particles];

  // Clignement : 170 ms, puis le suivant dans 2,4 à 5,6 s (22 % de chances d'un double clignement).
  const hasEyes = def.parts.some((part) => part.anim === 'blink');
  useEffect(() => {
    const el = eyes.current;
    if (!running || !hasEyes || !el || typeof el.animate !== 'function') return;
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const once = () =>
      el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 170 });
    const loop = () => {
      once();
      if (Math.random() < 0.22) later(once, 260);
      later(loop, 2400 + Math.random() * 3200);
    };
    later(loop, 1200 + index * 500);
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [running, hasEyes, index]);

  // Inclinaison au survol : le cadre penche vers le pointeur, un reflet le suit ; le holo s'avive sur les bords.
  const move = (event: MouseEvent<HTMLDivElement>) => {
    const el = stage.current;
    if (!animated || !el || !tilt.current) return;
    const box = el.getBoundingClientRect();
    const k = box.width / SHEET_W || 1;
    const px = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const py = Math.min(1, Math.max(0, (event.clientY - box.top - def.headroom * k) / (SHEET_H * k)));
    tilt.current.style.transform = `perspective(1000px) rotateX(${((0.5 - py) * 12).toFixed(2)}deg) rotateY(${((px - 0.5) * 14).toFixed(2)}deg)`;
    if (glare.current) {
      glare.current.style.opacity = '1';
      glare.current.style.background = `radial-gradient(circle at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, oklch(1 0 0 / .35), transparent 55%)`;
    }
    if (holo.current) holo.current.style.opacity = (0.22 + 0.25 * Math.abs(px - 0.5) * 2).toFixed(2);
  };
  const leave = () => {
    if (tilt.current) tilt.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    if (glare.current) glare.current.style.opacity = '0';
    if (holo.current) holo.current.style.opacity = '0.22';
  };

  // Le pop : sa boîte porte le contour et le halo, son image s'efface en bas (le contour suit le fondu).
  const { backgroundImage: popImage, ...popBox } = imageBox(def.pop, ownShiny);
  const popFade = popMask(def);

  const glowStyle: CSSProperties = {
    left: `${def.glow.x}px`,
    top: `${def.glow.y}px`,
    width: `${def.glow.size}px`,
    height: `${def.glow.size}px`,
    background: `radial-gradient(closest-side, ${look.glow[0]}, ${look.glow[1]} ${look.glowStop ?? '60%'}, transparent)`,
  };
  const glow = (outside: boolean) => (
    <div className={`of__glow${outside ? ' of__glow--outside' : ''}`} style={glowStyle} aria-hidden="true" />
  );

  const back = (
    <>
      <div
        className="of__art of__breath"
        style={{ ...imageBox(def.art, ownShiny), transformOrigin: breathOrigin(def, def.art) }}
        aria-hidden="true"
      >
        {def.shine && <Shine shine={def.shine} src={overframeUrl(def.art.src, ownShiny)} />}
      </div>
      {def.glow.layer === 'inside' && glow(false)}
      {animated && (
        <div className="of__back" aria-hidden="true">
          <Particles list={particles.back} />
        </div>
      )}
      <div className="of__veil" aria-hidden="true" />
      {def.dial && <Dial dial={def.dial} />}
      {shiny ? (
        <>
          <div ref={holo} className="of__holo" style={{ background: HOLO }} aria-hidden="true" />
          <div className="of__sweep-box" aria-hidden="true">
            <div className="of__sweep of__sweep--shiny" style={{ background: SWEEPS.shiny }} />
          </div>
        </>
      ) : (
        <div className="of__sweep-box" aria-hidden="true">
          <div
            className="of__sweep"
            style={{ background: SWEEPS[def.sweep], animationDuration: def.sweepMs ? `${def.sweepMs}ms` : undefined }}
          />
        </div>
      )}
    </>
  );

  const classes = ['of', animated && 'of--anim', animated && !running && 'of--paused', onClick && 'of--clickable', className];
  return (
    <div
      ref={stage}
      className={classes.filter(Boolean).join(' ')}
      style={{ paddingTop: def.headroom, '--of-n': index } as CSSProperties}
      onMouseMove={move}
      onMouseLeave={leave}
      onClick={onClick}
      title={title}
    >
      <div className="of__float">
        <div ref={tilt} className="of__tilt">
          {children({ back, glare: <div ref={glare} className="of__glare" aria-hidden="true" /> })}
          <div
            className="of__rise"
            style={{ top: -RISE, height: RISE + RISE_OVERLAP, maskImage: RISE_MASK, WebkitMaskImage: RISE_MASK }}
            aria-hidden="true"
          >
            <div
              className="of__art of__breath"
              style={{ ...imageBox({ ...def.art, y: def.art.y + RISE }, ownShiny), transformOrigin: breathOrigin(def, def.art) }}
            >
              {def.shine && <Shine shine={def.shine} src={overframeUrl(def.art.src, ownShiny)} />}
            </div>
          </div>
          <div
            className="of__pop of__breath"
            style={{ ...popBox, transformOrigin: breathOrigin(def, def.pop), filter: look.popFilter }}
            aria-hidden="true"
          >
            <div className="of__pop-img" style={{ backgroundImage: popImage, maskImage: popFade, WebkitMaskImage: popFade }} />
            {def.parts.map((part) => (
              <div
                key={part.id}
                ref={part.anim === 'blink' ? eyes : undefined}
                className={`of__part of__part--${part.anim}`}
                style={{
                  ...imageBox(part, ownShiny),
                  ...(part.origin ? { transformOrigin: `${part.origin[0]}px ${part.origin[1]}px` } : {}),
                }}
              />
            ))}
          </div>
          {def.sides && (
            <div
              className="of__sides of__breath"
              style={{ ...imageBox(def.sides, ownShiny), transformOrigin: breathOrigin(def, def.sides) }}
              aria-hidden="true"
            />
          )}
          {def.glow.layer === 'outside' && glow(true)}
          {animated && (
            <div className="of__front" style={{ top: -def.headroom }} aria-hidden="true">
              <Particles list={particles.front} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Particules arrière d'une tuile survolée (moitié du nombre), dans le repère de la fiche mis à l'échelle de la tuile. */
export function TileParticles({ def, shiny }: { def: OverframeDef; shiny: boolean }) {
  return (
    <span className="of__tile-fx" aria-hidden="true">
      <Particles list={PARTICLES[shiny ? 'sparks' : def.particles].back} half />
    </span>
  );
}
