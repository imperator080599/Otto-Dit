# État de l'art — où OTTO se situe (mandat v1.1 §8.2)

Recherche web du 2026-08-31 (sites officiels, bases de connaissances produits, avis
G2/Capterra, presse spécialisée), par sous-agent de recherche ; sources citées par
affirmation dans le compte rendu d'origine. **Méthode et limites** : datasnipper.com et sa
base de connaissances sont bloqués par le proxy de l'environnement — les fonctions
DataSnipper sont établies par extraits indexés et sources tierces, pas par lecture directe ;
les prix de DataSnipper, MindBridge, AuditBoard et Fieldguide ne sont pas publics ; aucune
présence NEP/France trouvée pour MindBridge, Inflo, Fieldguide, Suralink.

## Les sept, en une ligne chacun

| Produit | Cœur | Ce qu'il fait mieux qu'OTTO aujourd'hui | Ce qu'OTTO fait mieux | À lui prendre |
|---|---|---|---|---|
| **DataSnipper** | Vouching dans Excel (snips, cross-références) | Matching EN LOT d'un échantillon entier (fuzzy + tolérances) ; réplication par gabarit ; Sum Snip (casting) ; suite de tie-out des états financiers | Base + workflow + piste d'audit indépendante du classeur ; refus et obstacles CALCULÉS ; L2 structurel | Le rapprochement en lot ; l'exception typée ancrée sur la zone de la pièce |
| **Inflo** | Plateforme d'audit bout-en-bout (UK) | Analytique de POPULATION COMPLÈTE avant échantillonnage (Detect) ; cascade revenus guidée | Refus qui s'affichent, provenance, packs contenu, portail réel | Routines déterministes en lot sur le FEC à l'import ; cascade revenus |
| **MindBridge** | Scoring de risque IA de 100 % du GL | Score composite EXPLICABLE par écriture (40+ points de contrôle) | Le dossier entier (MindBridge n'est qu'une analyse) ; zéro réseau en démo | Score = somme de points nommés qui stratifie l'échantillon — jamais une conclusion |
| **CaseWare** | Le titulaire des papiers de travail | Roll-forward annuel du dossier ; balance→feuilles→états liés ; contenus par pays (dont Audit France NEP — validation du pari « pack = contenu ») | Ergonomie, refus lisibles, IA cadrée, web natif | Le roll-forward N→N+1 ; les ~80 tests FEC d'IDEA comme référentiel de complétude mécanique |
| **AuditBoard** | GRC côté ENTREPRISE (SOX interne) | Matrice de contrôles vivante côté client ; une évidence mappée sur plusieurs référentiels | OTTO est côté auditeur — c'est l'interlocuteur d'en face, pas un concurrent | Évidence réutilisable multi-requêtes, mapping tracé |
| **Suralink** | Le PBC seul, en profondeur | Boucle rejet/re-soumission par pièce ; double assignation cabinet/client ; import de gabarits tableur | La requête LIÉE au dossier (retard = obstacle au visa) — liaison que Suralink n'a pas | La boucle de rejet motivé par pièce ; l'import de listes PBC existantes |
| **Fieldguide** | Plateforme AI-native d'engagements (US) | Orchestration agentique complète avec CHECKPOINTS humains visibles ; Request Agent (complétude d'une pièce dès dépôt) ; vue portefeuille cabinet | Ancrage NEP+FEC ; démo intégralement rejouable hors ligne ; provenance ai_run systématique | Le contrôle de complétude au dépôt (suggestion L2) ; le checkpoint L2 rendu VISIBLE à l'écran |

## Synthèse

1. **Le créneau d'OTTO est réellement vacant** : personne ne couvre NEP + SOX dans un même
   produit (CaseWare fait NEP par contenu France ; AuditBoard fait SOX côté interne ;
   DataSnipper/Fieldguide sont US-génériques).
2. **Deux paris d'architecture validés par le marché** : la méthodologie en packs de
   contenu (Caseware Audit France) et l'IA plafonnée par revue humaine (checkpoints
   Fieldguide, scoring-sans-conclusion MindBridge).
3. **Les deux manques les plus criants d'OTTO** face à l'état de l'art : le rapprochement
   EN LOT (Document Matching) et l'analytique full-population en amont de l'échantillonnage
   — tous deux entrés au registre (section D).
4. Le terrain d'attaque des titulaires : interfaces datées, prix opaques, déploiements
   longs, permissions pauvres.
