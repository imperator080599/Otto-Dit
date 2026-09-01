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
    build de PRODUCTION et `npm run clics` y CLIQUE, et ce sont ces deux-là qui doivent passer
    avant une livraison (ADR-076, ADR-078, ADR-090).
11. **Un test vert sur un chemin que la production n'emprunte pas ne prouve rien.** Les deux
    exécutions — Vitest et le bundle Next — ne sont pas la même.
12. **Une vérification que personne ne peut rejouer est une affirmation.** Toute mesure citée
    dans une livraison doit avoir une commande qui la reproduit.
13. **Le silence lu comme un succès est le défaut à traquer** : un harnais muet, un prédicat
    déclaré et non implémenté, une règle inconnue ignorée, un compteur qui ne compte pas les
    plantages, un refus calculé puis jeté, un refus rendu en page 500, un objet créé qu'aucun
    chemin de lecture n'atteint, un geste du métier sans écran, une décision qu'on ne peut plus
    revoir, une branche de repli que rien n'exécute jamais, un formulaire que le navigateur
    refuse d'envoyer et qu'on lit comme une règle vérifiée (ADR-088, ADR-089, ADR-091).
    Corollaire : **n'affirme jamais plus que ce que tu vérifies** — ni dans un écran, ni dans
    STATUS.md.
14. **Périmètre gelé** : aucun cycle au-delà du chiffre d'affaires, aucun contenu de procédure
    nouveau, pack SOX gelé. La mécanique est le produit ; les procédures sont du contenu.
15. **Chercher un mot n'est pas vérifier un chemin.** Un écran a été écarté d'un audit parce que
    le mot « refusée » y figurait — dans une PHRASE D'EXPLICATION, pas dans un chemin de code — et
    il acceptait en réalité ce qu'il prétendait refuser (surcharger un niveau d'assertion sans
    motif écrit, ADR-094). Un `grep` répond à la question « ce texte existe-t-il ? », jamais à la
    question « cette règle s'applique-t-elle ? ». La seconde ne se répond qu'en empruntant le
    chemin : un test qui l'exerce, ou un clic.
16. **Ne jamais présenter comme preuve un artefact produit par un autre objet que celui dont on
    parle.** Le thème sombre de l'application n'existait pas ; les captures sombres montrées
    venaient du PROTOTYPE (ADR-094). Une capture, une mesure, un journal ne valent que pour
    l'objet qui les a produits — et il faut le nommer. Corollaire du 13 : une preuve empruntée
    est la forme la plus convaincante du silence lu comme un succès.

17. **Tout instrument de mesure s'éprouve d'abord contre un cas connu MAUVAIS.** On
    introduit délibérément le défaut que l'instrument existe pour attraper — une chaîne
    française hors catalogue, un écran à sept actions, une lecture que plus aucun écran
    n'atteint — on vérifie qu'il ÉCHOUE, puis on retire le défaut. **Un détecteur qui n'a
    jamais échoué exprès n'a jamais été testé.** Quatre instruments de suite ont mesuré à
    côté de ce qu'ils devaient voir : le middleware « inerte », DENSITE à 0 action,
    /api/sante braqué sur du code mort, et le détecteur de langue qui affichait « 0 reste »
    sur les 22 phrases de la liste que lit un signataire avant de signer.
18. **Une explication plausible d'un échec de test est une HYPOTHÈSE, pas un diagnostic.**
    « C'est juste le libellé qui a changé » se prouve station par station, pas en gros.
    Dans ce dépôt, l'hypothèse plausible a caché un vrai défaut quatre fois sur quatre.

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

- **Montrer le produit** : `cd app && npm run demo` — une commande, base vide → migrations →
  monde de démonstration → serveur, et un panneau qui donne l'adresse, les trois rôles, le
  portail client et la commande de remise à zéro. Chaque étape qui peut échouer sur une
  machine neuve dit quoi faire, jamais une trace (ADR-095).
- Développer : `cd app && npm install && npm run db:setup && npm run dev` (see DEMO.md).
- Tests: `cd app && npm test` (Vitest; zero network). Inclut le balayage des écrans, qui
  lance un serveur local — comptez ~3 minutes de plus.
- Écrans en production : `cd app && npm run screens` (build + `next start` + navigateur).
- Parcours **cliqué** en production : `cd app && npm run clics` (ADR-090, ADR-091). Le balayage
  OUVRE les écrans, le parcours AGIT dessus, de l'import du grand livre définitif au dossier
  scellé téléchargé ; les deux sont nécessaires.
- Revue **visuelle** : `cd app && npm run visuel` (ADR-094) — clair et sombre, large et 390 px ;
  débordement et contraste mesurés, captures produites pour l'œil humain.
- Tout : `cd app && npm run verify` (base fraîche, dossier de démonstration déroulé, types,
  tests, balayage de production, parcours cliqué, revue visuelle).
- Dataset regeneration: `cd app && npm run dataset:generate` (deterministic, seeded).
