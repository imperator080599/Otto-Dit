# OTTO — Annexe au mandat du 9 septembre, §1 : la table d'échantillonnage, sourcée

Recherche faite hors du bac à sable (dont l'accès réseau est bloqué) et remise au dépôt par le
fondateur. Commité verbatim selon la règle 33. **L'agent ne complète aucune valeur de mémoire :
tout ce qui n'est pas ci-dessous reste `verifie:false`.**

---

## 1. La source retenue

**HUD Handbook 2000.04 REV-2 CHG-10, Appendix A — « Attribute Sampling »**, U.S. Department of
Housing and Urban Development, Office of Inspector General, mars–avril 2011.
`https://www.hudoig.gov/sites/default/files/documents/audit-guides/appendix.pdf`

Pourquoi celle-là plutôt qu'une autre :

- C'est un **guide d'audit fédéral américain publié**, libre d'accès et dans le domaine public
  (œuvre du gouvernement des États-Unis) — il se cite et se montre en présentation.
- Il contient une **vraie table de tailles**, ce qui n'est pas le cas des normes elles-mêmes :
  `PCAOB AS 2315` et `ISA 530` énoncent les **facteurs** qui font varier une taille
  d'échantillon, sans jamais publier de table de nombres. C'est précisément pour cela que la
  table du cabinet existe.
- Le guide de la GAO (*Financial Audit Manual*) est une seconde source publique équivalente, plus
  volumineuse ; elle pourra servir de contre-vérification, pas de remplacement silencieux.

> **Ce qui reste vrai :** la méthodologie interne d'un cabinet — Deloitte comprise — n'est pas une
> source, n'entre pas au dépôt, et viendra plus tard par l'écrasement de cabinet.

---

## 2. La table, telle qu'elle est publiée

### 2.1 Populations de plus de 200 éléments

| Importance de l'attribut | Niveau de confiance | Taux tolérable | Taille minimale |
|---|---|---|---|
| Faible | 90 % | 5 % | **50** |
| Faible | 90 % | 10 % | **25** |
| Élevée | 95 % | 5 % | **65** |
| Élevée | 95 % | 10 % | **35** |

### 2.2 Populations de 200 éléments ou moins

Cité mot pour mot :

> « Generally examine at least (1) 20 items when the population being tested contains between 100
> and 199 items, (2) 10 items when the population being tested contains between 50 and 99 items,
> (3) 5 items when the population being tested contains between 20 and 49 items, and (4) Fewer
> than 5 items for smaller populations. »

Et, dans le même paragraphe :

> « As noted above, these are suggested minimum sample sizes, and there may be quantitative
> factors used to determine the sample size to be used. »

**Cette phrase est reprise à l'écran**, sous la taille affichée : ce sont des **minima suggérés**,
jamais un verdict.

---

## 3. Ce que cela change dans le produit — et ce que cela ne change pas

Le mandat du 8 septembre disait déjà, §3.1, que l'échantillon d'OE se tire sur **le nombre
d'occurrences du contrôle sur l'exercice**. Cette source s'y branche sans rien réécrire :

> **La fréquence n'indexe pas la table. La fréquence produit la POPULATION, et c'est la population
> qui indexe la table.**

D'où, mécaniquement :

| Fréquence | Occurrences | Bande | Taille minimale |
|---|---|---|---|
| annuelle | 1 | < 20 | l'occurrence unique — la population entière |
| trimestrielle | 4 | < 20 | « fewer than 5 » |
| mensuelle | 12 | < 20 | « fewer than 5 » |
| hebdomadaire | 52 | 50–99 | **10** |
| quotidienne (jours ouvrés) | ≈ 250 | > 200 | **25 / 35 / 50 / 65** selon §2.1 |
| **`as_needed`** | **inconnue** | — | **la population se DEMANDE au client** (`CTRL-05`), puis se bande comme les autres |

`CTRL-04` (rapprochement avant tirage) et `CTRL-05` (demande client) restent inchangés et
s'appliquent avant que cette table soit consultée.

---

## 4. Ce qui reste un paramètre de cabinet, `verifie:false` par défaut

La table ci-dessus ne suffit pas seule à produire un nombre : **deux jugements restent au cabinet**,
et le produit refuse tant qu'ils ne sont pas posés.

1. **Le niveau de confiance** (90 % ou 95 %) et **le taux tolérable** (5 % ou 10 %).
2. **L'importance de l'attribut** (faible / élevée), qui est un jugement d'auditeur, pas un calcul.

Tant qu'ils sont vides, l'écran affiche « paramètre non vérifié — à fixer par le cabinet » et
`CTRL-07` refuse le tirage. La table publiée est le **défaut sourcé**, jamais une valeur imposée :
le cabinet l'écrase sans toucher au code.

Chaque ligne de pack porte `source_text` = référence exacte du guide, section, et date de
consultation. Une ligne sans source reste `verifie:false`, même si sa valeur « paraît juste ».

---

## 5. Ce qui est interdit, rappelé

- Aucune valeur ajoutée de mémoire pour combler un trou de la table.
- Aucun résumé de moteur de recherche traité comme un texte primaire.
- L'agent écrit « usuelle », jamais « exigée par la norme » — `AS 2315` et `ISA 530` ne publient
  aucune table, et prétendre le contraire serait la faute que la Partie C.2 interdit.
- La table d'un cabinet ne se recopie pas dans le dépôt.
