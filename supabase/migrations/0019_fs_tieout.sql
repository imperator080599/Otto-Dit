-- 0019_fs_tieout : le POINTAGE DES ÉTATS FINANCIERS (point 9).
--
-- CE QUI MANQUAIT, ET C'EST L'AUTRE BOUT DE L'ARC. Tous les travaux du dossier
-- servent à conclure sur des ÉTATS FINANCIERS — et rien, dans l'application, ne
-- rattachait un chiffre de la plaquette à ce qui le fonde. Un dossier qui teste
-- le chiffre d'affaires sans pointer la ligne « Chiffre d'affaires » du compte
-- de résultat conclut sur quelque chose qu'il n'a jamais regardé.
--
-- TROIS NATURES DE RAPPROCHEMENT, ET ELLES NE SE VALENT PAS.
--
--   1. SOLDE DE BALANCE — la ligne EST un compte. Le rapprochement se calcule,
--      il ne se déclare pas.
--   2. AGRÉGAT DE COMPTES — la ligne est une somme de comptes. Idem : c'est le
--      moteur qui additionne, et l'écart se voit tout seul.
--   3. CALCUL À DOCUMENTER — la ligne ne vient d'aucun compte : un résultat par
--      action, un effectif moyen, une variation retraitée. AUCUNE somme ne la
--      reproduit, donc le seul pointage possible est une EXPLICATION ÉCRITE
--      avec la pièce qui la porte.
--
-- LA RÈGLE QUI REFUSE : une ligne de nature « calcul à documenter » ne se pointe
-- pas sans explication ET sans pièce liée. C'est la même famille que la
-- résolution probante d'un écart (migration 0009) : ce qui ne se calcule pas se
-- justifie, et une justification sans pièce n'est pas une justification.

create table fs_line (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  -- où la ligne figure : compte de résultat, bilan actif/passif, annexe
  statement text not null check (statement in ('IS', 'BS_ASSET', 'BS_LIAB', 'NOTES')),
  -- la référence de la ligne dans la plaquette, telle qu'elle y est imprimée
  ref text not null,
  label text not null check (btrim(label) <> ''),
  -- le montant TEL QU'IL EST PRÉSENTÉ. C'est le chiffre à pointer, pas le nôtre.
  presented numeric(18,2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (engagement_id, statement, ref)
);

comment on column fs_line.presented is
  'Le montant tel qu''il figure dans la plaquette du client. C''est LUI qu''on pointe : recalculer et comparer à son propre calcul ne pointe rien.';

create table fs_tie (
  id uuid primary key default gen_random_uuid(),
  fs_line_id uuid not null references fs_line(id) on delete restrict unique,
  nature text not null check (nature in ('solde_balance', 'agregat_comptes', 'calcul_documente')),
  -- pour les deux premières natures : les comptes qui fondent la ligne
  accounts text[] not null default '{}',
  -- ce que le moteur trouve, quand il peut calculer
  computed numeric(18,2),
  -- l'écart, dérivé — jamais saisi
  difference numeric(18,2),
  status text not null default 'open' check (status in ('open', 'tied', 'difference', 'documented')),
  -- pour « calcul à documenter » : l'explication et la pièce
  explanation text,
  evidence_id uuid references evidence(id),
  tied_by uuid references app_user(id),
  tied_at timestamptz,
  created_at timestamptz not null default now(),

  -- UN CALCUL À DOCUMENTER NE SE POINTE PAS SUR UNE PHRASE. Explication ET
  -- pièce, ou la ligne reste ouverte. Sans pièce, « pointé » ne veut rien dire.
  constraint documented_needs_explanation_and_evidence check (
    nature <> 'calcul_documente' or status <> 'documented'
    or (btrim(coalesce(explanation, '')) <> '' and evidence_id is not null and tied_by is not null)
  ),
  -- Les deux natures calculées ne se déclarent PAS « pointées » à la main :
  -- il faut que le moteur ait calculé quelque chose.
  constraint computed_natures_need_a_computation check (
    nature = 'calcul_documente' or status = 'open' or computed is not null
  ),
  -- Un écart accepté sans un mot est indistinguable d'un oubli.
  constraint difference_needs_explanation check (
    status <> 'difference' or btrim(coalesce(explanation, '')) <> ''
  )
);

comment on table fs_tie is
  'Le pointage d''une ligne des états financiers. Trois natures : deux se calculent, une se justifie — et celle qui se justifie exige une pièce, parce qu''une justification sans pièce n''est pas une justification.';

alter table fs_line enable row level security;
create policy fs_line_eng on fs_line using (engagement_id in (select otto_engagements()));
alter table fs_tie enable row level security;
create policy fs_tie_eng on fs_tie
  using (fs_line_id in (select id from fs_line where engagement_id in (select otto_engagements())));
