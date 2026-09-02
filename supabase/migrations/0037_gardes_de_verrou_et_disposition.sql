-- 0037 — DEUX GARDES QUI NE GARDAIENT PAS, trouvées par le registre des gardes
-- (revue hostile n°6, Groupe 1 item 1.7).
--
-- 1. `exception_quantified_needs_disposition` (0009) était INERTE depuis sa
--    naissance : `disposition in (…)` sur une colonne qui porte déjà ce même
--    check vaut TRUE pour toute valeur, et NULL pour une disposition absente —
--    et un CHECK à NULL est satisfait. Et même réécrite (« résolu et chiffré ⇒
--    disposition posée »), elle est RECOUVERTE par
--    `exception_resolution_is_probative`, qui exige la disposition pour TOUT
--    écart résolu, chiffré ou non : aucune attaque ne peut l'atteindre seule,
--    donc aucune épreuve ne peut la prouver. Une garde qu'on ne peut pas
--    atteindre n'est pas une garde : elle est retirée, et l'invariant qu'elle
--    voulait dire est porté par la résolution probante (registre G-05).
-- 2. Les gardes de verrou de 0003 (« toute table qui porte engagement_id »)
--    ne couvraient que les tables de 0003/0021/0022/0023 : `ipe_rapport`,
--    créée cette nuit, acceptait des écritures sur un dossier scellé. La garde
--    est posée ici sur elle. Les AUTRES tables à engagement_id sans garde ne
--    sont pas gardées à l'aveugle cette nuit : certaines sont écrites APRÈS le
--    scellé par la clôture elle-même (le journal, l'archive) — un premier
--    essai les gardant toutes a fait échouer la clôture du parcours. La liste
--    des tables sans garde est FIGÉE dans gardes.test.ts (toute table nouvelle
--    doit être gardée, ou inscrite avec sa raison) et portée au registre
--    reporté pour un tri de jour.
--    `ipe` ne porte pas engagement_id (elle passe par le papier) : le service
--    refuse l'écriture sur un dossier scellé.

alter table exception drop constraint exception_quantified_needs_disposition;

create trigger ipe_rapport_lock_guard before insert or update or delete on ipe_rapport
  for each row execute function assert_engagement_unlocked();
