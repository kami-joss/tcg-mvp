// Dessin des cases du plateau PixiJS (migration, sous-étape 3b), d'après `cellVisuals` : dans le plan isométrique, comme
// les cases en CSS (fond et trait du plateau peint, mana zones, cases d'invocation, zones de contestation, lueur qui
// pulse, atténuation, déplacements, chemin, effets, cibles, menace hachurée, pièges, cadres d'attaque, marques des
// « Passage ») ; à l'écran, droits et à taille fixe comme les « textes au sol » du CSS (contre-rotation, `--qz`) : J1/J2,
// numéros du chemin, dégâts annoncés, noms des pièges, icônes des marques ; et debout devant, le nom des mana zones.
import type { Container as PixiContainer, Graphics, Sprite, Texture } from 'pixi.js';
import type { ZoneEdge } from '../contestZones';
import type { IconName } from '../Icon';
import { ICON_PATHS, MDI_PATHS } from '../iconPaths';
import type { IsoCamera } from '../iso/scenery';
import { diceLayout } from '../zoneMarks';
import { CELL_COLORS, CELL_SIZE } from './cellModel';
import type { CellVisual } from './cellModel';
import { painted } from './groundFx';
import type { Pixi } from './groundFx';
import { isoDepth, isoProject } from './isoProjection';

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

const mix = (css: string, percent: number, other = 'transparent') => `color-mix(in oklch, ${css} ${percent}%, ${other})`;

/** Traits parallèles dans le carré (x, y, `size`) : lignes x − y = k (`down`) ou x + y = k, espacées de `period`. */
function hatch(g: Graphics, x: number, y: number, size: number, period: number, width: number, down: boolean, css: string): void {
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
function iconTexture(pixi: Pixi, name: IconName): Texture {
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

export class CellLayer {
  /** Fonds, zones de contestation et marques ; puis la zone contestée qui pulse, la lueur, et les surbrillances. */
  private readonly ground: Graphics;
  private readonly pulsing: Graphics;
  private readonly glowLayer: PixiContainer;
  private readonly overlays: Graphics;
  private readonly glows: Sprite[] = [];
  private readonly placed: Placed[] = [];
  private glowTexture: Texture | null = null;

  constructor(
    private readonly pixi: Pixi,
    plane: PixiContainer,
    private readonly groundTexts: PixiContainer,
    private readonly standing: PixiContainer,
  ) {
    this.ground = new pixi.Graphics();
    this.pulsing = new pixi.Graphics();
    this.glowLayer = new pixi.Container();
    this.overlays = new pixi.Graphics();
    plane.addChild(this.ground, this.pulsing, this.glowLayer, this.overlays);
  }

  /** Redessine toutes les cases. */
  setCells(cells: readonly CellVisual[]): void {
    const { pixi } = this;
    const g = this.ground;
    const o = this.overlays;
    g.clear();
    o.clear();
    this.pulsing.clear();
    for (const sprite of this.glows) sprite.destroy();
    this.glows.length = 0;
    for (const item of this.placed) item.node.destroy({ children: true });
    this.placed.length = 0;
    const place = (node: PixiContainer, x: number, y: number, dz: number | null = null, scaled = false) => {
      (dz === null ? this.groundTexts : this.standing).addChild(node);
      this.placed.push({ node, x, y, dz, scaled });
    };

    // Fonds et traits (plateau peint).
    for (const v of cells) {
      if (v.base === 'water') continue;
      if (v.base === 'blocked') {
        cellRect(g, v.x, v.y, 0, R, 'oklch(0.34 0.04 150 / 0.36)', { css: 'oklch(0.28 0.04 165 / 0.32)', width: 1 });
        continue;
      }
      const fill = {
        plain: 'oklch(0.25 0.04 165 / 0.03)',
        odd: 'oklch(1 0 0 / 0.035)',
        mana: 'oklch(0.86 0.13 88 / 0.34)',
        summon1: 'oklch(0.56 0.15 255 / 0.42)',
        summon2: 'oklch(0.56 0.18 25 / 0.42)',
      }[v.base];
      cellRect(g, v.x, v.y, 0, R, fill, v.edge ? { css: v.edge.color, width: v.edge.width } : { css: 'oklch(0.28 0.04 165 / 0.2)', width: 1 });
    }

    // Zones de contestation : un voile qui déborde de la moitié de l'espace entre les cases, et le bord du carré.
    for (const v of cells) {
      if (!v.area) continue;
      const [x, y, w] = [v.x - 2, v.y - 2, S + 4];
      const tone = v.area.look === 'p1' ? CELL_COLORS.j1 : v.area.look === 'p2' ? CELL_COLORS.j2 : v.area.look === 'contested' ? CELL_COLORS.contested : CELL_COLORS.zone;
      if (v.area.look === 'contested') {
        this.pulsing.rect(x, y, w, w).fill(cssColor(mix(CELL_COLORS.j2, 38)));
        hatch(this.pulsing, x, y, w, 14, 7, false, mix(CELL_COLORS.j1, 38));
      } else {
        g.rect(x, y, w, w).fill(cssColor(mix(tone, v.area.look === 'neutral' ? 12 : 22)));
      }
      const width = v.area.look === 'neutral' ? 2 : 2.5;
      const sides: Readonly<Record<ZoneEdge, readonly [number, number, number, number]>> = {
        top: [x, y, x + w, y],
        right: [x + w, y, x + w, y + w],
        bottom: [x, y + w, x + w, y + w],
        left: [x, y, x, y + w],
      };
      for (const edge of v.area.edges) {
        const [x0, y0, x1, y1] = sides[edge];
        if (v.area.look === 'neutral') {
          const length = w;
          for (let d = 0; d < length; d += 9) {
            const e = Math.min(length, d + 5);
            g.moveTo(x0 + ((x1 - x0) * d) / length, y0 + ((y1 - y0) * d) / length).lineTo(x0 + ((x1 - x0) * e) / length, y0 + ((y1 - y0) * e) / length);
          }
          g.stroke({ width, ...cssColor(tone) });
        } else {
          g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, ...cssColor(tone) });
        }
      }
    }

    // Lueur des mana zones (animations permises), dessinée par une texture floue, teintée.
    const glowTexture = (this.glowTexture ??= painted(pixi, 128, 128, (ctx) => {
      ctx.shadowColor = 'white';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(30, 30, 68, 68, 7);
      ctx.stroke();
      ctx.stroke();
    }));
    for (const v of cells) {
      if (!v.glow) continue;
      const sprite = new pixi.Sprite({ texture: glowTexture, x: v.x - 30, y: v.y - 30, width: 128, height: 128, tint: cssColor(v.glow).color });
      this.glowLayer.addChild(sprite);
      this.glows.push(sprite);
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
        place(node, cx, cy, null, true);
      });
    }

    // Atténuation des cases qui ne sont pas des cibles.
    for (const v of cells) if (v.dim) cellRect(o, v.x, v.y, 0, R, 'oklch(0.18 0.012 60 / 0.42)');

    // Déplacements, chemin, effets, cibles.
    for (const v of cells) {
      const [cx, cy] = [v.x + S / 2, v.y + S / 2];
      if (v.move) {
        cellRect(o, v.x, v.y, 0, R, 'oklch(0.9 0.07 195 / 0.82)', { css: CELL_COLORS.moveLine, width: 2 });
        o.circle(cx, cy, S * 0.09).fill(cssColor('oklch(0.42 0.1 205)'));
      }
      if (v.step !== null) {
        cellRect(o, v.x, v.y, 0, R, 'oklch(0.9 0.07 195 / 0.95)', { css: 'oklch(0.42 0.1 205)', width: 2 });
        place(pill(pixi, String(v.step), { fontSize: S * 0.22 * TEXT_SCALE, family: 'plain', fill: CELL_COLORS.path, color: 'white', padX: 0, padY: 0, radius: 0, circle: S * 0.41 * TEXT_SCALE }), cx, cy);
      }
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

    // Menace d'un ennemi survolé : hachures orange (où il ira) ou rouges (ce qu'il frappera), bordées.
    for (const v of cells) {
      if (!v.reach) continue;
      const threat = v.reach === 'strike';
      hatch(o, v.x, v.y, S, threat ? 8 : 9, 3, threat, threat ? 'oklch(0.6 0.21 27 / 0.85)' : 'oklch(0.68 0.16 55 / 0.8)');
      cellRect(o, v.x, v.y, 0, R, null, { css: threat ? CELL_COLORS.threat : CELL_COLORS.danger, width: 2 });
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
      place(pill(pixi, `J${v.summon}`, { fontSize: S * 0.16 * s, family: 'sc', fill, color: 'white', ring: { css: 'white', width: 1.5 }, padX: 4 * s, padY: 1 * s, radius: 4 * s }), v.x + 0.76 * S, v.y + 0.76 * S);
    }

    // Noms des mana zones : debout à la pointe avant de la case, bien avancés vers la caméra (devant les rochers voisins).
    for (const v of cells) {
      if (!v.zoneLabel) continue;
      const s = TEXT_SCALE;
      const label = pill(pixi, v.zoneLabel.text, {
        fontSize: 10 * s,
        family: 'sc',
        fill: v.zoneLabel.color,
        color: CELL_COLORS.paper,
        ring: { css: 'oklch(0.8 0.12 85)', width: 1.5 },
        padX: 6 * s,
        padY: 1 * s,
        radius: 6 * s,
      });
      place(label, v.x + S + 2, v.y + S + 2, 48);
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
    const glow = 0.12 + 0.78 * wave(2.4);
    for (const sprite of this.glows) sprite.alpha = glow;
    this.pulsing.alpha = 1 - 0.45 * wave(1.4);
  }

  /** Vrai s'il y a quelque chose qui pulse (lueur, zone contestée). */
  get animated(): boolean {
    return this.glows.length > 0 || this.pulsing.context.instructions.length > 0;
  }

  destroy(): void {
    this.ground.destroy();
    this.overlays.destroy();
    this.glowLayer.destroy();
    this.pulsing.destroy();
    for (const sprite of this.glows) sprite.destroy();
    for (const item of this.placed) item.node.destroy({ children: true });
    this.glowTexture?.destroy(true);
  }
}
