import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ],
  },
};

export default nextConfig;
