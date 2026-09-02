import { execFileSync } from 'node:child_process';

// L'IDENTITÉ DE VERSION DU BUNDLE (mandat de la soirée, §0.1).
//
// `/api/sante` déclarait `VERCEL_GIT_COMMIT_SHA` lu À L'EXÉCUTION — une
// variable d'environnement, pas une propriété du code qui répond. Un `next
// start` local sur un `.next` construit hier annonce le commit d'aujourd'hui ;
// une plateforme qui reconstruit sans cette variable annonce « rien ». Le SHA
// est désormais CUIT dans le bundle au moment du build (`next.config.mjs` →
// `env`), calculé ici : git d'abord (le dépôt qu'on construit), la variable de
// la plateforme ensuite, « inconnu » sinon — et la SOURCE est dite avec.
//
// Éprouvé contre un cas connu mauvais : une variable forgée ne l'emporte
// jamais sur git (version.test.ts).

/**
 * @param {{ env?: NodeJS.ProcessEnv, cwd?: string }} o
 * @returns {{ sha: string | null, source: 'git' | 'env' | 'inconnu' }}
 */
export function shaDuBundle(o = {}) {
  const env = o.env ?? process.env;
  const cwd = o.cwd ?? process.cwd();
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString('utf8').trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return { sha, source: 'git' };
  } catch { /* pas de dépôt git ici : la plateforme le sait peut-être */ }
  const plateforme = env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? '';
  if (/^[0-9a-f]{40}$/.test(plateforme)) return { sha: plateforme, source: 'env' };
  return { sha: null, source: 'inconnu' };
}
