-- 0013_residual_questionnaire: le qualitatif, et la circulation des constatations.
--
-- POURQUOI CETTE MIGRATION EXISTE. Après 0012, l'évaluation du risque de
-- l'application était à 100 % QUANTITATIVE : cinq facteurs calculés sur des
-- écritures, et rien d'autre. Un changement de dirigeant, une pression sur le
-- résultat, un litige non provisionné, une migration de système : rien de tout
-- cela n'est dans un grand livre, et rien de tout cela n'entrait dans le
-- risque. Une évaluation qui ne voit que ce qui se compte ne voit pas ce qui
-- compte.
--
-- DEUX OBJETS, ET ILS SONT DISTINCTS.
--
--   1. LE QUESTIONNAIRE RÉSIDUEL — ce qu'AUCUNE autre source du dossier ne peut
--      lever. Ses règles bloquent par elles-mêmes : une question sans réponse
--      est un obstacle au visa, un « oui » sans précision écrite aussi.
--
--   2. LE REGISTRE DES FACTEURS DÉCLARÉS — les constatations qui CIRCULENT.
--      Une constatation faite dans une procédure doit se poser seule sur les
--      sections concernées, avec un lien vers sa source. Sans lui, chaque
--      section redécouvre ce que la voisine a déjà vu, et c'est la thèse du
--      produit qui tombe.
--
-- Le contenu — les questions, leur portée, leur nature, la raison pour laquelle
-- chacune existe encore — n'est pas ici : il est dans
-- methodology/questionnaire.json, versionné et validé.

-- ===== 1. les réponses au questionnaire =====
create table risk_question_answer (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  -- null = question d'ENTITÉ, posée une fois pour le dossier
  fsli_code text,
  question_code text not null,
  answer text not null check (answer in ('oui', 'non')),
  -- obligatoire quand la réponse est « oui » : c'est ce texte qui part au
  -- registre, et un facteur sans description ne se relit pas
  detail text not null default '',
  answered_by uuid not null references app_user(id),
  answered_at timestamptz not null default now(),
  methodology_version text not null
);
-- Une seule réponse courante par question et par portée. L'index partiel
-- distingue la portée entité (fsli_code null) de la portée section.
create unique index risk_question_answer_entity
  on risk_question_answer (engagement_id, question_code) where fsli_code is null;
create unique index risk_question_answer_section
  on risk_question_answer (engagement_id, fsli_code, question_code) where fsli_code is not null;

comment on table risk_question_answer is
  'Le questionnaire ne coche rien : une réponse « oui » CRÉE un facteur au registre, avec sa source et sa description.';

-- ===== 2. le registre des facteurs déclarés =====
-- Ils ne sont pas re-dérivés : ce sont des DÉCISIONS et des constatations
-- humaines. Les recalculer les effacerait ; c'est la différence avec
-- risk_factor_observed, que l'on remplace à chaque évaluation.
create table risk_factor_declared (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete restrict,
  -- d'où vient la constatation : c'est ce qui rend la circulation relisible
  source text not null check (source in ('questionnaire', 'procedure', 'manual')),
  -- le code de la question, de la procédure, ou null pour une saisie manuelle
  source_ref text,
  -- clé de methodology/questionnaire.json → natures_ri
  nature text not null,
  description text not null check (btrim(description) <> ''),
  -- ce que le facteur vise : [{ "fsli": "REVENUE", "assertions": ["realite"] }]
  -- Un facteur d'entité vise TOUS les postes retenus au périmètre.
  targets jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'dismissed')),
  -- la décision humaine : pourquoi ce facteur est retenu, ou pourquoi il ne l'est pas
  decision_reason text,
  decided_by uuid references app_user(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  -- Un facteur ÉCARTÉ sans motif écrit serait indistinguable d'un oubli : le
  -- registre doit pouvoir dire « on l'a vu et on ne l'a pas retenu, parce que ».
  constraint dismissal_needs_a_written_reason check (
    status <> 'dismissed' or (btrim(coalesce(decision_reason, '')) <> '' and decided_by is not null)
  )
);
create index risk_factor_declared_by_engagement on risk_factor_declared (engagement_id, status);

comment on column risk_factor_declared.targets is
  'Les couples (poste, assertions) que le facteur vise. C''est ce qui fait circuler une constatation : elle se pose sur les sections concernées sans ressaisie.';
comment on column risk_factor_declared.status is
  'proposed = remonté, pas encore statué (obstacle au visa). confirmed = retenu, il compte dans le risque. dismissed = écarté, avec motif obligatoire.';

do $$
declare t text;
begin
  foreach t in array array['risk_question_answer','risk_factor_declared'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_eng on %I using (engagement_id in (select otto_engagements()))', t, t);
  end loop;
end $$;
