// Effets visuels dessinés à la main (Web Animations API, sans bibliothèque), repris de la maquette « Plateau v4 » :
// particules, projectiles, cartes qui volent, secousses. Tout est dessiné dans un calque fixe plein écran, positionné
// depuis les cases à l'écran : cela marche pareil en vue de dessus et en vue inclinée.
import { ICON_PATHS } from '../iconPaths';
import type { IconName } from '../Icon';
import type { Position } from '../../engine';

export interface Stage {
  /** Racine de l'écran de jeu, où chercher les cases, jetons et compteurs. */
  readonly root: HTMLElement;
  /** Calque fixe, plein écran, sans clics. */
  readonly layer: HTMLElement;
  readonly tilted: boolean;
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Keyframes = Keyframe[];

export function cellEl(stage: Stage, pos: Position): HTMLElement | null {
  return stage.root.querySelector<HTMLElement>(`[data-cell="${pos.row},${pos.col}"]`);
}

/** Élément qui se déplace dans le plan du sol. */
export const tokenEl = (stage: Stage, id: string) => stage.root.querySelector<HTMLElement>(`[data-uid="${id}"]`);
/** Corps du jeton (ombre, sauts, secousses, mort), ou plaque d'un terrain. */
export const bodyEl = (stage: Stage, id: string) =>
  stage.root.querySelector<HTMLElement>(`[data-ubody="${id}"]`) ?? stage.root.querySelector<HTMLElement>(`[data-tid="${id}"]`);

/**
 * Centre d'une case à l'écran ; en vue inclinée ou isométrique, remonté à hauteur du jeton debout (en iso, le plateau
 * donne cette hauteur dans `data-lift`, elle dépend de sa caméra).
 */
export function point(stage: Stage, pos: Position): { x: number; y: number; scale: number } {
  const el = cellEl(stage, pos);
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2, scale: 1 };
  const box = el.getBoundingClientRect();
  const scale = box.width / (el.offsetWidth || box.width);
  const isoLift = el.closest<HTMLElement>('[data-lift]')?.dataset.lift;
  const lift = isoLift ? Number(isoLift) : stage.tilted ? 8 * scale : 0;
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 - lift, scale };
}

/** Écart entre deux cases dans le plan du plateau (avant inclinaison, retournement compris). */
export function planeDelta(stage: Stage, from: Position, to: Position): { dx: number; dy: number } {
  const a = cellEl(stage, from);
  const b = cellEl(stage, to);
  if (!a || !b) return { dx: 0, dy: 0 };
  return { dx: b.offsetLeft - a.offsetLeft, dy: b.offsetTop - a.offsetTop };
}

export function center(stage: Stage, selector: string): { x: number; y: number; w: number; h: number } | null {
  const el = stage.root.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
}

/** Anime un élément existant ; renvoie l'animation (ou `null` si l'élément manque). */
export function animate(el: Element | null, keyframes: Keyframes, options: KeyframeAnimationOptions): Animation | null {
  return el && 'animate' in el ? el.animate(keyframes, options) : null;
}

/** Crée un élément dans le calque, l'anime puis le retire. */
export function spawn(
  stage: Stage,
  style: Partial<CSSStyleDeclaration>,
  keyframes: Keyframes,
  options: KeyframeAnimationOptions,
  html = '',
): HTMLElement {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'absolute', pointerEvents: 'none' }, style);
  el.innerHTML = html;
  stage.layer.appendChild(el);
  const animation = el.animate(keyframes, { fill: 'both', ...options });
  const remove = () => el.remove();
  animation.finished.then(remove, remove);
  return el;
}

export function iconSvg(name: IconName, color: string, size: number): string {
  return `<svg viewBox="0 0 512 512" width="${size}" height="${size}" style="display:block"><path fill="${color}" d="${ICON_PATHS[name]}"/></svg>`;
}

const TEXT_SHADOW = '0 2px 0 oklch(0.15 0.01 60), 0 0 8px oklch(0 0 0 / .6)';

/** Texte flottant au-dessus d'une case : gonfle puis monte en s'effaçant. */
export function float(stage: Stage, pos: Position, text: string, color: string, delay = 0): void {
  const { x, y } = point(stage, pos);
  spawn(
    stage,
    { left: `${x}px`, top: `${y - 30}px`, font: "800 24px/1 'Alegreya Sans'", color, whiteSpace: 'nowrap', textShadow: TEXT_SHADOW, zIndex: '5' },
    [
      { opacity: 0, transform: 'translate(-50%,8px) scale(.6)' },
      { opacity: 1, transform: 'translate(-50%,-6px) scale(1.4)', offset: 0.16 },
      { transform: 'translate(-50%,-8px) scale(1)', offset: 0.3 },
      { opacity: 0, transform: 'translate(-50%,-44px) scale(1)' },
    ],
    { duration: 1150, delay, easing: 'ease-out' },
  ).textContent = text;
}

/** Texte flottant au-dessus d'un élément de l'interface (compteur de mana…). */
export function floatAt(stage: Stage, selector: string, text: string, color: string): void {
  const c = center(stage, selector);
  if (!c) return;
  spawn(
    stage,
    { left: `${c.x}px`, top: `${c.y - c.h / 2 - 4}px`, font: "800 22px/1 'Alegreya Sans'", color, whiteSpace: 'nowrap', textShadow: TEXT_SHADOW },
    [
      { transform: 'translate(-50%,0px) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%,-10px) scale(1.25)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%,-34px) scale(1)', opacity: 0 },
    ],
    { duration: 1100, easing: 'ease-out' },
  ).textContent = text;
}

/** Compteur qui gonfle (gain) ou se rétracte (dépense). */
export function pulse(stage: Stage, selector: string, up: boolean): void {
  animate(
    stage.root.querySelector(selector),
    up
      ? [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.35)', filter: 'brightness(1.7)', offset: 0.35 }, { transform: 'scale(1)', filter: 'brightness(1)' }]
      : [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.78)', opacity: 0.5, offset: 0.4 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 420, easing: 'ease-out' },
  );
}

interface BurstOptions {
  n?: number;
  spread?: number;
  size?: number;
  ms?: number;
  ring?: boolean;
  ringScale?: number;
  flash?: string;
  flashScale?: number;
  square?: boolean;
  fall?: number;
}

/** Gerbe de particules, avec un anneau et un éclair facultatifs. */
export function burst(stage: Stage, pos: Position, color: string, o: BurstOptions = {}): void {
  const { x, y } = point(stage, pos);
  const n = o.n ?? 10;
  const spread = o.spread ?? 34;
  const size = o.size ?? 6;
  const ms = o.ms ?? 560;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const d = spread * (0.55 + Math.random() * 0.6);
    const z = size * (0.6 + Math.random() * 0.7);
    spawn(
      stage,
      { left: `${x - z / 2}px`, top: `${y - z / 2}px`, width: `${z}px`, height: `${z}px`, borderRadius: o.square ? '1px' : '50%', background: color, boxShadow: `0 0 6px ${color}`, zIndex: '2' },
      [
        { transform: 'translate(0px,0px) rotate(45deg) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + (o.fall ?? 0)}px) rotate(45deg) scale(.15)`, opacity: 0 },
      ],
      { duration: ms * (0.7 + Math.random() * 0.5), easing: 'cubic-bezier(.15,.7,.35,1)' },
    );
  }
  if (o.ring !== false) {
    spawn(
      stage,
      { left: `${x - 14}px`, top: `${y - 14}px`, width: '28px', height: '28px', borderRadius: '50%', border: `3px solid ${color}`, boxSizing: 'border-box' },
      [{ transform: 'scale(.3)', opacity: 1 }, { transform: `scale(${o.ringScale ?? 2.6})`, opacity: 0 }],
      { duration: 440, easing: 'ease-out' },
    );
  }
  if (o.flash) {
    spawn(
      stage,
      { left: `${x - 30}px`, top: `${y - 30}px`, width: '60px', height: '60px', borderRadius: '50%', background: `radial-gradient(circle, oklch(1 0 0) 0%, ${o.flash} 35%, transparent 70%)` },
      [{ transform: 'scale(.2)', opacity: 1 }, { transform: `scale(${o.flashScale ?? 2})`, opacity: 0 }],
      { duration: 480, easing: 'ease-out' },
    );
  }
}

/** Tremblement du plateau : appliqué à la scène qui le contient, jamais au plateau lui-même (3D). */
export function quake(stage: Stage): void {
  animate(
    stage.root.querySelector('[data-scene]'),
    [{ transform: 'translate(0px,0px)' }, { transform: 'translate(-4px,2px)' }, { transform: 'translate(3px,-2px)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(0px,0px)' }],
    { duration: 320 },
  );
}

export function explode(stage: Stage, pos: Position, color: string): void {
  burst(stage, pos, color, { n: 16, spread: 52, size: 8, flash: color, flashScale: 2.8, ringScale: 3.6, ms: 700 });
  burst(stage, pos, 'oklch(0.42 0.02 60)', { n: 8, spread: 30, size: 13, ring: false, ms: 950, fall: -16 });
  quake(stage);
}

/** Étincelles qui montent (Charge). */
export function rise(stage: Stage, pos: Position, color: string): void {
  const { x, y } = point(stage, pos);
  for (let i = 0; i < 12; i++) {
    const ox = (Math.random() - 0.5) * 50;
    const z = 4 + Math.random() * 4;
    spawn(
      stage,
      { left: `${x + ox - z / 2}px`, top: `${y + 16}px`, width: `${z}px`, height: `${z}px`, background: color, boxShadow: `0 0 8px ${color}`, zIndex: '4' },
      [
        { transform: 'translateY(0px) rotate(45deg) scale(.4)', opacity: 0 },
        { transform: 'translateY(-14px) rotate(45deg) scale(1)', opacity: 1, offset: 0.3 },
        { transform: `translateY(${-46 - Math.random() * 22}px) rotate(45deg) scale(.3)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 300, delay: i * 40, easing: 'ease-out' },
    );
  }
  burst(stage, pos, color, { n: 0, ringScale: 3 });
}

/** Rafale de vent dans le sens du recul (Bourrasque), tel qu'on le voit à l'écran. */
export function gust(stage: Stage, from: Position, to: Position): void {
  const a = point(stage, from);
  const b = point(stage, to);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const holder = document.createElement('div');
  Object.assign(holder.style, { position: 'absolute', left: `${a.x}px`, top: `${a.y}px`, width: '0', height: '0', transform: `rotate(${angle}deg)`, zIndex: '4', pointerEvents: 'none' });
  stage.layer.appendChild(holder);
  for (let i = 0; i < 6; i++) {
    const line = document.createElement('div');
    const w = 28 + Math.random() * 24;
    Object.assign(line.style, { position: 'absolute', left: '-70px', top: `${(i - 2.5) * 10 - 1.5}px`, width: `${w}px`, height: '3px', borderRadius: '2px', background: 'linear-gradient(90deg, transparent, oklch(0.97 0.03 220))', boxShadow: '0 0 6px oklch(0.9 0.06 220 / .8)' });
    holder.appendChild(line);
    line.animate([{ transform: 'translateX(-20px)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translateX(130px)', opacity: 0 }], {
      duration: 560,
      delay: i * 55 + Math.random() * 40,
      easing: 'ease-out',
      fill: 'both',
    });
  }
  setTimeout(() => holder.remove(), 1100);
}

/** Filet qui tombe sur la case. */
export function net(stage: Stage, pos: Position): void {
  const { x, y } = point(stage, pos);
  const line = 'oklch(0.95 0.03 95 / .9)';
  spawn(
    stage,
    {
      left: `${x - 30}px`,
      top: `${y - 30}px`,
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      zIndex: '4',
      background: `repeating-linear-gradient(45deg, transparent 0 7px, ${line} 7px 9px), repeating-linear-gradient(-45deg, transparent 0 7px, ${line} 7px 9px)`,
      boxShadow: 'inset 0 0 0 2px oklch(0.95 0.03 95)',
    },
    [
      { transform: 'scale(1.9) rotate(-20deg)', opacity: 0 },
      { transform: 'scale(.95) rotate(0deg)', opacity: 1, offset: 0.3 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.8 },
      { transform: 'scale(1) rotate(0deg)', opacity: 0 },
    ],
    { duration: 1300, easing: 'ease-out' },
  );
}

/** Icône qui vole d'une case jusqu'à un compteur (cristal vers le mana, lauriers vers les VP), qui pulse à l'arrivée. */
export function flyTo(stage: Stage, pos: Position, selector: string, icon: IconName, color: string, delay = 0): void {
  const a = point(stage, pos);
  const b = center(stage, selector);
  if (!b) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ms = 850;
  spawn(
    stage,
    { left: `${a.x - 13}px`, top: `${a.y - 13}px`, zIndex: '2', filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 2px 2px oklch(0 0 0 / .6))` },
    [
      { transform: 'translate(0px,0px) scale(.3)', opacity: 0 },
      { transform: 'translate(0px,-30px) scale(1.3)', opacity: 1, offset: 0.22 },
      { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 70}px) scale(1.1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px,${dy}px) scale(.55)`, opacity: 0.9 },
    ],
    { duration: ms, delay, easing: 'cubic-bezier(.45,0,.55,1)' },
    iconSvg(icon, color, 26),
  );
  setTimeout(() => pulse(stage, selector, true), ms + delay);
}

/** Secousse et éclair blanc d'un coup reçu (plus fort pour un coup dur). */
export function shake(el: HTMLElement | null, hard: boolean): void {
  const m = hard ? 1.7 : 1;
  animate(
    el,
    [
      { transform: 'translate(0px,0px) rotate(0deg)' },
      { transform: `translate(${-6 * m}px,${m}px) rotate(${-5 * m}deg)` },
      { transform: `translate(${5 * m}px,${-m}px) rotate(${4 * m}deg)` },
      { transform: `translate(${-3 * m}px,0px) rotate(${-2 * m}deg)` },
      { transform: 'translate(0px,0px) rotate(0deg)' },
    ],
    { duration: 400, easing: 'ease-out', composite: 'add' },
  );
  animate(el, [{ filter: 'brightness(2.6) saturate(.3)' }, { filter: 'brightness(1) saturate(1)' }], { duration: 340, easing: 'ease-out' });
}

/** Élan d'une attaque au contact, vers la cible (dans le plan du sol : le retournement est pris en compte). */
export async function lunge(stage: Stage, unitId: string, from: Position, to: Position): Promise<void> {
  const { dx, dy } = planeDelta(stage, from, to);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  animate(
    tokenEl(stage, unitId),
    [
      { transform: 'translate(0px,0px) scale(1)', zIndex: 12 },
      { transform: `translate(${-sx * 8}px,${-sy * 8}px) scale(1.04)`, offset: 0.35, zIndex: 12 },
      { transform: `translate(${sx * 28}px,${sy * 28}px) scale(1.1)`, offset: 0.6, zIndex: 12 },
      { transform: 'translate(0px,0px) scale(1)', zIndex: 12 },
    ],
    { duration: 460, easing: 'ease-in-out' },
  );
  await wait(275);
}

/**
 * Marche case par case (210 ms par case) : le jeton glisse dans le plan du sol et saute à chaque pas.
 * Renvoie l'animation de glissement, à annuler une fois le jeton redessiné sur sa nouvelle case.
 */
export async function walk(
  stage: Stage,
  unitId: string,
  start: Position,
  cells: readonly Position[],
  o: { speed?: number; hop?: number } = {},
): Promise<Animation | null> {
  const el = tokenEl(stage, unitId);
  const body = bodyEl(stage, unitId);
  const n = cells.length;
  if (!el || n === 0) return null;
  const hop = o.hop ?? 13;
  const duration = n * 210 * (o.speed ?? 1);
  const slide: Keyframe[] = [{ transform: 'translate(0px,0px)', zIndex: 12, offset: 0, easing: 'ease-in-out' }];
  const hops: Keyframe[] = [{ transform: 'translateY(0px) scale(1)', offset: 0, easing: 'ease-out' }];
  cells.forEach((pos, i) => {
    const { dx, dy } = planeDelta(stage, start, pos);
    slide.push({ transform: `translate(${dx}px,${dy}px)`, zIndex: 12, offset: (i + 1) / n, easing: 'ease-in-out' });
    hops.push(
      { transform: `translateY(${-hop}px) scale(1.06)`, offset: (i + 0.5) / n, easing: 'ease-in' },
      { transform: 'translateY(0px) scale(1)', offset: (i + 1) / n, easing: 'ease-out' },
    );
  });
  body?.animate(hops, { duration, composite: 'add' });
  const animation = el.animate(slide, { duration, fill: 'forwards' });
  await animation.finished.catch(() => undefined);
  return animation;
}

/** Atterrissage : écrasement et poussière. */
export function land(stage: Stage, unitId: string, pos: Position): void {
  animate(bodyEl(stage, unitId), [{ transform: 'scale(1.14,.84)' }, { transform: 'scale(.96,1.05)', offset: 0.5 }, { transform: 'scale(1,1)' }], {
    duration: 260,
    easing: 'ease-out',
    composite: 'add',
  });
  burst(stage, pos, 'oklch(0.85 0.04 80 / .8)', { n: 6, spread: 22, size: 5, ring: false, ms: 420 });
}

/** Mort : fumée, puis le jeton tourne et rapetisse jusqu'à disparaître. */
export async function die(stage: Stage, unitId: string, pos: Position): Promise<void> {
  await wait(260);
  burst(stage, pos, 'oklch(0.8 0.02 80)', { n: 12, spread: 40, size: 9, ms: 700, ring: false, fall: -10 });
  const animation = animate(
    bodyEl(stage, unitId),
    [
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
      { transform: 'scale(1.18) rotate(-7deg)', opacity: 1, offset: 0.3 },
      { transform: 'scale(.1) rotate(35deg)', opacity: 0 },
    ],
    { duration: 480, easing: 'ease-in', fill: 'forwards' },
  );
  await animation?.finished.catch(() => undefined);
}

/** Monstre invoqué : chute sur sa case, écrasement, onde à la couleur du joueur. */
export async function drop(stage: Stage, unitId: string, pos: Position, color: string): Promise<void> {
  animate(
    bodyEl(stage, unitId),
    [
      { transform: 'translateY(-26px) scale(.2)', opacity: 0 },
      { transform: 'translateY(0px) scale(1.12,.86)', opacity: 1, offset: 0.7 },
      { transform: 'translateY(0px) scale(1)', opacity: 1 },
    ],
    { duration: 420, easing: 'ease-in' },
  );
  await wait(250);
  burst(stage, pos, color, { n: 12, spread: 38, size: 6, ringScale: 3 });
}

/** Terrain posé : écrasement, poussière et tremblement. */
export async function slam(stage: Stage, unitId: string, pos: Position): Promise<void> {
  animate(bodyEl(stage, unitId), [{ transform: 'scale(1.7)', opacity: 0 }, { transform: 'scale(.9)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)' }], {
    duration: 380,
    easing: 'ease-in',
  });
  await wait(210);
  burst(stage, pos, 'oklch(0.75 0.05 75)', { n: 14, spread: 44, size: 7 });
  quake(stage);
}

/** Recul du tireur au moment du tir. */
export function recoil(stage: Stage, unitId: string): void {
  animate(bodyEl(stage, unitId), [{ transform: 'translateY(0px) scale(1)' }, { transform: 'translateY(6px) scale(.92)', offset: 0.3 }, { transform: 'translateY(0px) scale(1)' }], {
    duration: 300,
    easing: 'ease-out',
    composite: 'add',
  });
}
