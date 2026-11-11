// Plateau 15 × 15 dessiné par PixiJS (migration, étape 3a) : le sol peint dans le plan isométrique, les sprites peints
// debout, triés par profondeur comme la 3D du plateau en CSS, les ponts couchés sous eux, le décor qui s'efface devant
// un jeton ou la case survolée, l'ambiance au sol (`buildGroundFx`) et debout (feu et fumée de la forge, éclats des
// cristaux, particules des mana zones), puis les cases (sous-étape 3b), les unités (3c) et leurs animations d'action
// (3d : `motions`, que `fx/stage.ts` appelle à la place des animations des jetons HTML).
// Le dessin n'a lieu que quand il le faut : à chaque image de l'ambiance (30 par seconde), d'un fondu, ou après un
// changement (défilement, caméra, décor) ; rien quand tout est immobile.
import type { Application, Container as PixiContainer, Sprite, Texture } from 'pixi.js';
import type { Board } from '../../engine';
import {
  EMBER,
  MOTE,
  SMOKE,
  SPRITE_FX,
  cellCenter,
  flick,
  groundAmbience,
  pulse,
  riser,
  scatter,
  spritePoint,
  twinkle,
  zoneHalos,
} from '../iso/ambience';
import type { ZoneControllers } from '../iso/ambience';
import { DECOR_FADE, GROUND_WAIT, STAND_DEPTH, paintedBoardDecor, paintedDecor, placePaintedSprites, spritesHiding, worldPlan } from '../iso/paintedDecor';
import type { PaintedDecor, PlacedSprite } from '../iso/paintedDecor';
import { SPRITES } from '../iso/scenery';
import type { IsoCamera } from '../iso/scenery';
import { SPRITE_URLS } from '../iso/spriteUrls';
import { CellLayer } from './cellLayer';
import { cellVisuals } from './cellModel';
import type { CellInputs } from './cellModel';
import { buildGroundFx, loadImage, painted, tint } from './groundFx';
import { ambientFrame } from '../ambientClock';
import { wait } from '../fx/stage';
import type { TokenMotions } from '../fx/stage';
import { TokenLayer } from './tokenLayer';
import { TOKEN_FOOT, unitVisuals } from './tokenModel';
import type { TokenInputs } from './tokenModel';
import { DIE, DROP, LAND, RECOIL, SLAM, lungeMotion, shakeMotions, walkMotions } from './tokenMotion';
import type { Motion, Point } from './tokenMotion';
import type { BuiltScene, Pixi } from './groundFx';
import { isoDepth, isoPlaneMatrix, isoProject, isoUnproject } from './isoProjection';
import type { Board as BoardData, Position } from '../../engine';
import { ISO } from '../iso/scenery';

/** Durée (ms) du fondu d'un sprite qui s'efface ou réapparaît. */
const FADE_MS = 250;

/** Ce que le plateau dessine, hors caméra et défilement. */
export interface BoardDecorInput {
  readonly board: Board;
  readonly flipped: boolean;
  readonly animated: boolean;
  /** Sol du plateau seul, puis du monde (décor extérieur compris) : URL, `null` tant qu'il se calcule. */
  readonly ground: string | null;
  readonly world: string | null;
  readonly controllers: ZoneControllers;
  /** Masques de l'eau de chaque image de pièce d'eau (`useWaterMasks`). */
  readonly masks: Readonly<Record<string, string>>;
}

/** Un élément debout, placé à son ancre au sol et trié par profondeur ; `key` : le sprite qu'il suit pour s'effacer. */
interface Upright {
  readonly node: PixiContainer;
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly dz: number;
  /** Échelle à l'écran avant la caméra (celle du sprite), et retourné ou non. */
  readonly scale: number;
  readonly mirror: boolean;
  readonly flat: boolean;
}

/** Ambiance debout : sa mise à jour au temps `t` (s). */
type FxUpdate = (t: number) => void;

/** Le décor construit pour un plateau : ses éléments, son ambiance et son nettoyage. */
interface BuiltDecor {
  /** Le sol dessiné : le vert uni d'attente, celui du plateau seul, ou celui du monde. */
  readonly ground: DrawnProgress['ground'];
  readonly uprights: readonly Upright[];
  readonly hiding: Map<string, string[]>;
  readonly fx: readonly FxUpdate[];
  readonly groundFx: BuiltScene | null;
  readonly animated: boolean;
  readonly destroy: () => void;
}

/** Les images de sprites d'un décor placé : chaque sprite, et les ailes de ses moulins. */
export function spriteImages(placed: readonly PlacedSprite[]): string[] {
  return [...new Set(placed.flatMap((sprite) => [sprite.id, ...(SPRITE_FX[sprite.id]?.sails ? [SPRITE_FX[sprite.id]!.sails!.image] : [])]))];
}

/** Ce que le plateau a déjà dessiné, pour l'écran de chargement (`BoardProgress` sans le moteur). */
export interface DrawnProgress {
  readonly ground: 'none' | 'board' | 'world';
  /** Cases et unités dessinées, illustrations des jetons comprises. */
  readonly pieces: boolean;
}

export class BoardRenderer {
  private readonly world: PixiContainer;
  /**
   * De bas en haut, comme l'empilement d'une case en HTML : le sol et son ambiance (plan), les ponts couchés, les
   * cases (plan), « J1 » et les icônes des marques, la pénombre, les surbrillances et les unités au sol (plan), les
   * textes au-dessus (chemin, dégâts, pièges), puis tout ce qui est debout (trié).
   */
  private readonly plane: PixiContainer;
  private readonly groundLayer: PixiContainer;
  private readonly fxLayer: PixiContainer;
  /** Images vues de dessus (le pont), dans le plan, au-dessus de l'eau et de ses reflets. */
  private readonly topFlats: PixiContainer;
  private readonly flats: PixiContainer;
  private readonly planeCells: PixiContainer;
  private readonly textsUnder: PixiContainer;
  private readonly planeOver: PixiContainer;
  private readonly groundTexts: PixiContainer;
  private readonly standing: PixiContainer;
  private readonly cells: CellLayer;
  private readonly units: TokenLayer;
  /** Plateau affiché (pour retrouver la case sous la souris) et animations permises. */
  private board: BoardData | null = null;
  private flipped = false;
  private animated = false;
  /** Case sous la bulle d'action : son jeton ne grossit pas au survol. */
  private anchor: string | null = null;
  /** Polices des textes chargées : avant, les cases attendent. */
  private fontsReady = false;
  private pendingCells: CellInputs | null = null;
  private pendingUnits: (TokenInputs & { readonly animated: boolean; readonly anchor: Position | null }) | null = null;
  /** Les unités ont été dessinées au moins une fois. */
  private unitsDrawn = false;
  /** Écoute de ce qui est dessiné (écran de chargement), et le dernier état rapporté. */
  private progressListener: ((progress: DrawnProgress) => void) | null = null;
  private reported = '';
  /** Dernières entrées des cases (lues par les essais en dev, `window.__pixiBoard`). */
  lastCells: CellInputs | null = null;
  private camera: Pick<IsoCamera, 'k' | 'width' | 'centerY' | 'standScale'> | null = null;
  private plan = 0;
  private decor: BuiltDecor | null = null;
  /** Construction en cours : la dernière demandée gagne. */
  private building = 0;
  private reveal: ReadonlySet<string> = new Set();
  /** Cases d'une marche en cours, par unité : le décor qui les cache s'efface le temps du trajet. */
  private readonly walking = new Map<string, readonly string[]>();
  /** Opacité visée et départ du fondu de chaque sprite (par clé). */
  private readonly fades = new Map<string, { from: number; to: number; start: number }>();
  private raf = 0;
  private lastFrame = 0;
  private dirty = false;
  private destroyed = false;

  constructor(
    private readonly pixi: Pixi,
    private readonly app: Application,
  ) {
    const { Container } = pixi;
    this.world = new Container();
    this.plane = new Container();
    this.groundLayer = new Container();
    this.fxLayer = new Container();
    this.topFlats = new Container();
    this.plane.addChild(this.groundLayer, this.fxLayer, this.topFlats);
    this.flats = new Container();
    this.planeCells = new Container();
    this.textsUnder = new Container();
    this.planeOver = new Container();
    this.groundTexts = new Container();
    this.standing = new Container({ sortableChildren: true });
    this.cells = new CellLayer(pixi, { cells: this.planeCells, over: this.planeOver, textsUnder: this.textsUnder, texts: this.groundTexts, standing: this.standing });
    this.units = new TokenLayer(pixi, this.planeOver, this.standing, () => {
      if (this.camera) this.units.layout(this.camera, this.plan);
      this.requestRender();
    });
    this.world.addChild(this.plane, this.flats, this.planeCells, this.textsUnder, this.planeOver, this.groundTexts, this.standing);
    app.stage.addChild(this.world);
    const fonts = typeof document !== 'undefined' && document.fonts ? document.fonts : null;
    const ready = fonts
      ? Promise.all([fonts.load('800 12px "Alegreya Sans SC"'), fonts.load('800 12px "Alegreya Sans"')]).catch(() => [])
      : Promise.resolve([]);
    void ready.then(() => {
      this.fontsReady = true;
      if (this.pendingCells) this.setCells(this.pendingCells);
      if (this.pendingUnits) this.setUnits(this.pendingUnits);
    });
  }

  /** Unités : jetons, terrains, leurs ombres et flèches (redessinés quand ils changent). */
  setUnits(inputs: TokenInputs & { readonly animated: boolean; readonly anchor: Position | null }): void {
    if (this.destroyed) return;
    this.board = inputs.view.board;
    this.flipped = inputs.flipped;
    this.animated = inputs.animated;
    this.anchor = inputs.anchor ? `${inputs.anchor.row},${inputs.anchor.col}` : null;
    if (!this.fontsReady) {
      this.pendingUnits = inputs;
      return;
    }
    this.pendingUnits = null;
    const { tokens, terrains } = unitVisuals(inputs);
    this.units.setUnits(tokens, terrains, inputs.animated);
    this.unitsDrawn = true;
    if (this.camera) this.units.layout(this.camera, this.plan);
    this.requestRender();
  }

  /** Ce qui est dessiné : le sol peint (plateau seul ou monde) et les pièces (cases, unités et leurs illustrations). */
  progress(): DrawnProgress {
    return {
      ground: this.decor?.ground ?? 'none',
      pieces: this.fontsReady && this.lastCells !== null && this.unitsDrawn && !this.units.artsPending,
    };
  }

  /** Prévient `listener` à chaque changement de ce qui est dessiné (après l'image qui le montre), et tout de suite. */
  onProgress(listener: ((progress: DrawnProgress) => void) | null): void {
    this.progressListener = listener;
    this.reported = '';
    this.reportProgress();
  }

  private reportProgress(): void {
    if (!this.progressListener) return;
    const progress = this.progress();
    const key = `${progress.ground}|${progress.pieces}`;
    if (key === this.reported) return;
    this.reported = key;
    this.progressListener(progress);
  }

  /** Case survolée (« ligne,colonne ») : son jeton grossit (pas sous la bulle d'action). */
  setHover(cell: string | null): void {
    this.units.setHover(cell !== null && cell === this.anchor ? null : cell);
    if (this.camera) this.units.layout(this.camera, this.plan);
    this.requestRender();
  }

  /**
   * La case sous un point de l'écran (coordonnées du canvas) : celle d'un jeton dont la goutte est sous la souris (le
   * plus proche de la caméra), sinon la case au sol ; `null` hors du plateau.
   */
  cellAt(x: number, y: number): Position | null {
    const camera = this.camera;
    const board = this.board;
    if (!camera || !board) return null;
    const [sx, sy] = [x - this.world.x, y - this.world.y];
    const token = this.units.hit(camera, this.plan, sx, sy);
    if (token) {
      const [row, col] = token.split(',').map(Number) as [number, number];
      return { row, col };
    }
    const p = isoUnproject(camera, this.plan, sx, sy);
    // Les cases font 68 px au pas de 72 : l'espace entre deux cases va à la plus proche.
    const c = Math.floor((p.x - ISO.pad + 2) / ISO.pitch);
    const r = Math.floor((p.y - ISO.pad + 2) / ISO.pitch);
    if (r < 0 || c < 0 || r >= board.rows || c >= board.cols) return null;
    return this.flipped ? { row: board.rows - 1 - r, col: board.cols - 1 - c } : { row: r, col: c };
  }

  /** Cases : fond, repères, sélection et surbrillances (redessinées à chaque changement). */
  setCells(inputs: CellInputs): void {
    if (this.destroyed) return;
    if (!this.fontsReady) {
      this.pendingCells = inputs;
      return;
    }
    this.pendingCells = null;
    this.lastCells = inputs;
    this.cells.setCells(cellVisuals(inputs));
    if (this.camera) this.cells.layout(this.camera, this.plan);
    this.requestRender();
  }

  /** Le canvas a changé de taille (cadre redimensionné) : PixiJS la reprend, puis on redessine. */
  resize(): void {
    if (this.destroyed) return;
    this.app.resize();
    this.renderNow();
  }

  /** Décalage de la scène dans le canvas (défilement du cadre) : redessiné tout de suite, en phase avec le HTML. */
  setOffset(x: number, y: number): void {
    if (this.world.x === x && this.world.y === y) return;
    this.world.position.set(x, y);
    this.renderNow();
  }

  /** Caméra isométrique (échelle, taille de la scène, centre) et côté du plan du plateau. */
  setCamera(camera: Pick<IsoCamera, 'k' | 'width' | 'centerY' | 'standScale'>, plan: number): void {
    this.camera = camera;
    this.plan = plan;
    this.layout();
    this.requestRender();
  }

  /** Cases à dégager (« ligne,colonne ») : les sprites qui les cachent s'effacent en fondu. */
  setReveal(reveal: ReadonlySet<string>): void {
    this.reveal = reveal;
    this.updateFades();
  }

  /** (Re)construit le décor ; un appel plus récent remplace celui en cours. */
  async setDecor(input: BoardDecorInput): Promise<void> {
    const ticket = ++this.building;
    const built = await this.buildDecor(input, () => !this.destroyed && ticket === this.building);
    if (!built) return;
    this.decor?.destroy();
    this.decor = built;
    this.fades.clear();
    this.layout();
    this.updateFades(true);
    this.requestRender();
  }

  destroy(): void {
    this.destroyed = true;
    this.progressListener = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.decor?.destroy();
    this.decor = null;
    this.cells.destroy();
    this.units.destroy();
  }

  /** Animations d'action des unités, aux mêmes durées que celles des jetons HTML (`fx/stage.ts`). */
  readonly motions: TokenMotions = {
    walk: (unitId, start, cells, o) => {
      if (!this.units.has(unitId) || cells.length === 0) return Promise.resolve(null);
      const duration = cells.length * 210 * o.speed;
      const remove = this.play(unitId, walkMotions([start, ...cells].map((pos) => this.footOf(pos)), duration, o.hop));
      this.walking.set(unitId, [start, ...cells].map((pos) => `${pos.row},${pos.col}`));
      this.updateFades();
      const cancel = () => {
        remove();
        this.walking.delete(unitId);
        this.updateFades();
      };
      return wait(duration).then(() => ({ cancel }));
    },
    lunge: (unitId, from, to) => void this.play(unitId, [lungeMotion(this.footOf(from), this.footOf(to))]),
    land: (unitId) => void this.play(unitId, [LAND]),
    die: (unitId) => {
      if (!this.units.has(unitId)) return Promise.resolve();
      this.play(unitId, [DIE]);
      return wait(DIE.duration);
    },
    drop: (unitId) => void this.play(unitId, [DROP]),
    slam: (unitId) => void this.play(unitId, [SLAM]),
    shake: (unitId, hard) => void this.play(unitId, shakeMotions(hard)),
    recoil: (unitId) => void this.play(unitId, [RECOIL]),
  };

  /** Redessine à la prochaine image (et continue tant que l'ambiance ou un fondu l'exige). */
  requestRender(): void {
    this.dirty = true;
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.frame);
  }

  /**
   * Lance des animations et dessine aussitôt leur première pose : le lecteur d'effets les lance juste après une image
   * où l'unité vient d'apparaître (`patch`), qui ne doit pas s'afficher (un monstre invoqué, entier avant sa chute).
   */
  private play(unitId: string, motions: readonly Motion[]): () => void {
    const remove = this.units.play(unitId, motions);
    this.renderNow();
    this.requestRender();
    return () => {
      remove();
      this.requestRender();
    };
  }

  /** Pied d'un jeton sur une case, dans le plan (plateau retourné compris). */
  private footOf(pos: Position): Point {
    const board = this.board;
    const [r, c] = board && this.flipped ? [board.rows - 1 - pos.row, board.cols - 1 - pos.col] : [pos.row, pos.col];
    return { x: ISO.pad + c * ISO.pitch + TOKEN_FOOT, y: ISO.pad + r * ISO.pitch + TOKEN_FOOT };
  }

  private renderNow(): void {
    if (this.destroyed) return;
    this.app.render();
    this.reportProgress();
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.destroyed) return;
    const fading = this.stepFades(now);
    // Le survol (grossissement) et les animations d'action se jouent à pleine cadence ; l'ambiance et la respiration
    // à 30 images par seconde.
    const growing = this.units.step(now);
    const animated = (this.decor?.animated ?? false) || this.cells.animated || this.animated;
    // Sur les images de l'horloge d'ambiance, les mêmes que celles des boucles CSS (`ambientClock.ts`).
    const frame = ambientFrame(now);
    if (animated && frame !== this.lastFrame) {
      this.lastFrame = frame;
      const t = now / 1000;
      for (const update of this.decor?.fx ?? []) update(t);
      this.decor?.groundFx?.update(t);
      this.cells.update(t);
      if (this.animated) this.units.update(t);
      this.dirty = true;
    }
    if (this.dirty || fading || growing) {
      this.dirty = false;
      this.app.render();
      this.reportProgress();
    }
    if (animated || fading || growing) this.raf = requestAnimationFrame(this.frame);
  };

  /** Place le plan et chaque élément debout selon la caméra. */
  private layout(): void {
    const camera = this.camera;
    if (!camera) return;
    const [a, b, c, d, tx, ty] = isoPlaneMatrix(camera, this.plan);
    for (const plane of [this.plane, this.planeCells, this.planeOver]) plane.setFromMatrix(new this.pixi.Matrix(a, b, c, d, tx, ty));
    this.cells.layout(camera, this.plan);
    this.units.layout(camera, this.plan);
    for (const item of this.decor?.uprights ?? []) {
      const p = isoProject(camera, this.plan, item.x, item.y);
      const s = item.scale * camera.k;
      item.node.position.set(p.x, p.y);
      item.node.scale.set(item.mirror ? -s : s, s);
      item.node.zIndex = isoDepth(item.x, item.y, item.dz);
    }
  }

  /** Sprites à effacer : ceux qui cachent une case à dégager. */
  private updateFades(immediate = false): void {
    const decor = this.decor;
    if (!decor) return;
    const faded = new Set<string>();
    for (const cell of [...this.reveal, ...[...this.walking.values()].flat()]) for (const key of decor.hiding.get(cell) ?? []) faded.add(key);
    const now = performance.now();
    let changed = false;
    for (const item of decor.uprights) {
      const to = faded.has(item.key) ? DECOR_FADE : 1;
      const current = this.fades.get(item.key);
      if (current?.to === to) continue;
      if (!current && to === 1) continue;
      const from = immediate ? to : item.node.alpha;
      this.fades.set(item.key, { from, to, start: now });
      changed = true;
    }
    if (changed) this.requestRender();
  }

  /** Avance les fondus ; vrai s'il en reste en cours. */
  private stepFades(now: number): boolean {
    const decor = this.decor;
    if (!decor || this.fades.size === 0) return false;
    let running = false;
    for (const item of decor.uprights) {
      const fade = this.fades.get(item.key);
      if (!fade) continue;
      const f = Math.min(1, (now - fade.start) / FADE_MS);
      item.node.alpha = fade.from + (fade.to - fade.from) * f;
      if (f < 1) running = true;
    }
    return running;
  }

  private async buildDecor(input: BoardDecorInput, alive: () => boolean): Promise<BuiltDecor | null> {
    const { pixi } = this;
    const { board, flipped, animated } = input;
    const full = paintedDecor(board);
    if (!full) return null;
    const border = full.plan.bordure ?? 0;
    const showWorld = input.world !== null && border > 0;
    const data: PaintedDecor = showWorld ? full : paintedBoardDecor(board)!;
    const plan = this.plan || 2 * full.plan.marge + board.cols * full.plan.pas - (full.plan.pas - full.plan.case);
    const placed = placePaintedSprites(data, board.rows, board.cols, flipped);
    // Hors du plateau, le sol du monde ne rogne rien : l'avancée par défaut garde l'ordre naturel (comme `IsoDecor`).
    const depthOf = (sprite: PlacedSprite) => (showWorld && !sprite.inBoard ? STAND_DEPTH : sprite.dz);

    // Images d'abord (la scène se construit ensuite d'un bloc) : le sol et chaque sprite utilisé.
    const groundUrl = showWorld ? input.world : input.ground;
    const groundImage = groundUrl ? await loadImage(groundUrl).catch(() => null) : null;
    const ids = spriteImages(placed);
    const spriteTextures = new Map<string, Texture>();
    await Promise.all(
      ids.map(async (id) => {
        const url = SPRITE_URLS[id];
        if (url) spriteTextures.set(id, await pixi.Assets.load<Texture>(url));
      }),
    );
    if (!alive()) return null;

    const { Container, Sprite, Graphics, Texture: TextureClass } = pixi;
    const owned: Texture[] = [];
    const nodes: PixiContainer[] = [];

    // Sol, dans le plan (tourné de 180° avec le plateau) ; un vert uni tant qu'il se calcule.
    const ground = new Container();
    if (flipped) {
      ground.pivot.set(plan / 2, plan / 2);
      ground.position.set(plan / 2, plan / 2);
      ground.rotation = Math.PI;
    }
    const [gx, gw] = showWorld ? [-border * full.plan.pas, worldPlan(full, Math.max(board.rows, board.cols))] : [0, plan];
    if (groundImage) {
      const texture = TextureClass.from(groundImage);
      owned.push(texture);
      ground.addChild(new Sprite({ texture, x: gx, y: gx, width: gw, height: gw }));
    } else {
      ground.addChild(new Graphics().rect(gx, gx, gw, gw).fill(GROUND_WAIT));
    }
    this.groundLayer.addChild(ground);
    nodes.push(ground);

    // Ambiance au sol, dans le plan, au-dessus du sol.
    let groundFx: BuiltScene | null = null;
    if (animated) {
      const scene = groundAmbience(data, plan, zoneHalos(board, input.controllers, flipped), flipped);
      groundFx = await buildGroundFx(pixi, this.fxLayer, scene, input.masks, alive);
      if (!alive()) {
        groundFx?.destroy();
        ground.destroy({ children: true });
        for (const texture of owned) texture.destroy(true);
        return null;
      }
    }

    // Sprites : debout (triés), couchés (les anciens ponts, sous tout ce qui est debout) ou vus de dessus (dans le plan,
    // centrés sur leur case, tournés d'un quart de tour le long des colonnes et d'un demi-tour avec le plateau).
    const uprights: Upright[] = [];
    for (const sprite of placed) {
      const texture = spriteTextures.get(sprite.id);
      const size = SPRITES[sprite.id];
      if (!texture || !size) continue;
      if (sprite.topDown) {
        const node = new Sprite({ texture, anchor: 0.5, x: sprite.x, y: sprite.y });
        node.scale.set(sprite.scale);
        node.rotation = (sprite.topDown === 'colonnes' ? Math.PI / 2 : 0) + (flipped ? Math.PI : 0);
        this.topFlats.addChild(node);
        nodes.push(node);
        continue;
      }
      const [w, h, ax, ay] = size;
      const node = new Sprite({ texture, anchor: { x: ax / w, y: ay / h } });
      (sprite.flat ? this.flats : this.standing).addChild(node);
      nodes.push(node);
      uprights.push({ node, key: sprite.key, x: sprite.x, y: sprite.y, dz: depthOf(sprite), scale: sprite.scale, mirror: sprite.mirror, flat: sprite.flat });
    }

    // Ailes des moulins, devant leur tour (même ancre, même clé : elles s'effacent avec elle) : l'image vue de face est
    // posée dans le plan tourné vers le bas à gauche, (X, Y) → (X cos 30°, X sin 30° + Y), moyeu sur le bout d'axe ; elles
    // tournent seulement si les animations sont permises.
    const fx: FxUpdate[] = [];
    for (const sprite of placed) {
      const sails = SPRITE_FX[sprite.id]?.sails;
      const texture = sails && spriteTextures.get(sails.image);
      const size = SPRITES[sprite.id];
      if (!sails || !texture || !size) continue;
      const [, , ax, ay] = size;
      const group = new Container();
      const plane = new Container();
      plane.setFromMatrix(new pixi.Matrix(Math.cos(Math.PI / 6), 0.5, 0, 1, sails.hub[0] - ax, sails.hub[1] - ay));
      const wheel = new Sprite({ texture, anchor: 0.5 });
      plane.addChild(wheel);
      group.addChild(plane);
      this.standing.addChild(group);
      nodes.push(group);
      uprights.push({ node: group, key: sprite.key, x: sprite.x, y: sprite.y, dz: depthOf(sprite) + 1, scale: sprite.scale, mirror: sprite.mirror, flat: false });
      if (animated) fx.push((t) => (wheel.rotation = (-2 * Math.PI * t) / sails.period));
    }

    // Ambiance debout, posée devant son sprite (même ancre, même clé : elle s'efface avec lui).
    if (animated) {
      const textures = fxTextures(pixi);
      owned.push(...Object.values(textures));
      const group = (key: string, x: number, y: number, dz: number) => {
        const node = new Container();
        this.standing.addChild(node);
        nodes.push(node);
        uprights.push({ node, key, x, y, dz, scale: 1, mirror: false, flat: false });
        return node;
      };
      for (const sprite of placed) {
        const spriteFx = SPRITE_FX[sprite.id];
        if (!spriteFx) continue;
        const dz = depthOf(sprite) + 1;
        if (spriteFx.fire && spriteFx.smoke) {
          const [fx0, fy0] = spritePoint(sprite.id, spriteFx.fire, sprite.scale, sprite.mirror);
          const [sx0, sy0] = spritePoint(sprite.id, spriteFx.smoke, sprite.scale, sprite.mirror);
          fx.push(forge(pixi, group(sprite.key, sprite.x, sprite.y, dz), textures, [fx0, fy0], [sx0, sy0]));
        }
        if (spriteFx.crystals) {
          const [ca, cb, cc, cd] = spriteFx.crystals;
          const [x0, y0] = spritePoint(sprite.id, [ca, cb], sprite.scale, sprite.mirror);
          const [x1, y1] = spritePoint(sprite.id, [cc, cd], sprite.scale, sprite.mirror);
          fx.push(crystals(pixi, group(sprite.key, sprite.x, sprite.y, dz), textures, sprite.key, Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0));
        }
      }
      for (const halo of zoneHalos(board, input.controllers, flipped)) {
        const [r, c] = halo.key.slice(3).split('_').map(Number) as [number, number];
        const { x, y } = cellCenter(board, r, c, flipped);
        fx.push(motes(pixi, group(halo.key, x, y, 8), textures, r * 15 + c, halo.color));
      }
    }

    const hiding = spritesHiding(placed, data.plan, board.rows, board.cols, flipped, 'iso', depthOf);
    return {
      ground: groundImage ? (showWorld ? 'world' : 'board') : 'none',
      uprights,
      hiding,
      fx,
      groundFx,
      animated,
      destroy: () => {
        groundFx?.destroy();
        for (const node of nodes) {
          node.parent?.removeChild(node);
          node.destroy({ children: true });
        }
        for (const texture of owned) texture.destroy(true);
      },
    };
  }
}

/** Textures de l'ambiance debout, dessinées une fois : tache floue, étincelle, éclat de cristal, lueur du four. */
function fxTextures(pixi: Pixi): Record<'soft' | 'spark' | 'crystal' | 'glow', Texture> {
  const radial = (size: number, stops: readonly (readonly [number, string])[]) =>
    painted(pixi, size, size, (ctx) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [at, color] of stops) g.addColorStop(at, color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    });
  return {
    soft: radial(64, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]),
    // Point net entouré d'un halo (les `box-shadow` des braises et des particules).
    spark: radial(32, [[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]),
    // Éclat de cristal : une croix blanche sur une lueur violette.
    crystal: painted(pixi, 36, 36, (ctx) => {
      const g = ctx.createRadialGradient(18, 18, 0, 18, 18, 18);
      g.addColorStop(0, 'oklch(0.9 0.12 310 / 0.9)');
      g.addColorStop(1, 'oklch(0.9 0.12 310 / 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 36, 36);
      ctx.fillStyle = 'white';
      ctx.fillRect(15, 0, 6, 36);
      ctx.fillRect(0, 15, 36, 6);
    }),
    // Lueur du four : jaune au centre, orangée à 60 %, transparente au bord.
    glow: radial(64, [[0, 'oklch(0.92 0.15 80 / 0.85)'], [0.6, 'oklch(0.75 0.19 45 / 0.35)'], [1, 'oklch(0.75 0.19 45 / 0)']]),
  };
}

type FxTextures = ReturnType<typeof fxTextures>;

/** Un sprite de taille `w` × `h` (px de plan), centré en (x, y), teinté. */
function dot(pixi: Pixi, parent: PixiContainer, texture: Texture, x: number, y: number, w: number, h: number, color?: string): Sprite {
  const sprite = new pixi.Sprite({ texture, anchor: 0.5, x, y, width: w, height: h, ...(color ? { tint: tint(color) } : {}) });
  parent.addChild(sprite);
  return sprite;
}

/** Forge : halo et lueur du four (qui vacille), braises qui montent, fumée de la cheminée. */
function forge(pixi: Pixi, parent: PixiContainer, t: FxTextures, [fx0, fy0]: readonly [number, number], [sx0, sy0]: readonly [number, number]): FxUpdate {
  const halo = dot(pixi, parent, t.soft, fx0, fy0, 72, 48, 'oklch(0.8 0.16 60)');
  const glow = dot(pixi, parent, t.glow, fx0, fy0, 30, 24);
  const embers = scatter(11, 6).map((p) => ({
    sprite: dot(pixi, parent, t.spark, 0, 0, 9, 9, 'oklch(0.9 0.16 75)'),
    x: fx0 + (p.u - 0.5) * 10,
    y: fy0 - 4.5,
    period: 1.3 + p.v,
    delay: -p.phase * 2,
    sx: (p.v - 0.5) * 26,
  }));
  const smoke = scatter(17, 4).map((p, i) => ({
    sprite: dot(pixi, parent, t.soft, 0, 0, 14, 14, 'oklch(0.8 0.01 80)'),
    period: 3.4 + p.v * 1.2,
    delay: -i * 1.1 - p.phase,
    sx: 4 + p.u * 16,
  }));
  return (time) => {
    halo.alpha = 0.32 * pulse(time, 1.7);
    const f = flick(time);
    glow.scale.set((f.sx * 30) / glow.texture.width, (f.sy * 24) / glow.texture.height);
    for (const e of embers) {
      const m = riser(time, e.period, e.delay, { sx: e.sx, ...EMBER });
      e.sprite.position.set(e.x + m.x, e.y + m.y);
      e.sprite.alpha = m.alpha;
    }
    for (const s of smoke) {
      const m = riser(time, s.period, s.delay, { sx: s.sx, ...SMOKE });
      s.sprite.position.set(sx0 + m.x, sy0 + m.y);
      s.sprite.alpha = 0.6 * m.alpha;
      s.sprite.scale.set((14 * m.scale) / s.sprite.texture.width);
    }
  };
}

/** Deux éclats qui scintillent sur les cristaux d'un sprite (rectangle relatif à son ancre). */
function crystals(pixi: Pixi, parent: PixiContainer, t: FxTextures, key: string, left: number, top: number, w: number, h: number): FxUpdate {
  const sparks = scatter(50 + Number(key.slice(1)), 2).map((p) => ({
    sprite: dot(pixi, parent, t.crystal, left + p.u * w, top + p.v * h, 9, 9),
    period: 2 + p.v * 2,
    delay: -p.phase * 4,
  }));
  return (time) => {
    for (const s of sparks) {
      const m = twinkle(time, s.period, s.delay);
      s.sprite.alpha = m.alpha;
      s.sprite.scale.set((9 * m.scale) / s.sprite.texture.width);
    }
  };
}

/** Trois particules qui montent d'une mana zone, à la couleur de celui qui la tient. */
function motes(pixi: Pixi, parent: PixiContainer, t: FxTextures, seed: number, color: string): FxUpdate {
  const tone = `color-mix(in oklch, ${color} 45%, white)`;
  const list = scatter(seed, 3).map((p) => ({
    sprite: dot(pixi, parent, t.spark, 0, 0, 12, 12, tone),
    x: (p.u - 0.5) * 44,
    y: -p.v * 14,
    period: 2.6 + p.v * 1.4,
    delay: -p.phase * 3,
    sx: (p.phase - 0.5) * 12,
  }));
  return (time) => {
    for (const m of list) {
      const r = riser(time, m.period, m.delay, { sx: m.sx, ...MOTE });
      m.sprite.position.set(m.x + r.x, m.y + r.y);
      m.sprite.alpha = r.alpha;
    }
  };
}

