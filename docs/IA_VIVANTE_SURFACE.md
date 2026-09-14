# La surface « IA vivante » — engendré par `npx tsx app/scripts/audit/ia-vivante.ts`

> Ne pas éditer à la main : ce fichier est réécrit à chaque exécution du script. Ce qui
> manque ici est ce que le balayage ne voit pas (voir l'en-tête du script) — pas ce qui
> n'existe pas.

## `AnthropicAnalyste` — classe (src/lib/services/entretiens-analyste.ts:106)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L110, ANTHROPIC_API_KEY @ L206

- scripts/eval/entretien.ts:53 — IA-BUDGET-01 : GARDÉ · AUTO-01 : **NON GARDÉ**

## `getAnalyste` — fabrique (src/lib/services/entretiens-analyste.ts:187)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L110, ANTHROPIC_API_KEY @ L206

- src/lib/services/entretiens.ts:162 — IA-BUDGET-01 : GARDÉ · AUTO-01 : GARDÉ

## `getAnalysteWalkthrough` — fabrique (src/lib/services/entretiens-analyste.ts:199)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L110, ANTHROPIC_API_KEY @ L206

- src/lib/services/walkthrough-analyse.ts:97 — IA-BUDGET-01 : GARDÉ · AUTO-01 : GARDÉ

## `AnthropicDocAdapter` — classe (src/lib/services/extraction/adapters.ts:82)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L93, new Anthropic( (SDK) @ L96

Aucun appelant trouvé (fabrique ou classe non utilisée ailleurs).

## `getOcrAdapter` — fabrique (src/lib/services/extraction/adapters.ts:172)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L93, new Anthropic( (SDK) @ L96

- src/lib/services/extraction/ladder.ts:120 — IA-BUDGET-01 : GARDÉ · AUTO-01 : GARDÉ
- scripts/cost/measure.ts:78 — IA-BUDGET-01 : GARDÉ · AUTO-01 : **NON GARDÉ**
- scripts/eval/pieces-neuves.ts:35 — IA-BUDGET-01 : GARDÉ · AUTO-01 : **NON GARDÉ**
- scripts/eval/run.ts:44 — IA-BUDGET-01 : GARDÉ · AUTO-01 : **NON GARDÉ**

## `AnthropicQueryPlanner` — classe (src/lib/services/query/adapter.ts:51)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L55

Aucun appelant trouvé (fabrique ou classe non utilisée ailleurs).

## `getQueryPlanner` — fabrique (src/lib/services/query/adapter.ts:112)

Sites réels dans ce fichier : ANTHROPIC_API_KEY @ L55

- src/lib/services/query/ask.ts:112 — IA-BUDGET-01 : GARDÉ · AUTO-01 : GARDÉ

---

**0 appel(s) NON gardé(s) par IA-BUDGET-01**, **4 par AUTO-01** au moment de cette exécution.
