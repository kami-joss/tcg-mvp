/// <reference types="vitest/config" />
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Adresse où l'atelier envoie ses réglages à enregistrer (serveur de développement seulement). */
const SAVE_PATH = '/__atelier/enregistrer';

/**
 * Atelier de cartes, étape 4 : « Enregistrer dans le projet » écrit le fichier des cartes (`src/engine/cards.data.ts`)
 * et SPEC.md, calculés par `src/ui/workshopSave.ts` à partir des réglages reçus. Seulement avec `npm run dev` : un
 * site publié n'a pas ce point d'entrée.
 */
function workshopSave(): Plugin {
  return {
    name: 'atelier-enregistrer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(SAVE_PATH, (req, res) => {
        const reply = (status: number, data: object) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };
        if (req.method !== 'POST') return reply(405, { error: 'POST seulement.' });
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => (body += chunk));
        req.on('end', () => {
          void (async () => {
            try {
              const root = server.config.root;
              const { saveToProject, SPEC_FILE } = await server.ssrLoadModule('/src/ui/workshopSave.ts');
              const result = saveToProject(body, readFileSync(resolve(root, SPEC_FILE), 'utf8'));
              if ('error' in result) return reply(400, { error: result.error });
              for (const [file, content] of Object.entries(result.files as Record<string, string>)) {
                writeFileSync(resolve(root, file), content);
              }
              reply(200, { files: Object.keys(result.files), cards: result.cards });
            } catch (error) {
              reply(500, { error: `Enregistrement impossible : ${String(error)}` });
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), workshopSave()],
  // Version du jeu pour les parties en ligne (`src/online/version.ts`) : la même pour le site et le serveur, fixée par
  // `npm run deploy` (`BUILD_ID`) ; « dev » sinon.
  define: { __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? 'dev') },
  // Parties en ligne en développement : l'API va au serveur local (`npx wrangler dev`, port 8787), WebSocket compris.
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts'],
    environment: 'node',
  },
});
