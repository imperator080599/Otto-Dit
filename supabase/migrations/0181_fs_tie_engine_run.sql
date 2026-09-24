-- P1-10 — AUD-12, partie « deux horloges / qui a produit cette pièce ». `fs_tie.tied_by`
-- attribuait à L'ACTEUR HUMAIN qui a cliqué « pointer » un rapprochement que le MOTEUR a
-- calculé (services/tieout.ts::pointer, deux natures sur trois) — la même confusion que
-- `assertNiveauOuvert`/`niveauDejaLu` avait déjà nommée ailleurs (mandat 2026-09-14) entre
-- « qui a cliqué » et « ce qui a produit la valeur ». Un pointage machine porte désormais
-- `tied_by = null` (personne n'a jugé) et `engine_run_id` (ce qui a calculé) — la
-- contrainte `documented_needs_explanation_and_evidence` (0019) n'exige `tied_by` que pour
-- la nature 'calcul_documente' au statut 'documented' (la seule branche vraiment humaine,
-- services/tieout.ts::documenter) : elle n'est pas touchée par cette colonne.

alter table fs_tie add column engine_run_id uuid references engine_run(id);
