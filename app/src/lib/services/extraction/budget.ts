import { q1 } from '@/lib/db/client';

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
