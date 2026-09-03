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

/** Le plafond de rangements par personne — voir PLAFOND_REPLIS. */
export const PLAFOND_REPLIS = 500;

/**
 * LE LOCATAIRE VIENT DE LA PERSONNE, JAMAIS DE L'APPELANT (revue hostile n°8,
 * constat 3). L'écriture prenait un `tenantId` en paramètre : un appel forgé
 * écrivait une ligne au nom d'un autre cabinet, et la lecture, qui ne filtrait
 * que sur l'utilisateur, la relisait. La jointure sur `app_user` rend la paire
 * (locataire, personne) indissociable — ce que la politique RLS exigera le jour
 * où l'application posera le locataire par transaction (PLAN_RLS, étape 1).
 */
export async function lireReplis(userId: string): Promise<Record<string, boolean>> {
  const lignes = await q<{ cle: string; ouvert: boolean }>(
    `select r.cle, r.ouvert from ui_repli r join app_user u on u.id = r.user_id
     where r.user_id = $1 and r.tenant_id = u.tenant_id
     order by r.updated_at desc limit ${PLAFOND_REPLIS}`, [userId]);
  const out: Record<string, boolean> = {};
  for (const l of lignes) out[l.cle] = l.ouvert;
  return out;
}

export async function memoriserRepli(p: { userId: string; cle: string; ouvert: boolean }): Promise<void> {
  if (!CLE_REPLI.test(p.cle)) {
    throw new Error(`REPLI-01 : clé de repli hors format « ${p.cle.slice(0, 40)} » — lettres, chiffres, . _ : - (120 au plus)`);
  }
  /* REPLI-04 : le nombre de rangements d'une personne est BORNÉ. Sans borne,
     une boucle cliquée écrit sans fin et la charge part dans le rendu de
     CHAQUE page (la revue hostile en a écrit 5 000 en trois secondes). */
  const n = await q<{ n: string }>(`select count(*)::text n from ui_repli where user_id = $1`, [p.userId]);
  const deja = await q<{ cle: string }>(`select cle from ui_repli where user_id = $1 and cle = $2`, [p.userId, p.cle]);
  if (deja.length === 0 && Number(n[0]?.n ?? 0) >= PLAFOND_REPLIS) {
    throw new Error(`REPLI-04 : ${PLAFOND_REPLIS} rangements mémorisés pour cette personne, c'est le plafond — les replis suivants tiennent le temps de la visite, sans être retenus`);
  }
  await q(
    `insert into ui_repli (tenant_id, user_id, cle, ouvert)
     select u.tenant_id, u.id, $2, $3 from app_user u where u.id = $1
     on conflict (user_id, cle) do update set ouvert = excluded.ouvert, updated_at = now()`,
    [p.userId, p.cle, p.ouvert]);
}

/** Ce que /api/sante lit : combien de rangements, chez combien de personnes,
 *  et QUAND le dernier a été posé — `updated_at` a un chemin de lecture. */
export async function compterReplis(): Promise<{ replis: number; personnes: number; dernier: string | null }> {
  const r = await q<{ replis: string; personnes: string; dernier: string | null }>(
    `select count(*)::text replis, count(distinct user_id)::text personnes,
            max(updated_at)::text dernier from ui_repli`);
  return { replis: Number(r[0]?.replis ?? 0), personnes: Number(r[0]?.personnes ?? 0), dernier: r[0]?.dernier ?? null };
}
