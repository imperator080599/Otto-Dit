# QUESTIONS EN ATTENTE — posées ici, jamais bloquantes

Règle du mandat : les questions que j'aurais voulu poser vont ici, avec le défaut retenu à
la place. Je n'attends pas de réponse.

| id | question | défaut retenu en attendant |
|---|---|---|
| Q-01 | Certaines banques n'acceptent que confirmation.com — faut-il y adhérer (compte payant, engagement du cabinet) ? | Adaptateur d'envoi simulé qui LE DIT + procédure alternative documentée (relance, pièce alternative) ; l'adhésion est une décision d'argent qui appartient à Tuan |
| Q-02 | Le connecteur Vercel n'est pas autorisé dans cette session (OAuth impossible ici). L'autoriser : claude.ai → Réglages → Connecteurs → Vercel | Déploiement entièrement préparé (config, données reconstruites au build, bandeau « données fictives », IA réelle OFF, aucune clé côté client) — il tiendra en un geste dès l'accès |
| Q-03 | SMTP sortant réel : quel serveur/compte d'envoi pour la production ? | Configuration PAR DOSSIER (hôte, port, expéditeur) saisie dans les paramètres + adaptateur simulé par défaut ; rien ne part sans configuration explicite |
| Q-04 | Lecture libre/occupé via Microsoft Graph : l'enregistrement d'application (admin consent) est un chantier côté cabinet — qui le fait, quand ? | Reste derrière l'adaptateur simulé chiffré à part (ADR-101) ; le produit fonctionne sans |
