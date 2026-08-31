# 13 — L'accès direct à l'ERP : l'architecture qui ne se ferme pas (point 11b, ADR-106)

**Statut : une page, pas du code — voulu ainsi par le fondateur.** L'objectif de long terme
est de supprimer la plupart des demandes au client en récupérant les pièces directement dans
son système, avec un circuit d'autorisation côté client pour l'inspection d'une transaction
donnée. Rien de tout cela n'est construit aujourd'hui, et rien ici n'affirme le contraire.
Cette page décrit ce qui, dans l'architecture actuelle, garantit que ce chantier s'OUVRIRA
sans refonte — et ce qui manquera le jour venu.

## 1. Ce qui existe déjà — la source d'une pièce est un attribut

Chaque pièce du dossier porte sa provenance en base, depuis la première migration :

- `evidence.source` — contrainte d'énumération : `'portal'` (dépôt au portail client),
  `'email'` (arrivée par courriel), `'auditor'` (déposée par l'équipe — les annexes de
  papier de travail l'utilisent).
- L'écran « Pièces reçues » AFFICHE cette source (badge par ligne) ; le journal du dossier
  la consigne dans l'événement `evidence_received` ; l'archive scellée l'emporte.
- Tout ce qui entre passe par UN moteur (`ingestEvidence`) : empreinte SHA-256, détection de
  doublon, quarantaine, audience (`client_provided` / `internal`), auteur du dépôt. Une
  pièce venue d'une API entrerait par la même porte et hériterait de tout cela.

Ajouter la valeur `'erp_api'` est **une migration d'une ligne** (étendre la contrainte
`check`) plus un adaptateur derrière l'interface existante. La contrainte actuelle ne liste
PAS cette valeur — c'est volontaire : une valeur d'énumération que rien ne produit serait
une branche que rien n'exécute (règle 13). Elle s'ajoute avec le premier adaptateur, pas
avant.

## 2. L'échelle de repli — trois barreaux, du meilleur au toujours-possible

Comme l'échelle d'extraction (ADR-002), l'accès aux pièces est une ÉCHELLE : on prend le
meilleur barreau disponible chez ce client, et le barreau du dessous reste toujours là.

| Barreau | Ce que c'est | Ce qu'il faut | État |
|---|---|---|---|
| **1. API directe de l'ERP** | OTTO va chercher la pièce (facture, BL, écriture) dans le système du client, sur autorisation | un connecteur par famille d'ERP ; un consentement d'administrateur côté client ; le circuit d'autorisation ci-dessous | non construit |
| **2. Exports normalisés** | Le client exporte un format standard (FEC pour les écritures — déjà en place ; Factur-X pour les factures — déjà lu par l'échelon 1 d'extraction) | rien de neuf côté OTTO : l'import FEC et la lecture Factur-X existent | **en place** |
| **3. Dépôt manuel** | Portail client ligne à ligne, courriel entrant | rien — c'est le fonctionnement actuel | **en place** |

Le barreau 2 est déjà la moitié du chemin : un client qui sait exporter son FEC et ses
factures électroniques donne à OTTO des pièces STRUCTURÉES, gratuites à lire (échelons
déterministes), sans connecteur. La vague de facturation électronique (docs/10 §C) élargit
ce barreau d'elle-même.

## 3. Le circuit d'autorisation côté client — ce que le barreau 1 exigera

Le principe retenu (même famille que les réunions, ADR-101 : le moindre accès qui suffit) :

1. **Jamais un accès permanent et général.** L'autorisation vise une MISSION et un
   PÉRIMÈTRE (exercice, journaux, plage de comptes), accordée par un responsable côté
   client, révocable, journalisée des deux côtés.
2. **L'inspection d'une transaction est une DEMANDE.** OTTO demande « la facture liée à
   l'écriture VE-2025-0708 » ; le connecteur la rapporte ; la demande, la réponse et
   l'empreinte de la pièce entrent au journal — le client peut relire ce qui a été pris,
   pièce par pièce.
3. **Ce qui arrive par l'API suit le même chemin que le reste** : `ingestEvidence`
   (source `erp_api`), classification, échelle d'extraction, file d'attestation humaine
   (L2), vouching. Le connecteur change la PROVENANCE, jamais les règles.
4. **Refus de principe** de tout accès en écriture au système du client, et de tout scope
   plus large que les pièces demandées — même logique que le refus du contenu des agendas
   (libre/occupé seulement, ADR-101).

## 4. Ce qui manque, dit sans détour

- Aucun connecteur n'existe, pour aucun ERP. L'ordre de grandeur d'un premier connecteur
  (famille la plus répandue chez les PME françaises auditées) : 2-3 tranches, dont une
  entière pour les refus, la journalisation double et la métrologie — sur le modèle du
  chantier Microsoft 365 des réunions (fil n°10 de STATUS.md).
- Le circuit d'autorisation ci-dessus est un PRINCIPE, pas une spécification : le détail
  (OAuth du fournisseur, comptes de service, granularité des périmètres) dépend de chaque
  ERP et ne peut pas s'écrire honnêtement sans un système réel en face.
- Rien n'est démontrable sans client pilote équipé — et c'est écrit ici plutôt que simulé :
  un connecteur simulé de plus n'apprendrait rien que le barreau 3 ne montre déjà.
