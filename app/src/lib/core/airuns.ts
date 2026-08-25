import { q, q1 } from '@/lib/db/client';
import { sha256 } from './hash';

// Every LLM/OCR call writes an ai_run row (CLAUDE.md rule 3; docs/06 §6.2).
// Adapters MUST go through recordAiRun — the LlmClient/OcrAdapter implementations refuse
// to return output without an ai_run context.

export interface AiRunInput {
  tenantId: string;
  engagementId?: string | null;
  purpose: 'extraction' | 'classification' | 'drafting' | 'suggestion' | 'ocr';
  adapter: string; // 'anthropic' | 'mistral_ocr' | 'mock' | ...
  model: string;
  promptId: string;
  promptVersion: string;
  input: string;
  output: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  latencyMs?: number;
}

export async function recordAiRun(r: AiRunInput): Promise<string> {
  const row = await q1<{ id: string }>(
    `insert into ai_run (tenant_id, engagement_id, purpose, adapter, model, prompt_id,
       prompt_version, input_hash, output_hash, tokens_in, tokens_out, cost_usd, latency_ms)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [
      r.tenantId,
      r.engagementId ?? null,
      r.purpose,
      r.adapter,
      r.model,
      r.promptId,
      r.promptVersion,
      sha256(r.input),
      sha256(r.output),
      r.tokensIn ?? 0,
      r.tokensOut ?? 0,
      r.costUsd ?? 0,
      r.latencyMs ?? 0,
    ],
  );
  return row.id;
}

/** Aggregate spend for COST.md and the dashboard. */
export async function aiSpend(tenantId: string): Promise<{ runs: number; tokensIn: number; tokensOut: number; costUsd: number }> {
  const [row] = await q<{ runs: string; tokens_in: string; tokens_out: string; cost_usd: string }>(
    `select count(*) runs, coalesce(sum(tokens_in),0) tokens_in,
            coalesce(sum(tokens_out),0) tokens_out, coalesce(sum(cost_usd),0) cost_usd
     from ai_run where tenant_id = $1`,
    [tenantId],
  );
  return {
    runs: Number(row.runs),
    tokensIn: Number(row.tokens_in),
    tokensOut: Number(row.tokens_out),
    costUsd: Number(row.cost_usd),
  };
}
