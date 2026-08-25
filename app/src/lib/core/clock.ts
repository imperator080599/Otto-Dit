import { q, q01 } from '@/lib/db/client';

// Demo clock: real time + persisted offset. The reminder cadence demo uses time-warp
// (docs/07 story 11) — production replaces this with real time + pg_cron.

export async function now(): Promise<Date> {
  const row = await q01<{ value: { offsetMs?: number } }>(
    `select value from app_state where key = 'clock_offset'`,
  );
  const offset = row?.value?.offsetMs ?? 0;
  return new Date(Date.now() + offset);
}

export async function warp(ms: number): Promise<Date> {
  const row = await q01<{ value: { offsetMs?: number } }>(
    `select value from app_state where key = 'clock_offset'`,
  );
  const offset = (row?.value?.offsetMs ?? 0) + ms;
  await q(
    `insert into app_state (key, value) values ('clock_offset', $1)
     on conflict (key) do update set value = $1, updated_at = now()`,
    [JSON.stringify({ offsetMs: offset })],
  );
  return new Date(Date.now() + offset);
}

export async function resetClock(): Promise<void> {
  await q(`delete from app_state where key = 'clock_offset'`);
}

export const DAY_MS = 24 * 60 * 60 * 1000;
