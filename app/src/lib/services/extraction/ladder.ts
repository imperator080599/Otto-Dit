import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { recordAiRun } from '@/lib/core/airuns';
import { readBlob } from '@/lib/core/storage';
import { engagementCtx } from '../imports';
import { findEmbeddedFacturx, parseCiiXml } from './facturx-read';
import { classify, parseByType, pdfText, type DocType } from './textlayer';
import { getOcrAdapter, type OcrAdapter } from './adapters';
import { gardeBudget } from './budget';
import type { ExtractedField } from './fields';

// The extraction ladder (ADR-002/ADR-012): XML → text layer → OCR/LLM → human.
// Rungs 1–2 are deterministic (L0/L1, complete immediately, spot-check control covers
// them). Rungs 3–4 ALWAYS queue for item verification (pending_verify) — confidence
// orders the queue, never bypasses it.

export interface ExtractionOutcome {
  extractionId: string;
  rung: 'xml' | 'text_layer' | 'ocr' | 'human';
  status: 'complete' | 'pending_verify' | 'failed';
  docType: DocType;
  fieldCount: number;
}

/** Pure ladder over bytes — no database. The DB path (extractEvidence) and the eval
 *  harness (ADR-018) MUST share this function, so a measured number always describes the
 *  code the app actually runs. Adapter errors propagate: the caller decides whether a
 *  failure is fatal (app) or a counted failure (eval). */
export interface LadderResult {
  rung: 'xml' | 'text_layer' | 'ocr' | 'human';
  status: 'complete' | 'pending_verify';
  docType: DocType;
  classConfidence: number;
  fields: ExtractedField[];
  ai: { adapter: string; model: string; tokensIn: number; tokensOut: number; costUsd: number } | null;
  latencyMs: number;
}

export async function runLadder(
  bytes: Uint8Array,
  filename: string,
  adapter: OcrAdapter = getOcrAdapter(),
): Promise<LadderResult> {
  const t0 = Date.now();
  let text = '';
  try {
    text = await pdfText(bytes);
  } catch {
    text = '';
  }
  const cls = classify(text, filename);
  const base = { docType: cls.docType, classConfidence: cls.confidence };

  // rung 1: embedded Factur-X XML
  const xml = findEmbeddedFacturx(bytes);
  if (xml) {
    const fields = parseCiiXml(xml);
    if (fields.length >= 4) {
      return { ...base, rung: 'xml', status: 'complete', fields, ai: null, latencyMs: Date.now() - t0 };
    }
  }

  // rung 2: text layer + deterministic parser
  if (text) {
    const fields = parseByType(cls.docType, text);
    if (fields && fields.length >= 3) {
      return { ...base, rung: 'text_layer', status: 'complete', fields, ai: null, latencyMs: Date.now() - t0 };
    }
  }

  // rung 3: OCR/LLM adapter — ALWAYS pending_verify (ADR-012)
  const started = Date.now();
  const result = await adapter.extract(bytes, cls.docType);
  if (result) {
    return {
      ...base,
      rung: 'ocr',
      status: 'pending_verify',
      fields: result.fields,
      ai: {
        adapter: adapter.name,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      },
      latencyMs: Date.now() - started,
    };
  }

  // rung 5: fully human
  return { ...base, rung: 'human', status: 'pending_verify', fields: [], ai: null, latencyMs: Date.now() - t0 };
}

export async function extractEvidence(evidenceId: string, userId: string | null): Promise<ExtractionOutcome> {
  const ev = await q1<{ id: string; engagement_id: string; filename: string; storage_path: string; doc_type: string | null }>(
    `select id, engagement_id, filename, storage_path, doc_type from evidence where id = $1`,
    [evidenceId],
  );
  const ctx = await engagementCtx(ev.engagement_id);
  const bytes = readBlob(ev.storage_path);

  /* MODE « IA RÉELLE » (ADR-105) : avant qu'une lecture payante puisse partir,
     la garde de budget compare le cumul d'ai_run au plafond et REFUSE au
     seuil — l'arrêt est propre, les lectures déjà faites restent au dossier.
     En rejeu ('mock'), rien ne se dépense et rien n'est gardé. */
  const adapter = getOcrAdapter();
  if (adapter.name !== 'mock') await gardeBudget();
  const res = await runLadder(bytes, ev.filename, adapter);
  await q(`update evidence set doc_type = $2, class_confidence = $3 where id = $1`, [evidenceId, res.docType, res.classConfidence]);

  let aiRunId: string | null = null;
  if (res.ai) {
    aiRunId = await recordAiRun({
      tenantId: ctx.tenant_id,
      engagementId: ev.engagement_id,
      purpose: 'ocr',
      adapter: res.ai.adapter,
      model: res.ai.model,
      promptId: 'ocr-extract',
      promptVersion: 'v1',
      input: ev.storage_path,
      output: JSON.stringify(res.fields),
      tokensIn: res.ai.tokensIn,
      tokensOut: res.ai.tokensOut,
      costUsd: res.ai.costUsd,
      latencyMs: res.latencyMs,
    });
  }
  const id = await insertExtraction(evidenceId, res.rung, res.status, res.fields, aiRunId);
  await logExtract(ctx.tenant_id, ev.engagement_id, evidenceId, res.rung, res.status, userId);
  return { extractionId: id, rung: res.rung, status: res.status, docType: res.docType, fieldCount: res.fields.length };
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
