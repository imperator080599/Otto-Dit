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
    // The suite must run with zero network access (CLAUDE.md rule 4).
    pool: 'forks',
  },
});
