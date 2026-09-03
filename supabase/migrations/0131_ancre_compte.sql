-- 0131 — L'ANCRE « COMPTE » : une note de revue sur une CELLULE DE LEADSHEET
-- (mandat de la soirée §2.2/§5, mandat de nuit n°2 1.1 et 1.3).
--
-- L'ancre est l'identité métier de la cellule — le poste et le numéro de
-- compte (« REVENUE|706000 »), le champ dit la colonne (solde, variation) —
-- jamais une position d'écran (ADR-097). La base tient la liste des natures
-- d'ancre (0021, 0024, 0032) : une nature inconnue est refusée, pas devinée.
-- Le service (services/notes/ancres.ts) résout cette ancre contre la balance
-- active du dossier, ou celle du dossier N-1 ; la page de poste la pose.

alter table review_note drop constraint review_note_anchor_kind_check;
alter table review_note add constraint review_note_anchor_kind_check
  check (anchor_kind in ('sample_item','workpaper_section','questionnaire_answer',
                         'materiality_param','exception','deviation','ecran','compte'));
