import { defineConfig } from 'vitest/config';
import path from 'node:path';

// P0-09 (mandat 2026-09-23, correction §2) : tests/screens.test.ts tourne SEUL, sous sa
// propre configuration — le vitest.config.ts général l'EXCLUT (deux vitest en parallèle
// font tomber le serveur du balayage, R142/CLAUDE.md §7), et Vitest applique `exclude`
// même à un fichier ciblé explicitement en ligne de commande : un second fichier de
// config, avec le seul `include` nécessaire, est la façon propre de le cibler sans
// dupliquer ni contourner l'exclusion du fichier général.

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['../tests/screens.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    globalSetup: ['./src/lib/test/global-setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    /* F1 (revue hostile P0-09) : sans ce bloc, un `screens:test` lancé en mode réseau
       (OTTO_CI_DATABASE_URL posée) ferait tourner `next dev` contre la PGlite locale au
       lieu du pooler réseau — silencieusement, aucune erreur, juste le mauvais moteur.
       tests/screens.test.ts ne passe JAMAIS par initTestDb() (il spawn next dev
       directement) : c'est exactement le test que vitest.config.ts:26-31 nomme comme
       raison d'être de ce bloc — repris ici à l'identique, jamais oublié une seconde fois. */
    env: process.env.OTTO_CI_DATABASE_URL
      ? { DATABASE_URL: process.env.OTTO_CI_DATABASE_URL, OTTO_CI_BASE_JETABLE: process.env.OTTO_CI_BASE_JETABLE ?? '' }
      : {},
  },
});
