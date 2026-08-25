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
        const amountImpact = code === 'price_mismatch' || code === 'amount_mismatch'
          ? failed.filter((f) => f.check === 'price' || f.check === 'amount').length > 0 ? estimateImpact(failed) : null
          : null;
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

function estimateImpact(failed: CheckResult[]): number | null {
  const price = failed.find((f) => f.check === 'price');
  if (price) {
    const expected = /=\s*([\d.]+)$/.exec(price.expected)?.[1];
    const found = /([\d.]+)$/.exec(price.found)?.[1];
    if (expected && found) return Math.abs(Math.round((Number(found) - Number(expected)) * 100));
  }
  const amount = failed.find((f) => f.check === 'amount');
  if (amount) {
    return Math.abs(Math.round((Number(amount.found) - Number(amount.expected)) * 100)) || null;
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

export async function resolveException(exceptionId: string, userId: string, resolution: string): Promise<void> {
  if (!resolution.trim()) throw new Error('resolution text required');
  const x = await q1<{ engagement_id: string }>(`select engagement_id from exception where id = $1`, [exceptionId]);
  const ctx = await engagementCtx(x.engagement_id);
  await q(
    `update exception set status = 'resolved', resolution = $2, resolved_by = $3, resolved_at = now() where id = $1`,
    [exceptionId, resolution, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: x.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'exception_resolved', objectType: 'exception', objectId: exceptionId, payload: { resolution },
  });
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
