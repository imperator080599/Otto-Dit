-- 0172 — P1-02 (AUD-02), plan maître §7.2. Nommée `0171_sections_et_notes.sql` dans le plan ;
-- décalée à 0172 parce que 0171 est déjà prise par le correctif d'alignement de `proposition`
-- (R139, trouvé après l'expédition de 0170) — toute la bande 017x du plan glisse d'un cran à
-- partir d'ici. §7 du plan reste normatif pour les noms et les contraintes ; lu EN ENTIER avant
-- d'écrire ce fichier (R139 : la leçon qui a coûté le correctif précédent).
--
-- CE QUE CETTE MIGRATION FAIT :
--   1. `section_state.kind` — le CHECK à deux valeurs (`poste`,`papier`) devient la liste de 35
--      valeurs du plan §7.2 (postes, papiers, contrôles, et les sous-sections de mission).
--   2. `review_note.section_id` — colonne neuve, FK vers `section_state`. Peuplée pour CHAQUE
--      note existante par la dérivation ci-dessous (jamais laissée nulle sur une note d'audit).
--   3. `review_note.anchor_kind` — le CHECK s'étend aux dix natures neuves du plan (`analytique`,
--      `process_model`, `process_step`, `control`, `control_task`, `assertion_risk`, `transcript`,
--      `proposition`, `fs_line`, `papier`) ; `ecran` et `deviation` en sortent — voir la migration
--      de données plus bas pour ce que deviennent les lignes existantes de ces deux natures.
--   4. `review_note` — contrainte neuve : `scope = 'audit' ⇒ anchor_kind is not null`. Les notes
--      d'audit flottantes existantes (workpaper attaché, aucune ancre) sont ré-ancrées sur
--      `papier` (le workpaper lui-même) avant que la contrainte ne se pose — jamais supprimées.
--   5. `review_note_reply.proposition_id` — colonne neuve, FK vers `proposition` (0170).
--   6. Index neufs : `review_note (section_id, status)`, `review_note (engagement_id, status)`.
--
-- CONSÉQUENCE DIRECTE, NON DEMANDÉE PAR LE TEXTE DU PLAN MAIS FORCÉE PAR LUI, DOCUMENTÉE ICI
-- PLUTÔT QUE LAISSÉE EN SILENCE (règle 13) : retirer `ecran` du CHECK casse deux endroits qui
-- l'exigeaient LITTÉRALEMENT — la contrainte `review_note_produit_ancre_ecran` (« scope='produit'
-- ⇒ anchor_kind='ecran' ») et `addReviewNote()` (`lifecycle.ts`, qui refuse toute note produit dont
-- `ancre.kind !== 'ecran'`). Une note « produit » (le retour du fondateur sur la plateforme, ADR
-- sans numéro connu ici, 0032/`assert_note_close_by_reviewer`) n'a JAMAIS été atteignable par un
-- écran de ce dépôt (vérifié par lecture : aucun `scope: 'produit'`, aucune pose de note d'écran
-- dans `app/src`, hors tests) — retirer `ecran` n'y change donc rien de VIVANT, mais la contrainte
-- SQL et le refus applicatif doivent rester cohérents avec un CHECK qui n'admet plus cette valeur,
-- sans quoi toute tentative future de note produit échouerait pour une raison qui ne se lirait
-- plus nulle part. Résolution : une note produit n'a plus BESOIN d'ancre du tout — elle porte sur
-- la plateforme, pas sur un objet du dossier — donc `review_note_produit_ancre_ecran` devient
-- « scope='audit' ou anchor_kind est nul » et le refus applicatif correspondant (`lifecycle.ts`)
-- est corrigé dans le même commit que cette migration.
--
-- MIGRATION DE DONNÉES, dans cet ordre (chaque étape dépend de la précédente) :
--   a. `deviation` → `exception`. Vérifié avant d'écrire cette ligne, pas supposé (règle 13) :
--      AUCUN chemin de ce dépôt n'a jamais posé une note `anchor_kind='deviation'` (grep sur
--      `kind: 'deviation'` dans `app/src`, hors tests — zéro résultat) ; cette ligne ne touche
--      donc aucune ligne réelle sur aucune base connue. Si une ligne existait malgré tout, son
--      `anchor_ref` (un id de la table `deviation`, jamais de la table `exception` — deux tables
--      distinctes, deux espaces d'identité distincts, 0002_testing.sql) resterait tel quel : la
--      note se résoudrait `retire` (aucun `exception.id` ne correspond), jamais une fausse
--      correspondance devinée. Documenté ici, jamais deviné en silence.
--   b. `ecran` : tentative de retrouver un vrai papier depuis la route (`anchor_ref` porte un UUID
--      si la route visait un workpaper) ; trouvé → `papier`/cet id ; sinon → ancre retirée
--      (`anchor_kind`/`ref`/`field`/`label` à NULL), section de repli `mission.vue`. Vérifié avant
--      d'écrire cette ligne : AUCUN chemin de ce dépôt ne pose non plus de note `anchor_kind='ecran'`
--      (même grep, même résultat vide) — cette branche est un filet pour une base qui en porterait,
--      jamais exercée par le monde semé ni par aucun test avant que ce correctif n'en construise un
--      exprès (`notes.test.ts`, cas connu mauvais, règle 17).
--   c. Les notes d'audit FLOTTANTES (workpaper attaché, toujours sans ancre après a/b) sont
--      ré-ancrées `papier`/le workpaper — jamais supprimées (règle 28).
--   d. `section_id` dérivé pour CHAQUE note d'audit, par nature d'ancre (voir le bloc SQL) :
--      papier (workpaper_id posé, quelle qu'en soit la nature — `workpaper_section` COMPRISE :
--      une note de cette nature porte TOUJOURS un workpaper_id, vérifié dans `enrichir.ts` et
--      `workpapers/[wid]/page.tsx`, donc la branche « workpaper attaché prime » la couvre sans
--      cas particulier, jamais par oubli) → `papier`/l'id du workpaper ;
--      `compte` → `poste.leadsheet`/le code de poste PORTÉ PAR L'ANCRE ELLE-MÊME (`anchor_ref`
--      s'écrit `<code>|<numéro>`, aucune jointure de méthode n'est nécessaire — vérifié dans
--      `notes/ancres.ts::resoudreAncre`, cas `compte`) ; `sample_item` → `poste.testing`/`REVENUE`
--      (litéral, pas dérivé : c'est la SEULE valeur que ce dépôt ait jamais posée pour cette
--      nature — vérifié par lecture du semeur, `enrichir.ts` — périmètre gelé au chiffre
--      d'affaires pour cette famille de note, règle 14) ; `exception` → `mission.ecarts` ;
--      `questionnaire_answer` → `mission.risque` ; `materiality_param` → `mission.materialite` ;
--      toute note sans ancre et sans workpaper (un cas de fixture de test, jamais un chemin
--      applicatif — `gardes/registre.ts::note()`) → `mission.vue`, le même repli que `ecran`
--      irrésolu.
--
-- CE QUI RESTE DÉLIBÉRÉMENT HORS PÉRIMÈTRE DE CETTE MIGRATION, ARGUMENTÉ ICI (règle 13) :
--   · `sections.ts` (le service) n'étend PAS `mesSections()`/`sectionsDuDossier()`/`avancement()`
--     aux 33 natures neuves de section — ces vues (« mes dossiers », le graphique d'avancement)
--     restent scopées à `kind in ('poste','papier')`, les deux seules qu'`assurerSections()` gère.
--     Les sections neuves (créées par `cleDeSection`, le service, pas cette migration — sauf pour
--     le backfill ci-dessus) portent un statut dérivé qui n'a de sens que pour `poste`/`papier` ;
--     les exposer dans ces vues calculerait un statut FAUX pour `mission.vue` etc. Corrigé en
--     filtrant `mesSections`/`sectionsDuDossier`/`avancement` sur les deux natures d'origine,
--     dans le même commit que cette migration.

alter table review_note_reply add column proposition_id uuid references proposition(id);

alter table section_state drop constraint section_state_kind_check;
alter table section_state add constraint section_state_kind_check check (kind in (
  'poste','papier',
  'poste.leadsheet','poste.interviews','poste.processus','poste.controles','poste.changements',
  'poste.sampling','poste.testing','poste.papiers','poste.demandes','poste.ecarts',
  'mission.vue','mission.acceptation','mission.equipe','mission.reunions','mission.reprise',
  'mission.imports','mission.rapprochement','mission.balances','mission.materialite',
  'mission.scoping','mission.risque','mission.programme','mission.estimations',
  'mission.circularisations','mission.ecarts','mission.notes','mission.rcm','mission.demandes',
  'mission.pieces','mission.pointage','mission.achevement','mission.cloture',
  'controle'
));

alter table review_note add column section_id uuid references section_state(id) on delete restrict;

-- anchor_kind : les 8 natures d'origine moins ecran/deviation, plus les 10 neuves du plan — POSÉ
-- ICI, AVANT LA MIGRATION DE DONNÉES (a)/(b)/(c) CI-DESSOUS, PAS APRÈS. Trouvé par la revue
-- hostile (voix 2, CRITIQUE) : une première version de ce fichier posait ce CHECK élargi APRÈS
-- les UPDATE qui écrivent `anchor_kind = 'papier'` (une valeur que l'ANCIEN CHECK, hérité de
-- 0131, n'admettait pas) — inoffensif sur une base FRAÎCHE (aucune ligne review_note n'existe
-- encore quand les migrations tournent, avant demo:seed), mais un échec CERTAIN sur toute base
-- qui porterait déjà une note flottante réelle (locale gardée entre deux sessions, réseau de
-- démonstration, réseau de production — règle 26, « appliquée » ne veut pas dire « base fraîche
-- de session »). Reproduit par la revue hostile elle-même (PGlite direct) avant d'être corrigé ici.
alter table review_note drop constraint review_note_anchor_kind_check;
alter table review_note add constraint review_note_anchor_kind_check check (anchor_kind in (
  'sample_item','workpaper_section','questionnaire_answer','materiality_param','exception','compte',
  'papier','analytique','process_model','process_step','control','control_task','assertion_risk',
  'transcript','proposition','fs_line'
));

-- (a) deviation → exception (label du nom seulement — voir en-tête, aucune ligne réelle affectée).
update review_note set anchor_kind = 'exception' where anchor_kind = 'deviation';

-- (b) ecran → papier si la route porte un UUID de workpaper existant, sinon ancre retirée.
update review_note r set
  anchor_kind = 'papier', anchor_ref = w.id::text, anchor_field = null,
  anchor_label = coalesce(w.code, r.anchor_label)
from workpaper w
where r.anchor_kind = 'ecran'
  and substring(r.anchor_ref from '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') is not null
  and w.id::text = substring(r.anchor_ref from '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');

update review_note set anchor_kind = null, anchor_ref = null, anchor_field = null, anchor_label = null
where anchor_kind = 'ecran';

-- (c) notes d'audit flottantes (workpaper attaché, toujours sans ancre) : ré-ancrées sur le papier.
update review_note r set
  anchor_kind = 'papier', anchor_ref = r.workpaper_id::text, anchor_label = w.code
from workpaper w
where r.scope = 'audit' and r.anchor_kind is null and r.workpaper_id is not null and w.id = r.workpaper_id;

-- (d) section_id, par nature — un workpaper attaché prime sur toute autre ancre (une note
-- anchor_kind='compte' posée depuis l'écran d'un papier garde son papier comme section, cohérent
-- avec (c) qui vient de re-poser 'papier' pour toute note flottante attachée à un workpaper).
insert into section_state (engagement_id, kind, ref, label)
select distinct r.engagement_id, 'papier', w.id::text, coalesce(w.code, 'papier')
from review_note r join workpaper w on w.id = r.workpaper_id
where r.workpaper_id is not null
on conflict (engagement_id, kind, ref) do nothing;

insert into section_state (engagement_id, kind, ref, label)
select distinct r.engagement_id, 'poste.leadsheet', split_part(r.anchor_ref, '|', 1),
  coalesce((select s2.label from section_state s2
            where s2.engagement_id = r.engagement_id and s2.kind = 'poste' and s2.ref = split_part(r.anchor_ref, '|', 1)),
           split_part(r.anchor_ref, '|', 1))
from review_note r
where r.workpaper_id is null and r.anchor_kind = 'compte'
on conflict (engagement_id, kind, ref) do nothing;

insert into section_state (engagement_id, kind, ref, label)
select distinct r.engagement_id, 'poste.testing', 'REVENUE', 'Testing — REVENUE'
from review_note r
where r.workpaper_id is null and r.anchor_kind = 'sample_item'
on conflict (engagement_id, kind, ref) do nothing;

insert into section_state (engagement_id, kind, ref, label)
select distinct r.engagement_id, 'mission.ecarts', '', 'Écarts'
from review_note r where r.workpaper_id is null and r.anchor_kind = 'exception'
on conflict (engagement_id, kind, ref) do nothing;

insert into section_state (engagement_id, kind, ref, label)
select distinct r.engagement_id, 'mission.risque', '', 'Évaluation du risque'
from review_note r where r.workpaper_id is null and r.anchor_kind = 'questionnaire_answer'
on conflict (engagement_id, kind, ref) do nothing;

insert into section_state (engagement_id, kind, ref, label)
select distinct r.engagement_id, 'mission.materialite', '', 'Matérialité'
from review_note r where r.workpaper_id is null and r.anchor_kind = 'materiality_param'
on conflict (engagement_id, kind, ref) do nothing;

insert into section_state (engagement_id, kind, ref, label)
select distinct r.engagement_id, 'mission.vue', '', 'Vue d’ensemble'
from review_note r where r.workpaper_id is null and r.anchor_kind is null
on conflict (engagement_id, kind, ref) do nothing;

update review_note r set section_id = s.id
from section_state s
where r.section_id is null and s.engagement_id = r.engagement_id and (
  (r.workpaper_id is not null and s.kind = 'papier' and s.ref = r.workpaper_id::text)
  or (r.workpaper_id is null and r.anchor_kind = 'compte' and s.kind = 'poste.leadsheet' and s.ref = split_part(r.anchor_ref, '|', 1))
  or (r.workpaper_id is null and r.anchor_kind = 'sample_item' and s.kind = 'poste.testing' and s.ref = 'REVENUE')
  or (r.workpaper_id is null and r.anchor_kind = 'exception' and s.kind = 'mission.ecarts' and s.ref = '')
  or (r.workpaper_id is null and r.anchor_kind = 'questionnaire_answer' and s.kind = 'mission.risque' and s.ref = '')
  or (r.workpaper_id is null and r.anchor_kind = 'materiality_param' and s.kind = 'mission.materialite' and s.ref = '')
  or (r.workpaper_id is null and r.anchor_kind is null and s.kind = 'mission.vue' and s.ref = '')
);

-- scope='produit' n'exige plus anchor_kind='ecran' (retiré) — voir l'en-tête. Une note produit
-- n'a plus d'ancre du tout désormais ; addReviewNote() (lifecycle.ts) est corrigé dans le même
-- commit pour ne plus l'exiger non plus.
alter table review_note drop constraint review_note_produit_ancre_ecran;
alter table review_note add constraint review_note_produit_ancre_ecran
  check (scope = 'audit' or anchor_kind is null);

-- scope='audit' ⇒ anchor_kind non nul, DÉSORMAIS — (a)/(b)/(c) ci-dessus ont fermé tous les cas
-- connus avant que cette contrainte ne se pose ; ADD CONSTRAINT la valide contre les lignes
-- existantes (pas de NOT VALID ici, délibérément — une ligne encore ouverte serait un vrai défaut
-- de cette migration, pas un état à laisser passer silencieusement).
alter table review_note add constraint review_note_audit_ancree
  check (scope = 'audit' and anchor_kind is not null or scope <> 'audit');

create index review_note_section_status on review_note (section_id, status);
create index review_note_eng_status on review_note (engagement_id, status);

-- `review_note_ecran_idx` (0032, partiel sur anchor_kind='ecran') ne peut plus jamais être
-- satisfait par aucune ligne — le CHECK ci-dessus interdit désormais cette valeur — poids mort
-- silencieux sinon (revue hostile, voix 1, finding LOW).
drop index if exists review_note_ecran_idx;
