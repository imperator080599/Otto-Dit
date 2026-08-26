import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { hashObject } from '@/lib/core/hash';
import { vouchRevenueLine, checksToExceptionCodes, findDuplicateInvoices } from '@/lib/kernel/matching';
import type { CheckResult, GlRow, InvoiceFields } from '@/lib/kernel/types';
import { primaryPack } from '@/lib/packs';
import { centsToNum, numToCents } from '@/lib/util/num';
import { engagementCtx } from './imports';
import { frameworkSet } from './fsli';
import { currentRevenueSample } from './sampling';
import { latestExtraction } from './extraction/ladder';
import { fieldsToInvoice, fieldsToDelivery } from './extraction/fields';

// S6 — deterministic vouching over the drawn sample (L0, engine_run recorded), typed
// exceptions with lifecycle, risk-flag exceptions (manual JE, credit-note pattern),
// duplicate detection across sampled items. Auditors consume exceptions, never raw
// matches (P8).

interface ItemContext {
  sampleItemId: string;
  gl: GlRow & { id: string; flags: string[] };
  invoice?: InvoiceFields;
  invoiceEvidenceId?: string;
  invoicePendingVerify: boolean;
  delivery?: ReturnType<typeof fieldsToDelivery>;
  deliveryEvidenceId?: string;
  hasDeliveryItem: boolean;
  explanation?: string | null;
}

async function loadItemContext(engagementId: string): Promise<ItemContext[]> {
  const sample = await currentRevenueSample(engagementId);
  if (!sample || sample.status !== 'drawn') throw new Error('no drawn sample');
  const out: ItemContext[] = [];
  for (const it of sample.items) {
    const glRow = await q1<{
      id: string; line_no: number; natural_key: string; journal_code: string; entry_no: string;
      entry_date: string; account_no: string; aux_no: string | null; aux_label: string | null;
      piece_ref: string | null; piece_date: string | null; label: string | null;
      debit: string; credit: string; flags: string[];
    }>(
      `select id, line_no, natural_key, journal_code, entry_no, entry_date::text, account_no,
              aux_no, aux_label, piece_ref, piece_date::text, label, debit::text, credit::text, flags
       from gl_entry where id = $1`,
      [it.unit_id],
    );
    const gl = {
      id: glRow.id,
      naturalKey: glRow.natural_key,
      lineNo: glRow.line_no,
      journalCode: glRow.journal_code,
      entryNo: glRow.entry_no,
      entryDate: glRow.entry_date,
      accountNo: glRow.account_no,
      auxNo: glRow.aux_no ?? undefined,
      auxLabel: glRow.aux_label ?? undefined,
      pieceRef: glRow.piece_ref ?? undefined,
      pieceDate: glRow.piece_date ?? undefined,
      label: glRow.label ?? undefined,
      debitCents: numToCents(glRow.debit),
      creditCents: numToCents(glRow.credit),
      flags: glRow.flags ?? [],
    };
    const requestItems = await q<{ id: string; kind: string; description: string; client_note: string | null }>(
      `select id, kind, description, client_note from request_item where sample_item_id = $1`,
      [it.id],
    );
    const ctx: ItemContext = {
      sampleItemId: it.id,
      gl,
      invoicePendingVerify: false,
      hasDeliveryItem: requestItems.some((ri) => ri.kind === 'document' && /livraison|delivery/i.test(ri.description)),
      explanation: requestItems.find((ri) => ri.kind === 'explanation')?.client_note ?? null,
    };
    for (const ri of requestItems) {
      const evs = await q<{ id: string; doc_type: string | null }>(
        `select id, doc_type from evidence where request_item_id = $1 and quarantined = false order by created_at desc`,
        [ri.id],
      );
      for (const ev of evs) {
        const x = await latestExtraction(ev.id);
        if (!x) continue;
        if (x.status === 'pending_verify') {
          if (ev.doc_type === 'invoice' || ev.doc_type === 'credit_note') ctx.invoicePendingVerify = true;
          continue;
        }
        if ((ev.doc_type === 'invoice' || ev.doc_type === 'credit_note') && !ctx.invoice) {
          ctx.invoice = fieldsToInvoice(x.fields);
          ctx.invoiceEvidenceId = ev.id;
        } else if (ev.doc_type === 'delivery_note' && !ctx.delivery) {
          ctx.delivery = fieldsToDelivery(x.fields);
          ctx.deliveryEvidenceId = ev.id;
        }
      }
    }
    out.push(ctx);
  }
  return out;
}

async function raiseException(opts: {
  engagementId: string;
  taxonomy: string;
  sampleItemId?: string | null;
  matchId?: string | null;
  evidenceId?: string | null;
  description: string;
  amountImpactCents?: number | null;
  severity?: 'low' | 'normal' | 'high';
}): Promise<string | null> {
  // one open exception per (sample_item, taxonomy) — re-runs never duplicate
  const existing = await q01<{ id: string }>(
    `select id from exception where engagement_id = $1 and taxonomy_code = $2
       and sample_item_id is not distinct from $3 and status <> 'resolved'`,
    [opts.engagementId, opts.taxonomy, opts.sampleItemId ?? null],
  );
  if (existing) return null;
  const row = await q1<{ id: string }>(
    `insert into exception (engagement_id, taxonomy_code, kind, sample_item_id, match_id, evidence_id, severity, description, amount_impact)
     values ($1,$2,'substantive',$3,$4,$5,$6,$7,$8) returning id`,
    [
      opts.engagementId, opts.taxonomy, opts.sampleItemId ?? null, opts.matchId ?? null,
      opts.evidenceId ?? null, opts.severity ?? 'normal', opts.description,
      opts.amountImpactCents !== undefined && opts.amountImpactCents !== null ? centsToNum(opts.amountImpactCents) : null,
    ],
  );
  return row.id;
}

export async function runMatching(engagementId: string, userId: string | null): Promise<{ matched: number; exceptions: number; pending: number }> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const pack = primaryPack(fs as never);
  const tol = pack.substantive!.tolerances;
  const items = await loadItemContext(engagementId);

  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'matching','v1',$3,$4,$5, now()) returning id`,
    [ctx.tenant_id, engagementId, pack.id, hashObject(tol), JSON.stringify({ items: items.length })],
  );

  let matched = 0;
  let exceptions = 0;
  let pending = 0;

  for (const it of items) {
    const isManualJe = it.gl.journalCode === 'OD';
    const isCreditNote = it.gl.accountNo.startsWith('709');
    const requireDelivery = it.gl.accountNo.startsWith('701') && it.hasDeliveryItem;

    // risk-flag exceptions (deterministic, ADR-003)
    if (isManualJe) {
      const id = await raiseException({
        engagementId,
        taxonomy: 'manual_journal_flag',
        sampleItemId: it.sampleItemId,
        description: `Écriture manuelle atypique ${it.gl.entryNo} (${it.gl.entryDate}) : week-end, montant rond (${centsToNum(Math.abs(it.gl.creditCents - it.gl.debitCents))} €), journal OD — explication requise.`,
        // the whole entry is what is at risk until the explanation stands up
        amountImpactCents: Math.abs(it.gl.creditCents - it.gl.debitCents) || null,
        severity: 'high',
      });
      if (id) exceptions++;
      await upsertMatch(it.sampleItemId, 'exception', [], run.id);
      await q(`update sample_item set status = 'exception' where id = $1`, [it.sampleItemId]);
      continue;
    }
    if (isCreditNote && it.gl.flags.includes('credit_note_pattern')) {
      const id = await raiseException({
        engagementId,
        taxonomy: 'credit_note_pattern',
        sampleItemId: it.sampleItemId,
        evidenceId: it.invoiceEvidenceId ?? null,
        description: `Avoir ${it.gl.pieceRef ?? it.gl.entryNo} — fait partie d'une série d'avoirs récurrents au même tiers (${it.gl.auxLabel ?? it.gl.auxNo}) : justification du schéma requise.`,
        severity: 'normal',
      });
      if (id) exceptions++;
    }

    if (it.invoicePendingVerify) {
      await upsertMatch(it.sampleItemId, 'pending_verify', [], run.id);
      pending++;
      continue;
    }
    if (!it.invoice) {
      await upsertMatch(it.sampleItemId, 'pending_evidence', [], run.id);
      pending++;
      continue;
    }

    const checks = vouchRevenueLine(
      {
        gl: it.gl,
        clientPartyName: 'Altiverre SAS',
        invoice: it.invoice,
        invoiceProvenance: it.invoiceEvidenceId,
        delivery: it.delivery,
        requireDelivery,
      },
      tol,
    );
    const failed = checks.filter((c) => !c.pass);
    const matchRow = await upsertMatch(it.sampleItemId, failed.length ? 'exception' : 'matched', checks, run.id);
    if (failed.length === 0) {
      matched++;
      await q(`update sample_item set status = 'tested' where id = $1`, [it.sampleItemId]);
    } else {
      await q(`update sample_item set status = 'exception' where id = $1`, [it.sampleItemId]);
      for (const code of checksToExceptionCodes(checks)) {
        const detail = failed.map((f) => `${f.check}: attendu ${f.expected}, obtenu ${f.found} (tolérance ${f.tolerance})`).join(' ; ');
        // Quantify wherever the checks allow it. An exception the engine leaves at "null"
        // is one a human has to price by hand before it can be accumulated — so the engine
        // does the arithmetic it can: price/amount deltas, quantity shortfalls valued at
        // the billed unit price, and whole-entry misstatements (cut-off, duplicate booking,
        // an unsupported manual journal) valued at the amount actually booked.
        const bookedCents = Math.abs(it.gl.creditCents - it.gl.debitCents) || null;
        const amountImpact = estimateImpact(code, failed, bookedCents);
        const id = await raiseException({
          engagementId,
          taxonomy: code,
          sampleItemId: it.sampleItemId,
          matchId: matchRow,
          evidenceId: it.invoiceEvidenceId ?? null,
          description: `Pièce ${it.gl.pieceRef ?? it.gl.entryNo} (${it.gl.auxLabel ?? ''}) — ${detail}`,
          amountImpactCents: amountImpact,
          severity: code === 'cutoff' || code === 'missing_document' ? 'high' : 'normal',
        });
        if (id) exceptions++;
      }
    }
  }

  // duplicates across all sampled items (kernel) — invoice number reused
  const dupes = findDuplicateInvoices(
    items.filter((i) => i.invoice).map((i) => ({ unitId: i.sampleItemId, invoice: i.invoice! })),
  );
  for (const [invoiceNo, itemIds] of dupes) {
    for (const sampleItemId of itemIds) {
      const item = items.find((i) => i.sampleItemId === sampleItemId)!;
      const id = await raiseException({
        engagementId,
        taxonomy: 'duplicate_document',
        sampleItemId,
        evidenceId: item.invoiceEvidenceId ?? null,
        description: `Facture ${invoiceNo} présentée à l'appui de ${itemIds.length} écritures distinctes — double comptabilisation probable.`,
        amountImpactCents: Math.abs(item.gl.creditCents - item.gl.debitCents),
        severity: 'high',
      });
      if (id) {
        exceptions++;
        await q(`update sample_item set status = 'exception' where id = $1`, [sampleItemId]);
      }
    }
  }

  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'matching_completed', objectType: 'sample',
    payload: { engineRun: run.id, matched, exceptions, pending, requestedBy: userId },
  });
  return { matched, exceptions, pending };
}

function estimateImpact(code: string, failed: CheckResult[], bookedCents: number | null): number | null {
  const num = (v: string | undefined) => {
    const m = /(-?[\d]+(?:[.,]\d+)?)\s*$/.exec((v ?? '').trim());
    return m ? Number(m[1].replace(',', '.')) : null;
  };

  const price = failed.find((f) => f.check === 'price' || f.check === 'amount');
  if (price) {
    const expected = num(price.expected);
    const found = num(price.found);
    if (expected !== null && found !== null) return Math.abs(Math.round((found - expected) * 100));
  }

  // a quantity shortfall is worth the units not delivered, at the price they were billed
  const qty = failed.find((f) => f.check === 'qty');
  if (qty && bookedCents) {
    const billed = num(qty.expected);
    const delivered = num(qty.found);
    if (billed !== null && delivered !== null && billed > 0 && billed !== delivered) {
      return Math.abs(Math.round((bookedCents / billed) * (billed - delivered)));
    }
  }

  // whole-entry misstatements: the amount booked is the amount at risk
  if (bookedCents && (code === 'cutoff' || code === 'duplicate_document' || code === 'manual_journal_flag')) {
    return bookedCents;
  }
  return null;
}

async function upsertMatch(sampleItemId: string, status: string, checks: CheckResult[], engineRunId: string): Promise<string> {
  const existing = await q01<{ id: string }>(`select id from match where sample_item_id = $1`, [sampleItemId]);
  if (existing) {
    await q(`update match set status = $2, checks = $3, engine_run_id = $4, computed_at = now() where id = $1`, [existing.id, status, JSON.stringify(checks), engineRunId]);
    return existing.id;
  }
  const row = await q1<{ id: string }>(
    `insert into match (sample_item_id, status, checks, engine_run_id) values ($1,$2,$3,$4) returning id`,
    [sampleItemId, status, JSON.stringify(checks), engineRunId],
  );
  return row.id;
}

// ---------- exception lifecycle ----------

export async function listExceptions(engagementId: string) {
  return q<{
    id: string; taxonomy_code: string; kind: string; severity: string; status: string;
    description: string; amount_impact: string | null; created_at: string;
    sample_item_id: string | null; piece_ref: string | null; aux_label: string | null; resolution: string | null;
  }>(
    `select x.id, x.taxonomy_code, x.kind, x.severity, x.status, x.description,
            x.amount_impact::text, x.created_at::text, x.sample_item_id, g.piece_ref, g.aux_label, x.resolution
     from exception x
     left join sample_item si on si.id = x.sample_item_id
     left join gl_entry g on g.id = si.unit_id
     where x.engagement_id = $1
     order by case x.status when 'open' then 0 when 'clarification_requested' then 1 else 2 end, x.created_at`,
    [engagementId],
  );
}

const CLARIFICATION_TEMPLATES: Record<string, string> = {
  duplicate_document: "La facture {piece} apparaît à l'appui de plusieurs écritures comptables. Merci de confirmer s'il s'agit d'une double comptabilisation et, le cas échéant, de nous transmettre l'écriture de correction.",
  missing_document: 'Le justificatif demandé ({piece}) n’a pas pu être fourni. Merci d’indiquer la raison et de transmettre tout élément probant alternatif (bon de livraison, preuve d’expédition, accusé de réception).',
  price_mismatch: 'Nous relevons un écart entre le prix unitaire appliqué et le montant facturé sur la pièce {piece}. Merci d’expliquer cet écart et d’indiquer si un avoir sera émis.',
  qty_mismatch: 'La quantité facturée diffère de la quantité figurant sur le bon de livraison pour la pièce {piece}. Merci d’expliquer cet écart.',
  cutoff: 'La facture {piece} est datée de l’exercice suivant mais comptabilisée sur l’exercice audité. Merci de justifier le rattachement du produit à l’exercice.',
  manual_journal_flag: 'Merci d’expliquer la nature et la justification de l’écriture manuelle {piece} (pièce à l’appui le cas échéant).',
  credit_note_pattern: 'Nous relevons plusieurs avoirs émis au bénéfice du même client sur l’exercice. Merci d’en expliquer la cause (litiges, erreurs de facturation, remises).',
  amount_mismatch: 'Le montant de la pièce {piece} ne correspond pas au montant comptabilisé. Merci d’expliquer cet écart.',
  counterparty_mismatch: 'Le tiers figurant sur la pièce {piece} diffère du tiers comptabilisé. Merci de clarifier.',
  date_mismatch: 'La date de la pièce {piece} s’écarte de la date de comptabilisation au-delà de la tolérance. Merci de clarifier.',
};

/** Draft ONE clarification request from the open exceptions (L2 — approve to send). */
export async function draftClarificationRequest(engagementId: string, userId: string): Promise<string> {
  const ctx = await engagementCtx(engagementId);
  const fs = await frameworkSet(engagementId);
  const open = await q<{ id: string; taxonomy_code: string; description: string; sample_item_id: string | null; piece_ref: string | null }>(
    `select x.id, x.taxonomy_code, x.description, x.sample_item_id, g.piece_ref
     from exception x
     left join sample_item si on si.id = x.sample_item_id
     left join gl_entry g on g.id = si.unit_id
     where x.engagement_id = $1 and x.status = 'open' and x.kind = 'substantive'
       and x.taxonomy_code <> 'quarantined_evidence'`,
    [engagementId],
  );
  if (open.length === 0) throw new Error('no open exceptions to clarify');
  const seqRow = await q1<{ n: string }>(`select coalesce(max(seq_no),0) n from request where engagement_id = $1`, [engagementId]);
  const request = await q1<{ id: string }>(
    `insert into request (engagement_id, seq_no, title, language, status)
     values ($1,$2,$3,$4,'draft') returning id`,
    [engagementId, Number(seqRow.n) + 1, fs.language === 'fr' ? 'Demandes de clarification — anomalies relevées' : 'Clarification requests — exceptions noted', fs.language],
  );
  const run = await q1<{ id: string }>(
    `insert into engine_run (tenant_id, engagement_id, engine, engine_version, pack_id, config_hash, params, finished_at)
     values ($1,$2,'workpaper_draft','v1',$3,'-',$4, now()) returning id`,
    [ctx.tenant_id, engagementId, fs.assurance_packs[0], JSON.stringify({ purpose: 'clarification_templates', count: open.length })],
  );
  for (const x of open) {
    const template = CLARIFICATION_TEMPLATES[x.taxonomy_code] ?? 'Merci d’expliquer l’anomalie suivante : {piece}.';
    const text = template.replace('{piece}', x.piece_ref ?? '—');
    await q(
      `insert into request_item (request_id, kind, description, sample_item_id, exception_id)
       values ($1,'explanation',$2,$3,$4)`,
      [request.id, text, x.sample_item_id, x.id],
    );
    await q(
      `insert into followup (exception_id, request_id, approved_by, status) values ($1,$2,null,'draft')`,
      [x.id, request.id],
    );
    await q(`update exception set status = 'clarification_requested' where id = $1`, [x.id]);
  }
  await logEvent({
    tenantId: ctx.tenant_id, engagementId, actorKind: 'system', actorId: null,
    verb: 'clarification_drafted', objectType: 'request', objectId: request.id,
    payload: { exceptions: open.length, engineRun: run.id, requestedBy: userId },
  });
  return request.id;
}

/** What a resolution must carry to be probative (migration 0009, NEP 500).
 *  An interview is not audit evidence: the client's words are recorded verbatim, and the
 *  thing that corroborates them is LINKED, not described. */
/**
 * CE QUI FAIT CIRCULER UNE CONSTATATION.
 *
 * Une résolution d'écart peut porter un FAIT qui dépasse l'élément testé :
 * « la facture était juste, mais le contrôle d'autorisation a été contourné ».
 * Sans ce chemin, la constatation restait dans une case d'exception et
 * n'atteignait jamais l'évaluation du risque des autres sections — et c'est la
 * thèse du produit qui tombait. `raiseFactor` existait ; RIEN NE L'APPELAIT.
 *
 * Le facteur arrive PROPOSÉ, comme tous les autres : un moteur qui lève n'a pas
 * décidé.
 */
export interface FactSurvenu {
  nature: string;
  description: string;
  targets: { fsli: string; assertions: string[] }[];
}

export interface ResolutionInput {
  /** The explanation received, in the client's own words. */
  explanation: string;
  /** The auditor's conclusion on that explanation. */
  conclusion: string;
  /** What happened to the money. Anything else must be escalated to a misstatement. */
  disposition: 'corrected' | 'no_misstatement' | 'compensated' | 'already_accumulated';
  /** At least one of the two: the document, or the accounting entry, that corroborates. */
  corroboration: { evidenceId?: string; glEntryId?: string };
  /**
   * Le FAIT qui dépasse l'élément testé, s'il y en a un.
   *
   * « La facture était juste, mais le contrôle d'autorisation a été
   * contourné » : cette constatation vaut pour d'AUTRES sections, et sans ce
   * chemin elle restait enfermée dans une case d'exception. Le facteur part
   * PROPOSÉ au registre — un moteur qui lève n'a pas décidé.
   */
  factRaised?: FactSurvenu;
}

export async function resolveException(exceptionId: string, userId: string, input: ResolutionInput): Promise<void> {
  const x = await q1<{ engagement_id: string; amount_impact: string | null; taxonomy_code: string }>(
    `select engagement_id, amount_impact::text, taxonomy_code from exception where id = $1`,
    [exceptionId],
  );
  if (!input.explanation?.trim()) throw new Error('the explanation received is required — record it verbatim, not as a summary');
  if (!input.conclusion?.trim()) throw new Error('an audit conclusion on the explanation is required');
  const evidenceId = input.corroboration?.evidenceId ?? null;
  const glEntryId = input.corroboration?.glEntryId ?? null;
  if (!evidenceId && !glEntryId) {
    throw new Error(
      `exception ${x.taxonomy_code} cannot be resolved on an explanation alone: link the corroborating evidence or accounting entry (NEP 500)`,
    );
  }
  if (evidenceId) {
    const ev = await q01<{ id: string; quarantined: boolean }>(`select id, quarantined from evidence where id = $1 and engagement_id = $2`, [evidenceId, x.engagement_id]);
    if (!ev) throw new Error('corroborating evidence not found on this engagement');
    if (ev.quarantined) throw new Error('quarantined evidence cannot corroborate a resolution');
  }
  if (glEntryId) {
    const gl = await q01<{ id: string }>(`select id from gl_entry where id = $1 and engagement_id = $2`, [glEntryId, x.engagement_id]);
    if (!gl) throw new Error('corroborating ledger entry not found on this engagement');
  }
  const ctx = await engagementCtx(x.engagement_id);
  await q(
    `update exception set status = 'resolved', resolution = $2, client_explanation = $3,
            disposition = $4, corroboration_evidence_id = $5, corroboration_gl_entry_id = $6,
            resolved_by = $7, resolved_at = now()
     where id = $1`,
    [exceptionId, input.conclusion, input.explanation, input.disposition, evidenceId, glEntryId, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: x.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'exception_resolved', objectType: 'exception', objectId: exceptionId,
    payload: {
      disposition: input.disposition,
      amount_impact: x.amount_impact,
      corroboration_evidence_id: evidenceId,
      corroboration_gl_entry_id: glEntryId,
      explanation: input.explanation.slice(0, 500),
      conclusion: input.conclusion.slice(0, 500),
    },
  });

  /* LA CONSTATATION CIRCULE. C'est ici que `raiseFactor` est appelé — il
     existait depuis la tranche 5b et RIEN NE L'APPELAIT, ce qui laissait le
     registre alimenté par le seul questionnaire. Une constatation faite dans
     une procédure ne se posait donc nulle part ailleurs, et « la constatation
     circule » restait une phrase.
     Le facteur part PROPOSÉ, avec l'écart pour source : un moteur qui lève n'a
     pas décidé. */
  if (input.factRaised) {
    const { raiseFactor } = await import('./questionnaire');
    await raiseFactor({
      engagementId: x.engagement_id,
      source: 'procedure',
      sourceRef: exceptionId,
      nature: input.factRaised.nature,
      description: input.factRaised.description,
      targets: input.factRaised.targets,
      actorUserId: userId,
    });
  }
}

/** The third terminal state (migration 0009). Not a resolution: nothing corroborates it,
 *  and it says so. Used when the evidence cannot be obtained at all — the delivery note
 *  that was never archived, the ledger that is not yet final. It carries the amount at
 *  risk and what was attempted instead, and it follows through to the conclusion. */
export async function recordScopeLimitation(
  exceptionId: string,
  userId: string,
  input: { explanation: string; alternativeProcedures: string; amountAtRiskCents?: number | null },
): Promise<void> {
  if (!input.explanation?.trim()) throw new Error('record why the evidence could not be obtained, in the client’s words');
  if (!input.alternativeProcedures?.trim()) {
    throw new Error('record the alternative procedures performed (or state explicitly that none was possible)');
  }
  const x = await q1<{ engagement_id: string; amount_impact: string | null }>(
    `select engagement_id, amount_impact::text from exception where id = $1`,
    [exceptionId],
  );
  const ctx = await engagementCtx(x.engagement_id);
  await q(
    `update exception set status = 'scope_limitation', client_explanation = $2,
            alternative_procedures = $3, resolution = $3,
            amount_impact = coalesce($4, amount_impact),
            resolved_by = $5, resolved_at = now()
     where id = $1`,
    [
      exceptionId, input.explanation, input.alternativeProcedures,
      input.amountAtRiskCents !== undefined && input.amountAtRiskCents !== null ? centsToNum(input.amountAtRiskCents) : null,
      userId,
    ],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: x.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'exception_scope_limitation', objectType: 'exception', objectId: exceptionId,
    payload: {
      explanation: input.explanation.slice(0, 500),
      alternative_procedures: input.alternativeProcedures.slice(0, 500),
      amount_at_risk: input.amountAtRiskCents ?? x.amount_impact,
    },
  });
}

/** Every limitation on the file, for the conclusion and the workpaper. */
export async function scopeLimitations(engagementId: string) {
  return q<{ id: string; taxonomy_code: string; description: string; amount_impact: string | null; client_explanation: string; alternative_procedures: string }>(
    `select id, taxonomy_code, description, amount_impact::text, client_explanation, alternative_procedures
     from exception where engagement_id = $1 and status = 'scope_limitation' order by created_at`,
    [engagementId],
  );
}

export async function escalateToMisstatement(
  exceptionId: string,
  userId: string,
  opts: { kind: 'factual' | 'judgmental' | 'projected'; amountCents: number; corrected: boolean; notes?: string },
): Promise<string> {
  const x = await q1<{ engagement_id: string; description: string }>(`select engagement_id, description from exception where id = $1`, [exceptionId]);
  const ctx = await engagementCtx(x.engagement_id);
  const m = await q1<{ id: string }>(
    `insert into misstatement (engagement_id, exception_id, kind, amount, corrected, status, notes)
     values ($1,$2,$3,$4,$5,'proposed',$6) returning id`,
    [x.engagement_id, exceptionId, opts.kind, centsToNum(opts.amountCents), opts.corrected, opts.notes ?? null],
  );
  await q(`update exception set status = 'escalated', resolved_by = $2, resolved_at = now() where id = $1`, [exceptionId, userId]);
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: x.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'exception_escalated', objectType: 'misstatement', objectId: m.id,
    payload: { exceptionId, kind: opts.kind, amount: centsToNum(opts.amountCents), corrected: opts.corrected },
  });
  return m.id;
}

export async function matchesForSample(engagementId: string) {
  return q<{ sample_item_id: string; status: string; checks: CheckResult[]; piece_ref: string | null; aux_label: string | null; amount: string; selection_reason: string }>(
    `select m.sample_item_id, m.status, m.checks, g.piece_ref, g.aux_label, si.amount::text, si.selection_reason
     from match m
     join sample_item si on si.id = m.sample_item_id
     join sample s on s.id = si.sample_id
     join gl_entry g on g.id = si.unit_id
     where s.engagement_id = $1 and s.status = 'drawn'
     order by si.selection_reason, si.amount desc`,
    [engagementId],
  );
}
