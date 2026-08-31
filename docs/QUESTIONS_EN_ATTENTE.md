# QUESTIONS EN ATTENTE — posées ici, jamais bloquantes

Règle du mandat : les questions que j'aurais voulu poser vont ici, avec le défaut retenu à
la place. Je n'attends pas de réponse.

| id | question | défaut retenu en attendant |
|---|---|---|
| Q-01 | Certaines banques n'acceptent que confirmation.com — faut-il y adhérer (compte payant, engagement du cabinet) ? | Adaptateur d'envoi simulé qui LE DIT + procédure alternative documentée (relance, pièce alternative) ; l'adhésion est une décision d'argent qui appartient à Tuan |
| Q-02 | ~~Connecteur Vercel non autorisé~~ **MOTIF ERRONÉ, corrigé (2026-08-31)** : le connecteur n'a jamais été le blocage — le projet Vercel existait, 17 déploiements READY servaient du VIDE (Root Directory ≠ app/, branche de production restée sur l'ancienne). J'ai rapporté « bloqué » sans jamais charger l'URL : règle 15 retournée contre moi. Règle de classe adoptée (DA-09) : la preuve d'un service externe est la RÉPONSE OBTENUE, jamais le statut annoncé | Tuan règle Root Directory=app, Production Branch=main, DATABASE_URL ; de mon côté vercel.json racine (ceinture et bretelles), et P0(a) n'est fini que quand J'AI chargé l'URL et lu l'écran |
| Q-03 | SMTP sortant réel : quel serveur/compte d'envoi pour la production ? | Configuration PAR DOSSIER (hôte, port, expéditeur) saisie dans les paramètres + adaptateur simulé par défaut ; rien ne part sans configuration explicite |
| Q-04 | Lecture libre/occupé via Microsoft Graph : l'enregistrement d'application (admin consent) est un chantier côté cabinet — qui le fait, quand ? | Reste derrière l'adaptateur simulé chiffré à part (ADR-101) ; le produit fonctionne sans |
