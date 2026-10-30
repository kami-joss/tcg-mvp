// Calcul du sol peint en tâche de fond (Web Worker, `OffscreenCanvas`) : avec le décor extérieur, il prend 20 à 30 s,
// ce qui figerait la page sur le fil principal. Reçoit le décor et les adresses des images, renvoie l'image en WebP.
import { buildGround } from './isoGround';
import type { GroundDecor, MakeCanvas } from './isoGround';

export interface GroundRequest {
  readonly id: number;
  readonly size: number;
  readonly decor: GroundDecor;
  /** Adresse absolue de chaque image du sol, par nom. */
  readonly images: Readonly<Record<string, string>>;
}

export type GroundResponse = { readonly id: number; readonly blob: Blob } | { readonly id: number; readonly error: string };

const offscreen: MakeCanvas = (width, height) => new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;

async function bitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sol peint : image introuvable (${url})`);
  return createImageBitmap(await response.blob());
}

const scope = self as unknown as { postMessage: (message: GroundResponse) => void; onmessage: ((event: MessageEvent<GroundRequest>) => void) | null };

scope.onmessage = async ({ data: { id, size, decor, images } }) => {
  try {
    const entries = await Promise.all(Object.entries(images).map(async ([name, url]) => [name, await bitmap(url)] as const));
    const canvas = buildGround(size, decor, Object.fromEntries(entries), offscreen) as unknown as OffscreenCanvas;
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });
    // Libère tout de suite la mémoire du canevas (plusieurs dizaines de Mo).
    canvas.width = 0;
    canvas.height = 0;
    for (const [, image] of entries) image.close();
    scope.postMessage({ id, blob });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
