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
npm run demo            # base vide → migrations → monde semé → serveur, puis le panneau
```

`npm run demo` fait à lui seul ce que faisaient `db:reset`, `demo:seed` et `dev`, et **affiche à la
fin** l'adresse, les trois rôles, le portail client et la commande de remise à zéro (ADR-095). Les
trois commandes séparées restent valables pour développer.

**L'IA vivante** : `npm run demo:ia` (ADR-105) lance la même démonstration avec l'échelon OCR
**réel** — la clé reste dans `app/.env.local` (le lanceur vérifie sa présence, jamais sa valeur),
le monde est semé en rejeu (zéro dépense), et un jeu de **pièces neuves jamais vues** est engendré
dans `dataset/pieces_neuves/` : déposez-en une au portail (VERITE.md dit laquelle va où et
lesquelles sont piégées), lancez l'échelle — le modèle lit pour de vrai, le coût s'affiche
(bandeau + ligne par ligne), l'attestation humaine reste obligatoire, et le vouching lève l'écart
né de la vraie lecture. Plafond de dépense : 5 $ (`OTTO_BUDGET_USD`) — au plafond, la lecture
suivante est refusée à l'écran. La mesure hors cache : `npm run eval:pieces-neuves`.

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

Un client — existant, ou **neuf par son nom** (enregistré fictif, sans numéro) — un exercice —
existant, groupé par client, ou **neuf par sa date de clôture** (jj/mm/aaaa ; douze mois, relié
tout seul à l'exercice qui finit la veille) — la nature, la **classe** (EIP, cotée, composante,
autre), le référentiel, la langue, le **référentiel de seuil préféré**, le nom. Le dossier naît en
`setup`, avec la **méthode en vigueur** désignée — sans elle il ne pourrait rien planifier, et
personne ne saurait pourquoi. Il s'ouvre sur son acceptation ; s'il a un N-1 de même nature,
l'en-tête le montre (**Dossier N-1**), sinon il ne l'invente pas.

**Ce qu'il faut montrer** : recréez le même dossier une seconde fois. Refusé : *deux dossiers de même
nature sur le même exercice feraient deux vérités sur les mêmes comptes.*

**Et regardez le rail à gauche** (ADR-103, ADR-112) : le dossier qui vient de naître montre **cinq
destinations** — vue d'ensemble, acceptation, équipe, réunions, journal — parce que le rail montre
**l'état du dossier, pas le catalogue des fonctions**. « Tout afficher » déplie la carte complète :
ce qui n'est pas encore atteignable y est **grisé avec sa raison** (« disponible après le tirage de
l'échantillon ») — jamais masqué sans explication. Le rail grandit à mesure que vous travaillez ;
sur Altiverre, déjà conduit, il est presque entier.

Il est **vertical et groupé** : Le dossier · Les comptes · **Les postes** · Travaux transverses ·
Demandes au client · Fin de mission. Le groupe du milieu porte **un poste retenu par ligne** — c'est
l'axe du produit : on ne va pas dans « échantillon », on va dans « chiffre d'affaires », et on y
trouve les six étapes dans l'ordre où on les travaille (leadsheet, processus, contrôle interne,
risques, échantillon, contrôle sur pièces). Les écrans qui servaient ces étapes ne sont plus dans le
rail : ils sont **dans le poste**.

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

**Écran** : `Équipe et indépendance`.

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

**Écrans** : `Balance et grand livre`, `Rapprochement comptable`, `Matérialité`, `Scoping`
(les deux derniers portent le mot du **pack de référentiel**, pas un mot du code — DA-15).

Déjà déroulés par `npm run demo:seed`. Le rapprochement porte une **limitation consignée** : l'écart
tient à une écriture absente du grand livre, il n'y a ni pièce à joindre ni écriture à citer, et le
fichier reste **provisoire** — ce qui bloquera la conclusion, pas les travaux.

**Le périmètre : UN poste.** Le chiffre d'affaires est le seul poste retenu ; les quinze autres sont
sortis avec un motif qui dit ce qu'il est — *« hors périmètre du jeu de démonstration »*, et non un
jugement de significativité. **Dites-le à voix haute en démonstration** : sur cette entité, la paie
pèse 2,6 M€ contre un seuil de planification de 27 000 €, le moteur les propose DANS le périmètre,
et un dossier réel les travaillerait. Le motif est visible à l'écran, au journal et dans l'archive.

**À montrer** : sur `Scoping`, dépliez « confirmé — revoir » et **remettez un poste au périmètre**.
Allez sur `Obstacles au visa` : la famille **« périmètre sans programme »** apparaît. Un poste retenu
sur lequel aucune procédure n'est planifiée est un trou dans le dossier — soit on le travaille, soit
on le sort avec un motif. Ressortez-le : l'obstacle tombe.

---

### 6 bis. Les balances auxiliaires — les tiers N/N-1, âgés et rapprochés

**Écran** : `Balances auxiliaires`.

**Ce qu'il faut montrer** (ADR-107) : importez les quatre exports de la cliente
(`dataset/balances_aux/` — clients et fournisseurs, N et N-1, avec l'ancienneté). Chaque
fichier se **rapproche au grand livre** : N au solde actif du collectif, N-1 **aux
à-nouveaux, au centime**. Sur le grand livre définitif, l'écart clients de **25 000 €** est
DIT en rouge : c'est l'écriture de situation, créditée au collectif **sans attribution
auxiliaire** — la balance des tiers ne peut pas la porter, et c'est exactement ce que ce
rapprochement existe pour attraper. Puis l'analyse : concentration du top 10 N/N-1, tiers
**apparus** et **disparus** nommés sur leurs lignes, **déplacements de part** au-delà du seuil
(réglable — montez-le, les constats s'éteignent), et la **déformation du vieillissement** :
la part au-delà de 90 jours passe de ~2 % à ~10 %, portée par Immovance et Peyrelle, nommés.
Chaque constat est un **candidat** : « Proposer au registre » le met en *proposé* — c'est au
registre qu'un humain confirme — et « Rédiger les questions au client » crée un **brouillon**
de demande, une question par constat.

---

### 6 ter. Le contrôle interne — le processus en données, l'entretien cadré

**Écran** : `Contrôle interne et processus`.

**Ce qu'il faut montrer** (ADR-108) : importez les deux descriptions structurées
(`dataset/processus/` — N-1 puis N). Le **diagramme est GÉNÉRÉ** depuis les données ; le
flowchart du client n'est qu'une pièce de corroboration. La **différence N/N-1 est exacte** :
cinq changements, un de chaque espèce (étape ajoutée, supprimée, système remplacé,
propriétaire de contrôle changé, fréquence changée) — chacun **se statue par écrit**, et le
passage à la facturation automatique, statué *significatif*, **propose un facteur** au
registre. Ré-importer sans confirmer est refusé : rien ne s'écrase en silence.

Puis l'**entretien** : enregistrer sans le consentement de CHACUN est **refusé en nommant la
personne** ; avec les consentements (tracés — qui, quand) et une durée de conservation, le
transcript du jeu de données (`dataset/entretiens/`) se dépose et se **confronte à la
documentation**. Trois **écarts candidats**, les **omissions d'abord** : la revue analytique
décrite à l'oral et documentée nulle part, le contrôle CP-02 jamais évoqué, la fréquence de
CP-01 contredite. Chacun se statue **par une personne** : facteur proposé, question au client
(brouillon), ou écarté avec motif. Les facteurs proposés se confirment au registre — et tant
qu'un changement ou un écart reste sans décision, c'est un **obstacle au visa** (famille
`processus`). Sans consentement, le support « notes » fait tout le reste : le module
fonctionne sans enregistrement (docs/14_ENTRETIENS_CONSENTEMENT.md).

---

### 7. Le risque par assertion — et ce qu'il commande

**Écran** : `Risque par assertion`.

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

**Écran** : `Risque par assertion`, panneau du bas.

**Ce qu'il faut montrer** : répondez **oui** à une question. Elle ne coche rien : elle **crée un
facteur au registre**, avec sa source et son texte. Confirmez-le : il **monte le niveau** et fait
entrer des procédures. Laissez-le *proposé* : il ne compte pas — *un moteur qui lève n'a pas décidé.*

---

### 9. La boucle

**Écran** : `Avancement de la boucle`.

Neuf étapes, ce qui a **franchi**, ce qui est **arrêté là**, et **ce qu'on attend** — nommément,
jamais « en cours ».

**Ce qu'il faut montrer** : le **nombre de tours**. Une file d'étapes se parcourt une fois ; une
boucle **repart**. Un écart génère une demande de clarification, et c'est ce compteur qui le prouve.
La liste du bas dit **de quel écart** chaque demande est née.

---

### 9 bis. L'atelier — la pièce et la ligne côte à côte

**Écran** : `Contrôle sur pièces (testing)`.

**Ce qu'il faut montrer** (ADR-104) : la ligne d'échantillon à gauche, **la pièce à droite, dans
l'écran** — jamais dans un autre onglet. Sur chaque ligne : le **motif de sélection** en toutes
lettres (« couverture exhaustive », « tirage en unités monétaires ») et la **comparaison lisible**
— valeur pièce, valeur GL, tolérance, règle. ↑/↓ change de ligne, **Entrée atteste**, et ce que
vous avez corrigé au clavier **part avec l'attestation** ; la prochaine ligne à vérifier s'ouvre
seule. En bas du détail, **la ligne telle qu'elle sortira au papier** — formatée par le même
formateur que le papier (règle 16). Cochez deux lignes : la barre de lot apparaît ; une
clarification **sans motif est refusée**, avec motif elle naît en **brouillon**. Un écart sur la
ligne mène à la synthèse en un clic, et la synthèse ramène à la ligne. La mesure de ce que
l'interface coûte par ligne : `npm run mesure:testing` (gestes scriptés mesurés + modèle KLM nommé
comme tel), et le coût en CLICS de chaque geste du parcours est publié dans `docs/CLICS.md`.

Le clavier n'est plus seulement promis : le parcours cliqué **presse les touches** — ↓ change de
ligne, ↑ revient, Entrée atteste — parce qu'un geste annoncé que personne n'exerce est une
affirmation, pas une preuve.

### 9 ter. L'échelle d'extraction — et ce qui est REJOUÉ dans cette démonstration

**À dire, mot pour mot, à ce moment-là** : « Ce que vous voyez ici est en partie rejoué. Les deux
premiers échelons — le XML Factur-X et la couche texte du PDF — lisent réellement le fichier de la
pièce : ils sont déterministes et gratuits. L'échelon OCR, lui, ne lit rien dans cette
démonstration : il rejoue une lecture enregistrée du jeu de données synthétique — aucun appel à un
modèle, aucun centime dépensé. En production, un modèle lit à cet endroit précis, et rien ne change
autour : la même file de vérification humaine, le même refus d'écrire au papier sans attestation. »

L'écran le dit lui-même — le bandeau « Adaptateur OCR/LLM : REJEU (démonstration) » est affiché
tant que l'adaptateur réel n'est pas branché : personne ne peut croire qu'une pièce a été lue par
un modèle quand la donnée est rejouée (ADR-102).

### 9 quater. L'estimation comptable — le fichier de calcul du client

**Écran** : `Estimations comptables`.

**Ce qu'il faut montrer** (ADR-106) : importez `dataset/estimations/fae-2025.csv` en visant
l'écriture `OD-2025-089` (l'ajustement manuel de 50 000 € que le vouching a marqué « explication
requise »). Le montant comptabilisé est **dérivé du grand livre actif** — jamais stocké — et
l'écart avec le fichier est **nul** : la base explique l'écriture. Chaque ligne est **recalculée
au centime** (jours × taux journalier). « Tirer la base » sonde avec le **même moteur** que le
chiffre d'affaires (couverture + aléa germé, rejouable). « Demander les justificatifs » crée un
**brouillon** : la pièce de base pour chaque ligne tirée, le contrat pour **chaque taux**, la note
de méthode pour la formule — à approuver avant l'envoi. Essayez de demander **avant** de tirer :
refusé. Visez une écriture inconnue : refusé, en la nommant.

Sur le papier de travail, le même fichier se **joint en annexe** (bouton « Joindre une annexe ») —
il entre au dossier avec empreinte et provenance, comme toute pièce.

---

### 10. Le papier de travail

**Écran** : `Papiers de travail`.

**Ce qu'il faut montrer** : le papier porte **la référence du plan de classement du cabinet**
(`A-01`), pas notre numérotation. Ouvrez `papier.json` dans la méthode : déplacez « Évaluation »
avant « Exceptions », renommez les colonnes, publiez, redraftez. Le PDF sort avec **votre** ordre et
**vos** intitulés.

Puis retirez le bloc `verification` du gabarit → l'assemblage **s'arrête** : *un bloc implémenté que
le gabarit ne nomme pas disparaîtrait du papier sans que rien ne le dise.*

---

### 10 bis. La note de revue ancrée — sur l'objet, jamais sur l'écran

**Écran** : le papier de travail ouvert, puis `Notes de revue`.

**Ce qu'il faut montrer** : un **clic droit** sur la conclusion (ou sur une cellule du tableau —
l'appui long et la puce ✎ au survol font le même geste). Le panneau NOMME l'objet visé
(« REV-01 · Conclusion », « Élément VE|0042|1 · Date ») : l'ancre est l'identité métier, pas une
position — elle survit au re-tirage, au recalcul, au ré-import (ADR-097). Posez la note, attribuez-la
au préparateur : l'élément porte le jeton d'attention. Dans `Notes de revue`, la vue transverse :
le préparateur répond (la réponse entre au dossier, la note passe « adressée »), puis la clôture :
le préparateur qui tente de clore est **refusé** (il n'est pas réviseur), l'AUTEUR aussi (un auteur
ne clôt jamais sa propre note — ADR-028) ; seul un réviseur qui n'a pas écrit la note clôt. La note
porte son TYPE — à corriger (bloquante), à documenter, question, remarque pour N+1 — et seules les
bloquantes empêchent le visa. Une note dont l'objet est sorti de l'échantillon ne disparaît pas :
elle reste ici, marquée « objet retiré ». Les écarts s'annotent aussi, depuis l'écran Exceptions —
« pourquoi as-tu considéré celui-ci comme résolu ? » se pose désormais SUR l'écart.

**Et la note pour OTTO** (ADR-098) : posez-en une attribuée à « OTTO — exécute l'instruction » avec
« Reprends la lecture des pièces : la quantité n'a pas été relevée. » — il exécute À LA POSE et sa
réponse entre au dossier : fait, pièces, **reste à vérifier** (tout repasse par la file de
vérification humaine). Puis « Conclus la section » : **refusé**, avec la liste de ce qu'il sait
faire — conclure, estimer, juger, signer appartiennent à l'équipe. Il répond, il ne clôt jamais :
la note exécutée reste « adressée » jusqu'à la clôture humaine.

**La commande qui rejoue tout le geste, clics compris** : `npm run clics` (stations « note ancrée »,
« notes » et « OTTO »).

### 10 ter. La colonne ajoutée au tableau — OTTO propose, vous confirmez

**Écran** : le papier de travail ouvert, panneau « Colonnes ajoutées ».

**Ce qu'il faut montrer** : tapez « Date livraison » et une justification (obligatoire — le modèle
standard est modifié, et cela sort dans l'export). OTTO PROPOSE, en clair : « je cherche la date
figurant sur le bon de livraison, dans les pièces de type bon de livraison » — et **rien n'est
rempli** tant que vous n'avez pas confirmé. Confirmez : la colonne entre au tableau marquée
« ajoutée », chaque cellule a **deux issues** — la donnée cliquable vers sa pièce (héritant de la
file de vérification), ou « absente des pièces reçues » avec un bouton qui PROPOSE une demande de
clarification au client (brouillon L2). Puis tapez « BL signé ? » : OTTO avoue ne pas savoir
interpréter, et confirmer sans corriger est **refusé** — il ne remplit jamais sur une devinette
(ADR-099).

### 10 quater. La bascule et les réunions

**La bascule (ADR-100)** : en tête de chaque écran de mission, « Changer de dossier » groupe les
missions par CLIENT — le groupe Meridian, son entité Altiverre, ses deux mandats. Basculer est une
action journalisée (`engagement.switched`, visible dans le Journal) ; la mission d'un autre cabinet
est refusée avant tout — le test tente la fuite dans les deux sens.

**Les réunions (ADR-101)** : écran `Réunions`. L'écran DIT que la lecture d'agendas et l'envoi sont
SIMULÉS. Déclarez Sophie contact clé, cherchez les créneaux communs (libre/occupé seulement — le
type même de l'adaptateur ne peut pas porter un titre d'événement), choisissez un créneau — le
choix est humain, toujours, et sans contact clé il est refusé en nommant le geste manquant.
L'invitation porte les copies dans l'ORDRE CALCULÉ : Sophie (clé), puis Claire, Anne… Léa, Karim —
du plus senior au moins senior, alphabet à grade égal. Le .ics se télécharge ; « Envoyer » est
simulé et l'écran l'affirme.

### 10 quinquies. Mes travaux — la liste de travail qui se DÉRIVE

**Écran** : `Mes travaux`, par le lien du bandeau (présent sur tous les écrans).

**Ce qu'il faut montrer** (ADR-110) : ce qui attend la personne connectée, **à travers tous ses
dossiers** — les notes de revue qui lui sont adressées et pas closes, les papiers dont le prochain
visa n'est pas posé, les demandes au client dont l'échéance est passée. Une ligne, **un clic**,
l'objet : le parcours cliqué compte ce clic au lieu de l'affirmer.

**La phrase qui compte** : « Rien n'est stocké ici. Une liste de travail tenue à la main ment le
jour où personne ne la tient — celle-ci se relit à chaque ouverture. » Et ce que l'écran avoue
lui-même : le produit ne modélise pas encore QUI doit poser quel visa, donc il nomme le visa
attendu sans prétendre vous l'attribuer.

**Et depuis la nuit (DA-30), c'est LE TABLEAU DE BORD** — sans toucher au rail : ce qui empêche le
visa sur **chacun de vos dossiers ouverts**, compté par famille, chaque famille menant à l'écran
qui la lève (« Aller le lever ») ; vos sections sur tous vos dossiers en quatre listes (dans mon
camp / attribuées / suivies / ouvertes récemment) ; les notes de revue ouvertes par ancienneté
(≤ 7 j, 8–30 j, > 30 j, calendaires). Connectez-vous en Claire (associée) : les dossiers de nuit
non acceptés y montrent leur famille « acceptation », Altiverre ses familles restantes. Ce que
l'écran dit ne pas regarder : les dossiers scellés, les jours ouvrés, les sections d'un dossier
dont la vue d'ensemble n'a jamais été ouverte.

### 10 quinquies bis. L'IPE, un seul rapport pour tous les papiers (DA-32)

**Écran** : un papier de travail, panneau *Information produite par l'entité*.

**Ce qu'il faut montrer** : le papier de revenus désigne le rapport « FEC-2025 » arrêté au
31/12/2025 — nom, système, empreinte, *utilisé par N papier(s)*. Redésignez-le en écrivant un
autre arrêté (15/01/2026) : **refusé**, les deux dates côte à côte, et la phrase propose un nouveau
test IPE. Un rapport ne couvre que son propre arrêté. Sur l'écran des imports, cinq champs
facultatifs capturent l'IPE au moment de l'import (système source, nature, identifiant, extraction).

### 10 quinquies ter. Le registre des gardes (ADR-117)

**Fichier** : `docs/GUARDS.md`, généré depuis `app/src/lib/gardes/registre.ts`.

**Ce qu'il faut montrer** : vingt-huit invariants, chacun avec la phrase « où elle cesse de
regarder », et la NATURE de sa preuve — onze prouvées en deux passes (l'attaque refusée par la
garde, puis acceptée sans elle), deux de service, quinze déclarées dont quatre sans preuve, écrit
tel quel. Et ce que le registre a trouvé le soir même : une contrainte de 0009 inerte depuis sa
naissance (ADR-117). Désactivez localement `review_note_close_guard` : `npx vitest run src/lib/gardes` dit
« G-03 : l'attaque a RÉUSSI sans neutralisation — la garde n'existe pas ».

### 10 sexies. Les circularisations — la preuve qu'on ne fabrique pas soi-même

**Écran** : `Circularisations` (rail, après le premier import).

**Ce qu'il faut montrer** (ADR-111) : le listing des banques fourni par le client porte deux
défauts, et l'écran les nomme **avant** toute demande — le compte `512100` du grand livre
qu'aucune banque du listing ne couvre, et les comptes annoncés (`512900`, `512200`) qu'aucune
écriture ne porte. Le contrôle va dans les deux sens.

Puis la suite, en quatre gestes : le **listing corrigé** referme la complétude ; la demande
**part** (transport simulé, qui le dit — rien ne quitte la machine) ; la réponse de la banque
se **dépose comme pièce** et son solde se saisit ; l'**écart de 1 250,00 €** apparaît, calculé
contre le grand livre — côté banque, *tout* écart se dit, quel que soit son montant.

**La phrase qui compte** : « Cet écart ne se referme pas d'un clic. » Essayez « RAS » : c'est
**refusé**. Une explication écrite — des frais prélevés au 31/12 et comptabilisés en janvier —
lève l'obstacle au visa, et les questions au client naissent en **brouillon** dans les demandes.

### 11. Le pointage des états financiers

**Écran** : `Pointage des états financiers`.

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
**périmètre sans programme**, boucle, pointage, évaluation, achèvement, jalons. Chaque obstacle dit
**où aller le lever**.

> Ce que la page **n'affirme pas**, et c'est écrit dessus : « aucun obstacle » ne veut pas dire que
> le dossier est **bon**. Il veut dire qu'**aucune règle ne le refuse**. Le jugement reste au
> signataire.

---

### 14. La clôture et l'archive scellée

**Écran** : `Clôture et archive`.

**Ce qu'il faut montrer** : tant qu'un obstacle subsiste, **le bouton de clôture n'est pas offert** —
l'écran dit combien il en reste et par famille. Clore n'est pas offert non plus à qui n'a **pas le
droit de signature** : *ouvrir un dossier n'est pas y travailler, et y travailler n'est pas le
signer.*

Le grand livre **provisoire** bloque aussi, et c'est la règle : *un dossier qui se clôt sur un FEC
provisoire serait le vrai défaut.* Il se lève par le seul chemin honnête — **importer le fichier
définitif** (`dataset/definitif/`, même nom, invalidation à confirmer) et **re-exécuter le
rapprochement** : c'est son résultat, propre, qui lève le drapeau. Le ré-import périme la sélection
tirée sur l'ancien grand livre : les travaux se refont sur le fichier définitif, ce que la limitation
consignée promettait.

Une fois tout levé : l'archive est scellée, **rejouable à l'octet près**, avec ses empreintes
re-vérifiées et un README sans lien externe. L'écran affiche son **empreinte SHA-256** et un lien qui
la **télécharge** — une archive qu'on ne peut pas sortir ne prouve rien à un inspecteur. Le délai
d'assemblage est **30/05/2026**.

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

`npm run screens` **ouvre** les 63 routes ; `npm run clics` **agit** dessus. Les deux sont
nécessaires et ne se remplacent pas : six formulaires ont été inertes en production pendant une
tranche entière avec tous les écrans à 200 (ADR-078), un dossier créé a été inatteignable en étant
parfaitement rendu (ADR-088), et dix écrans transformaient chaque refus en page 500 (ADR-091).
*Un écran qui rend n'est pas un écran qui marche.*

`npm run clics` conduit **tout le chemin de démonstration** — import du grand livre définitif,
rapprochement, matérialité, périmètre, risque, sondage, demande, portail, extraction, vouching,
écarts, re-exécution en aveugle, évaluation, papier, notes, visas, pointage, achèvement, jalons,
obstacles, clôture, téléchargement du dossier scellé — en **54 étapes**, en étant tour à tour le
préparateur, le reviewer, l'associé et le client. Une trentaine d'entre elles vérifient un
**refus** : une action qui aboutit prouve peu, et un refus qui ne s'affiche pas n'existe pas pour
l'utilisateur.
