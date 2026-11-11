// Mise en ligne (SPEC.md §7 ter, lot 6) : `npm run deploy`. Vérifie tout (typecheck, tests), construit le site, puis
// envoie le site et le serveur à Cloudflare (`wrangler deploy`), avec la même version du jeu (`__BUILD_ID__`) : un écran
// resté ouvert sur l'ancienne version est refusé par le nouveau serveur (« recharge la page »). Il faut être connecté à
// wrangler (`npx wrangler login`, une fois). `--dry-run` : tout, sauf l'envoi.
import { execFileSync, spawnSync } from 'node:child_process';

const dryRun = process.argv.includes('--dry-run');
const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'sans-git';
  }
})();
// Date et heure (UTC) puis le commit : lisible, et différent à chaque mise en ligne.
const BUILD_ID = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${commit}`;

function run(command, args, env = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) {
    console.error(`\nÉchec de « ${command} ${args.join(' ')} » : rien n'a été mis en ligne.`);
    process.exit(result.status ?? 1);
  }
}

run('npx', ['tsc', '-b']);
run('npx', ['vitest', 'run']);
run('npx', ['vite', 'build'], { BUILD_ID });
run('npx', ['wrangler', 'deploy', '--define', `__BUILD_ID__:${JSON.stringify(BUILD_ID)}`, ...(dryRun ? ['--dry-run', '--outdir', '.wrangler/deploy'] : [])], {
  WRANGLER_SEND_METRICS: 'false',
});
console.log(dryRun ? `\nEssai fini (rien d'envoyé) : version ${BUILD_ID}.` : `\nEn ligne : version ${BUILD_ID}.`);
