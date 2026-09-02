// LA VERSION QUE CE BUNDLE PORTE (mandat de la soirée, §0.1).
//
// `OTTO_BUILD_SHA` et `OTTO_BUILD_SOURCE` sont posés par `next.config.mjs`
// dans `env` : Next les INLINE dans le code au moment du build. Ils ne sont
// donc pas lus dans l'environnement de la machine qui répond — ils sont le
// code qui répond. `VERCEL_GIT_COMMIT_SHA`, lui, est lu à l'exécution : quand
// les deux diffèrent, `/api/sante` le DIT (`identite_coherente: false`) au
// lieu d'annoncer l'un des deux comme s'il était l'autre.

export interface VersionServie {
  /** Le SHA cuit dans le bundle — null si le build n'a rien pu déterminer. */
  sha: string | null;
  /** D'où le build l'a tiré : le dépôt git, la variable de la plateforme, ou rien. */
  source: 'git' | 'env' | 'inconnu';
  /** Ce que la plateforme dit À L'EXÉCUTION — pour comparer, jamais pour remplacer. */
  shaExecution: string | null;
  /** Le bundle et la plateforme parlent-ils du même commit ? null quand l'un des deux se tait. */
  identiteCoherente: boolean | null;
}

export function versionServie(): VersionServie {
  const sha = process.env.OTTO_BUILD_SHA || null;
  const source = (process.env.OTTO_BUILD_SOURCE as VersionServie['source']) || 'inconnu';
  const shaExecution = process.env.VERCEL_GIT_COMMIT_SHA || null;
  return {
    sha, source, shaExecution,
    identiteCoherente: sha && shaExecution ? sha === shaExecution : null,
  };
}
