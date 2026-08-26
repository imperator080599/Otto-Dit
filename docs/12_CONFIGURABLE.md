# 12 — Ce qui se configure sans code, et ce qui exige un développement

> **La phrase honnête, en une ligne.** Votre méthode reste la vôtre : vos procédures, vos seuils,
> votre échelle de risque, votre jeu d'assertions, votre questionnaire et votre déclaration
> d'indépendance sont des **données validées** — pas du code —, chargées depuis la base de **votre**
> cabinet, et séparées de celles des autres par une contrainte que **la base fait respecter**, pas
> seulement l'application (§3). Vous les chargez **vous-même**, depuis un écran : vous collez, vous
> vérifiez sans rien écrire, vous publiez (§3.1). Ce que vous ne pourrez pas faire seul, c'est
> inventer un **type de calcul** que le moteur ne sait pas encore faire (§2) — et le **gabarit du
> papier de travail** n'est pas encore une donnée, ce qui est une incohérence avec ce principe et
> pas une limite de principe (§1.2).

Ce document existe pour que cette phrase soit **vérifiable** plutôt que rassurante. Il est autant
commercial que technique : il dit ce qu'on promet, ce qu'on ne promet pas, ce qui est daté, et
pourquoi la frontière est là.

**Les deux marqueurs du §1**, à lire avant le tableau :

| Marqueur | Ce qu'il signifie |
|---|---|
| **✓ donnée** | Un fichier JSON validé, publié pour **votre** cabinet et lu depuis la base. Le modifier ne demande ni compilation, ni développeur, ni déploiement — vous le faites vous-même depuis l'écran « la méthode du cabinet » (§3.1) |
| **⚠⚠ code** | C'est configuré, mais **dans un pack TypeScript**, pas dans `methodology/`. Le changer suppose donc **un développeur et un déploiement**, même si aucune logique ne bouge. Levée chiffrée au §1.2 |

État daté du **26 août 2026**. Une ligne du §1 porte encore **⚠⚠ code** — le gabarit du papier de
travail — et le document dit laquelle avant le tableau plutôt que de la laisser découvrir au §2.

---

## 1. Ce qui se configure sans code

Tout ce qui porte **✓ donnée** est du JSON versionné, validé, publié pour votre cabinet. On modifie
le fichier, on republie, c'est en vigueur : aucune compilation, aucun développeur. Ce qui porte
**⚠⚠ code** est configuré aussi, mais au mauvais endroit — dit ici plutôt que découvert.

| Ce que vous changez | Où | Effet immédiat | État |
|---|---|---|---|
| **Vos procédures** — libellé, objectif, assertion servie, sens du test, justificatifs attendus, champs à relever, exceptions | `procedures.json` | La procédure apparaît dans le plan de travail des postes concernés | ✓ donnée |
| **Le niveau de risque à partir duquel une procédure est requise** | `procedures.json` → `risque_minimum` | Elle entre ou sort de la liste des travaux requis | ✓ donnée |
| **Votre jeu d'assertions** — lesquelles, comment elles s'appellent, ce que chacune couvre | `assertions.json` | Sept, cinq, ou neuf ; « présentation » séparée de « informations à fournir », ou le découpage PCAOB. Voir §1.1 | ✓ donnée |
| **Votre échelle de risque** — combien de niveaux, comment ils s'appellent | `risque.json` → `echelle.niveaux` | Deux, trois, quatre niveaux ; « limité / normal / accru » plutôt que « faible / moyen / élevé » | ✓ donnée |
| **La règle qui convertit les facteurs en niveau** | `risque.json` → `echelle.paliers` | « 3 facteurs et plus → accru » au lieu de 2 | ✓ donnée |
| **Vos tailles d'échantillon**, par niveau | `risque.json` → `tailles_echantillon` | La taille proposée sur chaque procédure échantillonnée | ✓ donnée |
| **Les seuils de vos facteurs de risque** — 200 écritures, 5 % d'OD, 15 % sur le dernier mois | `risque.json` → `facteurs_observes[].parametres` | Le facteur s'active plus tôt ou plus tard | ✓ donnée |
| **Le libellé et la justification de chaque facteur** | `risque.json` | Ce que l'écran affiche et ce que le dossier garde | ✓ donnée |
| **Vos questions de risque résiduel** — lesquelles, leur portée, leur nature, ce qu'un « oui » change | `questionnaire.json` | Le questionnaire posé dans chaque section et au niveau de l'entité | ✓ donnée |
| **Vos rubriques de déclaration d'indépendance** | `independance.json` | Ce que chaque membre doit déclarer avant qu'on puisse lui attribuer un travail | ✓ donnée |
| **Vos seuils d'indépendance** — cadeaux, familiarité, rotation, plafond d'honoraires non-audit | `independance.json` → `parametres` | Les calculs et les alertes correspondants | ✓ donnée |
| **Vos natures de services autres que la certification** | `independance.json` → `natures_sacc` | La liste proposée à la saisie | ✓ donnée |
| **Les intitulés de vos papiers de travail** — titres de sections, titres d'annexes, mentions « établi par » / « validé par », langue | `src/lib/packs/nep-fr.ts`, `pcaob-sox.ts` → `WorkpaperStrings` | Le PDF et le classeur exportés portent vos intitulés | **⚠⚠ code** — voir §1.2 |

**Ce que le validateur garantit en échange.** Un fichier invalide **n'est pas chargé** : il arrête
l'assemblage avec la liste des erreurs en toutes lettres. On ne peut donc pas casser silencieusement
le moteur en modifiant sa méthode — et c'est ce qui rend l'import acceptable.

### 1.1 Les assertions : tranché, et configurable

C'était le même défaut que l'échelle de risque : les sept assertions étaient **énumérées dans le
schéma**, donc un cabinet qui sépare « présentation » et « informations à fournir », ou qui suit le
découpage PCAOB, voyait son fichier refusé. La question est réglée, pas repoussée à une
démonstration.

Les assertions sont désormais un fichier de méthode, `methodology/assertions.json` : `code`,
`libelle`, `definition`, et le `sens_naturel` du test qui les sert. Aucun code produit ne contient
la liste.

**Et ce qui remplace l'énumération est plus strict qu'elle**, parce qu'une liste ouverte sans
contrôle croisé serait pire qu'une liste fermée. Le validateur arrête l'assemblage dans **six** cas :

1. une **procédure** vise une assertion absente du jeu du cabinet (le message donne le jeu réel) ;
2. une **question** de risque résiduel vise une assertion absente du jeu ;
3. un **facteur de risque observé** vise une assertion absente du jeu ;
4. une assertion déclare un `sens_naturel` que le catalogue de sens de test ne connaît pas — sans
   quoi l'écran afficherait un libellé vide ;
5. deux assertions portent le même `code` ;
6. le jeu est **vide** — aucune procédure ne pourrait alors viser quoi que ce soit, et rien ne le
   dirait.

Autrement dit : l'énumération protégeait contre une faute de frappe dans **un** fichier ; le contrôle
croisé protège contre une **divergence entre quatre**. Vérifié par un test qui charge réellement un
jeu à découpage `presentation` / `informations` distinct, plus **un test par mode de défaillance** —
les six ci-dessus, pas un résumé des six.

### 1.2 Le gabarit du papier de travail — l'incohérence, dite avant d'être trouvée

**La question.** Un cabinet a ses colonnes, ses en-têtes, sa mise en page. C'est sa signature, c'est
ce qui entre dans son dossier, ce que son réviseur relit et ce qu'un inspecteur lit.

**La réponse en un mot : partiellement — et pas la partie qui fait la signature.**

| Élément du papier | Aujourd'hui | Où c'est écrit |
|---|---|---|
| **Intitulés de sections** (Objectif, Étendue, Méthode, Échantillon, Exceptions, Évaluation, Vérification, Conclusion) | **Configurable, mais dans un pack TypeScript** — donc un déploiement | `packs/types.ts` → `WorkpaperStrings` |
| **Intitulés d'annexes**, mentions d'attribution et de validation, langue du document | **Configurable, même réserve** | idem |
| **Liste et ordre des sections** | **Pas configurable.** Huit sections, dans cet ordre, en dur | `services/workpapers/draft.ts` |
| **Colonnes des tableaux** (échantillon : Pièce, Tiers, Date, Montant HT, Sélection, Justificatifs, Contrôles, Anomalies — exceptions : Type, Description, Impact, Statut, Suite) | **Pas configurable.** Deux tableaux de colonnes littérales, une variante française et une anglaise | `draft.ts`, deux tableaux littéraux |
| **Mise en page** — corps de texte, tailles, couleurs de titres, marges, filets | **Pas configurable.** Valeurs littérales dans le rendu PDF | `services/workpapers/render.ts` |
| **En-tête de cabinet / logo** | **N'existe pas.** Le PDF ne porte ni papier à en-tête ni marque | — |
| **Schéma de référencement des papiers** (A-3.2, R-100…) | **N'existe pas.** Un `code` libre, aucune numérotation imposable | — |

#### Pourquoi c'est une incohérence, et pas une limite de principe

Ce document pose une frontière : **la méthode NOMME, le code CALCULE.** Elle se tient pour un
prédicat de risque ou une population — quelqu'un doit écrire comment on mesure. Elle **ne dit rien**
du format d'un papier : une colonne, un ordre de sections, un logo ne sont ni un nom ni un calcul,
ce sont de la **présentation**. Qu'ils vivent dans un pack exigeant un déploiement n'est justifié par
aucun principe de ce produit : c'est un reste d'architecture, pas une décision.

Et c'est le reste le plus visible. Un catalogue de procédures se lit dans OTTO ; **un papier de
travail sort d'OTTO** et va vivre dans le dossier du cabinet, sous les yeux d'un réviseur puis d'un
inspecteur. C'est la pièce sur laquelle « votre méthode reste la vôtre » se vérifie sans qu'on ait
rien à expliquer.

#### Ce qu'on fait : le gabarit devient un septième fichier de méthode

`methodology/papier.json`, validé, publié et chargé **exactement comme les six autres** — donc
par cabinet, isolé, immuable une fois publié, et refusé s'il est invalide.

| Pièce | Coût | Ce que ça change |
|---|---|---|
| `papier.json` + son schéma + sa validation croisée | ~1 séance | Le gabarit entre dans le paquet : la plomberie (publication, isolation, désignation, immuabilité) est déjà là et ne se repaie pas |
| Liste et ordre des sections en données, avec énumération des blocs nommés | ~1 séance | Vous retirez « Vérification », vous déplacez « Évaluation » avant « Exceptions ». Même frontière : la méthode **nomme** un bloc, le code sait le **remplir** ; un bloc nommé et non implémenté **arrête l'assemblage** au lieu de sortir une section vide |
| Colonnes de tableaux en données, sur une énumération des champs relevés | ~1 séance | Vos colonnes, vos intitulés, votre ordre — les champs disponibles restant ceux que la procédure relève, et une colonne qui nomme un champ inexistant arrête l'assemblage |
| En-tête, logo, pied de page | ~1 séance | Le PDF sort sur votre papier |
| **Schéma de référencement** (A-3.2, R-100…) | ~½ séance | Vos papiers portent **vos** références, dans **votre** plan de classement — c'est ce dont un réviseur se sert pour savoir où les travaux ont été faits |

**Total ~4½ séances, contre les 3½ chiffrées pour la version incohérente** — et l'écart d'une séance
n'est pas le coût de la cohérence : c'est le **schéma de référencement**, qui n'était pas dans les
3½ parce qu'il n'existe pas du tout et que j'avais chiffré « rendre configurable ce qui existe »
plutôt que « rendre le papier celui du cabinet ». La plomberie économisée par le mécanisme déjà en
place compense le travail de frontière en plus. **Les deux chiffres sont donc proches, et la version
cohérente est celle qu'on prend.**

#### Ce qui ne deviendra pas optionnel, et pourquoi c'est un argument

Le **bloc de visas**, la **mention de version** et l'**empreinte de population** restent sur chaque
papier. Ce n'est pas une contrainte qu'on vous impose : c'est ce qui fait que **si OTTO disparaît
demain, votre papier dit encore à un inspecteur qui l'a signé, sur quelle version, et sur quelle
population** — sans nous, sans licence, sans accès. C'est la propriété qui rend le dossier
**auto-portant** (ADR-013).

Leur **place** et leur **libellé** sont dans les ~4½ séances ci-dessus : vous les mettez où vous
voulez, vous les appelez comme vous voulez. Leur **présence**, non. Un cabinet qui demanderait à les
retirer demanderait à rendre son propre dossier illisible sans nous — ce serait notre intérêt
commercial, et ce serait contre le sien.

## 2. Ce qui exige un développement

Il y a **une seule** frontière, et elle est toujours la même : **la méthode NOMME, le code CALCULE.**

| Ce que vous voulez | Pourquoi il faut du développement |
|---|---|
| Un **type de facteur** qui n'existe pas — « écritures passées un jour férié », « clients créés dans les 30 jours précédant la clôture » | Un facteur est un **prédicat** sur les données. Le catalogue peut le nommer et le paramétrer, mais quelqu'un doit écrire comment on le mesure dans un grand livre |
| Une **population** de procédure d'une forme nouvelle — « les avoirs émis après la clôture rattachés à une facture de l'exercice » | Idem : le catalogue nomme `predicat` et ses paramètres, le code sait lire les écritures |
| Une **taille d'échantillon calculée par formule** plutôt que lue dans une table | Non supporté aujourd'hui. Voir §4 |
| Une **règle de contrôle de champ** d'un type nouveau — au-delà de « dans l'exercice », « antérieure ou égale », « postérieure », « même exercice que la référence » | Le schéma énumère les règles de date que le moteur applique. Une règle hors liste arrête l'assemblage plutôt que d'être ignorée |
| Un **bloc de papier de travail** d'une forme nouvelle — une section que le moteur ne sait pas remplir | Un bloc est **nommé** par le gabarit et **rempli** par le code, comme un prédicat. Ce qui existe se réordonne et se renomme ; ce qui n'existe pas s'écrit. Voir §1.2 |
| Un **référentiel comptable** autre que le PCG, ou un nouveau pack normatif | C'est un pack, pas un paramètre |

### 2.1 Pourquoi la frontière est là, et pas ailleurs

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
assertion, une question ou une rubrique est à vous. Inventer un **type** de mesure passe par nous.
Aujourd'hui, cela représente cinq types de facteur et un jeu de prédicats de population — c'est peu,
et c'est exactement ce qu'il faut annoncer plutôt que de laisser découvrir.

---

## 3. L'isolation : votre méthode est à vous, comme vos données

Le catalogue d'un cabinet lui appartient au même titre que ses dossiers. **C'est fait, et c'est
vérifié en tentant la fuite plutôt qu'en la supposant absente.**

**Comment.** Une méthode publiée est une ligne `firm_methodology` portant le paquet JSON validé, son
empreinte et ses versions, rattachée à un cabinet. Une mission **désigne** la sienne
(`engagement.methodology_id`). Les services ne lisent plus le dépôt : ils lisent la méthode de la
mission.

**Trois propriétés, et chacune répond à une question qu'un auditeur pose.**

| La question | La réponse, et ce qui la garantit |
|---|---|
| « Est-ce que je peux voir la méthode d'un autre cabinet ? » | Non, et pas seulement parce que l'application refuse : la clé étrangère est **composite** — `(methodology_id, tenant_id)`. Désigner le catalogue d'un autre cabinet est **impossible au niveau de la base**. Contrairement aux politiques RLS, une clé étrangère n'est pas inerte en local. Le test tente l'écriture directe, en contournant le service, et la base la rejette par son nom de contrainte |
| « Si vous publiez une nouvelle version en mars, mes dossiers de janvier changent-ils ? » | Non. Une méthode publiée est **immuable** : republier crée une ligne, la mission garde la sienne. Un dossier doit pouvoir dire des années plus tard sous quelle méthode il a été exécuté |
| « Et si une mission n'a pas de méthode ? » | Elle est **refusée**, pas repliée sur celle de l'éditeur. Le repli silencieux serait la vraie fuite : le dossier tournerait sur notre méthode, les travaux requis seraient les nôtres, et **aucun écran ne le dirait** |

**Deux choses que le paquet d'un cabinet ne peut pas contenir**, et c'est délibéré :

1. **Ses propres schémas.** Ils énumèrent ce que le *moteur* sait calculer — les prédicats
   implémentés, les règles de date, les sens de test. Un cabinet qui livrerait le sien désactiverait
   tous les contrôles en une ligne, et son fichier invalide passerait sans bruit. La fonction de
   publication n'a **aucun paramètre** par lequel un schéma pourrait arriver, et un paquet qui en
   contient un est refusé en nommant le fichier de trop.
2. **Un fichier manquant.** Un paquet amputé est refusé, jamais complété en silence avec le nôtre.

**Et rien n'entre sans être validé** : la publication passe par le **même** validateur que le
catalogue du dépôt — pas par un second chemin, qui serait un chemin non testé. Un paquet invalide
n'est pas stocké : il est refusé avec la liste des erreurs, et la base reste comme avant. Le
catalogue est **revalidé au chargement**, pas seulement à l'écriture : le produit évolue, et un
prédicat retiré du moteur rendrait invalide une méthode publiée hier.

*Vérifié par 25 tests qui tentent chacune de ces fuites.*

### 3.1 Vous chargez vous-même, et vous voyez le refus

L'écran **« la méthode du cabinet »** fait les trois gestes.

1. **Vérifier sans publier.** On colle, on vérifie, **rien n'est écrit** — ni en cas de succès ni en
   cas d'échec. Un cabinet corrige son fichier sans qu'une tentative laisse une trace.
2. **Voir la liste exacte.** Un refus n'est pas « fichier invalide » : c'est la liste des lignes
   fautives, chacune nommant l'objet et la valeur attendue. *« procédure RAPPRO : risque_minimum
   « faible » absent de l'échelle du cabinet (leger | lourd) »*. *« facteur variation : prédicat
   « flair_de_l_associe » inconnu du moteur (connus : … ) »* — le message **donne la liste des
   prédicats connus**, donc le refus se corrige sans nous appeler.
3. **Publier**, ce qui crée une version. Les missions **gardent la leur** jusqu'à ce qu'on les
   redésigne, depuis le même écran.

**Correctif ou paquet entier.** Le texte est toujours un objet dont les clés sont des noms de
fichiers. En correctif, les fichiers présents remplacent les leurs et les autres sont repris de la
version en vigueur — le paquet entier fait 126 000 caractères, l'imposer pour changer deux lignes
serait une fausse configurabilité. **Plusieurs fichiers à la fois, et certaines modifications
l'exigent** : passer votre échelle de trois à quatre niveaux demande `risque.json` **et**
`procedures.json` dans la même publication, sinon le contrôle croisé refuse — à juste titre, parce
qu'entre les deux la méthode serait incohérente.

*Ce qui est vérifié par un test et n'aurait pas dû l'être seulement par relecture : ce que l'écran
déclare valide, la publication l'accepte ; ce qu'il déclare invalide, elle le refuse. Deux listes
d'erreurs produites à deux endroits divergeraient un jour, et l'écran dirait « valide » là où le
moteur refuse.*

## 4. Ce qui est demandé et pas encore possible

Écrit ici pour ne pas être promis par omission.

| Demande | État | Coût estimé |
|---|---|---|
| **Taille d'échantillon par formule** (par exemple un intervalle de sondage en unités monétaires ramené au seuil de planification) plutôt qu'une table par niveau | **Non supporté.** `tailles_echantillon` est une table `niveau → nombre` | ~1 séance, à faire **avec le point 6** : une formule a besoin de la valeur de la population, et la population est le point 6. Même frontière que les prédicats — la méthode nommerait `formule: "mus_intervalle_au_seuil"`, le code la calculerait |
| **Gabarit du papier de travail comme donnée** — ordre des sections, colonnes, libellés, en-tête, logo, schéma de référencement | **Non fait**, et c'est l'incohérence assumée du produit : la présentation n'est ni un nom ni un calcul, elle n'a rien à faire dans un pack | voir §1.2 |

*(Les assertions figuraient ici. Elles n'y figurent plus : la question est tranchée au §1.1.)*

---

## 5. Le test à trente secondes, et ses réponses

Un auditeur qui veut éprouver la promesse posera l'une de ces questions. Voici les réponses vraies.

> **« Et si je travaille à quatre niveaux de risque ? »**
> Oui. L'échelle est une donnée : quatre niveaux, ou deux, se chargent sans toucher au code, et une
> procédure qui exigerait un niveau absent de votre échelle **arrête l'assemblage** au lieu de passer.
> C'est vérifié par un test qui charge réellement une méthode à quatre niveaux.

> **« Et si je les appelle limité / normal / accru ? »**
> Oui, même mécanisme. Les noms viennent de votre fichier ; aucun n'est écrit dans le code.

> **« Et si je sépare présentation et informations à fournir ? »**
> Oui. Le jeu d'assertions est une donnée depuis `assertions.json`, et procédures, questions et
> facteurs se valident contre **votre** jeu — une divergence entre deux fichiers arrête l'assemblage
> au lieu de passer. Vérifié par un test qui charge un jeu à découpage distinct.

> **« Et si ma taille d'échantillon vient d'une formule ? »**
> **Pas aujourd'hui.** C'est une table par niveau. La formule est chiffrée à une séance et attend le
> point 6, parce qu'elle a besoin de la population. Je préfère vous le dire que vous laisser le
> découvrir.

> **« Et mon papier de travail, avec mes colonnes, mon en-tête et mes références ? »**
> **Partiellement, et pas encore la partie qui fait la signature** — les intitulés se changent, mais
> dans un pack, donc avec un déploiement ; l'ordre des sections, les colonnes, la mise en page et
> l'en-tête sont en dur ; le schéma de référencement n'existe pas.
>
> Et je vous le donne comme une **incohérence de notre côté**, pas comme une limite : la présentation
> n'est ni un nom ni un calcul, elle n'a rien à faire dans un pack. Le gabarit devient un septième
> fichier de méthode, chargé comme les six autres. **~4½ séances**, décomposées au §1.2 — dont une
> pour le schéma de référencement, qui n'existe pas du tout.

> **« Je peux la charger moi-même, ou il faut vous appeler ? »**
> Vous-même, depuis un écran. Vous collez, vous **vérifiez sans rien écrire**, vous lisez la liste
> des lignes fautives — chacune nommant l'objet et la valeur attendue — et vous publiez. Voir §3.1.

> **« Est-ce que mon catalogue est à moi, ou est-ce que vous le voyez ? »**
> Il est à vous. Votre méthode est une ligne rattachée à votre cabinet ; la mission désigne la
> sienne ; et désigner celle d'un **autre** cabinet est impossible **au niveau de la base**, par une
> clé étrangère composite — pas seulement refusé par l'application. Une mission sans méthode est
> refusée plutôt que repliée sur la nôtre. Vérifié par des tests qui **tentent** chacune de ces
> fuites, y compris en contournant le service pour écrire directement en base. Voir §3.
