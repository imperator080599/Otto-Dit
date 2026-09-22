-- 0171 — CORRECTIF, TROUVÉ APRÈS EXPÉDITION DE 0170 (P1-01). Le plan maître
-- (docs/MANDATS/2026-09-20_plan_maitre_phase2.md §7.1) porte une esquisse SQL explicitement
-- NORMATIVE (« normatives pour les noms et les contraintes », §7 en-tête) pour `proposition` —
-- lue APRÈS avoir écrit et expédié 0170_proposition.sql sur `main`, jamais avant (un vrai trou
-- de procédure, pas une hypothèse : la tranche P1-01 avait travaillé depuis la description de
-- tâche §426-433, jamais croisée avec l'annexe §7.1 avant expédition). Règle 26 : 0170 ne
-- s'édite jamais ; cette migration ALTER ce qui doit l'être, EN AVANT.
--
-- CE QUI EST CORRIGÉ ICI, ET POURQUOI CHAQUE CHOIX :
--   · `section_id` — normatif, coûte rien : la colonne existe, POPULÉE PAR RIEN pour l'instant
--     (le vocabulaire `section_state.kind` que P1-02 doit étendre — `mission.materialite`,
--     `poste.leadsheet`… — n'existe pas encore ; la peupler à la main inventerait une section
--     hors catalogue). P1-02 (ou une tranche postérieure) la remplit une fois le vocabulaire posé.
--   · `source_kind`, `engine_run_id` — normatifs, BACKFILLABLES pour les quatre familles déjà
--     écrites par 0170 : `ai_run_id is not null` ⇒ `'ai_run'`, sinon `'engine_run'` (les quatre
--     familles d'aujourd'hui sont soit une IA — walkthrough_gap, parfois extraction_field —, soit
--     un moteur de règles déterministe — materiality, deficiency, extraction_field/OCR textuel).
--     `'regle'` (une règle SANS moteur horodaté) n'a aucune occurrence aujourd'hui — catalogué,
--     jamais deviné sur une ligne existante. `engine_run_id` n'est PAS rétro-lié pour les lignes
--     déjà écrites (aucune jointure fiable n'existe entre une `proposition` déjà posée et
--     l'`engine_run` qui l'a produite — `propositions.ts::proposer()` ne recevait pas cet
--     identifiant avant ce correctif) : NULL sur l'historique, jamais un lien deviné par
--     approximation temporelle. `propositions.ts` le pose désormais pour toute nouvelle ligne.
--   · `niveau_automatisation` — normatif, NOT NULL DEFAULT 'L2' : PAS une valeur inventée pour
--     paraître mesurée (règle 31) — 'L2' est la SEULE valeur que ce dépôt ait jamais posée nulle
--     part (`notifications.ts::NIVEAU_ACTUEL`, vérifié, pas supposé) ; AUD-02/AUTO-02 (le niveau
--     RÉELLEMENT variable, horodaté par élément) reste un chantier séparé, non fait ici — le
--     défaut documente cette limite plutôt que de la cacher derrière une colonne absente.
--   · `note_id` — normatif, colonne ajoutée, TOUJOURS NULL pour l'instant : `review_note` ne
--     porte encore aucune capacité d'auteur « otto » au niveau racine (vérifié par lecture du
--     schéma avant l'écriture de 0170 déjà, retracé dans l'en-tête de `propositions.ts`) — P3-02
--     la construit. Ajouter la colonne maintenant évite une seconde migration d'ALTER le jour où
--     P3-02 la peuple.
--   · `decision_reason` — renomme `motif` (créé par 0170, jamais servi en production avant ce
--     correctif — aucun risque de rejeu, règle 26 ne s'applique qu'à une migration APPLIQUÉE,
--     et RENOMMER une colonne d'une migration existante EST une édition interdite ; ce renommage
--     se fait donc ici, par ALTER, sur la ligne DÉJÀ APPLIQUÉE, jamais en réécrivant 0170) — même
--     nom que `control_walkthrough_gap.decision_reason` (0158), la même famille de colonne.
--   · `tenant_id` — normatif, AJOUTÉ ET BACKFILLÉ (jointure sur `engagement`, jamais une valeur
--     par défaut). La politique RLS de 0170 (`engagement_id in (select otto_engagements())`)
--     EST déjà équivalente à `tenant_id = otto_tenant()` — vérifié en lisant `otto_engagements()`
--     (0004_rls.sql) : `select e.id from engagement e where e.tenant_id = otto_tenant()` EST la
--     même restriction, indirecte. La politique n'est donc PAS réécrite (aucun gain de sécurité,
--     seulement un style différent de la même garantie) ; la colonne est ajoutée pour la
--     normativité du nom et pour toute requête future qui préférerait l'accès direct.
--
-- CE QUI RESTE DÉLIBÉRÉMENT DIFFÉRENT DE L'ESQUISSE, ARGUMENTÉ ICI PLUTÔT QUE CORRIGÉ EN
-- SILENCE (règle 13) :
--   · `object_id` reste `uuid`, jamais `text`. Les quatre types branchés aujourd'hui portent
--     tous un vrai UUID ; changer le TYPE d'une colonne déjà indexée et jointe par
--     `propositions.ts`/`propositions/applicateurs.ts` est un geste plus risqué qu'un ajout de
--     colonne, pour un bénéfice qui ne sert aucun type branché aujourd'hui (un futur type à clé
--     composite pourra encoder sa clé dans `field`, ou motiver alors une vraie migration de
--     type). Reporté, nommé : R139 (docs/BACKLOG_REPORTE.md).
--   · La contrainte `proposition_decision_coherente` de l'esquisse (`(status='proposee') =
--     (decided_by is null)`) exigerait un `decided_by` NON NUL même pour `'perimee'` — une
--     invalidation par un MOTEUR (ré-import, recalcul), jamais un geste humain par construction
--     (`propositions.ts::perimer()`, en-tête). Plutôt que d'inventer un acteur, `perimer()` est
--     corrigée dans ce même correctif pour EXIGER désormais un `userId` réel (qui a déclenché le
--     recalcul invalidant — même doctrine que `materiality.propose()`, qui porte déjà un
--     `requestedBy` sur un chemin système) : la contrainte de l'esquisse EST donc respectée, pas
--     affaiblie — `decided_by` est maintenant posé sur LES QUATRE transitions hors « proposee »,
--     `perimee` comprise. La contrainte `proposition_decision_coherente` (0170 la nommait
--     `proposition_decision_is_whole`, un CHECK par statut plutôt qu'une équivalence — même
--     invariant, forme différente) n'a donc PAS besoin d'être réécrite : elle tenait déjà, la
--     LIGNE applicative qui la contredisait (perimer() sans acteur) est celle qui change ici.

alter table proposition
  add column section_id uuid references section_state(id) on delete restrict,
  add column source_kind text,
  add column engine_run_id uuid references engine_run(id),
  add column niveau_automatisation text,
  add column note_id uuid references review_note(id),
  add column tenant_id uuid references tenant(id);

update proposition set
  source_kind = case when ai_run_id is not null then 'ai_run' else 'engine_run' end,
  niveau_automatisation = 'L2',
  tenant_id = e.tenant_id
from engagement e
where e.id = proposition.engagement_id;

alter table proposition
  alter column source_kind set not null,
  alter column niveau_automatisation set not null,
  alter column niveau_automatisation set default 'L2',
  alter column tenant_id set not null;

alter table proposition
  add constraint proposition_source_kind_connu check (source_kind in ('ai_run', 'engine_run', 'regle')),
  add constraint proposition_niveau_connu check (niveau_automatisation in ('L0', 'L1', 'L2'));

alter table proposition rename column motif to decision_reason;

-- `perimer()` (propositions.ts) EXIGE DÉSORMAIS UN ACTEUR (voir l'en-tête de ce fichier) : la
-- contrainte de 0170 (`proposition_decision_is_whole`) autorisait `decided_by is null` sur
-- `'perimee'` — exactement l'ancien comportement qu'on vient de corriger. Remplacée par la forme
-- normative du plan (§7.1 : `decided_by` non nul dès que le statut n'est plus « proposee »).
alter table proposition drop constraint proposition_decision_is_whole;
alter table proposition add constraint proposition_decision_coherente check (
  (status = 'proposee' and decided_by is null and decided_at is null)
  or (status <> 'proposee' and decided_by is not null and decided_at is not null)
);

create index proposition_section on proposition (section_id) where section_id is not null;
create index proposition_engine_run on proposition (engine_run_id) where engine_run_id is not null;
