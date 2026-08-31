# LEXIQUE — un concept, un mot, partout (mandat §3.D, M-17)

La règle : chaque concept du produit a UN mot à l'écran, et les synonymes sont interdits
dans les libellés. Le tableau ci-dessous fait foi ; `app/src/lib/lexique.test.ts` fait
respecter les règles marquées ✓ (échec de suite sur infraction) — les autres relèvent de
la revue éditoriale, resserrées au fil des tranches.

**Une case ✓ vaut une règle qui tourne.** La première version de ce tableau en portait sept
et le test n'en appliquait que quatre : trois cases mentaient. Elles sont corrigées
ci-dessous — soit la règle existe et tourne, soit la case est vide avec son motif.

| Concept | Mot retenu (écrans FR) | Interdits / réservés | Appliqué par test |
|---|---|---|---|
| La mission d'audit (engagement) | **mission** | « engagement » à l'écran (mot de code) | ✓ |
| Le dossier de travail de la mission (fichiers, papiers, archive) | **dossier** | « engagement » à l'écran FR | ✓ |
| Le poste des états financiers (FSLI) | **poste** | « FSLI » dans un libellé FR (le code garde FSLI) | ✓ |
| Une demande au client (request) | **demande** | « requête » — RÉSERVÉ à « Interroger » (NL→requête) | ✓ |
| Une pièce probante reçue (evidence) | **pièce** | « justificatif » toléré comme périphrase explicative, jamais en titre de colonne/section | ✓ (titres) |
| Un fichier au sens générique (upload, export) | **fichier** / **document** | — (« document » désigne l'objet transporté, « pièce » l'objet probant) | |
| Un constat du testing sur une ligne (exception) | **écart** | « anomalie » pour ce concept | (revue) |
| Une anomalie ÉVALUÉE (misstatement, corrigée ou non) | **anomalie** | « écart » pour ce concept | |
| Une déviation d'un test de contrôle (SOX) | **déviation** | « écart » / « exception » pour ce concept | |
| Le seuil de signification (materiality) | **seuil de signification** (« seuil » en second emploi) | « matérialité » | ✓ |
| La sélection d'items à tester | **échantillon** (l'acte : **tirage**) | « sondage » comme titre | |
| Le papier de travail (workpaper) | **papier** | « feuille de travail » | ✓ |
| Un facteur de risque déclaré au registre | **facteur** | « risque » seul pour cet objet (le « risque » est le niveau par assertion) | |
| La signature d'étape (signoff) | **visa** | « signature » réservé au geste sur le papier | |
| L'écriture comptable (gl entry) | **écriture** | « transaction » dans un libellé FR | ✓ |

## L'état des lieux qui a fondé ce tableau (compté le 2026-08-31)

`grep` sur `app/src/app` (code + libellés confondus — indicatif) : pièce 45 ·
dossier 44 · exception 43 (surtout des identifiants de code : la route et l'objet
s'appellent `exception`, le LIBELLÉ est « écart ») · document 32 · demande 30 ·
mission 38 · écart 39 · requête 3 · justificatif 5 · matérialité 1 · sondage 0.
Les collisions réelles trouvées et corrigées par la tranche 9 sont dans le commit
qui introduit ce fichier.

## Comment le test décide (2026-08-31, deuxième version — la première mesurait mal)

1. **Il extrait d'abord le texte LU**, au lieu de greper des lignes de code : nœuds JSX,
   attributs de libellé (`placeholder`, `title`, `aria-label`, `alt`), et — nouveauté —
   les chaînes-phrases des services `.ts`, où vivent les libellés du rail, du catalogue
   de questions et des familles d'obstacles. Un import, un identifiant, une requête SQL
   ou un commentaire ne sont plus du texte d'écran.
2. **Il juge la LANGUE du texte, pas le fichier.** « engagement » dans une phrase
   anglaise est le mot juste ; dans une phrase française, c'est la collision interdite.
   Les exemptions par fichier entier ont disparu — elles survivaient à leur motif et
   couvraient les libellés français ajoutés depuis. Un titre court et ambigu (≤ 3 mots)
   est jugé quand même : c'est l'endroit le plus vu de l'écran.
3. **Le vocabulaire d'ENTRÉE est exclu** (`examples`, `keywords`, `core`, `synonymes`) :
   la recherche doit au contraire comprendre les mots que le lexique bannit à l'écran,
   sinon elle cesse de comprendre ce que les gens tapent.
4. `ask/` et `services/query/` gardent le mot « requête » (c'en est la réserve) — mais
   « requête au client » y reste interdit, dans toutes les langues.

Prises de cette version, corrigées : « Engagements » → **Missions** (accueil et fil
d'Ariane de chaque écran de mission), `<h2>Engagement</h2>` et son paragraphe anglais du
foyer de mission → français, `<th>Justificatif</th>` → **Pièce** (estimations),
« Feuilles de travail non signées » → **Papiers de travail non signés** (catalogue),
en-tête du tableau de périmètre francisée (`Poste / État / Solde / Périmètre / Base /
Décision`). Prise de la version précédente : « matérialité » → « seuil de signification »
(écran risque).

## Chantier restant (dit, pas caché)

Des écrans des premières tranches parlent encore anglais (réconciliation, scoping,
matérialité, papier de travail — titres et libellés). La cible v1 : tous les libellés en
français, l'anglais restant dans les exports au format du pack. À traiter avec M-13
(bascule de référentiel — le vocabulaire par pack est justement le mécanisme qui rendra
cette francisation propre).

## Ce que le test NE couvre pas (dit franchement)

- **Deux concepts qui partagent une racine.** « écart » (le constat du testing) et
  « anomalie » (l'anomalie évaluée) sont TOUS DEUX légitimes : seul le contexte les
  départage, et un test de mots ne lit pas le contexte. La case ✓ a donc été retirée de
  cette ligne plutôt que maintenue par confort — mieux vaut une case vide qu'une case
  qui ment (règle 13).
- **Les écrans encore anglais** échappent aux règles françaises par construction (voir
  point 2 ci-dessus). Leur francisation est le chantier ci-dessous, pas une exception
  silencieuse.
- **Le texte assemblé à l'exécution** (concaténations, gabarits) n'est pas vu par un
  test qui lit des sources : chercher un mot n'est pas vérifier un chemin (règle 15).
  La revue à l'œil des captures de `npm run visuel` reste le filet, et toute collision
  trouvée s'ajoute ICI avec sa règle.
