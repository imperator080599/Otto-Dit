-- 0018_carry_forward : la reprise du dossier précédent — PROPOSÉE, jamais reprise en silence.
--
-- CE QUI MANQUAIT, ET POURQUOI CE N'EST PAS UNE COMMODITÉ. Un dossier de
-- deuxième année ne repart pas de zéro : le périmètre, les facteurs de risque,
-- les réponses au questionnaire, les décisions de non-significativité de l'an
-- dernier sont le point de départ du raisonnement de cette année. Les
-- ressaisir, c'est perdre une journée ; les reprendre AUTOMATIQUEMENT, c'est
-- pire — c'est signer cette année une conclusion qu'on n'a pas reprise.
--
-- LA RÈGLE : rien n'est repris automatiquement. Tout arrive PROPOSÉ, avec sa
-- source, et une proposition non statuée est un OBSTACLE AU VISA. On ne
-- reprend pas des chiffres, on reprend des CONCLUSIONS — et une conclusion se
-- reconfirme ou s'écarte, elle ne se recopie pas.

create table carry_forward (
  id uuid primary key default gen_random_uuid(),
  -- la mission de CETTE année
  engagement_id uuid not null references engagement(id) on delete restrict,
  -- la mission d'OÙ ça vient : c'est ce qui rend la reprise relisible
  source_engagement_id uuid not null references engagement(id) on delete restrict,
  -- la nature de ce qui est repris
  kind text not null check (kind in (
    'scoping',              -- une décision de périmètre (retenu, non significatif, qualitatif)
    'risk_factor',          -- un facteur de risque déclaré et confirmé
    'question_answer',      -- une réponse au questionnaire résiduel
    'workpaper'             -- un papier de travail signé, à reconfirmer ou refaire
  )),
  -- l'objet source, dans SA table
  source_ref text not null,
  -- ce que la proposition dit, en toutes lettres : un identifiant ne se relit pas
  label text not null check (btrim(label) <> ''),
  detail text not null default '',
  -- la charge utile, pour que la reprise puisse s'appliquer sans re-interroger N-1
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'reconfirmed', 'dismissed')),
  -- La DÉCISION humaine. Reconfirmer sans motif est permis — reconfirmer, c'est
  -- dire « j'ai regardé et c'est toujours vrai ». ÉCARTER sans motif ne l'est
  -- pas : sans motif, un écart est indistinguable d'un oubli.
  decision_reason text,
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (engagement_id, kind, source_ref),
  constraint dismissal_needs_a_written_reason check (
    status <> 'dismissed' or (btrim(coalesce(decision_reason, '')) <> '' and decided_by is not null)
  ),
  constraint decision_needs_an_author check (
    status = 'proposed' or decided_by is not null
  )
);
create index carry_forward_by_engagement on carry_forward (engagement_id, status);

comment on table carry_forward is
  'Ce que le dossier N-1 propose au dossier N. Rien n''est repris automatiquement : tout arrive proposé, et une proposition non statuée est un obstacle au visa. On ne reprend pas des chiffres, on reprend des conclusions.';
comment on column carry_forward.source_engagement_id is
  'La mission d''où vient la proposition. Sans elle, une reprise est une affirmation sans source.';

alter table carry_forward enable row level security;
create policy carry_forward_eng on carry_forward
  using (engagement_id in (select otto_engagements()));
