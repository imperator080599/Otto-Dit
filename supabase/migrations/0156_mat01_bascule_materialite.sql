-- MANDAT DU 2026-09-09 (docs/MANDATS/2026-09-09_mandat_reponses_fondateur.md), §2.1 —
-- « Un drapeau automatique sur les comptes passés de non matériels à matériels, dont l'objet est
-- explicite : voir si on a loupé du testing. Il nomme le compte, la date de bascule, l'import qui
-- l'a causée, et ce qui n'a pas été testé pendant qu'il était réputé non matériel. »
--
-- « COMPTE » = POSTE (FSLI), pas un compte du grand livre. Le §2.2 du même mandat le confirme dans
-- la même phrase de commande : « si un import rend un FSLI matériel, sa section... » — le grain de
-- toute la mécanique de bascule est le FSLI, jamais le compte individuel. `fsli_code` est donc la
-- clé, pas un `account.number`.
--
-- LE DÉCLENCHEUR N'EST PAS « le champ fsli.scoping a changé » — un piège trouvé en lisant
-- `proposeScoping` (fsli.ts) AVANT d'écrire cette migration : cette fonction ne touche JAMAIS un
-- FSLI dont `confirmed_by` est posé (D9 — une décision humaine ne s'écrase jamais). Un FSLI confirmé
-- NON MATÉRIEL l'an dernier, dont le solde dépasse la matérialité de performance CETTE ANNÉE après
-- un nouvel import, ne verra donc JAMAIS son `scoping` changer tout seul — et c'est exactement le
-- cas que ce drapeau existe pour attraper (« on a loupé du testing » se dit surtout de CE cas-là,
-- pas du cas système qui se corrige déjà lui-même). Le service qui détecte la bascule
-- (`detecterBasculesMaterialite`, fsli.ts) compare donc le SOLDE COURANT à la matérialité de
-- performance VALIDÉE, pour tout FSLI dont le `scoping` actuel reste non matériel
-- (unscoped/ns_proposed/ns_confirmed) — jamais seulement les FSLI que `proposeScoping` vient de
-- toucher.
--
-- UNE FOIS POSÉE, LA LIGNE NE SE RETIRE JAMAIS (règle 28 : rien produit par l'agent n'est supprimé
-- par le système) — `unique (engagement_id, fsli_code)` : le PREMIER import qui fait apparaître la
-- bascule gagne, un ré-import ne la reflague pas une seconde fois. C'est un DOSSIER PERMANENT
-- (« ce jour-là, ce poste a basculé ») : sa présence est ce que `MAT-01`/`MAT-02` (tranche
-- suivante) liront pour savoir quel FSLI exige une section ouverte et une demande de détail avant
-- le visa — jamais le champ `fsli.scoping` lui-même, qui peut rester intact indéfiniment pour un
-- FSLI confirmé.
--
-- `engagement_id` DÉNORMALISÉ pour la MÊME raison que toutes les tables neuves depuis l'incident
-- 0153/0154 : `assert_engagement_unlocked()` lit `NEW.engagement_id` littéralement ; garde de
-- verrou et RLS posés DANS CETTE MÊME migration, jamais en correctif après coup.
create table fsli_materiality_bascule (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  fsli_code text not null,
  import_file_id uuid not null references import_file(id),
  scoping_avant text not null check (scoping_avant in ('unscoped', 'ns_proposed', 'ns_confirmed')),
  solde numeric not null,
  seuil_performance numeric not null,
  detectee_le timestamptz not null default now(),
  unique (engagement_id, fsli_code)
);

create index fsli_materiality_bascule_engagement_idx on fsli_materiality_bascule (engagement_id);

create trigger fsli_materiality_bascule_lock_guard before insert or update or delete on fsli_materiality_bascule
  for each row execute function assert_engagement_unlocked();
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('fsli_materiality_bascule', 'garde', 'le drapeau de bascule de matérialité (mandat §2.1) est un fait constaté sur le dossier, jamais rédigé à la main après clôture');

do $$ begin
  execute 'alter table fsli_materiality_bascule enable row level security';
  execute 'create policy fsli_materiality_bascule_eng on fsli_materiality_bascule using (engagement_id in (select otto_engagements()))';
  execute 'alter table fsli_materiality_bascule force row level security';
end $$;
