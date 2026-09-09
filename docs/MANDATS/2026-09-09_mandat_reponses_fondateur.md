# OTTO — Mandat du fondateur : les cinq réponses attendues

Dicté par le fondateur le 9 septembre 2026, en réponse aux points que lui seul pouvait trancher.
Commité verbatim selon la règle 33. Complète le mandat du 8 septembre, ne le remplace pas.

---

## 1. La table d'échantillonnage — cherchée, sourcée, jamais de mémoire

**Décision du fondateur :** l'agent **cherche en ligne** la méthodologie d'échantillonnage
d'attributs qui lui paraît la plus appropriée, et la met en place. La méthodologie propre au
cabinet sera ajoutée ensuite ; l'objectif immédiat est **d'avoir de quoi montrer en présentation**.

Ce que cela change par rapport au mandat du 8 septembre (§3.2) : la table n'est plus livrée vide.
Elle est **remplie depuis une source publique, primaire et citable**.

Les conditions, elles, ne bougent pas :

- Chaque ligne porte sa **source** (`source_text`, référence exacte, date de consultation).
  Une valeur sans source reste `verifie:false` et refuse le tirage.
- **Aucune valeur de mémoire.** Si la recherche ne donne pas de texte primaire pour une fréquence,
  la ligne reste vide et le refus `CTRL-07` tient pour cette fréquence-là.
- La méthodologie interne d'un cabinet — Deloitte comprise — **n'est pas une source** et n'entre
  pas au dépôt. Elle viendra plus tard, saisie par le cabinet, par le même mécanisme d'écrasement.
- La table reste **écrasable par le cabinet**, sans modification de code.
- L'agent écrit « usuelle », jamais « exigée par la norme », sauf s'il détient le texte primaire
  qui l'exige (règle existante, Partie C.2).

**Cette même règle vaut pour tout seuil de ce mandat** — y compris le CTT du §2 : cherché, sourcé,
citable, écrasable par le cabinet. Jamais écrit de mémoire.

---

## 2. R30, tranché : ce qu'un nouvel import déclenche, et ce qu'il ne déclenche pas

**Décision du fondateur :** un nouvel import de balance ou de grand livre **ne relance pas tout**.

- Un **rapprochement est refait** — oui.
- Le tirage **n'est pas relancé** et le travail déjà fait n'est **jamais effacé** (règle 28).

Mais l'import doit produire trois choses qui n'existent pas aujourd'hui :

### 2.1 Le drapeau de bascule de matérialité

Un **drapeau automatique sur les comptes passés de non matériels à matériels**, dont l'objet est
explicite : *voir si on a loupé du testing*. Il nomme le compte, la date de bascule, l'import qui
l'a causée, et ce qui n'a pas été testé pendant qu'il était réputé non matériel.

### 2.2 L'ouverture automatique de la section

**Si un import rend un FSLI matériel, sa section de documentation est engendrée automatiquement** —
leadsheet, GRA, et le reste de ce que la méthode du cabinet ouvre pour un poste matériel.

> `GRA` est le sigle du fondateur. Il n'est **pas développé de mémoire** : la section reprend ce que
> la méthode du cabinet nomme ainsi. En cas de doute, l'agent laisse le sigle et demande.

### 2.3 La demande de détail au-dessus du CTT

Une **demande de détail est créée sur les comptes au-dessus du CTT**. Elle réutilise le mécanisme de
demandes de la Partie B — `client_request` typée, destinataire déduit, lien cliquable — **aucun
chemin neuf, aucun formulaire parallèle**.

### 2.4 Les refus

> **`MAT-01`** — viser un dossier où un FSLI est devenu matériel sans que sa section soit ouverte.

> **`MAT-02`** — conclure un FSLI devenu matériel sans qu'une demande de détail existe pour ses
> comptes au-dessus du CTT.

> **`MAT-03`** — un ré-import qui effacerait un tirage, un papier ou un visa existant. Le
> rapprochement se refait ; le travail, jamais.

### 2.5 Les épreuves

1. Un import qui fait basculer un compte **fait apparaître le drapeau**, nommant le compte et la
   date — observé, pas déclaré.
2. Le même import **ouvre la section** du FSLI devenu matériel, avec sa leadsheet.
3. Il **crée la demande de détail** pour les comptes au-dessus du CTT, visible dans l'espace de
   demandes, atteinte par un clic.
4. Un ré-import sur un poste déjà testé **ne détruit rien** : le tirage, les papiers et les visas
   sont toujours là après (`MAT-03` observé sur une tentative).

---

## 3. La vidéo du walkthrough

**Décisions du fondateur :**

- **Stockage : sur la plateforme de documentation elle-même**, avec le reste des pièces.
- **Idéalement déposée automatiquement au bon endroit dès la fin de la réunion**, sans intervention
  humaine.
- **L'upload manuel reste toujours possible**, en secours.
- **Un bouton pour déposer, un bouton pour supprimer.**
- **Durée de conservation limitée à l'archivage** : X jours après la signature du rapport **et** la
  clôture des notes de revue du dossier.

### 3.1 L'ordre de construction

1. **Maintenant** : le dépôt manuel et la suppression, la vidéo rangée comme une pièce du dossier
   avec sa provenance (qui, quand), et le compteur de conservation.
2. **Plus tard, derrière la même porte que le Lot 8** : le dépôt automatique en fin de réunion. Il
   suppose une intégration avec la plateforme de réunion (webhook d'enregistrement, informations
   d'accès), donc un service externe et des identifiants — ce que les interdits permanents ne
   permettent pas encore. Le chemin manuel n'est pas un pis-aller à remplacer : il reste le secours
   permanent, comme demandé.

### 3.2 La conservation

- `X` est un **paramètre de pack**, `verifie:false`, affiché « à fixer par le cabinet ». Aucune
  durée n'est inventée.
- Le compte à rebours **ne démarre que lorsque les deux conditions sont réunies** : rapport signé
  **et** notes de revue closes. Tant que l'une manque, la vidéo ne devient jamais éligible à la
  purge.
- La suppression est **toujours tracée** — qui, quand, pourquoi — et jamais silencieuse.

> **`VID-01`** — conclure ou maintenir conclu un D&I dont la vidéo d'inquiry a été supprimée, sans
> qu'une autre preuve d'inquiry la remplace. La piste d'audit ne peut pas citer une pièce absente.

---

## 4. Lot 8 : le seuil de dépense peut monter, mais après la mesure

**Décision du fondateur :** *« je peux surélever le seuil des dépenses aucun souci, mais cela doit
être utile et efficace. »*

Ce n'est donc pas une autorisation de dépenser : c'est une autorisation **conditionnelle**, et
l'ordre suivant est impératif.

1. **La garde de budget en base d'abord**, telle que le plan l'exige — plafond en base, chemin fermé
   par défaut, aucune clé au dépôt. Elle existe et refuse **avant** qu'un centime soit engageable.
2. **Puis la mesure** : l'agent estime, sur du matériel **synthétique**, le coût réel d'un
   walkthrough analysé — jetons entrants et sortants, durée de vidéo, coût par contrôle documenté —
   et le présente comme un chiffre engendré, pas une estimation de prose.
3. **Puis seulement**, le fondateur relève le plafond, en connaissance du coût par unité.

Tant que 1 et 2 ne sont pas faits, **rien n'est activé et aucune clé n'est demandée**. Le plafond
L2 tient au-delà : le modèle propose, l'auditeur valide, rien de généré n'entre au dossier sans
validation tracée.

---

## 5. L'épure : le verdict est différé, à la demande du fondateur

**Décision du fondateur :** *« pour le design, j'attends le rendu finalisé, je ferai mes remarques
après. »*

Conséquence, pour que personne n'attende personne : **R59 à R62 restent reportés**, l'agent ne les
rouvre pas et ne réclame pas d'arbitrage esthétique. L'épreuve mécanique de D.6 continue de
s'appliquer à tout écran neuf — elle, elle ne se différe pas.

---

## 6. Ce qui ne change pas

Tous les invariants D.0 et les interdits permanents tiennent. En particulier, et parce que ce
mandat s'en approche : aucune donnée réelle, aucun service payant, aucune IA vivante activée,
`PLAN_RLS` étape 3 jamais, et aucune constante — seuil, taille, durée, référence normative — écrite
de mémoire.
