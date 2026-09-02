-- 0050 — LA GRILLE DE TEST (mandat du jour, W1 : l'atelier de test).
--
-- CE QUI MANQUAIT. Le vouching écrivait ses contrôles dans `match.checks`, un
-- tableau JSON par ligne : « pass » ou pas, sans cellule, sans ancre, sans delta
-- signé, sans état par attribut — et l'écran les résumait en une phrase. Un
-- auditeur qui veut savoir POURQUOI la ligne est verte lit une phrase ; celui
-- qui veut voir OÙ, sur la pièce, se trouve le montant comparé, ouvre la pièce
-- et cherche. Quatre objets remplacent la phrase :
--
--   test_grid             la grille FIGÉE par pack : les colonnes (champs des
--                         justificatifs du cycle, tolérances du pack), versionnées,
--                         empreintées — les mêmes colonnes en français et en anglais
--   test_cell             UNE cellule par ligne et par colonne : attendu, trouvé,
--                         delta SIGNÉ, tolérance, état, et l'ANCRE (pièce, page,
--                         rectangle, champ) — la comparaison est déterministe et
--                         imprime toujours le delta
--   cell_disposition      la décision HUMAINE sur une cellule qui n'est pas
--                         conforme : un motif écrit, qui, quand (plafond L2)
--   test_line_conclusion  la conclusion d'une ligne : qui, quand, l'empreinte
--                         des cellules au moment de conclure (une cellule
--                         recalculée depuis rend la conclusion périmée)
--
-- LES QUATRE REFUS, chacun tenu par UN objet SQL (registre des gardes) :
--   TEST-01  une cellule verte sans ancre est refusée  (contrainte test_cell_green_needs_anchor)
--   TEST-02  une ligne dont un attribut d'IDENTITÉ diverge (tiers, numéro de
--            pièce) ne se conclut pas : la preuve n'est pas recevable
--            (déclencheur test_line_conclusion_1_identity)
--   TEST-03  une disposition sans motif est refusée (contrainte cell_disposition_has_reason)
--   TEST-04  une ligne dont une cellule est hors tolérance, absente ou sans ancre
--            ne se conclut pas sans disposition écrite — ni une ligne sans
--            aucune cellule (déclencheur test_line_conclusion_2_cells)
--
-- Les états de cellule :
--   conforme        la valeur relevée est dans la tolérance ET la pièce la montre (ancre)
--   hors_tolerance  la valeur relevée est hors tolérance — delta signé imprimé
--   non_recevable   un attribut d'identité diverge : la pièce ne soutient pas la ligne
--   absent          le champ n'a pas été relevé sur la pièce (ou pas de pièce)
--   sans_ancre      la valeur concorde mais la pièce ne la montre à aucun endroit
--                   précis — elle ne peut pas être verte (TEST-01)

create table test_grid (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  procedure_code text not null default 'REV-SUBST',
  pack_id text not null,
  version integer not null default 1,
  columns jsonb not null,
  columns_hash text not null,
  frozen_at timestamptz not null default now(),
  unique (engagement_id, procedure_code, version),
  constraint test_grid_columns_not_empty check (jsonb_typeof(columns) = 'array' and jsonb_array_length(columns) > 0)
);
create index test_grid_eng_idx on test_grid(engagement_id);

create table test_cell (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  grid_id uuid not null references test_grid(id) on delete restrict,
  sample_item_id uuid not null references sample_item(id) on delete restrict,
  column_code text not null,
  expected text,
  found text,
  delta_signed numeric(18,4),
  delta_unit text check (delta_unit in ('cents','days','units','identite')),
  tolerance text not null,
  state text not null check (state in ('conforme','hors_tolerance','non_recevable','absent','sans_ancre')),
  evidence_id uuid references evidence(id),
  extraction_id uuid references extraction(id),
  page integer,
  rect jsonb,
  field_name text,
  engine_run_id uuid references engine_run(id),
  computed_at timestamptz not null default now(),
  unique (grid_id, sample_item_id, column_code),
  /* TEST-01 : pas de vert sans ancre. */
  constraint test_cell_green_needs_anchor check (
    state <> 'conforme' or (evidence_id is not null and page is not null and rect is not null)
  ),
  /* Une comparaison imprime TOUJOURS son delta signé. */
  constraint test_cell_compared_has_delta check (
    state not in ('conforme','hors_tolerance','sans_ancre') or delta_signed is not null
  ),
  /* Une ancre est entière : page ET rectangle ET pièce, ou rien. */
  constraint test_cell_anchor_is_whole check (
    (page is null and rect is null) or (page is not null and rect is not null and evidence_id is not null)
  )
);
create index test_cell_item_idx on test_cell(sample_item_id);
create index test_cell_eng_idx on test_cell(engagement_id);

create table cell_disposition (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  cell_id uuid not null references test_cell(id) on delete restrict,
  reason text not null,
  /* CE QUI A ÉTÉ DISPOSÉ : l'état et le delta de la cellule AU MOMENT de la
     décision. Une cellule recalculée depuis (autre état, autre delta) n'est
     plus couverte par cette disposition — sinon un écart de 5 € disposé
     couvrirait un écart de 50 000 € relu plus tard (revue hostile du jour). */
  state_at_decision text not null check (state_at_decision in ('hors_tolerance','absent','sans_ancre')),
  delta_at_decision numeric(18,4),
  decided_by uuid not null references app_user(id),
  decided_at timestamptz not null default now(),
  unique (cell_id),
  /* TEST-03 : une disposition porte un motif. */
  constraint cell_disposition_has_reason check (btrim(reason) <> '')
);
create index cell_disposition_eng_idx on cell_disposition(engagement_id);

create table test_line_conclusion (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  grid_id uuid not null references test_grid(id) on delete restrict,
  sample_item_id uuid not null references sample_item(id) on delete restrict,
  cells_hash text not null,
  concluded_by uuid not null references app_user(id),
  concluded_at timestamptz not null default now(),
  unique (sample_item_id)
);
create index test_line_conclusion_eng_idx on test_line_conclusion(engagement_id);

/* TEST-04 — une ligne sans cellule, ou dont une cellule est hors tolérance,
   absente ou sans ancre SANS disposition, ne se conclut pas. Les déclencheurs
   d'un même événement tirent dans l'ordre alphabétique de leur nom : l'IDENTITÉ
   (`_1_identity`) parle AVANT les cellules (`_2_cells`) — une preuve non
   recevable est le refus premier, pas une cellule à disposer. */
create or replace function assert_line_cells_disposed() returns trigger
language plpgsql as $$
declare
  c record;
  n integer;
begin
  select count(*) into n from test_cell where sample_item_id = new.sample_item_id and grid_id = new.grid_id;
  if n = 0 then
    raise exception 'TEST-04 : la ligne ne se conclut pas — aucune cellule calculée (lancez le calcul de la grille)';
  end if;
  select tc.column_code, tc.state into c
    from test_cell tc
   where tc.sample_item_id = new.sample_item_id and tc.grid_id = new.grid_id
     and tc.state in ('hors_tolerance','absent','sans_ancre')
     and not exists (select 1 from cell_disposition d
                      where d.cell_id = tc.id
                        and d.state_at_decision = tc.state
                        and d.delta_at_decision is not distinct from tc.delta_signed)
   order by tc.column_code limit 1;
  if found then
    raise exception 'TEST-04 : la ligne ne se conclut pas — la cellule « % » est % sans disposition écrite (ou disposée sur une autre valeur)', c.column_code, c.state;
  end if;
  return new;
end $$;
create trigger test_line_conclusion_2_cells before insert or update on test_line_conclusion
  for each row execute function assert_line_cells_disposed();

/* TEST-02 — l'identité, tirée en premier : un tiers ou un numéro de pièce qui
   diverge ne se dispose pas, il rend la preuve NON RECEVABLE. */
create or replace function assert_line_identity_holds() returns trigger
language plpgsql as $$
declare
  c record;
begin
  select tc.column_code into c
    from test_cell tc
   where tc.sample_item_id = new.sample_item_id and tc.grid_id = new.grid_id
     and tc.state = 'non_recevable'
   order by tc.column_code limit 1;
  if found then
    raise exception 'TEST-02 : la ligne ne se conclut pas — l’attribut d’identité « % » diverge, la preuve n’est pas recevable', c.column_code;
  end if;
  return new;
end $$;
create trigger test_line_conclusion_1_identity before insert or update on test_line_conclusion
  for each row execute function assert_line_identity_holds();

/* Les gardes de verrou (0003) : rien de tout cela ne s'écrit sur un dossier
   scellé — et le registre des verdicts (0042) le dit. */
create trigger test_grid_lock_guard before insert or update or delete on test_grid
  for each row execute function assert_engagement_unlocked();
create trigger test_cell_lock_guard before insert or update or delete on test_cell
  for each row execute function assert_engagement_unlocked();
create trigger cell_disposition_lock_guard before insert or update or delete on cell_disposition
  for each row execute function assert_engagement_unlocked();
create trigger test_line_conclusion_lock_guard before insert or update or delete on test_line_conclusion
  for each row execute function assert_engagement_unlocked();

insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('test_grid',            'garde', 'la grille figée du test de détail est du contenu du dossier'),
  ('test_cell',            'garde', 'les cellules comparées, ancrées sur la pièce, sont du contenu du dossier'),
  ('cell_disposition',     'garde', 'une décision humaine sur une cellule est du contenu du dossier'),
  ('test_line_conclusion', 'garde', 'la conclusion d’une ligne est du contenu du dossier');

do $$ begin
  execute 'alter table test_grid enable row level security';
  execute 'create policy test_grid_eng on test_grid using (engagement_id in (select otto_engagements()))';
  execute 'alter table test_grid force row level security';
  execute 'alter table test_cell enable row level security';
  execute 'create policy test_cell_eng on test_cell using (engagement_id in (select otto_engagements()))';
  execute 'alter table test_cell force row level security';
  execute 'alter table cell_disposition enable row level security';
  execute 'create policy cell_disposition_eng on cell_disposition using (engagement_id in (select otto_engagements()))';
  execute 'alter table cell_disposition force row level security';
  execute 'alter table test_line_conclusion enable row level security';
  execute 'create policy test_line_conclusion_eng on test_line_conclusion using (engagement_id in (select otto_engagements()))';
  execute 'alter table test_line_conclusion force row level security';
end $$;
