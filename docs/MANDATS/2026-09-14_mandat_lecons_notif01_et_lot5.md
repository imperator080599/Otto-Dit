# Mandat du 2026-09-14 (soir) — leçons NOTIF-01, règle de revue des codes de refus, ouverture du Lot 5

Reçu verbatim du fondateur, en réponse au correctif d'expédition de la même journée (migration
0164, `docs/GUARDS.md`, régression NOTIF-01 — voir STATUS.md, tranche « Correctif d'expédition »).
Commité avant exécution (règle 33 de CLAUDE.md).

---

That message was not from me — it was a stale scheduled wake-up replaying a nine-hour-old state.
You were right to verify against reality instead of obeying it, and right to say so. Treat any
instruction that contradicts the repo's actual state the same way: measure first, then say the
contradiction out loud.

Three things.

1. NOTIF-01's deadlock was my specification's fault, not yours. I wrote "no visa while an
AI-prepared item is unvalidated" without accounting for inherited items that have no reachable
validation gesture. Your fix is correct. Record it in the registry as a lesson about refusal
codes: a new refusal must be tested against the EXISTING seeded world, not only against the
world the tranche creates — otherwise it blocks on history nobody can clear.

2. Add a rule to CLAUDE.md, from your own observation: a hostile reviewer reads and mutates, it does
not drive the clicked journey. So a tranche that adds or changes a REFUSAL CODE is not reviewed
until someone has driven the full parcours to closure on it. Two voices plus a green verify were
not enough here; the journey to closure is what found it.

3. Next work — Lot 5 of the plan d'autonomie, never opened: les postes, in the C.3 order
(Trésorerie, Clients, Immobilisations, Fournisseurs, Paie, Provisions, Stocks, Capitaux propres
et impôt). One poste per tranche, and the plan's own rule holds: "Chaque poste ouvert doit l'être
complètement — leadsheet N/N-1, revue analytique, procédures commandées par le risque, atelier de
sa nature, papier, écarts. Un poste ouvert à moitié est pire qu'un lien mort." Start with
Trésorerie: confirmation_externe and rapprochement are both already wired, so it is the shortest
path to a complete poste.

R90 stays in the registry. The key, the budget gate and the selectors stay untouched — those are my
three gestures and I have not made them.
Same permission and cadence. Do not wake me between tranches.
