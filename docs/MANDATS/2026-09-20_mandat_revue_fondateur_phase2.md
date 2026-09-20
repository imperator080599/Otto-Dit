# OTTO — Mandat du fondateur : revue du prototype, et ouverture de la phase 2

Dicté par le fondateur le 20 septembre 2026, à partir de sa revue du prototype servi
(`5336095`, mandat de clôture terminé : 25 OBSERVÉES / 0 NON OBSERVÉE / 7 SANS OBJET).
Commité verbatim selon la règle 33. **Ce mandat ne rouvre pas la clôture : il la suit.** Il ouvre
une phase 2 dont l'objectif n'est plus « un prototype fini » mais « un produit qu'un grand cabinet
prendrait au sérieux ».

Les remarques du §1 sont **celles du fondateur, mot pour mot** — c'est le verdict sur l'épure qu'il
avait différé le 9 septembre. Les observations du §2 sont celles du superviseur, tirées des mêmes
captures, et **à vérifier** avant d'être traitées. Le §4 borne l'audit technique. Le §5 fixe le
régime d'exécution, qui est celui de la clôture : il a marché.

---

## 0. Le principe qui gouverne tout ce mandat

Cité, mot pour mot :

> « Je veux de manière générale une plateforme minimaliste, lisible, ergonomique. Claude Code
> surcharge tout c'est insupportable. »

Ce principe entre en conflit apparent avec trois choses que le projet tient pour sacrées : le
plafond `L2` (le modèle propose, un humain valide, rien n'entre sans validation tracée), la
provenance de chaque valeur, et les gardes (`NOTIF-01`, les obstacles au visa). **Le conflit est
levé ici, une fois pour toutes, pour qu'il n'arrête pas l'agent à chaque ligne :**

### 0.1 La provenance reste dans la donnée et quitte l'écran

Rien de ce mandat ne retire une garde, une trace, ni une validation. Tout ce mandat retire leur
**affichage permanent**. Une valeur proposée par l'IA, calculée, ou reprise de N-1, s'affiche comme
n'importe quelle valeur — dans son champ, modifiable — avec un **marqueur discret**. Le survol
révèle la provenance (qui, quoi, quand). La colonne « Computed / Retained / What produced it /
Arbitrate » disparaît de tous les écrans ; la donnée qu'elle affichait est intacte en base et
lisible au survol.

### 0.2 Un seul motif pour toute proposition de l'IA : surlignage jaune + note de revue

C'est la forme que le fondateur a lui-même décrite pour l'agent de flowchart (§1, R-F16) :
*« modifications highlightées en jaune avec une review note rédigée expliquant pourquoi »*. Elle est
**généralisée** : tout ce que l'IA propose, où que ce soit, est un surlignage jaune porteur d'une
note de revue qui l'explique. La validation humaine, exigée par `L2`, prend l'une de deux formes,
toutes deux tracées : **modifier la valeur** (elle devient celle de l'auditeur), ou **cliquer le
marqueur** pour l'accepter telle quelle. `NOTIF-01` compte les surlignages non acceptés, exactement
comme il comptait les éléments `data-ia-prepare` — la garde ne change pas, son habillage change.

### 0.3 La note de revue est aussi le canal vers l'agent IA

Cité (R-F8) : *« Si elle ne suffit pas et qu'on veut que ce soit l'Agent IA qui la change, clic
dessus, ajout review note et on l'adresse à l'agent IA. »* Une note de revue peut donc être
**adressée à l'agent** comme à une personne. Elle crée une tâche IA ; la réponse de l'agent revient
sous la forme du §0.2 — un surlignage jaune et sa note. Aucun bouton « Propose… » nulle part :
le geste d'écriture et le geste de demande à l'IA sont les mêmes que pour un collègue.

### 0.4 La doctrine ne s'écrit pas à l'écran

Les phrases qui expliquent à l'utilisateur les principes de conception du produit sont **retirées**,
sans exception : *« The same text as the engagement analytical review — not a copy. Written by a
person; OTTO may propose wording… »*, *« counted on the whole file, not this line item alone »*,
*« Ce n'est PAS un jugement de significativité — sur cette entité le poste dépasse le seuil… »*,
*« propose (L3) → validate → draw (L0, deterministic) »*, *« Drawn »*. L'écran fait ; il ne se
justifie pas. Ces textes vivent dans `docs/`, jamais dans un composant.

> **`EPURE-01`** — un libellé de l'échelle d'automatisation (`L0`…`L3`, *deterministic*, *propose*,
> *Drawn*), un nom de code de refus, ou une phrase de doctrine, dans le HTML servi d'un écran de
> mission. Garde mécanique : liste de motifs interdits, vérifiée sur les 356 vues de `visuel`.

---

## 1. Les remarques du fondateur — verbatim, chacune avec son épreuve

### R-F1 — L'arborescence

> « Indiquer dans l'arborescence les sections descopées surcharge l'arborescence, juste l'indiquer
> dans la section dédiée au scoping. »

**Épreuve.** Le rail latéral ne liste que les postes dans le périmètre ; la section *Scoping*
est le seul endroit où les postes hors périmètre apparaissent, avec leur motif. Un test échoue si
un poste `out of scope` figure dans le rail.

### R-F2 — L'assistant IA

> « Je ne vois pas mon assistant/Chat IA que j'aurais aimé voir en haut à droite. »

**Épreuve.** En haut à droite de tout écran de mission : un seul contrôle, *Assistant*, qui
ouvre un panneau de conversation. Le bouton *Ask the file* actuel est absorbé, pas dupliqué. Sur
le déploiement hébergé (`demoPublique`), le panneau tourne sur l'adaptateur de rejeu et le dit en
une ligne discrète ; en local, sur l'adaptateur réel. Une station `clics` l'ouvre et pose une
question.

### R-F3 — Le geste d'envoi

> « Bouton « Send to » n'est pas lisible et peu esthétique. »

**Épreuve.** Un seul contrôle pour envoyer (pas un menu déroulant suivi d'une flèche). Lisible
en `visuel` ; verdict du fondateur sur capture.

### R-F4 — *My assignments*

> « Section my assignments est trop chargé, il faut mettre les sous sections (Currently with me,
> assigned to me, tracked by me) à la suite verticalement et mettre la possibilité de hide les sous
> sections. »

**Épreuve.** Les quatre blocs sont empilés, chacun repliable, l'état de repli mémorisé par
personne (`ui_repli` existe déjà). Un même objet n'apparaît **qu'une fois** sur l'écran, dans le
bloc le plus spécifique — aujourd'hui *Chiffre d'affaires* y figure trois fois. Test : aucun
identifiant dupliqué dans le rendu.

### R-F5 — « Ce qui empêche de signer »

> « Section « Ce qui empêche de signer » à supprimer, inutile. »

**Décision de réconciliation (§0.1) :** la liste des obstacles au visa **n'est plus une section**.
Elle est le message que rend le bouton *Sign* quand il refuse — visible seulement à cet
instant — et un compte discret dans l'en-tête de mission. Les gardes qui la produisent ne changent
pas d'un octet.

**Épreuve.** Aucune section « obstacles » dans le rail ni dans la page ; le geste *Sign* sur un
dossier bloqué affiche la liste, nommée, et refuse (`NOTIF-01` et les autres observés là).

### R-F6 — La couleur

> « Changer le code couleur violet ça ne fait pas pro. »

**Décision (le fondateur ne veut pas être sollicité sur les hexadécimaux) :** palette neutre
professionnelle — encre et gris froids pour le texte et les surfaces, **une seule couleur
d'accent** pour l'interactif (pas de violet), couleurs sémantiques réservées aux statuts
(signé / en revue / bloqué / périmé) et jamais employées pour décorer. Grâce à H-6, la palette
est aujourd'hui **quelques jetons dans `globals.css`** : c'est une tranche courte, nommée par le
fondateur, la seule exception au gel de H-6.

**Épreuve.** Aucune occurrence de violet dans les jetons ; `visuel` reshooté ; verdict du fondateur
sur trois captures (tableau de bord, poste, papier).

### R-F7 — Les notes de revue

> « On a toujours du mal à comprendre à quel endroit se rattache les review notes, je l'avais
> pourtant précisé : je veux une vision listing à l'instar des commentaires que l'on laisse sur un
> fichier Word, disponible dans chaque section, qui s'affiche à droite. Et des symboles, surlignage
> sur les endroits où des review notes ont été laissées. »

C'est la remarque la plus importante du mandat : elle a **déjà été faite** et n'a pas été suivie.

**Épreuve.** Dans toute section : un panneau à droite listant les notes de la section, ancrées ;
sur le corps de la section, un marqueur à chaque endroit annoté ; un clic sur le marqueur ouvre
la note, un clic sur la note fait défiler jusqu'au marqueur. Une note ne se résout pas à un
endroit réel = test en échec. Station `clics` : laisser une note sur une cellule, la retrouver dans
le panneau, y répondre, la clore.

### R-F8 — Les signatures

> « Les infos sur la signature des auditeurs sont trop nombreuses, cela surcharge la plateforme.
> Lorsque l'on hover avec la souris sur la signature, le nom, prénom et la date s'affichent, cela
> suffit. Et la signature : mettre juste les initiales, pas besoin de rappeler l'indicatif du
> working paper. »

**Épreuve.** Une carte de signature = rôle + initiales. Survol = nom complet + date. Aucune
référence de papier dans la carte. L'état *STALE* reste visible (c'est un fait, pas un décor) —
par un marqueur, pas par une phrase.

### R-F9 — Les références croisées

> « Ce paragraphe est inutile et surcharge, et la cross-reference vers la revue analytique est
> moche. Faire quelque chose de plus minimaliste : par exemple deux flèches se superposant, une
> allant à droite et l'autre à gauche ; au hover on voit vers quelle section la cross-reference est
> liée et on peut cliquer dessus pour y accéder. »

**Épreuve.** Une référence croisée = une icône (⇄), survol = cible nommée, clic = navigation.
Le paragraphe explicatif est retiré (`EPURE-01`).

### R-F10 — La revue analytique

> « Retirer les boutons « Save the analytical review », « Propose wording… ». Si la revue doit
> être changée manuellement, juste clic sur la text box et on écrit, c'est tout. Si elle ne suffit
> pas et qu'on veut que ce soit l'Agent IA qui la change, clic dessus, ajout review note et on
> l'adresse à l'agent IA. »

**Épreuve.** Le texte est éditable en place, sauvegarde implicite et versionnée (le versionnage
existe : `v1 · written by …`). Aucun bouton. Une note adressée à l'agent (§0.3) produit une
proposition en surlignage jaune (§0.2). Station `clics` sur les deux gestes.

### R-F11 — La section Revenue

> « Dans la section revenue je vois tout à la suite : après leadsheet, en dessous process, etc.
> Ces sous-sections ne sont pas liées directement, donc ne pas les mettre à la suite verticalement,
> cela fait trop. Pour naviguer entre ces sous-sections je préfère la barre latérale. Il faut
> d'ailleurs supprimer la sous-section « Analytical review » de la barre latérale, celle-ci étant
> directement liée à la Leadsheet. »

**Épreuve.** Une sous-section à l'écran à la fois, choisie dans le rail ; *Analytical review*
n'est plus une entrée du rail mais une partie de *Leadsheet*.

### R-F12 — Le bouton « Open process »

> « Dans la section process je vois le bouton « Open process » qui me renvoie vers la section
> process, alors que moi je veux directement, dans cette sous-section, tout voir. »

**Épreuve.** Le contenu s'affiche en place ; aucun bouton qui renvoie vers une autre page pour
voir ce que la sous-section est censée montrer.

### R-F13 — Plusieurs processus par poste, et une légende

> « Pour le process flowchart attention, il peut y en avoir plusieurs par FSLI. Donc prévoir des
> moyens d'ajouter des sous-sections (une par process identifié). Aussi il faudrait ajouter une
> légende pour les pictogrammes (contrôles du process, type de flux, ERP, etc.). »

**Épreuve.** Un poste porte N processus, chacun sa sous-section ; on en ajoute un par un clic ;
une légende explique chaque forme employée sur le diagramme.

### R-F14 — L'ordre des sous-sections de contrôle interne, et le transcript

> « Dans la section interview je ne vois pas le transcript, et on a du mal à comprendre l'ordre
> des sous-sections : est-ce logique ? (Internal control and processes, puis Process diagram, N /
> N-1 Difference (à renommer, je n'aime pas), et enfin Interviews.) »

**Décision :** l'ordre suit la logique de la mission — **Interviews** (avec le transcript visible)
→ **Process** (les diagrammes, un par processus) → **Controls** (la mini-RCM du poste, R-F17) →
**Changes since N-1** (le nouveau nom de *N / N-1 Difference*).

**Épreuve.** Le transcript d'un entretien est lisible dans sa sous-section ; l'ordre ci-dessus
est celui du rail ; l'ancien nom n'apparaît plus.

### R-F15 — Le fondateur ne comprend pas l'import JSON

> « Je ne comprends pas la section « Internal control and processes » avec le bouton « Import the
> description ». »

**Décision :** l'import d'un fichier JSON est un geste de développeur qui a fui dans le produit.
Il est **retiré de l'interface** (le mécanisme peut rester derrière le semeur). Il est remplacé
par R-F16.

### R-F16 — L'agent de flowchart (spécifié par le fondateur)

> « Selon moi, dans chaque sous-section de process flowchart, on a un bouton pour upload ou
> ré-upload le flowchart du process donné par le client. Et un agent IA va générer automatiquement
> le flowchart et comparer ce qui a été dit lors de la réunion de process avec le client et ce qui
> apparaît sur le flowchart. L'agent IA apportera alors des modifications highlightées en jaune,
> avec une review note rédigée expliquant pourquoi il a ajouté cette modification par rapport au
> flowchart reçu du client — exemple : « Lors de la réunion, le client a mentionné l'ERP SAGE alors
> que sur le flowchart on voit Oracle. » »

C'est **l'agent de walkthrough du Lot 8**, désormais spécifié par le fondateur, et c'est le motif
du §0.2 sous sa forme d'origine. Il reste derrière les trois gestes et derrière `demoPublique`
sur l'hébergé ; sur l'hébergé il tourne sur l'adaptateur de **rejeu**, qui doit **montrer** le
résultat.

**Épreuve.** Sur le monde semé, un processus porte un flowchart client déposé, un diagramme
engendré, et **au moins une différence surlignée en jaune avec sa note** (le rejeu la contient).
Accepter la différence par un clic la fait entrer au diagramme ; la refuser la retire ; les deux
gestes sont tracés. Station `clics`.

### R-F17 — Les contrôles du poste, et le détail d'un contrôle

> « Pour la sous-section « Internal Control », même remarque : je suis renvoyé vers la RCM alors
> que je veux juste les contrôles rattachés au FSLI Revenue. On pourrait faire, au sein de la
> section Revenue, une mini-RCM avec seulement les contrôles Revenue. La RCM par ailleurs n'est pas
> bien : on voit les contrôles mais lorsque l'on clique dessus, impossible d'accéder au détail de
> ces contrôles (= documentation d'audit avec le D&I et l'OE). »

**Épreuve.** Dans le poste : la liste de ses seuls contrôles. Partout où un contrôle est affiché
(poste, RCM), un clic ouvre **sa documentation** — D&I (tâches, procédures, IUC, quatre facteurs)
et OE (population, tirage, tests). Un contrôle sans page de détail atteignable = test en échec
(c'est un `SEMEUR_VS_CHEMIN` : les objets `control_*` existent, le chemin humain manque).

### R-F18 — L'évaluation des risques

> « Dans le risk assessment, la partie « Risk by Assertion » est à modifier et à changer de place.
> D'abord on fait la partie « Entity questions — asked once » avec les questions quantitatives et
> qualitatives ; pour cette partie je n'aime pas la façon d'afficher les questions : il faut une
> text box modifiable et remplissable pour chaque question, et pas de boutons « to answer », « save »
> et de box « detail — required if yes ». Par contre OK pour un bouton de création automatique de
> requête client. Après, la sous-section « Risk by assertion », et ici on met juste : Assertion,
> risk level (NRPMM = no risk, mais ici documentation obligatoire pour justifier ; Lower ; Higher ;
> Significant). Retirer les colonnes Computed, Retained, What Produced It et Arbitrate. »

`NRPMM` est le sigle du fondateur, repris tel quel, non développé de mémoire.

**Épreuve.** Ordre : questions d'entité (une zone de texte par question, sauvegarde implicite,
un bouton *Demander au client* par question) puis risques par assertion (deux colonnes :
assertion, niveau parmi `NRPMM` / `Lower` / `Higher` / `Significant`). Un niveau `NRPMM` sans
justification écrite **refuse** de se sauvegarder (`RISK-01`, en toutes lettres). Provenance au
survol (§0.1), aucune colonne de plus.

### R-F19 — « Arbitrate », partout

> « Remarque générale : je vois souvent des colonnes et sections du style « Arbitrate ». Ces
> parties surchargent la plateforme d'audit et sont à supprimer. Tout devrait être modifiable par
> des auditeurs humains, donc ces sections sont inutiles. Si quelque chose doit être changé, alors
> on le fait directement manuellement. »

Réglé par le §0.1 et le §0.2 : la valeur est modifiable en place ; l'acceptation est un clic sur
le marqueur ; la trace est intacte.

**Épreuve.** Le mot *Arbitrate* n'apparaît dans aucune vue (`EPURE-01`). Un test prouve que
modifier une valeur proposée par l'IA écrit bien qui l'a modifiée et quand — la trace ne s'est
pas perdue avec la colonne.

### R-F20 — Le rapprochement de l'échantillon

> « Section sample : j'aimerais quelque chose de plus étoffé pour la partie « step 2
> reconciliation », où on voit les montants réconciliés (solde du compte leadsheet avec la
> cross-ref vers la leadsheet, et montant du détail client obtenu). »

**Épreuve.** L'étape 2 affiche : solde leadsheet (⇄ vers la leadsheet), total du détail obtenu,
écart, et l'état rapproché / non rapproché. `POP-01` continue de refuser le tirage tant que
l'écart n'est pas nul ou expliqué.

### R-F21 — Le vocabulaire de l'échantillonnage

> « Section « Revenue sampling — propose (L3) → validate → draw (L0, deterministic) » :
> supprimer le wording inutile, juste mettre « Sampling ». Peut-être rajouter une étape en plus
> appelée « Sampling Methodology » (Random Sample, Monetary Sample, Sample Size). Retirer le
> « Drawn » dans la section Revenue sampling. »

**Épreuve.** Titre : *Sampling*. Une étape *Methodology* expose la méthode (aléatoire / unités
monétaires) et la taille, chacune avec sa source de pack ou son « paramètre non vérifié »
(`CTRL-07`, annexe du 10 septembre). Ni `L0`, ni `L3`, ni *deterministic*, ni *Drawn* à l'écran
(`EPURE-01`).

### R-F22 — La langue

> « Enfin, je vois encore beaucoup de choses rédigées en Français. »

**Décision (réversible d'un mot du fondateur) :** le monde de démonstration est présenté **en
anglais de bout en bout** — chrome ET libellés semés (noms de procédures, de contrôles, de
processus, textes des notes). Le catalogue `fr` reste intact pour un cabinet francophone ; c'est
le pack `nep-fr` de démonstration qui bascule sur `en`. Aucune phrase d'un écran ne mélange les
deux langues.

**Épreuve.** La garde `langue` (0 hors catalogue) tient ; une nouvelle lecture compte les
libellés semés non anglais sur le monde de démonstration et doit lire 0.

---

## 2. Observations du superviseur, sur les mêmes captures — à vérifier, pas à tenir pour acquises

- **S-1 — Un gabarit a fui.** Le titre *« Process diagram {nom} — Cycle ventes… »* affiche le
  littéral `{nom}`. Épreuve générale : aucun `{…}` non résolu dans aucune des 356 vues — garde
  mécanique, à ajouter à `visuel`.
- **S-2 — Les cartes de signature sont incohérentes entre elles.** Sur un même papier : *Preparer
  — STALE · REV-06*, *Reviewer — signed · REV-02*, *Partner — signed · REV-02*. Si `REV-xx` est une
  procédure, la carte agrège des signatures d'objets différents ; si c'est une version, un
  relecteur signé sur une version antérieure ne peut pas être « signed » quand le préparateur sur
  une version postérieure est « STALE ». Dans les deux cas, à établir par lecture du code, puis
  corriger.
- **S-3 — Trois langues sur un écran.** Chrome en anglais, données en français, bouton natif du
  navigateur en français (*Choisir un fichier*). Réglé par R-F22 et par un composant de dépôt
  stylé.
- **S-4 — La justification du jeu de démonstration fuit dans le produit.** *« Hors périmètre du jeu
  de démonstration : seul le cycle chiffre d'affaires y est déroulé. Ce n'est PAS un jugement de
  significativité… »* est un texte destiné au fondateur, pas à un auditeur. Réglé par `EPURE-01` :
  le motif de descoping se dit en une ligne factuelle.
- **S-5 — Le même objet répété.** *My assignments* montre *Chiffre d'affaires* trois fois
  (R-F4).
- **S-6 — Un import JSON comme geste utilisateur** (R-F15).

---

## 3. Ce que ce mandat ne demande pas

- Aucune tranche H-6 de jetons CSS : H-6 reste gelé. La palette (R-F6) est **l'unique exception**,
  nommée ici.
- Aucune ré-écriture des gardes : `L2`, `NOTIF-01`, les `CTRL-*`, `MAT-*`, `EXTRAP-*`, `POP-01`
  sont intacts. Ce mandat change leur habillage, pas leur substance — et chaque tranche le prouve
  par un test qui montre la garde refusant **encore** après le changement d'écran.
- Aucune activation d'IA réelle sur l'hébergé (`demoPublique`, ADR-109). L'agent de R-F16 tourne
  sur le rejeu là-bas, sur l'adaptateur réel en local.

---

## 4. Phase B — l'audit technique, borné

Le fondateur a demandé un audit critique et approfondi de la plateforme (interface, workflows,
logique métier, architecture, modèle de données, provenance, traçabilité, sécurité, scalabilité,
automatisation réelle) selon trois regards — auditeur, product lead, architecte enterprise — avec
une priorisation `P0`/`P1`/`P2`/`P3` et un plan d'exécution. **Il tient, sous quatre bornes :**

1. **Lecture seule.** La session d'audit ne modifie aucun fichier de code. Elle commet un seul
   artefact : `docs/AUDIT.md`, et son instantané `docs/instantanes/audit.json` (règle 21).
2. **Un budget nommé** : une session, six heures de mur au plus. À l'échéance, l'audit se commet
   dans l'état où il est et le dit.
3. **Une sortie bornée, pas un essai** : au plus **25 constats**, chacun avec : identifiant,
   priorité, dimension, le défaut en une phrase, la preuve (`fichier:ligne` ou vue), le correctif
   concret, l'épreuve d'acceptation, la taille (S/M/L), et **refonte : oui/non**. Puis l'évaluation
   sur les douze dimensions demandées, **une page**, causes et non notes.
4. **Le périmètre : ce que le fondateur ne peut pas voir.** Modèle de données et relations,
   provenance et piste d'audit, sécurité et étanchéité multi-locataire, architecture et montée en
   charge, automatisations manquantes ou factices, duplications de saisie, fonctionnalités mortes
   ou juxtaposées, ce qui obligerait à reconstruire plus tard. **Pas l'UX visuelle** : le §1 la
   couvre, par l'auditeur lui-même, et il prime.

L'audit est **hostile par construction** : il ne défend pas l'existant. Les questions du fondateur
sont reprises telles quelles comme grille : *est-ce réellement utile ? suffisamment bien conçu ?
intuitif pour un auditeur ? réduit-il réellement le travail humain ? élimine-t-il Excel/Word ?
l'information saisie une fois est-elle réutilisée partout ? y a-t-il des duplications, des étapes
manuelles supprimables, des incohérences entre écrans, des automatisations factices, des risques de
perte de provenance ? qu'est-ce qui empêcherait aujourd'hui un grand cabinet de prendre cette
plateforme au sérieux ?*

---

## 5. Phase C — l'exécution : le régime de la clôture, reconduit

1. **Un seul inventaire** : `docs/REVUE.md`, engendré, qui fusionne les lignes du §1, du §2
   (vérifiées) et les `P0`/`P1` de l'audit. Chaque ligne : OBSERVÉE / NON OBSERVÉE / SANS OBJET.
   Les `P2`/`P3` de l'audit sont **enregistrés au registre** (`BACKLOG_REPORTE.md`), pas mis à
   l'inventaire.
2. **Ordre** : les `P0` de l'audit qui touchent le modèle de données **d'abord** (on ne construit
   pas les écrans du §1 sur une base que l'audit ferait changer) ; puis R-F7 (notes de revue) et
   §0.1–0.2 (le motif de proposition IA), parce que la moitié des autres lignes en dépend ; puis
   le reste, **le moins cher d'abord**.
3. **Un rituel par ligne**, jamais par micro-tranche ; la chaîne `verify` une fois par rituel ;
   le SHA servi confirmé dans le même compte rendu. Règles 34, 35, 36.
4. **Deux réfutateurs** (règle 30) sur toute ligne qui touche le modèle de données, la sécurité,
   ou un code de refus — donc sur §0.1–0.2, R-F7, R-F16, R-F17, R-F18.
5. **Quand l'inventaire est vide, l'agent le dit et s'arrête.** Toute suite viendra d'un mandat.

---

## 6. Ce qui ne change pas

Tous les invariants D.0 et les interdits permanents tiennent : un état que seul le semeur produit
est un décor ; une garde qui n'a jamais rien refusé n'est pas une garde ; aucune mesure sur un
arbre qui bouge ; aucune attente non bornée ; le compte rendu est engendré ; rien ne sort du
registre en silence ; aucune donnée réelle ; aucun service payant ; aucune IA vivante sur
l'hébergé ; `PLAN_RLS` étape 3 jamais ; `DATABASE_URL` intouché ; la clé jamais imprimée.
