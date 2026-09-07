-- 0145 — LE CYCLE DE TESTING COMPLET, ÉTAPE 7 (plan d'autonomie du
-- fondateur, Partie B, suite de 0143/0144). LA COLONNE AJOUTÉE À LA MAIN :
-- l'auditeur choisit une DONNÉE du catalogue déjà lu par l'échelle
-- d'extraction (le même catalogue fermé que la colonne ajoutée au papier de
-- travail, ADR-099, colonne.ts::CHAMPS_LISIBLES) — jamais du texte libre
-- interprété à la volée. Chaque champ du catalogue porte déjà son TYPE DE
-- PIÈCE (`docType`) : choisir la donnée choisit la pièce, par construction —
-- « chaque colonne sait de quelle pièce elle provient » (mandat) est donc
-- vrai dès l'insertion, jamais un second champ qui pourrait diverger du
-- premier.
--
-- ADAPTATION AU MODÈLE RÉEL (règle 15, le code fait foi) : le mandat (§B.3)
-- nomme `grid_id` — mais `test_grid` est REMPLACÉ à chaque figeage (jamais
-- muté), donc une colonne ajoutée qui viserait un `grid_id` précis
-- disparaîtrait à la prochaine version. Cette table s'ancre sur
-- `engagement_id` (+ `procedure_code`, comme test_grid) — la même identité
-- durable que `colonnesCommandees` (grille.ts) lit déjà pour composer la
-- grille ; `figerGrille` compose désormais PACK + AJOUTÉES et verse tout
-- dans une version neuve, avec le même mécanisme d'invalidation des
-- conclusions qui existe déjà pour un changement de pack.
--
-- PAS DANS CETTE MIGRATION, et volontairement : aucun calcul d'ATTENDU
-- chiffré contre le grand livre pour une colonne ajoutée (contrairement aux
-- sept colonnes du pack) — seule la PRÉSENCE de la donnée dans la pièce
-- reçue est vérifiée (grille.ts, calculerCellule). Inventer un attendu pour
-- un champ arbitraire serait une comparaison FABRIQUÉE, pas une mesure.

create table test_column (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  procedure_code text not null default 'REV-SUBST',
  evidence_type_code text not null check (evidence_type_code in ('invoice', 'delivery_note')),
  field_code text not null,
  libelle text not null,
  tolerance text not null,
  origine text not null default 'ajoutee_par' check (origine in ('pack', 'ajoutee_par')),
  ajoutee_par_user_id uuid references app_user(id),
  ajoutee_le timestamptz not null default now(),
  unique (engagement_id, procedure_code, field_code)
);
create index test_column_eng_idx on test_column (engagement_id, procedure_code);

create trigger test_column_lock_guard before insert or update or delete on test_column
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('test_column', 'garde', 'une colonne ajoutée à la grille de test est du contenu du dossier, comme la grille elle-même');

do $$ begin
  execute 'alter table test_column enable row level security';
  execute 'create policy test_column_eng on test_column using (engagement_id in (select otto_engagements()))';
  execute 'alter table test_column force row level security';
end $$;
