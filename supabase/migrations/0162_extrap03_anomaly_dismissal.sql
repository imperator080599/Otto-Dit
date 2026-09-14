-- Mandat 2026-09-14, §1.4-1.5 : ISA 530 §13 permet d'écarter un écart comme ANOMALIE
-- (« demonstrably not representative », §5(e)) — mais seulement dans des circonstances
-- « extrêmement rares », avec un « degré élevé de certitude ». `misstatement.status` portait déjà
-- 'dismissed' depuis la toute première migration (0002_testing.sql) sans qu'aucun chemin du dépôt
-- ne l'écrive : cette tranche construit le chemin, pas la colonne.
--
-- EXTRAP-03 (evaluation.ts/matching.ts) exige DEUX choses avant d'écrire ce statut : une
-- justification écrite (`dismissed_reason`) et une preuve SUPPLÉMENTAIRE obtenue EXPRÈS
-- (`dismissed_evidence_id`) — jamais la même pièce qui a déjà servi à constater l'écart. `dismissed_by`
-- et `dismissed_at` tracent qui, quand (P7 — provenance dès la première fonctionnalité).
--
-- `sample_evaluation_id` (nullable) raccorde une écriture de type 'projected' à l'évaluation
-- d'échantillon qui l'a produite (§1.5 point 2 : « la projection alimente le registre des
-- anomalies ») — sans lui, rien ne distinguerait une ligne projetée insérée par `concludeEvaluation`
-- d'une ligne factuelle/de jugement saisie à la main, et une seconde conclusion de la même
-- évaluation (qui ne se produit pas aujourd'hui, mais rien ne l'interdit structurellement)
-- dupliquerait la ligne projetée en silence. L'index unique partiel ci-dessous le rend impossible
-- au niveau de la base, pas seulement au niveau du code applicatif.
alter table misstatement add column if not exists sample_evaluation_id uuid references sample_evaluation(id);
alter table misstatement add column if not exists dismissed_reason text;
alter table misstatement add column if not exists dismissed_evidence_id uuid references evidence(id);
alter table misstatement add column if not exists dismissed_by uuid references app_user(id);
alter table misstatement add column if not exists dismissed_at timestamptz;

create unique index if not exists misstatement_sample_evaluation_projected_idx
  on misstatement(sample_evaluation_id) where sample_evaluation_id is not null;
