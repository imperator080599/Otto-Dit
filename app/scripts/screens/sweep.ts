import { chromium, type Browser, type Page } from 'playwright';
import type { Route } from './routes';
import { cheminChromium, conseilChromium } from '../lib/portable.mjs';

// LE BALAYAGE : ouvrir chaque écran pour de vrai, et ÉCHOUER SUR CE QUI NE REND PAS.
//
// Pourquoi un navigateur et pas un simple fetch : un fetch voit le code HTTP,
// pas une erreur de rendu côté client, pas une exception d'hydratation, pas un
// écran qui s'affiche vide parce qu'un composant a explosé après l'envoi du
// HTML. Le défaut d'ADR-076 se voyait au code HTTP ; le suivant ne se verra
// peut-être pas.
//
// CE QUI COMPTE AUTANT QUE LES CONTRÔLES : LE HARNAIS NE DOIT PAS POUVOIR SE
// TAIRE. Un balayage qui n'ouvre rien et sort en vert est pire qu'aucun
// balayage. On vérifie donc qu'il a ouvert le nombre de routes attendu, et
// zéro route ouverte est une ERREUR, pas un succès.

export interface Verdict {
  route: Route;
  status: number;
  /** Erreurs de page (exceptions JS non rattrapées) et erreurs de console. */
  erreurs: string[];
  /** Longueur du texte visible — un écran vide se signale. */
  texte: number;
  ok: boolean;
}

/**
 * Les bruits de fond qu'on ne compte pas comme des défauts.
 *
 * « Failed to load resource » est filtré ICI parce qu'une ressource en échec
 * est jugée sur son URL par le gestionnaire `response` ci-dessous, qui la
 * NOMME. Le message de console, lui, ne dit pas quoi : le garder revenait à
 * signaler deux fois le même incident, dont une fois sans pouvoir dire lequel —
 * et surtout à contourner le filtre par URL, donc à signaler un favicon absent
 * comme un défaut d'écran.
 */
function bruit(m: string): boolean {
  return /Download the React DevTools|Failed to load resource/i.test(m);
}

/* Une ressource 404 se juge sur son URL, pas sur le texte du message : la
   console dit « Failed to load resource: … 404 » sans dire QUOI, et filtrer sur
   ce texte reviendrait à ignorer tous les 404, y compris ceux qui comptent. */
function ressourceIgnorable(url: string): boolean {
  return /\/favicon\.ico$|\/apple-touch-icon|\/robots\.txt$/.test(url);
}

/** Le serveur répond-il encore ? */
async function debout(base: string): Promise<boolean> {
  try {
    const r = await fetch(base + '/', { signal: AbortSignal.timeout(4000) });
    return r.status > 0;
  } catch { return false; }
}

export class ServeurTombe extends Error {
  constructor(readonly apres: number, readonly derniere: string) {
    super(`le serveur est tombé après ${apres} route(s), à « ${derniere} » — les routes suivantes `
      + `n'ont pas été vérifiées et ne sont PAS déclarées en panne`);
    this.name = 'ServeurTombe';
  }
}

export async function balayer(
  base: string,
  liste: Route[],
  cookieAuditeur: string,
): Promise<Verdict[]> {
  const b: Browser = await chromium.launch({
    /* undefined ⇒ Playwright résout SON navigateur installé — le chemin du
       conteneur n'existe que sur la machine de développement (portable.mjs). */
    executablePath: cheminChromium(),
  }).catch((e) => { throw new Error(`${conseilChromium()}\n${e.message}`); });
  const verdicts: Verdict[] = [];
  try {
    for (const route of liste) {
      const ctx = await b.newContext();
      if (route.as === 'auditor') {
        await ctx.addCookies([{
          name: 'otto_user', value: cookieAuditeur,
          domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax',
        }]);
      }
      const erreurs: string[] = [];
      let status = 0;
      let texte = 0;

      if (route.kind === 'api') {
        /* Une route d'API n'a rien à rendre, et certaines renvoient un FICHIER :
           `page.goto` y échoue avec « Download is starting », ce qui ferait
           passer un téléchargement réussi pour une panne. On l'interroge donc
           avec une requête, qui est l'instrument juste pour cette surface. */
        try {
          const rep = await ctx.request.get(base + route.url, { timeout: 45000, maxRedirects: 5 });
          status = rep.status();
        } catch (e) {
          erreurs.push(`requête : ${(e as Error).message}`);
        }
        await ctx.close();
        const okApi = route.attendu !== undefined
          ? status === route.attendu && erreurs.length === 0
          : status > 0 && status < 400 && erreurs.length === 0;
        verdicts.push({ route, status, erreurs, texte: 0, ok: okApi });
        if (process.env.SCREENS_SILENCIEUX !== '1') {
          const note = route.attendu !== undefined ? `  (${route.attendu} attendu — ${route.pourquoi})` : '';
          process.stdout.write(`${okApi ? '  ok  ' : '  ÉCHEC'} ${route.pattern.padEnd(42)} ${status}${note}\n`);
        }
        continue;
      }

      const page: Page = await ctx.newPage();
      page.on('pageerror', (e) => erreurs.push(`exception : ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !bruit(m.text())) erreurs.push(`console : ${m.text()}`);
      });
      page.on('response', (r) => {
        if (r.status() >= 400 && !ressourceIgnorable(r.url())) {
          erreurs.push(`ressource ${r.status()} : ${r.url().replace(base, '')}`);
        }
      });

      try {
        const rep = await page.goto(base + route.url, { waitUntil: 'load', timeout: 30000 });
        status = rep?.status() ?? 0;
        /* Une exception d'hydratation arrive APRÈS le chargement. On laisse
           donc respirer — mais brièvement : `networkidle` attend 500 ms de
           silence réseau et plafonnait à 20 s par écran, soit un quart d'heure
           pour quarante-huit routes. Un harnais qu'on n'a pas le temps de
           lancer ne sera pas lancé. */
        await page.waitForTimeout(250);
        texte = (await page.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0));
      } catch (e) {
        erreurs.push(`navigation : ${(e as Error).message}`);
      }
      await ctx.close();

      /* UN SERVEUR MORT N'EST PAS QUARANTE ÉCRANS CASSÉS. Sans ce contrôle, la
         première panne du serveur transforme toutes les routes restantes en
         échecs, le rapport devient illisible et le vrai défaut se noie dans
         quarante faux. C'est un compteur qui compte mal ses plantages. */
      if (status === 0 && !(await debout(base))) {
        throw new ServeurTombe(verdicts.length, route.pattern);
      }

      /* Un 3xx est légitime (le portail redirige, une garde renvoie à
         l'accueil) ; un 4xx/5xx ne l'est pas. Une page qui rend moins de
         40 caractères visibles est vide : c'est le symptôme d'un composant
         qui a explosé après l'envoi du HTML. */
      /* Une route peut DÉCLARER son statut attendu (le dossier scellé répond
         404 tant qu'il n'y en a pas). L'attente est explicite et affichée : un
         200 inattendu échoue autant qu'un 404 inattendu. */
      const ok = route.attendu !== undefined
        ? status === route.attendu && erreurs.length === 0
        : status > 0 && status < 400 && erreurs.length === 0 && texte >= 40;
      verdicts.push({ route, status, erreurs, texte, ok });
      /* Rendu au fil de l'eau : un harnais qui n'affiche rien pendant dix
         minutes est indistinguable d'un harnais bloqué. */
      if (process.env.SCREENS_SILENCIEUX !== '1') {
        const note = route.attendu !== undefined ? `  (${route.attendu} attendu — ${route.pourquoi})` : '';
        process.stdout.write(`${ok ? '  ok  ' : '  ÉCHEC'} ${route.pattern.padEnd(42)} ${status}${note}\n`);
      }
    }
  } finally {
    await b.close();
  }
  return verdicts;
}

/**
 * Les erreurs SERVEUR relevées dans le journal pendant le balayage.
 *
 * POURQUOI CE CONTRÔLE EXISTE, et il a servi le jour où il a été écrit : le
 * premier balayage a rendu 48 routes en 200 pendant que le serveur levait
 * « Functions cannot be passed directly to Client Components » à chaque
 * chargement d'un écran. Aucune route n'était en faute au sens HTTP, et
 * l'erreur ne serait jamais remontée. Un serveur qui hurle dans son journal
 * pendant qu'on lui dit « tout va bien » est le silence lu comme un succès,
 * une couche plus bas.
 */
export function erreursServeur(journal: string): string[] {
  const lignes = journal.split('\n');
  const vues = new Set<string>();
  const out: string[] = [];
  for (const l of lignes) {
    if (!/⨯|unhandledRejection|uncaughtException/.test(l)) continue;
    const cle = l.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!cle || vues.has(cle)) continue;
    vues.add(cle);
    out.push(cle);
  }
  return out;
}

/** Récapitulatif des ÉCHECS seuls (le détail au fil de l'eau a déjà tout dit). Rend leur nombre. */
export function rapporter(verdicts: Verdict[], nonResolues: string[]): number {
  let echecs = 0;
  if (verdicts.length || nonResolues.length) console.log('Échecs :');
  for (const v of verdicts) {
    const motif = !v.ok
      ? (v.status >= 400 || v.status === 0 ? `HTTP ${v.status}` : '')
        + (v.erreurs.length ? ` ${v.erreurs.length} erreur(s) : ${v.erreurs[0].slice(0, 160)}` : '')
        + (v.route.kind === 'page' && v.texte < 40 && v.status > 0 && v.status < 400 ? ` écran VIDE (${v.texte} caractères)` : '')
      : '';
    if (!v.ok) echecs++;
    console.log(`${v.ok ? '  ok  ' : '  ÉCHEC'} ${v.route.pattern.padEnd(42)} ${v.ok ? `${v.status} · ${v.texte} car.` : motif}`);
  }
  for (const n of nonResolues) {
    echecs++;
    console.log(`  ÉCHEC ${n} — non couverte, et une route non couverte est un écran non vérifié`);
  }
  return echecs;
}
