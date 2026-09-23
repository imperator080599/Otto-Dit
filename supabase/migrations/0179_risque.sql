-- 0179 — P1-07 (AUD-11, §7.7 du plan maître) : l'échelle de risque, RISK-01, les décisions
-- versionnées.
--
-- CE QUE CETTE MIGRATION FAIT :
--   1. `fsli_assertion_risk` + `justification text` — RISK-01 : quand le niveau EFFECTIF
--      (retenu, sinon calculé) est « nrpmm » (Not Reasonably Possible [risk of] Material
--      Misstatement — le niveau le plus léger de l'échelle à quatre niveaux, jamais
--      auto-calculé, voir methodology/risque.json), une justification écrite est obligatoire.
--      C'est la décision la plus lourde de conséquence de tout le module (elle retire TOUT
--      travail substantif sur l'assertion) et la seule que rien ne calcule à sa place — RISK-01
--      la rend donc impossible sans motif, comme G-07 (`override_needs_a_written_reason`, 0012)
--      le fait déjà pour toute surcharge qui s'écarte du calcul. Les deux contraintes sont
--      INDÉPENDANTES et peuvent s'appliquer TOUTES LES DEUX à la même écriture (surcharger vers
--      nrpmm est à la fois un écart au calcul ET un passage à nrpmm).
--   2. `fsli_assertion_risk_decision` — l'historique des surcharges, une ligne par surcharge,
--      append-only (même patron que `extraction`/`materiality`, 0178, P1-06) : la table mère
--      (`fsli_assertion_risk.retained_level`/`justification`/`decided_by`/`decided_at`) reflète
--      TOUJOURS la DERNIÈRE décision, mais la ligne qui l'a précédée reste lisible — un
--      arbitrage n'efface plus le précédent (règle 28).
--   3. `risk.level` (la table SOX/RCM, 0001, DISTINCTE de `fsli_assertion_risk`) : la contrainte
--      `risk_level_check` (`level in ('low','medium','high','significant')`) est retirée. Cette
--      table n'a JAMAIS reçu de valeur non nulle depuis P1-03/AUD-03 (`sox.ts::importRcm` pose
--      `level = null` littéralement, `level` est déjà `nullable` depuis 0174) — vérifié par
--      lecture du seul écrivain avant d'écrire cette ligne, pas supposé (règle 15) : aucune
--      ligne réelle ne perd de contrainte utile. Elle contredisait l'échelle réelle
--      (methodology/risque.json, désormais nrpmm/lower/higher/significant) sans jamais la
--      servir — un TROISIÈME vocabulaire mort que l'audit AUD-11 nommait explicitement
--      (« trois vocabulaires de niveau de risque »). Aucun remplacement : les valeurs viennent
--      de la méthode, jamais d'un `check` du produit (règle 8/9), et cette colonne reste
--      nullable, free-text, jamais écrite par aucun chemin connu aujourd'hui.
--   4. `risk_factor_declared_questionnaire_unique` (index unique partiel) — corrige un
--      `on conflict do nothing` sans cible trouvé en écrivant les tests de cette tranche
--      (règle 13) : chaque réponse « oui » à la même question créait une ligne DE PLUS,
--      jamais réutilisée. Voir le commentaire au point 4 plus bas dans ce fichier.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (règle 19) : elle ne touche pas `rcm_row.risk_desc`
-- (texte libre narratif, jamais un niveau codé — confirmé par lecture de tous ses lecteurs,
-- aucun ne le compare à une valeur d'échelle) ni le contenu de `methodology/risque.json`
-- lui-même (fichier de CONTENU, changé dans le même commit, pas dans cette migration).

alter table fsli_assertion_risk add column justification text;

alter table fsli_assertion_risk add constraint risk01_nrpmm_justifie check (
  lower(coalesce(retained_level, computed_level)) <> 'nrpmm'
  or btrim(coalesce(justification, '')) <> ''
);

create table fsli_assertion_risk_decision (
  id uuid primary key default gen_random_uuid(),
  fsli_assertion_risk_id uuid not null references fsli_assertion_risk(id) on delete restrict,
  retained_level text,
  justification text,
  decided_by uuid not null references app_user(id),
  decided_at timestamptz not null default now(),
  supersedes_id uuid references fsli_assertion_risk_decision(id)
);
create index fsli_assertion_risk_decision_by_risk on fsli_assertion_risk_decision (fsli_assertion_risk_id, decided_at desc);
create trigger fsli_assertion_risk_decision_append_only before update or delete on fsli_assertion_risk_decision
  for each row execute function forbid_mutation();

/* VERROU (P1-05, AUD-08, 0177) — cette table fille (engagement_id atteint par jointure, pas en
   colonne directe) reste hors de la couverture GÉNÉRIQUE de `couverture-verrou.test.ts` (son
   propre en-tête le dit : une table fille indirecte n'y entre que par une session qui l'y met à
   la main). Posée ici, au même titre que `match_lock_guard`/`signoff_lock_guard` (0177) —
   l'INSERT est le geste qui compte (UPDATE/DELETE sont déjà fermés par `forbid_mutation`
   ci-dessus, qui tranche en premier par ordre alphabétique de déclencheur : « _append_only »
   avant « _lock_guard » — même patron que `signoff`, où 0003 fermait déjà UPDATE/DELETE et 0177
   n'avait plus qu'à fermer l'INSERT). */
create trigger fsli_assertion_risk_decision_lock_guard before insert or update or delete on fsli_assertion_risk_decision
  for each row execute function assert_engagement_unlocked_via(
    'fsli_assertion_risk_id', 'select engagement_id from fsli_assertion_risk where id = $1');
insert into engagement_lock_verdict (table_name, verdict, reason)
values ('fsli_assertion_risk_decision', 'garde',
  'table fille indirecte (engagement_id via fsli_assertion_risk_id) — verrouillée dès sa création (0179, P1-07), jamais un trou ouvert avant confirmation ultérieure comme 0042 l’avait laissé pour 21 tables');

/* Même patron qu'une table fille indirecte déjà en place (0175, `control_fsli` — jointure EXISTS
   vers la table mère, `force row level security` comme partout depuis 0034). */
alter table fsli_assertion_risk_decision enable row level security;
alter table fsli_assertion_risk_decision force row level security;
create policy fsli_assertion_risk_decision_eng on fsli_assertion_risk_decision using (exists (
  select 1 from fsli_assertion_risk p where p.id = fsli_assertion_risk_decision.fsli_assertion_risk_id
    and p.engagement_id in (select otto_engagements())));

alter table risk drop constraint risk_level_check;

-- 4. CORRECTIF DÉCOUVERT EN ÉCRIVANT LES TESTS DE CETTE TRANCHE (règle 13,
--    « le silence lu comme un succès est le défaut à traquer ») : le
--    `insert ... on conflict do nothing` de `upsertQuestionFactor`
--    (questionnaire.ts) n'avait JAMAIS de contrainte unique à cibler — la
--    seule clé de la table est `id` (uuid neuf à chaque ligne). Chaque
--    réponse « oui » à la MÊME question créait donc une NOUVELLE ligne au
--    lieu d'en réutiliser une. C'était invisible tant que le facteur naissait
--    « confirmed » (deux lignes confirmées ne changent rien à ce que compte
--    `declaredFactorsFor`, hormis le doublonner en silence dans le compte des
--    facteurs qui pèsent sur le risque — un défaut réel, mais qui ne cassait
--    aucun test). Depuis que P1-07 le fait naître « proposed » (AUD-11,
--    DEMO_APP.md §8), la ligne DUPLIQUÉE que personne ne voit reste
--    « proposed » pour toujours après qu'on a confirmé « l'autre » —
--    `obst.facteursNonStatues` bloque le visa sans qu'aucun écran ne
--    montre pourquoi. Index unique PARTIEL (seulement les lignes
--    « questionnaire », qui seules portent un `source_ref` déterministe —
--    une saisie manuelle, elle, peut avoir `source_ref is null` répété sans
--    que ce soit un doublon) pour que `on conflict` ait enfin une cible.
create unique index risk_factor_declared_questionnaire_unique
  on risk_factor_declared (engagement_id, source_ref) where source = 'questionnaire';
