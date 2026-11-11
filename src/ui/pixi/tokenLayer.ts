// Dessin des unités du plateau PixiJS (migration, sous-étape 3c), d'après `unitVisuals`, aux cotes du CSS en vue
// isométrique (case de 68 px, `--k` = 68) : un monstre est une goutte debout de 40 px (rond de 20 px de rayon, pointe à
// 20√2 vers son orientation), à la couleur du joueur, cernée de sombre, son illustration cadrée dans le rond
// (`tokenFit`), avec la sélection (liseré et halo flou qui pulse), les anneaux de cible, les pastilles de stats et de
// statuts, les dégâts annoncés ; il respire et grossit au survol. Un terrain est un socle au sol et un blason debout.
// Au sol : l'ombre de chaque unité et la flèche d'orientation au bord de la case. Les cotes debout sont en « px de
// jeton » ; le jeton est mis à l'échelle de la caméra (`standScale` × k), comme `scale(var(--su))` du CSS. Les
// animations d'action (sous-étape 3d, `tokenMotion.ts`) déplacent l'unité dans le plan, son ombre avec elle, et
// secouent, écrasent ou effacent son corps.
import type { ColorMatrixFilter, Container as PixiContainer, Graphics, Sprite, Texture } from 'pixi.js';
import { CARD_ART, tokenFit } from '../art';
import type { IconName } from '../Icon';
import type { IsoCamera } from '../iso/scenery';
import { statusIcon } from '../statusInfo';
import { CELL_COLORS, CELL_SIZE } from './cellModel';
import { cssColor, hatch, iconTexture, mix } from './cellLayer';
import { painted } from './groundFx';
import type { Pixi } from './groundFx';
import { isoDepth, isoProject } from './isoProjection';
import { TOKEN_FOOT } from './tokenModel';
import type { StatPill, StatusPill, TerrainVisual, TokenVisual } from './tokenModel';
import { REST, poseOf } from './tokenMotion';
import type { Motion, Playing, Point, Pose } from './tokenMotion';

const S = CELL_SIZE;
/** Rayon du rond de la goutte, son centre (sous le pied, relevé de 27 + 4,77 px) et le centre du cadre (survol). */
const DROP_R = 20;
const DROP_CY = -31.77;
const FRAME_CY = -27;
const DARK = 'oklch(0.16 0.02 60)';
const GOLD = 'oklch(0.88 0.15 88)';
const PAPER = CELL_COLORS.paper;
const INK = CELL_COLORS.ink;
const STATUS_COLORS: Readonly<Record<StatusPill['kind'], readonly [string, string]>> = {
  slow: ['oklch(0.86 0.07 220)', 'oklch(0.35 0.1 240)'],
  stun: ['oklch(0.88 0.13 95)', 'oklch(0.35 0.08 70)'],
  immobilise: ['oklch(0.8 0.1 300)', 'oklch(0.3 0.12 300)'],
  burn: ['oklch(0.8 0.14 60)', 'oklch(0.35 0.12 40)'],
  requiem: ['oklch(0.32 0.03 300)', 'oklch(0.93 0.02 300)'],
  camouflage: ['oklch(0.45 0.06 270)', 'oklch(0.92 0.03 270)'],
  carapace: ['oklch(0.62 0.1 150)', 'oklch(0.2 0.06 150)'],
  silence: ['oklch(0.78 0.08 20)', 'oklch(0.3 0.1 20)'],
  invisible: ['oklch(0.55 0.07 250)', 'oklch(0.95 0.02 250)'],
  desarme: ['oklch(0.7 0.05 60)', 'oklch(0.3 0.05 60)'],
  vol: ['oklch(0.82 0.08 230)', 'oklch(0.28 0.08 240)'],
  absorbe: ['oklch(0.45 0.12 340)', 'oklch(0.95 0.03 340)'],
  absorbation: ['oklch(0.8 0.12 150)', 'oklch(0.28 0.08 150)'],
  recuperation: ['oklch(0.8 0.12 150)', 'oklch(0.28 0.08 150)'],
  stat: ['oklch(0.85 0.1 90)', 'oklch(0.3 0.08 80)'],
};
const player = (owner: 1 | 2) => (owner === 1 ? CELL_COLORS.j1 : CELL_COLORS.j2);

/** Contour de la goutte (comme `dropPath`), pointe vers `angle` (degrés, sens horaire depuis le haut). */
function drop(g: Graphics, angle: number, cx = 0, cy = DROP_CY, r = DROP_R): Graphics {
  const at = (deg: number, radius: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.sin(rad), cy - radius * Math.cos(rad)];
  };
  const tip = at(angle, r * Math.SQRT2);
  const side = at(angle + 45, r);
  const toCanvas = (deg: number) => ((deg - 90) * Math.PI) / 180;
  return g.moveTo(...tip).lineTo(...side).arc(cx, cy, r, toCanvas(angle + 45), toCanvas(angle - 45)).closePath();
}

const easeBob = (x: number) => x * x * (3 - 2 * x);
/** Lueur des socles (`glowPulse`, 2,4 s), comme celle des mana zones. */
const glowPulse = (t: number) => {
  const f = (((t / 2.4) % 1) + 1) % 1;
  return 0.12 + 0.78 * easeBob(f < 0.5 ? f * 2 : 2 - f * 2);
};
/** Marge de la texture de la lueur d'un socle autour de sa case. */
const GLOW_PAD = 20;

/** Un texte en Alegreya Sans 800, net même grossi (survol), ancré au centre. */
function text(pixi: Pixi, value: string, size: number, color: string): PixiContainer {
  const label = new pixi.Text({
    text: value,
    resolution: 4,
    style: { fontFamily: ['Alegreya Sans', 'sans-serif'], fontWeight: '800', fontSize: size, fill: cssColor(color).color },
  });
  label.anchor.set(0.5, 0.52);
  return label;
}

/** Une icône teintée, de `size` px, centrée. */
function icon(pixi: Pixi, name: IconName, size: number, color: string): Sprite {
  const sprite = new pixi.Sprite({ texture: iconTexture(pixi, name), anchor: 0.5, width: size, height: size });
  const { color: tint, alpha } = cssColor(color);
  sprite.tint = tint;
  sprite.alpha = alpha;
  return sprite;
}

/** Pastille icône + valeur, posée par son bord gauche en (0, 0) ; renvoie le conteneur et sa largeur. */
function chip(
  pixi: Pixi,
  o: { icon: IconName | null; iconColor: string; value: string | null; text: string; fill: string; h: number; font: number; iconSize: number; ring: { css: string; width: number }; padL: number; padR: number; minW?: number },
): { node: PixiContainer; width: number } {
  const node = new pixi.Container();
  const parts: { node: PixiContainer; w: number }[] = [];
  if (o.icon) parts.push({ node: icon(pixi, o.icon, o.iconSize, o.iconColor), w: o.iconSize });
  if (o.value !== null) {
    const label = text(pixi, o.value, o.font, o.text);
    parts.push({ node: label, w: label.width });
  }
  const inner = parts.reduce((w, p) => w + p.w, 0) + Math.max(0, parts.length - 1);
  const width = Math.max(o.minW ?? 0, o.padL + inner + o.padR);
  const back = new pixi.Graphics()
    .roundRect(0, -o.h / 2, width, o.h, o.h / 2)
    .fill(cssColor(o.fill))
    .roundRect(0, -o.h / 2, width, o.h, o.h / 2)
    .stroke({ ...cssColor(o.ring.css), width: o.ring.width, alignment: 0 });
  node.addChild(back);
  let x = o.padL + (width - o.padL - o.padR - inner) / 2;
  for (const part of parts) {
    part.node.position.set(x + part.w / 2, 0);
    node.addChild(part.node);
    x += part.w + 1;
  }
  return { node, width };
}

/** Pastille de stat d'un jeton (hauteur 13 px), comme `.stat`. */
function statChip(pixi: Pixi, stat: StatPill): { node: PixiContainer; width: number } {
  const h = S * 0.191;
  const look =
    stat.kind === 'mob'
      ? { icon: 'walking-boot' as const, iconColor: stat.mine ? 'white' : INK, fill: stat.mine ? (stat.empty ? 'oklch(0.45 0.01 80)' : 'oklch(0.5 0.1 200)') : 'oklch(0.97 0.01 85)', text: stat.mine ? 'white' : INK }
      : stat.kind === 'hp'
        ? { icon: 'hearts' as const, iconColor: 'oklch(0.55 0.2 25)', fill: 'oklch(0.97 0.01 85)', text: stat.hurt ? 'oklch(0.48 0.2 25)' : INK }
        : { icon: 'broadsword' as const, iconColor: stat.boosted ? 'oklch(0.42 0.17 145)' : INK, fill: 'oklch(0.97 0.01 85)', text: stat.boosted ? 'oklch(0.42 0.17 145)' : INK };
  const result = chip(pixi, {
    ...look,
    value: String(stat.value),
    h,
    font: h * 0.85,
    iconSize: h * 0.65,
    ring: stat.boosted ? { css: 'oklch(0.6 0.17 145)', width: 1.5 } : { css: INK, width: 1 },
    padL: h * 0.19,
    padR: h * 0.23,
  });
  if (stat.spent) {
    result.node.alpha = 0.7;
    result.node.addChild(new pixi.Graphics().moveTo(h * 0.7, 0).lineTo(result.width - h * 0.2, 0).stroke({ width: 1, ...cssColor(INK) }));
  }
  return result;
}

/** Pastille de statut d'un jeton (14 px), comme `.token .status`. */
function statusChip(pixi: Pixi, status: StatusPill, h = S * 0.206): PixiContainer {
  const [fill, color] = STATUS_COLORS[status.kind];
  return chip(pixi, {
    icon: statusIcon(status.status),
    iconColor: color,
    value: status.text,
    text: color,
    fill,
    h,
    font: S * 0.13,
    iconSize: S * 0.13,
    ring: { css: 'white', width: 1.5 },
    padL: 2,
    padR: 2,
    minW: h,
  }).node;
}

/** Pastille des dégâts annoncés, centrée en (0, 0). */
function damagePill(pixi: Pixi, value: string): PixiContainer {
  const node = new pixi.Container();
  const label = text(pixi, value, S * 0.22, 'white');
  const [w, h] = [label.width + 14, label.height * 0.92 + 6];
  node.addChild(
    new pixi.Graphics().roundRect(-w / 2, -h / 2, w, h, 7).fill(cssColor(INK)).roundRect(-w / 2, -h / 2, w, h, 7).stroke({ width: 2, color: 0xffffff, alignment: 0 }),
    label,
  );
  return node;
}

/** Un élément debout d'une unité, posé sur un point du plan, à l'échelle du jeton. */
interface Standing {
  readonly key: string;
  readonly node: PixiContainer;
  /** Ce que bougent les animations d'action, autour de `pivotY` (le centre du cadre, ou du blason) ; son éclair. */
  readonly fx: PixiContainer;
  readonly pivotY: number;
  flash: ColorMatrixFilter | null;
  /** Le cadre qui grossit au survol (jetons) et le corps qui respire. */
  readonly frame: PixiContainer | null;
  readonly body: PixiContainer | null;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  /** Échelle propre (blason : 0,55 ou 0,34) et décalage à l'écran avant la caméra (px de jeton). */
  readonly scale: number;
  readonly offset: readonly [number, number];
  readonly bobDelay: number;
  /** Case de l'unité (« ligne,colonne »), pour le survol. */
  readonly cell: string;
  readonly glow: Graphics | null;
}

type Camera = Pick<IsoCamera, 'k' | 'width' | 'centerY' | 'standScale'>;
const STILL: { pose: Pose; at: Point | null } = { pose: REST, at: null };
/** Une animation finie est encore dessinée pendant ce temps (ms), pour que sa dernière pose soit à l'écran. */
const SETTLE = 50;

export class TokenLayer {
  private readonly ground: Graphics;
  private readonly shadows: PixiContainer;
  /** Lueurs des socles (animations permises), sous les socles. */
  private readonly glows: PixiContainer;
  private glowTexture: Texture | null = null;
  private readonly standing: Standing[] = [];
  private readonly arts = new Map<string, Texture | 'loading'>();
  private signature = '';
  private shadowTexture: Texture | null = null;
  private hovered: string | null = null;
  /** Grossissement de survol en cours, par case : départ et cible. */
  private readonly grow = new Map<string, { from: number; to: number; start: number }>();
  private last: { tokens: readonly TokenVisual[]; terrains: readonly TerrainVisual[]; glow: boolean } = { tokens: [], terrains: [], glow: false };
  /** Ombre au sol de chaque unité (par identifiant), pour la déplacer avec elle. */
  private readonly shadowOf = new Map<string, { sprite: Sprite; x: number; y: number; alpha: number }>();
  /** Animations d'action en cours, par unité (elles survivent aux redessins), et la pose qui en découle. */
  private readonly playing = new Map<string, Playing[]>();
  private readonly poses = new Map<string, { pose: Pose; at: Point | null }>();
  private view: { camera: Camera; plan: number } | null = null;

  constructor(
    private readonly pixi: Pixi,
    plane: PixiContainer,
    private readonly layer: PixiContainer,
    /** Une illustration vient d'arriver : il faut redessiner. */
    private readonly onChange: () => void,
  ) {
    this.shadows = new pixi.Container();
    this.glows = new pixi.Container();
    this.ground = new pixi.Graphics();
    plane.addChild(this.glows, this.shadows, this.ground);
  }

  /** Redessine les unités (seulement si quelque chose a changé) ; `glow` : lueur des socles (animations permises). */
  setUnits(tokens: readonly TokenVisual[], terrains: readonly TerrainVisual[], glow = false): void {
    const signature = JSON.stringify([tokens, terrains, glow, [...this.arts].filter(([, t]) => t !== 'loading').map(([id]) => id)]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.last = { tokens, terrains, glow };
    this.clear();
    // Une unité qui a quitté le plateau n'a plus d'animation.
    const present = new Set([...tokens, ...terrains].map((u) => u.id));
    for (const id of [...this.playing.keys()]) if (!present.has(id)) this.playing.delete(id);
    for (const id of [...this.poses.keys()]) if (!present.has(id)) this.poses.delete(id);
    const { pixi } = this;
    const g = this.ground;
    this.shadowTexture ??= painted(pixi, 64, 64, (ctx) => {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(0,0,0,0.5)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    });

    // Au sol : socles des terrains (et leur lueur), ombres, flèches d'orientation.
    if (glow) {
      // `.plaque__glow` : une ombre portée de 10 px de flou, élargie de 3 px, autour de la case, à la couleur du joueur.
      this.glowTexture ??= painted(pixi, S + 2 * GLOW_PAD, S + 2 * GLOW_PAD, (ctx) => {
        ctx.shadowColor = 'white';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.roundRect(GLOW_PAD - 3, GLOW_PAD - 3, S + 6, S + 6, 9);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.roundRect(GLOW_PAD, GLOW_PAD, S, S, 6);
        ctx.fill();
      });
      for (const t of terrains) {
        const sprite = new pixi.Sprite({ texture: this.glowTexture, x: t.x - GLOW_PAD, y: t.y - GLOW_PAD });
        sprite.tint = cssColor(player(t.owner)).color;
        this.glows.addChild(sprite);
      }
    }
    for (const t of terrains) {
      const [x, y] = [t.x + 3, t.y + 3];
      g.roundRect(x, y, S - 6, S - 6, 6).fill(cssColor('oklch(0.96 0.015 85)'));
      // Fines rayures à 45° de la plaque : 2 px tous les 7, à la couleur du joueur.
      hatch(g, x, y, S - 6, 7, 2, true, mix(player(t.owner), 12));
      g.roundRect(x, y, S - 6, S - 6, 6).stroke({ width: 3, ...cssColor(player(t.owner)), alignment: 1 });
      if (t.selected) g.roundRect(x, y, S - 6, S - 6, 6).stroke({ width: 3, ...cssColor(GOLD), alignment: 0 });
      if (!t.small) this.shadow(t.id, t.x + 34, t.y + 34, 'oklch(0.25 0.03 60 / 0.35)');
    }
    for (const t of tokens) {
      const [cx, cy] = [t.x, t.y];
      this.shadow(t.id, cx, cy, t.onTerrain ? 'oklch(0.25 0.03 60 / 0.35)' : null);
      // Flèche d'orientation au bord de la case, à la couleur du joueur (grise quand il a fini), cernée de crème.
      const [x0, y0] = [t.x - TOKEN_FOOT, t.y - TOKEN_FOOT];
      const a = S * 0.235;
      const tri = {
        up: [x0 + S / 2, y0 + 2, x0 + S / 2 + a / 2, y0 + 2 + a / 2, x0 + S / 2 - a / 2, y0 + 2 + a / 2],
        down: [x0 + S / 2, y0 + S - 2, x0 + S / 2 - a / 2, y0 + S - 2 - a / 2, x0 + S / 2 + a / 2, y0 + S - 2 - a / 2],
        left: [x0 + 2, y0 + S / 2, x0 + 2 + a / 2, y0 + S / 2 - a / 2, x0 + 2 + a / 2, y0 + S / 2 + a / 2],
        right: [x0 + S - 2, y0 + S / 2, x0 + S - 2 - a / 2, y0 + S / 2 + a / 2, x0 + S - 2 - a / 2, y0 + S / 2 - a / 2],
      }[t.facing];
      g.poly(tri).fill(cssColor(t.exhausted ? 'oklch(0.55 0.02 80)' : player(t.owner))).poly(tri).stroke({ width: 1, ...cssColor('oklch(0.97 0.02 85)') });
    }

    // Debout : blasons et jetons.
    for (const t of terrains) this.standing.push(this.crest(t));
    for (const t of tokens) this.standing.push(this.token(t));
    this.applyHover(true);
  }

  /** Case survolée (« ligne,colonne ») : son jeton grossit et passe devant, sauf sous la bulle (`anchor`). */
  setHover(cell: string | null): void {
    if (cell === this.hovered) return;
    this.hovered = cell;
    this.applyHover(false);
  }

  /** Place les unités à l'écran selon la caméra. */
  layout(camera: Camera, plan: number): void {
    this.view = { camera, plan };
    for (const item of this.standing) this.place(item);
  }

  /** Respiration des jetons, halo de la sélection et lueur des socles qui pulsent (à 30 images par seconde). */
  update(t: number): void {
    this.glows.alpha = glowPulse(t);
    for (const item of this.standing) {
      if (!item.body) continue;
      // `unitBob`, 1,8 s : 0, −4 px à 45 %, 0.
      const f = ((((t - item.bobDelay) / 1.8) % 1) + 1) % 1;
      item.body.y = -4 * easeBob(f < 0.45 ? f / 0.45 : 1 - (f - 0.45) / 0.55);
      if (item.glow) {
        const p = (((t / 1.6) % 1) + 1) % 1;
        item.glow.alpha = 0.55 + 0.4 * easeBob(p < 0.5 ? p * 2 : 2 - p * 2);
      }
    }
  }

  /** Grossissement de survol et animations d'action, à pleine cadence. Vrai s'il faut redessiner à l'image suivante. */
  step(now: number): boolean {
    let busy = false;
    for (const item of this.standing) {
      const g = this.grow.get(item.cell);
      if (!g || !item.frame) continue;
      // Ressort léger, comme `cubic-bezier(0.3, 1.5, 0.5, 1)` sur 0,2 s.
      const f = Math.min(1, (now - g.start) / 200);
      const spring = 1 + Math.sin(f * Math.PI) * 0.12 * (1 - f);
      item.frame.scale.set(g.from + (g.to - g.from) * Math.min(1, f * spring));
      if (f < 1) busy = true;
    }
    if (this.playing.size === 0 && this.poses.size === 0) return busy;
    this.poses.clear();
    for (const [id, list] of this.playing) {
      // Une animation finie s'arrête, sauf celles qui gardent leur pose (marche, mort) jusqu'à leur retrait.
      const kept = list.filter((p) => p.motion.hold || now - p.start < p.motion.duration + SETTLE);
      if (kept.length < list.length) busy = true;
      if (kept.length === 0) {
        this.playing.delete(id);
        continue;
      }
      this.playing.set(id, kept);
      this.poses.set(id, poseOf(kept, now));
      if (kept.some((p) => now - p.start < p.motion.duration + SETTLE)) busy = true;
    }
    for (const item of this.standing) this.place(item);
    return busy;
  }

  /** Une unité est dessinée (on peut l'animer). */
  has(unitId: string): boolean {
    return this.standing.some((item) => item.key === unitId);
  }

  /** Joue des animations sur une unité ; renvoie de quoi les retirer (une marche, une fois le jeton sur sa case). */
  play(unitId: string, motions: readonly Motion[]): () => void {
    const now = performance.now();
    const entries = motions.map((motion) => ({ motion, start: now }));
    this.playing.set(unitId, [...(this.playing.get(unitId) ?? []), ...entries]);
    this.step(now);
    return () => {
      const list = this.playing.get(unitId)?.filter((p) => !entries.includes(p)) ?? [];
      if (list.length > 0) this.playing.set(unitId, list);
      else this.playing.delete(unitId);
      this.step(performance.now());
    };
  }

  /** Les unités sous un point de l'écran (px de la scène), de la plus proche à la plus lointaine : leur case. */
  hit(camera: Pick<IsoCamera, 'k' | 'width' | 'centerY' | 'standScale'>, plan: number, sx: number, sy: number): string | null {
    let best: { cell: string; z: number } | null = null;
    for (const item of this.standing) {
      if (!item.frame) continue;
      // Le rond de la goutte et ses stats : une boîte de 46 × 66 px de jeton autour de la goutte.
      const local = item.node.toLocal({ x: sx, y: sy }, this.layer);
      if (Math.abs(local.x) <= 23 && local.y >= DROP_CY - 30 && local.y <= DROP_CY + 34 && (!best || item.node.zIndex > best.z)) {
        best = { cell: item.cell, z: item.node.zIndex };
      }
    }
    void camera;
    void plan;
    return best?.cell ?? null;
  }

  destroy(): void {
    this.clear();
    this.playing.clear();
    this.poses.clear();
    this.ground.destroy();
    this.shadows.destroy();
    this.glows.destroy();
    this.shadowTexture?.destroy(true);
    this.glowTexture?.destroy(true);
  }

  private clear(): void {
    this.ground.clear();
    for (const child of this.shadows.removeChildren()) child.destroy();
    for (const child of this.glows.removeChildren()) child.destroy();
    this.shadowOf.clear();
    for (const item of this.standing) {
      item.flash?.destroy();
      item.node.destroy({ children: true });
    }
    this.standing.length = 0;
  }

  /**
   * Place une unité à l'écran : sur sa case, ou là où l'emmène son animation (son ombre la suit ; plus proche de la
   * caméra, elle passe devant), son corps secoué, écrasé ou effacé.
   */
  private place(item: Standing): void {
    if (!this.view) return;
    const { camera, plan } = this.view;
    const { pose, at } = this.poses.get(item.key) ?? STILL;
    const [x, y] = [(at?.x ?? item.x) + pose.dx, (at?.y ?? item.y) + pose.dy];
    const su = camera.standScale * camera.k;
    const p = isoProject(camera, plan, x, y);
    item.node.position.set(p.x + item.offset[0] * su, p.y + item.offset[1] * su);
    item.node.scale.set(su * item.scale);
    item.node.zIndex = item.depth + isoDepth(x - item.x, y - item.y, 0) + (this.hovered === item.cell && item.frame ? 160 : 0);
    const { fx } = item;
    fx.position.set(pose.x, item.pivotY + pose.y);
    fx.scale.set(pose.sx, pose.sy);
    fx.angle = pose.rot;
    fx.alpha = pose.alpha;
    // Éclair d'un coup reçu : `brightness(2.6) saturate(.3)` qui revient à la normale.
    if (pose.flash > 0.001) {
      item.flash ??= new this.pixi.ColorMatrixFilter();
      item.flash.brightness(1 + pose.flash, false);
      item.flash.saturate((-0.7 * pose.flash) / 1.6, true);
      fx.filters = [item.flash];
    } else if (item.flash) fx.filters = null;
    const shadow = this.shadowOf.get(item.key);
    if (shadow) {
      shadow.sprite.position.set(shadow.x + x - item.x, shadow.y + y - item.y);
      shadow.sprite.alpha = shadow.alpha * pose.alpha;
    }
  }

  private shadow(key: string, cx: number, cy: number, tone: string | null): void {
    const sprite = new this.pixi.Sprite({ texture: this.shadowTexture!, anchor: 0.5, x: cx, y: cy, width: S * 0.56, height: S * 0.56 });
    if (tone) {
      const { color, alpha } = cssColor(tone);
      sprite.tint = color;
      sprite.alpha = alpha / 0.5;
    }
    this.shadows.addChild(sprite);
    this.shadowOf.set(key, { sprite, x: cx, y: cy, alpha: sprite.alpha });
  }

  private applyHover(immediate: boolean): void {
    const now = performance.now();
    for (const item of this.standing) {
      if (!item.frame) continue;
      const to = this.hovered === item.cell ? 1.4 : 1;
      const current = item.frame.scale.x;
      if (Math.abs(current - to) < 0.001 && !this.grow.has(item.cell)) continue;
      if (immediate) {
        item.frame.scale.set(to);
        this.grow.delete(item.cell);
      } else {
        this.grow.set(item.cell, { from: current, to, start: now });
      }
      item.node.zIndex = item.depth + (to > 1 ? 160 : 0);
    }
    this.onChange();
  }

  /** Illustration d'une carte : chargée à la demande ; `null` en attendant (puis on redessine). */
  private art(cardId: string): Texture | null {
    const known = this.arts.get(cardId);
    if (known && known !== 'loading') return known;
    if (!known) {
      const src = CARD_ART[cardId as keyof typeof CARD_ART]?.src;
      if (!src) return null;
      this.arts.set(cardId, 'loading');
      void this.pixi.Assets.load<Texture>(src).then(
        (texture) => {
          this.arts.set(cardId, texture);
          this.signature = '';
          this.setUnits(this.last.tokens, this.last.terrains, this.last.glow);
          this.onChange();
        },
        () => this.arts.delete(cardId),
      );
    }
    return null;
  }

  /** L'illustration d'une carte dans un rond de rayon `r` centré en (cx, cy), cadrée comme un jeton. */
  private artDisc(parent: PixiContainer, cardId: string, cx: number, cy: number, r: number, filter: boolean): PixiContainer | null {
    const image = CARD_ART[cardId as keyof typeof CARD_ART];
    const texture = this.art(cardId);
    if (!image || !texture) return null;
    const { pixi } = this;
    const fit = tokenFit(image);
    const d = 2 * r;
    const sprite = new pixi.Sprite({ texture, x: cx - r + fit.x * d, y: cy - r + fit.y * d, width: fit.size * d, height: fit.size * d * (image.h / image.w) });
    const mask = new pixi.Graphics().circle(cx, cy, r).fill(0xffffff);
    const holder = new pixi.Container();
    holder.addChild(sprite, mask);
    sprite.mask = mask;
    if (filter) {
      const gray = new pixi.ColorMatrixFilter();
      gray.desaturate();
      gray.brightness(0.75, true);
      sprite.filters = [gray];
    }
    parent.addChild(holder);
    return holder;
  }

  private token(t: TokenVisual): Standing {
    const { pixi } = this;
    const node = new pixi.Container();
    const fx = new pixi.Container();
    const body = new pixi.Container();
    const frame = new pixi.Container();
    fx.pivot.set(0, FRAME_CY);
    frame.pivot.set(0, FRAME_CY);
    frame.position.set(0, FRAME_CY);
    node.addChild(fx);
    fx.addChild(body);
    body.addChild(frame);
    const color = player(t.owner);

    // Cible sur le jeton : anneau large (encre ou lueur dorée), puis étroit (blanc ou doré) ; la goutte cache l'intérieur.
    if (t.target) {
      const card = t.target === 'card';
      frame.addChild(
        drop(new pixi.Graphics(), t.angle).stroke({ width: card ? 12.8 : 10, ...cssColor(card ? 'oklch(0.86 0.15 90 / 0.4)' : INK), join: 'round' }),
        drop(new pixi.Graphics(), t.angle).stroke({ width: 6, ...cssColor(card ? 'oklch(0.86 0.15 90)' : 'white'), join: 'round' }),
      );
    }
    // Sélection : halo flou qui pulse, liseré doré.
    let glow: Graphics | null = null;
    if (t.selected) {
      glow = drop(new pixi.Graphics(), t.angle).stroke({ width: 12, ...cssColor(GOLD), join: 'round' });
      glow.filters = [new pixi.BlurFilter({ strength: 4, quality: 2 })];
      frame.addChild(glow, drop(new pixi.Graphics(), t.angle).fill(cssColor('oklch(0.88 0.15 88 / 0.9)')).stroke({ width: 6, ...cssColor('oklch(0.88 0.15 88 / 0.9)'), join: 'round' }));
    }
    // Ombre portée, puis la goutte : trait sombre dessous (sa moitié extérieure se voit), couleur du joueur dessus.
    frame.addChild(drop(new pixi.Graphics(), t.angle, 0, DROP_CY + 2).fill({ color: 0, alpha: 0.28 }));
    const rim = drop(new pixi.Graphics(), t.angle).stroke({ width: 3.2, ...cssColor(t.hidden ? 'white' : DARK), join: 'round' });
    drop(rim, t.angle).fill({ ...cssColor(color), alpha: t.hidden ? 0.55 : 1 });
    frame.addChild(rim);
    // Illustration dans le rond (ternie quand il a fini) ; liseré blanc pour J2 ; nom court sans illustration.
    const art = this.artDisc(frame, t.cardId, 0, DROP_CY, DROP_R - 1.5, t.exhausted);
    if (art) {
      if (t.hidden) art.alpha = 0.55;
    } else {
      // Sans illustration : rayures à 135° de 7 px (`.art`), sombre et couleur du joueur.
      const r = DROP_R - 1.5;
      const disc = new pixi.Graphics().circle(0, DROP_CY, r).fill(cssColor(t.owner === 1 ? 'oklch(0.4 0.11 255)' : 'oklch(0.4 0.13 25)'));
      const stripes = new pixi.Graphics();
      const [u, v] = [Math.SQRT1_2, Math.SQRT1_2];
      for (let d = -2 * r + 7; d < 2 * r; d += 14) {
        const at = (s: number, l: number): [number, number] => [u * s + v * l, DROP_CY + v * s - u * l];
        stripes.poly([...at(d, 2 * r), ...at(d + 7, 2 * r), ...at(d + 7, -2 * r), ...at(d, -2 * r)]);
      }
      stripes.fill(cssColor(color));
      const mask = new pixi.Graphics().circle(0, DROP_CY, r).fill(0xffffff);
      stripes.mask = mask;
      frame.addChild(disc, stripes, mask);
      const label = text(pixi, t.label, 7.6, 'white');
      label.position.set(0, DROP_CY);
      frame.addChild(label);
    }
    if (t.owner === 2) frame.addChild(new pixi.Graphics().circle(0, DROP_CY, DROP_R - 1.5).stroke({ width: 1.5, ...cssColor('oklch(0.98 0.01 85)'), alignment: 1 }));

    // Statuts à gauche de la goutte, en colonne.
    t.statuses.forEach((status, i) => {
      const chipNode = statusChip(pixi, status);
      chipNode.position.set(-35, DROP_CY - 20 + 11.16 + 7 + i * 16);
      frame.addChild(chipNode);
    });
    // Stats sous la goutte (au-dessus si la pointe descend), en petit arc.
    if (t.stats.length > 0) {
      const chips = t.stats.map((stat) => statChip(pixi, stat));
      const total = chips.reduce((w, c) => w + c.width, 0) + 1.5 * (chips.length - 1);
      const h = S * 0.191;
      const rowY = t.statsAbove ? DROP_CY - 20 + 6 - h / 2 : DROP_CY - 20 + 33 + h / 2;
      let x = -total / 2;
      chips.forEach((c, i) => {
        const arcShift = t.arc && t.stats[i]?.kind === 'hp' ? h * 0.3 * (t.statsAbove ? -1 : 1) : 0;
        c.node.position.set(x, rowY + arcShift);
        frame.addChild(c.node);
        x += c.width + 1.5;
      });
    }
    // Dégâts annoncés au-dessus du jeton (plus haut quand les stats y sont).
    if (t.damage) {
      const pill = damagePill(pixi, t.damage);
      pill.position.set(0, DROP_CY - 20 - S * (t.statsAbove ? 0.56 : 0.32) + 11);
      frame.addChild(pill);
    }
    this.layer.addChild(node);
    const cell = `${t.pos.row},${t.pos.col}`;
    return { key: t.id, node, fx, pivotY: FRAME_CY, flash: null, frame, body, x: t.x, y: t.y, depth: t.depth, scale: 1, offset: [0, 0], bobDelay: t.bobDelay, cell, glow };
  }

  private crest(t: TerrainVisual): Standing {
    const { pixi } = this;
    const node = new pixi.Container();
    const fx = new pixi.Container();
    node.addChild(fx);
    const color = player(t.owner);
    const h = 27.2;
    const shield = (inset: number, bottom = inset) => [
      -h + inset, -h + inset,
      h - inset, -h + inset,
      h - inset, -h + inset + (2 * h - inset - bottom) * 0.6,
      0, h - bottom,
      -h + inset, -h + inset + (2 * h - inset - bottom) * 0.6,
    ];
    if (t.target) {
      fx.addChild(new pixi.Graphics().roundRect(-h - 6, -h - 6, 2 * h + 12, 2 * h + 12, 12).stroke({ width: 3, ...cssColor('oklch(0.86 0.15 90)') }));
    }
    fx.addChild(new pixi.Graphics().poly(shield(0)).fill({ color: 0, alpha: 0.3 }));
    fx.children.at(-1)!.position.set(0, 3);
    fx.addChild(new pixi.Graphics().poly(shield(0)).fill(cssColor(color)));
    const face = new pixi.Graphics().poly(shield(4, 5)).fill(cssColor('oklch(0.96 0.015 85)'));
    fx.addChild(face);
    const image = CARD_ART[t.cardId as keyof typeof CARD_ART];
    const texture = image ? this.art(t.cardId) : null;
    if (image && texture) {
      const fit = tokenFit(image);
      const w = 2 * (h - 4);
      const sprite = new pixi.Sprite({ texture, x: -h + 4 + fit.x * w, y: -h + 4 + fit.y * w, width: fit.size * w, height: fit.size * w * (image.h / image.w) });
      const mask = new pixi.Graphics().poly(shield(4, 5)).fill(0xffffff);
      fx.addChild(sprite, mask);
      sprite.mask = mask;
    } else if (!image) {
      const castle = icon(pixi, 'castle', 26, '#2b241d');
      castle.position.set(0, -h + 4 + 7 + 13);
      fx.addChild(castle);
    }
    if (!t.small) {
      const hp = chip(pixi, {
        icon: 'hearts',
        iconColor: 'oklch(0.55 0.2 25)',
        value: String(t.hp),
        text: t.hurt ? 'oklch(0.48 0.2 25)' : INK,
        fill: PAPER,
        h: S * 0.265,
        font: S * 0.22,
        iconSize: S * 0.16,
        ring: { css: INK, width: 1.5 },
        padL: S * 0.044,
        padR: S * 0.06,
      });
      hp.node.position.set(-hp.width / 2, -h + 44.4 + (S * 0.265) / 2);
      fx.addChild(hp.node);
    }
    t.statuses.forEach((status, i) => {
      const chipNode = statusChip(pixi, status, S * 0.206);
      chipNode.position.set(-h - 1.4 + i * 16, -h - 1.4 + 7);
      fx.addChild(chipNode);
    });
    this.layer.addChild(node);
    // Seul : au centre de la case, relevé de 16 px ; sous un monstre : à droite de la goutte, à mi-hauteur.
    const base = { key: t.id, node, fx, pivotY: 0, flash: null, frame: null, body: null, depth: t.depth, bobDelay: 0, cell: `${t.pos.row},${t.pos.col}`, glow: null };
    return t.small
      ? { ...base, x: t.x + TOKEN_FOOT, y: t.y + TOKEN_FOOT, scale: 0.34, offset: [30, -30] }
      : { ...base, x: t.x + 34, y: t.y + 34, scale: 0.55, offset: [0, -16] };
  }
}
