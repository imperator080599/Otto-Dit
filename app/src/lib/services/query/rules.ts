import { CATALOG } from './catalog';
import { SIGNALS } from './keywords';
import { foldText, type QueryPlan } from './plan';

// ADR-017 step 1 — deterministic translation. Most audit questions are keyword-shaped
// ("demandes en retard", "exceptions non résolues"), so the rules planner answers them at
// zero cost and zero model risk (P4). Ambiguity is a MISS, not a guess: two templates tied
// on score fall through to the LLM planner, and if that is unavailable OTTO refuses.

export interface RulesOutcome {
  plan: QueryPlan | null;
  /** Diagnostic surfaced in the refusal panel and asserted in the tests. */
  scores: { templateId: string; score: number }[];
}

const THRESHOLD_WORDS: { needle: string[]; value: string }[] = [
  { needle: ['seuil de planification', 'performance materiality', 'seuil de travail'], value: 'performance_materiality' },
  { needle: ['clairement insignifiant', 'clearly trivial', 'insignifiant', 'de remontee', 'trivial'], value: 'clearly_trivial' },
  { needle: ['anomalie tolerable', 'tolerable misstatement', 'tolerable'], value: 'tolerable_misstatement' },
  { needle: ['seuil de signification', 'materialite', 'materiality', 'significatif'], value: 'materiality' },
  { needle: ['quel que soit le montant', 'tout montant', 'any amount', 'sans seuil'], value: 'zero' },
];

/** Word-start match on the folded question, so plurals and inflections hit. */
function hits(text: string, keys: string[]): number {
  return keys.filter((k) => {
    const folded = foldText(k).trim();
    return folded.length > 0 && text.includes(` ${folded}`);
  }).length;
}

export function planByRules(question: string): RulesOutcome {
  const text = foldText(question);
  const scores = CATALOG.map((t) => {
    const sig = SIGNALS[t.id];
    if (!sig) return { templateId: t.id, score: 0 };
    const core = hits(text, sig.core);
    const qual = hits(text, sig.qualifier);
    return { templateId: t.id, score: core === 0 ? 0 : core * 2 + qual };
  }).sort((a, b) => b.score - a.score);

  const [best, second] = scores;
  if (!best || best.score < 3) return { plan: null, scores };
  if (second && second.score === best.score) return { plan: null, scores }; // ambiguous → no guess

  const template = CATALOG.find((t) => t.id === best.templateId)!;
  const params: Record<string, string | number> = {};
  for (const spec of template.params) {
    if (spec.type === 'int') {
      const m = question.match(/(\d+)\s*(?:jours?|days?)/i) ?? question.match(/(\d+)/);
      if (m) params[spec.name] = Number(m[1]);
    } else if (spec.type === 'threshold_ref') {
      const w = THRESHOLD_WORDS.find((c) => c.needle.some((n) => text.includes(` ${foldText(n).trim()}`)));
      if (w) params[spec.name] = w.value;
    }
  }
  return { plan: { templateId: template.id, params }, scores };
}
