import { spawn } from 'node:child_process';

// LA SONDE DU DÉFAUT D'HYDRATATION (fil ouvert n° 7 de STATUS.md) : ouvre
// 45 fois, sur un BUILD DE PRODUCTION, les trois écrans où `npm run clics` a
// vu « Minified React error #418 » par intermittence — papier de travail,
// testing, portail. Mesuré le 2026-08-30 : 0 erreur sur 45 ouvertures
// directes ; le défaut ne se déclenche donc qu'au fil des enchaînements
// d'actions du parcours, pas à l'ouverture. Une vérification que personne ne
// peut rejouer est une affirmation — celle-ci se rejoue :
//   cd app && npm run build && npx tsx scripts/clics/sonde-hydratation.ts
import { chromium } from 'playwright';
import { binaireDe, groupeDetache, tuerArbre, cheminChromium } from '../lib/portable.mjs';
import { getDb, closeDb } from '../../src/lib/db/client';

const PORT = 3399;
async function main() {
  const db = await getDb();
  const eng = (await db.query<{ id: string }>(`select id::text id from engagement where kind='statutory_audit' order by (select count(*) from workpaper w where w.engagement_id=engagement.id) desc limit 1`)).rows[0];
  const wp = (await db.query<{ id: string }>(`select id::text id from workpaper where engagement_id=$1 order by version desc limit 1`, [eng.id])).rows[0];
  const user = (await db.query<{ id: string }>(`select user_id::text id from engagement_member where engagement_id=$1 limit 1`, [eng.id])).rows[0];
  await closeDb();
  const next = binaireDe('next', process.cwd());
  const serveur = spawn(process.execPath, [next!, 'start', '-p', String(PORT)], {
    cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'], detached: groupeDetache(),
    env: { ...process.env, OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock' },
  });
  const fin = Date.now() + 120000;
  for (;;) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.status) break; } catch {}
    if (Date.now() > fin) throw new Error('serveur muet');
    await new Promise((r) => setTimeout(r, 500));
  }
  const nav = await chromium.launch({ executablePath: cheminChromium() });
  let erreurs = 0;
  const pages = [`/eng/${eng.id}/workpapers/${wp.id}`, `/eng/${eng.id}/testing`, `/portal/demo-sophie-altiverre`];
  for (let i = 0; i < 45; i++) {
    const ctx = await nav.newContext();
    if (i % 3 !== 2) await ctx.addCookies([{ name: 'otto_user', value: user.id, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { erreurs++; console.log(`#${i} PAGEERROR:`, e.message.slice(0, 300), '\nSTACK:', (e.stack ?? '').split('\n').slice(0, 6).join('\n')); });
    p.on('console', (m) => { if (m.type() === 'error') console.log(`#${i} CONSOLE:`, m.text().slice(0, 400)); });
    await p.goto(`http://localhost:${PORT}${pages[i % 3]}`, { waitUntil: 'networkidle' }).catch((e) => console.log('goto:', e.message));
    await p.waitForTimeout(400);
    await ctx.close();
  }
  await nav.close();
  tuerArbre(serveur.pid!);
  console.log(`\n${erreurs} erreur(s) de page sur 45 ouvertures`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
