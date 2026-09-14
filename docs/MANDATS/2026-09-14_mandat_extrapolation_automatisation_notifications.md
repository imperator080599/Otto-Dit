# OTTO — Mandat du fondateur : extrapolation, degré d'automatisation, notifications

Dicté par le fondateur le 14 septembre 2026, avant une absence de douze heures. Commité verbatim
selon la règle 33. Trois fonctionnalités, dans l'ordre donné au §5.

La méthodologie d'extrapolation du §1 **n'est pas dictée par le fondateur** : elle a été construite
depuis le texte primaire d'`ISA 530`, cité ci-dessous. L'agent ne l'élargit pas de mémoire.

---

## 1. L'extrapolation des écarts relevés en testing

### 1.1 Ce que la norme exige, mot pour mot

`ISA 530` (IAASB), cité depuis le texte publié :

> **§14** — « For tests of details, the auditor shall project misstatements found in the sample to
> the population. »

> **§12** — « The auditor shall investigate the nature and cause of any deviations or misstatements
> identified, and evaluate their possible effect on the purpose of the audit procedure and on other
> areas of the audit. »

> **§5(e)** — *anomaly* : « A misstatement or deviation that is demonstrably not representative of
> misstatements or deviations in a population. »

> **§13** — « In the **extremely rare** circumstances when the auditor considers a misstatement or
> deviation discovered in a sample to be an anomaly, the auditor shall obtain a **high degree of
> certainty** that such misstatement or deviation is not representative of the population. »

> **§15** — « The auditor shall evaluate: (a) The results of the sample; and (b) Whether the use of
> audit sampling has provided a reasonable basis for conclusions about the population that has been
> tested. »

> **§A20** — « For tests of controls, no explicit projection of deviations is necessary since the
> sample deviation rate is also the projected deviation rate for the population as a whole. »

**Ce que la norme ne donne pas** : aucune formule. Elle exige la projection, pas une méthode. La
méthode est donc un **paramètre de cabinet**, jamais une constante du dépôt.

### 1.2 Les trois quantités, distinctes et jamais confondues

| Quantité | D'où elle vient |
|---|---|
| **écart connu** | les écarts réels des lignes **testées à 100 %** (strate exhaustive) |
| **écart projeté** | la projection des écarts de la strate **sondée** à sa population |
| **écart total estimé** | connu + projeté, comparé au seuil |

> **`EXTRAP-02` — on ne projette jamais sur la strate exhaustive.** Une ligne testée à 100 % porte
> son écart réel ; lui appliquer une projection serait compter deux fois. Le refus nomme la strate.

### 1.3 Les méthodes offertes — le cabinet choisit, le dépôt n'impose pas

Trois formes, toutes trois de l'arithmétique pure (aucune constante) :

- **`unites_monetaires`** — la forme cohérente avec le tirage déjà en place (Partie B, étape 4 :
  unités monétaires, germe). Pour chaque ligne en écart, entachement = (valeur comptable − valeur
  auditée) ÷ valeur comptable ; projection = somme des entachements × intervalle de sondage.
- **`ratio`** — projection = (écart total de l'échantillon ÷ valeur comptable de l'échantillon) ×
  valeur comptable de la population.
- **`difference`** — projection = (écart total de l'échantillon ÷ n) × N.

Le **choix de la méthode** est un paramètre de pack, `verifie:false` par défaut, affiché
« paramètre non vérifié — à fixer par le cabinet ». Tant qu'il n'est pas posé, aucune projection ne
s'affiche.

> **`EXTRAP-04`** — afficher une projection sans nommer la méthode employée et sans que son
> paramètre de cabinet soit vérifié.

### 1.4 L'anomalie : possible, mais coûteuse à déclarer

Écarter un écart de la projection est permis — `§13` — et doit être **extrêmement rare**.

> **`EXTRAP-03`** — écarter un écart comme anomalie sans **(a)** une justification écrite, et
> **(b)** le rattachement d'une preuve supplémentaire obtenue exprès. Le refus cite `§13` et ses
> mots : *extremely rare*, *high degree of certainty*. L'écran affiche en permanence le compte
> d'anomalies écartées sur le dossier — un compte qui monte est en soi un signal.

### 1.5 Le raccordement

- **Tests de contrôles** : aucune projection (`§A20`). L'écran le **dit** en une phrase et affiche
  le taux de déviation ; il ne laisse pas un vide que l'auditeur prendrait pour un oubli.
- La projection alimente le **registre des anomalies** déjà prévu au Lot 6 du plan d'autonomie
  (factuelle, de jugement, **extrapolée** ; corrigées et non corrigées ; évaluation contre la
  matérialité). Ce mandat le construit, il ne l'invente pas.
- **`EXTRAP-01`** — conclure un poste testé par sondage sans projection à la population.

### 1.6 Les épreuves

1. Un poste sondé avec un écart **ne se conclut pas** sans projection — `EXTRAP-01` observé.
2. Une projection tentée sur la strate exhaustive **est refusée** en nommant la strate — `EXTRAP-02`.
3. Une anomalie déclarée sans preuve supplémentaire **est refusée** en citant `§13` — `EXTRAP-03`.
4. **Aucune projection ne s'affiche** tant que la méthode du cabinet n'est pas posée — `EXTRAP-04`.
5. Un test de contrôles n'affiche **jamais** de projection, et **dit pourquoi**.
6. Écart connu, écart projeté et écart total sont **trois nombres distincts** à l'écran, chacun avec
   sa provenance ; un test échoue s'ils sont additionnés ailleurs que dans le total.

---

## 2. Le degré d'automatisation de l'agent IA

### 2.1 Une échelle, fermée et nommée

| Niveau | Ce que l'IA fait |
|---|---|
| `L0` | rien — l'agent est éteint pour ce périmètre |
| `L1` | il **suggère à côté** : un panneau consultable, rien n'entre jamais dans un champ du dossier |
| `L2` | il **propose dans les champs** ; chaque élément exige une validation humaine tracée |
| `L3` | il **accepte seul** certaines classes, revue a posteriori — **interdit aujourd'hui** |

`L2` est le plafond permanent du projet. `L3` existe dans le vocabulaire pour que le refus puisse le
nommer, jamais pour être choisi.

### 2.2 Portée et sens de variation

- Défaut posé au niveau du **pack du cabinet**.
- Réglable **par mission**, mais **vers le bas uniquement** : une mission peut être plus prudente
  que son cabinet, jamais plus permissive.

> **`AUTO-01`** — porter le niveau au-dessus du plafond du cabinet, ou au-dessus de `L2` tant que
> l'interdit permanent tient. Le refus nomme le plafond en vigueur et qui l'a posé.

### 2.3 Le niveau est une donnée du dossier, pas un réglage d'écran

Chaque élément produit par l'IA porte **le niveau en vigueur à l'instant où il a été produit**.
Baisser le niveau plus tard ne réécrit jamais l'histoire : le dossier doit pouvoir dire sous quel
régime chaque proposition est entrée.

> **`AUTO-02`** — un élément préparé par l'IA sans le niveau horodaté de sa production.

### 2.4 Deux gardes indépendantes

Le niveau dit **ce que l'IA a le droit de faire**. `IA-BUDGET-01` dit **si elle a le droit de
dépenser**. Les deux doivent passer, et aucune ne remplace l'autre. Un test le prouve : niveau
ouvert + budget fermé ⇒ refus ; niveau fermé + budget ouvert ⇒ refus.

---

## 3. Les notifications des tâches IA à approuver

### 3.1 La règle qui gouverne la construction

> **Le centre de notifications ne possède aucun objet.** C'est une **vue** sur les éléments préparés
> par l'IA et non encore validés — exactement l'inventaire que `IaFlag` / `data-ia-prepare` vient de
> rendre exhaustif (R59). Une notification qui ne se résout pas à l'identifiant d'un objet réel est
> un décor, et une file parallèle qui se désynchronise du dossier est pire qu'absente.

### 3.2 Ce qu'elle montre

- **Ce que moi je dois approuver** : filtré par la personne et son rôle — une proposition qu'un
  staff ne peut pas valider ne lui est pas comptée comme sienne.
- **L'âge** de chaque attente, la plus ancienne en tête.
- **Le niveau d'automatisation** sous lequel l'élément a été produit (§2.3).
- Chaque ligne mène **en un clic** au geste réel de validation, jamais à un formulaire dupliqué.

### 3.3 Le refus qui rend le plafond L2 opposable

> **`NOTIF-01`** — viser un dossier tant qu'un élément préparé par l'IA y reste non validé. Le refus
> les nomme et les compte. C'est ce qui transforme « le modèle propose, un humain valide » d'une
> déclaration en une garde.

### 3.4 Les épreuves

1. Un test échoue si **une seule** carte ne se résout pas à l'identifiant d'un objet existant.
2. Le compte affiché à une personne **change** selon son rôle — prouvé par deux personnes distinctes
   sur le même dossier.
3. Le visa **est refusé** tant qu'un élément IA reste non validé — `NOTIF-01` observé.
4. Un élément validé **disparaît** de la file dans le même geste, sans tâche de nettoyage.

---

## 4. Ce qui ne change pas

Tous les invariants D.0 et les interdits permanents tiennent. En particulier : plafond `L2`, aucune
IA vivante activée tant que le fondateur n'a pas posé la clé, la garde en base et le sélecteur (trois
gestes distincts) ; aucune donnée réelle ; aucune constante — seuil, taux, méthode, taille — écrite
de mémoire ; `PLAN_RLS` étape 3 jamais.

---

## 5. L'ordre d'exécution

1. **§1.2–1.3** — les trois quantités et le moteur de projection, avec `EXTRAP-01`, `EXTRAP-02`,
   `EXTRAP-04`.
2. **§1.4–1.5** — l'anomalie écartée (`EXTRAP-03`) et le raccordement au registre des anomalies.
3. **§3** — les notifications (vue pure, elle s'appuie sur l'inventaire `data-ia-prepare` déjà
   exhaustif).
4. **§2** — le degré d'automatisation, et les deux gardes indépendantes.

Chaque point se découpe en autant de tranches que nécessaire. En cas de doute, la chose plus petite
(règle 8), et rien ne sort du registre.
