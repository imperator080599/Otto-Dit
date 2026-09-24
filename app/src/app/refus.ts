import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { conduire } from '@/lib/core/sonde';
import { getSessionUser } from '@/lib/core/auth';
import { withTenant } from '@/lib/db/tenant';
import { estUnSignalDeControleDeFlux } from '@/lib/db/client';
import { Refus } from '@/lib/core/refus';
import { ecrireErreur, empreinte } from '@/lib/erreurs-serveur';
import { tr } from '@/lib/i18n';

// UN REFUS S'AFFICHE — IL NE TOMBE PAS EN 500.
//
// CE QUE LE PARCOURS CLIQUÉ A TROUVÉ. Dix écrans exécutaient leurs actions sans
// aucune gestion d'erreur : tout refus du service — « une sélection tirée dépend
// du grand livre », « une résolution générique est rejetée », « la conclusion
// exige une réponse au dépassement » — remontait jusqu'au rendu et produisait
// une PAGE 500. Sur un build de production, le message est même masqué :
// l'utilisateur voit une page cassée là où le produit lui parlait.
//
// C'était invisible aux trois harnais : les tests appellent le service (le refus
// est correct), le balayage OUVRE la page (200), et personne ne cliquait le
// bouton. Il a fallu cliquer pour le voir (ADR-091).
//
// La règle du dépôt était déjà écrite — « un refus calculé puis jeté est le
// défaut à traquer » — mais elle n'était appliquée qu'aux écrans qui avaient un
// module d'actions. Elle vaut partout, donc elle vit ici.

/* `redirect()` et `notFound()` de Next SIGNALENT en levant. Une action qui
   redirige elle-même — la génération de demande part sur la demande créée —
   lève donc un « NEXT_REDIRECT » qui n'est pas une erreur. Ne pas le laisser
   passer transforme une navigation réussie en refus affiché : le parcours
   cliqué a montré « refusé : NEXT_REDIRECT » à l'utilisateur.
   C'est le défaut que ce fichier corrige, reproduit dans sa correction.
   LA DÉFINITION VIT DÉSORMAIS DANS lib/db/client.ts (R37, docs/CHASSE.md
   §3) : `tx()` en a besoin au MÊME titre — une transaction qui annule un
   signal de contrôle de flux comme une vraie erreur perd l'écriture que ce
   fichier croyait avoir sauvée. Réexportée ici pour ne rien casser de ce qui
   l'importait déjà sous ce nom. */
export const estUnSignalDeNext = estUnSignalDeControleDeFlux;

/** Le paramètre d'URL qui porte le refus — lu par BandeauRefus et par les harnais. */
const CLE_REFUS = 'erreur';

/* P1-09 (AUD-14) — LA FRONTIÈRE PANNE/REFUS SUR LES ~370 `throw new Error` NON
 * MIGRÉS VERS `Refus` (`grep -c` mesuré à la migration : 304 dans lib/services+core
 * hors tests, 66 codés migrés vers `Refus` dans cette même tranche). CE FICHIER
 * NE PEUT PAS DISTINGUER À COUP SÛR « une phrase française écrite exprès » d'
 * « un message technique » par la SEULE forme d'un `Error` — les deux sont
 * `instanceof Error`. La démonstration que ce n'est PAS un choix arbitraire :
 * `grille.ts` traite déjà `(e as {code?:string})?.code === '23505'` comme LE
 * signal d'une violation de contrainte PostgreSQL (SQLSTATE, 5 caractères) —
 * c'est le même signal qu'on généralise ici, pas un nouveau.
 *
 * DONC : un rejet EST une panne (message technique jamais montré, ligne
 * `server_error`, référence à l'écran) s'il n'est PAS une `Error` (une chaîne,
 * `undefined`, un objet jeté à la main), OU si c'est un SOUS-TYPE NATIF de JS
 * qui signale un vrai bogue (`TypeError`, `RangeError`, `ReferenceError`,
 * `SyntaxError`, `EvalError`, `URIError` — leur message parle du moteur JS,
 * jamais de l'audit), OU s'il porte un `.code` au format SQLSTATE (l'erreur
 * vient du pilote PostgreSQL, jamais du service).
 *
 * CORRIGÉ APRÈS REVUE HOSTILE (voix 1, P1-09) : la première version testait
 * `e.constructor !== Error` — trop large. Le dépôt définit ses PROPRES
 * sous-classes d'erreur pour des refus métier légitimes, au corps vide
 * (`class PropositionDejaStatuee extends Error {}`, `propositions.ts`) : leur
 * message porte la même forme « CODE : phrase » qu'un `new Error(...)` nu,
 * mais `e.constructor !== Error` les aurait classées PANNE à tort — un refus
 * bien formé, jamais affiché, remplacé par le message générique. Encore
 * dormant en Phase 1 (aucun écran n'appelle `propositions.accepter/modifier/
 * refuser` avant P3-01), mais une mine pour cette tranche future si non
 * corrigé maintenant. La liste EXPLICITE des six sous-types natifs remplace
 * le test structurel : elle attrape les VRAIS bogues JS sans toucher aux
 * classes métier du dépôt, quel que soit leur nom.
 *
 * CE QUE CETTE FRONTIÈRE NE FAIT PAS (règle 19) : un `new Error('phrase')`
 * SANS ces deux signaux passe pour un refus « historique » — `erreur =
 * e.message`, EXACTEMENT le comportement d'avant P1-09 — même si cette phrase
 * fuit un détail technique (`q1()` : `expected a row: <SQL tronqué>` en est un
 * exemple connu, non corrigé ici). Traiter TOUT non-`Refus` comme panne
 * générique CASSERAIT les ~304 messages métier non codés qui s'affichaient
 * correctement avant cette tranche — un régression bien pire que le gap
 * disclosed. Cet audit-là (coder ou filtrer les 304) est un chantier séparé,
 * consigné R152 (docs/BACKLOG_REPORTE.md), pas fait à moitié en silence ici. */
const SOUS_TYPES_NATIFS_DE_BOGUE = [TypeError, RangeError, ReferenceError, SyntaxError, EvalError, URIError];
export function estUnePanneTechnique(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  if (SOUS_TYPES_NATIFS_DE_BOGUE.some((C) => e instanceof C)) return true;
  const code = (e as { code?: unknown }).code;
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return true;
  return false;
}

/* D.6 point 1 (mandat, épreuve de l'épure) : « Aucun identifiant technique en
   première position d'un message vu par un auditeur. Le refus dit la chose en
   français ; le code vient après, en petit. » Chaque service écrit encore
   « CODE : phrase » (des dizaines de sites d'appel, non réécrits — règle 8) ;
   c'est donc CET ENDROIT UNIQUE, utilisé par BandeauRefus pour l'affichage,
   qui réordonne. NE VÉRIFIE PAS que le code existe au catalogue des erreurs
   ni qu'il est bien formé au sens métier : reconnaît une FORME
   (« MAJUSCULES[-MAJUSCULES...] : ») en tête de chaîne, rien de plus — un
   motif qui commencerait par un mot entièrement capitalisé suivi de « : »
   sans être un code technique serait, lui aussi, réordonné.

   `erreur` EST TYPÉ `string`, MAIS UNE URL AVEC `?erreur=` RÉPÉTÉ NE L'EST
   PAS TOUJOURS EN VRAI (revue hostile, F3) : Next rend alors un tableau à
   l'exécution malgré le typage — exactement le genre de refus qui, sans
   garde, tombait en page 500 avant que ce fichier existe (règle 13). D'où
   la vérification `typeof` avant tout `.match`, à la frontière de l'URL. */
export function separerCode(erreur: string): { code: string | null; phrase: string } {
  if (typeof erreur !== 'string') return { code: null, phrase: String(erreur) };
  const m = erreur.match(/^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)\s*:\s*(.+)$/s);
  if (!m) return { code: null, phrase: erreur };
  return { code: m[1], phrase: m[2] };
}

export async function executer(chemin: string, fn: () => Promise<unknown>): Promise<never> {
  let erreur = '';
  try {
    /* SOUS LA SONDE, le geste est conduit puis annulé (core/sonde.ts) : le
       refus observé est le vrai, et rien n'est écrit.
       ET LE LOCATAIRE EST POSÉ ICI, UNE FOIS, POUR TOUT LE GESTE (PLAN_RLS
       étape 1) : c'est l'endroit unique que le plan nomme. Le poseur de `q()`
       reste le filet des RENDUS ; ici, on économise un aller-retour par
       requête. Sans session — un geste public, s'il en existait — on laisse le
       chemin parler comme avant. */
    const qui = await getSessionUser();
    await (qui ? withTenant(qui.tenant_id, () => conduire(fn)) : conduire(fn));
  } catch (e) {
    if (estUnSignalDeNext(e)) throw e;
    /* On attrape TOUT : ces services lèvent des `Error` nues autant que des
       classes dédiées, et n'attraper « que les bonnes » revient à laisser les
       autres tomber en 500 — c'est-à-dire à recréer le défaut pour les cas
       qu'on n'a pas prévus, qui sont précisément ceux qui comptent.

       P1-09 (AUD-14) : depuis `Refus` (`lib/core/refus.ts`), on distingue
       désormais un REFUS MÉTIER (l'utilisateur doit changer quelque chose)
       d'une PANNE (SQL, réseau, bogue). Un `Refus` garde EXACTEMENT le format
       d'avant — `e.message` est déjà « CODE : détail » (le constructeur de
       `Refus` le construit ainsi) — donc `separerCode` et `BandeauRefus`
       n'ont besoin d'AUCUN changement pour ce chemin ; les 9 tests de
       `refus.test.ts`, rejoués tels quels, le confirment. Une PANNE, elle,
       n'affiche JAMAIS le message technique brut à l'écran (D.6) : une ligne
       `server_error` garde la trace complète (mêmes `ecrireErreur`/
       `empreinte` que le chemin de rendu Next, `lib/erreurs-serveur.ts`),
       l'écran ne porte qu'une référence (`refus.panne`, catalogue i18n) — le
       message brut ne s'y ajoute QUE sous `NODE_ENV==='development'`, jamais
       en production, jamais en test.

       CE QUE CE CHEMIN NE FAIT PAS ENCORE (règle 19) : `Refus.cle`/
       `Refus.vars` existent mais ne sont pas encore consommés ici — tant que
       le catalogue reste un passe-plat (`{detail}` identique en 'en'/'fr'),
       `e.message` et `t(e.cle, e.vars)` rendraient la même chaîne ; le jour
       où UN code précis porte une vraie traduction anglaise, ce chemin devra
       lire `e.cle`/`e.vars` au lieu de `e.message` pour CE code-là (R151,
       docs/BACKLOG_REPORTE.md). */
    if (e instanceof Refus) {
      erreur = e.message;
    } else if (estUnePanneTechnique(e)) {
      const message = e instanceof Error ? e.message : String(e);
      const ref = `m-${empreinte(message)}`;
      await ecrireErreur(e, { path: chemin, method: 'ACTION' }, { routePath: chemin });
      const t = await tr();
      let phrase = t('refus.panne', { ref });
      if (process.env.NODE_ENV === 'development') phrase += ` [dev] ${message}`;
      erreur = `PANNE : ${phrase}`;
    } else {
      // Un `new Error('phrase')` NI `Refus` NI technique (voir `estUnePanneTechnique`
      // ci-dessus) — comportement inchangé depuis avant P1-09 : la phrase s'affiche
      // telle quelle, `separerCode` n'y trouve pas de code (règle 17, cas connu déjà
      // couvert par refus.test.ts : « un message SANS code en tête »).
      erreur = e instanceof Error ? e.message : String(e);
    }
  }
  revalidatePath(chemin);
  /* `redirect` lève, volontairement, et DOIT être hors du `try` : l'attraper
     transformerait chaque succès en « refus » silencieux. */
  /* UN CHEMIN QUI PORTE DÉJÀ UNE QUESTION (`?item=…`) reçoit le refus après un
     `&`, jamais un second `?` : sinon le refus devient la fin de la valeur de
     `item`, le bandeau ne le lit pas, et le harnais conclut « aucun refus » —
     un refus calculé puis jeté (règle 13), trouvé par la revue hostile du jour. */
  if (!erreur) redirect(chemin);
  const requete = new URLSearchParams([[CLE_REFUS, erreur]]).toString();
  redirect(`${chemin}${chemin.includes('?') ? '&' : '?'}${requete}`);
}
