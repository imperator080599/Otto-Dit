import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { CATALOG, getTemplate } from './catalog';
import { SIGNALS } from './keywords';
import { planByRules } from './rules';
import { validatePlan } from './plan';
import { ask, runCatalogue } from './ask';
import type { QueryPlannerAdapter, PlannerReply } from './adapter';

// ADR-017 — « Interroger ». The contract under test: a question either becomes a
// catalogue query executed against stored records, or an explicit refusal. Never prose,
// never model-authored SQL.

/** Stand-in for a live planner: returns whatever a model might have replied. */
function fakePlanner(plan: unknown): QueryPlannerAdapter {
  return {
    name: 'test',
    async plan(): Promise<PlannerReply> {
      return { plan, model: 'test-model', tokensIn: 120, tokensOut: 20, costUsd: 0, latencyMs: 1, raw: '{}' };
    },
  };
}

describe('« Interroger » — NL → deterministic catalogue query (ADR-017)', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 240000);

  it('every catalogue template has deterministic signals and a reviewed SQL body', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(14);
    for (const t of CATALOG) {
      expect(SIGNALS[t.id], `signals missing for ${t.id}`).toBeTruthy();
      expect(t.sql).toMatch(/\$1/); // engagement scoping is not optional
      expect(t.sql.toLowerCase()).not.toMatch(/;\s*\w/); // single statement only
      // every declared param is bound, and no more than the declared params are
      const maxPlaceholder = Math.max(...[...t.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
      expect(maxPlaceholder).toBe(1 + t.params.length);
    }
  });

  it("translates the founder's two questions with rules alone — no LLM call", async () => {
    const a = planByRules('quelles sections ont des exceptions non résolues au-dessus du seuil de signification ?');
    expect(a.plan).toEqual({ templateId: 'exceptions_open_above_threshold', params: { threshold: 'materiality' } });

    const b = planByRules('quelles demandes sont en retard de plus de 10 jours ?');
    expect(b.plan).toEqual({ templateId: 'requests_overdue', params: { days: 10 } });

    const res = await ask(IDS.engNep, 'quelles demandes sont en retard de plus de 10 jours ?', IDS.users.karim);
    expect(res.status).toBe('answered');
    if (res.status !== 'answered') return;
    expect(res.planner).toBe('rules');
    expect(res.aiRunId).toBeNull();
    expect(res.templateId).toBe('requests_overdue');
    expect(res.params).toEqual([{ label: 'Jours de retard', value: '10' }]);
  });

  it('answers with stored records and clickable links, never prose', async () => {
    const res = await ask(IDS.engNep, 'quels justificatifs manquent encore ?', IDS.users.karim);
    expect(res.status).toBe('answered');
    if (res.status !== 'answered') return;
    expect(res.rows.length).toBeGreaterThan(0);
    // every row is an object of the file, reachable in one click
    for (const r of res.rows) {
      expect(r.href).toMatch(new RegExp(`^/eng/${IDS.engNep}/`));
      expect(Object.keys(r.cells).sort()).toEqual(res.columns.map((c) => c.key).sort());
    }
    // the answer object carries no free-text field a model could have written into
    expect(Object.keys(res).sort()).toEqual(
      ['aiRunId', 'columns', 'label', 'params', 'planner', 'rows', 'status', 'templateId'].sort(),
    );
  });

  it('resolves a threshold reference against validated materiality, not a literal', async () => {
    const res = await ask(
      IDS.engNep,
      'quelles sections ont des exceptions non résolues au-dessus du seuil de signification ?',
      IDS.users.karim,
    );
    expect(res.status).toBe('answered');
    if (res.status !== 'answered') return;
    const m = await q<{ amount: string }>(
      `select amount::text from materiality where engagement_id = $1 and status = 'validated'`,
      [IDS.engNep],
    );
    expect(res.params[0].value).toContain(String(Math.round(Number(m[0].amount) / 1000)).slice(0, 2));
    // exceptions exist on this engagement, but none above materiality → empty, not a story
    expect(res.rows.length).toBe(0);
  });

  it('refuses an untranslatable question instead of answering it', async () => {
    const before = await countEvents('nl_query_refused');
    const res = await ask(IDS.engNep, 'penses-tu que le chiffre d’affaires est raisonnable cette année ?', IDS.users.karim);
    expect(res.status).toBe('refused');
    if (res.status !== 'refused') return;
    expect(res.reason).toBe('no_translation');
    expect(res.message).toMatch(/ne se traduit pas/);
    expect(res.offer.length).toBe(CATALOG.length);
    expect(await countEvents('nl_query_refused')).toBe(before + 1);
  });

  it('refuses a drafting request — « Interroger » never writes', async () => {
    const res = await ask(IDS.engNep, 'rédige la conclusion de la section revenus', IDS.users.karim);
    expect(res.status).toBe('refused');
  });

  it('rejects a model-proposed plan that is not in the catalogue', async () => {
    for (const bad of [
      { templateId: "requests_overdue'; drop table request; --", params: {} },
      { templateId: 'select * from request', params: {} },
      { sql: 'select * from request', params: {} },
    ]) {
      const res = await ask(IDS.engNep, 'peu importe la question', IDS.users.karim, fakePlanner(bad));
      expect(res.status).toBe('refused');
      if (res.status !== 'refused') return;
      expect(res.reason).toMatch(/unknown_template|plan_without_template_id/);
    }
    // the tables the model tried to reach are untouched
    const req = await q<{ n: string }>(`select count(*)::text n from request where engagement_id = $1`, [IDS.engNep]);
    expect(Number(req[0].n)).toBeGreaterThan(0);
  });

  it('rejects out-of-domain and undeclared params', () => {
    expect(validatePlan({ templateId: 'requests_overdue', params: { days: 99999 } }).ok).toBe(false);
    expect(validatePlan({ templateId: 'requests_overdue', params: { days: '; drop' } }).ok).toBe(false);
    expect(validatePlan({ templateId: 'requests_overdue', params: { limit: 5 } }).ok).toBe(false);
    expect(validatePlan({ templateId: 'exceptions_open_above_threshold', params: { threshold: 'anything' } }).ok).toBe(false);
    const good = validatePlan({ templateId: 'requests_overdue', params: {} });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.plan.params[0].value).toBe(10); // catalogue default, not a model value
  });

  it('records an ai_run when the LLM planner is used, and none when rules suffice', async () => {
    const res = await ask(
      IDS.engNep,
      'donne-moi les points de revue encore ouverts par personne',
      IDS.users.karim,
      fakePlanner({ templateId: 'review_notes_open', params: {} }),
    );
    expect(res.status).toBe('answered');
    if (res.status !== 'answered') return;
    expect(res.planner).toBe('llm');
    expect(res.aiRunId).toBeTruthy();
    const run = await q<{ purpose: string; prompt_id: string; adapter: string }>(
      `select purpose, prompt_id, adapter from ai_run where id = $1`,
      [res.aiRunId],
    );
    expect(run[0]).toMatchObject({ purpose: 'suggestion', prompt_id: 'nl-query-plan', adapter: 'test' });
  });

  it('offline default never calls out: no planner configured → refusal, no ai_run', async () => {
    const before = await q<{ n: string }>(`select count(*)::text n from ai_run where engagement_id = $1`, [IDS.engNep]);
    const res = await ask(IDS.engNep, 'et sinon, comment ça va ?', IDS.users.karim);
    expect(res.status).toBe('refused');
    const after = await q<{ n: string }>(`select count(*)::text n from ai_run where engagement_id = $1`, [IDS.engNep]);
    expect(after[0].n).toBe(before[0].n);
  });

  it('the explicit catalogue path runs the same spine with no model at all', async () => {
    const res = await runCatalogue(IDS.engNep, 'workpapers_unsigned', {}, IDS.users.karim);
    expect(res.status).toBe('answered');
    if (res.status !== 'answered') return;
    expect(res.planner).toBe('explicit');
    expect(res.aiRunId).toBeNull();
    expect(getTemplate('workpapers_unsigned')!.columns.length).toBe(res.columns.length);
  });

  it('every execution and every refusal is event-logged with its question', async () => {
    const rows = await q<{ verb: string; payload: { question: string; planner: string | null; template_id?: string } }>(
      `select verb, payload from event_log where engagement_id = $1 and verb like 'nl_query%' order by id`,
      [IDS.engNep],
    );
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) {
      expect(['nl_query_executed', 'nl_query_refused']).toContain(r.verb);
      expect(typeof r.payload.question).toBe('string');
    }
    expect(rows.some((r) => r.verb === 'nl_query_executed' && r.payload.planner === 'rules')).toBe(true);
    expect(rows.some((r) => r.verb === 'nl_query_refused')).toBe(true);
  });

  it('runs every catalogue query on the demo engagement without error', async () => {
    for (const t of CATALOG) {
      const res = await runCatalogue(IDS.engNep, t.id, {}, IDS.users.karim);
      expect(res.status, `${t.id} did not execute`).toBe('answered');
    }
  });
});

async function countEvents(verb: string): Promise<number> {
  const r = await q<{ n: string }>(`select count(*)::text n from event_log where verb = $1`, [verb]);
  return Number(r[0].n);
}
