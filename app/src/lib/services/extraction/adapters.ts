import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';
import { sha256 } from '@/lib/core/hash';
import { costUsd } from '@/lib/core/pricing';
import type { ExtractedField } from './fields';

// Rungs 3–4 — pluggable OCR/LLM adapters (docs/05 §4, ADR-009). The interface is real;
// the demo/tests run the record/replay adapter with ZERO network (Q1). Live adapters
// (Mistral OCR 3, Anthropic structured extraction) are configuration:
// OTTO_OCR_ADAPTER=mistral + keys in the deployment environment (DEPLOY.md).
// Every call is recorded as an ai_run by the ladder (CLAUDE.md rule 3).

export interface OcrResult {
  fields: ExtractedField[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface OcrAdapter {
  readonly name: string;
  extract(bytes: Uint8Array, docTypeHint: string | null): Promise<OcrResult | null>;
}

/** Record/replay adapter: replays the recorded extraction for a known document
 *  (matched by sha256 via the dataset evidence index). Unknown documents return null —
 *  the ladder then queues the item for fully-human extraction (rung 5). */
export class ReplayOcrAdapter implements OcrAdapter {
  readonly name = 'mock';
  private bySha: Map<string, ExtractedField[]> | null = null;

  private load(): Map<string, ExtractedField[]> {
    if (this.bySha) return this.bySha;
    const map = new Map<string, ExtractedField[]>();
    try {
      const dsDir = path.join(repoRoot(), 'dataset');
      const index = JSON.parse(fs.readFileSync(path.join(dsDir, 'fixtures', 'evidence_index.json'), 'utf8')) as { filename: string; sha256: string }[];
      const fixtures = JSON.parse(fs.readFileSync(path.join(dsDir, 'fixtures', 'extractions.json'), 'utf8')) as { filename: string; fields: ExtractedField[] }[];
      const byFile = new Map(fixtures.map((f) => [f.filename, f.fields]));
      for (const e of index) {
        const fields = byFile.get(e.filename);
        if (fields) map.set(e.sha256, fields);
      }
    } catch {
      // no dataset fixtures available — adapter degrades to "unknown document"
    }
    this.bySha = map;
    return map;
  }

  async extract(bytes: Uint8Array): Promise<OcrResult | null> {
    const fields = this.load().get(sha256(bytes));
    if (!fields) return null;
    return { fields, model: 'replay-fixture', tokensIn: 0, tokensOut: 0, costUsd: 0 };
  }
}

const FIELD_SPEC: { name: string; type: 'string' | 'integer'; note: string }[] = [
  { name: 'invoiceNumber', type: 'string', note: 'document number exactly as printed' },
  { name: 'invoiceDate', type: 'string', note: 'ISO yyyy-mm-dd; convert from the printed format' },
  { name: 'buyerName', type: 'string', note: 'the customer / recipient' },
  { name: 'sellerName', type: 'string', note: 'the issuer, usually the header line' },
  { name: 'totalNetCents', type: 'integer', note: 'net amount in cents, no separators' },
  { name: 'vatCents', type: 'integer', note: 'VAT amount in cents' },
  { name: 'totalGrossCents', type: 'integer', note: 'gross amount in cents' },
  { name: 'deliveryNoteNumber', type: 'string', note: 'delivery notes only' },
  { name: 'deliveryDate', type: 'string', note: 'delivery notes only, ISO' },
  { name: 'qtyTotal', type: 'integer', note: 'delivery notes only, total quantity' },
];

/** Rung 4 — structured extraction from the document itself (Anthropic Messages API,
 *  native PDF input, forced tool use so the model returns fields and never prose).
 *  Output is ALWAYS pending_verify upstream (ADR-012): this adapter cannot self-approve.
 *  Enabled by OTTO_OCR_ADAPTER=anthropic + ANTHROPIC_API_KEY (DEPLOY.md). */
export class AnthropicDocAdapter implements OcrAdapter {
  readonly name = 'anthropic';
  constructor(
    private readonly model = process.env.OTTO_EXTRACT_MODEL ?? 'claude-sonnet-4-5',
    private readonly apiKey = process.env.ANTHROPIC_API_KEY ?? '',
    private readonly baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  ) {}

  async extract(bytes: Uint8Array, docTypeHint: string | null): Promise<OcrResult | null> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set — the live extraction adapter cannot run (DEPLOY.md)');
    }
    const properties: Record<string, unknown> = {};
    for (const f of FIELD_SPEC) {
      properties[f.name] = { type: [f.type, 'null'], description: f.note };
    }
    properties.confidence = {
      type: 'object',
      description: 'per-field self-assessed confidence 0..1; triage only, never an approval',
      additionalProperties: { type: 'number' },
    };
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system:
          'You transcribe accounting documents. Report only what is legible on the page. ' +
          'Never infer, never compute a missing total, never guess a date format: return null ' +
          'for anything you cannot read. A wrong figure is far worse than a null.',
        tools: [{ name: 'emit_fields', description: 'Return the fields read from the document.', input_schema: { type: 'object', properties } }],
        tool_choice: { type: 'tool', name: 'emit_fields' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } },
              { type: 'text', text: `Document type hint: ${docTypeHint ?? 'unknown'}. Read the fields.` },
            ],
          },
        ],
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`anthropic extraction HTTP ${res.status}: ${body.slice(0, 300)}`);
    const json = JSON.parse(body) as {
      content: { type: string; name?: string; input?: Record<string, unknown> }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const call = json.content.find((c) => c.type === 'tool_use' && c.name === 'emit_fields');
    if (!call?.input) return null;
    const conf = (call.input.confidence ?? {}) as Record<string, number>;
    const fields: ExtractedField[] = [];
    for (const f of FIELD_SPEC) {
      const v = call.input[f.name];
      if (v === null || v === undefined || v === '') continue;
      fields.push({ name: f.name, value: String(v), confidence: clamp(conf[f.name]), page: 1 });
    }
    if (fields.length === 0) return null;
    const tokensIn = json.usage?.input_tokens ?? 0;
    const tokensOut = json.usage?.output_tokens ?? 0;
    return { fields, model: this.model, tokensIn, tokensOut, costUsd: costUsd(this.model, tokensIn, tokensOut) };
  }
}

function clamp(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

/** Live-adapter placeholder: refuses to run without explicit configuration so the demo
 *  can never silently call out (D12 cost discipline). */
export class UnconfiguredLiveAdapter implements OcrAdapter {
  constructor(readonly name: string) {}
  async extract(): Promise<OcrResult | null> {
    throw new Error(
      `${this.name} adapter is not configured in this environment — set the API key and OTTO_OCR_ADAPTER per DEPLOY.md`,
    );
  }
}

export function getOcrAdapter(): OcrAdapter {
  const which = process.env.OTTO_OCR_ADAPTER ?? 'mock';
  if (which === 'mock') return new ReplayOcrAdapter();
  if (which === 'anthropic') return new AnthropicDocAdapter();
  // No adapter is written for a provider we cannot execute and verify here (e.g. a
  // dedicated OCR vendor): it stays a deployment task rather than unrun speculative code.
  return new UnconfiguredLiveAdapter(which);
}
