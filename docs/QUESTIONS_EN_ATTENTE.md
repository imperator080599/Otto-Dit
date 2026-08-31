# QUESTIONS EN ATTENTE — posées ici, jamais bloquantes

Règle du mandat : les questions que j'aurais voulu poser vont ici, avec le défaut retenu à
la place. Je n'attends pas de réponse.

| id | question | défaut retenu en attendant |
|---|---|---|
| Q-01 | Certaines banques n'acceptent que confirmation.com — faut-il y adhérer (compte payant, engagement du cabinet) ? | Adaptateur d'envoi simulé qui LE DIT + procédure alternative documentée (relance, pièce alternative) ; l'adhésion est une décision d'argent qui appartient à Tuan |
| Q-02 | ~~Connecteur Vercel non autorisé~~ **MOTIF ERRONÉ, corrigé (2026-08-31)** : le connecteur n'a jamais été le blocage — le projet Vercel existait, 17 déploiements READY servaient du VIDE (Root Directory ≠ app/, branche de production restée sur l'ancienne). J'ai rapporté « bloqué » sans jamais charger l'URL : règle 15 retournée contre moi. Règle de classe adoptée (DA-09) : la preuve d'un service externe est la RÉPONSE OBTENUE, jamais le statut annoncé | Tuan règle Root Directory=app, Production Branch=main, DATABASE_URL ; de mon côté vercel.json racine (ceinture et bretelles), et P0(a) n'est fini que quand J'AI chargé l'URL et lu l'écran |
| Q-03 | SMTP sortant réel : quel serveur/compte d'envoi pour la production ? | Configuration PAR DOSSIER (hôte, port, expéditeur) saisie dans les paramètres + adaptateur simulé par défaut ; rien ne part sans configuration explicite |
| Q-04 | Lecture libre/occupé via Microsoft Graph : l'enregistrement d'application (admin consent) est un chantier côté cabinet — qui le fait, quand ? | Reste derrière l'adaptateur simulé chiffré à part (ADR-101) ; le produit fonctionne sans |

## Q-05 — DATABASE_URL : posée pour QUELS environnements Vercel ? (2026-08-31)

**Ce qui est OBSERVÉ**, pas supposé (DA-09) — et depuis le 2026-08-31 16:32, MESURÉ dans
le journal du build lui-même :

```
deploy:reconstruire : DATABASE_URL est absente …
  Environnement du build : VERCEL_ENV=preview · branche main.
```

Le build de `main` s'exécute donc en **aperçu** (`VERCEL_ENV=preview`), pas en production
— la branche de production du projet n'est pas (encore) `main`. Et une variable cochée
pour le seul environnement « Production » est **absente** des builds d'aperçu : les deux
faits se combinent exactement en ce symptôme.

**Ce que ça demande à Tuan**, en un geste : Vercel → Settings → Environment Variables →
`DATABASE_URL` cochée pour **Production, Preview et Development** (la base de démonstration
est synthétique : aucun risque à l'exposer aux trois), et Production Branch = `main` pour
que les pousses sur `main` deviennent des déploiements de production.

**Défaut retenu en attendant** : le message d'échec du build NOMME cette cause, avec
`VERCEL_ENV` et la branche — et c'est ce message qui vient de livrer le diagnostic. Un
message qui ne dit pas quoi faire fait perdre un aller-retour à chaque fois ; celui-ci a
payé son écriture au premier build.

**Suite (2026-08-31, 18:44) — les trois réglages sont posés, et le build a AVANCÉ.**
`target: production`, `DATABASE_URL` présente : le script atteint le pooler et
`aws-0-eu-west-1.pooler.supabase.com` **répond** — `tenant/user postgres.fhxghmcehfdmxklkhfzk
not found`. Le locataire est donc enregistré sur l'AUTRE flotte (`aws-1-…`, DNS vérifié :
deux répartiteurs distincts, `pool-tcp-eu-west-1-…` et `pool-tcp-euw11-…`). Le projet est
`ACTIVE_HEALTHY`, la référence est la bonne : ce n'est ni le mot de passe, ni le pare-feu.
**Ce que ça demande** : copier l'URI depuis Supabase → Connect → Transaction pooler (l'hôte
exact y figure). En attendant, le code tente l'autre flotte une fois et l'écrit dans le
journal.

**RÉSOLU (2026-08-31 20:48).** Les trois réglages posés + la bascule automatique de flotte
(aws-0 → aws-1) ont donné un build vert, et l'URL a été **chargée** : HTTP 200, dossier
ouvert, atelier lu. Ce qui reste, et qui est une DÉCISION de Tuan, pas un défaut :
`ssoProtection: enabled (all_except_custom_domains)` — la protection « Vercel
Authentication » du projet. Tant qu'elle est active, **seul un compte Vercel autorisé** peut
ouvrir l'URL : le test des 90 minutes fonctionne (Tuan est connecté), mais l'adresse ne se
partage à personne d'autre. Le lever : Vercel → Settings → Deployment Protection → Vercel
Authentication → *Disabled*. Je ne l'ai pas touchée — c'est un réglage d'accès vers
l'extérieur, il appartient au fondateur.

