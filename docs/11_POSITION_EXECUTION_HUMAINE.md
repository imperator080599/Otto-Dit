# 11 — « Exécuté par l'outil, validé par un humain » : note de position

**Question posée par le fondateur (2026-08-25), à trancher explicitement.**
L'en-tête d'un papier dit « Travaux exécutés par OTTO — run moteur 213fe8ed… » puis
« Validé par : [trois humains] ». C'est honnête et conforme à l'esprit des guidances sur
l'usage de l'IA. Mais professionnellement : **une diligence « exécutée par l'outil et
validée par un humain » satisfait-elle l'exigence que le commissaire aux comptes ait mis en
œuvre la procédure ?**

C'est la question qui décide si le produit est utilisable dans un vrai dossier. Elle se
tranche, elle ne se contourne pas.

---

## Les deux lectures

### Lecture A — l'outil exécute, le CAC supervise

Un logiciel qui rapproche 16 factures à 16 écritures fait ce qu'un collaborateur ferait.
Le commissaire aux comptes qui paramètre, revoit et signe **a mis en œuvre** la procédure,
au même titre que lorsqu'il dirige une équipe : il ne saisit pas lui-même chaque montant.
Un tableur qui calcule un seuil, un logiciel d'analyse de données qui isole les écritures du
week-end, un outil de sondage qui tire un échantillon — personne ne soutient que le CAC ne
les « met pas en œuvre » parce qu'il n'a pas fait l'arithmétique à la main.

**Faiblesse de cette lecture** : elle s'appuie sur l'analogie avec des outils
*déterministes*. Un tableur qui se trompe se trompe toujours pareil, et l'erreur se voit.
Un modèle qui extrait un montant d'un scan peut se tromper une fois sur cent, de façon
plausible, sur une pièce que personne ne relit.

### Lecture B — seul l'humain qui exerce le jugement met en œuvre

Une diligence n'est pas un calcul : c'est un jugement exercé sur des éléments probants.
Si l'outil décide *ce qui est une anomalie*, *ce qui est suffisant* et *ce qui est
concluant*, l'humain qui appose un visa en fin de chaîne ne met pas en œuvre la procédure —
il ratifie un résultat qu'il n'a pas produit et, souvent, qu'il ne peut plus reconstituer.
Le visa devient une formalité, et la documentation ne montre plus **qui a exercé le
jugement**.

**Faiblesse de cette lecture** : poussée à bout, elle interdit toute automatisation, y
compris celle qui existe depuis vingt ans et que personne ne conteste.

---

## Ce que le produit retient

**Ni l'une ni l'autre en bloc : la ligne passe entre le travail mécanique et le jugement.**

> **OTTO exécute des procédures déterministes et prépare ; le commissaire aux comptes exerce
> le jugement et conclut. Ce qui est exécuté par la machine est reproductible et
> re-exécutable ; ce qui relève du jugement n'est jamais exécuté par la machine.**

Trois conséquences, toutes déjà dans le code :

1. **Ce que la machine exécute est déterministe et rejouable.** Rapprochements, seuils,
   sondage, projection, échelle de déficience : fonctions pures, graine enregistrée,
   `engine_run` conservé. Un inspecteur peut re-exécuter et retrouver le même résultat.
   C'est ce qui rend défendable l'affirmation « le CAC a mis en œuvre » : la procédure est
   inspectable, pas opaque.
2. **Ce que le modèle produit n'entre jamais dans le dossier sans vérification humaine
   d'item** (contrat L2, ADR-012). Une extraction OCR/LLM est marquée `pending_verify` et
   la confiance n'est qu'un ordre de tri — jamais un laissez-passer.
3. **Le jugement n'a pas de chemin machine.** Qualifier une anomalie, décider qu'une
   explication est corroborée, arrêter un seuil, conclure, réduire la gravité d'une
   déficience : le moteur *propose* et **refuse d'avancer sans décision humaine motivée**
   (ADR-024, ADR-025). Il n'existe aucun code qui conclue à la place de quelqu'un.

## Ce que le vocabulaire des papiers doit porter

Le vocabulaire est la mise en œuvre de cette position, pas sa décoration. Trois verbes,
trois rôles, et ils ne se substituent pas :

| Verbe | Qui | Ce que cela signifie exactement |
|---|---|---|
| **Exécuté** | le moteur (`engine_run`) | procédure déterministe, paramètres et graine enregistrés, re-exécutable à l'identique |
| **Vérifié** | un humain nommé | re-exécution sur la pièce d'origine d'un élément produit par un modèle (barreaux 3–4), ou contrôle de fiabilité à l'aveugle |
| **Validé / Conclu** | un humain nommé et habilité | jugement professionnel : qualification, suffisance, conclusion, signature |

Ce que le produit **n'écrira jamais** : « OTTO conclut », « validé automatiquement »,
« vérifié par le système ». Une phrase qui attribue à la machine un verbe de jugement est
un défaut à corriger, pas une tournure.

## Position assumée, et sa limite

Cette note est une **position de produit**, pas un avis juridique et pas une position de
place. Elle est défendable parce que la frontière est matérialisée dans le code et non
seulement affirmée dans une plaquette. Elle reste à confronter :

- à la doctrine H2A/CNCC sur l'usage des outils et de l'IA, sur texte primaire, avant tout
  usage en dossier réel ;
- à un inspecteur, sur un dossier réel, ce qu'aucune note interne ne remplace.

**Point de vérification founder** : c'est le seul point de cette revue qui ne se règle pas
en écrivant du code. Il se règle en confrontant cette position à un pair et à la doctrine —
et si elle ne tient pas, c'est le produit qui bouge, pas la note.
