# 12 — Ce qui se configure sans code, et ce qui exige un développement

> **La phrase honnête, en une ligne.** Votre méthode reste la vôtre : vous chargez vos procédures,
> vos seuils, votre échelle de risque, votre questionnaire et votre déclaration d'indépendance, et
> ils prennent effet sans qu'une ligne de code bouge. Ce que vous ne pouvez pas faire seul, c'est
> inventer un **type de calcul** que le moteur ne sait pas encore faire.

Ce document existe pour que cette phrase soit **vérifiable** plutôt que rassurante. Il est autant
commercial que technique : il dit ce qu'on promet, ce qu'on ne promet pas, et pourquoi la frontière
est là.

---

## 1. Ce qui se configure sans code

Tout ce qui suit vit dans `methodology/`, en JSON versionné. On modifie le fichier, on recharge,
c'est en vigueur. Aucune compilation, aucun déploiement, aucun développeur.

| Ce que vous changez | Où | Effet immédiat |
|---|---|---|
| **Vos procédures** — libellé, objectif, assertion servie, sens du test, justificatifs attendus, champs à relever, exceptions | `procedures.json` | La procédure apparaît dans le plan de travail des postes concernés |
| **Le niveau de risque à partir duquel une procédure est requise** | `procedures.json` → `risque_minimum` | Elle entre ou sort de la liste des travaux requis |
| **Votre échelle de risque** — combien de niveaux, comment ils s'appellent | `risque.json` → `echelle.niveaux` | Deux, trois, quatre niveaux ; « limité / normal / accru » plutôt que « faible / moyen / élevé » |
| **La règle qui convertit les facteurs en niveau** | `risque.json` → `echelle.paliers` | « 3 facteurs et plus → accru » au lieu de 2 |
| **Vos tailles d'échantillon**, par niveau | `risque.json` → `tailles_echantillon` | La taille proposée sur chaque procédure échantillonnée |
| **Les seuils de vos facteurs de risque** — 200 écritures, 5 % d'OD, 15 % sur le dernier mois | `risque.json` → `facteurs_observes[].parametres` | Le facteur s'active plus tôt ou plus tard |
| **Le libellé et la justification de chaque facteur** | `risque.json` | Ce que l'écran affiche et ce que le dossier garde |
| **Vos questions de risque résiduel** — lesquelles, leur portée, leur nature, ce qu'un « oui » change | `questionnaire.json` | Le questionnaire posé dans chaque section et au niveau de l'entité |
| **Vos rubriques de déclaration d'indépendance** | `independance.json` | Ce que chaque membre doit déclarer avant qu'on puisse lui attribuer un travail |
| **Vos seuils d'indépendance** — cadeaux, familiarité, rotation, plafond d'honoraires non-audit | `independance.json` → `parametres` | Les calculs et les alertes correspondants |
| **Vos natures de services autres que la certification** | `independance.json` → `natures_sacc` | La liste proposée à la saisie |

**Ce que le validateur garantit en échange.** Un fichier invalide **n'est pas chargé** : il arrête
l'assemblage avec la liste des erreurs en toutes lettres. On ne peut donc pas casser silencieusement
le moteur en modifiant sa méthode — et c'est ce qui rend l'import acceptable.

---

## 2. Ce qui exige un développement

Il y a **une seule** frontière, et elle est toujours la même : **la méthode NOMME, le code CALCULE.**

| Ce que vous voulez | Pourquoi il faut du développement |
|---|---|
| Un **type de facteur** qui n'existe pas — « écritures passées un jour férié », « clients créés dans les 30 jours précédant la clôture » | Un facteur est un **prédicat** sur les données. Le catalogue peut le nommer et le paramétrer, mais quelqu'un doit écrire comment on le mesure dans un grand livre |
| Une **population** de procédure d'une forme nouvelle — « les avoirs émis après la clôture rattachés à une facture de l'exercice » | Idem : le catalogue nomme `predicat` et ses paramètres, le code sait lire les écritures |
| Une **taille d'échantillon calculée par formule** plutôt que lue dans une table | Non supporté aujourd'hui. Voir §4 |
| Une **règle de contrôle de champ** d'un type nouveau — au-delà de « dans l'exercice », « antérieure ou égale », « postérieure », « même exercice que la référence » | Le schéma énumère les règles de date que le moteur applique. Une règle hors liste arrête l'assemblage plutôt que d'être ignorée |
| Un **référentiel comptable** autre que le PCG, ou un nouveau pack normatif | C'est un pack, pas un paramètre |

### Pourquoi la frontière est là, et pas ailleurs

Elle pourrait être plus loin : on pourrait laisser le catalogue porter une **expression exécutable**
et l'évaluer. On ne le fait pas, pour trois raisons qui se disent devant un auditeur.

1. **Un catalogue exécutable est du code sans revue.** Une expression chargée par un cabinet
   s'exécuterait sur ses données, dans son dossier, sans qu'aucun test ne l'ait vue. Le jour où elle
   se trompe, elle se trompe sur un dossier signé.
2. **Un prédicat nommé mais non implémenté serait silencieusement toujours inactif.** C'est le
   scénario que le validateur interdit **dans les deux sens** : tout prédicat déclaré doit être
   implémenté, tout prédicat implémenté doit être déclaré. Sans cette règle, un facteur mal
   orthographié ne s'activerait jamais — risque sous-évalué, étendue des travaux réduite, **et aucun
   écran ne le dirait.**
3. **Ce qui se nomme se relit.** `nombre_ecritures_au_dessus_de` avec `{ seuil: 200 }` se discute en
   revue ; une expression de trente caractères ne se discute pas, elle se subit.

**La conséquence à assumer, dite franchement** : changer un seuil, un libellé, une échelle, une
question ou une rubrique est à vous. Inventer un **type** de mesure passe par nous. Aujourd'hui, cela
représente cinq types de facteur et un jeu de prédicats de population — c'est peu, et c'est
exactement ce qu'il faut annoncer plutôt que de laisser découvrir.

---

## 3. L'isolation : votre méthode est à vous, comme vos données

Le catalogue d'un cabinet lui appartient au même titre que ses dossiers. Le socle est en place —
`tenant_id` sur toutes les tables racines, politiques RLS, et une garde applicative qui vérifie à
**chaque écriture** que la personne et la mission appartiennent au même cabinet, vérifiée par un test
qui **tente** la fuite dans les deux sens.

**Ce qui n'est pas encore fait, et qu'il ne faut pas promettre** : le catalogue est aujourd'hui lu
depuis le dépôt, pas depuis la base — il est donc **commun**, pas encore par cabinet. Le rendre
par-cabinet est chiffré dans `docs/11_CONVERGENCE.md` (§ méthodologie-comme-donnée, ~2½ séances) et
comporte trois pièces : une table `firm_methodology` portant le JSON validé, une colonne sur la
mission qui désigne le catalogue à charger, et le test d'isolation calqué sur celui de l'équipe.

---

## 4. Ce qui est demandé et pas encore possible

Écrit ici pour ne pas être promis par omission.

| Demande | État | Coût estimé |
|---|---|---|
| **Taille d'échantillon par formule** (par exemple un intervalle de sondage en unités monétaires ramené au seuil de planification) plutôt qu'une table par niveau | **Non supporté.** `tailles_echantillon` est une table `niveau → nombre` | ~1 séance, à faire **avec le point 6** : une formule a besoin de la valeur de la population, et la population est le point 6. Même frontière que les prédicats — la méthode nommerait `formule: "mus_intervalle_au_seuil"`, le code la calculerait |
| **Catalogue par cabinet**, chargé depuis la base | Non fait — voir §3 | ~2½ séances |
| **Import d'un catalogue par l'écran** (coller un JSON, le valider, voir les erreurs) | Non fait | compris dans les 2½ ci-dessus |
| **Assertions supplémentaires** au-delà des sept | Énumérées dans le schéma | ~½ séance, mais à discuter : sept assertions est un choix de méthode, pas une limite technique |

---

## 5. Le test à trente secondes, et sa réponse

Un auditeur qui veut éprouver la promesse posera l'une de ces trois questions. Voici les réponses
vraies.

> **« Et si je travaille à quatre niveaux de risque ? »**
> Oui. L'échelle est une donnée : quatre niveaux, ou deux, se chargent sans toucher au code, et une
> procédure qui exigerait un niveau absent de votre échelle **arrête l'assemblage** au lieu de passer.
> C'est vérifié par un test qui charge réellement une méthode à quatre niveaux.

> **« Et si je les appelle limité / normal / accru ? »**
> Oui, même mécanisme. Les noms viennent de votre fichier ; aucun n'est écrit dans le code.

> **« Et si ma taille d'échantillon vient d'une formule ? »**
> **Pas aujourd'hui.** C'est une table par niveau. La formule est chiffrée à une séance et attend le
> point 6, parce qu'elle a besoin de la population. Je préfère vous le dire que vous laisser le
> découvrir.
