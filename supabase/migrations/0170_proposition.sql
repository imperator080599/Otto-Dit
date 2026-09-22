-- 0170 — P1-01 (AUD-01, docs/MANDATS/2026-09-20_plan_maitre_phase2.md §426-433). La table
-- `proposition` : le mécanisme GÉNÉRIQUE derrière « un seul motif pour toute proposition »
-- (P3-01 le rendra à l'écran plus tard — Phase 1 ne touche aucun écran).
--
-- CE QUE CETTE MIGRATION FAIT, DANS L'ORDRE :
--   1. crée la table, son verrou (dossier scellé), sa RLS (même patron que 0158) ;
--   2. fige `valeur_proposee` après création (un fait historique, jamais réédité — même
--      doctrine que règle 26, appliquée ici à une ligne plutôt qu'à un fichier de migration) ;
--   3. BACKFILLE les quatre familles qui existent déjà dans `notifications.ts` — materiality
--      proposed, deficiency proposed, walkthrough gap candidate, extraction pending_verify —
--      par de l'INSERT...SELECT idempotent, PAS un script `.ts` séparé (`0170b` au sens du
--      plan) : `migrate()` (P1-00) applique déjà ce fichier une seule fois, par transaction,
--      exactement la garantie qu'un exécuteur de backfill séparé aurait dû reconstruire depuis
--      zéro. Le plan nommait un fichier `.ts` ; ce choix documente pourquoi le SQL suffit ici
--      et ne construit pas une architecture neuve pour un besoin qu'elle ne justifie pas
--      (règle CLAUDE.md générale : pas d'abstraction au-delà de ce que la tâche exige).
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 13) : elle ne crée la `review_note` explicative
-- d'aucune proposition (`review_note.author_id` est NOT NULL et aucune ligne « OTTO » n'existe
-- à ce niveau — vérifié en lisant le schéma, jamais supposé ; P3-02 construira cette capacité).
-- Elle ne branche que QUATRE des treize `object_type` du catalogue (propositions/types.ts) ;
-- les neuf autres sont acceptés par la colonne mais leur applicateur n'existe pas encore
-- (PROP-03, R136).

create table proposition (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  object_type text not null check (object_type in (
    'materiality', 'fsli_analytique', 'extraction_field', 'assertion_risk', 'deficiency',
    'walkthrough_gap', 'transcript_gap', 'process_step', 'wp_extra_cell', 'scoping',
    'carry_forward', 'risk_factor', 'fs_tie'
  )),
  object_id uuid not null,
  field text,
  valeur_proposee jsonb not null default '{}'::jsonb,
  valeur_retenue jsonb,
  status text not null default 'proposee'
    check (status in ('proposee', 'acceptee', 'modifiee', 'refusee', 'perimee')),
  ai_run_id uuid references ai_run(id),
  review_note_id uuid references review_note(id),
  motif text,
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint proposition_decision_is_whole check (
    (status = 'proposee' and decided_by is null and decided_at is null)
    or (status = 'perimee' and decided_by is null and decided_at is null)
    or (status in ('acceptee', 'modifiee', 'refusee') and decided_by is not null and decided_at is not null)
  )
);

create index idx_proposition_engagement on proposition(engagement_id);
create index idx_proposition_objet on proposition(object_type, object_id);

-- PROP-01 est tenu par cet index autant que par le service : deux lignes « proposee » pour le
-- même (type, objet, champ) sont un état incohérent que la base elle-même refuse, pas seulement
-- une fonction TypeScript qu'un chemin oublié pourrait contourner.
create unique index uq_proposition_en_attente
  on proposition(object_type, object_id, coalesce(field, ''))
  where status = 'proposee';

create or replace function proposition_valeur_figee() returns trigger
language plpgsql as $$
begin
  if new.valeur_proposee is distinct from old.valeur_proposee then
    raise exception 'proposition.valeur_proposee ne s''édite jamais après création — la valeur que l''IA a proposée est un fait historique (OTTO audit-trail rule)';
  end if;
  return new;
end $$;

create trigger proposition_valeur_figee before update on proposition
  for each row execute function proposition_valeur_figee();

create trigger proposition_lock_guard before insert or update or delete on proposition
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('proposition', 'garde', 'une proposition (IA ou moteur) en attente ou statuée est du contenu du dossier — même patron que control_walkthrough_gap (0158)');

do $$
begin
  execute 'alter table proposition enable row level security';
  execute 'alter table proposition force row level security';
  execute 'create policy proposition_eng on proposition using (engagement_id in (select otto_engagements()))';
end $$;

-- ===== backfill (idempotent : chaque insert exclut ce qui existe déjà) =====

insert into proposition (engagement_id, object_type, object_id, valeur_proposee, ai_run_id, created_at)
select m.engagement_id, 'materiality', m.id,
       jsonb_build_object('benchmarkCode', m.benchmark_code, 'pct', m.pct),
       m.proposed_by_ai_run,
       coalesce(ar.created_at, ev.created_at, now())
from materiality m
left join ai_run ar on ar.id = m.proposed_by_ai_run
left join event_log ev on ev.object_type = 'materiality' and ev.object_id = m.id::text and ev.verb = 'materiality_proposed'
where m.status = 'proposed'
  and not exists (select 1 from proposition p where p.object_type = 'materiality' and p.object_id = m.id);

insert into proposition (engagement_id, object_type, object_id, valeur_proposee, ai_run_id, created_at)
select d.engagement_id, 'deficiency', d.id,
       jsonb_build_object('severity', d.severity_proposed),
       null,
       d.created_at
from deficiency d
where d.status = 'proposed'
  and not exists (select 1 from proposition p where p.object_type = 'deficiency' and p.object_id = d.id);

insert into proposition (engagement_id, object_type, object_id, valeur_proposee, ai_run_id, created_at)
select g.engagement_id, 'walkthrough_gap', g.id,
       jsonb_build_object('kind', g.kind, 'citation', g.citation, 'description', g.description),
       g.ai_run_id,
       coalesce(ar.created_at, now())
from control_walkthrough_gap g
left join ai_run ar on ar.id = g.ai_run_id
where g.status = 'candidate'
  and not exists (select 1 from proposition p where p.object_type = 'walkthrough_gap' and p.object_id = g.id);

insert into proposition (engagement_id, object_type, object_id, valeur_proposee, ai_run_id, created_at)
select v.engagement_id, 'extraction_field', x.id,
       jsonb_build_object('fields', x.fields),
       x.ai_run_id,
       x.created_at
from extraction x
join evidence v on v.id = x.evidence_id
where x.status = 'pending_verify'
  and not exists (select 1 from proposition p where p.object_type = 'extraction_field' and p.object_id = x.id);
