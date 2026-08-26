-- 0020_completion : L'ACHÈVEMENT (point 10).
--
-- CE QUI MANQUAIT. Le dossier savait tester, évaluer, documenter et viser —
-- mais pas ACHEVER. Or les travaux d'achèvement sont ceux qu'un inspecteur
-- regarde en premier quand une faillite survient trois mois après le rapport :
-- événements postérieurs, continuité d'exploitation, anomalies non corrigées
-- et leur incidence sur l'opinion, lettre d'affirmation, communication à la
-- gouvernance.
--
-- CE NE SONT PAS DES CASES À COCHER. Chaque nature porte une règle qui REFUSE,
-- et ces règles sont des dates ou des montants — donc déterministes, donc
-- vérifiables, donc pas des rappels.

create table completion_item (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  nature text not null check (nature in (
    'evenements_posterieurs',   -- la période couverte doit ALLER JUSQU'À la date du rapport
    'continuite',               -- indicateurs, appréciation de la direction, conclusion
    'anomalies_non_corrigees',  -- le cumul, et son incidence sur l'opinion
    'lettre_affirmation',       -- datée du jour du rapport ou après, jamais avant
    'gouvernance'               -- ce qui a été communiqué, et à qui
  )),
  status text not null default 'open' check (status in ('open', 'done', 'na')),
  -- La substance : ce qui a été fait, trouvé, conclu. Une case cochée sans
  -- texte ne dit rien à qui relit le dossier dans trois ans.
  findings text not null default '',
  conclusion text not null default '',
  -- Les dates qui portent les règles ci-dessous.
  covered_through date,     -- événements postérieurs : jusqu'à quand les travaux vont
  signed_on date,           -- lettre d'affirmation : la date qu'elle porte
  evidence_id uuid references evidence(id),
  done_by uuid references app_user(id),
  done_at timestamptz,
  -- « sans objet » se motive : un travail écarté sans motif est indistinguable
  -- d'un travail oublié.
  na_reason text,
  created_at timestamptz not null default now(),
  unique (engagement_id, nature),

  constraint done_needs_substance check (
    status <> 'done' or (btrim(conclusion) <> '' and done_by is not null and done_at is not null)
  ),
  constraint na_needs_a_written_reason check (
    status <> 'na' or (btrim(coalesce(na_reason, '')) <> '' and done_by is not null)
  ),
  -- La lettre d'affirmation ne se clôt pas sans la pièce : c'est une lettre,
  -- pas une conversation.
  constraint representation_letter_needs_the_letter check (
    nature <> 'lettre_affirmation' or status <> 'done'
    or (evidence_id is not null and signed_on is not null)
  ),
  -- Les événements postérieurs ne se clôturent pas sans dire jusqu'à QUAND.
  constraint subsequent_events_need_a_period check (
    nature <> 'evenements_posterieurs' or status <> 'done' or covered_through is not null
  )
);

comment on table completion_item is
  'Les travaux d''achèvement. Chaque nature porte une règle qui refuse, et ces règles sont des dates ou des montants — donc déterministes, donc pas des rappels.';
comment on column completion_item.covered_through is
  'Jusqu''à quelle date les travaux sur les événements postérieurs vont. Si elle est antérieure à la date du rapport, il y a un TROU, et le trou se nomme.';
comment on column completion_item.signed_on is
  'La date que porte la lettre d''affirmation. Une lettre datée AVANT la date du rapport ne couvre pas la période auditée : c''est un défaut, pas un détail.';

alter table completion_item enable row level security;
create policy completion_item_eng on completion_item
  using (engagement_id in (select otto_engagements()));
