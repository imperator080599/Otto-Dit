import { spawn, type ChildProcess } from 'node:child_process';
import { binaireDe, groupeDetache, tuerArbre } from '../lib/portable.mjs';
import { motifs } from '../screens/routes';

// npm run fumee [-- <url>] [--comme=<identifiant>]
//
// LE BALAYAGE DE FUMÉE — celui qui ouvre les écrans LÀ OÙ ILS TOURNENT.
//
// POURQUOI IL EXISTE (revue utilisateur n°1, 2026-08-31). La chaîne locale —
// 529 tests, 78 routes, 144 étapes cliquées — s'exécute sur PGlite, avec le
// dépôt entier sur le disque. Le déploiement tourne dans une fonction
// serverless qui n'emporte que les fichiers TRACÉS, sur un Postgres réseau.
// Trois écrans ont rendu 500 en ligne pendant que tout était vert ici, et c'est
// un humain qui l'a découvert en cliquant. « Prouver au bout de la chaîne » veut
// désormais dire : contre l'URL que le fondateur ouvre.
//
// Ce que la sonde vérifie, écran par écran : le STATUT attendu, l'absence de
// page d'erreur (« Application error », « server-side exception », digest), et
// un TITRE lu — un 200 qui ne rend rien n'est pas un écran (même règle que la
// mesure de densité).
//
// Les paramètres d'URL se résolvent par CRAWL, jamais depuis une base locale :
// l'instance visée a la sienne, et c'est la sienne qu'on veut prouver.

/* CE QU'ON CHERCHE DANS LE CORPS, et ce qu'on NE cherche PAS.
   « This page could not be found » est le gabarit 404 de Next, SÉRIALISÉ dans
   la charge RSC de CHAQUE page : le chercher fait échouer tout l'écran de
   l'application (38 routes sur 41 au premier essai). Le statut dit déjà le 404.
   On ne garde donc que ce qui ne peut venir que d'une VRAIE page d'erreur. */
const ERREURS: RegExp[] = [
  /Application error: a (server-side|client-side) exception/,
  /Digest:\s*\d+/,
];

interface Resultat { route: string; url: string; statut: number; verdict: 'ok' | 'ÉCHEC'; detail: string }

function lancerServeur(port: number): ChildProcess {
  const next = binaireDe('next', process.cwd());
  if (!next) throw new Error('next absent de node_modules — npm install dans app/');
  return spawn(process.execPath, [next, 'start', '-p', String(port)], {
    /* OTTO_DEMO_PUBLIC=1 pour que `?comme=` existe (c'est la démo publique qui
       l'autorise) — mais OTTO_STORAGE=fs, parce que la base LOCALE a été semée
       sur le disque : sans ça la sonde crie sur une pièce absente du magasin en
       base, et c'est le harnais qui aurait tort, pas le produit. En ligne, le
       semis et la lecture partagent le même mode (db), et c'est ce mode-là que
       la sonde distante éprouve. */
    env: {
      ...process.env, PORT: String(port), OTTO_DEMO_PUBLIC: '1', OTTO_STORAGE: 'fs',
      OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock', OTTO_TRANSCRIPT_ADAPTER: 'mock',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: groupeDetache(),
  });
}

async function lire(base: string, chemin: string, comme: string | null): Promise<{ statut: number; corps: string }> {
  const url = new URL(chemin, base);
  if (comme) url.searchParams.set('comme', comme);
  const r = await fetch(url, { redirect: 'follow', headers: comme ? { cookie: `otto_user=${comme}` } : {} });
  return { statut: r.status, corps: await r.text() };
}

/** Le premier identifiant capturé — QUEL QUE SOIT le groupe qui l'a pris.
 *  (Ne lire que le groupe 1 sur une alternative rendait la sonde muette
 *  quand l'attribut `value` précédait `name` dans le balisage : la sonde
 *  disait « aucune identité » alors que l'écran en affichait quatre.) */
function premierId(corps: string, motif: RegExp): string | null {
  const m = corps.match(motif);
  if (!m) return null;
  return m.slice(1).find((g) => Boolean(g)) ?? null;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const urlArg = args.find((a) => a.startsWith('http'));
  const commeArg = args.find((a) => a.startsWith('--comme='))?.slice('--comme='.length) ?? null;

  let serveur: ChildProcess | null = null;
  let base = urlArg ?? '';
  if (!urlArg) {
    const port = Number(process.env.FUMEE_PORT ?? 3392);
    base = `http://localhost:${port}`;
    /* MESURER CE QU'ON N'A PAS LANCÉ, C'EST NE RIEN MESURER (ADR-076) : un
       serveur oublié tient le port ET la base locale (PGlite n'admet qu'un
       écrivain), et le nôtre meurt en silence. */
    const libre = await fetch(base, { signal: AbortSignal.timeout(1500) }).then(() => false).catch(() => true);
    if (!libre) {
      throw new Error(`le port ${port} est déjà occupé — un serveur d'un lancement précédent, probablement. Arrêtez-le, ou posez FUMEE_PORT.`);
    }
    serveur = lancerServeur(port);
    /* UN SERVEUR QUI NE PEUT PAS DÉMARRER LE DIT TOUT DE SUITE. Sans cette
       écoute, le harnais attendait 120 s puis accusait « serveur muet » — la
       vraie cause (port tenu par un fantôme) était dans une sortie que
       personne ne lisait : le silence, encore. */
    let mortNe = '';
    serveur.stderr?.on('data', (d) => {
      const t = String(d);
      if (/EADDRINUSE|PGlite|Error:/.test(t)) mortNe ||= t.trim().split('\n')[0].slice(0, 200);
    });
    const fin = Date.now() + 120000;
    for (;;) {
      try { const r = await fetch(base); if (r.status) break; } catch { /* pas encore */ }
      if (mortNe) { tuerArbre(serveur.pid!); throw new Error(`le serveur n'a pas démarré : ${mortNe}`); }
      if (Date.now() > fin) { tuerArbre(serveur.pid!); throw new Error('serveur muet après 120 s'); }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log(`\nBalayage de fumée — ${base}${commeArg ? ` (comme ${commeArg.slice(0, 8)}…)` : ''}\n`);

  try {
    /* 1. L'ACCUEIL, et l'identité. Sans identité, tout écran de mission
          renvoie à l'accueil : la sonde ne prouverait que la redirection. */
    const accueil = await lire(base, '/', null);
    if (/vercel\.com\/sso-api|_vercel_sso_nonce/.test(accueil.corps)) {
      throw new Error(
        'protection « Vercel Authentication » active : la sonde reçoit la page de connexion Vercel, '
        + 'pas l\'application. Désactivez-la (Settings → Deployment Protection) ou lancez la sonde '
        + 'depuis un contexte autorisé — sinon ce balayage ne prouve rien.');
    }
    const comme = commeArg ?? premierId(accueil.corps, /name="user_id"[^>]*value="([0-9a-f-]{36})"|value="([0-9a-f-]{36})"[^>]*name="user_id"/)
      ?? premierId(accueil.corps, /"user_id","value":"([0-9a-f-]{36})"/);
    if (!comme) throw new Error('aucune identité trouvée sur l\'accueil — l\'application ne rend pas son sélecteur d\'identité.');

    /* 2. LES PARAMÈTRES, par le crawl de l'instance visée. */
    const accueilConnecte = await lire(base, '/', comme);
    const engId = premierId(accueilConnecte.corps, /href="\/eng\/([0-9a-f-]{36})/);
    if (!engId) throw new Error('aucun dossier trouvé depuis l\'accueil — la base de l\'instance est-elle semée ?');
    const vals: Record<string, string | null> = { id: engId, engId, engagementId: engId, qui: comme, comme };
    const depuis = async (chemin: string, motif: RegExp) =>
      premierId((await lire(base, chemin, comme)).corps, motif);
    vals.wid = await depuis(`/eng/${engId}/workpapers`, /href="\/eng\/[0-9a-f-]{36}\/workpapers\/([0-9a-f-]{36})/);
    vals.rid = await depuis(`/eng/${engId}/requests`, /href="\/eng\/[0-9a-f-]{36}\/requests\/([0-9a-f-]{36})/);
    vals.cid = await depuis(`/eng/${engId}/rcm`, /href="\/eng\/[0-9a-f-]{36}\/rcm\/([0-9a-f-]{36})/);
    /* La pièce se trouve là où l'écran en met une : le papier de travail porte
       ses annexes, les balances auxiliaires leur fichier. */
    vals.evidenceId = (vals.wid ? await depuis(`/eng/${engId}/workpapers/${vals.wid}`, /href="\/api\/blob\/([0-9a-f-]{36})/) : null)
      ?? await depuis(`/eng/${engId}/balances-aux`, /href="\/api\/blob\/([0-9a-f-]{36})/);
    /* Le jeton du portail est sur l'accueil ANONYME : une fois connecté,
       l'écran montre les dossiers, plus les liens du client. */
    vals.token = premierId(accueil.corps, /href="\/portal\/([a-z0-9-]+)"/);
    /* Le contrôle interne vit sur le dossier SOX, pas sur le dossier NEP :
       on cherche donc le second dossier avant d'abandonner la route. */
    const autreEng = [...accueilConnecte.corps.matchAll(/href="\/eng\/([0-9a-f-]{36})/g)]
      .map((m) => m[1]).find((x) => x !== engId);
    if (autreEng) vals.cid = await depuis(`/eng/${autreEng}/rcm`, /href="\/eng\/[0-9a-f-]{36}\/rcm\/([0-9a-f-]{36})/);

    /* 3. LE BALAYAGE. */
    const resultats: Resultat[] = [];
    const nonResolues: string[] = [];
    for (const { pattern, kind } of motifs()) {
      const manquants: string[] = [];
      const chemin = pattern.replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, _s, nom: string) => {
        const v = vals[nom];
        if (!v) manquants.push(nom);
        return v ?? `__${nom}__`;
      });
      if (manquants.length) { nonResolues.push(`${pattern} (${manquants.join(', ')})`); continue; }
      const { statut, corps } = await lire(base, chemin, comme);
      const erreur = ERREURS.find((e) => e.test(corps));
      const titre = /<h1|<h2/.test(corps);
      const attendu = pattern === '/api/archive/[engagementId]' ? [200, 404] : [200];
      let verdict: 'ok' | 'ÉCHEC' = 'ok';
      let detail = `${(corps.length / 1024).toFixed(0)} ko`;
      if (!attendu.includes(statut)) { verdict = 'ÉCHEC'; detail = `statut ${statut} (attendu ${attendu.join(' ou ')})`; }
      else if (erreur) { verdict = 'ÉCHEC'; detail = `page d'erreur (${erreur.source})`; }
      else if (kind === 'page' && !titre) { verdict = 'ÉCHEC'; detail = '200 sans titre — un écran qui ne rend rien n\'est pas un écran'; }
      resultats.push({ route: pattern, url: chemin, statut, verdict, detail });
    }

    const echecs = resultats.filter((r) => r.verdict === 'ÉCHEC');
    for (const r of echecs) console.log(`  ÉCHEC  ${r.route}\n         ${r.detail}`);
    if (nonResolues.length) {
      console.log(`\n  non résolues (aucun objet de ce type sur l'instance) : ${nonResolues.join(' · ')}`);
    }
    console.log(`\n${resultats.length} route(s) ouvertes sur ${base} · ${echecs.length} échec(s)\n`);
    if (echecs.length) process.exit(1);
  } finally {
    if (serveur?.pid) tuerArbre(serveur.pid);
  }
}

main().catch((e) => { console.error(`\nfumée : ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
