# Rapport du soir — mandat du jour (2026-09-02), un seul écran

**URL** : https://otto-dit.vercel.app · **SHA** : `8302a23` (`8302a23639bd86fad0541f09cf70a90845880742`, déclaré par `/api/sante` ; le produit est `3bc9bd0`, `8302a23` ne corrige que le harnais) · déploiements Vercel `dpl_5mrM7kAWxesEoRTSm1XXLmCWsX1V` (3bc9bd0, READY 14:11 UTC — migrations 0042 + 0050 appliquées au build, 106 tables, assertions rôle/RLS « défauts : aucun », fuite tentée 0/0/49) et `dpl_EN1dSYykmhhWrb1E66fqTnSgDKLa` (8302a23, READY 14:37 UTC) · `/api/sante` « toutes les lectures passent » sur les deux · CI `local` (run 33640213191) **vert** : types, base semée, 667 tests dont le balayage des écrans, langue 0/0, lectures 0 perdue, parcours 0 perdue · CI `url` (run 33640390712, contre le déploiement) : balayage **7 passages, graine 33640390712, vert** (la sonde sort en échec au premier RED ou INTERMITTENT), épreuve du harnais **3/3 déclarés FAIL**, acceptation **9 PASS / 2 FAIL** — voir §3, les deux FAIL sont du HARNAIS (lecture de l'URL avant la redirection), la base déployée montre 0 conclusion et 0 disposition acceptées ; corrigé et rejoué sur 8302a23 (run 33643239966) : balayage 7 passages vert, épreuve 3/3, acceptation **10 PASS / 1 FAIL** — W1-03 et W1-04 PASSENT avec le refus lu (« TEST-04 : la ligne ne se conclut pas — la cellule « Montant HT » est absent sans disposition écrite », « TEST-03 : une disposition porte un motif écrit — la cellule « signature » reste absent ») ; le FAIL restant est A-05 : le refus « papier visé » EST observé, mais une **exception d'hydratation React #418** est survenue sur le papier de travail pendant la tâche, et le harnais la compte — à raison (W5 reporté, voir §3). CI `local` sur 8302a23 (run 33643066949) : vert

## 1. Ce qui est cliquable ce soir et ne l'était pas ce matin

- **Démo → dossier → Contrôle sur pièces (testing) → « Calculer la grille »** : sous la pièce, la **bande de cellules** de la ligne ouverte — attendu, trouvé, **delta signé** (« +1 800,00 € », « −22 », « +6 j », « 0 »), tolérance, état en toutes lettres.
- **« p. 1 — montrer »** sur une cellule : la pièce se rouvre **avec le rectangle** dessiné par le serveur à l'endroit de la valeur.
- **Touche V** : la ligne se conclut — ou le refus nomme l'attribut et le code (TEST-04 / TEST-02) dans le bandeau, ligne restée ouverte.
- **« Disposer »** une cellule sans motif : refusé (TEST-03) ; avec motif : qui, quand, et V passe ; le badge **conclue** apparaît sur la ligne.
- Au-dessus de la liste : **l'avertissement** « n lignes non conclues » — famille `unsupported_sample_items`, drapeau nep-fr à off, le visa n'est pas bloqué.

## 2. Tâche par tâche

| Tâche annoncée | Sort | Une ligne |
|---|---|---|
| S1 décollision / bandes de migration | livré | test `migrations-bandes.test.ts`, `docs/MIGRATIONS_BANDES.md` |
| S5 registre des verdicts de verrou (0042) | livré | `engagement_lock_verdict`, « 0 table sans verdict » ; 4 tables neuves inscrites avec verdict « garde » |
| Verdicts des gardes lus depuis l'exécution | livré | `docs/GARDES_RESULTATS.json`, SANS RÉSULTAT quand rien n'a tourné |
| W0 harnais d'acceptation | livré | `npm run accept`, épreuves X-0/X-1/X-2, table + captures + SHA déclaré ; CI `url` la joue |
| W0 balayage 7× graine | livré | `npm run fumee -- --repetitions=7 --graine=…`, GREEN/INTERMITTENT/RED |
| W1 grille figée par pack | livré | `test_grid` v1, colonnes de la méthode, tolérances du pack, empreinte |
| W1 cellules ancrées, delta signé | livré | `test_cell`, ancre = pièce+page+rectangle (couche texte), route `/api/piece/…/ancre` |
| W1 refus TEST-01..04 | livré | G-13..G-16 prouvés en deux passes ; TEST-02/03/04 cliqués ; TEST-01 sans chemin cliquable |
| W1 famille en avertissement | livré | drapeau `flags.unsupportedSampleItemsBlocking=false`, fixture appariée |
| W1 ligne 0,4 % / mauvais tiers sur la démo publique | **reporté** | absents du jeu synthétique (A1–A8) et la démo ne se re-sème pas ; prouvés par fixtures appariées |
| W1 « mêmes colonnes FR/EN » cliqué | **reporté** | aucun commutateur de langue dans le produit ; prouvé par construction (contenu de pack) |
| S2, S3, S4, S6, S7, S8, S9 | reportés | un agent ; raisons ligne à ligne dans `docs/BACKLOG_REPORTE.md` |
| W2, W3, W4, W5, §4 | reportés | idem |

## 3. NON PROUVÉ

- **TEST-01** : aucun écran ne peut demander une cellule verte sans ancre — refus prouvé en deux passes (G-13), jamais par un clic.
- **Depuis le bac à sable de l'agent, l'URL déployée est inaccessible** (CONNECT 403 par la politique réseau) : les verdicts déployés ci-dessus sont ceux de la CI `url`, pas d'un clic de l'agent. Premier passage (run 33640390712, SHA 3bc9bd0) : W1-03 et W1-04 déclarés FAIL « aucun refus » — le harnais lisait l'URL avant la redirection de l'action serveur (plus lente en ligne qu'en local ; `waitForLoadState('networkidle')` se résout tout de suite si la page était déjà au repos). Ce n'est PAS le produit qui a accepté : la base déployée (Supabase, lecture directe) porte 0 `test_line_conclusion`, 0 `cell_disposition`, 91 `test_cell`, 1 `test_grid` après ce passage. Le harnais attend désormais la réponse de l'action puis l'URL du refus ; second passage (run 33643239966, SHA 8302a23) : W1-03 et W1-04 PASS, refus lus en toutes lettres — c'est le harnais qui se trompait, et il est corrigé. En local, le harnais a été conduit contre un `next start` de production : 3 épreuves déclarées FAIL comme attendu, puis 11 tâches sur 11 PASS (A-01…A-06, W1-01…W1-05) sur une base fraîchement semée — table dans `docs/ACCEPTATION.md`.
- **L'isolation entre cabinets est INERTE en production** : l'application tourne sous le rôle `postgres` (BYPASSRLS, ADR-115) ; la RLS est activée et forcée sur 106 tables mais n'est appliquée à personne ; la seule isolation à l'écriture est la garde de service G-20 (et, depuis ce jour, la clause `engagement_id` de la disposition de cellule). S2 (rôle `otto_app`) reporté.
- **#418 (hydratation)** : NON reproduit sur les sept parcours locaux du jour, mais OBSERVÉ une fois en ligne par le harnais d'acceptation (run 33643239966, tâche A-05, page du papier de travail REV-01, « Minified React error #418 ; args[]=HTML ») — une seule occurrence sur deux passages déployés. Aucune cause prouvée ; W5 reste reporté avec cette observation en plus (docs/BACKLOG_REPORTE.md). Le job `url` de la CI reste ROUGE tant que cette exception survient : c'est voulu.
- **La signature du BL** n'est jamais relevée par l'extraction : la cellule est « absente » sur chaque ligne à BL, et se dispose (un humain regarde).

## 4. Trois risques, et leur déclencheur

1. **Une version neuve de la grille** (méthode ou tolérances changées) fait apparaître toutes les lignes comme « non conclues » sans dire pourquoi — déclencheur : modifier `procedures.json` (DETAIL/CA) ou `substantive.tolerances`.
2. **Le rôle `postgres` en production** : une faute de service (une requête sans `engagement_id`) expose un autre cabinet — déclencheur : toute lecture nouvelle écrite sans le filtre, tant que S2 n'est pas fait.
3. **L'acceptation cliquée ÉCRIT sur l'instance déployée** (calcul de la grille à chaque déploiement, idempotent mais journalisé) — déclencheur : un déploiement par heure, et `event_log`/`engine_run` s'allongent.

## 5. Ce que le sous-agent hostile a cassé

Revue hostile lancée sur W0 + W1 + colonne vertébrale avant la fusion (16 points rendus). **Trouvé et corrigé** :
1. Les refus TEST-02/03/04 n'atteignaient JAMAIS l'écran : `?item=<id>?erreur=…` (second `?`), le bandeau ne lisait rien et les harnais auraient conclu « aucun refus » — un refus calculé puis jeté (règle 13). Corrigé dans `app/refus.ts` (`&` si le chemin porte déjà une question) — corrige aussi l'attestation et les balances auxiliaires.
2. Écriture inter-dossiers par `disposerCellule` (l'identifiant d'une cellule d'un AUTRE dossier passait) : clause `engagement_id` obligatoire, test.
3. Une disposition n'était pas liée à la valeur disposée (5 € disposés couvraient 50 000 € relus) : `state_at_decision` / `delta_at_decision` en base, déclencheur TEST-04 et service comparent, écran « disposition sur une autre valeur, à redisposer », test.
4. Les ancres se lisaient toujours en page 1 : lecture sur la page du champ relevé, test.
5. « Le PDF ancré diffère de la pièce nue » ne prouvait rien (pdf-lib re-sérialise sans dessiner) : preuve par l'opérateur `re` à l'abscisse de l'ancre, et son ABSENCE dans la pièce nue.
6. `/api/piece/…/ancre` rendait 500 sans `cellule` ou sur un identifiant invalide : 400/404, attendu déclaré dans le balayage.
7. Calcul non transactionnel et suppression de cellules bloquée par une disposition (FK) : tout calculé puis écrit en UNE transaction, dispositions des cellules disparues supprimées avec le journal.
8. Tiers : une chaîne vide ou courte (« SAS ») était « contenue » dans tout client : égalité, ou inclusion entre noms d'au moins six caractères ; fixture appariée.
9. Une date non ISO donnait un delta NaN écrit en base : « absente », valeur gardée.
10. Un AVOIR du même montant appuyait une VENTE (comparaison en valeur absolue) : comparaison signée par la nature de la pièce ; fixture appariée.
11. L'épreuve du harnais ne testait qu'un chemin : trois cas connus mauvais (assertion, gabarit d'erreur, exception du navigateur).
12. `gardes.test.ts` exigeait qu'il reste toujours des verdicts non confirmés ; `GARDES_RESULTATS.json` changeait d'horodatage à chaque exécution : corrigés.
13. Une pièce illisible dans le magasin rendait toutes les cellules « sans ancre » en silence : le calcul refuse en nommant la pièce.

**Trouvé, NON corrigé, reporté par écrit** : une version neuve de la grille rend toutes les lignes « non conclues » sans le dire ; aucun écran ne confirme un verdict de verrou (0042) ; l'acceptation cliquée écrit sur l'instance déployée (calcul idempotent, mais journalisé) ; la signature du BL jamais relevée.

## 6. Le parcours de 15 minutes (au moins trois refus à voir)

1. Ouvrir https://otto-dit.vercel.app, choisir **Karim Benali** (senior, le préparateur).
2. Ouvrir le dossier **Altiverre SAS**, audit légal, exercice 2025 (le premier de l'accueil).
3. Rail → **Contrôle sur pièces** (testing). Cliquer **« Calculer la grille »** (en haut à droite). L'en-tête de la bande dit « Grille de test v1 · 7 colonnes · figée le … · pack nep-fr · empreinte … ».
4. Cliquer une ligne **couverture exhaustive** : à droite, la pièce ; sous la pièce, la bande de cellules. Lire le **delta signé** sur « Montant HT » (« 0 » sur une ligne propre).
5. Cliquer **« p. 1 — montrer »** sur la cellule Montant HT : la pièce se recharge avec le **rectangle** sur la ligne « Total HT ».
6. Descendre (↓) jusqu'à la ligne **VE-2025-0706** (quantité) : la cellule « Quantité livrée » est **hors tolérance, delta −22**.
7. **Refus 1** — appuyer sur **V** : « TEST-04 : la ligne ne se conclut pas — la cellule « Quantité livrée » est hors tolérance (delta −22) sans disposition écrite. »
8. **Refus 2** — sur cette cellule, cliquer **« Disposer »** avec le motif VIDE : « TEST-03 : une disposition porte un motif écrit — la cellule « qte_livree » reste hors_tolerance. »
9. Disposer avec un motif (« écart vu, avoir à recevoir ») ; disposer de même la cellule « Signature du client » (absente). Appuyer sur **V** : la ligne porte **« conclue par Karim Benali · … »** et le badge **conclue** dans la liste.
10. Ligne **VE-2025-0707** (date 2026-01-06) : « Date de facture » **hors tolérance, +6 j** ; V refusé (TEST-04) tant qu'elle n'est pas disposée.
11. **Refus 3** — Papiers de travail → REV-01 → bloc **IPE** : choisir « FEC-2025 », vider les champs du nouveau rapport, arrêté **2026-01-15**, Enregistrer : refusé — « Ce papier est visé : l'information produite par l'entité ne se modifie plus » (le monde semé a visé ce papier). Le refus des deux dates côte à côte (2025-12-31 attendu) se voit sur un papier OUVERT : c'est ce que le parcours cliqué local conduit.
12. Retour à l'atelier : l'avertissement « n lignes non conclues … famille unsupported_sample_items, drapeau à off » au-dessus de la liste — et **Obstacles au visa** ne le compte pas.
13. `/api/sante` : le `sha` déclaré est celui de ce rapport.

Non cliquable ce soir, dit tel quel : TEST-02 (mauvais tiers) — aucune ligne du jeu ne diverge sur l'identité ; TEST-01 — aucun chemin d'écran.
