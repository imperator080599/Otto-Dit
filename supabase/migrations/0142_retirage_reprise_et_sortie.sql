-- 0142 — LE RE-TIRAGE NE FAIT PAS DISPARAÎTRE LE TRAVAIL HUMAIN (ADR-133 ;
-- mandat du soir et de la nuit J3, étage 1.2).
--
-- CE QUE LE PARCOURS CLIQUÉ DISAIT DEPUIS DES SEMAINES, en sept échecs qui
-- n'en faisaient qu'un. Ré-importer le grand livre DÉFINITIF (ADR-016) recrée
-- chaque écriture avec un NOUVEL identifiant — la correspondance est écrite
-- dans `gl_entry_supersession`, et personne ne la lisait. L'échantillon passe
-- en `superseded`, l'auditeur re-tire, et le nouveau tirage désigne LES MÊMES
-- écritures par les nouveaux identifiants. Les demandes envoyées, les pièces
-- déposées par le client, le testing déjà fait restent accrochés aux ANCIENNES
-- lignes. Mesuré sur le dossier de démonstration : douze écritures communes
-- aux deux tirages, et TRENTE-TROIS pièces du client qu'aucun écran n'atteint
-- plus. « Un objet créé qu'aucun chemin de lecture n'atteint » (règle 13).
--
-- DEUX COLONNES, ET AUCUN DÉPLACEMENT DE DONNÉES. La ligne neuve DÉSIGNE celle
-- dont elle reprend le travail ; les chemins de lecture suivent la chaîne. Rien
-- n'est recopié, rien n'est ré-attaché, rien n'est supprimé : la ligne d'hier
-- garde ses lignes filles, et la piste se lit dans les deux sens.

alter table sample_item
  add column repris_de uuid references sample_item(id);
create index sample_item_repris_de on sample_item (repris_de);

/* LA SORTIE DU TIRAGE SE STATUE, elle ne se constate pas. Une ligne du tirage
   précédent qui portait du travail et que le nouveau tirage ne reprend pas ne
   disparaît pas de la vue : elle est « hors échantillon courant » et elle
   BLOQUE le visa tant qu'une personne n'a pas écrit pourquoi le travail ne
   suit pas. Le motif n'est pas facultatif : une décision sans motif est une
   décision qu'un inspecteur ne peut pas relire.

   UNE SEULE DÉCISION, ET LA REVUE HOSTILE DE LA NUIT A TRANCHÉ. Une première
   version en offrait deux, `sans_suite` et `remise` (« la ligne retourne au
   tirage »). Le second chemin, emprunté, écrivait la décision, levait
   l'obstacle — et ne remettait RIEN au tirage. Un mot qui promet un geste que
   rien n'exécute, et qui ferme le seul verrou qui aurait rappelé la ligne.
   Remettre une ligne dans une sélection tirée et signée se conçoit avec un
   auditeur : c'est au backlog (R31), pas dans cette migration. */
alter table sample_item
  add column sortie_decision text check (sortie_decision in ('sans_suite')),
  add column sortie_motif text,
  add column sortie_par uuid references app_user(id),
  add column sortie_le timestamptz;

alter table sample_item add constraint sample_item_sortie_statuee check (
  (sortie_decision is null and sortie_motif is null and sortie_par is null and sortie_le is null)
  or (sortie_decision is not null and btrim(coalesce(sortie_motif, '')) <> ''
      and sortie_par is not null and sortie_le is not null)
);
