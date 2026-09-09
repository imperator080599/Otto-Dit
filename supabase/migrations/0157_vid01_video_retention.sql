-- MANDAT DU 2026-09-09 (docs/MANDATS/2026-09-09_mandat_reponses_fondateur.md), §3 — la vidéo du
-- walkthrough : dépôt et suppression manuels dès maintenant (§3.1 point 1), l'automatisation en fin
-- de réunion restant hors-périmètre (service externe, identifiants — les interdits permanents ne le
-- permettent pas encore, §3.1 point 2). « Un bouton pour déposer, un bouton pour supprimer... La
-- suppression est toujours tracée — qui, quand, pourquoi — et jamais silencieuse. »
--
-- LE DÉPÔT EXISTE DÉJÀ (`attacherWalkthrough`, sox.ts, mandat du 8 septembre) — rien à ajouter là.
-- CE QUI MANQUE, LA SUPPRESSION : symétrique de `evidence.quarantined`/`quarantine_reason` (0002),
-- déjà le patron de ce dépôt pour « une pièce marquée sans être détruite ». `evidence` reste donc
-- la table centrale, jamais supprimée EN LIGNE (règle 28 : le travail humain ne disparaît jamais en
-- silence) — seule la MARQUE change. `control.di_walkthrough_evidence_id` continue de POINTER
-- dessus même supprimée : la pièce reste interrogeable (qui, quand, pourquoi) au lieu de disparaître
-- de l'historique — re-déposer un nouvel enregistrement (`attacherWalkthrough`, déjà idempotent sur
-- le lien) fait pointer le lien vers la NOUVELLE pièce, exactement ce que son en-tête dit déjà :
-- « un contrôle réenregistré remplace le lien, la PIÈCE reste au dossier ». C'est CE remplacement,
-- au niveau du contrôle, qui sert de « autre preuve d'inquiry » à VID-01 (sox.ts) : aucune table de
-- correspondance tâche-par-tâche n'est nécessaire pour ce que le mandat demande.
--
-- `deleted_at`/`deleted_by`/`deleted_reason` : LES TROIS OU AUCUNE (même patron que
-- `engagement_lock_verdict.confirmed_by`/`confirmed_at`, 0042) — une suppression sans motif écrit
-- n'est pas permise, la contrainte le tient EN BASE, pas seulement dans le service.
alter table evidence add column deleted_at timestamptz;
alter table evidence add column deleted_by uuid references app_user(id);
alter table evidence add column deleted_reason text;
alter table evidence add constraint evidence_deletion_whole check (
  (deleted_at is null and deleted_by is null and deleted_reason is null)
  or (deleted_at is not null and deleted_by is not null and deleted_reason is not null and btrim(deleted_reason) <> '')
);

-- `evidence` PORTE DÉJÀ sa garde de verrou (0003, bloc générique `assert_engagement_unlocked()`
-- appliqué à `evidence` par nom littéral) : une suppression après clôture du dossier (§3.2 — la
-- purge d'archivage vise justement l'APRÈS-signature) passe par le couloir d'amendement post-verrou
-- que 0003 §9.4 prévoit depuis l'origine et qu'aucun service n'employait encore
-- (`otto.post_lock_amendment`, jusqu'ici exercé seulement par `schema.test.ts`) — le motif écrit
-- exigé ci-dessus EST la justification que ce couloir demande, journalisée dans le même geste
-- (`supprimerVideoWalkthrough`, sox.ts). CE QUE CETTE MIGRATION NE POSE PAS (règle 19) : aucune
-- garde neuve — c'est la garde EXISTANTE d'`evidence`, empruntée par un chemin prévu pour elle,
-- jamais contournée.
