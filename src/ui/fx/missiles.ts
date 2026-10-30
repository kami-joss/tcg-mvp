// Projectiles et cartes volantes (maquette « Plateau v4 » : `shoot`, `revealTrap`, `flyCard`).
import { burst, center, point, spawn, wait } from './stage';
import type { Stage } from './stage';
import type { Position } from '../../engine';
import { TILE_FRAME, artFit, fitBackground } from '../art';
import type { CardArt } from '../art';

export type Projectile = 'arrow' | 'fire' | 'ice' | 'stone' | 'fireball' | 'magic';

interface Look {
  readonly glow?: string;
  readonly head?: string;
  readonly shaft?: string;
  readonly fletching?: string;
  readonly trail: string | null;
  readonly hit: string;
}

const LOOKS: Readonly<Record<Projectile, Look>> = {
  arrow: { glow: 'drop-shadow(0 1px 1px oklch(0 0 0 / .7))', head: 'oklch(0.85 0.02 250)', shaft: 'oklch(0.6 0.07 60)', fletching: 'oklch(0.97 0.01 85)', trail: 'oklch(1 0 0 / .55)', hit: 'oklch(0.97 0.02 85)' },
  fire: { glow: 'drop-shadow(0 0 3px oklch(0.85 0.18 70)) drop-shadow(0 0 8px oklch(0.65 0.22 35))', head: 'oklch(0.93 0.15 90)', shaft: 'oklch(0.5 0.1 45)', fletching: 'oklch(0.7 0.21 35)', trail: 'oklch(0.8 0.18 60)', hit: 'oklch(0.78 0.19 50)' },
  ice: { glow: 'drop-shadow(0 0 3px oklch(0.95 0.05 220)) drop-shadow(0 0 8px oklch(0.75 0.12 230))', head: 'oklch(0.97 0.03 220)', shaft: 'oklch(0.75 0.08 230)', fletching: 'oklch(0.9 0.06 220)', trail: 'oklch(0.93 0.06 220)', hit: 'oklch(0.88 0.09 225)' },
  stone: { trail: null, hit: 'oklch(0.72 0.04 70)' },
  fireball: { trail: 'oklch(0.8 0.18 60)', hit: 'oklch(0.75 0.2 45)' },
  magic: { trail: 'oklch(0.75 0.15 300)', hit: 'oklch(0.72 0.17 300)' },
};

/** Projectile d'une case à une autre (flèche droite, boulet ou boule en cloche) ; renvoie la couleur de l'impact. */
export async function shoot(stage: Stage, from: Position, to: Position, type: Projectile): Promise<string> {
  const a = point(stage, from);
  const b = point(stage, to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const lob = type === 'stone' || type === 'fireball' || type === 'magic';
  const height = type === 'stone' ? Math.min(110, d * 0.4) : lob ? Math.min(50, d * 0.2) : 0;
  const duration = type === 'stone' ? 420 + d : lob ? 300 + d * 1.1 : 140 + d * 0.9;
  const at = (t: number) => ({ x: a.x + dx * t, y: a.y + dy * t - Math.sin(t * Math.PI) * height });
  const look = LOOKS[type];

  const frames: Keyframe[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const q = at(t);
    const heading = lob ? (Math.atan2(dy - Math.PI * height * Math.cos(t * Math.PI), dx) * 180) / Math.PI : angle;
    const spin = type === 'stone' ? t * 600 : heading;
    const grow = type === 'stone' ? 1 + Math.sin(t * Math.PI) * 0.5 : 1;
    frames.push({ transform: `translate(${q.x}px,${q.y}px) rotate(${spin}deg) scale(${grow})`, offset: t });
  }

  let style: Partial<CSSStyleDeclaration>;
  let html = '';
  if (type === 'stone') {
    style = { width: '18px', height: '18px', marginLeft: '-9px', marginTop: '-9px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, oklch(0.85 0.02 80), oklch(0.5 0.02 70) 60%, oklch(0.32 0.02 60))', boxShadow: '0 2px 3px oklch(0 0 0 / .5)' };
    // Ombre du boulet au sol.
    spawn(
      stage,
      { left: '0', top: '0', width: '18px', height: '7px', marginLeft: '-9px', marginTop: '12px', borderRadius: '50%', background: 'oklch(0 0 0 / .35)', zIndex: '1' },
      [{ transform: `translate(${a.x}px,${a.y}px) scale(1)` }, { transform: `translate(${(a.x + b.x) / 2}px,${(a.y + b.y) / 2}px) scale(.45)`, opacity: 0.5 }, { transform: `translate(${b.x}px,${b.y}px) scale(1)` }],
      { duration, easing: 'linear' },
    );
  } else if (type === 'fireball' || type === 'magic') {
    const core =
      type === 'fireball'
        ? 'radial-gradient(circle at 40% 40%, oklch(0.99 0.05 95), oklch(0.86 0.17 75) 35%, oklch(0.64 0.22 35) 70%, oklch(0.5 0.2 30 / 0) 100%)'
        : 'radial-gradient(circle at 40% 40%, oklch(0.98 0.03 300), oklch(0.75 0.15 300) 40%, oklch(0.5 0.18 295 / 0) 100%)';
    const size = type === 'fireball' ? 26 : 20;
    const halo = type === 'fireball' ? 'oklch(0.7 0.2 45 / .65)' : 'oklch(0.65 0.17 300 / .6)';
    style = { width: `${size}px`, height: `${size}px`, marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px`, borderRadius: '50%', background: core, boxShadow: `0 0 16px 7px ${halo}` };
  } else {
    style = { width: '44px', height: '12px', marginLeft: '-22px', marginTop: '-6px', filter: look.glow ?? '' };
    html =
      `<div style="position:absolute;left:7px;top:4.5px;width:28px;height:3px;background:${look.shaft};border-radius:2px"></div>` +
      `<div style="position:absolute;right:0;top:0;width:12px;height:12px;background:${look.head};clip-path:polygon(0 0,100% 50%,0 100%,25% 50%)"></div>` +
      `<div style="position:absolute;left:0;top:1px;width:11px;height:10px;background:${look.fletching};clip-path:polygon(0 0,55% 0,100% 50%,55% 100%,0 100%,40% 50%)"></div>`;
  }
  spawn(stage, { left: '0', top: '0', zIndex: '3', ...style }, frames, { duration, easing: 'linear' }, html);

  if (look.trail) {
    const count = Math.max(4, Math.round(d / (type === 'fireball' ? 8 : 13)));
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const q = at(t);
      const z = (type === 'fireball' ? 7 : 4) + Math.random() * 4;
      const up = type === 'ice' || type === 'arrow' ? 4 : -18;
      spawn(
        stage,
        { left: `${q.x - z / 2}px`, top: `${q.y - z / 2}px`, width: `${z}px`, height: `${z}px`, borderRadius: type === 'ice' ? '1px' : '50%', background: look.trail, boxShadow: type === 'arrow' ? 'none' : `0 0 6px ${look.trail}`, zIndex: '2' },
        [
          { opacity: 0, transform: 'translate(0px,0px) scale(1) rotate(45deg)' },
          { opacity: 0.95, transform: 'translate(0px,0px) scale(1) rotate(45deg)', offset: 0.06 },
          { opacity: 0, transform: `translate(${(Math.random() - 0.5) * 12}px,${up}px) scale(.2) rotate(45deg)` },
        ],
        { duration: type === 'arrow' ? 260 : 540, delay: Math.max(0, duration * t - 20) },
      );
    }
  }
  await wait(duration);
  return look.hit;
}

type Face = 'back' | 'bomb' | 'net';

function faceHtml(face: Face, label: string): string {
  if (face === 'back') {
    return '<div style="position:absolute;inset:0;border-radius:6px;background:repeating-linear-gradient(45deg, oklch(0.3 0.04 60) 0 5px, oklch(0.24 0.03 60) 5px 10px);box-shadow:inset 0 0 0 2px oklch(0.78 0.12 85), inset 0 0 0 4px oklch(0.24 0.03 60);display:flex;align-items:center;justify-content:center"><div style="width:13px;height:13px;transform:rotate(45deg);background:oklch(0.78 0.12 85);box-shadow:0 0 0 3px oklch(0.24 0.03 60), 0 0 0 4px oklch(0.78 0.12 85)"></div></div>';
  }
  const mark = face === 'bomb'
    ? '<div style="width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 35%, oklch(0.5 0.02 60), oklch(0.15 0.01 60));box-shadow:0 0 0 2px white"></div>'
    : '<div style="width:26px;height:26px;border-radius:4px;background:repeating-linear-gradient(45deg, transparent 0 4px, white 4px 5.5px), repeating-linear-gradient(-45deg, transparent 0 4px, white 4px 5.5px)"></div>';
  return `<div style="position:absolute;inset:0;border-radius:6px;background:linear-gradient(160deg, oklch(0.55 0.16 300), oklch(0.36 0.12 295));box-shadow:inset 0 0 0 2px oklch(0.85 0.1 300);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:white;font:800 10px/1 'Alegreya Sans SC',sans-serif;letter-spacing:.04em">${mark}<span>${label}</span></div>`;
}

/** Petite carte qui se retourne (pose ou déclenchement d'un piège). */
function flipCard(stage: Stage, pos: Position, front: [Face, string], back: [Face, string], move: Keyframe[], turn: Keyframe[], ms: number): void {
  const { x, y } = point(stage, pos);
  const holder = spawn(stage, { left: `${x - 24}px`, top: `${y - 32}px`, width: '48px', height: '64px', perspective: '360px', zIndex: '4' }, move, {
    duration: ms,
    easing: 'cubic-bezier(.3,.7,.3,1)',
  });
  const card = document.createElement('div');
  Object.assign(card.style, { position: 'absolute', inset: '0', transformStyle: 'preserve-3d', filter: 'drop-shadow(0 6px 6px oklch(0 0 0 / .5))' });
  const side = ([face, label]: [Face, string], rotation: number) => {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'absolute', inset: '0', backfaceVisibility: 'hidden', transform: `rotateY(${rotation}deg)` });
    el.innerHTML = faceHtml(face, label);
    return el;
  };
  card.append(side(front, 0), side(back, 180));
  holder.appendChild(card);
  card.animate(turn, { duration: ms, easing: 'ease-in-out', fill: 'both' });
}

const trapFace = (kind: 'bomb' | 'net', suffix: string): [Face, string] => [kind, (kind === 'bomb' ? 'Bombe' : 'Filet') + suffix];

/** Piège posé : la carte face visible tombe sur la case en se retournant face cachée, éclat violet. */
export async function placeTrap(stage: Stage, pos: Position, kind: 'bomb' | 'net'): Promise<void> {
  flipCard(
    stage,
    pos,
    trapFace(kind, ''),
    ['back', ''],
    [
      { transform: 'translate(0px,-60px) scale(1.2)', opacity: 0 },
      { transform: 'translate(0px,-40px) scale(1.2)', opacity: 1, offset: 0.2 },
      { transform: 'translate(0px,0px) scale(.7)', opacity: 1, offset: 0.8 },
      { transform: 'translate(0px,0px) scale(.6)', opacity: 0 },
    ],
    [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(0deg)', offset: 0.3 }, { transform: 'rotateY(180deg)', offset: 0.7 }, { transform: 'rotateY(180deg)' }],
    950,
  );
  await wait(760);
  burst(stage, pos, 'oklch(0.72 0.15 300)', { n: 8, spread: 26, size: 5 });
}

/** Piège déclenché : la carte dos surgit au-dessus de la case et se retourne. */
export async function revealTrap(stage: Stage, pos: Position, kind: 'bomb' | 'net'): Promise<void> {
  flipCard(
    stage,
    pos,
    ['back', ''],
    trapFace(kind, ' !'),
    [
      { transform: 'translate(0px,0px) scale(.5)', opacity: 0 },
      { transform: 'translate(0px,-40px) scale(1.25)', opacity: 1, offset: 0.25 },
      { transform: 'translate(0px,-40px) scale(1.25)', opacity: 1, offset: 0.8 },
      { transform: 'translate(0px,-50px) scale(1.4)', opacity: 0 },
    ],
    [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(0deg)', offset: 0.22 }, { transform: 'rotateY(180deg)', offset: 0.5 }, { transform: 'rotateY(180deg)' }],
    1000,
  );
  await wait(560);
}

/** Tuile du grimoire qui vole jusqu'à sa cible (arc, rotation) ; un sort éclate en doré à l'arrivée. */
export async function flyCard(stage: Stage, fromSelector: string, pos: Position, art: CardArt | null, name: string, spell: boolean): Promise<void> {
  const to = point(stage, pos);
  const from = center(stage, fromSelector) ?? { x: to.x, y: to.y + 160, w: 72, h: 96 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const s0 = Math.min(1.6, from.w / 72);
  const ms = spell ? 820 : 760;
  const T = (x: number, y: number, rz: number, ry: number, s: number) =>
    `perspective(600px) translate(${x}px,${y}px) rotate(${rz}deg) rotateY(${ry}deg) scale(${s})`;
  const frames: Keyframe[] = spell
    ? [
        { transform: T(0, 0, 0, 0, s0), opacity: 1, filter: 'brightness(1)' },
        { transform: T(dx * 0.5, dy * 0.5 - 80, -10, 0, 1.1), opacity: 1, filter: 'brightness(1)', offset: 0.45 },
        { transform: T(dx, dy - 34, 0, 0, 1), opacity: 1, filter: 'brightness(1.2)', offset: 0.7 },
        { transform: T(dx, dy - 34, 0, 0, 1.6), opacity: 0, filter: 'brightness(3)' },
      ]
    : [
        { transform: T(0, 0, 0, 0, s0), opacity: 1 },
        { transform: T(dx * 0.5, dy * 0.5 - 80, -10, 0, 1.1), opacity: 1, offset: 0.5 },
        { transform: T(dx, dy, 0, 0, 0.8), opacity: 1, offset: 0.82 },
        { transform: T(dx, dy, 0, 90, 0.6), opacity: 0.6 },
      ];
  // Comme une tuile du grimoire (3:4, lot 9) : l'illustration cadrée sur les yeux, le nom en bas sous un voile.
  const veil = 'linear-gradient(180deg, oklch(0.12 0.01 60 / 0) 0 34%, oklch(0.12 0.01 60 / .8) 62%, oklch(0.12 0.01 60 / .85) 100%)';
  const artCss = art
    ? `${veil}, ${fitBackground(art, artFit(art, TILE_FRAME), 72)}, oklch(0.2 0.014 60)`
    : `${veil}, repeating-linear-gradient(135deg, oklch(0.42 0.04 70) 0 7px, oklch(0.5 0.04 70) 7px 14px)`;
  const card = spawn(
    stage,
    { left: `${from.x - 36}px`, top: `${from.y - 48}px`, width: '72px', height: '96px', borderRadius: '8px', overflow: 'hidden', background: artCss, boxShadow: '0 0 0 2px oklch(0.82 0.13 85), 0 10px 24px oklch(0 0 0 / .5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: '3' },
    frames,
    { duration: ms, easing: 'cubic-bezier(.4,0,.3,1)' },
    `<div class="fx-card__name" style="padding:0 4px 6px;font:800 11px/1.05 'Alegreya Sans',sans-serif;color:oklch(0.97 0.01 85);text-shadow:0 1px 2px oklch(0 0 0 / .9);text-align:center"></div>`,
  );
  const label = card.querySelector('.fx-card__name');
  if (label) label.textContent = name;
  if (spell) {
    await wait(ms * 0.72);
    spellFlash(stage, pos);
    await wait(ms * 0.28);
  } else {
    await wait(ms);
  }
}

/** Éclat doré d'un sort qui arrive sur sa cible. */
export function spellFlash(stage: Stage, pos: Position): void {
  burst(stage, pos, 'oklch(0.9 0.12 90)', { n: 12, spread: 46, size: 6, square: true, flash: 'oklch(0.9 0.12 90)', flashScale: 2.6, ringScale: 3.2 });
}
