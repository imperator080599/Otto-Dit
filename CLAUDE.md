# OTTO — standing rules for any Claude session on this repo

OTTO is an AI-native platform for financial-statement audit and internal-control (SOX/ICFR)
assurance. Framework-agnostic core (ISA skeleton) + framework packs (ISA, NEP/France,
PCAOB/SOX+COSO in v1). Resume protocol: **read STATUS.md and docs/, then continue from
current state.**

## Non-negotiable rules

1. **docs/ is the source of truth.** If code must diverge from a doc, update the doc in the
   same commit and log the change in docs/DECISIONS.md.
2. **Synthetic data only, forever.** Every dataset, company, name, SIREN/EIN, IBAN and
   document in this repo is fabricated and clearly fictional. Never request or incorporate
   any firm's proprietary methodology or any real client data.
3. **Provenance and audit trail are implemented from the first feature**, never retrofitted.
   Every state change writes to event_log; every AI output writes an ai_run row
   (model, prompt version, tokens, output hash). P7 must stay answerable at all times:
   "Why does this evidence exist?", "What supports this conclusion?", "Where did this
   figure come from?"
4. **Tests are required** for all parsing, reconciliation, sampling, materiality, matching
   and attribute-testing logic. LLM/OCR calls live behind interfaces with record/replay
   mocks — the test suite runs with **zero** external API calls.
5. **Small vertical slices**, each ending in a working demo. Commit at every slice; update
   STATUS.md and DEMO.md in the same commit.
6. **No LLM where a deterministic rule suffices** (P4). LLMs only for extraction,
   classification, drafting, suggestion.
7. **HITL ceiling L2** for anything that enters the audit file, in every framework pack:
   AI prepares, a human must review/approve before it counts.
8. Never cite a standard by number unless certain or verified; otherwise mark [UNVERIFIED].
9. A framework pack = content/configuration, never a code fork. New framework or cycle =
   pack content, not architecture.
10. **Tout écran neuf est conduit dans un navigateur avant d'être annoncé.** Un écran qui
    compile n'est pas un écran qui rend, et un écran qui rend n'est pas un écran qui marche.
    `npm test` inclut le balayage de toutes les routes ; `npm run screens` le refait sur un
    build de PRODUCTION, et c'est celui-là qui doit passer avant une livraison (ADR-076,
    ADR-078).
11. **Un test vert sur un chemin que la production n'emprunte pas ne prouve rien.** Les deux
    exécutions — Vitest et le bundle Next — ne sont pas la même.
12. **Une vérification que personne ne peut rejouer est une affirmation.** Toute mesure citée
    dans une livraison doit avoir une commande qui la reproduit.
13. **Le silence lu comme un succès est le défaut à traquer** : un harnais muet, un prédicat
    déclaré et non implémenté, une règle inconnue ignorée, un compteur qui ne compte pas les
    plantages, un refus calculé puis jeté.
14. **Périmètre gelé** : aucun cycle au-delà du chiffre d'affaires, aucun contenu de procédure
    nouveau, pack SOX gelé. La mécanique est le produit ; les procédures sont du contenu.

## Repo layout

- `docs/` — program documents (00 founder ideas … 09 gates, DECISIONS, ASSUMPTIONS,
  OPEN_QUESTIONS). Source of truth.
- `dataset/` — synthetic dataset **generator** (deterministic, seeded) + generated files +
  ANOMALIES.md (the acceptance suite).
- `app/` — Next.js + TypeScript application (local-first: runs with zero external accounts).
- `supabase/migrations/` — Postgres SQL migrations (applied locally to PGlite, in production
  to Supabase).
- `tests/` — cross-cutting/acceptance tests (unit tests may live next to code in app/).
- `STATUS.md` — current slice, done list, next actions, open threads. `DEMO_APP.md` — la mission
  entière dans l'application, rejouée par `tests/parcours.test.ts`. `DEMO.md` — how to run
  the two-part demo. `DEPLOY.md` — Vercel+Supabase runbook. `COST.md` — actual LLM/OCR spend.

## Dev commands

- App: `cd app && npm install && npm run db:setup && npm run dev` (see DEMO.md).
- Tests: `cd app && npm test` (Vitest; zero network). Inclut le balayage des écrans, qui
  lance un serveur local — comptez ~3 minutes de plus.
- Écrans en production : `cd app && npm run screens` (build + `next start` + navigateur).
- Tout : `cd app && npm run verify` (base fraîche, dossier de démonstration déroulé, types,
  tests, balayage de production).
- Dataset regeneration: `cd app && npm run dataset:generate` (deterministic, seeded).
