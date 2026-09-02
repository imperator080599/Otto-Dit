import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shaDuBundle } from './scripts/lib/version.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url));

/* L'IDENTITÉ DE VERSION EST CUITE DANS LE BUNDLE (mandat de la soirée, §0.1) :
   calculée ICI, au build, et inlinée par Next — jamais lue dans
   l'environnement de la machine qui répond. `/api/sante` la sert avec sa
   source, et dit quand la plateforme prétend un autre commit. */
const version = shaDuBundle({ cwd: ici });

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    OTTO_BUILD_SHA: version.sha ?? '',
    OTTO_BUILD_SOURCE: version.source,
  },
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs', 'unpdf', 'pg'],
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
  /* DÉPLOIEMENT (ADR-109). Le code lit à l'EXÉCUTION des fichiers hors de
     app/ : dataset/fixtures (rejeu d'extraction et d'entretien), dataset/sox
     (RCM), et supabase/migrations — dont la simple PRÉSENCE sert de repère à
     repoRoot(). Sans ces inclusions, le traçage serverless les laisse dehors
     et l'écran casse en production seulement — le genre de silence que le
     balayage local ne peut pas voir. */
  outputFileTracingRoot: path.join(ici, '..'),
  outputFileTracingIncludes: {
    '/**': [
      '../dataset/fixtures/**',
      '../dataset/sox/**',
      '../supabase/migrations/**',
      /* LA MÉTHODE DU CABINET EST DU CONTENU DU DÉPÔT, et l'application la LIT
         à l'exécution (valider.mjs est importé depuis le disque). Oubliée ici,
         elle a fait rendre 500 à /acceptance, /team et /obstacles EN LIGNE
         pendant que 529 tests et 78 routes passaient en local — la revue
         utilisateur n°1 l'a trouvée en cliquant. Le test
         `deploiement-traces.test.ts` rend l'oubli impossible. */
      '../methodology/**',
      /* La police du PDF est lue à l'exécution par le formateur de papier :
         un readFileSync n'est pas un import, donc rien ne la trace. */
      'assets/fonts/**',
    ],
  },
};

export default nextConfig;
