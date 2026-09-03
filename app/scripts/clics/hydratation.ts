import type { Page, Response } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { divergences, direEcart, type Ecart } from '../../src/lib/core/hydratation';

// L'INSTRUMENT DU #418 (fil n°7 ; mandat du soir, étage 0.4).
//
// CE QUE L'INSTRUCTION A ÉTABLI, DANS LE BUNDLE SERVI, ET QUI CHANGE L'OUTIL :
//
//  1. LE MESSAGE PORTE DÉJÀ LE DISCRIMINANT. `throwOnHydrationMismatch`
//     (react-dom-client.production.js) construit
//     `…/errors/418?args[]=<HTML|text>&args[]=`. `text` = un NŒUD DE TEXTE
//     diffère (donnée, locale, nombre) ; `HTML` = la STRUCTURE diffère (type ou
//     nombre d'éléments), ce qui oriente vers un flux tronqué. Les deux
//     occurrences déjà consignées dans ce dépôt portent `args[]=HTML`
//     (docs/SOIR.md, docs/BACKLOG_REPORTE.md) — et le dépôt les glosait à
//     l'envers, « un contenu texte rendu différemment ».
//
//  2. AUCUNE FRONTIÈRE D'ERREUR NE VERRA JAMAIS UN #418. Une incohérence
//     d'hydratation est RÉCUPÉRABLE : React la signale par
//     `onRecoverableError` → `reportGlobalError` → `window.reportError`, hors
//     bande. `componentDidCatch` ne la voit pas. Écrire une frontière d'erreur
//     — ce que le mandat demandait — aurait donné un détecteur MUET (règle 13).
//     L'écouteur `pageerror` de Playwright, lui, la reçoit.
//
//  3. LES CARTES DE SOURCES NE DONNERONT PAS LE COMPOSANT. Le diff lisible
//     (`describeDiff`) n'existe que dans le build de DÉVELOPPEMENT de React :
//     une carte de sources dé-mangle une pile, elle ne fabrique pas une
//     information que le build de production ne calcule pas.
//
// CE QUE CET INSTRUMENT FAIT DONC À LA PLACE : il conserve, pour chaque
// document servi, le HTML EXACT de la réponse, et le compare au DOM au moment
// même où React signale l'incohérence. Le texte serveur ne vient PAS d'une
// seconde requête — ce serait un autre rendu, donc une autre preuve (règle 16).
//
// OÙ IL CESSE DE REGARDER : il ne nomme pas le COMPOSANT (le build de
// production ne le calcule pas) ; il ne voit rien d'une divergence que React
// répare avant de la signaler ; et il ne dit rien de l'instance déployée, où
// Playwright ne tourne pas.

export interface Incident {
  code: number;
  /** `HTML` (structure) ou `text` (nœud de texte) — l'`args[]` du message. */
  genre: string;
  urlErreur: string;
  urlDocument: string;
  /** Faux = l'exception est MAL ÉTIQUETÉE : elle vient du document précédent. */
  memePage: boolean;
  station: string;
  localeServie: string | null;
  /** La réponse du document s'est-elle terminée sans coupure ? */
  fluxComplet: boolean;
  octetsServis: number;
  fichierServeur: string;
  fichierClient: string;
  /* TOUTES les divergences, jamais la première seule : sur les incidents
     du 3 septembre, la première était l'astuce du rail — rendue dans un
     `useEffect`, donc saine — et elle masquait ce qui suivait. */
  ecarts: Ecart[];
  pile: string;
}

const CODE = /Minified React error #(\d+)/;
const ARGS = /args\[\]=([^&\s]*)/;

export interface Sonde {
  incidents: Incident[];
  station: (nom: string) => void;
  rapport: () => string[];
}

export function poserLaSonde(page: Page, base: string, dossier: string): Sonde {
  fs.mkdirSync(dossier, { recursive: true });
  const incidents: Incident[] = [];
  let station = '(avant la première station)';
  let dernier: { url: string; html: string; complet: boolean } | null = null;

  page.on('response', (r: Response) => {
    if (r.request().resourceType() !== 'document') return;
    void (async () => {
      try {
        dernier = { url: r.url(), html: await r.text(), complet: true };
      } catch (e) {
        /* LE FLUX COUPÉ NE SE TAIT PAS : c'est l'hypothèse que `args[]=HTML`
           désigne en premier, et l'avaler reproduirait le défaut qu'on
           instrumente (règle 13). */
        dernier = { url: r.url(), html: '', complet: false };
        console.log(`  (flux de document COUPÉ sur ${r.url()} — ${(e as Error).message.slice(0, 80)})`);
      }
    })();
  });

  page.on('pageerror', (e) => {
    const m = CODE.exec(e.message);
    if (!m) return;
    const code = Number(m[1]);
    if (![418, 419, 422, 423, 425].includes(code)) return;
    const urlErreur = page.url();
    const vu = dernier;
    void (async () => {
      /* Capté au plus tôt : chaque milliseconde de plus laisse les effets
         réécrire le DOM et salir le diff. */
      const client = await page.evaluate(() => document.documentElement.outerHTML).catch(() => '');
      const lang = await page.evaluate(() => document.documentElement.lang).catch(() => null);
      const n = incidents.length;
      const fServeur = path.join(dossier, `${n}-serveur.html`);
      const fClient = path.join(dossier, `${n}-client.html`);
      fs.writeFileSync(fServeur, vu?.html ?? '');
      fs.writeFileSync(fClient, client);
      incidents.push({
        code,
        genre: ARGS.exec(e.message)?.[1] ?? '(absent)',
        urlErreur: urlErreur.replace(base, '') || '/',
        urlDocument: (vu?.url ?? '').replace(base, ''),
        memePage: (vu?.url ?? '') === urlErreur,
        station,
        localeServie: lang,
        fluxComplet: vu?.complet ?? false,
        octetsServis: vu?.html.length ?? 0,
        fichierServeur: fServeur,
        fichierClient: fClient,
        ecarts: divergences(vu?.html ?? '', client),
        pile: (e.stack ?? '').split('\n').slice(0, 8).join('\n'),
      });
    })();
  });

  return {
    incidents,
    station: (nom: string) => { station = nom; },
    rapport: () => {
      if (!incidents.length) return ['sonde d’hydratation : aucun incident'];
      const l: string[] = [`sonde d’hydratation : ${incidents.length} incident(s)`];
      for (const i of incidents) {
        l.push(`  #${i.code} (${i.genre}) — station « ${i.station} »`);
        l.push(`    erreur sur ${i.urlErreur} · document ${i.urlDocument}`
          + (i.memePage ? '' : '  ← MAL ÉTIQUETÉE : l’erreur vient du document PRÉCÉDENT'));
        l.push(`    flux ${i.fluxComplet ? 'complet' : 'COUPÉ'} · ${i.octetsServis} octets · lang="${i.localeServie}"`);
        if (i.ecarts.length === 0) l.push('    aucune divergence textuelle après normalisation');
        else {
          l.push(`    ${i.ecarts.length} divergence(s) après normalisation :`);
          for (const e of i.ecarts) for (const ligne of direEcart(e).split('\n')) l.push(`    ${ligne}`);
        }
        l.push(`    ${i.fichierServeur}`);
      }
      /* CE QUE LES TROIS CHAMPS TRANCHENT, écrit ici pour que la lecture ne
         dépende pas d'un document annexe. */
      l.push('  lecture : memePage=faux ⇒ artefact de harnais (flux du document précédent coupé par la navigation) ·');
      l.push('            memePage=vrai + flux COUPÉ + HTML ⇒ flux tronqué sur la page même ·');
      l.push('            memePage=vrai + flux complet + text ⇒ vraie divergence de donnée, nommée ci-dessus ·');
      l.push('            memePage=vrai + flux complet + HTML ⇒ divergence de structure réelle.');
      return l;
    },
  };
}
