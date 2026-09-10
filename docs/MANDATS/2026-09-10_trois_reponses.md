# OTTO — Mandat du fondateur : trois réponses (Lot 8 point 3, l'écart A.6, le repass design)

Dicté par le fondateur le 10 septembre 2026, en réponse au compte rendu de fin de tranche
PLAN_RLS étapes 1-2. Commité verbatim selon la règle 33. Complète les mandats des 8 et 9
septembre, ne les remplace pas.

---

Three answers.

1. §4 point 3 — granted. The founder has the funds and has set an automatic spend cap on the
   provider side. You may now request exactly one thing: name the provider, the model, the single
   call you need it for, and the environment variable name. The key goes into Vercel's environment,
   never into the repo, and the DB budget gate stays the authority on whether the feature is open —
   the founder's billing cap is a backstop, not a substitute. Nothing is activated until the gate is
   opened by his own SQL write.

2. The /api/sante tenant gap — the founder's decision, in one sentence: the probe must declare which
   tenant it is reading as, and an empty reading must FAIL rather than pass. He is not choosing
   between your two documented options by their mechanics; he is imposing the property both must
   satisfy — it must be impossible for the probe to see nothing and report green. Implement whichever
   option delivers that, and if neither does, say so and propose one that does. Then prove it the way
   this project proves everything: a known-bad case where the probe is denied its rows, and the
   reading goes RED, observed, not asserted.
   Step 3 itself stays forbidden until that is in place and he says otherwise.

3. Open the retroactive design repass now — R59 to R62. This is the founder's trigger, the one
   reserved to him by the 2026-09-09 mandate §5. Scope it as its own lot under the standing cadence.
   Start with the design token source as a single authority (colours, type scale, radii, shadows,
   spacing), then migrate screens onto it tranche by tranche, so the repass is a change of tokens and
   never a rewrite of screens. Every D.6 mechanical test keeps applying unchanged.
   The founder will not review screen by screen: he gives his verdict ONCE, on otto-dit.vercel.app,
   when the whole repass is shipped. Tell him when that moment is — that single message is the only
   thing you owe him until then.

Standing permission and cadence unchanged. Do not wake me between tranches.
