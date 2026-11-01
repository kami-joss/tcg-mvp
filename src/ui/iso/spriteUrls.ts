// Images des sprites du décor, par nom (sans extension) : Kenney du décor procédural, et sprites peints du 15 × 15
// (handoff plateau 15). Partagées par le décor en CSS (`IsoDecor`) et le plateau PixiJS.
export const SPRITE_URLS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    ...(import.meta.glob('../../assets/decor/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
    ...(import.meta.glob('../../assets/plateau15/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  }).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
);
