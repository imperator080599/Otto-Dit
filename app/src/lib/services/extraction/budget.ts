import { q, q01, q1 } from '@/lib/db/client';

// LA GARDE DE BUDGET DU MODE « IA RÉELLE » (point 12, ADR-105). Quand
// l'adaptateur d'extraction est vivant, chaque lecture coûte de l'argent réel
// sur une clé prépayée. Trois promesses : le coût est AFFICHÉ (par extraction
// et cumulé), l'arrêt au plafond est PROPRE (un refus qui dit les deux
// chiffres, jamais une lecture de plus), et rien ne se dépense en mode rejeu.
//
// Le cumul est lu dans ai_run — la table que chaque appel de modèle alimente
// déjà (règle 3 : provenance d'abord). Il compte donc ce que CETTE base a
// dépensé ; le vrai garde-fou d'un débordement reste le plafonnement prépayé
// de la clé elle-même, côté fournisseur. Une remise à zéro de la base remet ce
// compteur à zéro — c'est dit à l'écran par « depuis cette base ».

export function plafondUsd(): number {
  const v = Number(process.env.OTTO_BUDGET_USD ?? '5');
  return Number.isFinite(v) && v > 0 ? v : 5;
}

export async function depenseCumuleeUsd(): Promise<number> {
  const r = await q1<{ total: string }>(
    `select coalesce(sum(cost_usd), 0)::text total from ai_run`,
  );
  return Number(r.total);
}

export function messageArretBudget(depenseUsd: number, plafondUsd_: number): string {
  /* Un plafond de 0,001 $ affiché « 0.00 $ » mentirait : les petits montants
     gardent leurs décimales. */
  const fmt = (v: number) => v.toFixed(v > 0 && v < 0.01 ? 4 : 2);
  return (
    `garde de budget : ${depenseUsd.toFixed(4)} $ déjà dépensés sur un plafond de `
    + `${fmt(plafondUsd_)} $ (OTTO_BUDGET_USD) — aucune lecture de plus ne partira. `
    + 'Les extractions déjà faites restent au dossier ; relevez le plafond ou repartez '
    + 'd\'une base vide pour continuer.'
  );
}

/** À appeler AVANT toute lecture par un adaptateur vivant. Refuse au plafond. */
export async function gardeBudget(): Promise<void> {
  const depense = await depenseCumuleeUsd();
  const plafond = plafondUsd();
  if (depense >= plafond) throw new Error(messageArretBudget(depense, plafond));
}

// ── LA GARDE EN BASE (mandat du 9 septembre, §4 ; CLAUDE.md, interdits) ──────────────────────
//
// « je peux surélever le seuil des dépenses... mais 1. la garde de budget en base d'abord... 2.
// puis la mesure... 3. puis seulement, le fondateur relève le plafond. » Cette garde-ci est
// DISTINCTE de `gardeBudget()` ci-dessus (qui borne le CUMUL de dépense d'une base déjà en mode
// IA vivante, via OTTO_BUDGET_USD) — elle répond à une question ANTÉRIEURE : « ce déploiement
// a-t-il seulement le DROIT de tenter une lecture payante ? » `app_state` (0005 ; clock.ts en est
// déjà le patron) porte la réponse — pas de migration neuve, la table existe déjà pour EXACTEMENT
// ce genre de réglage global, sans locataire.

const CLE_APP_STATE_BUDGET = 'ia_vivante_budget';

export interface GardeBudgetEnBase {
  actif: boolean;
  plafondUsd: number | null;
  activePar: string | null;
  activeLe: string | null;
}

/** Lecture brute de l'état courant — pour AFFICHER (écran, sonde), jamais pour décider d'exécuter
 *  quoi que ce soit (voir `assertBudgetActifEnBase`). Toute valeur mal formée (un champ du
 *  mauvais type) est lue comme absente, jamais devinée — la garde ci-dessous referme sur le
 *  moindre doute. */
export async function gardeBudgetEnBase(): Promise<GardeBudgetEnBase> {
  const row = await q01<{ value: { actif?: unknown; plafondUsd?: unknown; activePar?: unknown; activeLe?: unknown } }>(
    `select value from app_state where key = $1`, [CLE_APP_STATE_BUDGET],
  );
  const v = row?.value ?? {};
  return {
    actif: v.actif === true,
    plafondUsd: typeof v.plafondUsd === 'number' && Number.isFinite(v.plafondUsd) ? v.plafondUsd : null,
    activePar: typeof v.activePar === 'string' ? v.activePar : null,
    activeLe: typeof v.activeLe === 'string' ? v.activeLe : null,
  };
}

/** LA GARDE ELLE-MÊME — « chemin fermé par défaut derrière un déverrouillage que seul le
 *  fondateur connaît. » AUCUN chemin de ce dépôt n'écrit `actif:true` dans `app_state` — ni
 *  service, ni action serveur, ni script de peuplement (cherchez : rien n'insère cette clé sauf
 *  cette fonction elle-même, qui ne fait que LIRE). Seule une écriture SQL DIRECTE — un accès du
 *  fondateur à la base de production, hors de toute route de l'application — peut la poser : ce
 *  chemin absent EST le déverrouillage. FERMÉE PAR DÉFAUT deux fois : la ligne est ABSENTE tant
 *  que personne ne l'a écrite (`gardeBudgetEnBase` rend `actif:false`), et un état INCOMPLET
 *  (`actif:true` sans plafond positif) refuse aussi — jamais lu comme « à moitié activé ».
 *
 *  CE QUE CETTE FONCTION NE FAIT PAS (règle 19) : elle ne BLOQUE aucun appel réel aujourd'hui.
 *  `getOcrAdapter()` (adapters.ts) coupe déjà INCONDITIONNELLEMENT tout déploiement public
 *  (`demoPublique()`, vrai sur TOUT déploiement Vercel) vers le rejeu — quoi que dise cette garde.
 *  La relier à un chemin d'exécution réel EST « l'activation du mode IA vivant sur l'URL » que
 *  CLAUDE.md réserve au dernier geste du fondateur, pas à cette tranche (mandat §4 : « rien n'est
 *  activé et aucune clé n'est demandée » tant que 1 et 2 ne sont pas faits).
 *
 *  La provenance (qui, quand) est exigée au MÊME titre que le plafond — pas une case de confort :
 *  une activation sans acteur ni date tracés est le même défaut que `evidence_deletion_whole`
 *  (0157) ou `engagement_lock_verdict.confirmed_by/at` (0042) refusent déjà ailleurs dans ce
 *  dépôt (règle 3, provenance dès la première fonctionnalité) — jamais un geste anonyme. */
export async function assertBudgetActifEnBase(): Promise<GardeBudgetEnBase> {
  const g = await gardeBudgetEnBase();
  if (!g.actif || g.plafondUsd === null || g.plafondUsd <= 0 || !g.activePar || !g.activeLe) {
    throw new Error(
      'IA-BUDGET-01 : le mode IA vivant reste fermé — aucune garde de budget active et complète '
      + `en base (app_state.${CLE_APP_STATE_BUDGET} : plafond positif ET provenance qui/quand). `
      + 'Ce chemin ne s\'active JAMAIS depuis le code — seul le fondateur, par un accès direct à '
      + 'la base de production, peut le poser (mandat du 9 septembre, §4 ; CLAUDE.md, interdits).',
    );
  }
  return g;
}

/** Purge de sonde SEULE — jamais appelée par un chemin de production (aucun bouton, aucune
 *  action serveur ne referme la garde ; la fermeture par défaut vient de l'ABSENCE de la ligne,
 *  pas d'un geste qui l'efface). Existe pour que les tests remettent `app_state` dans l'état où
 *  ils l'ont trouvé. */
export async function _reinitialiserGardeBudgetEnBasePourSonde(): Promise<void> {
  await q(`delete from app_state where key = $1`, [CLE_APP_STATE_BUDGET]);
}
