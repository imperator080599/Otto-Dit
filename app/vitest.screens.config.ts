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
  },
});
