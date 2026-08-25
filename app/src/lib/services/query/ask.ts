import { q } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { recordAiRun } from '@/lib/core/airuns';
import { fmtEur } from '@/lib/kernel/canon';
import { numToCents, centsToNum } from '@/lib/util/num';
import { engagementCtx } from '../imports';
import { frameworkSet } from '../fsli';
import { validatedThresholds } from '../materiality';
import { catalogueOffer, validatePlan, type PlanSource, type QueryPlan, type ValidPlan } from './plan';
import { planByRules } from './rules';
import { getQueryPlanner, type QueryPlannerAdapter } from './adapter';

// ADR-017 — « Interroger ». A question becomes a catalogue query or it becomes a refusal.
// There is no third outcome: the answer is ALWAYS a table of stored records with links
// back to the objects, never generated prose. The model (when used at all) picks an id and
// fills typed params; the SQL comes from the reviewed catalogue, never from the model.

export interface AnswerColumn { key: string; label: string; kind?: 'money' | 'date' | 'badge' }
export interface AnswerRow { id: string; cells: Record<string, string>; href: string | null }

export interface AskAnswered {
  status: 'answered';
  templateId: string;
  label: string;
  params: { label: string; value: string }[];
  columns: AnswerColumn[];
  rows: AnswerRow[];
  planner: PlanSource;
  aiRunId: string | null;
}

export interface AskRefused {
  status: 'refused';
  reason: string;
  message: string;
  planner: PlanSource | null;
  aiRunId: string | null;
  offer: { id: string; label: string; example: string }[];
}

export type AskResult = AskAnswered | AskRefused;

const REFUSAL: Record<string, { fr: string; en: string }> = {
  empty_question: {
    fr: 'Aucune question posée.',
    en: 'No question asked.',
  },
  question_too_long: {
    fr: 'Question trop longue — reformulez en une phrase.',
    en: 'Question too long — restate it in one sentence.',
  },
  no_translation: {
    fr: 'Cette question ne se traduit pas en une requête du catalogue. OTTO ne répond pas de mémoire : il n’affiche que des enregistrements du dossier. Reformulez, ou choisissez une requête ci-dessous.',
    en: 'This question does not translate into a catalogue query. OTTO does not answer from memory — it only shows records from the file. Rephrase, or pick a query below.',
  },
  threshold_not_validated: {
    fr: 'Le seuil demandé n’est pas encore validé sur ce dossier — validez le seuil de signification, puis reposez la question.',
    en: 'The requested threshold is not validated on this engagement yet — validate materiality, then ask again.',
  },
};

function refusalMessage(reason: string, lang: 'fr' | 'en'): string {
  const known = REFUSAL[reason];
  if (known) return known[lang];
  if (reason.startsWith('unknown_template') || reason.startsWith('unknown_param') || reason.startsWith('plan_')) {
    return lang === 'fr'
      ? 'La traduction proposée ne correspond à aucune requête autorisée — rien n’a été exécuté.'
      : 'The proposed translation matched no permitted query — nothing was executed.';
  }
  if (reason.startsWith('invalid_param') || reason.startsWith('missing_param')) {
    return lang === 'fr'
      ? 'Le paramètre déduit de la question est hors domaine — précisez-le (par exemple « plus de 10 jours »).'
      : 'The parameter inferred from the question is out of range — state it explicitly (e.g. "more than 10 days").';
  }
  return lang === 'fr' ? 'Question non traduisible.' : 'Question could not be translated.';
}

const THRESHOLD_LABEL: Record<string, { fr: string; en: string }> = {
  materiality: { fr: 'seuil de signification', en: 'materiality' },
  performance_materiality: { fr: 'seuil de planification', en: 'performance materiality' },
  clearly_trivial: { fr: 'seuil de remontée des anomalies', en: 'clearly trivial threshold' },
  tolerable_misstatement: { fr: 'anomalie tolérable', en: 'tolerable misstatement' },
  zero: { fr: 'aucun seuil', en: 'no threshold' },
};

/** Explicit path: the auditor picks a catalogue query from the list (no model at all).
 *  Same validation, same execution, same event — only the planner attribution differs. */
export async function runCatalogue(
  engagementId: string,
  templateId: string,
  params: Record<string, string | number>,
  userId: string,
): Promise<AskResult> {
  const ctx = await engagementCtx(engagementId);
  const lang = (await frameworkSet(engagementId)).language;
  return execute(ctx.tenant_id, engagementId, lang, '', { templateId, params }, userId, 'explicit', null);
}

export async function ask(
  engagementId: string,
  question: string,
  userId: string,
  planner: QueryPlannerAdapter = getQueryPlanner(),
): Promise<AskResult> {
  const ctx = await engagementCtx(engagementId);
  const lang = (await frameworkSet(engagementId)).language;
  const asked = (question ?? '').trim();

  const refuse = (reason: string, src: PlanSource | null, runId: string | null) =>
    logRefusal(ctx.tenant_id, engagementId, lang, asked, reason, src, runId, userId);

  if (!asked) return refuse('empty_question', null, null);
  if (asked.length > 500) return refuse('question_too_long', null, null);

  // step 1 — deterministic (P4: no LLM where a rule suffices)
  let source: PlanSource = 'rules';
  let aiRunId: string | null = null;
  let candidate: QueryPlan | unknown | null = planByRules(asked).plan;

  // step 2 — LLM planner, only if the rules missed and an adapter is configured
  if (!candidate) {
    const reply = await planner.plan(asked, lang);
    if (reply.raw !== 'planner_disabled') {
      aiRunId = await recordAiRun({
        tenantId: ctx.tenant_id,
        engagementId,
        purpose: 'suggestion',
        adapter: planner.name,
        model: reply.model,
        promptId: 'nl-query-plan',
        promptVersion: 'v1',
        input: asked,
        output: JSON.stringify(reply.plan ?? null),
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
        costUsd: reply.costUsd,
        latencyMs: reply.latencyMs,
      });
      source = 'llm';
    }
    candidate = reply.plan;
  }
  if (!candidate) return refuse('no_translation', source, aiRunId);
  return execute(ctx.tenant_id, engagementId, lang, asked, candidate, userId, source, aiRunId);
}

/** Shared spine: validate against the closed catalogue, bind, execute the reviewed SQL,
 *  event-log the outcome. A refusal here is logged exactly like a refusal upstream. */
async function execute(
  tenantId: string,
  engagementId: string,
  lang: 'fr' | 'en',
  asked: string,
  candidate: unknown,
  userId: string,
  source: PlanSource,
  aiRunId: string | null,
): Promise<AskResult> {
  const refuse = (reason: string) => logRefusal(tenantId, engagementId, lang, asked, reason, source, aiRunId, userId);

  const checked = validatePlan(candidate);
  if (!checked.ok) return refuse(checked.reason);

  const bound = await bindParams(engagementId, checked.plan, lang);
  if (!bound.ok) return refuse(bound.reason);

  const template = checked.plan.template;
  const rows = await q<Record<string, unknown>>(template.sql, [engagementId, ...bound.values]);
  const columns: AnswerColumn[] = template.columns.map((c) => ({ key: c.key, label: c.label[lang], kind: c.kind }));

  await logEvent({
    tenantId,
    engagementId,
    actorKind: 'user',
    actorId: userId,
    verb: 'nl_query_executed',
    objectType: 'query',
    objectId: template.id,
    payload: {
      question: asked.slice(0, 500),
      template_id: template.id,
      params: Object.fromEntries(checked.plan.params.map((p) => [p.spec.name, p.value])),
      planner: source,
      ai_run_id: aiRunId,
      row_count: rows.length,
    },
  });

  return {
    status: 'answered',
    templateId: template.id,
    label: template.label[lang],
    params: bound.display,
    columns,
    rows: rows.map((r, i) => ({
      id: String(r.id ?? i),
      cells: Object.fromEntries(columns.map((c) => [c.key, renderCell(r[c.key], c.kind, lang)])),
      href: template.link ? template.link(r, engagementId) : null,
    })),
    planner: source,
    aiRunId,
  };
}

async function logRefusal(
  tenantId: string,
  engagementId: string,
  lang: 'fr' | 'en',
  asked: string,
  reason: string,
  source: PlanSource | null,
  aiRunId: string | null,
  userId: string | null,
): Promise<AskRefused> {
  await logEvent({
    tenantId,
    engagementId,
    actorKind: 'user',
    actorId: userId,
    verb: 'nl_query_refused',
    objectType: 'query',
    objectId: null,
    payload: { question: asked.slice(0, 500), reason, planner: source, ai_run_id: aiRunId },
  });
  return {
    status: 'refused',
    reason,
    message: refusalMessage(reason, lang),
    planner: source,
    aiRunId,
    offer: catalogueOffer(lang),
  };
}

type Bound =
  | { ok: true; values: (string | number)[]; display: { label: string; value: string }[] }
  | { ok: false; reason: string };

async function bindParams(engagementId: string, plan: ValidPlan, lang: 'fr' | 'en'): Promise<Bound> {
  const values: (string | number)[] = [];
  const display: { label: string; value: string }[] = [];
  for (const { spec, value } of plan.params) {
    if (spec.type === 'threshold_ref') {
      const key = String(value);
      let cents = 0;
      if (key !== 'zero') {
        const t = await validatedThresholds(engagementId);
        if (!t) return { ok: false, reason: 'threshold_not_validated' };
        cents =
          key === 'materiality' ? t.materialityCents
          : key === 'performance_materiality' ? t.perfCents
          : key === 'clearly_trivial' ? t.cttCents
          : t.teCents;
      }
      values.push(centsToNum(cents));
      display.push({
        label: spec.label[lang],
        value: `${THRESHOLD_LABEL[key][lang]}${key === 'zero' ? '' : ` — ${fmtEur(cents, lang)}`}`,
      });
    } else {
      values.push(value);
      display.push({ label: spec.label[lang], value: String(value) });
    }
  }
  return { ok: true, values, display };
}

function renderCell(value: unknown, kind: AnswerColumn['kind'], lang: 'fr' | 'en'): string {
  if (value === null || value === undefined) return '—';
  const s = String(value);
  if (kind === 'money') return fmtEur(numToCents(s), lang);
  if (kind === 'date') return s.slice(0, 10);
  return s;
}
