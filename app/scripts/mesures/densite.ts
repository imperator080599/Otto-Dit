import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { binaireDe, groupeDetache, tuerArbre, cheminChromium } from '../lib/portable.mjs';
import { routes, auditeur, baseSemee } from '../screens/routes';
import { repoRoot, closeDb } from '../../src/lib/db/client';

// LA DENSITÉ, MESURÉE (tranche 9, §3.D du mandat) — `npm run densite`.
//
// Deux chiffres par écran, sur un BUILD DE PRODUCTION, base semée :
//
//  1. ACTIONS PRIMAIRES : les <button> VISIBLES hors tableaux (les gestes de
//     ligne sont des actions d'ITEM, pas d'écran), hors <details> fermés
//     (les replis pilotés sont secondaires PAR CONCEPTION, ADR-072), hors
//     bandeau. Le critère du mandat : AUCUN écran au-delà de 5.
//  2. CHAMPS À TAPER : input (hors hidden/checkbox/radio/file), textarea —
//     visibles, non lecture seule. C'est la matière de docs/AUTOMATISATION.md :
//     l'automatisation supprime la SAISIE, jamais le jugement — ce compte doit
//     baisser tranche après tranche, écran par écran.
//
// La définition est ICI, dans le code qui mesure — une mesure dont la
// définition est ailleurs ne se discute pas, elle se conteste (règle 12).

const PORT = Number(process.env.DENSITE_PORT ?? 3388);

function lancer(args: string[]): ChildProcess {
  const next = binaireDe('next', process.cwd());
  if (!next) throw new Error('next absent de node_modules — npm install dans app/');
  return spawn(process.execPath, [next, ...args], {
    env: { ...process.env, PORT: String(PORT), OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock', OTTO_TRANSCRIPT_ADAPTER: 'mock' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: groupeDetache(),
  });
}

async function main() {
  if (!fs.existsSync(path.join(process.cwd(), '.next'))) {
    console.error('densite : aucun build (.next absent) — lancez `npm run build` d\'abord.');
    process.exit(1);
  }
  if (!(await baseSemee())) {
    console.error('densite : la base n\'est pas semée — `npm run db:reset && npm run demo:seed` d\'abord.');
    process.exit(1);
  }
  const { pretes } = await routes();
  const user = await auditeur();
  await closeDb();

  const serveur = lancer(['start', '-p', String(PORT)]);
  const fin = Date.now() + 120000;
  for (;;) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.status) break; } catch { /* pas encore debout */ }
    if (Date.now() > fin) { tuerArbre(serveur.pid!); throw new Error('serveur muet après 120 s'); }
    await new Promise((r) => setTimeout(r, 500));
  }

  const nav = await chromium.launch({ executablePath: cheminChromium() });
  const ctx = await nav.newContext();
  await ctx.addCookies([{ name: 'otto_user', value: user, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const p = await ctx.newPage();

  interface Ligne { pattern: string; actions: number; champs: number }
  const lignes: Ligne[] = [];
  const pages = pretes.filter((r) => r.kind === 'page' && (r.attendu ?? 200) === 200 && r.as === 'auditor');
  for (const r of pages) {
    await p.goto(`http://localhost:${PORT}${r.url}`, { waitUntil: 'load' });
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
    /* Le code navigateur part en CHAÎNE : tsx/esbuild décore sinon les
       fonctions nommées d'un assistant __name qui n'existe pas dans la page
       (ReferenceError au premier evaluate — vécu, pas supposé). */
    const compte = await p.evaluate(`(() => {
      const visible = (e) => e.offsetParent !== null;
      const horsCadre = (e) =>
        !e.closest('table') && !e.closest('details:not([open])') && !e.closest('.topbar')
        /* affordances d'ANCRE de note (une puce par objet annotable, partout
           par conception — tâche 58) et groupes d'actions d'ITEM déclarés
           dans le balisage : comme les gestes de ligne d'un tableau, ce sont
           des actions d'objet, pas d'écran. */
        && !e.closest('.annotable') && !e.closest('.note-voile') && !e.closest('[data-actions-item]');
      const actions = [...document.querySelectorAll('button')]
        .filter((b) => visible(b) && horsCadre(b)).length;
      const champs = [...document.querySelectorAll('input, textarea')]
        .filter((e) => {
          const t = e.type;
          if (['hidden', 'checkbox', 'radio', 'file', 'submit', 'button'].includes(t)) return false;
          if (e.readOnly) return false;
          return visible(e) && horsCadre(e);
        }).length;
      return { actions, champs };
    })()`) as { actions: number; champs: number };
    lignes.push({ pattern: r.pattern, ...compte });
  }
  await nav.close();
  tuerArbre(serveur.pid!);

  lignes.sort((a, b) => b.actions - a.actions || b.champs - a.champs);
  const depassements = lignes.filter((l) => l.actions > 5);
  const md = [
    '<!-- ENGENDRÉ par `cd app && npm run densite` — ne pas éditer à la main. -->',
    `# Densité mesurée — ${lignes.length} écrans (build de production, base semée)`,
    '',
    'Définitions : voir l\'en-tête de `app/scripts/mesures/densite.ts` (la mesure porte sa définition).',
    `Critère du mandat §3.D : aucun écran au-delà de **5 actions primaires** — ${depassements.length} dépassement(s).`,
    '',
    '| Écran | Actions primaires | Champs à taper |',
    '|---|---|---|',
    ...lignes.map((l) => `| \`${l.pattern}\` | ${l.actions > 5 ? `**${l.actions}** ⚠` : l.actions} | ${l.champs} |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(repoRoot(), 'docs', 'DENSITE.md'), md, 'utf8');
  console.log(`${lignes.length} écrans mesurés · ${depassements.length} au-delà de 5 actions primaires · docs/DENSITE.md écrit`);
  for (const d of depassements) console.log(`  ⚠ ${d.pattern} : ${d.actions} actions primaires`);
  process.exit(depassements.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
