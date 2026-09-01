import { q, q1, q01 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { motif, type Motif } from './motif';

// LE POINTAGE DES ÉTATS FINANCIERS (point 9).
//
// Tous les travaux du dossier servent à conclure sur des ÉTATS FINANCIERS. Sans
// pointage, un dossier qui teste le chiffre d'affaires conclut sur une ligne
// « Chiffre d'affaires » qu'il n'a jamais regardée.
//
// TROIS NATURES, ET ELLES NE SE VALENT PAS.
//   · SOLDE DE BALANCE — la ligne EST un compte : le rapprochement se CALCULE.
//   · AGRÉGAT DE COMPTES — la ligne est une somme : il se calcule aussi.
//   · CALCUL À DOCUMENTER — la ligne ne vient d'aucun compte (résultat par
//     action, effectif moyen, variation retraitée). Aucune somme ne la
//     reproduit : le seul pointage possible est une EXPLICATION ÉCRITE avec la
//     pièce qui la porte.
//
// ON POINTE LE MONTANT PRÉSENTÉ, pas le nôtre. Recalculer la ligne et la
// comparer à son propre calcul ne pointe rien : ça vérifie qu'on sait
// additionner.

export class TieOutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TieOutError';
  }
}

export type NatureTie = 'solde_balance' | 'agregat_comptes' | 'calcul_documente';

export interface LigneEtats {
  id: string;
  statement: 'IS' | 'BS_ASSET' | 'BS_LIAB' | 'NOTES';
  ref: string;
  label: string;
  presented: string;
  sort_order: number;
  nature: NatureTie | null;
  accounts: string[] | null;
  computed: string | null;
  difference: string | null;
  status: 'open' | 'tied' | 'difference' | 'documented' | null;
  explanation: string | null;
  evidence_id: string | null;
  tied_at: string | null;
}

const COLONNES = `l.id, l.statement, l.ref, l.label, l.presented::text as presented, l.sort_order,
                  t.nature, t.accounts, t.computed::text as computed, t.difference::text as difference,
                  t.status, t.explanation, t.evidence_id, t.tied_at::text as tied_at`;

export async function lignes(engagementId: string): Promise<LigneEtats[]> {
  return q<LigneEtats>(
    `select ${COLONNES} from fs_line l
     left join fs_tie t on t.fs_line_id = l.id
     where l.engagement_id = $1
     order by l.statement, l.sort_order, l.ref`,
    [engagementId],
  );
}

/* ── déclarer la plaquette ──────────────────────────────────────────────── */

export interface LigneAPointer {
  statement: 'IS' | 'BS_ASSET' | 'BS_LIAB' | 'NOTES';
  ref: string;
  label: string;
  presented: number;   // en euros, tel qu'imprimé
  sortOrder?: number;
  nature: NatureTie;
  accounts?: string[];
}

/**
 * Enregistre les lignes de la plaquette et leur nature de rapprochement.
 *
 * La nature est déclarée par l'auditeur, pas devinée : deviner qu'une ligne est
 * un agrégat parce qu'elle ressemble à une somme produirait un pointage
 * plausible et faux — et un pointage faux est pire qu'un pointage absent.
 */
export async function declarerLignes(
  engagementId: string, actorUserId: string, entrantes: LigneAPointer[],
): Promise<LigneEtats[]> {
  for (const l of entrantes) {
    if (l.nature !== 'calcul_documente' && !(l.accounts ?? []).length) {
      throw new TieOutError(
        `ligne « ${l.ref} » de nature « ${l.nature} » sans compte : le rapprochement ne pourrait rien calculer. `
        + `Une ligne qui ne vient d'aucun compte est un « calcul à documenter ».`,
      );
    }
    if (l.nature === 'calcul_documente' && (l.accounts ?? []).length) {
      throw new TieOutError(
        `ligne « ${l.ref} » déclarée « calcul à documenter » mais rattachée à des comptes : `
        + `si des comptes la fondent, c'est un agrégat, et il se calcule.`,
      );
    }
    const row = await q1<{ id: string }>(
      `insert into fs_line (engagement_id, statement, ref, label, presented, sort_order)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (engagement_id, statement, ref)
         do update set label = excluded.label, presented = excluded.presented,
                       sort_order = excluded.sort_order
       returning id`,
      [engagementId, l.statement, l.ref, l.label, l.presented, l.sortOrder ?? 0],
    );
    await q(
      `insert into fs_tie (fs_line_id, nature, accounts)
       values ($1,$2,$3)
       on conflict (fs_line_id) do update set nature = excluded.nature, accounts = excluded.accounts`,
      [row.id, l.nature, l.accounts ?? []],
    );
  }
  const eng = await q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'fs.lines_declared', objectType: 'engagement', objectId: engagementId,
    payload: { count: entrantes.length },
  });
  return pointer(engagementId, actorUserId);
}

/* ── pointer ────────────────────────────────────────────────────────────── */

/**
 * Calcule ce qui se calcule.
 *
 * Les deux natures comptables se pointent SEULES : le moteur additionne les
 * comptes de la balance retenue et compare au montant présenté. Le « calcul à
 * documenter » n'est pas touché — il n'y a rien à calculer, et lui inventer un
 * calcul serait exactement la faute que sa nature existe pour éviter.
 */
export async function pointer(engagementId: string, actorUserId: string): Promise<LigneEtats[]> {
  const snap = await q01<{ id: string }>(
    `select id from tb_snapshot where engagement_id = $1 and period_kind = 'current' and status = 'active'
     order by version desc limit 1`,
    [engagementId],
  );
  if (!snap) {
    throw new TieOutError(
      'aucune balance retenue : le pointage n’a rien à quoi rapprocher. Importez la balance d’abord.',
    );
  }
  const aPointer = await q<{ id: string; nature: NatureTie; accounts: string[]; presented: string; status: string }>(
    `select t.id, t.nature, t.accounts, l.presented::text as presented, t.status
     from fs_tie t join fs_line l on l.id = t.fs_line_id
     where l.engagement_id = $1 and t.nature <> 'calcul_documente'`,
    [engagementId],
  );

  for (const t of aPointer) {
    /* Le solde d'un compte de produit est créditeur : on rapproche en VALEUR
       ABSOLUE du solde net, parce que la plaquette présente des montants
       positifs. Le signe se lit sur la nature du poste, pas sur le solde. */
    const somme = await q1<{ total: string | null }>(
      `select sum(balance)::text as total from account
       where tb_snapshot_id = $1 and number = any($2::text[])`,
      [snap.id, t.accounts],
    );
    const calc = Math.abs(Number(somme.total ?? 0));
    const presente = Number(t.presented);
    const ecart = Number((calc - presente).toFixed(2));
    /* Le statut est DÉRIVÉ du calcul. Le laisser saisir permettrait de déclarer
       « pointé » une ligne qui ne l'est pas — et c'est précisément ce qu'un
       inspecteur cherche. Une ligne déjà expliquée garde son explication. */
    const statut = ecart === 0 ? 'tied' : 'difference';
    if (statut === 'difference') {
      const dejaExplique = await q01<{ explanation: string | null }>(
        `select explanation from fs_tie where id = $1`, [t.id],
      );
      if (!dejaExplique?.explanation?.trim()) {
        /* Un écart sans explication ne peut pas prendre le statut
           « difference » (contrainte SQL) : il reste OUVERT, et il bloque. */
        await q(
          `update fs_tie set computed = $2, difference = $3, status = 'open' where id = $1`,
          [t.id, calc, ecart],
        );
        continue;
      }
    }
    await q(
      `update fs_tie set computed = $2, difference = $3, status = $4,
              tied_by = $5, tied_at = now()
       where id = $1`,
      [t.id, calc, ecart, statut, actorUserId],
    );
  }
  return lignes(engagementId);
}

/**
 * Documente une ligne qui ne se calcule pas.
 *
 * Explication ET pièce, ou rien. Une justification sans pièce n'est pas une
 * justification — même famille que la résolution probante d'un écart.
 */
export async function documenter(
  engagementId: string, actorUserId: string, ligneId: string,
  explanation: string, evidenceId: string,
): Promise<void> {
  const t = await q01<{ id: string; nature: NatureTie }>(
    `select t.id, t.nature from fs_tie t join fs_line l on l.id = t.fs_line_id
     where l.id = $1 and l.engagement_id = $2`,
    [ligneId, engagementId],
  );
  if (!t) throw new TieOutError('ligne inconnue');
  if (t.nature !== 'calcul_documente') {
    throw new TieOutError(
      'cette ligne se CALCULE : la documenter à la main reviendrait à déclarer pointé ce que le '
      + 'moteur n’a pas rapproché',
    );
  }
  if (!explanation.trim()) throw new TieOutError('une ligne se documente par une explication écrite');
  if (!evidenceId) {
    throw new TieOutError('une justification sans pièce n’est pas une justification : liez le document qui porte le calcul');
  }
  const piece = await q01<{ id: string }>(
    `select id from evidence where id = $1 and engagement_id = $2 and quarantined = false`,
    [evidenceId, engagementId],
  );
  if (!piece) throw new TieOutError('pièce inconnue de ce dossier, ou en quarantaine');

  await q(
    `update fs_tie set status = 'documented', explanation = $2, evidence_id = $3,
            tied_by = $4, tied_at = now()
     where id = $1`,
    [t.id, explanation.trim(), evidenceId, actorUserId],
  );
  const eng = await q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'fs.line_documented', objectType: 'fs_line', objectId: ligneId,
    payload: { evidenceId },
  });
}

/** Explique un écart de pointage. Sans explication, l'écart reste ouvert. */
export async function expliquerEcart(
  engagementId: string, actorUserId: string, ligneId: string, explanation: string,
): Promise<void> {
  if (!explanation.trim()) {
    throw new TieOutError('un écart accepté sans un mot est indistinguable d’un oubli');
  }
  const t = await q01<{ id: string; difference: string | null }>(
    `select t.id, t.difference::text as difference from fs_tie t join fs_line l on l.id = t.fs_line_id
     where l.id = $1 and l.engagement_id = $2`,
    [ligneId, engagementId],
  );
  if (!t) throw new TieOutError('ligne inconnue');
  if (!t.difference || Number(t.difference) === 0) {
    throw new TieOutError('cette ligne ne porte pas d’écart : il n’y a rien à expliquer');
  }
  await q(
    `update fs_tie set status = 'difference', explanation = $2, tied_by = $3, tied_at = now()
     where id = $1`,
    [t.id, explanation.trim(), actorUserId],
  );
  const eng = await q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: actorUserId,
    verb: 'fs.difference_explained', objectType: 'fs_line', objectId: ligneId,
    payload: { difference: t.difference },
  });
}

/* ── ce qui bloque ──────────────────────────────────────────────────────── */

/**
 * LES OBSTACLES AU VISA dus au pointage.
 *
 * Une ligne non pointée bloque. Un écart non expliqué bloque. Ce sont les deux
 * seules manières de conclure sur des états financiers sans les avoir regardés.
 */
export async function obstaclesPointage(engagementId: string): Promise<Motif[]> {
  const l = await lignes(engagementId);
  const out: Motif[] = [];
  for (const x of l) {
    if (!x.status || x.status === 'open') {
      out.push(x.difference && Number(x.difference) !== 0
        ? motif('obst.pointageEcart', { ref: x.ref, libelle: x.label, ecart: x.difference })
        : motif('obst.pointageNonPointee', { ref: x.ref, libelle: x.label }));
    }
  }
  return out;
}

/** Le total présenté par état, pour vérifier qu'une plaquette est complète. */
export async function totaux(engagementId: string) {
  return q<{ statement: string; lignes: string; pointees: string; total: string }>(
    `select l.statement,
            count(*)::text as lignes,
            count(*) filter (where t.status in ('tied','documented','difference'))::text as pointees,
            sum(l.presented)::text as total
     from fs_line l left join fs_tie t on t.fs_line_id = l.id
     where l.engagement_id = $1 group by l.statement order by l.statement`,
    [engagementId],
  );
}
