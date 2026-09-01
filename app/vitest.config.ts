import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '../tests/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    // The suite must run with zero network access (CLAUDE.md rule 4) — sauf en
    // mode réseau explicite (OTTO_CI_DATABASE_URL), où le globalSetup migre la
    // base réseau une fois et chaque fichier repart d'une base vidée.
    globalSetup: ['./src/lib/test/global-setup.ts'],
    pool: 'forks',
    /* EN MODE RÉSEAU : une seule base partagée, donc UN fichier à la fois —
       deux fichiers en parallèle se videraient l'un l'autre ; et DATABASE_URL
       est injectée dans CHAQUE processus de test (le globalSetup ne lègue pas
       son environnement aux forks), pour que même un test qui n'appelle pas
       initTestDb — le balayage des écrans lance `next dev` — parle à la base
       réseau et non à PGlite. */
    fileParallelism: !process.env.OTTO_CI_DATABASE_URL,
    env: process.env.OTTO_CI_DATABASE_URL
      ? { DATABASE_URL: process.env.OTTO_CI_DATABASE_URL, OTTO_CI_BASE_JETABLE: process.env.OTTO_CI_BASE_JETABLE ?? '' }
      : {},
  },
});
