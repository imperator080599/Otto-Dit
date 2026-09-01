import { execFileSync } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { binaireDe, groupeDetache, tuerArbre, cheminChromium } from '../lib/portable.mjs';
import { routes, auditeur, baseSemee } from '../screens/routes';
import { repoRoot, closeDb } from '../../src/lib/db/client';

// LA DENSITÉ, MESURÉE (tranche 9, §3.D du mandat) — `npm run densite`.
//
// Sur un BUILD DE PRODUCTION et une base semée, chaque écran est OUVERT et
// ses commandes sont classées. Quatre chiffres, et la raison de chacun :
//
//  1. ACTIONS PRIMAIRES — les commandes visibles que l'écran offre à qui
//     arrive : <button>, <a class="btn"> (un lien peint en bouton EST un
//     bouton — la clôture télécharge son archive comme ça), input submit,
//     [role=button]. C'est le chiffre du critère : AUCUN écran au-delà de 5.
//  2. REPLIÉES — les mêmes commandes, dans un <details> fermé. Les replis
//     pilotés sont du secondaire PAR CONCEPTION (ADR-072), donc hors critère
//     — mais PUBLIÉS : replier pour passer sous un seuil serait mesurer le
//     thermomètre. Le lecteur voit le troc.
//  3. D'ITEM — les gestes qui appartiennent à un OBJET et non à l'écran :
//     ligne de tableau, groupe déclaré data-actions-item, puce d'ancre de
//     note. Publiées aussi, pour la même raison.
//  4. CHAMPS À TAPER — input (hors hidden/case/radio/fichier), textarea et
//     select, hors chrome et hors item, QU'ILS SOIENT REPLIÉS OU NON : replier
//     un champ ne supprime pas la frappe. C'est la matière de
//     docs/AUTOMATISATION.md — ce compte doit baisser tranche après tranche.
//
// Le chrome de navigation n'est ni une action d'écran ni un champ : il est le
// même partout, par conception. Il en existe TROIS, et ils sont nommés ici
// pour qu'on ne puisse pas en ajouter un quatrième en silence : le bandeau
// haut (.topbar), le rail du dossier (nav) et l'EN-TÊTE DU DOSSIER
// (.dossier-entete — fil d'Ariane, bascule entre dossiers, référentiels,
// bouton « interroger le dossier »), identique sur tous les écrans d'un
// dossier depuis ADR-112. Cette exclusion CHANGE les chiffres publiés : la
// bascule comptait pour deux commandes repliées sur chaque écran, elle n'y
// compte plus. C'est une reclassification, pas un allègement.
//
// CE QUE LA MESURE REFUSE DE PUBLIER (leçon de la première version, dont le
// tableau annonçait 0|0 sur des écrans qui portent des boutons inconditionnels
// — un silence lu comme un succès, règle 13) :
//   - un statut HTTP inattendu : la page est-elle seulement arrivée ?
//   - une page sans titre lu : un 200 qui ne rend rien n'est pas un écran ;
//   - une commande ni visible, ni repliée, ni d'item : personne ne peut
//     l'atteindre, et le tableau ne l'avouerait pas.
// Chacun de ces trois cas ARRÊTE la mesure. Rien n'est écrit.
//
// La définition est ICI, dans le code qui mesure — une mesure dont la
// définition est ailleurs ne se discute pas, elle se conteste (règle 12).

const PORT = Number(process.env.DENSITE_PORT ?? 3388);
const PLAFOND = 5;

/**
 * LES ÉCRANS QUI EXCLUENT DES GESTES, ET POURQUOI.
 *
 * `data-actions-item` sort du critère les gestes qui appartiennent à un OBJET
 * (une ligne, une pièce, une note) et non à l'écran. C'est légitime — et c'est
 * exactement le genre de marqueur avec lequel on ferait passer un écran chargé
 * sous un seuil. Il se DÉCLARE donc, écran par écran, avec sa raison en
 * français : un marqueur posé ailleurs arrête la mesure, et ces raisons sont
 * publiées dans docs/DENSITE.md — ce qu'on retire d'un chiffre doit se lire
 * à côté du chiffre.
 */
const ITEMS_DECLARES: Record<string, string> = {
  '/eng/[id]/workpapers/[wid]': 'les gestes PAR NOTE de revue (traiter, clore) — un groupe par note',
  '/eng/[id]/testing': 'les onglets de pièce de l\'atelier — choisir une pièce parmi n, comme des onglets',
  '/methodology': 'la bande de sélection du fichier de méthode — un lien par fichier attendu',
};

function lancer(args: string[]): ChildProcess {
  const next = binaireDe('next', process.cwd());
  if (!next) throw new Error('next absent de node_modules — npm install dans app/');
  return spawn(process.execPath, [next, ...args], {
    env: { ...process.env, PORT: String(PORT), OTTO_OCR_ADAPTER: 'mock', OTTO_QUERY_PLANNER: 'mock', OTTO_TRANSCRIPT_ADAPTER: 'mock' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: groupeDetache(),
  });
}

/* Le code navigateur part en CHAÎNE : tsx/esbuild décore sinon les fonctions
   nommées d'un assistant __name qui n'existe pas dans la page (ReferenceError
   au premier evaluate — vécu, pas supposé). */
const COMPTER = `(() => {
  const rects = (e) => e.getClientRects().length > 0;
  const chrome = (e) => e.closest('.topbar') || e.closest('nav') || e.closest('.dossier-entete');
  const item = (e) => e.closest('table') || e.closest('[data-actions-item]')
                   || e.closest('.annotable') || e.closest('.note-voile');
  const repli = (e) => e.closest('details:not([open])');

  const commandes = [...document.querySelectorAll('button, a.btn, input[type=submit], input[type=button], [role=button]')];
  let actions = 0, repliees = 0, dItem = 0, inatteignables = 0;
  const listeInatteignables = [];
  for (const c of commandes) {
    if (chrome(c)) continue;
    if (item(c)) { dItem++; continue; }
    if (repli(c)) { repliees++; continue; }
    if (rects(c)) { actions++; continue; }
    inatteignables++;
    listeInatteignables.push((c.textContent || c.getAttribute('aria-label') || c.tagName).trim().slice(0, 60));
  }

  const saisies = [...document.querySelectorAll('input, textarea, select')];
  let champs = 0;
  for (const e of saisies) {
    const t = (e.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image'].includes(t)) continue;
    if (e.readOnly || e.disabled) continue;
    if (chrome(e) || item(e)) continue;
    /* repliés compris : replier un champ ne supprime pas la frappe. */
    if (!repli(e) && !rects(e)) continue;
    champs++;
  }

  const groupes = [...document.querySelectorAll('[data-actions-item]')].length;

  const h = document.querySelector('main h1, main h2, h1, h2');
  return {
    actions, repliees, dItem, champs, inatteignables, listeInatteignables, groupes,
    titre: h ? h.textContent.trim().replace(/\\s+/g, ' ').slice(0, 70) : '',
    longueur: (document.body.innerText || '').trim().length,
  };
})()`;

interface Compte {
  actions: number; repliees: number; dItem: number; champs: number;
  inatteignables: number; listeInatteignables: string[]; groupes: number; titre: string; longueur: number;
}
interface Ligne extends Compte { pattern: string }

/**
 * Le commit mesuré — et l'aveu quand l'arbre de travail en diffère.
 *
 * On ne peut pas connaître le hash d'un commit avant de le faire : la mesure
 * qui précède le commit porte donc le PARENT, plus la mention que l'arbre
 * était modifié. C'est ce que DA-13 demande — que le lecteur sache sur quoi
 * le tableau a été pris — et c'est tout ce qu'on peut honnêtement écrire.
 */
function commit(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const sale = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
    return sale ? `${sha} + arbre de travail modifié (mesure prise avant le commit qui la publie)` : sha;
  } catch { return 'inconnu'; }
}

/**
 * Le port est-il LIBRE ?
 *
 * POURQUOI (ADR-076, leçon déjà payée par le balayage) : un `next start`
 * oublié d'une exécution précédente tient le port. Le nôtre meurt sur
 * EADDRINUSE, la boucle d'attente voit répondre l'ANCIEN, et la mesure porte
 * sur un build que personne n'a produit. Mesurer ce qu'on n'a pas démarré,
 * c'est ne rien mesurer.
 */
async function portLibre(port: number): Promise<boolean> {
  try { await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) }); return false; }
  catch { return true; }
}

function buildId(): string {
  return fs.readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
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
  if (!(await portLibre(PORT))) {
    console.error(`densite : quelque chose répond déjà sur le port ${PORT} — mesurer un serveur qu'on n'a pas lancé ne mesure rien. Arrêtez-le (ou posez DENSITE_PORT).`);
    process.exit(1);
  }
  const { pretes } = await routes();
  const user = await auditeur();
  await closeDb();

  /* Le build ne doit pas BOUGER sous la mesure : une chaîne parallèle qui
     relance `next build` réécrit .next sous le serveur, des écrans partent en
     500 — et une mesure sans garde les publie en « 0 action ». C'est
     l'explication la plus probable du tableau faux de la première version. */
  const buildAvant = buildId();
  const serveur = lancer(['start', '-p', String(PORT)]);
  const fin = Date.now() + 120000;
  for (;;) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.status) break; } catch { /* pas encore debout */ }
    if (Date.now() > fin) { tuerArbre(serveur.pid!); throw new Error('serveur muet après 120 s'); }
    await new Promise((r) => setTimeout(r, 500));
  }

  const nav = await chromium.launch({ executablePath: cheminChromium() });
  /* Deux contextes : l'auditeur porte le cookie de session ; le portail client
     est une surface ANONYME — le mesurer connecté ne mesurerait pas l'écran
     que le client touche. */
  const ctxAuditeur = await nav.newContext();
  await ctxAuditeur.addCookies([{ name: 'otto_user', value: user, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const ctxAnonyme = await nav.newContext();

  const lignes: Ligne[] = [];
  const refus: string[] = [];
  const pages = pretes.filter((r) => r.kind === 'page' && (r.attendu ?? 200) === 200);
  for (const r of pages) {
    const p = await (r.as === 'anonymous' ? ctxAnonyme : ctxAuditeur).newPage();
    try {
      const rep = await p.goto(`http://localhost:${PORT}${r.url}`, { waitUntil: 'load' });
      const code = rep?.status() ?? 0;
      if (code !== 200) { refus.push(`${r.pattern} : HTTP ${code} (attendu 200) — ${r.url}`); continue; }
      await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
      const c = await p.evaluate(COMPTER) as Compte;
      if (!c.titre) { refus.push(`${r.pattern} : 200 sans titre lu (${c.longueur} caractères) — un écran qui ne rend rien n'est pas un écran`); continue; }
      /* L'EXCLUSION SE DÉCLARE, ELLE NE SE DEVINE PAS. Un compte de commandes
         ne distingue pas l'abus du cas légitime — la liste de notes du papier
         n'en portait qu'UNE le jour de la mesure, et une garde qui crie sur le
         cas juste finit désarmée. Alors l'écran qui exclut des gestes le
         DÉCLARE ici, avec sa raison écrite : poser le marqueur sur un écran
         non déclaré arrête la mesure, et la raison sort dans le document. */
      const nu = r.pattern.replace(' (SOX)', '');
      if (c.groupes > 0 && !(nu in ITEMS_DECLARES)) {
        refus.push(`${r.pattern} : ${c.groupes} groupe(s) data-actions-item non DÉCLARÉ(s) — inscrivez l'écran et sa raison dans ITEMS_DECLARES (scripts/mesures/densite.ts), ou retirez le marqueur`);
        continue;
      }
      if (c.inatteignables > 0) {
        refus.push(`${r.pattern} : ${c.inatteignables} commande(s) ni visible(s), ni repliée(s), ni d'item — ${c.listeInatteignables.join(' | ')}`);
        continue;
      }
      lignes.push({ pattern: r.pattern, ...c });
    } finally { await p.close(); }
  }
  await nav.close();
  tuerArbre(serveur.pid!);

  if (buildId() !== buildAvant) {
    console.error('densite : le build a changé PENDANT la mesure (.next réécrit) — rien n\'est publié.');
    process.exit(1);
  }
  if (refus.length) {
    console.error(`densite : ${refus.length} écran(s) impossible(s) à mesurer — RIEN n'est publié.`);
    for (const m of refus) console.error(`  ✗ ${m}`);
    process.exit(1);
  }

  lignes.sort((a, b) => b.actions - a.actions || b.champs - a.champs || a.pattern.localeCompare(b.pattern));
  const depassements = lignes.filter((l) => l.actions > PLAFOND);
  const md = [
    '<!-- ENGENDRÉ par `cd app && npm run densite` — ne pas éditer à la main. -->',
    `# Densité mesurée — ${lignes.length} écrans (build de production, base semée)`,
    '',
    `Mesure prise sur le commit \`${commit()}\`, build \`${fs.readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim()}\`.`,
    'Définitions : voir l\'en-tête de `app/scripts/mesures/densite.ts` (la mesure porte sa définition).',
    `Critère du mandat §3.D : aucun écran au-delà de **${PLAFOND} actions primaires** — ${depassements.length} dépassement(s).`,
    '',
    '« Repliées » et « d\'item » sont hors critère PAR CONCEPTION (repli piloté ADR-072, geste',
    'd\'objet) — et publiées ici précisément pour que replier ne devienne jamais un moyen de',
    'passer sous le seuil. « Champs à taper » compte les champs repliés : replier ne supprime',
    'pas la frappe. Le titre est celui LU dans la page — la preuve que la mesure a vu l\'écran.',
    '',
    'Écrans qui déclarent des gestes d\'OBJET (exclus du critère, raison écrite dans la mesure) :',
    ...Object.entries(ITEMS_DECLARES).map(([k, v]) => `- \`${k}\` — ${v}`),
    '',
    '| Écran | Actions primaires | Repliées | D\'item | Champs à taper | Titre lu |',
    '|---|---|---|---|---|---|',
    ...lignes.map((l) => `| \`${l.pattern}\` | ${l.actions > PLAFOND ? `**${l.actions}** ⚠` : l.actions} | ${l.repliees} | ${l.dItem} | ${l.champs} | ${l.titre.replace(/\|/g, '/')} |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(repoRoot(), 'docs', 'DENSITE.md'), md, 'utf8');
  const totalChamps = lignes.reduce((s, l) => s + l.champs, 0);
  console.log(`${lignes.length} écrans mesurés · ${depassements.length} au-delà de ${PLAFOND} actions primaires · ${totalChamps} champs à taper au total · docs/DENSITE.md écrit`);
  for (const d of depassements) console.log(`  ⚠ ${d.pattern} : ${d.actions} actions primaires`);
  process.exit(depassements.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
