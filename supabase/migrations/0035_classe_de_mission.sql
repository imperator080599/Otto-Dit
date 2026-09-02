-- 0035 — LA CLASSE DE LA MISSION (Groupe 1, item 1.1 du mandat de nuit).
--
-- Une mission se crée désormais depuis l'écran, en un formulaire : client
-- (existant ou NEUF), exercice (existant ou NEUF, avec sa date de clôture),
-- nature, référentiel, langue, référentiel de seuil préféré — et sa CLASSE :
-- entité d'intérêt public, cotée, composante d'un groupe, ou autre. La classe
-- est une donnée de la mission, pas une déduction : elle commandera plus tard
-- l'exigence de revue indépendante (3.13) et la rotation. Ici elle est posée,
-- affichée en en-tête, et rien de plus — aucune règle n'est écrite de mémoire
-- (règle 3 de la nuit).

alter table engagement add column classe text not null default 'autre'
  check (classe in ('eip', 'cotee', 'composante', 'autre'));

comment on column engagement.classe is
  'eip = entité d''intérêt public · cotee = titres admis à la négociation · composante = composante d''un groupe · autre. Posée à la création, jamais déduite.';
