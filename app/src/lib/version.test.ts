import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { shaDuBundle } from '../../scripts/lib/version.mjs';
import { versionServie } from './version';

// L'IDENTITÉ DE VERSION, ÉPROUVÉE (règle 17) : le cas connu mauvais est une
// variable de plateforme FORGÉE — elle ne doit jamais l'emporter sur le dépôt
// qu'on construit ; sans dépôt, elle est la seule source et elle est dite
// telle ; sans rien, « inconnu » — jamais un SHA inventé.

const FORGE = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

describe('shaDuBundle — le SHA cuit au build', () => {
  it('dans un dépôt git, c’est HEAD — même quand la plateforme prétend autre chose (CAS MAUVAIS)', () => {
    const attendu = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd() }).toString().trim();
    const v = shaDuBundle({ env: { VERCEL_GIT_COMMIT_SHA: FORGE } as unknown as NodeJS.ProcessEnv });
    expect(v.source).toBe('git');
    expect(v.sha).toBe(attendu);
    expect(v.sha).not.toBe(FORGE);
  });

  it('hors de tout dépôt, la variable de la plateforme fait foi — et la source le dit', () => {
    const dehors = fs.mkdtempSync(path.join(os.tmpdir(), 'otto-sans-git-'));
    try {
      const v = shaDuBundle({ cwd: dehors, env: { VERCEL_GIT_COMMIT_SHA: FORGE } as unknown as NodeJS.ProcessEnv });
      expect(v).toEqual({ sha: FORGE, source: 'env' });
      /* Et une variable qui n'a pas la forme d'un SHA n'est pas un SHA. */
      expect(shaDuBundle({ cwd: dehors, env: { VERCEL_GIT_COMMIT_SHA: 'main' } as unknown as NodeJS.ProcessEnv }))
        .toEqual({ sha: null, source: 'inconnu' });
    } finally { fs.rmSync(dehors, { recursive: true, force: true }); }
  });
});

describe('versionServie — ce que /api/sante déclare', () => {
  it('compare le bundle à la plateforme et dit quand ils divergent — jamais l’un à la place de l’autre', () => {
    const avant = { ...process.env };
    try {
      process.env.OTTO_BUILD_SHA = FORGE; process.env.OTTO_BUILD_SOURCE = 'git';
      process.env.VERCEL_GIT_COMMIT_SHA = FORGE.replace(/^dead/, 'beef');
      const v = versionServie();
      expect(v.sha).toBe(FORGE);
      expect(v.identiteCoherente).toBe(false);
      process.env.VERCEL_GIT_COMMIT_SHA = FORGE;
      expect(versionServie().identiteCoherente).toBe(true);
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      expect(versionServie().identiteCoherente).toBeNull();
      delete process.env.OTTO_BUILD_SHA;
      expect(versionServie().sha).toBeNull();
    } finally {
      process.env.OTTO_BUILD_SHA = avant.OTTO_BUILD_SHA; process.env.OTTO_BUILD_SOURCE = avant.OTTO_BUILD_SOURCE;
      process.env.VERCEL_GIT_COMMIT_SHA = avant.VERCEL_GIT_COMMIT_SHA;
      for (const k of ['OTTO_BUILD_SHA', 'OTTO_BUILD_SOURCE', 'VERCEL_GIT_COMMIT_SHA']) if (avant[k] === undefined) delete process.env[k];
    }
  });
});
