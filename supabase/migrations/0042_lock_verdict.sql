-- 0042 — LE REGISTRE DES VERDICTS DE VERROU (mandat du jour, S5).
--
-- Trente et une tables portent engagement_id sans garde de verrou, et leur
-- liste était FIGÉE dans un test : un compteur qu'il faut éditer à chaque
-- table nouvelle n'est pas une garde, c'est un conflit de fusion. Chaque
-- table a désormais un VERDICT écrit, avec sa raison, PROPOSÉ par l'agent et
-- CONFIRMÉ par un humain (plafond L2) : une garde ne s'attache qu'à un verdict
-- confirmé. Le test lit la propriété, pas un chiffre : « 0 table sans verdict ».
--
--   garde           : la table porte une garde de verrou (assert_engagement_unlocked)
--   garde_proposee  : l'agent propose de la garder ; rien n'est attaché tant
--                     qu'un humain n'a pas confirmé
--   journal         : ajout seul, écrit APRÈS le scellé par la lecture ou le système
--   apres_scelle    : écrit par la clôture elle-même (archive, jalons dérivés)
--   lecture         : état de travail par personne, pas du contenu du dossier

create table engagement_lock_verdict (
  table_name text primary key,
  verdict text not null check (verdict in ('garde','garde_proposee','journal','apres_scelle','lecture')),
  reason text not null check (btrim(reason) <> ''),
  proposed_by text not null default 'agent',
  proposed_at timestamptz not null default now(),
  confirmed_by uuid references app_user(id),
  confirmed_at timestamptz,
  constraint lock_verdict_confirmation_is_whole check (
    (confirmed_by is null and confirmed_at is null) or (confirmed_by is not null and confirmed_at is not null)
  )
);

/* Les tables DÉJÀ gardées (0003, 0021, 0022, 0023, 0037) : verdict « garde »,
   dérivé de ce que la base porte. */
insert into engagement_lock_verdict (table_name, verdict, reason)
select r.relname, 'garde', 'garde de verrou attachée par migration (' || g.tgname || ')'
from pg_trigger g join pg_class r on r.oid = g.tgrelid
where g.tgname = r.relname || '_lock_guard';

/* Les tables sans garde : un verdict PROPOSÉ chacune, à confirmer. */
insert into engagement_lock_verdict (table_name, verdict, reason) values
  ('ai_run',                 'journal',        'journal des appels au modèle, ajout seul (0003) — une lecture après scellé en écrit'),
  ('event_log',              'journal',        'la piste d’audit elle-même, ajout seul (0003) — le scellé s’y écrit'),
  ('server_error',           'journal',        'exceptions de rendu, ajout seul — un écran qui plante sur un dossier scellé doit pouvoir le dire'),
  ('engine_run',             'journal',        'journal d’exécution des moteurs — une relecture (rapprochement) après scellé s’y inscrit'),
  ('verification_check',     'journal',        'ajout seul (0003), traces de vérification en double aveugle'),
  ('verification_run',       'journal',        'en-tête des passes de vérification, journal'),
  ('inbound_email',          'journal',        'courriel reçu : l’arrivée est un fait, pas une décision du dossier'),
  ('file_archive',           'apres_scelle',   'l’archive scellée est produite PAR la clôture, après le verrou'),
  ('engagement_milestone',   'apres_scelle',   'jalons dérivés par déclencheur au changement d’état — le scellé lui-même en écrit un'),
  ('section_state',          'lecture',        'détenteur et propriétaire des sections : état de travail par personne, pas contenu du dossier'),
  ('aux_balance_file',       'garde_proposee', 'une balance auxiliaire importée est du contenu du dossier'),
  ('carry_forward',          'garde_proposee', 'les reprises N-1 statuées sont des décisions du dossier'),
  ('coa_map_rule',           'garde_proposee', 'la table de correspondance des comptes commande le périmètre'),
  ('completion_item',        'garde_proposee', 'les travaux d’achèvement sont ce qu’un inspecteur relit en premier'),
  ('confirmation_campaign',  'garde_proposee', 'une campagne de circularisation est une preuve externe'),
  ('engagement_acceptance',  'garde_proposee', 'la décision d’acceptation ne se réécrit pas après scellé'),
  ('engagement_member',      'garde_proposee', 'l’équipe d’un dossier scellé est un fait daté'),
  ('estimation',             'garde_proposee', 'les estimations et leurs paramètres sont des jugements du dossier'),
  ('evaluation_response',    'garde_proposee', 'la réponse au dépassement de l’anomalie tolérable commande la conclusion'),
  ('fs_line',                'garde_proposee', 'les lignes des états financiers pointées sont le cœur du dossier'),
  ('fsli_assertion_risk',    'garde_proposee', 'le niveau de risque par assertion commande la taille des travaux'),
  ('gl_entry_supersession',  'garde_proposee', 'la supersession d’écritures est écrite par l’import, lui-même gardé'),
  ('independence_declaration','garde_proposee','une déclaration d’indépendance signée ne bouge plus après scellé'),
  ('non_audit_service',      'garde_proposee', 'les services autres que l’audit pèsent sur l’indépendance'),
  ('process_change_decision','garde_proposee', 'une différence N/N-1 statuée est une décision du dossier'),
  ('process_interview',      'garde_proposee', 'un entretien enregistré et ses consentements'),
  ('process_model',          'garde_proposee', 'la description du processus est de la documentation d’audit'),
  ('rcm_row',                'garde_proposee', 'la matrice risques-contrôles'),
  ('risk_factor_declared',   'garde_proposee', 'le registre des facteurs de risque commande le questionnaire'),
  ('risk_factor_observed',   'garde_proposee', 'les facteurs observés par les analyses'),
  ('risk_question_answer',   'garde_proposee', 'les réponses au questionnaire résiduel');

/* Registre d'installation, pas de locataire : propriétaire-seul, comme
   _migrations et app_state (assertions-role.ts le justifie). RLS activée et
   FORCÉE pour que le jour où l'application passe sous un rôle sans BYPASSRLS,
   la table lui soit fermée jusqu'à ce qu'une politique le dise. */
alter table engagement_lock_verdict enable row level security;
alter table engagement_lock_verdict force row level security;
