import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { fmtEur } from '@/lib/kernel/canon';
import { primaryPack } from '@/lib/packs';
import { numToCents } from '@/lib/util/num';
import { catalogueDeLaMission } from '@/lib/methodology/depot';
import { gabarit, colonnes, referencePapier } from '@/lib/methodology/catalogue';
import { engagementCtx } from '../imports';
import { frameworkSet } from '../fsli';
import { currentMateriality } from '../materiality';
import { currentRevenueSample } from '../sampling';
import { latestTbGl } from '../reconciliation';
import { listExceptions, scopeLimitations } from '../matching';
import { currentEvaluation, conclusionGate, evaluationResponses, blockerText } from '../evaluation';
import { latestExtraction } from '../extraction/ladder';
import { assertMembre } from '@/lib/core/membre';

// S7 — documentation engine. Workpapers are STRUCTURED sections assembled from stored
// facts (never recomputed): every figure carries its source refs (P7). Attribution per
// ADR-012.4: "Performed by OTTO engine run — validated by [human]". Drafted prose is
// template-based here (engine_run); a live LLM redraft would be an ai_run (both logged).
//
// LE GABARIT VIENT DE LA MÉTHODE DU CABINET, PLUS DU PACK (ADR-079). L'ordre des
// sections, leurs intitulés et les colonnes des tableaux étaient écrits ici, en dur.
// Or le format d'un papier n'est ni un nom ni un calcul : c'est de la PRÉSENTATION,
// et c'est la signature du cabinet — le papier entre dans SON dossier et se fait
// relire par SON réviseur. Le code CALCULE le contenu de chaque bloc ; la méthode
// NOMME les blocs, leur ordre et leurs colonnes. Un bloc nommé que le moteur ne sait
// pas remplir, ou un bloc implémenté que le gabarit ne nomme pas, arrête le
// chargement de la méthode — dans les deux sens, comme partout ailleurs.

export interface WpTableRow {
  cells: (string | number)[];
  /** La pièce sur laquelle CETTE cellule a été lue, ou null (voir WpSection). */
  cellRefs?: (string | null)[];
  refs?: { evidenceIds?: string[]; sampleItemId?: string; exceptionIds?: string[] };
}

/**
 * LA SOURCE D'UNE CELLULE (revue utilisateur n°2 §3.3).
 *
 * « Les liens aux justificatifs doivent être sur toutes les cellules où des
 * données ont été cherchées sur ce justificatif. » Le mot juste est *cherchées*
 * : le numéro de pièce, le tiers, la date et le montant de ce tableau viennent
 * du GRAND LIVRE — les lier au justificatif laisserait croire qu'ils en sont
 * tirés, ce qui est précisément l'erreur qu'un contrôle sur pièces cherche.
 * Portent une source : ce qui a été LU sur le document (les justificatifs
 * obtenus, les contrôles effectués contre eux, les anomalies qui en sortent).
 */
export interface WpSection {
  key: string;
  title: string;
  body?: string;
  table?: { headers: string[]; rows: WpTableRow[] };
  meta?: Record<string, unknown>;
}

/** Why the projection is what it is. An empty projection is a conclusion about the sample,
 *  and it has to read like one (founder review 2026-08-25). */
function projectionRationale(method: string, lang: 'fr' | 'en'): string {
  if (method === 'none') {
    return lang === 'fr'
      ? 'Aucune projection n’est pratiquée : toutes les anomalies relevées se situent dans la strate examinée à 100 % (éléments à fort enjeu et éléments porteurs d’indicateurs de risque), et la strate tirée aléatoirement n’a révélé aucune anomalie. Il n’y a donc rien à extrapoler à la population non testée — ce n’est pas une projection omise, c’est une projection nulle.'
      : 'No projection is performed: every misstatement identified falls inside the 100 %-examined stratum (high-value and risk-flagged items), and the randomly drawn stratum returned no misstatement. There is nothing to extrapolate to the untested population — this is a nil projection, not an omitted one.';
  }
  return lang === 'fr'
    ? `Méthode de projection : ${method} (extrapolation des anomalies de la strate aléatoire à la population non testée).`
    : `Projection method: ${method} (extrapolation of random-stratum misstatements over the untested population).`;
}


export interface LigneEchantillonBrute {
  id: string; piece_ref: string | null; entry_no: string; aux_label: string | null;
  entry_date: string; amount: string | number; selection_reason: string;
}
export interface PieceDeLigne { id: string; sha256: string; doc_type: string | null; filename: string }
export interface ExtraitDeLigne { rung: string; verified_by: string | null; fields: { name: string; value: string }[] }

/**
 * LES CHAMPS D'UNE LIGNE DU TABLEAU D'ÉCHANTILLON — un seul formateur, pour
 * le papier ET pour l'aperçu vivant de l'atelier (point 10) : un aperçu qui
 * dériverait autrement que le papier serait une preuve empruntée (règle 16).
 */
export function champsLigneEchantillon(o: {
  fr: boolean; eur: (c: number) => string;
  it: LigneEchantillonBrute;
  evidences: PieceDeLigne[];
  extraction: ExtraitDeLigne | null;
  match: { status: string; checks: { check: string; pass: boolean }[] } | null;
  exceptions: { taxonomy_code: string; status: string }[];
}): Record<string, string> {
  const { fr, eur, it, evidences, extraction, match, exceptions } = o;
  let extractedSummary = '—';
  const inv = evidences.find((e) => e.doc_type === 'invoice' || e.doc_type === 'credit_note');
  if (inv && extraction) {
    const net = extraction.fields.find((f) => f.name === 'totalNetCents')?.value;
    const date = extraction.fields.find((f) => f.name === 'invoiceDate')?.value;
    extractedSummary = `${inv.filename} [${extraction.rung}${extraction.verified_by ? ', vérifié' : ''}] — ${net ? eur(Number(net)) : '?'} / ${date ?? '?'}`;
  }
  const bl = evidences.find((e) => e.doc_type === 'delivery_note');
  if (bl) extractedSummary += fr ? ` ; BL ${bl.filename}` : ` ; DN ${bl.filename}`;
  const checksSummary = match
    ? match.checks.length
      ? `${match.checks.filter((c) => c.pass).length}/${match.checks.length} ${fr ? 'contrôles conformes' : 'checks pass'}`
      : match.status
    : fr ? 'non testé' : 'not tested';
  return {
    piece: it.piece_ref ?? it.entry_no,
    tiers: it.aux_label ?? '',
    date: it.entry_date,
    montant: eur(numToCents(it.amount)),
    selection: it.selection_reason,
    justificatifs: extractedSummary,
    controles: checksSummary,
    anomalies: exceptions.length
      ? exceptions.map((x) => `${x.taxonomy_code} (${x.status})`).join('; ')
      : fr ? 'RAS' : 'none',
  };
}

export async function draftRevenueWorkpaper(engagementId: string, userId: string): Promise<string> {
  await assertMembre(engagementId, userId, 'draftRevenueWorkpaper');
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const fr = pack.language === 'fr';
  const wp = pack.wp;

  const mat = await currentMateriality(engagementId);
  if (!mat || mat.status !== 'validated') throw new Error('validated materiality required');
  const sample = await currentRevenueSample(engagementId);
  if (!sample || sample.status !== 'drawn') throw new Error('drawn sample required');
  const recon = await latestTbGl(engagementId);
  const exceptions = await listExceptions(engagementId);
  const evaluation = await currentEvaluation(engagementId);
  const gate = await conclusionGate(engagementId);
  const limitations = await scopeLimitations(engagementId);
  const responses = evaluation ? await evaluationResponses(evaluation.id) : [];

  const eur = (c: number) => fmtEur(c, pack.language);
  /* Le gabarit du CABINET : sections, ordre, intitulés, colonnes, référence. */
  const cat = await catalogueDeLaMission(engagementId);

  // sample table with per-item evidence refs + extracted fields (idea #15 / P7)
  const sampleRows: WpTableRow[] = [];
  for (const it of sample.items) {
    /* LES PIÈCES LES PLUS RÉCENTES D'ABORD, et jamais une lecture en attente :
       c'est la règle du vouching (loadItemContext) — le papier doit décrire la
       MÊME pièce que celle contre laquelle les contrôles ont tourné. Sans
       l'ordre, une seconde facture déposée (pièce complémentaire du client)
       laissait le papier citer l'ancienne pendant que le vouching lisait la
       nouvelle. */
    const evidences = await q<{ id: string; sha256: string; doc_type: string | null; filename: string }>(
      `select e.id, e.sha256, e.doc_type, e.filename from evidence e
       join request_item ri on ri.id = e.request_item_id
       where ri.sample_item_id = $1 and e.quarantined = false
       order by e.doc_type, e.created_at desc`,
      [it.id],
    );
    const match = await q01<{ status: string; checks: { check: string; pass: boolean }[] }>(
      `select status, checks from match where sample_item_id = $1`,
      [it.id],
    );
    let x: Awaited<ReturnType<typeof latestExtraction>> = null;
    for (const e of evidences) {
      if (e.doc_type !== 'invoice' && e.doc_type !== 'credit_note') continue;
      const cand = await latestExtraction(e.id);
      if (cand && cand.status !== 'pending_verify') { x = cand; break; }
    }
    const itemExceptions = exceptions.filter((xx) => xx.sample_item_id === it.id);
    /* LA pièce sur laquelle les données ont été cherchées — la même que celle
       que le vouching a lue (l'ordre des pièces est déjà celui du vouching). */
    const inv = evidences.find((e) => e.doc_type === 'invoice' || e.doc_type === 'credit_note');
    /* Les champs sont NOMMÉS (formateur partagé avec l'aperçu vivant de
       l'atelier), et les colonnes du cabinet en choisissent l'ordre et le
       sous-ensemble. */
    const champs = champsLigneEchantillon({
      fr, eur, it, evidences,
      extraction: x ? { rung: x.rung, verified_by: x.verified_by, fields: x.fields } : null,
      match, exceptions: itemExceptions,
    });
    const source = inv?.id ?? null;
    const SOURCE_PAR_CHAMP: Record<string, string | null> = {
      justificatifs: source, controles: source, anomalies: source,
    };
    sampleRows.push({
      cells: colonnes(cat, 'substantif', 'echantillon').map((c) => champs[c.champ] ?? ''),
      cellRefs: colonnes(cat, 'substantif', 'echantillon')
        .map((c) => SOURCE_PAR_CHAMP[c.champ] ?? null),
      refs: {
        evidenceIds: evidences.map((e) => e.id),
        sampleItemId: it.id,
        exceptionIds: itemExceptions.map((x) => x.id),
      },
    });
  }

  const exceptionRows: WpTableRow[] = exceptions
    .filter((x) => x.kind !== 'verification')
    .map((x) => {
      const champs: Record<string, string> = {
        type: x.taxonomy_code,
        description: x.description.slice(0, 160),
        impact: x.amount_impact ? eur(numToCents(x.amount_impact)) : '—',
        statut: x.status,
        suite: x.resolution ?? '—',
      };
      return {
        cells: colonnes(cat, 'substantif', 'exceptions').map((c) => champs[c.champ] ?? ''),
        refs: { exceptionIds: [x.id] },
      };
    });

  const verifChecks = await q<{ piece_ref: string | null; result: string; seconds_spent: number | null; escalation: string | null }>(
    `select g.piece_ref, vc.result, vc.seconds_spent, vc.escalation
     from verification_check vc
     join sample_item si on si.id = vc.sample_item_id
     join gl_entry g on g.id = si.unit_id
     where vc.engagement_id = $1 order by vc.performed_at`,
    [engagementId],
  );

  const misstatements = await q<{ kind: string; amount: string; corrected: boolean; status: string }>(
    `select kind, amount::text, corrected, status from misstatement where engagement_id = $1`,
    [engagementId],
  );

  const documentedDiffs = (recon?.items ?? []).filter((i) => i.status !== 'open');

  /* Chaque bloc est CALCULÉ ici et rangé sous son nom. L'ordre et les
     intitulés viennent du gabarit, plus bas : le moteur ne décide plus ni de
     ce qui apparaît, ni dans quel ordre. */
  const blocs: Record<string, Omit<WpSection, 'key' | 'title'>> = {
    objectif: {
      body: fr
        ? `Vérifier la réalité, l'exactitude et la séparation des exercices du chiffre d'affaires (comptes 70x) de l'exercice clos le 31/12/2025, par rapprochement des écritures comptables sélectionnées avec les pièces justificatives (factures, bons de livraison), conformément au programme de travail du pack ${pack.name}. Seuil de signification : ${eur(numToCents(mat.amount))} ; seuil de planification : ${eur(numToCents(mat.perf_amount))} ; anomalie tolérable : ${eur(numToCents(mat.te_amount))}.`
        : `Test occurrence, accuracy and cut-off of revenue for FY2025 by vouching selected GL entries to supporting evidence. Materiality ${eur(numToCents(mat.amount))}; performance materiality ${eur(numToCents(mat.perf_amount))}; tolerable misstatement ${eur(numToCents(mat.te_amount))}.`,
    },
    etendue: {
      body: fr
        ? `Population : ${sample.population_size} lignes d'écritures sur les comptes 70x, total ${eur(numToCents(sample.population_amount))} (empreinte ${sample.population_hash.slice(0, 24)}…). Rapprochement GL↔Balance : ${recon?.items.length === 0 ? 'aucun écart' : `${recon?.items.length} écart(s), dont ${documentedDiffs.length} documenté(s)`}${documentedDiffs.length ? ' — ' + documentedDiffs.map((d) => `${d.account_no} (${d.note ?? ''})`).join(' ; ') : ''}.`
        : `Population: ${sample.population_size} GL lines on 70x accounts, total ${eur(numToCents(sample.population_amount))}. TB↔GL reconciliation: ${recon?.items.length ?? 0} difference(s), ${documentedDiffs.length} documented.`,
    },
    methode: {
      body: (sample.rationale ?? '') + (fr
        ? ` Tirage exécuté le ${sample.validated_at?.slice(0, 10) ?? ''} — germe « ${sample.seed} », reproductible à l'identique.`
        : ` Draw executed with seed "${sample.seed}" — reproducible.`),
      meta: { params: sample.params, populationHash: sample.population_hash },
    },
    tableau_echantillon: {
      table: {
        headers: colonnes(cat, 'substantif', 'echantillon').map((c) => c.titre),
        rows: sampleRows,
      },
      /* Le GROUPE vient du gabarit du cabinet : c'est la méthode qui dit ce
         qui décrit l'élément TIRÉ et ce qui décrit les TRAVAUX. */
      meta: {
        groupes: colonnes(cat, 'substantif', 'echantillon')
          .map((c) => c.groupe ?? 'selection'),
      },
    },
    exceptions: {
      table: {
        headers: colonnes(cat, 'substantif', 'exceptions').map((c) => c.titre),
        rows: exceptionRows,
      },
      body: misstatements.length
        ? (fr ? 'Anomalies portées à l’état des anomalies : ' : 'Misstatements recorded: ') +
          misstatements.map((m) => `${m.kind} ${eur(numToCents(m.amount))} ${m.corrected ? (fr ? '(corrigée)' : '(corrected)') : (fr ? '(non corrigée)' : '(uncorrected)')}`).join(' ; ')
        : undefined,
    },
    evaluation: {
      body: evaluation
        ? fr
          ? `Anomalies connues : ${eur(numToCents(evaluation.known_misstatement))}. ` +
            `Anomalies projetées : ${eur(numToCents(evaluation.projected_misstatement))} sur une population non testée de ${eur(numToCents(evaluation.untested_amount))}. ` +
            // "(none)" invited the reading "we did not project". Say why there is nothing
            // to project, so an inspector reads a reasoning and not an omission.
            `${projectionRationale(evaluation.projection_method, 'fr')} ` +
            `Total connu + projeté : ${eur(numToCents(evaluation.known_misstatement) + numToCents(evaluation.projected_misstatement))}, à comparer à l’anomalie tolérable de ${eur(numToCents(evaluation.te_amount))}. ` +
            `${evaluation.status === 'concluded' ? `Conclusion (validée) : ${evaluation.conclusion_basis}` : 'Évaluation non conclue.'}`
          : `Known ${eur(numToCents(evaluation.known_misstatement))}; projected ${eur(numToCents(evaluation.projected_misstatement))} over an untested population of ${eur(numToCents(evaluation.untested_amount))}. ` +
            `${projectionRationale(evaluation.projection_method, 'en')} ` +
            `Known + projected ${eur(numToCents(evaluation.known_misstatement) + numToCents(evaluation.projected_misstatement))} against tolerable misstatement ${eur(numToCents(evaluation.te_amount))}. ` +
            `${evaluation.status === 'concluded' ? `Conclusion: ${evaluation.conclusion_basis}` : 'Not concluded.'}`
        : fr ? 'Évaluation non calculée.' : 'Not computed.',
    },
    verification: {
      body: verifChecks.length
        ? (fr
            ? `Contrôle de fiabilité (re-exécution à l'aveugle d'un sous-échantillon aléatoire d'éléments conformes, ADR-012) : ${verifChecks.length} élément(s) re-exécuté(s), ${verifChecks.filter((v) => v.result === 'agree').length} concordant(s). `
            : `Reliability spot-check (blind re-performance): ${verifChecks.length} item(s), ${verifChecks.filter((v) => v.result === 'agree').length} in agreement. `) +
          verifChecks.map((v) => `${v.piece_ref ?? '—'}: ${v.result}${v.escalation && v.escalation !== 'none' ? ` → ${v.escalation}` : ''}`).join(' ; ')
        : fr ? 'Non réalisé à la date du présent document.' : 'Not performed yet.',
    },
    conclusion: {
      body: fr
        ? [
            gate.ok
              ? 'Toutes les anomalies relevées ont été traitées et l’évaluation par rapport à l’anomalie tolérable a été conclue.'
              : `CONCLUSION DÉFINITIVE BLOQUÉE — ${gate.blockers.map((b) => blockerText(b, 'fr')).join(' ; ')}.`,
            gate.withinTolerable === false
              ? `Le total des anomalies connues et projetées dépasse l’anomalie tolérable. Réponse enregistrée : ${responses.map((r) => `${r.kind} — ${r.rationale}`).join(' ; ') || 'aucune'}`
              : '',
            limitations.length
              ? `Limitations sur les éléments probants (${limitations.length}) : ` +
                limitations.map((l) => `${l.taxonomy_code}${l.amount_impact ? ` (${eur(numToCents(l.amount_impact))})` : ''} — ${l.alternative_procedures}`).join(' ; ')
              : 'Aucune limitation sur les éléments probants.',
            evaluation?.status === 'concluded'
              ? `Conclusion validée : ${evaluation.conclusion_basis}`
              : '[Projet de conclusion à compléter et valider par le signataire.]',
          ].filter(Boolean).join(' ')
        : [
            gate.ok ? 'All exceptions dispositioned and evaluation concluded.' : `FINAL CONCLUSION BLOCKED — ${gate.blockers.map((b) => blockerText(b, 'en')).join('; ')}.`,
            limitations.length
              ? `Limitations on available evidence (${limitations.length}): ` +
                limitations.map((l) => `${l.taxonomy_code} — ${l.alternative_procedures}`).join('; ')
              : 'No limitation on available evidence.',
            evaluation?.status === 'concluded' ? `Conclusion: ${evaluation.conclusion_basis}` : '[Draft conclusion to be completed by the signer.]',
          ].filter(Boolean).join(' '),
      meta: { gate, limitations, responses },
    },
  };

  /* LE GABARIT DÉCIDE : quelles sections, dans quel ordre, sous quel intitulé.
     Le validateur a déjà refusé un bloc nommé que le moteur ne remplit pas, et
     un bloc rempli que le gabarit ne nomme pas — donc ici, un bloc absent est
     un défaut du MOTEUR, et il lève au lieu de sortir une section vide. */
  const g = gabarit(cat, 'substantif');
  const sections: WpSection[] = g.sections.map((sec) => {
    const contenu = blocs[sec.bloc];
    if (!contenu) {
      throw new Error(
        `bloc « ${sec.bloc} » nommé par le gabarit et non produit par le moteur — `
        + `le papier sortirait avec une section vide`,
      );
    }
    return { key: sec.bloc, title: sec.titre, ...contenu };
  });

  const basedOnHash = hashObject({
    sampleId: sample.id,
    items: sample.items.map((i) => i.id),
    exceptions: exceptions.map((x) => [x.id, x.status]),
    evaluation: evaluation ? [evaluation.id, evaluation.status] : null,
    materiality: mat.id,
  });

  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'workpaper_draft','v1',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, engagementId, pack.id, hashObject(pack.wp), JSON.stringify({ code: 'REV-01', basedOnHash })],
  );

  const prev = await q<{ id: string; version: number; reference: string | null }>(
    `select id, version, reference from workpaper where engagement_id = $1 and code = 'REV-01' order by version desc`,
    [engagementId],
  );
  if (prev.length > 0) {
    await q(`update workpaper set status = 'outdated' where engagement_id = $1 and code = 'REV-01' and status <> 'outdated'`, [engagementId]);
  }
  const version = (prev[0]?.version ?? 0) + 1;

  /* LA RÉFÉRENCE DU CABINET, calculée par SON modèle et FIGÉE.
     Elle se calcule une fois — au premier projet — puis se reprend d'une
     version à l'autre : un papier signé garde la référence sous laquelle il a
     été signé, même si le cabinet change son plan de classement l'an prochain.
     La séquence compte les papiers DÉJÀ référencés du même poste, pour que
     deux papiers d'un même poste ne se marchent pas dessus. */
  let reference = prev[0]?.reference ?? null;
  if (!reference) {
    const dejaVus = await q1<{ n: string }>(
      `select count(distinct code) n from workpaper
       where engagement_id = $1 and reference is not null and code <> 'REV-01'`,
      [engagementId],
    );
    reference = referencePapier(cat, {
      poste: 'REVENUE', sequence: Number(dejaVus.n) + 1, code: 'REV-01', version,
    });
  }

  const row = await q1<{ id: string }>(
    `insert into workpaper (engagement_id, pack_id, code, reference, procedure_id, title, language, sections, status, version, based_on_hash, engine_run_id)
     values ($1,$2,'REV-01',$10,
       (select procedure_id from sample where id = $3),
       $4,$5,$6,'draft',$7,$8,$9) returning id`,
    [
      engagementId, pack.id, sample.id,
      fr ? "REV-01 — Contrôle substantif du chiffre d'affaires" : 'REV-01 — Revenue substantive testing',
      pack.language, JSON.stringify(sections), version, basedOnHash, run.id, reference,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'workpaper_drafted', objectType: 'workpaper', objectId: row.id,
    payload: { code: 'REV-01', version, engineRun: run.id, requestedBy: userId },
  });
  return row.id;
}
