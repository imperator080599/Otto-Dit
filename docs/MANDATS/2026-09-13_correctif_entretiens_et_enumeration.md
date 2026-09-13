# Mandat du fondateur, 2026-09-13 — correctif `entretiens.ts` puis énumération « IA vivante »

> Committé verbatim après coup (règle 33) : ces deux messages n'avaient vécu que dans la
> conversation, jamais dans le dépôt — exactement le défaut que la règle 33 nomme (« un mandat
> qui n'est pas dans le dépôt n'existe pas »). Reconstruits ici depuis le résumé de session tenu
> par l'outil de conversation, qui les cite comme verbatim ; aucune paraphrase ajoutée.

## Message 1 — le fondateur relisant la confirmation de R74 en production

R74 confirmed live (b3115b2, then 13cb028). Holding the credential wire exactly as instructed was
the right call, and the direct proof of R58's cause — unbounded vitest forks on a 4-core host — is
the first real diagnosis of that flake in this repo's history. Worth the twelve passes.

But you buried the most important thing of this tranche under "two loose ends".

IA-BUDGET-01 has existed since 9 September and, by your own words, R74 is its FIRST real call site
in the whole repo — while entretiens.ts's real adapter path still does not call it. That means the
gate the founder is relying on to make spending safe has a bypass on the older path: the moment he
sets the key, interviews can spend without passing it. A guard that nothing called is not a guard,
and a guard with an uncalled sibling path is worse — it looks closed while a door stands open.

Close that before anything else: wire assertBudgetActifEnBase into entretiens.ts's real adapter
path, and prove it the way this project proves everything — a known-bad case where the gate is
closed and the interview path is REFUSED, observed, not asserted. Two hostile voices, since this
touches the budget guard.

Then deliver the three answers you have now skipped twice, in your next message, before any new
build:
  a. the TWO environment variable names — the one that SELECTS the adapter and the one that
     carries the CREDENTIAL — with their expected values, and confirmation that neither can
     appear in the repo;
  b. the exact SQL the founder runs himself to open the in-DB gate, copy-pasteable;
  c. one short paragraph on R59 / ADR-103: what ADR-103 decided, why the design language does not
     settle it, the two options and the consequence of each. Do not choose.

After that, register the dead sonde.station() field as its own fil — every #418 incident logged
since F4 carries an attribution column that has never said anything, which is the décor defect
applied to your own forensic record.

Do not request or set the key until (a) is answered and the entretiens gap is closed and proven.

## Message 2 — après confirmation de R74/entretiens.ts en production

Do not create a key. One already exists (workspace OTTO, created 25 August) — and note that this
repo contains a REALLY MEASURED cost in COST.md §1 ter (eval:entretien, 2625 tokens for 4351
characters), which means a real call was made at some point. That key has already been in play.

So, before the enumeration tranche, answer one factual question with a measurement, not a guess:
is ANTHROPIC_API_KEY currently set in the Vercel environment (any scope — production, preview,
development), and are OTTO_TRANSCRIPT_ADAPTER / OTTO_WALKTHROUGH_ADAPTER / OTTO_OCR_ADAPTER set
anywhere? You have the Vercel tool. If the credential is already present, then R76 is not a future
hole — extraction/ladder.ts is reachable and ungated right now wherever demoPublique() does not
apply, and that changes this from housekeeping to an open door. Report exactly what you find,
without printing any value.

Then the tranche as specified: enumerate every site that can reach the provider or read
ANTHROPIC_API_KEY, as a generated artifact; close every one outside assertBudgetActifEnBase, R76
included, each with its own known-bad case (gate closed + real adapter ⇒ refused, zero network
call, observed); and add the test that makes a fourth ungated site impossible. That test is the
deliverable.

The founder's decisions, settled:

- Ceiling: 2 USD for the first opening... His SQL, which he runs himself, with his own name:

    insert into app_state (key, value)
    values ('ia_vivante_budget', jsonb_build_object(
      'actif', true, 'plafondUsd', 2, 'activePar', '<son nom>', 'activeLe', now()::text))
    on conflict (key) do update set value = excluded.value, updated_at = now();

  He runs it only after the enumeration tranche is served. The selectors stay on mock until he
  flips them himself — still three distinct gestures.

- R59 / ADR-103: option (b) confirmed. Fold it into the token system, and re-express ADR-103's
  intent as a mechanical test — an AI-prepared item must be impossible to miss — so the test
  carries it, not the stylesheet. Freeze the property, never the appearance.

Same permission and cadence. Do not wake me between tranches.

## Ce que ces deux messages ont produit (exécution, pas répétition)

Message 1 : correctif `entretiens.ts` câblé sur `IA-BUDGET-01`, cas connu mauvais, deux voix
hostiles (aucun défaut confirmé), SHA `9862ce3` confirmé en production. Les réponses (a)/(b)/(c)
ont été données EN CHAT au moment voulu, jamais choisies — non répétées ici (STATUS.md, tranche
« Correctif fondateur »). R75 (le champ `sonde.station()` mort) enregistré séparément.

Message 2 : tranche d'énumération « IA vivante » — réponse honnête à la question factuelle
(aucun outil de cette session ne mesure les variables d'environnement Vercel ; fait de code
disponible : `demoPublique()` couvre inconditionnellement tout déploiement Vercel), neuf sites
recensés et fermés (R76, R77), garde structurelle ajoutée, SHA `a8be5f7` confirmé en production.
Détail complet : STATUS.md, tranche « Tranche d'énumération "IA vivante" ». La clé n'a été ni
créée, ni demandée, ni exportée par cette session ; le SQL du fondateur n'a pas été exécuté par
cette session — c'est son geste, après ce message.

**R59 / ADR-103 (option b)** reste à construire au moment où ce fichier est commité — sujet de la
tranche suivante, distincte de celle-ci.
