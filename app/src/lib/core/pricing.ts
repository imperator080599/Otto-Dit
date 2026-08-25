// Token pricing used to meter ai_run.cost_usd (COST.md). Rates are CONFIGURATION, not
// facts frozen in code: they are read from the environment when set, and the defaults
// below are placeholders that must be checked against the vendor price list before any
// COST.md figure is quoted as measured. USD per million tokens.

export interface Rate { inPerMTok: number; outPerMTok: number }

const DEFAULTS: Record<string, Rate> = {
  // populated from the deployment environment; see DEPLOY.md
};

export function rateFor(model: string): Rate {
  const envIn = process.env.OTTO_PRICE_IN_PER_MTOK;
  const envOut = process.env.OTTO_PRICE_OUT_PER_MTOK;
  if (envIn && envOut) return { inPerMTok: Number(envIn), outPerMTok: Number(envOut) };
  return DEFAULTS[model] ?? { inPerMTok: 0, outPerMTok: 0 };
}

/** Cost in USD; returns 0 when no rate is configured — never a guessed number. */
export function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  const r = rateFor(model);
  return (tokensIn / 1_000_000) * r.inPerMTok + (tokensOut / 1_000_000) * r.outPerMTok;
}
