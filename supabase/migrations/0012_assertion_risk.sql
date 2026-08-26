-- 0012_assertion_risk: le risque par assertion, et le fait qu'il COMMANDE.
--
-- C'est le chaînon qui manquait entre le scoping et les travaux. Sans lui, le
-- risque est une appréciation qu'on écrit puis qu'on oublie : il décore. Ici il
-- décide — de la LISTE des procédures requises et de la TAILLE des sondages,
-- assertion par assertion.
--
-- Trois principes portés par le schéma :
--
--   1. LE CALCUL ET LA DÉCISION SONT DEUX COLONNES. `computed_level` est
--      re-dérivé à chaque évaluation (il suit donc la matérialité, les données
--      importées, les facteurs) ; `retained_level` est la décision humaine.
--      Les confondre ferait disparaître l'arbitrage au premier ré-import.
--
--   2. UNE SURCHARGE SANS MOTIF N'EST PAS UNE SURCHARGE. Contrainte, pas
--      convention : descendre un risque sans écrire pourquoi est exactement le
--      geste qu'un dossier doit rendre impossible.
--
--   3. LES FACTEURS OBSERVÉS NE SE SAISISSENT PAS. Ils sont calculés par les
--      prédicats nommés dans methodology/risque.json et rangés ici avec LEUR
--      PREUVE en toutes lettres, pour qu'on puisse relire « pourquoi ce niveau »
--      six mois plus tard sans rejouer le calcul.

create table fsli_assertion_risk (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  fsli_code text not null,
  assertion text not null check (assertion in
    ('realite','exhaustivite','mesure','evaluation','separation','droits','presentation')),
  -- ce que la règle a calculé, re-dérivé à chaque évaluation
  computed_level text not null,
  factor_count int not null default 0,
  -- la décision humaine, quand elle diverge du calcul
  retained_level text,
  override_reason text,
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  -- version de la méthode qui a produit le calcul : un niveau se relit avec la
  -- règle qui l'a produit, pas avec celle d'aujourd'hui
  methodology_version text not null,
  computed_at timestamptz not null default now(),
  unique (engagement_id, fsli_code, assertion),
  constraint override_needs_a_written_reason check (
    retained_level is null
    or retained_level = computed_level
    or (btrim(coalesce(override_reason, '')) <> '' and decided_by is not null and decided_at is not null)
  )
);
create index fsli_assertion_risk_by_fsli on fsli_assertion_risk (engagement_id, fsli_code);

comment on column fsli_assertion_risk.computed_level is
  'Re-dérivé à chaque évaluation : il suit la matérialité et les données. Jamais saisi.';
comment on column fsli_assertion_risk.retained_level is
  'La décision humaine. Null = on retient le calcul. Différent du calcul = surcharge, et le motif est alors obligatoire.';

-- Les facteurs OBSERVÉS, avec leur preuve. Re-dérivés à chaque évaluation :
-- ils ne portent aucune décision, donc les remplacer ne perd rien.
create table risk_factor_observed (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  fsli_code text not null,
  assertion text not null,
  factor_code text not null,
  label text not null,
  -- ce que le prédicat a MESURÉ, en toutes lettres : « 1 254 écritures », pas « vrai »
  evidence text not null,
  predicate text not null,
  computed_at timestamptz not null default now(),
  unique (engagement_id, fsli_code, assertion, factor_code)
);

do $$
declare t text;
begin
  foreach t in array array['fsli_assertion_risk','risk_factor_observed'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;
end $$;
