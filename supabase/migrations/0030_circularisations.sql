-- 0030 — LES CIRCULARISATIONS (point 3 : banques et avocats).
--
-- Ce que le fondateur décrit (docs/00, deux paragraphes) tient en une
-- mécanique, et cette mécanique est DÉTERMINISTE de bout en bout — aucun
-- modèle n'y est nécessaire (P4) :
--   1. le client fournit un LISTING (banques ou avocats) : nom, contact,
--      référence de compte ou de dossier — importé comme pièce ;
--   2. la COMPLÉTUDE se dérive : les comptes du grand livre rattachés au poste
--      (trésorerie, provisions — par le pack, jamais par un préfixe français
--      écrit en dur) que le listing ne couvre PAS, et les lignes du listing
--      qu'aucun compte ne porte. Les deux sens comptent : un compte oublié au
--      listing est le défaut classique, une ligne sans compte l'est aussi ;
--   3. la DEMANDE part à chaque tiers, à la date de clôture, avec les copies
--      calculées — envoi SIMULÉ derrière l'adaptateur existant (ADR-101), et
--      jamais sans approbation humaine (L2) ;
--   4. la RÉPONSE se dépose comme pièce ; le montant confirmé (banque) ou les
--      litiges et provisions (avocat) sont saisis depuis la pièce ;
--   5. le RAPPROCHEMENT est DÉRIVÉ à la lecture — jamais stocké : solde
--      confirmé contre solde comptable, provisions confirmées contre compte de
--      provisions. Tout écart bancaire, si petit soit-il, se DIT ; côté
--      avocats, le seuil de signification insignifiant (CTT) du dossier
--      décide de ce qui remonte.
--
-- Ce qui n'est PAS ici, et pourquoi : aucun statut « rapproché » n'est écrit
-- en base. Un statut recopié diverge de son calcul le jour où l'un des deux
-- change (statuts dérivés, ADR-084) — le seul état stocké est ce qu'un humain
-- a FAIT : listing importé, demande envoyée, réponse déposée et saisie.

create table confirmation_campaign (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  kind text not null check (kind in ('banque','avocat')),
  as_of date not null,
  listing_evidence_id uuid references evidence(id),
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now(),
  unique (engagement_id, kind)
);

create table confirmation_party (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references confirmation_campaign(id) on delete restrict,
  nom text not null,
  email text not null,
  /** La référence chez le tiers : n° de compte bancaire, référence de dossier. */
  reference text not null,
  /** Le compte du grand livre annoncé par le client (peut n'exister nulle part
      — c'est justement l'un des deux constats de complétude). */
  compte text,
  sent_at timestamptz,
  sent_by uuid references app_user(id),
  received_at timestamptz,
  evidence_id uuid references evidence(id),
  /** Banque : le solde confirmé, lu SUR la réponse par un humain. */
  montant_confirme numeric(18,2),
  /** Avocat : les litiges déclarés, un objet par litige. */
  litiges jsonb,
  saisi_par uuid references app_user(id),
  /** L'écart ne se clôt pas tout seul : il se JUSTIFIE par écrit, et c'est
      cette phrase qui lève l'obstacle au visa — jamais le fait de l'avoir vu. */
  explication text,
  explique_par uuid references app_user(id),
  explique_le timestamptz,
  unique (campaign_id, reference)
);

create index idx_conf_campaign_eng on confirmation_campaign(engagement_id);
create index idx_conf_party_campaign on confirmation_party(campaign_id);

-- RLS : la campagne par sa mission, le tiers par sa campagne (0029, familles 2 et 3).
do $$
begin
  execute 'alter table confirmation_campaign enable row level security';
  execute 'create policy confirmation_campaign_eng on confirmation_campaign
             using (engagement_id in (select otto_engagements()))';
  execute 'alter table confirmation_party enable row level security';
  execute 'create policy confirmation_party_eng on confirmation_party using (exists (
             select 1 from confirmation_campaign c
             where c.id = confirmation_party.campaign_id
               and c.engagement_id in (select otto_engagements())))';
end $$;
