// Dessin des cases du plateau PixiJS (migration, sous-étape 3b), d'après `cellVisuals` : dans le plan isométrique, comme
// les cases en CSS (fond et trait du plateau peint, mana zones, cases d'invocation, zones de contestation, lueur qui
// pulse, atténuation, effets, cibles, pièges, cadres d'attaque, marques des « Passage », et les zones du handoff
// « zones » : halos d'aller et d'attaque, anneau de survol, points du chemin, voile et contour du danger) ; à l'écran,
// droits et à taille fixe comme les « textes au sol » du CSS (contre-rotation, `--qz`) : J1/J2, dégâts annoncés, noms
// des pièges, icônes des marques ; et debout devant, le nom des mana zones.
import type { Container as PixiContainer, Graphics, Sprite, Texture } from 'pixi.js';
import type { IconName } from '../Icon';
import { ICON_PATHS, MDI_PATHS } from '../iconPaths';
import type { IsoCamera } from '../iso/scenery';
import { diceLayout } from '../zoneMarks';
import { CELL_COLORS, CELL_SIZE } from './cellModel';
import { ISO } from '../iso/scenery';
import type { CellVisual, ManaZoneVisual } from './cellModel';
import { painted } from './groundFx';
import type { Pixi } from './groundFx';
import { isoDepth, isoProject } from './isoProjection';

/**
 * Zones (handoff « zones ») : couleurs des halos, du survol et du danger. Accentuées puis contrastées (demandes du
 * 2026-11-08, on ne voyait pas assez sur l'herbe) : voile de la couleur à 20 %, halo dense, et au bord de la case un
 * filet sombre puis un liseré de 3 px de la couleur ; danger : filet sombre au bord, trait violet de 3 px, voile à 20 %.
 */
const ZONE = {
  move: { halo: 'rgb(80, 225, 255)', fill: 'rgba(80, 225, 255, 0.2)', edge: 'rgb(110, 235, 255)', veil: 'rgba(80, 225, 255, 0.42)', ring: 'rgb(220, 250, 255)' },
  attack: { halo: 'rgb(255, 145, 30)', fill: 'rgba(255, 145, 30, 0.2)', edge: 'rgb(255, 170, 60)', veil: 'rgba(255, 145, 30, 0.42)', ring: 'rgb(255, 225, 175)' },
  /** Monstre ennemi visible à portée d'attaque : rouge vif (validé le 2026-11-08). */
  target: { halo: 'rgb(255, 40, 40)', fill: 'rgba(255, 40, 40, 0.3)', edge: 'rgb(255, 70, 70)', veil: 'rgba(255, 40, 40, 0.45)', ring: 'rgb(255, 205, 205)' },
  /** Voile d'une case de zone sur une mana zone : doré, comme les mana zones. */
  manaFill: 'rgba(255, 205, 60, 0.32)',
  /** Filet sombre au bord des zones : il détache la couleur du sol. */
  ink: 'rgba(8, 14, 24, 0.8)',
  dangerLine: 'rgb(205, 120, 255)',
  dangerVeil: 'rgba(190, 100, 255, 0.2)',
} as const;

/** Halo intérieur d'une case (`box-shadow: inset 0 0 14px`), en blanc, à teinter : case de 68 px, rayon 6, deux fois plus fine. */
const HALO_RES = 2;
function haloTexture(pixi: Pixi): Texture {
  return painted(pixi, S * HALO_RES, S * HALO_RES, (ctx) => {
    ctx.scale(HALO_RES, HALO_RES);
    ctx.beginPath();
    ctx.roundRect(0, 0, S, S, 6);
    ctx.clip();
    // Un cadre autour de la case, hors du découpage : seule son ombre floue entre dans la case (le flou du canvas ne
    // suit pas l'échelle, d'où × HALO_RES).
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 14 * HALO_RES;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.rect(-S, -S, 3 * S, 3 * S);
    ctx.roundRect(0, 0, S, S, 6);
    // Deux passes : un halo plus dense que le seul `inset 0 0 14px`.
    ctx.fill('evenodd');
    ctx.fill('evenodd');
  });
}

/** Point du chemin : `radial-gradient(circle, #fff 0 3px, rgba(120,205,255,.95) 3.5px 5.5px, rgba(10,20,40,.45) 6px 7.5px, transparent 8px)`. */
function dotTexture(pixi: Pixi): Texture {
  const r = 8 * HALO_RES;
  return painted(pixi, 2 * r, 2 * r, (ctx) => {
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    const stop = (px: number, color: string) => gradient.addColorStop(px / 8, color);
    stop(0, '#fff');
    stop(3, '#fff');
    stop(3.5, 'rgba(120, 205, 255, 0.95)');
    stop(5.5, 'rgba(120, 205, 255, 0.95)');
    stop(6, 'rgba(10, 20, 40, 0.45)');
    stop(7.5, 'rgba(10, 20, 40, 0.45)');
    stop(8, 'rgba(10, 20, 40, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2 * r, 2 * r);
  });
}

/** Échelle à l'écran des textes au sol et des noms de zones (`--qz` × k du CSS). */
const TEXT_SCALE = 0.92;
const S = CELL_SIZE;
const R = 7;

/** Couleur CSS (oklch, color-mix…) en teinte et opacité PixiJS, lue sur un pixel ; mise en cache. */
const colorCache = new Map<string, { color: number; alpha: number }>();
export function cssColor(css: string): { color: number; alpha: number } {
  const known = colorCache.get(css);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const value = { color: (r! << 16) | (g! << 8) | b!, alpha: a! / 255 };
  colorCache.set(css, value);
  return value;
}

export const mix = (css: string, percent: number, other = 'transparent') => `color-mix(in oklch, ${css} ${percent}%, ${other})`;

/** Traits parallèles dans le carré (x, y, `size`) : lignes x − y = k (`down`) ou x + y = k, espacées de `period`. */
export function hatch(g: Graphics, x: number, y: number, size: number, period: number, width: number, down: boolean, css: string): void {
  const step = period * Math.SQRT2;
  for (let k = down ? -size + step / 2 : step / 2; k < (down ? size : 2 * size); k += step) {
    // Sur la droite, y va de y0 à y1 en restant dans le carré ; x s'en déduit.
    const [y0, y1] = down ? [Math.max(0, -k), Math.min(size, size - k)] : [Math.max(0, k - size), Math.min(size, k)];
    const at = (yy: number) => (down ? yy + k : k - yy);
    g.moveTo(x + at(y0), y + y0).lineTo(x + at(y1), y + y1);
  }
  g.stroke({ width, ...cssColor(css) });
}

/** Pointillés le long d'un rectangle (bords droits, coins arrondis sautés). */
function dashedRect(g: Graphics, x: number, y: number, w: number, h: number, dash: number, gap: number, width: number, css: string): void {
  const { color, alpha } = cssColor(css);
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    for (let d = 0; d < length; d += dash + gap) {
      const e = Math.min(length, d + dash);
      g.moveTo(x0 + ((x1 - x0) * d) / length, y0 + ((y1 - y0) * d) / length).lineTo(x0 + ((x1 - x0) * e) / length, y0 + ((y1 - y0) * e) / length);
    }
  };
  const r = 5;
  edge(x + r, y, x + w - r, y);
  edge(x + w, y + r, x + w, y + h - r);
  edge(x + w - r, y + h, x + r, y + h);
  edge(x, y + h - r, x, y + r);
  g.stroke({ width, color, alpha });
}

/** Cercle en pointillés. */
function dashedCircle(g: Graphics, cx: number, cy: number, radius: number, dash: number, gap: number, width: number, css: string): void {
  const { color, alpha } = cssColor(css);
  const turn = 2 * Math.PI * radius;
  const n = Math.max(6, Math.round(turn / (dash + gap)));
  const da = (2 * Math.PI) / n;
  const on = da * (dash / (dash + gap));
  for (let i = 0; i < n; i++) {
    const a0 = i * da;
    g.moveTo(cx + radius * Math.cos(a0), cy + radius * Math.sin(a0)).arc(cx, cy, radius, a0, a0 + on);
  }
  g.stroke({ width, color, alpha });
}

/** Rectangle arrondi plein, puis son trait intérieur (le `box-shadow: inset` du CSS). */
function cellRect(g: Graphics, x: number, y: number, inset: number, radius: number, fill: string | null, edge?: { css: string; width: number }): void {
  const size = S - 2 * inset;
  if (fill) {
    const { color, alpha } = cssColor(fill);
    g.roundRect(x + inset, y + inset, size, size, radius).fill({ color, alpha });
  }
  if (edge) {
    const { color, alpha } = cssColor(edge.css);
    g.roundRect(x + inset, y + inset, size, size, radius).stroke({ width: edge.width, color, alpha, alignment: 1 });
  }
}

/** Texture d'une icône (tracé de 512 × 512 ou Material de 24 × 24), blanche, à teinter. */
const iconTextures = new Map<string, Texture>();
export function iconTexture(pixi: Pixi, name: IconName): Texture {
  const known = iconTextures.get(name);
  if (known) return known;
  const mdi = (MDI_PATHS as Record<string, string>)[name];
  const path = mdi ?? (ICON_PATHS as Record<string, string>)[name] ?? '';
  const texture = painted(pixi, 96, 96, (ctx) => {
    ctx.scale(96 / (mdi ? 24 : 512), 96 / (mdi ? 24 : 512));
    ctx.fillStyle = 'white';
    ctx.fill(new Path2D(path));
  });
  iconTextures.set(name, texture);
  return texture;
}

/** Une pastille de texte, centrée en (0, 0) : fond, anneau, texte (taille à l'écran). */
function pill(
  pixi: Pixi,
  text: string,
  o: {
    fontSize: number;
    family: 'sc' | 'plain';
    fill: string;
    color: string;
    ring?: { css: string; width: number };
    padX: number;
    padY: number;
    radius: number;
    /** Rond de ce diamètre (numéros du chemin), au lieu d'une pastille ajustée au texte. */
    circle?: number;
  },
): PixiContainer {
  const node = new pixi.Container();
  const label = new pixi.Text({
    text,
    resolution: Math.min(2, window.devicePixelRatio || 1) * 1.5,
    style: {
      fontFamily: o.family === 'sc' ? ['Alegreya Sans SC', 'Alegreya Sans', 'sans-serif'] : ['Alegreya Sans', 'sans-serif'],
      fontWeight: '800',
      fontSize: o.fontSize,
      fill: cssColor(o.color).color,
      letterSpacing: o.family === 'sc' ? o.fontSize * 0.03 : 0,
    },
  });
  label.anchor.set(0.5);
  const back = new pixi.Graphics();
  if (o.circle) {
    back.circle(0, 0, o.circle / 2).fill(cssColor(o.fill));
  } else {
    const w = label.width + 2 * o.padX;
    const h = label.height * 0.92 + 2 * o.padY;
    back.roundRect(-w / 2, -h / 2, w, h, o.radius).fill(cssColor(o.fill));
    if (o.ring) back.roundRect(-w / 2, -h / 2, w, h, o.radius).stroke({ ...cssColor(o.ring.css), width: o.ring.width, alignment: 0 });
  }
  node.addChild(back, label);
  return node;
}

/** Profondeur des noms de zone : devant tout le décor debout, comme une étiquette posée sur l'image. */
const ZONE_TAG_DEPTH = 100_000;

/** Disque flou, blanc au centre et transparent au bord (`edge` : où l'opacité tombe à 0), à teinter. */
function radialTexture(pixi: Pixi, edge: number): Texture {
  return painted(pixi, 128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(edge * 0.6, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(edge, 'rgba(255,255,255,0.25)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Le nom d'une mana zone (taille fixe à l'écran) : icône, nom, puis « +1 VP », « J1 », « J2 » ou « Contestée ». */
function zoneTag(pixi: Pixi, zone: ManaZoneVisual): PixiContainer {
  const s = TEXT_SCALE;
  const node = new pixi.Container();
  const resolution = Math.min(2, window.devicePixelRatio || 1) * 1.5;
  const text = (value: string, size: number, color: string, sc: boolean) =>
    new pixi.Text({
      text: value,
      resolution,
      style: {
        fontFamily: sc ? ['Alegreya Sans SC', 'Alegreya Sans', 'sans-serif'] : ['Alegreya Sans', 'sans-serif'],
        fontWeight: '800',
        fontSize: size,
        fill: cssColor(color).color,
        letterSpacing: sc ? size * 0.05 : 0,
      },
    });
  const light = mix(zone.color, 55, 'white');
  const name = text(zone.name, 12.5 * s, CELL_COLORS.paper, true);
  const holder = text(zone.holder, 11.5 * s, light, false);
  const icon = new pixi.Sprite({ texture: iconTexture(pixi, zone.icon), anchor: 0.5, width: 13 * s, height: 13 * s, tint: cssColor(light).color });
  const [padX, gap, h] = [8 * s, 6 * s, 22 * s];
  const w = padX + icon.width + gap + name.width + gap + 1 + gap + holder.width + padX;
  const back = new pixi.Graphics();
  back.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: cssColor('oklch(0.17 0.012 60)').color, alpha: 0.9 });
  back.roundRect(-w / 2, -h / 2, w, h, h / 2).stroke({ ...cssColor(mix(zone.color, 75)), width: 1, alignment: 0 });
  let x = -w / 2 + padX;
  icon.position.set(x + icon.width / 2, 0);
  x += icon.width + gap;
  name.anchor.set(0, 0.5);
  name.position.set(x, -0.5);
  x += name.width + gap;
  const separator = new pixi.Graphics().rect(x, -h * 0.25, 1, h * 0.5).fill({ ...cssColor(mix(zone.color, 40)) });
  x += 1 + gap;
  holder.anchor.set(0, 0.5);
  holder.position.set(x, -0.5);
  node.addChild(back, icon, name, separator, holder);
  return node;
}

/** Un élément à l'écran, posé sur un point du plan. */
interface Placed {
  readonly node: PixiContainer;
  readonly x: number;
  readonly y: number;
  /** Debout devant les sprites voisins (nom de zone) : avancée vers la caméra ; sinon au sol. */
  readonly dz: number | null;
  /** Taille qui suit le plateau (icônes des marques) plutôt que fixe à l'écran. */
  readonly scaled: boolean;
}

/**
 * Où dessiner, comme l'empilement d'une case en HTML : `cells` (plan) pour les fonds, zones et marques ; `textsUnder`
 * (écran) pour « J1 » et les icônes des marques, que la pénombre couvre ; `over` (plan) pour la pénombre et les
 * surbrillances ; `texts` (écran) pour ce qui est au-dessus (chemin, dégâts, pièges) ; `standing` pour les noms des zones.
 */
export interface CellLayers {
  readonly cells: PixiContainer;
  readonly textsUnder: PixiContainer;
  readonly over: PixiContainer;
  readonly texts: PixiContainer;
  readonly standing: PixiContainer;
}

export class CellLayer {
  /** Fonds, zones de contestation et marques ; puis la zone contestée qui pulse, la lueur, et les surbrillances. */
  private readonly ground: Graphics;
  private readonly pulsing: Graphics;
  private readonly glowLayer: PixiContainer;
  private readonly overlays: Graphics;
  /** Zones, de bas en haut : voile du danger, halos, anneau de survol, contour du danger, points du chemin. */
  private readonly dangerVeil: Graphics;
  private readonly halos: PixiContainer;
  private readonly hoverRing: Graphics;
  private readonly dangerLine: Graphics;
  private readonly dots: PixiContainer;
  private zoneTextures: { halo: Texture; dot: Texture } | null = null;
  private readonly glows: Sprite[] = [];
  private readonly placed: Placed[] = [];
  private manaTextures: { halo: Texture; well: Texture } | null = null;
  /** Lueurs des mana zones sans animation : elles ne respirent pas. */
  private readonly still: Sprite[] = [];
  /** Opacité de repos de chaque lueur qui respire. */
  private readonly glowBase: number[] = [];

  constructor(
    private readonly pixi: Pixi,
    private readonly layers: CellLayers,
  ) {
    this.ground = new pixi.Graphics();
    this.pulsing = new pixi.Graphics();
    this.glowLayer = new pixi.Container();
    this.overlays = new pixi.Graphics();
    this.dangerVeil = new pixi.Graphics();
    this.halos = new pixi.Container();
    this.hoverRing = new pixi.Graphics();
    this.dangerLine = new pixi.Graphics();
    this.dots = new pixi.Container();
    layers.cells.addChild(this.ground, this.pulsing, this.glowLayer);
    layers.over.addChild(this.overlays, this.dangerVeil, this.halos, this.hoverRing, this.dangerLine, this.dots);
  }

  /** Redessine toutes les cases. */
  setCells(cells: readonly CellVisual[]): void {
    const { pixi } = this;
    const g = this.ground;
    const o = this.overlays;
    g.clear();
    o.clear();
    this.pulsing.clear();
    this.dangerVeil.clear();
    this.hoverRing.clear();
    this.dangerLine.clear();
    for (const child of this.halos.removeChildren()) child.destroy();
    for (const child of this.dots.removeChildren()) child.destroy();
    for (const sprite of [...this.glows, ...this.still]) sprite.destroy();
    this.glows.length = 0;
    this.glowBase.length = 0;
    this.still.length = 0;
    for (const item of this.placed) item.node.destroy({ children: true });
    this.placed.length = 0;
    const { layers } = this;
    const place = (node: PixiContainer, x: number, y: number, o: { dz?: number; scaled?: boolean; under?: boolean } = {}) => {
      (o.dz !== undefined ? layers.standing : o.under ? layers.textsUnder : layers.texts).addChild(node);
      this.placed.push({ node, x, y, dz: o.dz ?? null, scaled: o.scaled ?? false });
    };

    // Fonds et traits (plateau peint).
    for (const v of cells) {
      if (v.base === 'water' || v.base === 'bare') continue;
      if (v.base === 'blocked') {
        cellRect(g, v.x, v.y, 0, R, 'oklch(0.34 0.04 150 / 0.36)', { css: 'oklch(0.28 0.04 165 / 0.32)', width: 1 });
        continue;
      }
      const fill = {
        plain: 'oklch(0.25 0.04 165 / 0.03)',
        odd: 'oklch(1 0 0 / 0.035)',
        mana: 'oklch(0.25 0.04 165 / 0.03)',
        summon1: 'oklch(0.56 0.15 255 / 0.42)',
        summon2: 'oklch(0.56 0.18 25 / 0.42)',
      }[v.base];
      cellRect(g, v.x, v.y, 0, R, fill, v.edge ? { css: v.edge.color, width: v.edge.width } : { css: 'oklch(0.28 0.04 165 / 0.2)', width: 1 });
    }

    // Mana zones (refonte du 2026-11-11). Au repos : une lueur dans le carré de la zone, la case centrale éclairée (elles
    // respirent si les animations sont permises) et l'icône de la zone au centre. La souris sur la zone : un trait fin au
    // bord, les quatre coins, un cercle fin autour de la case centrale.
    const textures = (this.manaTextures ??= { halo: radialTexture(pixi, 0.85), well: radialTexture(pixi, 0.9) });
    for (const v of cells) {
      const z = v.manaZone;
      if (!z) continue;
      const pad = z.size > S ? 10 : 6;
      const halo = new pixi.Sprite({ texture: textures.halo, x: z.x - pad, y: z.y - pad, width: z.size + 2 * pad, height: z.size + 2 * pad, tint: cssColor(z.color).color });
      halo.alpha = z.look === 'neutral' ? 0.7 : 0.85;
      const well = new pixi.Sprite({ texture: textures.well, x: v.x - 6, y: v.y - 6, width: S + 12, height: S + 12, tint: cssColor(mix(z.color, 55, 'white')).color });
      well.alpha = 0.8;
      this.glowLayer.addChild(halo, well);
      if (z.pulse) {
        this.glows.push(halo, well);
        this.glowBase.push(halo.alpha, well.alpha);
      } else this.still.push(halo, well);
      // L'icône de la zone, redressée dans une pastille sombre, sauf sous les marques d'un « Passage » ou d'une case brûlée.
      if (v.marks.length === 0) {
        const r = S * 0.27;
        const badge = new pixi.Container();
        const disc = new pixi.Graphics()
          .circle(0, 0, r)
          .fill({ color: cssColor('oklch(0.17 0.012 60)').color, alpha: 0.7 })
          .circle(0, 0, r)
          .stroke({ width: 1.5, ...cssColor(mix(z.color, 85)), alignment: 1 });
        const icon = new pixi.Sprite({ texture: iconTexture(pixi, z.icon), anchor: 0.5, width: r * 1.3, height: r * 1.3 });
        icon.tint = cssColor(mix(z.color, 45, 'white')).color;
        badge.addChild(disc, icon);
        place(badge, v.x + S / 2, v.y + S / 2, { scaled: true, under: true });
      }
      if (!z.hovered) continue;
      const light = cssColor(mix(z.color, 55, 'white'));
      // Le bord passe au milieu de l'espace entre les cases.
      const [x0, y0, size] = z.size > S ? [z.x - 2, z.y - 2, z.size + 4] : [z.x, z.y, z.size];
      g.rect(x0, y0, size, size).stroke({ width: 1.6, color: light.color, alpha: 0.9 });
      const arm = size * 0.2;
      for (const [cx, cy, dx, dy] of [
        [x0, y0, 1, 1],
        [x0 + size, y0, -1, 1],
        [x0 + size, y0 + size, -1, -1],
        [x0, y0 + size, 1, -1],
      ] as const) {
        g.moveTo(cx + dx * arm, cy).lineTo(cx, cy).lineTo(cx, cy + dy * arm).stroke({ width: 4.5, color: light.color, alpha: 1, cap: 'round', join: 'round' });
      }
      g.roundRect(v.x + 3, v.y + 3, S - 6, S - 6, 6).stroke({ width: 1.8, color: light.color, alpha: 0.9 });
    }

    // Marques des « Passage » et cases brûlées : cercle au sol (pointillés, ou plein de braise), icône redressée.
    for (const v of cells) {
      const spots = diceLayout(v.marks.length);
      v.marks.forEach((mark, i) => {
        const spot = spots[i]!;
        const [cx, cy, r] = [v.x + (spot.x / 100) * S, v.y + (spot.y / 100) * S, ((spot.size / 100) * S) / 2];
        const player = mark.owner === 1 ? CELL_COLORS.j1 : CELL_COLORS.j2;
        if (mark.burning) {
          g.circle(cx, cy, r).fill(cssColor('oklch(0.7 0.19 50 / 0.68)')).circle(cx, cy, r).stroke({ width: 2, ...cssColor(mix(mix(player, 55, 'white'), 85)) });
        } else {
          g.circle(cx, cy, r).fill(cssColor(mix(player, 42)));
          dashedCircle(g, cx, cy, r - 1, 4, 3, 2, mix(mix(player, 55, 'white'), 85));
        }
        const icon = new pixi.Sprite({ texture: iconTexture(pixi, mark.icon), anchor: 0.5 });
        const face = mark.burning ? 'oklch(0.97 0.08 85 / 0.9)' : mix(mix(player, 45, 'white'), 78);
        icon.tint = cssColor(face).color;
        icon.alpha = cssColor(face).alpha;
        const size = 2 * r * 0.72;
        icon.width = icon.height = size;
        const node = new pixi.Container();
        node.addChild(icon);
        if (mark.label) {
          const label = new pixi.Text({ text: mark.label, style: { fontFamily: ['Alegreya Sans', 'sans-serif'], fontWeight: '800', fontSize: S * 0.22, fill: cssColor(mix(player, 70, 'black')).color } });
          label.anchor.set(0.5, 0.58);
          node.addChild(label);
        }
        place(node, cx, cy, { scaled: true, under: true });
      });
    }

    // Atténuation des cases qui ne sont pas des cibles.
    for (const v of cells) if (v.dim) cellRect(o, v.x, v.y, 0, R, 'oklch(0.18 0.012 60 / 0.42)');

    // Effets, cibles.
    for (const v of cells) {
      const [cx, cy] = [v.x + S / 2, v.y + S / 2];
      if (v.effect) {
        cellRect(o, v.x, v.y, 3, R, 'oklch(0.62 0.15 300 / 0.35)');
        dashedRect(o, v.x + 4.5, v.y + 4.5, S - 9, S - 9, 7, 4, 3, CELL_COLORS.effect);
        const d = S * 0.1 * Math.SQRT2;
        o.poly([cx, cy - d, cx + d, cy, cx, cy + d, cx - d, cy]).fill(cssColor('oklch(0.48 0.17 300)'));
      }
      if (v.target) {
        cellRect(o, v.x, v.y, 3, R, 'oklch(0.92 0.11 92 / 0.7)', { css: CELL_COLORS.cardTarget, width: 3 });
        // Le « + » du CSS (texte de 0,44 case, posé un peu au-dessus du centre par la ligne de texte).
        const [arm, thick, up] = [S * 0.1, S * 0.03, S * 0.06];
        o.rect(cx - arm - up, cy - thick - up, 2 * arm, 2 * thick).rect(cx - thick - up, cy - arm - up, 2 * thick, 2 * arm).fill(cssColor('oklch(0.42 0.1 70)'));
      }
    }

    this.drawZones(cells);

    // Cases d'aller : la mobilité que coûte d'y aller, à plat au centre ; pleine sur le chemin et la case survolée.
    for (const v of cells) {
      if (v.moveCost === null) continue;
      const s = TEXT_SCALE;
      const lit = v.step || v.hover;
      const chip = pill(pixi, String(v.moveCost), {
        fontSize: S * (lit ? 0.24 : 0.2) * s,
        family: 'plain',
        fill: lit ? ZONE.move.edge : ZONE.ink,
        color: lit ? ZONE.ink : ZONE.move.ring,
        padX: 0,
        padY: 0,
        radius: 0,
        circle: S * (lit ? 0.34 : 0.28) * s,
      });
      if (!lit) chip.alpha = 0.85;
      place(chip, v.x + S / 2, v.y + S / 2);
    }

    // Pièges (les siens) : cercle en pointillés, nom au sol.
    for (const v of cells) {
      if (!v.trap) continue;
      const [cx, cy] = [v.x + S / 2, v.y + S / 2];
      o.circle(cx, cy, S * 0.34).fill(cssColor('oklch(0.2 0.014 60 / 0.45)'));
      dashedCircle(o, cx, cy, S * 0.34 - 1, 5, 4, 2, 'oklch(0.95 0.03 95)');
      place(pill(pixi, v.trap, { fontSize: S * 0.16 * TEXT_SCALE, family: 'sc', fill: 'transparent', color: CELL_COLORS.paper, padX: 0, padY: 0, radius: 0 }), cx, cy);
    }

    // Attaque sur un terrain seul : cadre blanc cerné, dégâts annoncés.
    for (const v of cells) {
      if (!v.attack) continue;
      const ink = cssColor(CELL_COLORS.ink);
      o.roundRect(v.x + 2, v.y + 2, S - 4, S - 4, 10).stroke({ width: 2, ...ink, alignment: 0 });
      o.roundRect(v.x + 2, v.y + 2, S - 4, S - 4, 10).stroke({ width: 3, color: 0xffffff, alignment: 1 });
      o.roundRect(v.x + 5, v.y + 5, S - 10, S - 10, 7).stroke({ width: 2, ...ink, alignment: 1 });
      if (v.attack.damage) {
        const s = TEXT_SCALE;
        place(pill(pixi, v.attack.damage, { fontSize: S * 0.22 * s, family: 'plain', fill: CELL_COLORS.ink, color: 'white', ring: { css: 'white', width: 2 }, padX: 7 * s, padY: 3 * s, radius: 7 * s }), v.x + S / 2, v.y + S / 2);
      }
    }

    // Cases d'invocation : « J1 », « J2 », au sol vers l'avant de la case.
    for (const v of cells) {
      if (!v.summon) continue;
      const s = TEXT_SCALE;
      const fill = v.summon === 1 ? CELL_COLORS.j1 : CELL_COLORS.j2;
      place(pill(pixi, `J${v.summon}`, { fontSize: S * 0.16 * s, family: 'sc', fill, color: 'white', ring: { css: 'white', width: 1.5 }, padX: 4 * s, padY: 1 * s, radius: 4 * s }), v.x + 0.76 * S, v.y + 0.76 * S, { under: true });
    }

    // Nom de la mana zone survolée, à la pointe avant de sa case centrale : son icône, son nom, et ce qu'elle rapporte ou
    // qui la tient. Seulement au survol, devant le décor (refonte du 2026-11-11).
    for (const v of cells) {
      if (!v.manaZone?.hovered) continue;
      place(zoneTag(pixi, v.manaZone), v.x + S + 2, v.y + S + 2, { dz: ZONE_TAG_DEPTH });
    }
  }

  /**
   * Zones (handoff « zones ») : le centre des cases reste transparent. Halo intérieur cyan (aller) ou orange (attaquer) ;
   * case survolée : voile et anneau de 5 px ; chemin : un point par case traversée ; danger : voile violet très léger
   * sur toute la case (72 px, sans arrondi, pour un trait continu) et contour de 3 px sur les côtés qui donnent dehors.
   */
  private drawZones(cells: readonly CellVisual[]): void {
    const { pixi } = this;
    const textures = (this.zoneTextures ??= { halo: haloTexture(pixi), dot: dotTexture(pixi) });
    const gap = (ISO.pitch - S) / 2;
    const full = S + 2 * gap;
    const line = cssColor(ZONE.dangerLine);
    for (const v of cells) {
      if (v.danger) {
        const [x, y] = [v.x - gap, v.y - gap];
        this.dangerVeil.rect(x, y, full, full).fill(cssColor(ZONE.dangerVeil));
        // Au bord, un filet sombre de 1,5 px, puis le trait violet de 3 px.
        const band = (inset: number, width: number): [boolean, number, number, number, number][] => [
          [v.danger!.up, x, y + inset, full, width],
          [v.danger!.down, x, y + full - inset - width, full, width],
          [v.danger!.left, x + inset, y, width, full],
          [v.danger!.right, x + full - inset - width, y, width, full],
        ];
        for (const [on, sx, sy, w, h] of band(0, 1.5)) if (on) this.dangerLine.rect(sx, sy, w, h).fill(cssColor(ZONE.ink));
        for (const [on, sx, sy, w, h] of band(1.5, 3)) if (on) this.dangerLine.rect(sx, sy, w, h).fill(line);
      }
      if (v.reach) {
        const look = ZONE[v.reach];
        this.dangerVeil.roundRect(v.x, v.y, S, S, 6).fill(cssColor(v.reachOnMana && v.reach !== 'target' ? ZONE.manaFill : look.fill));
        this.halos.addChild(new pixi.Sprite({ texture: textures.halo, x: v.x, y: v.y, width: S, height: S, tint: cssColor(look.halo).color }));
        // Par-dessus le halo : filet sombre au bord, puis liseré de 3 px de la couleur.
        this.hoverRing.roundRect(v.x, v.y, S, S, 6).stroke({ width: 1.5, ...cssColor(ZONE.ink), alignment: 1 });
        this.hoverRing.roundRect(v.x + 1.5, v.y + 1.5, S - 3, S - 3, 5).stroke({ width: 3, ...cssColor(look.edge), alignment: 1 });
        if (v.hover) {
          this.hoverRing.roundRect(v.x, v.y, S, S, 6).fill(cssColor(look.veil));
          this.hoverRing.roundRect(v.x, v.y, S, S, 6).stroke({ width: 5, ...cssColor(look.ring), alignment: 1 });
        }
      }
      if (v.step && v.moveCost === null) {
        this.dots.addChild(new pixi.Sprite({ texture: textures.dot, anchor: 0.5, x: v.x + S / 2, y: v.y + S / 2, width: 16, height: 16 }));
      }
    }
  }

  /** Replace les éléments à l'écran selon la caméra. */
  layout(camera: Pick<IsoCamera, 'k' | 'width' | 'centerY'>, plan: number): void {
    for (const item of this.placed) {
      const p = isoProject(camera, plan, item.x, item.y);
      item.node.position.set(p.x, p.y);
      if (item.scaled) item.node.scale.set(camera.k);
      if (item.dz !== null) item.node.zIndex = isoDepth(item.x, item.y, item.dz);
    }
  }

  /** Lueur des mana zones (`glowPulse`, 2,4 s) et zones contestées (`contestPulse`, 1,4 s). */
  update(t: number): void {
    const wave = (period: number) => {
      const f = (((t / period) % 1) + 1) % 1;
      const x = f < 0.5 ? f * 2 : 2 - f * 2;
      return x * x * (3 - 2 * x);
    };
    // La lueur des mana zones respire doucement, autour de son opacité de repos.
    const breath = 0.8 + 0.2 * wave(3.2);
    this.glows.forEach((sprite, i) => (sprite.alpha = (this.glowBase[i] ?? 1) * breath));
    this.pulsing.alpha = 1 - 0.45 * wave(1.4);
  }

  /** Vrai s'il y a quelque chose qui pulse (lueur, zone contestée). */
  get animated(): boolean {
    return this.glows.length > 0 || this.pulsing.context.instructions.length > 0;
  }

  destroy(): void {
    this.ground.destroy();
    this.overlays.destroy();
    this.dangerVeil.destroy();
    this.halos.destroy({ children: true });
    this.hoverRing.destroy();
    this.dangerLine.destroy();
    this.dots.destroy({ children: true });
    this.glowLayer.destroy();
    this.pulsing.destroy();
    for (const sprite of this.glows) sprite.destroy();
    for (const item of this.placed) item.node.destroy({ children: true });
    this.manaTextures?.halo.destroy(true);
    this.manaTextures?.well.destroy(true);
    this.zoneTextures?.halo.destroy(true);
    this.zoneTextures?.dot.destroy(true);
  }
}
