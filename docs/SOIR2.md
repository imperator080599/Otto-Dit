# Rapport de la soirée — 2026-09-02 (mandat `OTTO_Mandat_Soiree.md`, §0 → §2)

## L'URL et le SHA réellement servis

- `https://otto-dit.vercel.app` — `/api/sante` déclare le SHA **du bundle** (cuit au build,
  ADR-121) : `edb5e6cbd7db6761952bf6618df0d53a5702f705` (source `git`, `identiteCoherente: true`, lu le 2026-09-02 à 19:52 UTC ; verdict « toutes les lectures passent », dont « revue analytique du poste : REVENUE · N-1 : dossier_n1 · 3 ligne(s) · revue non rédigée » — la migration 0130 est appliquée sur la base publique, et « espace de travail d’un poste : 10 étape(s) »). Le SHA de la plateforme est donné à côté, et
  `identiteCoherente` dit s'ils concordent.
- Poussé sur `main` : `edb5e6c` (« Soir — §0 sonde et identité de version, §1 rail par états financiers, §2 anatomie de la page de poste (0130) »). CI : job `local` (chaîne complète) et job `url`
  (acceptation cliquée contre le déploiement, en sonde). **Verdicts observés** : job `local` (run 33675437726) VERT ; job `url` (run 33675610608) : balayage 7× vert, épreuve 3/3, acceptation **12/13** — A-05 lit le refus attendu (« papier visé ») puis tombe sur l’exception d’hydratation #418 de la page du papier REV-01, la même qu’au run 33644396275 de l’après-midi (fil W5, deux occurrences en ligne sur la même page) ; S2-01 et S2-02 PASS. **Le témoin en production** (lecture SQL sur la base publique après le job, 19:59 UTC) : `fsli_analytique` 0, `engine_run` de revue analytique 0, `event_log` après 19:55 UTC 0, `section_visit` après 19:55 UTC 0 — la sonde n’a rien laissé sur le pilote réseau non plus ; le risque n°1 ci-dessous est mesuré, pas seulement écrit.

## Ce qui est cliquable ce soir et ne l'était pas cet après-midi (cinq lignes)

1. **Le rail se lit par états financiers** : `Balance sheet` puis `Profit and loss`, tous les
   postes du pack, grisés avec leur motif quand ils sont hors périmètre ; le rail se range (`[`).
2. **La page de poste** : visas en en-tête (périmés si le papier est dépassé), leadsheet
   N · N-1 · variation signée · % · XREF avec l'origine de N-1 écrite, dix sections repliables
   et mémorisées (papiers avec visas, écarts avec leur papier, demandes du poste), navigation par
   ancres, plus de « ce qui reste ouvert ».
3. **La revue analytique du poste**, sous la leadsheet, versionnée, jamais réécrite, périmée
   quand les chiffres bougent — et **la revue analytique du dossier** (écran neuf), le même objet
   pour tous les postes du pack.
4. **OTTO propose une rédaction d'après les chiffres** (déterministe, tracée), pré-remplie et
   marquée ; elle ne compte qu'enregistrée par une personne (L2).
5. **L'acceptation est une sonde** : contre l'URL, chaque geste est conduit puis annulé ; le
   témoin mesure « aucune écriture » ; `/api/sante` dit quel bundle répond.

## Ce qui n'est PAS fait (exhaustif)

- §3 la section « Audit procedures » alimentée par le risk assessment — non commencée.
- §4 le re-tirage d'échantillon et sa règle — non commencé.
- §5 les notes de revue en panneau latéral — non commencé (la note se pose sur une cellule de
  leadsheet, ancre `compte`, mais s'ouvre encore sur l'écran des notes).
- §6/§7 la passe esthétique — non faite ; les replis mémorisés n'existent que sur la page de
  poste ; le mouvement 120–200 ms n'est posé que sur le chevron des replis et les ancres.
- §9 le semis enrichissant — non fait ; la démonstration publique n'a pas été re-semée
  (règle permanente) ; le monde local est celui du jour.
- §10 : le plan est écrit (`docs/PLAN_RLS.md` — withTenant, puis rôle, puis chaîne), RIEN n'est
  exécuté, `DATABASE_URL` est intacte.
- §0.2 le locataire-sonde créé/détruit par le harnais : remplacé par l'annulation
  transactionnelle + témoin, reporté avec sa raison (docs/BACKLOG_REPORTE.md).
- Le compte de notes ouvertes de l'en-tête de poste est celui du DOSSIER, et le dit.

## Non prouvé

- ~~La sonde sur le pilote réseau~~ — PROUVÉE après coup par le job `url` (S2-02 en sonde contre
  l'instance déployée) et la lecture SQL de la base publique : aucune ligne laissée.
- L'application de la migration 0130 sur la base publique EXISTANTE : elle s'applique au
  déploiement (comme 0050) ; le verdict est dans le journal de build Vercel et `/api/sante`
  (lecture « revue analytique du poste »).
- L'exception d'hydratation #418 (fil W5) : EN LIGNE, 2 fois sur 2 sur la page du papier REV-01
  après le refus « papier visé » (tâche A-05, runs 33644396275 et 33675610608) ; EN LOCAL, 0 fois
  sur 3 sur le même bundle et le même chemin ce soir, et une fois sur `/testing` et
  `/requests/[rid]` au premier parcours cliqué de la tranche, absente au second. Aucune hypothèse
  prouvée ; le différentiel (même code, exécution Vercel + pilote `pg`) est consigné et le prochain
  geste — un déploiement de prévisualisation non minifié pour lire le texte qui diverge — est au
  backlog.
- Le rendu du repli et de la navigation par ancres sur un lecteur d'écran.

## Trois risques

1. **La sonde sur le pooler de transaction** — mesuré ce soir : après le job `url`, la base
   publique ne porte ni `fsli_analytique`, ni run, ni événement, ni visite. Le risque qui reste :
   une action qui écrit HORS base (fichier, courriel simulé) n'est pas annulée par une
   transaction ; aucune tâche d'acceptation n'en fait aujourd'hui, et le témoin ne le verrait pas.
2. **Une rédaction périmée ignorée** : le marqueur est visible mais rien ne BLOQUE le visa sur un
   poste dont la revue analytique est périmée. Déclencheur : un ré-import après le visa.
   Parade : une famille d'obstacles en avertissement (comme les lignes non conclues), demain.
3. **La mémoire des replis par navigateur** : une section repliée sur une machine partagée
   cache du contenu à la personne suivante (jamais une règle d'état, mais une surprise).
   Déclencheur : un poste de démonstration partagé. Parade : « tout déplier » en un geste (§7).

## Ce que le sous-agent hostile a cassé (et l'état de chaque point)

1. **CASSÉ, corrigé** : `tx()` sous `annulerApres` rouvrait une transaction → PGlite figé au
   premier geste réussi sous la sonde ; aucun harnais n'exécutait cette branche. → point de
   reprise ; `sonde.test.ts` (service réel, délai « BLOQUÉ » refusé) ; tâche S2-02.
2. **CASSÉ par lecture (pilote `pg`)**, corrigé par la même règle ; non exécuté ici.
3. **TROMPAIT, corrigé** : le run cité par une rédaction « proposée, validée » n'était pas
   vérifié → un run étranger faisait lire « proposée par OTTO ». → ANA-02 par le service, test.
4. **TROMPAIT, corrigé** : `section_visit` s'écrivait au rendu, hors sonde → tu sous la sonde,
   compté par le témoin (11 tables).
5. **TROMPAIT, dit** : sous la sonde, la proposition est annulée et son enregistrement est
   refusé, nommé (ANA-02) ; le chemin L2 complet est prouvé en `--ecrire` et par le parcours.
6. **TROMPAIT, corrigé** : « les soldes ont changé » alors qu'un compte détaché suffisait →
   la phrase dit « les soldes ou les comptes rattachés ».
7. **TROMPAIT, corrigé** : l'ADR affirmait une garde RLS par dossier que rien n'applique → dit
   vrai (politique par locataire, §10).
8. **TROMPAIT, dit** : « processus » et « contrôle interne » se comptent sur le dossier → l'état
   de section le dit.
9. **FRAGILE, corrigé** : l'action de proposition avalait les signaux de Next.
10. **FRAGILE, corrigé** : un refus effaçait la saisie → elle revient avec le refus.
11–14. **NIT** : nom d'état accessible sur les ancres (fait), clé de repli globale (dit),
   `missionN1` ordonnée (fait), STATUS.md (fait).

## Le parcours de 15 minutes — au moins trois refus à voir

1. Ouvrir l'URL, entrer comme **Karim Benali**. Rail : `Profit and loss › Chiffre d'affaires`.
2. Lire l'en-tête : trois visas, l'origine de N-1. Descendre : la leadsheet, la variation signée.
   Cliquer une variation → la revue analytique du dossier ; revenir par le poste.
3. **Refus 1** : vider la revue analytique, `Enregistrer` → « ANA-01 ».
4. Écrire une phrase, `Enregistrer` → v1. `Proposer une rédaction d'après les chiffres` → texte
   marqué « proposé », non enregistré ; corriger, `Enregistrer` → v2, « proposée, validée ».
5. Replier « Papiers de travail », recharger : toujours replié ; cliquer l'ancre « Papiers » :
   rouvert.
6. `Testing` : **refus 2** — `V` sur une ligne dont une cellule n'est pas conforme → « TEST-04 » ;
   **refus 3** — disposer une cellule sans motif → « TEST-03 ».
7. `Journal` : les événements `analytique.redigee` (v1, v2) et `analytique.proposee` (le run).
8. `/api/sante` : le SHA du bundle, la lecture « revue analytique du poste », les gardes.
