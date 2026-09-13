# La surface « IA vivante » — engendré par `npx tsx app/scripts/audit/ia-vivante.ts`

> Ne pas éditer à la main : ce fichier est réécrit à chaque exécution du script. Ce qui
> manque ici est ce que le balayage ne voit pas (voir l'en-tête du script) — pas ce qui
> n'existe pas.

## `AnthropicAnalyste` — classe (src/lib/services/entretiens-analyste.ts:106)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L110, ANTHROPIC_API_KEY @ L206

- scripts/eval/entretien.ts:53 — GARDÉ (assertBudgetActifEnBase présent dans le fichier)

## `getAnalyste` — fabrique (src/lib/services/entretiens-analyste.ts:187)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L110, ANTHROPIC_API_KEY @ L206

- src/lib/services/entretiens.ts:161 — GARDÉ (assertBudgetActifEnBase présent dans le fichier)

## `getAnalysteWalkthrough` — fabrique (src/lib/services/entretiens-analyste.ts:199)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L110, ANTHROPIC_API_KEY @ L206

- src/lib/services/walkthrough-analyse.ts:96 — GARDÉ (assertBudgetActifEnBase présent dans le fichier)

## `AnthropicDocAdapter` — classe (src/lib/services/extraction/adapters.ts:82)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L93, new Anthropic( (SDK) @ L96

Aucun appelant trouvé (fabrique ou classe non utilisée ailleurs).

## `getOcrAdapter` — fabrique (src/lib/services/extraction/adapters.ts:172)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L93, new Anthropic( (SDK) @ L96

- src/lib/services/extraction/ladder.ts:119 — GARDÉ (assertBudgetActifEnBase présent dans le fichier)
- scripts/cost/measure.ts:78 — GARDÉ (assertBudgetActifEnBase présent dans le fichier)
- scripts/eval/pieces-neuves.ts:35 — GARDÉ (assertBudgetActifEnBase présent dans le fichier)
- scripts/eval/run.ts:44 — GARDÉ (assertBudgetActifEnBase présent dans le fichier)

## `AnthropicQueryPlanner` — classe (src/lib/services/query/adapter.ts:51)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L55

Aucun appelant trouvé (fabrique ou classe non utilisée ailleurs).

## `getQueryPlanner` — fabrique (src/lib/services/query/adapter.ts:112)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L55

- src/lib/services/query/ask.ts:111 — GARDÉ (assertBudgetActifEnBase présent dans le fichier)

---

**0 appel(s) NON gardé(s)** au moment de cette exécution.
