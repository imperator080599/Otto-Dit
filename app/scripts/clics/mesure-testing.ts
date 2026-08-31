import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { binaireDe, groupeDetache, tuerArbre, cheminChromium } from '../lib/portable.mjs';
import { closeDb } from '../../src/lib/db/client';
import { IDS } from '../../src/lib/seed';
import { bootstrapNep, samplingAndRequest, clientDeposits } from '../../src/lib/flows/part1';
import { extractAll } from '../../src/lib/services/extraction/ladder';

// LA MÉTRIQUE NORD APPLIQUÉE À UN ÉCRAN (point 10) : le temps pour traiter
// UNE ligne d'échantillon, de son ouverture à son état complet, cas normal
// sans écart. À 90 s la ligne, 167 lignes = 4 heures et le produit ne fait
// rien gagner ; à 15 s, 40 minutes.
//
// Le banc mesure les GESTES SCRIPTÉS du chemin minimal — pas le temps de
// lecture humain, le même pour toute interface — et compte les gestes et les
// changements d'écran, qui eux sont le fait de l'interface. Le même script
// mesure l'ANCIENNE interface (file de vérification + pièce dans un autre
// onglet) et la NOUVELLE (atelier, pièce côte à côte) : il détecte laquelle
// est en face et le DIT — une mesure qui ne nomme pas son objet est une
// preuve empruntée (règle 16).
//
//   cd app && npm run mesure:testing

const PORT = Number(process.env.MESURE_PORT ?? 3401);
const BASE = `http://localhost:${PORT}`;

/* LE TEMPS HUMAIN DES GESTES, MODÉLISÉ — PAS MESURÉ, ET DIT COMME TEL.
   Le banc mesure des gestes SCRIPTÉS : une machine clique en quelques
   millisecondes, un humain non. Pour traduire les gestes en temps humain, on
   applique le modèle des frappes au clavier (Keystroke-Level Model, Card,
   Moran & Newell), avec ses valeurs publiées couramment. C'est un MODÈLE :
   chaque constante est nommée, la somme est annoncée comme modélisée, jamais
   comme une mesure. Le temps de LECTURE de la pièce n'y figure pas — il est
   identique quelle que soit l'interface. */
const KLM = {
  K: 0.28, // une frappe de touche (dactylographie moyenne)
  P: 1.10, // pointer une cible à la souris
  B: 0.10, // presser le bouton de la souris
  M: 1.35, // préparation mentale avant un geste choisi
};
const GESTE_SOURIS = KLM.M + KLM.P + KLM.B; // viser et cliquer, en y pensant
const MODELE_LIGNE = {
  /* Ancienne interface : ouvrir le détail dans la file, ouvrir la pièce dans
     un AUTRE onglet, revenir à l'onglet de travail, attester. */
  ancienne: 4 * GESTE_SOURIS,
  /* Atelier : la ligne à traiter est déjà ouverte, la pièce déjà visible —
     Entrée atteste et la suivante s'ouvre seule. */
  atelier: KLM.M + KLM.K,
};

async function attendre(url: string, secondes = 120): Promise<void> {
  const fin = Date.now() + secondes * 1000;
  for (;;) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.status > 0) return; }
    catch { /* pas debout */ }
    if (Date.now() > fin) throw new Error('serveur muet');
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  // ── 1. L'ÉTAT MESURABLE : pièces reçues, extraction lancée, RIEN d'attesté.
  console.log('  base remise à zéro, dossier conduit jusqu\'à la file de vérification…');
  const TSX = binaireDe('tsx', process.cwd());
  await new Promise<void>((res, rej) => {
    const p = spawn(process.execPath, [TSX!, 'scripts/db-setup.ts', '--reset'], { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`db-setup: code ${c}`))));
  });
  await bootstrapNep();
  const requestId = await samplingAndRequest();
  await clientDeposits(requestId);
  await extractAll(IDS.engNep, IDS.users.karim);
  await closeDb(); // PGlite n'admet qu'un écrivain : on rend la base au serveur.

  // ── 2. LE SERVEUR DE PRODUCTION (le build doit exister : npm run build).
  const NEXT = binaireDe('next', process.cwd());
  const serveur = spawn(process.execPath, [NEXT!, 'start', '-p', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'], detached: groupeDetache(),
    env: { ...process.env, OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock' },
  });
  try {
    await attendre(`${BASE}/`);
    const nav = await chromium.launch({ executablePath: cheminChromium() });
    const ctx = await nav.newContext();
    await ctx.addCookies([{
      name: 'otto_user', value: IDS.users.karim, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax',
    }]);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/eng/${IDS.engNep}/testing`, { waitUntil: 'networkidle' });

    const nouvelle = (await p.locator('.atelier').count()) > 0;
    console.log(`  interface mesurée : ${nouvelle ? 'ATELIER (nouvelle)' : 'FILE DE VÉRIFICATION (ancienne)'}`);

    let gestes = 0; let ecrans = 1;
    const t0 = Date.now();

    if (!nouvelle) {
      /* ANCIENNE INTERFACE. Le chemin minimal d'UNE ligne normale :
         1. ouvrir le détail des champs de la première pièce de la file ;
         2. OUVRIR LA PIÈCE — un AUTRE onglet, et il faut la charger ;
         3. revenir, attester ;
         l'état complet = la ligne a quitté la file. */
      const avant = await p.locator('table.data tbody tr').first().locator('xpath=ancestor::table//tbody/tr').count();
      await p.locator('details summary').first().click(); gestes++;
      const [onglet] = await Promise.all([
        ctx.waitForEvent('page'),
        p.locator('a[href^="/api/blob/"]').first().click(),
      ]);
      gestes++; ecrans++;
      await onglet.waitForLoadState('load');
      await p.bringToFront(); gestes++; // le retour d'onglet est un geste
      await p.locator('button:has-text("Confirm fields (attest)")').first().click(); gestes++;
      await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
      const fin = Date.now() + 10000;
      while (Date.now() < fin) {
        const n = await p.locator('table.data tbody tr').first().locator('xpath=ancestor::table//tbody/tr').count();
        if (n < avant) break;
        await p.waitForTimeout(250);
      }
    } else {
      /* NOUVELLE INTERFACE. En régime établi, la ligne à traiter est DÉJÀ
         ouverte (l'attestation précédente a fait avancer à la suivante) et la
         pièce DÉJÀ visible côte à côte : un geste — attester. Le monde du banc
         s'ouvre parfois sur une ligne SANS pièce (elle se traite en lot, pas à
         l'attestation) : s'y positionner est la mise en place du cas mesuré —
         « une ligne normale » — pas un geste du cas ; en régime établi ce
         positionnement n'existe pas. L'état complet du geste : une ligne « à
         vérifier » de MOINS dans la liste — le même critère que l'ancienne
         interface (la file a raccourci). `count()` répond sans attendre ; un
         `textContent()` sur un badge disparu attendrait 30 s son délai. */
      const enAttente = () => p.locator('.atelier-liste tbody tr:has(.badge.amber)').count();
      if (!(await p.locator('.atelier button:has-text("Attester")').count())) {
        await p.locator('.atelier-liste tbody tr:has(.badge.amber)').first().click();
      }
      await p.waitForSelector('.atelier iframe.piece-vue', { timeout: 10000 });
      const avant = await enAttente();
      await p.locator('.atelier button:has-text("Attester")').first().click(); gestes++;
      const fin = Date.now() + 15000;
      while (Date.now() < fin) {
        if ((await enAttente()) < avant) break;
        await p.waitForTimeout(150);
      }
    }

    const secondes = (Date.now() - t0) / 1000;
    const modele = nouvelle ? MODELE_LIGNE.atelier : MODELE_LIGNE.ancienne;
    console.log('\n  ── MESURE ──────────────────────────────────────');
    console.log(`  une ligne, cas normal sans écart : ${secondes.toFixed(1)} s (gestes scriptés)`);
    console.log(`  gestes : ${gestes} · écrans traversés : ${ecrans}`);
    console.log(`  temps humain des gestes, MODÉLISÉ (KLM, constantes nommées dans ce fichier) :`);
    console.log(`    cette interface : ${modele.toFixed(1)} s/ligne → ${Math.round(modele * 167 / 60)} min pour 167 lignes`);
    console.log(`    pour comparaison — ancienne : ${MODELE_LIGNE.ancienne.toFixed(1)} s/ligne`
      + ` (${Math.round(MODELE_LIGNE.ancienne * 167 / 60)} min) · atelier : ${MODELE_LIGNE.atelier.toFixed(1)} s/ligne`
      + ` (${Math.round(MODELE_LIGNE.atelier * 167 / 60)} min)`);
    console.log('  (le temps de LECTURE humain s\'ajoute — identique quelle que soit l\'interface,');
    console.log('   sauf le changement d\'onglet, qui lui appartient à l\'interface ; le modèle');
    console.log('   n\'est PAS une mesure — la mesure, ce sont les gestes scriptés ci-dessus)');
    await nav.close();
  } finally {
    tuerArbre(serveur.pid);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
