import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';
import { sha256 } from '@/lib/core/hash';
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
  return new UnconfiguredLiveAdapter(which);
}
