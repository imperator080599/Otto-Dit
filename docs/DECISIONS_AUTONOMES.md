# DÉCISIONS AUTONOMES — mandat v1 (2026-08-31 →)

Format imposé par le mandat : question posée · options · décision retenue · raison ·
coût pour revenir en arrière. Une décision par entrée, jamais supprimée.

## DA-01 — Ordre effectif du backlog

**Question.** Le mandat ordonne P0 → 2 → 10 → 12 → 9 → 8 → 1, 5, 11, 3, 4, 6 → 7, mais
10, 12, 11 et 1 sont déjà livrés (commits 1d16403, 55842ab, 29b5907, f33442b).
**Options.** (a) Rejouer les points faits ; (b) les marquer `fait` au registre et suivre
l'ordre sur ce qui reste.
**Décision.** (b) : P0 → finir 2 → 9 (§3.D) → 8 → 5 → 3 → 4 → 6 → 7, en intercalant les
exigences §3 nouvelles (M-13 à M-17) au plus près des écrans qu'elles touchent.
**Raison.** Le mandat dit « tu ne réécris pas ce qui marche » ; l'ordre visait « le meilleur
d'abord », déjà satisfait pour 10/12.
**Coût de retour.** Nul — l'ordre restant est re-priorisable à tout moment.

## DA-02 — Mandat contre « périmètre gelé » (CLAUDE.md règle 14)

**Question.** CLAUDE.md gèle : aucun cycle au-delà du chiffre d'affaires, aucun contenu de
procédure nouveau, SOX gelé. Le mandat exige budget/heures, continuité d'exploitation,
bascule de référentiel comptable (PCG/IFRS/US GAAP).
**Options.** (a) Refuser au nom du gel ; (b) appliquer le mandat et noter la contradiction.
**Décision.** (b) — le mandat le dit lui-même : « en cas de contradiction, ce mandat gagne,
et tu notes la contradiction ». Le gel RESTE appliqué là où le mandat ne demande rien :
aucun nouveau cycle de testing substantif (achats, paie…) ne sera ouvert ; budget/heures et
continuité sont des travaux transverses, pas des cycles ; les packs restent du CONTENU,
jamais un fork de code.
**Coût de retour.** Faible — chaque ajout est une tranche isolée, retirable.

## DA-03 — Déploiement : Vercel non autorisé dans la session

**Question.** Le mandat fait de l'URL la priorité absolue (« l'accès est donné »). Dans
cette session, le connecteur Vercel exige une autorisation OAuth impossible en session non
interactive ; aucun jeton Vercel n'est présent dans l'environnement.
**Options.** (a) Attendre ; (b) déployer ailleurs ; (c) préparer TOUT le déploiement
(config, garde-fous, données reconstruites, bandeau) pour qu'il tienne en un geste, le dire
à Tuan en une ligne, et continuer le backlog.
**Décision.** (c). Pas (b) : le mandat nomme Vercel.
**Raison.** « Aucune question bloquante » — mais publier une URL est un acte externe qui
exige l'accès ; tout le reste du chemin critique est, lui, faisable maintenant.
**Coût de retour.** Nul.

## DA-04 — Vidéo d'entretien (F-14)

**Question.** L'idée d'origine intègre la vidéo de la réunion de contrôle interne.
**Options.** (a) Ingestion vidéo + transcription automatique ; (b) transcript collé, vidéo
reportée.
**Décision.** (b), état `reporté` au registre.
**Raison.** La transcription vidéo exige un service externe (coût, données personnelles,
consentement) ; le geste d'audit — confronter le dit au documenté — est entièrement couvert
par le transcript (ADR-108). La précaution juridique (docs/14) est déjà en place et
s'étendrait telle quelle à la vidéo.
**Coût de retour.** Faible — l'analyste prend du texte ; un transcripteur amont s'ajoute
sans toucher au reste.

## DA-05 — « Les agents retiennent les audits passés » (F-24)

**Question.** L'idée d'origine veut des agents qui s'améliorent en continu sur un même client.
**Options.** (a) Apprentissage continu du modèle ; (b) reprise N-1 structurée + méthode
versionnée, apprentissage reporté.
**Décision.** (b), état `reporté`.
**Raison.** Un comportement qui dérive sans provenance contredit la piste d'audit (P7) et
l'exigence de rejouabilité (règle 12) : on ne peut pas expliquer « pourquoi cette
conclusion » si le modèle a changé silencieusement. Le besoin réel — ne pas repartir de
zéro chez le même client — est couvert par le carry-forward structuré.
**Coût de retour.** Moyen — un jour, des exemples few-shot PAR CLIENT versionnés dans la
méthode seraient la voie compatible.

## DA-06 — « Chatbot général » rendu comme « Interroger » (F-09)

Décision HISTORIQUE (ADR-017), consignée ici parce que le registre la référence : pas de
prose libre sur le dossier — un catalogue fermé de requêtes, le modèle ne fait que choisir.
Raison : une réponse en prose non sourcée dans un dossier d'audit est une affirmation sans
preuve. Coût de retour : nul (le catalogue s'étend).

## DA-07 — Correctif du commit 27171bc (invariant « vert avant commit »)

**Question.** Le mandat cite 27171bc — commité pendant que la chaîne tournait — comme
l'exemple à ne pas reproduire.
**Décision.** Règle d'exécution adoptée : plus aucun commit tant que `npm run verify` n'a
pas rendu son verdict sur l'état exact commité ; si un état intermédiaire doit être commité
(sauvegarde), la PREMIÈRE ligne du message dit ce qui n'est pas prouvé.
**Coût de retour.** Sans objet.
