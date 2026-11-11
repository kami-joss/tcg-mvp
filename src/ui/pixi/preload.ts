// Plateau chargé en avance : dès que la carte est connue (accueil, lancer de dés, salle en ligne), son sol peint (tâche de
// fond, puis cache de l'appareil), PixiJS et les images des sprites de son décor se chargent, pour que l'écran de
// chargement de la partie soit court. Rien sur une carte qui n'est pas dessinée par PixiJS ; un échec ne coûte rien
// (le plateau recharge ce qui manque).
import type { Board } from '../../engine';
import { loadPaintedGrounds, paintedDecor, placePaintedSprites } from '../iso/paintedDecor';
import { isoScenery } from '../iso/scenery';
import { SPRITE_URLS } from '../iso/spriteUrls';
import { spriteImages } from './boardRenderer';

/** Cartes déjà préchargées dans cette session. */
const preloaded = new Set<string>();

export function preloadBoard(board: Board): void {
  const decor = paintedDecor(board);
  if (!decor || !isoScenery(board) || preloaded.has(board.name) || typeof window === 'undefined') return;
  preloaded.add(board.name);
  const grounds = loadPaintedGrounds(board);
  const quiet = () => {};
  grounds?.board.catch(quiet);
  grounds?.world?.catch(quiet);
  const urls = spriteImages(placePaintedSprites(decor, board.rows, board.cols, false)).flatMap((id) => {
    const url = SPRITE_URLS[id];
    return url ? [url] : [];
  });
  void import('pixi.js')
    .then((pixi) => Promise.all(urls.map((url) => pixi.Assets.load(url).catch(quiet))))
    .catch(() => preloaded.delete(board.name));
}
