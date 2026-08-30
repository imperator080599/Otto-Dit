-- ADR-099 : LA COLONNE AJOUTÉE AU TABLEAU DE TESTING, REMPLIE PAR OTTO.
-- Le nom de colonne est du TEXTE LIBRE : « BL signé ? », « date livraison »,
-- « qté livrée ». S'il devine mal et remplit quand même, une donnée fausse
-- entre dans un papier de travail — le pire défaut possible de ce produit.
-- Donc l'interprétation est un ÉTAT : proposée → confirmée par un humain →
-- remplie ; rien ne se cherche avant la confirmation, et chaque cellule a
-- DEUX issues, jamais une seule : trouvée dans une pièce reçue, ou
-- introuvable — et alors une demande de clarification se PROPOSE au lieu de
-- laisser la case vide sans rien dire.
--
-- La colonne suit le CODE du papier, pas son uuid : elle survit aux versions
-- successives (même identité métier que les ancres de notes, ADR-097).
-- Une colonne ne se supprime pas : elle s'annule, et l'annulation se voit —
-- un modèle standard modifié puis « dé-modifié » en silence serait un trou
-- dans la piste.

create table wp_extra_column (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  workpaper_code text not null,
  titre text not null,
  -- modèle standard modifié → justification OBLIGATOIRE (règle existante)
  justification text not null,
  -- {champ, doc_type, phrase} — la proposition d'OTTO, à confirmer
  interpretation jsonb,
  statut text not null default 'proposee'
    check (statut in ('proposee','confirmee','en_cours','remplie','annulee')),
  cout_usd numeric(10,6) not null default 0,
  ai_run_id uuid,
  created_by uuid not null references app_user(id),
  confirmed_by uuid references app_user(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index wp_extra_column_eng_idx on wp_extra_column(engagement_id, workpaper_code);

create table wp_extra_cell (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references wp_extra_column(id) on delete restrict,
  engagement_id uuid not null references engagement(id) on delete restrict,
  sample_item_id uuid not null references sample_item(id) on delete restrict,
  outcome text not null check (outcome in ('trouvee','introuvable')),
  valeur text,
  evidence_id uuid references evidence(id),
  extraction_id uuid references extraction(id),
  -- hérite de la vérification de l'extraction : un échelon déterministe est
  -- un fait, un échelon OCR/LLM attend l'attestation humaine (ADR-012)
  verifie boolean not null default false,
  clarification_request_item_id uuid references request_item(id),
  created_at timestamptz not null default now(),
  unique (column_id, sample_item_id),
  -- DEUX ISSUES, JAMAIS UNE SEULE — et jamais une valeur sans sa pièce :
  -- une « trouvée » sans evidence_id serait un chiffre sans provenance (P7).
  constraint wp_extra_cell_outcome_coherent check (
    (outcome = 'trouvee' and valeur is not null and evidence_id is not null)
    or (outcome = 'introuvable' and valeur is null and evidence_id is null)
  )
);
create index wp_extra_cell_col_idx on wp_extra_cell(column_id);

create trigger wp_extra_column_lock_guard
  before insert or update or delete on wp_extra_column
  for each row execute function assert_engagement_unlocked();
create trigger wp_extra_cell_lock_guard
  before insert or update or delete on wp_extra_cell
  for each row execute function assert_engagement_unlocked();

do $$
declare t text;
begin
  foreach t in array array['wp_extra_column','wp_extra_cell'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;
end $$;
