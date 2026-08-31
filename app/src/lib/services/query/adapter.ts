import { CATALOG } from './catalog';
import { demoPublique } from '@/lib/core/demo-public';
import { costUsd } from '@/lib/core/pricing';

// ADR-017 step 2 — the ONLY thing a model is allowed to produce: an id from the closed
// catalogue plus typed params. The tool schema below enumerates the ids, so a free-text
// answer is not even representable. `none` is the model's refusal channel.

export interface PlannerReply {
  /** Raw candidate plan — always re-validated by validatePlan before anything runs. */
  plan: unknown | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  raw: string;
}

export interface QueryPlannerAdapter {
  readonly name: string;
  plan(question: string, lang: 'fr' | 'en'): Promise<PlannerReply>;
}

/** Offline default: no network, no guess — the rules planner alone decides (D12). */
export class DisabledQueryPlanner implements QueryPlannerAdapter {
  readonly name = 'disabled';
  async plan(): Promise<PlannerReply> {
    return { plan: null, model: 'none', tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0, raw: 'planner_disabled' };
  }
}

export function catalogueDigest(lang: 'fr' | 'en'): string {
  return CATALOG.map((t) => {
    const params = t.params.length
      ? ' params: ' + t.params.map((p) => `${p.name}:${p.type}${p.options ? `(${p.options.join('|')})` : ''}`).join(', ')
      : ' params: none';
    return `- ${t.id} — ${t.label[lang]}. e.g. "${t.examples[lang]}".${params}`;
  }).join('\n');
}

const SYSTEM = [
  'You translate an auditor question into ONE entry of a closed query catalogue.',
  'You never answer the question, never write prose, never produce SQL, never invent an id.',
  'If no catalogue entry answers the question exactly, return templateId "none".',
  'Prefer "none" over an approximate match: a wrong query is worse than a refusal.',
].join(' ');

/** Live planner (Anthropic Messages API, forced tool use). Enabled by
 *  OTTO_QUERY_PLANNER=anthropic + ANTHROPIC_API_KEY; refuses to run without both. */
export class AnthropicQueryPlanner implements QueryPlannerAdapter {
  readonly name = 'anthropic';
  constructor(
    private readonly model = process.env.OTTO_QUERY_MODEL ?? 'claude-opus-5',
    private readonly apiKey = process.env.ANTHROPIC_API_KEY ?? '',
    private readonly baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  ) {}

  async plan(question: string, lang: 'fr' | 'en'): Promise<PlannerReply> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY is not set — the live query planner cannot run (DEPLOY.md)');
    const started = Date.now();
    const tool = {
      name: 'select_query',
      description: 'Select the catalogue query that answers the question, or "none".',
      input_schema: {
        type: 'object',
        properties: {
          templateId: { type: 'string', enum: [...CATALOG.map((t) => t.id), 'none'] },
          params: { type: 'object', additionalProperties: { type: ['string', 'number'] } },
        },
        required: ['templateId'],
      },
    };
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        system: `${SYSTEM}\n\nCATALOGUE:\n${catalogueDigest(lang)}`,
        tool_choice: { type: 'tool', name: 'select_query' },
        tools: [tool],
        messages: [{ role: 'user', content: question }],
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`query planner HTTP ${res.status}: ${body.slice(0, 300)}`);
    const json = JSON.parse(body) as {
      content: { type: string; name?: string; input?: unknown }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const call = json.content.find((c) => c.type === 'tool_use' && c.name === 'select_query');
    const input = (call?.input ?? null) as { templateId?: string } | null;
    const tokensIn = json.usage?.input_tokens ?? 0;
    const tokensOut = json.usage?.output_tokens ?? 0;
    return {
      plan: input && input.templateId !== 'none' ? input : null,
      model: this.model,
      tokensIn,
      tokensOut,
      costUsd: costUsd(this.model, tokensIn, tokensOut),
      latencyMs: Date.now() - started,
      raw: body.slice(0, 2000),
    };
  }
}

export function getQueryPlanner(): QueryPlannerAdapter {
  if (demoPublique()) return new DisabledQueryPlanner();   // URL publique : jamais d'appel payant (ADR-109)
  return (process.env.OTTO_QUERY_PLANNER ?? 'disabled') === 'anthropic'
    ? new AnthropicQueryPlanner()
    : new DisabledQueryPlanner();
}
