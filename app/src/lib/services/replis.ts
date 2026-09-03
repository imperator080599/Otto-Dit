import { q } from '@/lib/db/client';

// LA MÉMOIRE DES REPLIS (mandat de nuit n°2, 1.2 ; migration 0132). Une section
// repliée l'est par la PERSONNE, et la suit d'un poste de travail à l'autre :
// la mémoire est en base, par compte, lue par le serveur au premier rendu.
//
// Ce n'est pas un état du dossier : aucune règle d'audit ne la lit, aucun
// événement ne la journalise (ADR-125, exception déclarée). Ce qu'elle refuse :
// REPLI-01, une clé hors du format — le même prédicat que la contrainte
// ui_repli_cle_valide, pour que le refus se lise AVANT la base et qu'on sache
// lequel des deux a parlé.

export const CLE_REPLI = /^[A-Za-z0-9_.:-]{1,120}$/;

export async function lireReplis(userId: string): Promise<Record<string, boolean>> {
  const lignes = await q<{ cle: string; ouvert: boolean }>(
    `select cle, ouvert from ui_repli where user_id = $1`, [userId]);
  const out: Record<string, boolean> = {};
  for (const l of lignes) out[l.cle] = l.ouvert;
  return out;
}

export async function memoriserRepli(p: { tenantId: string; userId: string; cle: string; ouvert: boolean }): Promise<void> {
  if (!CLE_REPLI.test(p.cle)) {
    throw new Error(`REPLI-01 : clé de repli hors format « ${p.cle.slice(0, 40)} » — lettres, chiffres, . _ : - (120 au plus)`);
  }
  await q(
    `insert into ui_repli (tenant_id, user_id, cle, ouvert) values ($1, $2, $3, $4)
     on conflict (user_id, cle) do update set ouvert = excluded.ouvert, updated_at = now()`,
    [p.tenantId, p.userId, p.cle, p.ouvert]);
}

/** Ce que /api/sante lit : combien de rangements, chez combien de personnes. */
export async function compterReplis(): Promise<{ replis: number; personnes: number }> {
  const r = await q<{ replis: string; personnes: string }>(
    `select count(*)::text replis, count(distinct user_id)::text personnes from ui_repli`);
  return { replis: Number(r[0]?.replis ?? 0), personnes: Number(r[0]?.personnes ?? 0) };
}
