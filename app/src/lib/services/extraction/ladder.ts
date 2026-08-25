import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { recordAiRun } from '@/lib/core/airuns';
import { readBlob } from '@/lib/core/storage';
import { primaryPack } from '@/lib/packs';
import { engagementCtx } from '../imports';
import { frameworkSet } from '../fsli';
import { findEmbeddedFacturx, parseCiiXml } from './facturx-read';
import { classify, parseByType, pdfText } from './textlayer';
import { getOcrAdapter } from './adapters';
import type { ExtractedField } from './fields';

// The extraction ladder (ADR-002/ADR-012): XML → text layer → OCR/LLM → human.
// Rungs 1–2 are deterministic (L0/L1, complete immediately, spot-check control covers
// them). Rungs 3–4 ALWAYS queue for item verification (pending_verify) — confidence
// orders the queue, never bypasses it.

export interface ExtractionOutcome {
  extractionId: string;
  rung: 'xml' | 'text_layer' | 'ocr' | 'human';
  status: 'complete' | 'pending_verify' | 'failed';
  docType: string;
  fieldCount: number;
}

export async function extractEvidence(evidenceId: string, userId: string | null): Promise<ExtractionOutcome> {
  const ev = await q1<{ id: string; engagement_id: string; filename: string; storage_path: string; doc_type: string | null }>(
    `select id, engagement_id, filename, storage_path, doc_type from evidence where id = $1`,
    [evidenceId],
  );
  const ctx = await engagementCtx(ev.engagement_id);
  const fs = await frameworkSet(ev.engagement_id);
  const pack = primaryPack(fs as never);
  const bytes = readBlob(ev.storage_path);

  // classification (deterministic heuristics, P4)
  let text = '';
  try {
    text = await pdfText(bytes);
  } catch {
    text = '';
  }
  const cls = classify(text, ev.filename);
  await q(`update evidence set doc_type = $2, class_confidence = $3 where id = $1`, [evidenceId, cls.docType, cls.confidence]);

  // rung 1: embedded Factur-X XML
  const xml = findEmbeddedFacturx(bytes);
  if (xml) {
    const fields = parseCiiXml(xml);
    if (fields.length >= 4) {
      const id = await insertExtraction(evidenceId, 'xml', 'complete', fields, null);
      await logExtract(ctx.tenant_id, ev.engagement_id, evidenceId, 'xml', 'complete', userId);
      return { extractionId: id, rung: 'xml', status: 'complete', docType: cls.docType, fieldCount: fields.length };
    }
  }

  // rung 2: text layer + deterministic parser
  if (text) {
    const fields = parseByType(cls.docType, text);
    if (fields && fields.length >= 3) {
      const id = await insertExtraction(evidenceId, 'text_layer', 'complete', fields, null);
      await logExtract(ctx.tenant_id, ev.engagement_id, evidenceId, 'text_layer', 'complete', userId);
      return { extractionId: id, rung: 'text_layer', status: 'complete', docType: cls.docType, fieldCount: fields.length };
    }
  }

  // rung 3: OCR/LLM adapter (record/replay in demo) — ALWAYS pending_verify (ADR-012)
  const adapter = getOcrAdapter();
  const started = Date.now();
  const result = await adapter.extract(bytes, cls.docType);
  if (result) {
    const aiRunId = await recordAiRun({
      tenantId: ctx.tenant_id,
      engagementId: ev.engagement_id,
      purpose: 'ocr',
      adapter: adapter.name,
      model: result.model,
      promptId: 'ocr-extract',
      promptVersion: 'v1',
      input: ev.storage_path,
      output: JSON.stringify(result.fields),
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      latencyMs: Date.now() - started,
    });
    const id = await insertExtraction(evidenceId, 'ocr', 'pending_verify', result.fields, aiRunId);
    await logExtract(ctx.tenant_id, ev.engagement_id, evidenceId, 'ocr', 'pending_verify', userId);
    return { extractionId: id, rung: 'ocr', status: 'pending_verify', docType: cls.docType, fieldCount: result.fields.length };
  }

  // rung 5: fully human — empty pending_verify shell for manual capture
  const id = await insertExtraction(evidenceId, 'human', 'pending_verify', [], null);
  await logExtract(ctx.tenant_id, ev.engagement_id, evidenceId, 'human', 'pending_verify', userId);
  return { extractionId: id, rung: 'human', status: 'pending_verify', docType: cls.docType, fieldCount: 0 };
}

async function insertExtraction(
  evidenceId: string,
  rung: string,
  status: string,
  fields: ExtractedField[],
  aiRunId: string | null,
): Promise<string> {
  const overall = fields.length ? Math.min(...fields.map((f) => f.confidence)) : null;
  const row = await q1<{ id: string }>(
    `insert into extraction (evidence_id, rung, status, ai_run_id, fields, overall_confidence)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [evidenceId, rung, status, aiRunId, JSON.stringify(fields), overall],
  );
  return row.id;
}

async function logExtract(tenantId: string, engagementId: string, evidenceId: string, rung: string, status: string, userId: string | null) {
  await logEvent({
    tenantId,
    engagementId,
    actorKind: rung === 'ocr' ? 'ai' : 'system',
    actorId: null,
    verb: 'extraction_completed',
    objectType: 'evidence',
    objectId: evidenceId,
    payload: { rung, status, requestedBy: userId },
  });
}

/** Run the ladder over all unextracted evidence of an engagement. */
export async function extractAll(engagementId: string, userId: string | null): Promise<{ processed: number; pendingVerify: number }> {
  const rows = await q<{ id: string }>(
    `select e.id from evidence e
     where e.engagement_id = $1 and e.quarantined = false
       and not exists (select 1 from extraction x where x.evidence_id = e.id and x.status in ('complete','verified','pending_verify'))
     order by e.created_at`,
    [engagementId],
  );
  let pendingVerify = 0;
  for (const r of rows) {
    const out = await extractEvidence(r.id, userId);
    if (out.status === 'pending_verify') pendingVerify++;
  }
  return { processed: rows.length, pendingVerify };
}

/** Latest usable extraction per evidence (verified > complete > pending_verify). */
export async function latestExtraction(evidenceId: string) {
  return q01<{ id: string; rung: string; status: string; fields: ExtractedField[]; overall_confidence: number | null; verified_by: string | null }>(
    `select id, rung, status, fields, overall_confidence::float, verified_by from extraction
     where evidence_id = $1
     order by case status when 'verified' then 0 when 'complete' then 1 when 'pending_verify' then 2 else 3 end,
              created_at desc
     limit 1`,
    [evidenceId],
  );
}

export async function pendingVerifications(engagementId: string) {
  return q<{ id: string; evidence_id: string; rung: string; fields: ExtractedField[]; overall_confidence: number | null; filename: string; doc_type: string | null; item_description: string | null }>(
    `select x.id, x.evidence_id, x.rung, x.fields, x.overall_confidence::float, e.filename, e.doc_type,
            i.description item_description
     from extraction x
     join evidence e on e.id = x.evidence_id
     left join request_item i on i.id = e.request_item_id
     where e.engagement_id = $1 and x.status = 'pending_verify'
     order by x.overall_confidence asc nulls first`,
    [engagementId],
  );
}

/** L2 verification act (ADR-012): validator sees evidence + fields side-by-side and
 *  attests, correcting fields where needed. */
export async function verifyExtraction(extractionId: string, userId: string, corrected?: ExtractedField[]): Promise<void> {
  const x = await q1<{ id: string; evidence_id: string; fields: ExtractedField[] }>(
    `select id, evidence_id, fields from extraction where id = $1`,
    [extractionId],
  );
  const ev = await q1<{ engagement_id: string }>(`select engagement_id from evidence where id = $1`, [x.evidence_id]);
  const ctx = await engagementCtx(ev.engagement_id);
  const fields = corrected ?? x.fields;
  await q(
    `update extraction set fields = $2, status = 'verified', verified_by = $3, verified_at = now() where id = $1`,
    [extractionId, JSON.stringify(fields.map((f) => ({ ...f, confidence: 1 }))), userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id,
    engagementId: ev.engagement_id,
    actorKind: 'user',
    actorId: userId,
    verb: 'extraction_verified',
    objectType: 'extraction',
    objectId: extractionId,
    payload: { corrected: corrected !== undefined },
  });
}
