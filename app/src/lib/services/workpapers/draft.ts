import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { fmtEur } from '@/lib/kernel/canon';
import { primaryPack } from '@/lib/packs';
import { numToCents } from '@/lib/util/num';
import { engagementCtx } from '../imports';
import { frameworkSet } from '../fsli';
import { currentMateriality } from '../materiality';
import { currentRevenueSample } from '../sampling';
import { latestTbGl } from '../reconciliation';
import { listExceptions } from '../matching';
import { currentEvaluation, conclusionGate } from '../evaluation';
import { latestExtraction } from '../extraction/ladder';

// S7 — documentation engine. Workpapers are STRUCTURED sections assembled from stored
// facts (never recomputed): every figure carries its source refs (P7). Attribution per
// ADR-012.4: "Performed by OTTO engine run — validated by [human]". Drafted prose is
// template-based here (engine_run); a live LLM redraft would be an ai_run (both logged).

export interface WpTableRow {
  cells: (string | number)[];
  refs?: { evidenceIds?: string[]; sampleItemId?: string; exceptionIds?: string[] };
}

export interface WpSection {
  key: string;
  title: string;
  body?: string;
  table?: { headers: string[]; rows: WpTableRow[] };
  meta?: Record<string, unknown>;
}

export async function draftRevenueWorkpaper(engagementId: string, userId: string): Promise<string> {
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

  const eur = (c: number) => fmtEur(c, pack.language);

  // sample table with per-item evidence refs + extracted fields (idea #15 / P7)
  const sampleRows: WpTableRow[] = [];
  for (const it of sample.items) {
    const evidences = await q<{ id: string; sha256: string; doc_type: string | null; filename: string }>(
      `select e.id, e.sha256, e.doc_type, e.filename from evidence e
       join request_item ri on ri.id = e.request_item_id
       where ri.sample_item_id = $1 and e.quarantined = false`,
      [it.id],
    );
    const match = await q01<{ status: string; checks: { check: string; pass: boolean }[] }>(
      `select status, checks from match where sample_item_id = $1`,
      [it.id],
    );
    let extractedSummary = '—';
    const inv = evidences.find((e) => e.doc_type === 'invoice' || e.doc_type === 'credit_note');
    if (inv) {
      const x = await latestExtraction(inv.id);
      if (x) {
        const net = x.fields.find((f) => f.name === 'totalNetCents')?.value;
        const date = x.fields.find((f) => f.name === 'invoiceDate')?.value;
        extractedSummary = `${inv.filename} [${x.rung}${x.verified_by ? ', vérifié' : ''}] — ${net ? eur(Number(net)) : '?'} / ${date ?? '?'}`;
      }
    }
    const bl = evidences.find((e) => e.doc_type === 'delivery_note');
    if (bl) extractedSummary += fr ? ` ; BL ${bl.filename}` : ` ; DN ${bl.filename}`;
    const checksSummary = match
      ? match.checks.length
        ? `${match.checks.filter((c) => c.pass).length}/${match.checks.length} ${fr ? 'contrôles conformes' : 'checks pass'}`
        : match.status
      : fr ? 'non testé' : 'not tested';
    const itemExceptions = exceptions.filter((x) => x.sample_item_id === it.id);
    sampleRows.push({
      cells: [
        it.piece_ref ?? it.entry_no,
        it.aux_label ?? '',
        it.entry_date,
        eur(numToCents(it.amount)),
        it.selection_reason,
        extractedSummary,
        checksSummary,
        itemExceptions.length
          ? itemExceptions.map((x) => `${x.taxonomy_code} (${x.status})`).join('; ')
          : fr ? 'RAS' : 'none',
      ],
      refs: {
        evidenceIds: evidences.map((e) => e.id),
        sampleItemId: it.id,
        exceptionIds: itemExceptions.map((x) => x.id),
      },
    });
  }

  const exceptionRows: WpTableRow[] = exceptions
    .filter((x) => x.kind !== 'verification')
    .map((x) => ({
      cells: [
        x.taxonomy_code,
        x.description.slice(0, 160),
        x.amount_impact ? eur(numToCents(x.amount_impact)) : '—',
        x.status,
        x.resolution ?? '—',
      ],
      refs: { exceptionIds: [x.id] },
    }));

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

  const sections: WpSection[] = [
    {
      key: 'objective',
      title: wp.objective,
      body: fr
        ? `Vérifier la réalité, l'exactitude et la séparation des exercices du chiffre d'affaires (comptes 70x) de l'exercice clos le 31/12/2025, par rapprochement des écritures comptables sélectionnées avec les pièces justificatives (factures, bons de livraison), conformément au programme de travail du pack ${pack.name}. Seuil de signification : ${eur(numToCents(mat.amount))} ; seuil de planification : ${eur(numToCents(mat.perf_amount))} ; anomalie tolérable : ${eur(numToCents(mat.te_amount))}.`
        : `Test occurrence, accuracy and cut-off of revenue for FY2025 by vouching selected GL entries to supporting evidence. Materiality ${eur(numToCents(mat.amount))}; performance materiality ${eur(numToCents(mat.perf_amount))}; tolerable misstatement ${eur(numToCents(mat.te_amount))}.`,
    },
    {
      key: 'scope',
      title: wp.scope,
      body: fr
        ? `Population : ${sample.population_size} lignes d'écritures sur les comptes 70x, total ${eur(numToCents(sample.population_amount))} (empreinte ${sample.population_hash.slice(0, 24)}…). Rapprochement GL↔Balance : ${recon?.items.length === 0 ? 'aucun écart' : `${recon?.items.length} écart(s), dont ${documentedDiffs.length} documenté(s)`}${documentedDiffs.length ? ' — ' + documentedDiffs.map((d) => `${d.account_no} (${d.note ?? ''})`).join(' ; ') : ''}.`
        : `Population: ${sample.population_size} GL lines on 70x accounts, total ${eur(numToCents(sample.population_amount))}. TB↔GL reconciliation: ${recon?.items.length ?? 0} difference(s), ${documentedDiffs.length} documented.`,
    },
    {
      key: 'method',
      title: wp.method,
      body: (sample.rationale ?? '') + (fr
        ? ` Tirage exécuté le ${sample.validated_at?.slice(0, 10) ?? ''} — germe « ${sample.seed} », reproductible à l'identique.`
        : ` Draw executed with seed "${sample.seed}" — reproducible.`),
      meta: { params: sample.params, populationHash: sample.population_hash },
    },
    {
      key: 'sampleTable',
      title: wp.sampleTable,
      table: {
        headers: fr
          ? ['Pièce', 'Tiers', 'Date', 'Montant HT', 'Sélection', 'Justificatifs obtenus (extraction)', 'Contrôles', 'Anomalies']
          : ['Piece', 'Counterparty', 'Date', 'Net amount', 'Selection', 'Evidence obtained (extraction)', 'Checks', 'Exceptions'],
        rows: sampleRows,
      },
    },
    {
      key: 'exceptions',
      title: wp.exceptions,
      table: {
        headers: fr
          ? ['Type', 'Description', 'Impact', 'Statut', 'Suite donnée']
          : ['Type', 'Description', 'Impact', 'Status', 'Disposition'],
        rows: exceptionRows,
      },
      body: misstatements.length
        ? (fr ? 'Anomalies portées à l’état des anomalies : ' : 'Misstatements recorded: ') +
          misstatements.map((m) => `${m.kind} ${eur(numToCents(m.amount))} ${m.corrected ? (fr ? '(corrigée)' : '(corrected)') : (fr ? '(non corrigée)' : '(uncorrected)')}`).join(' ; ')
        : undefined,
    },
    {
      key: 'evaluation',
      title: wp.evaluation,
      body: evaluation
        ? fr
          ? `Anomalies connues : ${eur(numToCents(evaluation.known_misstatement))}. Anomalies projetées (${evaluation.projection_method}) : ${eur(numToCents(evaluation.projected_misstatement))} sur une population non testée de ${eur(numToCents(evaluation.untested_amount))}. Total connu + projeté : ${eur(numToCents(evaluation.known_misstatement) + numToCents(evaluation.projected_misstatement))} à comparer à l'anomalie tolérable de ${eur(numToCents(evaluation.te_amount))}. ${evaluation.status === 'concluded' ? `Conclusion (validée) : ${evaluation.conclusion_basis}` : 'Évaluation non conclue.'}`
          : `Known ${eur(numToCents(evaluation.known_misstatement))}; projected ${eur(numToCents(evaluation.projected_misstatement))}; untested ${eur(numToCents(evaluation.untested_amount))}; TE ${eur(numToCents(evaluation.te_amount))}. ${evaluation.status === 'concluded' ? `Conclusion: ${evaluation.conclusion_basis}` : 'Not concluded.'}`
        : fr ? 'Évaluation non calculée.' : 'Not computed.',
    },
    {
      key: 'verification',
      title: wp.verification,
      body: verifChecks.length
        ? (fr
            ? `Contrôle de fiabilité (re-exécution à l'aveugle d'un sous-échantillon aléatoire d'éléments conformes, ADR-012) : ${verifChecks.length} élément(s) re-exécuté(s), ${verifChecks.filter((v) => v.result === 'agree').length} concordant(s). `
            : `Reliability spot-check (blind re-performance): ${verifChecks.length} item(s), ${verifChecks.filter((v) => v.result === 'agree').length} in agreement. `) +
          verifChecks.map((v) => `${v.piece_ref ?? '—'}: ${v.result}${v.escalation && v.escalation !== 'none' ? ` → ${v.escalation}` : ''}`).join(' ; ')
        : fr ? 'Non réalisé à la date du présent document.' : 'Not performed yet.',
    },
    {
      key: 'conclusion',
      title: wp.conclusion,
      body: fr
        ? `${gate.ok ? 'Toutes les anomalies relevées ont été traitées (résolues ou portées à l’état des anomalies) et l’évaluation par rapport à l’anomalie tolérable a été conclue.' : `ATTENTION : ${gate.openExceptions} anomalie(s) non traitée(s)${gate.evaluationConcluded ? '' : ' ; évaluation non conclue'} — la conclusion ne peut pas être signée en l’état.`} [Projet de conclusion à compléter et valider par le signataire : sur la base des travaux décrits ci-dessus, aucune anomalie significative non traitée n'a été identifiée au titre du chiffre d'affaires, sous réserve des éléments portés à l'état des anomalies.]`
        : `${gate.ok ? 'All exceptions dispositioned and evaluation concluded.' : `WARNING: ${gate.openExceptions} exception(s) open.`} [Draft conclusion to be completed by the signer.]`,
      meta: { gate },
    },
  ];

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

  const prev = await q<{ id: string; version: number }>(
    `select id, version from workpaper where engagement_id = $1 and code = 'REV-01' order by version desc`,
    [engagementId],
  );
  if (prev.length > 0) {
    await q(`update workpaper set status = 'outdated' where engagement_id = $1 and code = 'REV-01' and status <> 'outdated'`, [engagementId]);
  }
  const version = (prev[0]?.version ?? 0) + 1;
  const row = await q1<{ id: string }>(
    `insert into workpaper (engagement_id, pack_id, code, procedure_id, title, language, sections, status, version, based_on_hash, engine_run_id)
     values ($1,$2,'REV-01',
       (select procedure_id from sample where id = $3),
       $4,$5,$6,'draft',$7,$8,$9) returning id`,
    [
      engagementId, pack.id, sample.id,
      fr ? "REV-01 — Contrôle substantif du chiffre d'affaires" : 'REV-01 — Revenue substantive testing',
      pack.language, JSON.stringify(sections), version, basedOnHash, run.id,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'workpaper_drafted', objectType: 'workpaper', objectId: row.id,
    payload: { code: 'REV-01', version, engineRun: run.id, requestedBy: userId },
  });
  return row.id;
}
