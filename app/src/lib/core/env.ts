import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';

// ADR-020 — secrets live in app/.env.local and are read by the process that needs them.
// Next.js loads that file natively; the two measurement scripts (tsx, outside Next) call
// loadEnvLocal() themselves. The key is NEVER exported into a shell: an exported
// ANTHROPIC_API_KEY would be picked up by any other tool in the same terminal and bill
// this project's prepaid credits for unrelated work.
//
// Existing process.env values always win, so a deliberate per-run override still works.

let loaded = false;

export function loadEnvLocal(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(repoRoot(), 'app', '.env.local');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Redacted echo for logs and reports — never print a secret, only its shape. */
export function keyFingerprint(): string {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) return 'absent';
  return `present (${k.length} chars, …${k.slice(-4)})`;
}
