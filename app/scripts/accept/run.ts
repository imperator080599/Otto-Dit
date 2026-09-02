import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { cheminChromium, conseilChromium } from '../lib/portable.mjs';
import { SPECS, EPREUVES, type Contexte, type Spec } from './specs';

// npm run accept [-- <url>] [--rapport=<fichier>] [--captures=<dossier>]
//                [--seulement=<préfixe de code>] [--comme=<motif d'identité>] [--epreuve]
//
// L'ACCEPTATION CLIQUÉE CONTRE L'URL DÉPLOYÉE (mandat du jour, W0).
//
// Le balayage de fumée OUVRE les écrans de l'instance déployée ; ce harnais y
// AGIT, tâche annoncée par tâche annoncée, et écrit pour chacune un verdict
// OBSERVÉ — PASS ou FAIL — avec l'horodatage, la capture et le SHA que
// l'instance déclare. « Livré » dans le rapport du soir cite cette table.
//
// Ce que ce harnais ne prouve pas, et le dit : il conduit UNE identité (le
// préparateur) sur UN dossier (l'audit légal le plus riche) ; il n'éprouve ni
// les visas ni le scellé, qui restent au parcours cliqué local. Il n'ouvre
// aucune identité tierce : l'isolation entre cabinets n'est pas de son ressort.

interface Resultat {
  code: string; tache: string; verdict: 'PASS' | 'FAIL'; quand: string; detail: string; capture: string;
}

function option(args: string[], nom: string): string | null {
  return args.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? null;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const base = (args.find((a) => /^https?:\/\//.test(a)) ?? 'https://otto-dit.vercel.app').replace(/\/$/, '');
  const rapport = option(args, 'rapport') ?? path.join('..', 'docs', 'ACCEPTATION.md');
  const captures = option(args, 'captures') ?? '.acceptation';
  const seulement = option(args, 'seulement');
  const comme = option(args, 'comme');
  const epreuve = args.includes('--epreuve');
  fs.mkdirSync(captures, { recursive: true });

  /* LE SHA QUE L'INSTANCE DÉCLARE — pas celui du dépôt local : on prouve ce
     qui tourne, pas ce qu'on a sous la main. */
  const sante = await fetch(`${base}/api/sante`, { signal: AbortSignal.timeout(30000) })
    .then((r) => r.json() as Promise<{ sha?: string | null; verdict?: string }>)
    .catch(() => null);
  const sha = sante?.sha ?? null;

  const navigateur = await chromium.launch({ executablePath: cheminChromium() })
    .catch((e) => { throw new Error(`${conseilChromium()}\n${e.message}`); });
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  /* Une exception côté navigateur est un ÉCHEC de la tâche pendant laquelle
     elle survient — pas un bruit de console. */
  const exceptions: string[] = [];
  p.on('pageerror', (e) => exceptions.push(e.message.split('\n')[0].slice(0, 160)));

  const resultats: Resultat[] = [];
  let interrompu = '';
  try {
    await p.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 60000 });
    if (/vercel\.com\/sso-api|_vercel_sso_nonce/.test(await p.content())) {
      throw new Error('protection « Vercel Authentication » active : le harnais reçoit la page de connexion Vercel, pas l\'application.');
    }
    const boutons = p.locator('button[name=user_id]');
    const n = await boutons.count();
    if (!n) throw new Error('aucune identité sur l\'accueil — l\'application ne rend pas son sélecteur.');
    /* L'IDENTITÉ : un préparateur (senior/staff) QUI A UN DOSSIER. Le premier
       senior venu peut n'être membre d'aucune mission (une identité de
       démonstration sans affectation) : on essaie, dans l'ordre, jusqu'à
       l'accueil qui montre un dossier — et on dit qui. */
    const noms = await boutons.allInnerTexts();
    const motif = comme ? new RegExp(comme, 'i') : /senior|staff/i;
    const ordre = [...noms.keys()].sort((a, b) => Number(motif.test(noms[b])) - Number(motif.test(noms[a])));
    let identite = '';
    let eng: string | null = null;
    for (const i of ordre) {
      await ctx.clearCookies();
      await p.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 60000 });
      await p.locator('button[name=user_id]').nth(i).click();
      await p.waitForLoadState('networkidle', { timeout: 60000 });
      /* LE DOSSIER : le premier lien de dossier de l'accueil connecté — celui
         que le fondateur ouvrira. */
      const lien = await p.locator('a[href^="/eng/"]').first().getAttribute('href', { timeout: 8000 }).catch(() => null);
      eng = lien?.match(/^\/eng\/([0-9a-f-]{36})/)?.[1] ?? null;
      if (eng) { identite = noms[i].trim(); break; }
      console.log(`  (${noms[i].trim()} : aucun dossier sur son accueil — identité suivante)`);
    }
    if (!eng) throw new Error('aucune identité n\'a de dossier sur son accueil — la base de l\'instance est-elle semée ?');

    const c: Contexte = { base, eng, identite, p };
    const specs: Spec[] = epreuve ? EPREUVES : SPECS.filter((s) => !seulement || s.code.startsWith(seulement));
    console.log(`\nAcceptation cliquée — ${base} · SHA ${sha ? sha.slice(0, 7) : '(non déclaré)'} · ${identite} · dossier ${eng.slice(0, 8)}…\n`);

    for (const s of specs) {
      const quand = new Date().toISOString();
      const avant = exceptions.length;
      let verdict: Resultat['verdict'] = 'PASS';
      let detail = '';
      try {
        detail = await s.conduire(c);
      } catch (e) {
        verdict = 'FAIL';
        detail = (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 300);
      }
      if (exceptions.length > avant) {
        verdict = 'FAIL';
        detail += ` · EXCEPTION navigateur : ${exceptions.slice(avant).join(' | ')}`;
      }
      const capture = `${s.code}.png`;
      await p.screenshot({ path: path.join(captures, capture), fullPage: true }).catch(() => undefined);
      resultats.push({ code: s.code, tache: s.tache, verdict, quand, detail, capture });
      console.log(`  ${verdict}  ${s.code}  ${s.tache}\n        ${detail}`);
    }
  } catch (e) {
    interrompu = e instanceof Error ? e.message : String(e);
    console.error(`\nacceptation : INTERROMPUE — ${interrompu}`);
  } finally {
    await navigateur.close().catch(() => undefined);
  }

  const echecs = resultats.filter((r) => r.verdict === 'FAIL');
  const entete = `# Acceptation cliquée — ${base}`;
  const md = [
    entete, '',
    `SHA déclaré par l'instance : ${sha ? `\`${sha}\`` : '**non déclaré** (/api/sante sans \`sha\`)'} · `
      + `${resultats.length} tâche(s) · **${echecs.length} FAIL** · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
      + (interrompu ? ` · **INTERROMPUE** : ${interrompu}` : ''),
    '',
    '| code | tâche | verdict | quand (UTC) | détail | capture |', '|---|---|---|---|---|---|',
    ...resultats.map((r) => `| ${r.code} | ${r.tache} | ${r.verdict === 'PASS' ? 'PASS' : '**FAIL**'} | ${r.quand.slice(0, 19).replace('T', ' ')} | ${r.detail.replace(/\|/g, '¦')} | \`${r.capture}\` |`),
    '',
    `Captures : \`${path.resolve(captures)}\` (hors dépôt). Ce que ce harnais ne prouve pas : les visas, le scellé, l'isolation entre cabinets — il conduit une identité sur un dossier.`,
    '',
  ].join('\n');

  if (epreuve) {
    /* L'ÉPREUVE RÉUSSIT QUAND LE HARNAIS ÉCHOUE — sur CHAQUE cas connu mauvais.
       On n'écrit pas le rapport : un « FAIL » d'épreuve dans
       docs/ACCEPTATION.md se lirait comme un écran cassé. Une épreuve
       INTERROMPUE avant d'avoir conduit quoi que ce soit n'a rien prouvé :
       elle le dit, elle ne dit pas « aveugle ». */
    if (interrompu) { console.error(`\népreuve : INTERROMPUE avant de conduire les cas — rien n'est prouvé (${interrompu})\n`); process.exit(1); }
    const aveugles = EPREUVES.filter((e) => resultats.find((r) => r.code === e.code)?.verdict !== 'FAIL');
    if (aveugles.length === 0) { console.log(`\népreuve : ${EPREUVES.length} cas connus mauvais, ${EPREUVES.length} déclarés FAIL — le harnais voit ce qu'il doit voir.\n`); return; }
    console.error(`\népreuve : ${aveugles.map((e) => e.code).join(', ')} — le harnais NE VOIT PAS ce cas connu mauvais. Un harnais qui n'échoue pas exprès n'a rien prouvé.\n`);
    process.exit(1);
  }

  fs.writeFileSync(rapport, md, 'utf8');
  console.log(`\n${resultats.length} tâche(s) · ${echecs.length} FAIL · rapport : ${rapport}\n`);
  if (echecs.length || interrompu) process.exit(1);
}

main().catch((e) => {
  console.error(`\nacceptation : ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
