import { CATALOG, getTemplate, type ParamSpec, type QueryTemplate } from './catalog';

// ADR-017 — a plan is ONLY {templateId, params}. No SQL ever crosses this boundary, so a
// model (or a URL) can never widen what is executed: an unknown id, an unknown param name
// or an out-of-domain value is a refusal, not a query.

export interface QueryPlan {
  templateId: string;
  params: Record<string, string | number>;
}

export type PlanSource = 'rules' | 'llm' | 'explicit';

export interface ValidPlan {
  template: QueryTemplate;
  /** Params after defaulting + type coercion, in the template's declared order. */
  params: { spec: ParamSpec; value: string | number }[];
}

export type Validation = { ok: true; plan: ValidPlan } | { ok: false; reason: string };

/** Lowercase + strip diacritics; the rules planner and the catalogue matcher share it. */
export function foldText(s: string): string {
  return ` ${s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export function validatePlan(raw: unknown): Validation {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'plan_not_an_object' };
  const p = raw as Partial<QueryPlan>;
  if (typeof p.templateId !== 'string') return { ok: false, reason: 'plan_without_template_id' };
  const template = getTemplate(p.templateId);
  if (!template) return { ok: false, reason: `unknown_template:${p.templateId.slice(0, 60)}` };

  const given: Record<string, unknown> = p.params && typeof p.params === 'object' ? (p.params as Record<string, unknown>) : {};
  for (const name of Object.keys(given)) {
    if (!template.params.some((s) => s.name === name)) return { ok: false, reason: `unknown_param:${name.slice(0, 40)}` };
  }

  const params: { spec: ParamSpec; value: string | number }[] = [];
  for (const spec of template.params) {
    const rawValue = given[spec.name] ?? spec.default;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return { ok: false, reason: `missing_param:${spec.name}` };
    }
    const coerced = coerce(spec, rawValue);
    if (coerced === null) return { ok: false, reason: `invalid_param:${spec.name}` };
    params.push({ spec, value: coerced });
  }
  return { ok: true, plan: { template, params } };
}

function coerce(spec: ParamSpec, value: unknown): string | number | null {
  switch (spec.type) {
    case 'int': {
      // strict: a string param must BE an integer — never scrubbed into one, so
      // "; drop" cannot become 0 and slip through the range check
      if (typeof value === 'string' && !/^\s*-?\d+\s*$/.test(value)) return null;
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
      if (n < (spec.min ?? 0) || n > (spec.max ?? 1_000_000)) return null;
      return n;
    }
    case 'money_eur': {
      if (typeof value === 'string' && !/^\s*\d+(?:[.,]\d{1,2})?\s*$/.test(value)) return null;
      const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) return null;
      return n.toFixed(2);
    }
    case 'enum':
    case 'threshold_ref': {
      const s = String(value);
      if (!(spec.options ?? []).includes(s)) return null;
      return s;
    }
    default:
      return null;
  }
}

/** What the UI (and a refusal message) offers instead: the catalogue, in the user's language. */
export function catalogueOffer(lang: 'fr' | 'en') {
  return CATALOG.map((t) => ({ id: t.id, label: t.label[lang], example: t.examples[lang] }));
}
