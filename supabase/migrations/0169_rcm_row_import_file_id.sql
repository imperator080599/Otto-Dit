-- 0169_rcm_row_import_file_id : Lot 7, H-5 tranche 1 (docs/REGISTRE_IDEES.md §H, ligne 273).
--
-- « Un adaptateur d'import GRC : matrice risques-contrôles […] importée COMME PIÈCE, jamais
-- recréée. » `import_file` anticipait déjà ce cas (`kind` porte 'rcm' depuis 0001), mais
-- `importRcm` (sox.ts) ne créait JAMAIS de ligne `import_file` — zéro provenance (sha256,
-- validation_report, status), contrairement à `importTb`/`importFec` (imports.ts) qui, eux,
-- l'ont toujours fait. `rcm_row` (0002) n'avait donc aucun moyen de dire DE QUEL fichier elle
-- vient — une régression du même import ne pouvait ni se distinguer d'une autre, ni prouver
-- qu'elle vient bien d'une pièce reçue plutôt que d'une saisie manuelle.
--
-- ALTER EN AVANT (règle 26) : 0002_testing.sql reste inchangée. Une colonne nullable — les
-- lignes RCM déjà en base (démonstration semée avant cette tranche) n'ont pas de provenance
-- rétroactive, et ne prétendent pas en avoir.

alter table rcm_row
  add column import_file_id uuid references import_file(id);

comment on column rcm_row.import_file_id is
  'La pièce (import_file, kind=rcm) dont cette ligne est issue — jamais recréée à la main. Nullable : les lignes important d''avant cette colonne (0169) n''ont pas de provenance rétroactive.';
