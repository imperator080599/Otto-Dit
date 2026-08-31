# LEXIQUE — un concept, un mot, partout (mandat §3.D, M-17)

La règle : chaque concept du produit a UN mot à l'écran, et les synonymes sont interdits
dans les libellés. Le tableau ci-dessous fait foi ; `app/src/lib/lexique.test.ts` fait
respecter les règles marquées ✓ (échec de suite sur infraction) — les autres relèvent de
la revue éditoriale, resserrées au fil des tranches.

| Concept | Mot retenu (écrans FR) | Interdits / réservés | Appliqué par test |
|---|---|---|---|
| La mission d'audit (engagement) | **mission** | — | |
| Le dossier de travail de la mission (fichiers, papiers, archive) | **dossier** | « engagement » à l'écran FR | ✓ |
| Le poste des états financiers (FSLI) | **poste** | « FSLI » dans un libellé FR (le code garde FSLI) | ✓ |
| Une demande au client (request) | **demande** | « requête » — RÉSERVÉ à « Interroger » (NL→requête) | ✓ |
| Une pièce probante reçue (evidence) | **pièce** | « justificatif » toléré comme périphrase explicative, jamais en titre de colonne/section | |
| Un fichier au sens générique (upload, export) | **fichier** / **document** | — (« document » désigne l'objet transporté, « pièce » l'objet probant) | |
| Un constat du testing sur une ligne (exception) | **écart** | « anomalie » pour ce concept | ✓ |
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

## Décisions d'application (2026-08-31, première exécution du test)

- L'écran **Interroger** (`ask/`) est LA réserve du mot « requête » : exclu par fichier.
- La règle FSLI ne s'applique qu'aux lignes FRANÇAISES (heuristique : un caractère
  accentué sur la ligne). Les écrans encore en anglais (réconciliation, scoping —
  héritage des premières tranches) gardent leur terme technique ; leur FRANCISATION est
  un chantier à part entière du lexique, listé ci-dessous, pas une exception passée
  sous silence.
- Première prise : « matérialité » corrigé en « seuil de signification » sur l'écran
  risque (`risk/page.tsx`).

## Chantier restant (dit, pas caché)

Des écrans des premières tranches parlent encore anglais (réconciliation, scoping,
matérialité, papier de travail — titres et libellés). La cible v1 : tous les libellés en
français, l'anglais restant dans les exports au format du pack. À traiter avec M-13
(bascule de référentiel — le vocabulaire par pack est justement le mécanisme qui rendra
cette francisation propre).

## Ce que le test NE couvre pas (dit franchement)

Le test grep les fichiers d'écran pour les mots interdits marqués ✓, en excluant les
identifiants évidents (imports, routes, props). Un synonyme dans une phrase
d'explication peut lui échapper — chercher un mot n'est pas vérifier un chemin
(règle 15) : la revue à l'œil des captures de `npm run visuel` reste le filet, et
toute collision trouvée s'ajoute ICI avec sa règle.
