-- 0130 — LA REVUE ANALYTIQUE DU POSTE (mandat de la soirée, §2.2).
--
-- CE QUI MANQUAIT. La page de poste montrait une leadsheet à un seul solde, et
-- aucun endroit où l'auditeur ÉCRIT ce qu'il conclut de la variation N/N-1. Un
-- cabinet tient cela sous la leadsheet, en une rédaction datée, signée, que le
-- réviseur relit — et c'est le MÊME texte que la section « revue analytique »
-- du dossier, pas une copie qui divergerait.
--
-- UN OBJET, VERSIONNÉ, JAMAIS RÉÉCRIT. Chaque enregistrement est une VERSION
-- nouvelle : la précédente reste lisible (« qu'avait-on écrit avant que les
-- soldes ne changent ? » est une question d'inspection). Le texte porte
-- l'EMPREINTE DES SOLDES sur lesquels il a été rédigé : quand la balance est
-- ré-importée et que les chiffres bougent, la lecture le MARQUE périmé — elle
-- ne l'efface pas, ne l'invalide pas en silence, elle le nomme et le donne à
-- re-statuer (règle du recalcul, §0.3).
--
-- L'ORIGINE EST DITE. « humaine » : rédigée par la personne. « proposee_validee » :
-- proposée par le moteur (déterministe, d'après les chiffres — P4, aucun modèle
-- de langage) puis VALIDÉE par un humain qui l'a enregistrée telle quelle ou
-- corrigée (plafond L2). Une origine « proposée » sans le run qui l'a produite
-- est refusée : une proposition sans provenance est une phrase inventée.
--
-- LES TROIS REFUS, chacun tenu par UN objet SQL (registre des gardes) :
--   ANA-01  un texte vide n'est pas une revue analytique   (contrainte fsli_analytique_text_not_empty)
--   ANA-02  une rédaction « proposée puis validée » cite son run (contrainte fsli_analytique_proposal_has_run)
--   ANA-03  une version ne se modifie ni ne s'efface — on en écrit une nouvelle
--           (déclencheur fsli_analytique_append_only)

create table fsli_analytique (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  fsli_code text not null,
  version integer not null,
  text text not null,
  origine text not null check (origine in ('humaine','proposee_validee')),
  engine_run_id uuid references engine_run(id),
  /* L'empreinte des soldes (compte, N, N-1) au moment de la rédaction. */
  soldes_hash text not null,
  author_id uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  unique (engagement_id, fsli_code, version),
  constraint fsli_analytique_text_not_empty check (btrim(text) <> ''),
  constraint fsli_analytique_proposal_has_run check (origine <> 'proposee_validee' or engine_run_id is not null)
);
create index fsli_analytique_eng_idx on fsli_analytique(engagement_id, fsli_code);

create or replace function refuse_change_fsli_analytique() returns trigger language plpgsql as $$
begin
  raise exception 'ANA-03 : une version de revue analytique ne se modifie ni ne s’efface — on en écrit une nouvelle (fsli_analytique_append_only)';
end $$;
create trigger fsli_analytique_append_only before update or delete on fsli_analytique
  for each row execute function refuse_change_fsli_analytique();

/* La garde de verrou (0003) et son verdict (0042) : la revue analytique est du
   contenu du dossier, rien ne s'y écrit après le scellé. */
create trigger fsli_analytique_lock_guard before insert or update or delete on fsli_analytique
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('fsli_analytique', 'garde', 'la revue analytique rédigée sur un poste est du contenu du dossier');

do $$ begin
  execute 'alter table fsli_analytique enable row level security';
  execute 'create policy fsli_analytique_eng on fsli_analytique using (engagement_id in (select otto_engagements()))';
  execute 'alter table fsli_analytique force row level security';
end $$;
