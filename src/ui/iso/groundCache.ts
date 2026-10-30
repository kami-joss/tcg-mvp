// Cache des sols peints sur l'appareil (IndexedDB) : le sol avec son décor extérieur prend 20 à 30 s à calculer, une
// seule fois par appareil. Clé : carte, empreinte du décor et version du calcul, densité. Tout échec (navigation privée,
// stockage plein ou refusé) fait simplement recalculer : le cache n'est jamais indispensable.

const DB_NAME = 'tcg-sols-peints';
const STORE = 'sols';

/**
 * Version du calcul du sol (`isoGround.ts`) : à augmenter à chaque changement de ce calcul qui modifie son image, pour
 * ne pas resservir un sol calculé par l'ancienne version.
 */
export const GROUND_VERSION = 'v2.1';

/** Empreinte courte d'un texte (FNV-1a 32 bits) : change dès que le décor change. */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Clé d'un sol dans le cache. */
export const groundKey = (board: string, decor: unknown, density: number): string =>
  `${board}|${fingerprint(JSON.stringify(decor))}|${GROUND_VERSION}|${density}`;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = act(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).finally(() => db.close()),
  );
}

/** Sol en cache, ou `undefined` (absent, ou cache indisponible). */
export async function readGround(key: string): Promise<Blob | undefined> {
  try {
    const value = await run('readonly', (store) => store.get(key));
    return value instanceof Blob ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Met un sol en cache ; un échec est sans conséquence. */
export async function writeGround(key: string, blob: Blob): Promise<void> {
  try {
    await run('readwrite', (store) => store.put(blob, key));
  } catch {
    // Pas de cache : le sol sera recalculé au prochain chargement.
  }
}
