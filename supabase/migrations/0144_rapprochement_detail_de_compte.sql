-- 0144 — LE CYCLE DE TESTING COMPLET, ÉTAPE 2 : LE RAPPROCHEMENT (plan
-- d'autonomie du fondateur, Partie B, suite de 0143). Le détail que le
-- client fournit derrière un solde (détail clients, détail fournisseurs,
-- registre des immobilisations…) entre COMME PIÈCE (même mécanique que
-- aux_balance_file/row, migration 0026 : evidence_id, empreinte, provenance)
-- puis se rapproche du grand livre, compte par compte, au centime. L'écart,
-- s'il existe, DOIT être expliqué avant que le rapprochement ne se conclue
-- (POP-02, refus porté par le service, pas par cette migration).
--
-- PAS ENCORE DANS CETTE MIGRATION, et volontairement : POP-01 (« on ne tire
-- pas sur une population qui n'est pas rapprochée ») appartient au jour où
-- le tirage lui-même est reconstruit (étape 4) — le tirage du chiffre
-- d'affaires existant (sample/sample_item) n'est pas touché ici. La
-- population DÉRIVÉE (étape 3, « jamais saisie ») lira ces deux tables ;
-- elle n'est pas construite non plus.

create table account_detail_import (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  fsli_code text not null,
  evidence_id uuid not null references evidence(id),
  row_count integer not null default 0,
  total_cents bigint not null default 0,
  gl_attendu_cents bigint,
  ecart_cents bigint,
  ecart_explication text,
  rapprochee boolean not null default false,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  rapprochee_by uuid references app_user(id),
  rapprochee_at timestamptz
);
create index account_detail_import_eng_idx on account_detail_import (engagement_id, fsli_code);

create table account_detail_row (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references account_detail_import(id) on delete restrict,
  seq integer not null,
  reference text not null,
  label text not null,
  amount_cents bigint not null,
  unique (import_id, reference)
);
create index account_detail_row_import_idx on account_detail_row (import_id);

/* LA GARDE DE VERROU (0003) ET SON VERDICT (0042), COMME fsli_analytique
   (0130) : le détail importé du client et son rapprochement sont du contenu
   du dossier — rien ne s'y écrit après le scellé. Trouvé manquant par
   rls-couverture.test.ts et gardes.test.ts (règle 17 : la chaîne verify a
   rougi sur son propre cas avant ce correctif, pas après — la garde a fait
   son travail).

   account_detail_row N'A PAS SA PROPRE garde — MÊME PRÉCÉDENT que
   aux_balance_row (0026/0029) : assert_engagement_unlocked() lit
   `engagement_id` sur la ligne elle-même (0003) ; l'y attacher sur une table
   qui ne porte que `import_id` NE FERAIT RIEN (`eng is null` → elle rend la
   ligne sans rien vérifier) — une garde qui n'a jamais rien refusé n'est pas
   une garde (règle 17). La protection vient du PARENT : les lignes ne
   s'écrivent que dans la même transaction que le rapprochement, déjà gardé
   sur account_detail_import. gardes.test.ts ne l'exige pas non plus :
   account_detail_row ne porte pas `engagement_id`. */
create trigger account_detail_import_lock_guard before insert or update or delete on account_detail_import
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('account_detail_import', 'garde', 'le détail importé du client et son rapprochement sont du contenu du dossier');

do $$ begin
  execute 'alter table account_detail_import enable row level security';
  execute 'create policy account_detail_import_eng on account_detail_import using (engagement_id in (select otto_engagements()))';
  execute 'alter table account_detail_import force row level security';
  execute 'alter table account_detail_row enable row level security';
  execute 'create policy account_detail_row_eng on account_detail_row using (exists (
    select 1 from account_detail_import p where p.id = account_detail_row.import_id
      and p.engagement_id in (select otto_engagements())))';
  execute 'alter table account_detail_row force row level security';
end $$;
