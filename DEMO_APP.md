# DEMO_APP.md — la mission entière, dans l'application

Ce document est un **parcours**, pas une note : il se déroule à l'écran, étape par étape, et
chaque étape a une **commande qui la rejoue**. Une vérification que personne ne peut rejouer est
une affirmation.

> **Le harnais qui rejoue ce parcours** : `cd app && npx vitest run ../tests/parcours.test.ts`.
> Il exécute les **mêmes services que les écrans**, dans le même ordre, avec les mêmes refus — et
> il ne peut pas passer tant qu'une seule règle du dossier reste insatisfaite, parce que la clôture
> demande la liste complète des obstacles au visa.

---

## Avant de commencer

```bash
cd app
npm install
npm run db:reset        # base fraîche, monde de démonstration, méthode publiée
npm run demo:seed       # déroule le dossier jusqu'au papier de travail signé
npm run dev             # http://localhost:3000
```

Connectez-vous en **Claire Fontaine** (associée). Le dossier à suivre est
**Altiverre FY2025 — Audit légal (NEP)**.

---

## Le parcours, en quinze étapes

### 1. La méthode du cabinet — avant tout le reste

**Écran** : « La méthode du cabinet », depuis l'accueil.

Vos procédures, seuils, échelle de risque, jeu d'assertions, questionnaire, rubriques
d'indépendance **et le gabarit de vos papiers** sont des données publiées pour **votre** cabinet.

**Ce qu'il faut montrer** : cliquez `risque.json`, changez une taille d'échantillon, **Vérifier sans
publier**. Rien n'est écrit. Puis introduisez une faute — un niveau `« lourd »` que les procédures
n'exigent pas — et vérifiez : la liste des erreurs nomme **chaque procédure fautive** et donne le jeu
réel. *Le refus se corrige sans nous appeler.*

> **La phrase** : « votre méthode reste la vôtre, vous la chargez, je ne la vois jamais ».

---

### 2. Créer le dossier

**Écran** : accueil → **Créer un dossier**.

Entité, exercice, nature, référentiel. Le dossier naît en `setup`, avec la **méthode en vigueur**
désignée — sans elle il ne pourrait rien planifier, et personne ne saurait pourquoi.

**Ce qu'il faut montrer** : recréez le même dossier une seconde fois. Refusé : *deux dossiers de même
nature sur le même exercice feraient deux vérités sur les mêmes comptes.*

---

### 3. Accepter la mission — un dossier commence par une décision

**Écran** : `Acceptation`.

**Ce qu'il faut montrer, dans cet ordre :**

1. Essayez d'affecter quelqu'un à l'équipe **avant** de décider → refusé.
2. Répondez défavorablement à un critère **bloquant**, sans précision → « ce qui manque pour décider »
   le nomme. *« Bloquant » ne veut pas dire « interdit d'accepter » : un cabinet peut accepter une
   mission difficile, il ne peut pas l'accepter sans le dire.*
3. Décidez **sans motif** → refusé, dans les deux sens. *Accepter sans motif ne se relit pas plus que
   refuser sans motif.*

**Les jalons** : posez la date de rapport. Le **délai d'assemblage** se calcule tout seul —
31/03/2026 + 60 jours = **30/05/2026** (C. com. D. 821-186 III-IV). Essayez de le saisir : refusé.
*Une date dérivée qu'on pourrait saisir deviendrait fausse le jour où quelqu'un la corrige.*

---

### 4. L'équipe et l'indépendance

**Écran** : `Team & independence`.

**Ce qu'il faut montrer** : affectez **Hugo Vasseur**. Refusé — sa déclaration n'est pas signée.
Il existe pour ça. *Le système refuse ; il ne rappelle pas.*

---

### 5. Reprendre l'exercice précédent

**Écran** : `Reprise N-1`.

Le dossier FY2024 existe pour de vrai — construit par les mêmes services que les clics, avec son
acceptation, ses déclarations signées et ses motifs de non-significativité.

**Ce qu'il faut montrer** : « Proposer la reprise ». **Rien n'est appliqué** : tout arrive *proposé*,
et chaque proposition **bloque le visa** tant qu'elle n'est pas statuée. Essayez d'**écarter** sans
motif → refusé ; **reconfirmer** n'en demande pas. *Reconfirmer, c'est dire « j'ai regardé et c'est
toujours vrai » ; écarter sans motif est indistinguable d'un oubli.*

---

### 6. Les données, le rapprochement, les seuils, le périmètre

**Écrans** : `Data & imports`, `Reconciliation`, `Materiality`, `Scoping`.

Déjà déroulés par `npm run demo:seed`. Le rapprochement porte une **limitation consignée** : l'écart
tient à une écriture absente du grand livre, il n'y a ni pièce à joindre ni écriture à citer, et le
fichier reste **provisoire** — ce qui bloquera la conclusion, pas les travaux.

---

### 7. Le risque par assertion — et ce qu'il commande

**Écran** : `Risk by assertion`.

**Ce qu'il faut montrer** : baissez `séparation` de « moyen » à « faible » avec un motif. Les
procédures de *cut-off* **sortent** de la liste des travaux requis. Remontez : elles reviennent.
*C'est ici que le risque cesse de décorer.*

Regardez la colonne **Taille** : au niveau élevé elle est calculée par une **formule nommée**
(`mus_intervalle_au_seuil`), et le chiffre porte **ses entrées** — population et seuil — sous lui.

**Les deux ratios**, sous le questionnaire : **méthode** 5 règles calculées / 10 sources déclarées =
**33,3 %** de quantitatif ; **ce dossier** — ce qui a réellement été levé. *Le second peut être
mauvais alors que le premier est bon.*

---

### 8. Le questionnaire résiduel

**Écran** : `Risk by assertion`, panneau du bas.

**Ce qu'il faut montrer** : répondez **oui** à une question. Elle ne coche rien : elle **crée un
facteur au registre**, avec sa source et son texte. Confirmez-le : il **monte le niveau** et fait
entrer des procédures. Laissez-le *proposé* : il ne compte pas — *un moteur qui lève n'a pas décidé.*

---

### 9. La boucle

**Écran** : `La boucle`.

Neuf étapes, ce qui a **franchi**, ce qui est **arrêté là**, et **ce qu'on attend** — nommément,
jamais « en cours ».

**Ce qu'il faut montrer** : le **nombre de tours**. Une file d'étapes se parcourt une fois ; une
boucle **repart**. Un écart génère une demande de clarification, et c'est ce compteur qui le prouve.
La liste du bas dit **de quel écart** chaque demande est née.

---

### 10. Le papier de travail

**Écran** : `Workpapers`.

**Ce qu'il faut montrer** : le papier porte **la référence du plan de classement du cabinet**
(`A-01`), pas notre numérotation. Ouvrez `papier.json` dans la méthode : déplacez « Évaluation »
avant « Exceptions », renommez les colonnes, publiez, redraftez. Le PDF sort avec **votre** ordre et
**vos** intitulés.

Puis retirez le bloc `verification` du gabarit → l'assemblage **s'arrête** : *un bloc implémenté que
le gabarit ne nomme pas disparaîtrait du papier sans que rien ne le dise.*

---

### 11. Le pointage des états financiers

**Écran** : `États financiers`.

**Ce qu'il faut montrer** : « Charger la plaquette », puis « Repointer ». Deux natures se
**calculent** ; la troisième — l'effectif moyen — **ne vient d'aucun compte**. Essayez de la
documenter sans pièce → refusé. *Une justification sans pièce n'est pas une justification.*

Essayez de « documenter » à la main une ligne qui se calcule → refusé aussi : *ce serait déclarer
pointé ce que le moteur n'a pas rapproché.*

---

### 12. L'achèvement

**Écran** : `Achèvement`.

Cinq travaux, et leurs règles sont des **dates**.

**Ce qu'il faut montrer** :

- Événements postérieurs menés jusqu'au **28/02** alors que le rapport est daté du **31/03** →
  refusé, et le refus **nomme la période non couverte**.
- Lettre d'affirmation datée **avant** le rapport → refusée : *elle ne couvre pas la période
  auditée*.
- Lettre **sans la lettre** → refusée : *c'est une lettre, pas une conversation*.
- Lettre déclarée « sans objet » → refusée : *une mission sans lettre d'affirmation n'est pas
  allégée, elle est incomplète.*

---

### 13. Les obstacles au visa

**Écran** : `Obstacles au visa`.

**Une seule liste**, calculée, transverse : acceptation, indépendance, reprise, questionnaire,
boucle, pointage, évaluation, achèvement, jalons. Chaque obstacle dit **où aller le lever**.

> Ce que la page **n'affirme pas**, et c'est écrit dessus : « aucun obstacle » ne veut pas dire que
> le dossier est **bon**. Il veut dire qu'**aucune règle ne le refuse**. Le jugement reste au
> signataire.

---

### 14. La clôture

**Écran** : `Provenance` / clôture du dossier.

**Ce qu'il faut montrer** : tentez de clore **avant** d'avoir tout levé → refusé, avec le **compte**
et les premiers obstacles. Le grand livre **provisoire** bloque aussi — et c'est la règle, pas un
accident : *un dossier qui se clôt sur un FEC provisoire serait le vrai défaut.*

Une fois tout levé : l'archive est scellée, **rejouable à l'octet près**, avec ses empreintes
re-vérifiées et un README sans lien externe. Le délai d'assemblage est **30/05/2026**.

---

### 15. La piste d'audit

**Écran** : `Event log`, `Provenance`.

**Les trois questions de P7**, posables sur n'importe quel chiffre : *pourquoi cette pièce
existe-t-elle ?*, *qu'est-ce qui soutient cette conclusion ?*, *d'où vient ce chiffre ?*

---

## Ce que ce parcours ne montre pas

Dit ici pour ne pas être cru par omission.

- **Aucun cycle au-delà du chiffre d'affaires.** C'est un choix : les procédures sont du contenu, la
  mécanique est le produit.
- **Le catalogue méthodologique reste non vérifié** — dix-neuf sources, toutes `verifie: false`.
  Aucune référence normative n'a été relue sur texte primaire par nous.
- **Le pack SOX est gelé.** Il tourne, il ne s'étend pas.
- **La plaquette est dérivée de la balance** dans le jeu de démonstration, faute d'un dépôt réel. En
  production elle est **déposée par le client** — et le constructeur de démonstration vit dans un
  fichier séparé pour que la différence reste visible.
- **Aucune donnée réelle, jamais.** Toutes les entités, personnes, SIREN, IBAN et pièces sont
  fabriqués.

---

## Les commandes qui rejouent tout

| Ce que ça prouve | Commande |
|---|---|
| L'arc entier, de l'acceptation à l'archive scellée | `cd app && npx vitest run ../tests/parcours.test.ts` |
| Toutes les règles, tous les refus | `cd app && npm test` |
| Tous les écrans rendent, en **production** | `cd app && npm run screens` |
| Le parcours se **clique** vraiment, en production | `cd app && npm run clics` |
| Base fraîche + dossier déroulé + types + tests + écrans + clics | `cd app && npm run verify` |

`npm run screens` **ouvre** les 60 routes ; `npm run clics` **agit** dessus. Les deux sont
nécessaires et ne se remplacent pas : six formulaires ont été inertes en production pendant une
tranche entière avec tous les écrans à 200 (ADR-078), et un dossier créé a été inatteignable en
étant parfaitement rendu (ADR-088). *Un écran qui rend n'est pas un écran qui marche.*

Sur les quinze étapes de `npm run clics`, **douze vérifient un refus** — décider sans motif, écarter
une reprise sans motif, documenter un chiffre sans pièce, conclure sans conclusion — parce qu'une
action qui aboutit prouve peu, et qu'un refus qui ne s'affiche pas n'existe pas pour l'utilisateur.
