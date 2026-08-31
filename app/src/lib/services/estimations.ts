import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { engagementCtx } from './imports';
import { ingestEvidence } from './evidence';
import { nextSeq } from './requests';
import { monetaryDraw } from '@/lib/kernel/sampling';
import { sha256 } from '@/lib/core/hash';

// LES ESTIMATIONS COMPTABLES HORS LITIGE (point 11a, ADR-106). Le client
// fournit un fichier de calcul (tableur) : clé ; base ; taux ; montant.
// OTTO l'importe (le fichier entre au moteur de pièces), RAPPROCHE le total à
// l'écriture comptable visée (dérivé du grand livre ACTIF, jamais stocké),
// RECALCULE chaque ligne (base × taux, au centime), SONDE la base avec le
// MÊME moteur de tirage que le chiffre d'affaires (couverture + aléa germé),
// et DEMANDE les justificatifs par le circuit habituel : la pièce de base
// pour chaque ligne tirée, le justificatif de CHAQUE taux, la note de méthode
// pour la formule. Tout est déterministe ; rien ne part au client sans
// approbation (L2) — la demande naît en brouillon.

export interface LigneEstimation {
  id: string; seq: number; cle: string;
  base: number; taux: number; declareCents: number; recalculCents: number;
  conforme: boolean; retenu: boolean; motif: string | null;
}

export interface EstimationDetail {
  id: string; titre: string; pieceRef: string; statut: string; seed: string | null;
  libelles: string[];
  baseTotal: number; declareTotalCents: number; recalculTotalCents: number;
  /** Dérivé du grand livre ACTIF au moment de la lecture — jamais stocké. */
  montantComptabiliseCents: number;
  ecartCents: number;
  sourceEvidenceId: string; sourceFilename: string; sourceSha256: string;
  requestId: string | null;
  lignes: LigneEstimation[];
  parametres: { id: string; nom: string; valeur: string }[];
}

const versCents = (v: number) => Math.round(v * 100);

/** Nombre français ou anglais : « 3,5 » comme « 3.5 » ; espaces tolérées. */
function nombre(brut: string, ligne: number, colonne: string): number {
  const v = Number(brut.trim().replace(/[  ]/g, '').replace(',', '.'));
  if (!Number.isFinite(v)) {
    throw new Error(`estimation : ligne ${ligne}, colonne « ${colonne} » : « ${brut.trim()} » n'est pas un nombre`);
  }
  return v;
}

/** Le montant que la COMPTABILITÉ porte pour cette écriture : la somme des
 *  lignes de produits (comptes 70x) de la pièce, sur le grand livre ACTIF. */
export async function montantComptabilise(engagementId: string, pieceRef: string): Promise<number> {
  const r = await q01<{ total: string | null; n: string }>(
    `select sum(credit - debit)::text total, count(*)::text n
     from gl_entry
     where engagement_id = $1 and status = 'active' and piece_ref = $2 and account_no like '70%'`,
    [engagementId, pieceRef],
  );
  if (!r || Number(r.n) === 0) {
    throw new Error(`estimation : aucune écriture ACTIVE du grand livre ne porte la référence « ${pieceRef} » sur un compte de produits (70x)`);
  }
  return Math.abs(versCents(Number(r.total ?? 0)));
}

export async function importerEstimation(opts: {
  engagementId: string;
  titre: string;
  pieceRef: string;
  filename: string;
  contenu: Uint8Array;
  userId: string;
}): Promise<string> {
  if (!opts.titre.trim()) throw new Error('estimation : le titre est vide — nommez ce que le fichier estime');
  if (!opts.contenu.length) throw new Error('estimation : le fichier est vide — rien à importer');
  // le rapprochement d'abord : un fichier qui ne vise aucune écriture ne s'importe pas
  await montantComptabilise(opts.engagementId, opts.pieceRef.trim());

  const texte = new TextDecoder('utf-8').decode(opts.contenu);
  const lignesBrutes = texte.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lignesBrutes.length < 2) throw new Error('estimation : le fichier ne porte aucune ligne de données sous son en-tête');
  const entete = lignesBrutes[0].split(';').map((c) => c.trim());
  if (entete.length !== 4) {
    throw new Error(`estimation : quatre colonnes attendues (clé ; base ; taux ; montant), l'en-tête en porte ${entete.length} : « ${lignesBrutes[0].slice(0, 80)} »`);
  }

  interface Brute { seq: number; cle: string; base: number; taux: number; declareCents: number; recalculCents: number }
  const lignes: Brute[] = [];
  const vues = new Set<string>();
  for (let i = 1; i < lignesBrutes.length; i++) {
    const c = lignesBrutes[i].split(';');
    if (c.length !== 4) throw new Error(`estimation : ligne ${i + 1} — quatre colonnes attendues, ${c.length} trouvées`);
    const cle = c[0].trim();
    if (!cle) throw new Error(`estimation : ligne ${i + 1} — la clé (première colonne) est vide`);
    if (vues.has(cle)) throw new Error(`estimation : la clé « ${cle} » apparaît deux fois — chaque ligne de la base doit être unique`);
    vues.add(cle);
    const base = nombre(c[1], i + 1, entete[1]);
    const taux = nombre(c[2], i + 1, entete[2]);
    const declare = nombre(c[3], i + 1, entete[3]);
    lignes.push({
      seq: i, cle, base, taux,
      declareCents: versCents(declare),
      recalculCents: Math.round(base * versCents(taux)),
    });
  }

  const ctx = await engagementCtx(opts.engagementId);
  /* Le fichier du client EST une pièce : empreinte, provenance, journal. */
  const { evidenceId } = await ingestEvidence({
    engagementId: opts.engagementId,
    filename: opts.filename,
    mime: 'text/csv',
    bytes: opts.contenu,
    source: 'auditor',
    audience: 'client_provided',
    uploadedBy: { kind: 'app_user', id: opts.userId },
  });

  const row = await q1<{ id: string }>(
    `insert into estimation (engagement_id, titre, piece_ref, libelles, base_total,
       declare_total, recalcul_total, source_evidence_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [
      opts.engagementId, opts.titre.trim(), opts.pieceRef.trim(), JSON.stringify(entete),
      lignes.reduce((s, l) => s + l.base, 0),
      (lignes.reduce((s, l) => s + l.declareCents, 0) / 100).toFixed(2),
      (lignes.reduce((s, l) => s + l.recalculCents, 0) / 100).toFixed(2),
      evidenceId, opts.userId,
    ],
  );
  for (const l of lignes) {
    await q(
      `insert into estimation_ligne (estimation_id, seq, cle, base, taux, declare, recalcul, conforme)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [row.id, l.seq, l.cle, l.base, l.taux, (l.declareCents / 100).toFixed(2),
        (l.recalculCents / 100).toFixed(2), l.declareCents === l.recalculCents],
    );
  }
  /* CHAQUE taux est un paramètre à justifier — pas seulement les lignes
     tirées : un taux contractuel faux fausse toute sa ligne, sondée ou pas.
     Et la FORMULE elle-même est un paramètre (note de méthode). */
  for (const l of lignes) {
    await q(
      `insert into estimation_parametre (estimation_id, nom, valeur) values ($1,$2,$3)`,
      [row.id, `${entete[2]} — ${l.cle}`, String(l.taux)],
    );
  }
  await q(
    `insert into estimation_parametre (estimation_id, nom, valeur) values ($1,$2,$3)`,
    [row.id, 'formule', `${entete[3]} = ${entete[1]} × ${entete[2]}`],
  );

  await logEvent({
    tenantId: ctx.tenant_id, engagementId: opts.engagementId,
    actorKind: 'user', actorId: opts.userId,
    verb: 'estimation_imported', objectType: 'estimation', objectId: row.id,
    payload: { titre: opts.titre.trim(), pieceRef: opts.pieceRef.trim(), lignes: lignes.length, evidenceId },
  });
  return row.id;
}

/** Le tirage sur la BASE — même moteur que le chiffre d'affaires (kernel) :
 *  couverture au-dessus du seuil, reste en aléa germé, déterministe. */
export async function tirerBase(
  estimationId: string,
  params: { coverageCapCents: number; randomSize: number; seed: string },
  userId: string,
): Promise<{ retenues: number }> {
  const est = await q1<{ id: string; engagement_id: string; statut: string }>(
    `select id, engagement_id, statut from estimation where id = $1`, [estimationId],
  );
  if (est.statut === 'demandee') {
    throw new Error('estimation : les justificatifs sont déjà demandés — re-tirer maintenant rendrait la demande incohérente avec la sélection');
  }
  const lignes = await q<{ id: string; declare: string }>(
    `select id::text id, declare::text from estimation_ligne where estimation_id = $1 order by seq`,
    [estimationId],
  );
  const unites = lignes.map((l) => ({ id: l.id, amountCents: versCents(Number(l.declare)), flags: [] as string[] }));
  const dessin = monetaryDraw(
    unites,
    { coverageCapCents: params.coverageCapCents, randomSize: params.randomSize, seed: params.seed },
    'estimation-v1:' + sha256(unites.map((u) => `${u.id}|${u.amountCents}`).join('\n')),
  );
  await q(`update estimation_ligne set retenu = false, motif = null where estimation_id = $1`, [estimationId]);
  for (const s of dessin.selections) {
    await q(`update estimation_ligne set retenu = true, motif = $2 where id = $1`, [s.id, s.reason]);
  }
  await q(`update estimation set statut = 'tiree', seed = $2 where id = $1`, [estimationId, params.seed]);
  const ctx = await engagementCtx(est.engagement_id);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: est.engagement_id,
    actorKind: 'user', actorId: userId,
    verb: 'estimation_sample_drawn', objectType: 'estimation', objectId: estimationId,
    payload: { ...params, retenues: dessin.selections.length },
  });
  return { retenues: dessin.selections.length };
}

/** La demande de justificatifs, par le circuit HABITUEL : brouillon d'abord
 *  (rien ne part au client sans approbation), un élément par ligne tirée
 *  (la pièce de base), un par taux, un pour la formule. */
export async function demanderJustificatifs(estimationId: string, userId: string): Promise<string> {
  const est = await q1<{ id: string; engagement_id: string; statut: string; titre: string; libelles: string[]; request_id: string | null }>(
    `select id, engagement_id, statut, titre, libelles, request_id from estimation where id = $1`, [estimationId],
  );
  if (est.statut === 'importee') {
    throw new Error('estimation : tirez d\'abord la base — demander des justificatifs sans sélection reviendrait à demander toute la base sans l\'avoir décidé');
  }
  if (est.statut === 'demandee' && est.request_id) {
    throw new Error('estimation : les justificatifs sont déjà demandés — la demande existante porte la sélection');
  }
  const retenues = await q<{ id: string; cle: string; base: string; declare: string }>(
    `select id::text id, cle, base::text, declare::text from estimation_ligne
     where estimation_id = $1 and retenu order by seq`,
    [estimationId],
  );
  if (!retenues.length) throw new Error('estimation : aucune ligne retenue par le tirage — rien à demander');
  const parametres = await q<{ id: string; nom: string; valeur: string }>(
    `select id::text id, nom, valeur from estimation_parametre where estimation_id = $1 order by nom`,
    [estimationId],
  );

  const ctx = await engagementCtx(est.engagement_id);
  const seq = await nextSeq(est.engagement_id);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status)
     values ($1,$2,$3,'fr','draft') returning id`,
    [est.engagement_id, seq, `Estimation — ${est.titre} : justificatifs de la base et des taux`],
  );
  const [, colBase] = est.libelles;
  for (const l of retenues) {
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description) values ($1,'document',$2) returning id`,
      [request.id, `${est.titre} — ${l.cle} : justificatif de la base (${colBase} = ${l.base})`],
    );
    await q(`update estimation_ligne set request_item_id = $2 where id = $1`, [l.id, item.id]);
  }
  for (const p of parametres) {
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description) values ($1,'document',$2) returning id`,
      [request.id, p.nom === 'formule'
        ? `${est.titre} — note de méthode : ${p.valeur}`
        : `${est.titre} — justificatif du ${p.nom} (${p.valeur}) : contrat, avenant ou barème signé`],
    );
    await q(`update estimation_parametre set request_item_id = $2 where id = $1`, [p.id, item.id]);
  }
  await q(`update estimation set statut = 'demandee', request_id = $2 where id = $1`, [estimationId, request.id]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: est.engagement_id,
    actorKind: 'user', actorId: userId,
    verb: 'estimation_requests_drafted', objectType: 'estimation', objectId: estimationId,
    payload: { requestId: request.id, lignes: retenues.length, parametres: parametres.length },
  });
  return request.id;
}

export async function listeEstimations(engagementId: string): Promise<{ id: string; titre: string; pieceRef: string; statut: string }[]> {
  return (await q<{ id: string; titre: string; piece_ref: string; statut: string }>(
    `select id::text id, titre, piece_ref, statut from estimation where engagement_id = $1 order by created_at`,
    [engagementId],
  )).map((r) => ({ id: r.id, titre: r.titre, pieceRef: r.piece_ref, statut: r.statut }));
}

export async function detailEstimation(estimationId: string): Promise<EstimationDetail> {
  const e = await q1<{
    id: string; engagement_id: string; titre: string; piece_ref: string; statut: string; seed: string | null;
    libelles: string[]; base_total: string; declare_total: string; recalcul_total: string;
    source_evidence_id: string; request_id: string | null; filename: string; sha256: string;
  }>(
    `select e.id::text id, e.engagement_id::text engagement_id, e.titre, e.piece_ref, e.statut, e.seed,
            e.libelles, e.base_total::text, e.declare_total::text, e.recalcul_total::text,
            e.source_evidence_id::text, e.request_id::text request_id, ev.filename, ev.sha256
     from estimation e join evidence ev on ev.id = e.source_evidence_id
     where e.id = $1`,
    [estimationId],
  );
  const comptabilise = await montantComptabilise(e.engagement_id, e.piece_ref);
  const lignes = await q<{ id: string; seq: number; cle: string; base: string; taux: string; declare: string; recalcul: string; conforme: boolean; retenu: boolean; motif: string | null }>(
    `select id::text id, seq, cle, base::text, taux::text, declare::text, recalcul::text, conforme, retenu, motif
     from estimation_ligne where estimation_id = $1 order by seq`,
    [estimationId],
  );
  const parametres = await q<{ id: string; nom: string; valeur: string }>(
    `select id::text id, nom, valeur from estimation_parametre where estimation_id = $1 order by nom`,
    [estimationId],
  );
  const declareTotalCents = versCents(Number(e.declare_total));
  return {
    id: e.id, titre: e.titre, pieceRef: e.piece_ref, statut: e.statut, seed: e.seed,
    libelles: e.libelles,
    baseTotal: Number(e.base_total),
    declareTotalCents,
    recalculTotalCents: versCents(Number(e.recalcul_total)),
    montantComptabiliseCents: comptabilise,
    ecartCents: comptabilise - declareTotalCents,
    sourceEvidenceId: e.source_evidence_id, sourceFilename: e.filename, sourceSha256: e.sha256,
    requestId: e.request_id,
    lignes: lignes.map((l) => ({
      id: l.id, seq: l.seq, cle: l.cle, base: Number(l.base), taux: Number(l.taux),
      declareCents: versCents(Number(l.declare)), recalculCents: versCents(Number(l.recalcul)),
      conforme: l.conforme, retenu: l.retenu, motif: l.motif,
    })),
    parametres,
  };
}
