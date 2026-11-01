// Ambiance au sol du plateau peint (15 × 15) en PixiJS, dans le repère du plan du plateau : reflets de l'eau (un shader
// par pièce d'eau, masqué sur son eau : reflets qui coulent, caustiques qui dérivent, scintillements), ombres de nuages,
// rafales et halos des mana zones. Dessinée par `AmbienceCanvas` (canvas posé dans le plan du sol du plateau en CSS) ou
// par le plateau PixiJS (dans son plan isométrique). Et quelques outils PixiJS communs (couleurs, textures, images).
import type { Container as PixiContainer, Shader, Texture } from 'pixi.js';
import { GROUND_FX_COLORS, HALO_RADIUS, cloudAt, gustAt, pulse } from '../iso/ambience';
import type { GroundAmbience } from '../iso/ambience';

export type Pixi = typeof import('pixi.js');

const VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

/**
 * Eau d'une pièce, dans son repère en px (largeur `pas`, longueur 2 `pas`, l'eau coule vers le bas), comme l'ancienne
 * ambiance en CSS : un trait de 2 px tous les 30 px qui descend de 30 px par période (`ambFlow30`), deux taches de
 * lumière par carreau de 36 px qui dérivent en diagonale (`ambDrift36`), trois scintillements (`ambTwinkle`). Le tout
 * seulement sur l'eau (canal alpha du masque), en couleur prémultipliée.
 */
const FRAGMENT = `#version 300 es
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uMask;
uniform float uTime;
uniform vec2 uSize;
uniform float uFlowPeriod;
uniform float uDriftPeriod;
uniform float uStrength;
uniform vec3 uRipple;
uniform vec3 uCaustic;
uniform vec4 uGlints[3];

float twinkle(float t, float period, float delay) {
  float f = fract((t - delay) / period);
  float o = f < 0.6 ? 0.0 : (f < 0.78 ? (f - 0.6) / 0.18 : 1.0 - (f - 0.78) / 0.22);
  return o * o * (3.0 - 2.0 * o);
}

void main() {
  float mask = texture(uMask, vUV).a;
  if (mask < 0.004) {
    finalColor = vec4(0.0);
    return;
  }
  vec2 p = vUV * uSize;
  float m = mod(p.y + 30.0 - 30.0 * fract(uTime / uFlowPeriod), 30.0);
  float ripple = uStrength * smoothstep(11.5, 12.5, m) * (1.0 - smoothstep(13.5, 14.5, m));
  vec2 q = mod(p + 36.0 - 36.0 * fract(uTime / uDriftPeriod), 36.0);
  float caustic = 0.45 * max(0.0, 1.0 - length((q - vec2(10.8, 14.4)) / vec2(9.0, 5.0)))
    + 0.35 * max(0.0, 1.0 - length((q - vec2(27.0, 25.2)) / vec2(7.0, 4.0)));
  float glint = 0.0;
  for (int i = 0; i < 3; i++) {
    float o = twinkle(uTime, uGlints[i].z, uGlints[i].w);
    float s = 0.3 + 0.7 * o;
    float d = length(p - uGlints[i].xy) / s;
    glint = max(glint, o * max(1.0 - smoothstep(1.2, 1.8, d), 0.8 * (1.0 - smoothstep(2.0, 6.5, d))));
  }
  vec3 color = uRipple * ripple;
  float alpha = ripple;
  color = uCaustic * caustic + color * (1.0 - caustic);
  alpha = caustic + alpha * (1.0 - caustic);
  color = vec3(glint) + color * (1.0 - glint);
  alpha = glint + alpha * (1.0 - glint);
  finalColor = vec4(color, alpha) * mask;
}`;

/** Couleur CSS (oklch…) en RVB de 0 à 1, lue sur un pixel : le navigateur fait la conversion. */
export function cssRgb(css: string): [number, number, number] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r! / 255, g! / 255, b! / 255];
}

/** Couleur CSS en teinte PixiJS (0xRRGGBB). */
export const tint = (css: string) => {
  const [r, g, b] = cssRgb(css);
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
};

/** Texture dessinée une fois sur un canvas 2D. */
export function painted(pixi: Pixi, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d')!);
  return pixi.Texture.from(canvas);
}

/** Image chargée par `load` (pas `decode()`, qui peut ne jamais répondre dans une page en arrière-plan). */
export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`image illisible : ${src.slice(0, 60)}`));
    image.src = src;
  });

/** Scène construite : sa mise à jour (temps en s) et son nettoyage. */
export interface BuiltScene {
  readonly update: (t: number) => void;
  readonly destroy: () => void;
}

/**
 * Construit l'ambiance au sol dans `parent`, dans le repère du plan du plateau décalé de `origin`. `masks` : masque de
 * l'eau de chaque image de pièce d'eau (URL). Les images se chargent d'abord ; la scène se construit ensuite d'un bloc,
 * seulement si `alive()` (l'application n'a pas été détruite entre-temps) : sinon `null`.
 */
export async function buildGroundFx(
  pixi: Pixi,
  parent: PixiContainer,
  scene: GroundAmbience,
  masks: Readonly<Record<string, string>>,
  alive: () => boolean,
  origin: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): Promise<BuiltScene | null> {
  const images = new Map<string, HTMLImageElement>();
  for (const name of new Set(scene.water.map((w) => w.image))) {
    const url = masks[name];
    if (url) images.set(name, await loadImage(url));
  }
  if (!alive()) return null;

  const { Container, Sprite, Mesh, MeshGeometry, Shader, Texture, Graphics } = pixi;
  const root = new Container();
  root.position.set(origin.x, origin.y);
  const textures: Texture[] = [];

  // Eau : une maille par pièce, avec son shader ; tournée de 180° avec le plateau.
  const water = new Container();
  if (scene.flipped) {
    water.pivot.set(scene.size / 2, scene.size / 2);
    water.position.set(scene.size / 2, scene.size / 2);
    water.rotation = Math.PI;
  }
  const maskTextures = new Map<string, Texture>();
  for (const [name, image] of images) {
    const texture = Texture.from(image);
    maskTextures.set(name, texture);
    textures.push(texture);
  }
  const ripple = cssRgb(GROUND_FX_COLORS.ripple);
  const caustic = cssRgb(GROUND_FX_COLORS.caustic);
  const shaders: Shader[] = [];
  for (const layer of scene.water) {
    const mask = maskTextures.get(layer.image);
    if (!mask) continue;
    const { width: w, height: h } = layer;
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, w, 0, w, h, 0, h]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = Shader.from({
      gl: { vertex: VERTEX, fragment: FRAGMENT },
      resources: {
        uMask: mask.source,
        uMaskSampler: mask.source.style,
        waterUniforms: {
          uTime: { value: 0, type: 'f32' },
          uSize: { value: new Float32Array([w, h]), type: 'vec2<f32>' },
          uFlowPeriod: { value: layer.flowPeriod, type: 'f32' },
          uDriftPeriod: { value: layer.driftPeriod, type: 'f32' },
          uStrength: { value: layer.strength, type: 'f32' },
          uRipple: { value: new Float32Array(ripple), type: 'vec3<f32>' },
          uCaustic: { value: new Float32Array(caustic), type: 'vec3<f32>' },
          uGlints: { value: new Float32Array(layer.glints.flatMap((g) => [g.x, g.y, g.period, g.delay])), type: 'vec4<f32>', size: 3 },
        },
      },
    });
    shaders.push(shader);
    const mesh = new Mesh({ geometry, shader });
    const [a, b, c, d, tx, ty] = layer.matrix;
    mesh.setFromMatrix(new pixi.Matrix(a, b, c, d, tx, ty));
    water.addChild(mesh);
  }
  root.addChild(water);

  // Halos des mana zones, ombres de nuages et rafales : des sprites d'une tache floue ou d'un trait, teintés.
  const soft = painted(pixi, 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const streak = painted(pixi, 128, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 4);
  });
  textures.push(soft, streak);

  const halos = scene.halos.map((halo) => {
    const sprite = new Sprite({ texture: soft, anchor: 0.5, tint: tint(halo.color), width: HALO_RADIUS * 2, height: HALO_RADIUS * 2 });
    sprite.position.set(halo.x, halo.y);
    root.addChild(sprite);
    return sprite;
  });
  // Nuages et rafales, découpés au plateau (un rectangle : PixiJS le découpe sans passe de masque).
  const sky = new Container();
  sky.mask = new Graphics().rect(0, 0, scene.size, scene.size).fill(0xffffff);
  root.addChild(sky.mask, sky);
  const cloudTint = tint(GROUND_FX_COLORS.cloud);
  const clouds = scene.clouds.map((cloud) => {
    const sprite = new Sprite({ texture: soft, tint: cloudTint, width: cloud.width, height: cloud.height, alpha: 0.2 });
    sky.addChild(sprite);
    return sprite;
  });
  const gustTint = tint(GROUND_FX_COLORS.gust);
  const gusts = scene.gusts.map((gust) => {
    const sprite = new Sprite({ texture: streak, tint: gustTint, width: gust.width, height: 2 });
    sprite.y = gust.top;
    sky.addChild(sprite);
    return sprite;
  });
  parent.addChild(root);

  return {
    update(t) {
      for (const shader of shaders) shader.resources.waterUniforms.uniforms.uTime = t;
      // La couleur du halo est à 55 % au centre, et elle respire.
      for (const sprite of halos) sprite.alpha = 0.55 * pulse(t, 3.2);
      scene.clouds.forEach((cloud, i) => {
        const { x, y } = cloudAt(cloud, t);
        clouds[i]!.position.set(x, y);
      });
      scene.gusts.forEach((gust, i) => {
        const { x, alpha } = gustAt(gust, t);
        gusts[i]!.x = x;
        gusts[i]!.alpha = 0.55 * alpha;
      });
    },
    destroy() {
      // L'application a pu être détruite avant (emprise changée) : la scène l'a été avec elle.
      if (!root.destroyed) {
        root.parent?.removeChild(root);
        root.destroy({ children: true });
      }
      // Les shaders d'abord : ils tiennent les masques de l'eau.
      for (const shader of shaders) shader.destroy();
      for (const texture of textures) texture.destroy(true);
    },
  };
}
