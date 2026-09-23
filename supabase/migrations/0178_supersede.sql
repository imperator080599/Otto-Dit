-- 0178 — P1-06 (AUD-10 — §7.6 du plan maître, renumérotée : la bande 0170+ est déjà consommée
-- par P1-01..05 et leurs correctifs ; contenu et ordre du plan conservés, règle 26).
--
-- CE QUE CETTE MIGRATION FERME : trois chemins qui DÉTRUISAIENT ou MUTAIENT un fait déjà écrit
-- au lieu d'écrire une NOUVELLE ligne à côté (règle 28, « un recalcul ne détruit ni n'invalide
-- jamais en silence du travail humain ») :
--   1. `verifyExtraction` (extraction/ladder.ts) mettait À JOUR la ligne d'extraction en place —
--      la valeur BRUTE (avant correction humaine) disparaissait. `extraction` devient append-only
--      (forbid_mutation, même patron que signoff/workpaper_edit/ai_run, 0003) ; `verifyExtraction`
--      (service, hors SQL) insère une ligne NEUVE `rung='human'`, `supersedes_extraction_id` vers
--      l'originale.
--   2. `materiality.ts::validate` MUTAIT la ligne proposée en place quand l'auditeur ajuste le
--      seuil (`benchmark_code`, `amount`, …) — l'écart entre la proposition ORIGINALE du moteur et
--      la décision AJUSTÉE de l'auditeur n'était plus lisible après coup. `supersedes_id` posé ;
--      le service (hors SQL) crée la version N+1 validée au lieu de muter la version proposée.
--   3. `testing/grille.ts::calculerGrille` SUPPRIMAIT `cell_disposition` (la décision humaine sur
--      une cellule hors tolérance) dès que la cellule ne réapparaissait plus dans un recalcul (une
--      colonne devenue inapplicable, par exemple). `couvre_encore` posé ; le service (hors SQL) ne
--      supprime plus jamais une disposition — il la marque `couvre_encore = false` et ne supprime
--      QUE les cellules calculées qui n'ont JAMAIS porté de décision humaine (rien à perdre).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 19) : `fsli.rebuildFslis` (passage en UPSERT
-- préservant scoping/scoping_basis/confirmed_by/confirmed_at) et `processus.ts::remplacerProcessus`
-- (arrêt du delete+recreate, utilisation de `process_model.status`/`supersedes_id`, DÉJÀ posés par
-- 0172/0174 — P1-03) sont des changements de SERVICE PUR, sans DDL neuf : `fsli(engagement_id,
-- code)` porte déjà son unique (0001), `process_model` porte déjà `status`/`supersedes_id` (0172),
-- rien à ajouter ici.

alter table extraction add column supersedes_extraction_id uuid references extraction(id);
create trigger extraction_append_only before update or delete on extraction
  for each row execute function forbid_mutation();

alter table materiality add column supersedes_id uuid references materiality(id);

alter table cell_disposition add column couvre_encore boolean not null default true;
