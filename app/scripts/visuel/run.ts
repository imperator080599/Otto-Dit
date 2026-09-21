import { spawn, type ChildProcess } from 'node:child_process';
import { binaireDe, groupeDetache, tuerArbre, cheminChromium, conseilChromium } from '../lib/portable.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { getDb } from '../../src/lib/db/client';
import { routes, auditeur, baseSemee } from '../screens/routes';
import { verifierEpure } from '../../src/lib/epure';

// npm run visuel : la revue VISUELLE, en clair et en sombre, en large et à 390 px.
//
// CE QU'ELLE AJOUTE AU BALAYAGE. `npm run screens` vérifie qu'une route REND ;
// il ne regarde pas ce qu'elle donne à voir. Un écran peut rendre 200, ne rien
// lever, et déborder de trois cents pixels sur un téléphone — ou écrire du gris
// clair sur blanc. Ce harnais mesure les deux choses qu'une machine sait
// mesurer honnêtement : le DÉBORDEMENT horizontal et le CONTRASTE du texte.
//
// Ce qu'il ne prétend pas faire : juger une mise en page. Il produit aussi les
// captures, et c'est un humain qui les regarde.

const PORT = Number(process.env.VISUEL_PORT ?? 3214);
const NAVIGATEUR = cheminChromium();
const SORTIE = process.env.VISUEL_SORTIE ?? path.join(process.cwd(), '.visuel');
/* LE CHEMIN NE DÉPEND PAS D'OÙ L'ON LANCE (même leçon que scripts/clics/run.ts). */
const APP = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

interface Defaut { route: string; vue: string; quoi: string; detail: string }

/**
 * P0-06 (EPURE-01). Les motifs interdits (src/lib/epure.ts) sont comptés en AVERTISSEMENT sous
 * un plafond figé PAR MOTIF — jamais un refus bloquant ici (ça, c'est P5-05). Le fichier des
 * plafonds n'existe pas encore à la première exécution : dans ce cas, AUCUN plafond n'existe et
 * tout dépassement (même 1) bloque — jamais une carte blanche silencieuse.
 */
interface PlafondsEpure { plafonds: Record<string, number> }

function lirePlafondsEpure(): PlafondsEpure {
  const chemin = path.join(APP, '..', 'docs', 'instantanes', 'visuel-avertissements.json');
  if (!fs.existsSync(chemin)) return { plafonds: {} };
  return JSON.parse(fs.readFileSync(chemin, 'utf8')) as PlafondsEpure;
}

/** Le débordement horizontal, et QUI déborde. « La page déborde » sans le
 *  coupable oblige à tout rouvrir à la main. */
/* LE CODE DU NAVIGATEUR EST PASSÉ EN TEXTE, ET C'EST OBLIGATOIRE ICI.
   `tsx` compile ce fichier avec esbuild, qui décore les fonctions nommées d'un
   appel à `__name` — un helper qui n'existe QUE dans notre processus. Envoyé
   tel quel dans la page, le code lève « __name is not defined » et la mesure
   n'a pas lieu. On envoie donc du texte, que le navigateur évalue seul. */
const CODE_DEBORDEMENTS = `(() => {
  var large = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth <= large + 1) return [];
  var coupables = [];
  var els = Array.prototype.slice.call(document.querySelectorAll('body *'));
  for (var i = 0; i < els.length && coupables.length < 4; i++) {
    var el = els[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > large + 1 || r.left < -1) {
      var parent = el.parentElement;
      var deja = false;
      for (var j = 0; j < coupables.length; j++) {
        if (parent && coupables[j].indexOf(parent.tagName.toLowerCase()) === 0) deja = true;
      }
      if (deja) continue;
      var cls = (el.className && typeof el.className === 'string')
        ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      coupables.push(el.tagName.toLowerCase() + cls
        + ' (' + Math.round(r.width) + 'px, deborde de ' + Math.round(r.right - large) + 'px)');
    }
  }
  return coupables;
})()`;

const CODE_CONTRASTES = `(() => {
  function lum(c) {
    var m = String(c).match(/\\d+(\\.\\d+)?/g);
    if (!m || m.length < 3) return -1;
    var v = m.slice(0, 3).map(Number).map(function (x) {
      var s = x / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function fond(el) {
    var n = el;
    while (n) {
      var bg = getComputedStyle(n).backgroundColor;
      if (bg && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) return bg;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  }
  var mauvais = [], vus = {};
  var els = Array.prototype.slice.call(document.querySelectorAll('body *'));
  for (var i = 0; i < els.length && mauvais.length < 4; i++) {
    var el = els[i];
    var aDuTexte = false;
    for (var k = 0; k < el.childNodes.length; k++) {
      var n = el.childNodes[k];
      if (n.nodeType === 3 && String(n.textContent).trim().length > 2) aDuTexte = true;
    }
    if (!aDuTexte) continue;
    var st = getComputedStyle(el);
    if (parseFloat(st.opacity) < 0.4) continue;
    var l1 = lum(st.color), l2 = lum(fond(el));
    if (l1 < 0 || l2 < 0) continue;
    var ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio >= 3) continue;
    var cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
    var cle = el.tagName.toLowerCase() + cls;
    if (vus[cle]) continue;
    vus[cle] = 1;
    mauvais.push(cle + ' - ' + ratio.toFixed(2) + ':1 (' + st.color + ' sur ' + fond(el) + ')');
  }
  return mauvais;
})()`;

/** Le débordement horizontal, et QUI déborde. « La page déborde » sans le
 *  coupable oblige à tout rouvrir à la main. */
async function debordements(page: Page): Promise<string[]> {
  return page.evaluate(CODE_DEBORDEMENTS) as Promise<string[]>;
}

/** Le contraste du texte contre son fond, comme le WCAG le définit. Sous 4,5:1
 *  un corps de texte n'est pas lisible pour tout le monde ; sous 3:1 il ne l'est
 *  pour personne, et c'est ce seuil-là qu'on refuse. */
async function contrastes(page: Page): Promise<string[]> {
  return page.evaluate(CODE_CONTRASTES) as Promise<string[]>;
}

/* `next` exécuté par le Node courant, jamais via `npx` (introuvable sous
   Windows sans shell — scripts/lib/portable.mjs). */
const BIN_NEXT = binaireDe('next', process.cwd());
function lancer(args: string[]): ChildProcess {
  if (!BIN_NEXT) throw new Error('next est absent de node_modules — lancez `npm install` dans app/');
  return spawn(process.execPath, [BIN_NEXT, ...args], {
    env: { ...process.env, PORT: String(PORT), OTTO_OCR_ADAPTER: 'mock' },
    stdio: ['ignore', 'pipe', 'pipe'], detached: groupeDetache(),
  });
}
function tuer(p: ChildProcess | null): void {
  if (p?.pid) tuerArbre(p.pid);
}
async function portLibre(port: number): Promise<boolean> {
  try { await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) }); return false; }
  catch { return true; }
}
async function attendre(url: string, enfant: ChildProcess, secondes = 150): Promise<void> {
  const fin = Date.now() + secondes * 1000;
  while (Date.now() < fin) {
    if (enfant.exitCode !== null) throw new Error(`le serveur s'est arrêté (code ${enfant.exitCode})`);
    try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); if (r.status > 0) return; }
    catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`le serveur n'est pas debout après ${secondes}s`);
}

/* P0-04 (AUD-17). Même filtre que `screens/run.ts` : `--routes=<motif>[,<motif>…]` limite la
   revue visuelle aux routes dont `pattern` contient l'un des motifs — sous-chaîne, pas regex. */
function filtrerRoutes<T extends { pattern: string }>(rs: T[]): T[] {
  const motif = process.argv.find((a) => a.startsWith('--routes='))?.slice('--routes='.length);
  if (!motif) return rs;
  const motifs = motif.split(',').map((m) => m.trim()).filter(Boolean);
  return rs.filter((r) => motifs.some((m) => r.pattern.includes(m)));
}

const VUES = [
  { nom: 'clair-large', largeur: 1280, hauteur: 900, schema: 'light' as const },
  { nom: 'sombre-large', largeur: 1280, hauteur: 900, schema: 'dark' as const },
  { nom: 'clair-390', largeur: 390, hauteur: 844, schema: 'light' as const },
  { nom: 'sombre-390', largeur: 390, hauteur: 844, schema: 'dark' as const },
];

async function main() {
  const dev = process.argv.includes('--dev');
  if (!(await baseSemee())) throw new Error('base vide : lancez `npm run db:setup && npm run demo:seed`');
  if (!(await portLibre(PORT))) {
    throw new Error(`le port ${PORT} est occupé — la revue REFUSE de regarder un serveur qu'elle n'a pas lancé.`);
  }
  const { pretes: toutesLesRoutes, nonResolues } = await routes();
  const pretes = filtrerRoutes(toutesLesRoutes);
  const cookie = await auditeur();
  await (await getDb()).close();
  if (nonResolues.length) throw new Error('routes non résolues : ' + nonResolues.join(', '));

  const pages = pretes.filter((r) => r.kind === 'page');
  console.log(`\nRevue visuelle — ${pages.length} écrans × ${VUES.length} vues, mode ${dev ? 'développement' : 'PRODUCTION'}\n`);

  if (!dev) {
    console.log('  build…');
    const build = lancer(['build']);
    const sortie: string[] = [];
    build.stdout?.on('data', (d) => sortie.push(String(d)));
    build.stderr?.on('data', (d) => sortie.push(String(d)));
    const code = await new Promise<number>((r) => build.on('close', (c) => r(c ?? 1)));
    if (code !== 0) { console.log(sortie.join('')); throw new Error('le build a échoué'); }
  }

  fs.rmSync(SORTIE, { recursive: true, force: true });
  fs.mkdirSync(SORTIE, { recursive: true });

  const serveur = lancer(dev ? ['dev', '-p', String(PORT)] : ['start', '-p', String(PORT)]);
  const defauts: Defaut[] = [];
  const epureParMotif = new Map<string, Set<string>>();
  let vues = 0;
  try {
    await attendre(`http://localhost:${PORT}/`, serveur);
    const nav = await chromium.launch({ executablePath: NAVIGATEUR })
      .catch((e) => { throw new Error(`${conseilChromium()}\n${e.message}`); });
    try {
      for (const vue of VUES) {
        /* DEUX CONTEXTES, PAS UN. Le portail client est une surface ANONYME :
           le regarder avec le cookie auditeur montrait le nom de l'associé en
           haut d'un écran destiné au client — on relisait le mauvais écran. */
        const faire = async (avecCookie: boolean, lot: typeof pages) => {
          if (!lot.length) return;
          const ctx = await nav.newContext({
            viewport: { width: vue.largeur, height: vue.hauteur },
            colorScheme: vue.schema,
            deviceScaleFactor: 1,
          });
          if (avecCookie) {
            await ctx.addCookies([{ name: 'otto_user', value: cookie, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
          }
          const page = await ctx.newPage();
          for (const r of lot) {
            const reponse = await page.goto(`http://localhost:${PORT}${r.url}`, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
            await page.waitForTimeout(200);
            vues++;
            /* P0-06 : un statut >= 400 est un échec RÉEL — jamais un défaut visuel compté, jamais
               une capture qui prétendrait avoir « regardé » un écran qui a refusé de rendre. UN
               404 DÉCLARÉ (`route.attendu`, screens/routes.ts) reste légitime : le lien de
               démonstration qui n'existe que sur la démo publique, le dossier scellé absent —
               même discipline que scripts/screens/sweep.ts, jamais une seconde règle qui les
               contredirait. */
            const statutOk = r.attendu !== undefined
              ? reponse?.status() === r.attendu
              : !!reponse && reponse.status() < 400;
            if (!statutOk) {
              const note = r.attendu !== undefined ? ` (${r.attendu} attendu — ${r.pourquoi})` : '';
              defauts.push({ route: r.pattern, vue: vue.nom, quoi: 'statut', detail: `HTTP ${reponse?.status() ?? '(aucune réponse)'}${note}` });
              continue;
            }
            const nom = r.pattern.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'accueil';
            await page.screenshot({ path: path.join(SORTIE, `${vue.nom}__${nom}.png`), fullPage: false });
            for (const d of await debordements(page)) defauts.push({ route: r.pattern, vue: vue.nom, quoi: 'débordement', detail: d });
            for (const c of await contrastes(page)) defauts.push({ route: r.pattern, vue: vue.nom, quoi: 'contraste', detail: c });
            /* P0-06 (EPURE-01, S-1) : le TEXTE rendu, jamais le HTML — un motif interdit qui vit
               dans un attribut invisible (aria-label dupliqué, title) n'atteint pas l'œil de
               l'auditeur, donc ne compte pas ici. Une route peut être vue plusieurs fois (quatre
               vues : clair/sombre × large/390) ; un motif compte une fois PAR ROUTE, jamais une
               fois par vue — le texte ne change pas avec le viewport, et le multiplier par 4
               gonflerait le plafond sans rien mesurer de réel. */
            const texte = await page.evaluate(() => document.body.innerText).catch(() => '');
            for (const id of verifierEpure(texte)) {
              if (!epureParMotif.has(id)) epureParMotif.set(id, new Set());
              epureParMotif.get(id)!.add(r.pattern);
            }
          }
          await ctx.close();
        };
        await faire(true, pages.filter((r) => r.as === 'auditor'));
        await faire(false, pages.filter((r) => r.as === 'anonymous'));
      }
    } finally {
      await nav.close();
    }
  } finally {
    tuer(serveur);
  }

  /* LE HARNAIS NE DOIT PAS POUVOIR SE TAIRE : zéro vue regardée est une panne,
     pas une revue sans défaut. */
  if (vues < pages.length * VUES.length) {
    console.log(`\nseulement ${vues} vues sur ${pages.length * VUES.length} — la revue s'est interrompue\n`);
    process.exit(1);
  }
  for (const d of defauts) console.log(`  ${d.quoi.padEnd(12)} ${d.vue.padEnd(13)} ${d.route.padEnd(34)} ${d.detail}`);

  /* P0-06 (EPURE-01) : le compte par motif s'imprime TOUJOURS, même à zéro dépassement — un
     harnais qui ne dit rien de ce qu'il a compté est le silence que la règle 13 nomme. */
  const { plafonds } = lirePlafondsEpure();
  const depassements: string[] = [];
  if (epureParMotif.size) {
    console.log('\nMotifs interdits (EPURE-01, S-1) — comptés par ROUTE distincte :');
    for (const [id, routesTouchees] of [...epureParMotif.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const n = routesTouchees.size;
      const plafond = plafonds[id];
      const etat = plafond === undefined ? 'AUCUN PLAFOND CONNU' : n > plafond ? `DÉPASSE le plafond ${plafond}` : `≤ plafond ${plafond}`;
      console.log(`  · ${id} : ${n} route(s) — ${etat}`);
      if (plafond === undefined || n > plafond) depassements.push(`${id} : ${n} route(s) (${[...routesTouchees].join(', ')})`);
    }
  }

  console.log(`\n${vues} vues regardées · ${defauts.length} défaut(s) · captures dans ${SORTIE}\n`);
  if (defauts.length || depassements.length) {
    if (depassements.length) {
      console.log('Dépassements EPURE-01 :');
      for (const d of depassements) console.log(`  · ${d}`);
    }
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
