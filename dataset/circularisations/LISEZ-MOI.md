# Listings de circularisation — 100 % fictifs

Ce que le CLIENT fournit, tel qu'il le fournit : un tableau `Tiers;Contact;Reference;Compte`.

- `banques.csv` — le listing **initial**, avec le défaut que la complétude doit trouver :
  le compte du grand livre `512100` (Banque Lyonnaise de Crédit) n'y est **pas** — la ligne
  le rattache à `512900`, qui n'existe pas — et `Crédit Méridien` annonce un compte `512200`
  qu'aucune écriture ne porte. Les deux sens du contrôle sont donc démontrables sur le même
  fichier.
- `banques-corrige.csv` — ce que le client renvoie après la question : le bon compte, et le
  compte non comptabilisé retiré (il était clos).
- `avocats.csv` — le cabinet qui suit le litige provisionné au compte `151000`.
- `fournisseurs.csv` — Lot 5, poste 4 (Fournisseurs, 2026-09-15) : deux fournisseurs déjà
  connus du dossier (mêmes raisons sociales fictives que `dataset/balances_aux/fournisseurs_2025.csv`,
  F001/F002), tous deux rattachés au compte collectif `401000` — ce pack ne porte qu'UN SEUL
  compte fournisseurs au grand livre (`fsliAccounts`, vérifié par exécution). Aucun défaut de
  complétude délibéré ici (contrairement à `banques.csv`) — ce fichier sert la nature
  `confirmation_externe`, pas une démonstration du contrôle de complétude, déjà couverte par
  `banques.csv`.
  **Limite structurelle, plus sévère qu'annoncé à l'écriture initiale de ce fichier, prouvée par
  exécution (revue hostile du 2026-09-15, C1, `docs/BACKLOG_REPORTE.md` R96) : ce fichier n'est
  PAS encore consommé par un flux d'import (aucun `importerListing(..., 'fournisseur', ...)`
  câblé au monde semé) — c'est un listing PRÉPARÉ pour la tranche d'ouverture du poste
  Fournisseurs, pas encore joué. Le jour où il le sera, `rapprochement()` comparera le solde
  confirmé d'UN tiers au solde ENTIER du compte collectif : même une confirmation exacte et
  complète de Float Glass (193 502,33 €) contre le solde du compte (-265 632,25 €) produit un
  écart de 459 134,58 € — pas une anomalie du dossier, un artefact de la comparaison (voir le
  commentaire dans `circularisations.ts` près de `rapprochement()`/`completude()`). Ce n'est PAS
  résolu par réduire le nombre de tiers du listing : le défaut tient au compte COLLECTIF, pas au
  nombre de lignes. R96 est une condition BLOQUANTE avant de semer une vraie campagne fournisseur
  avec des réponses déposées — pas seulement une note.**

Aucune banque, aucun cabinet, aucun fournisseur, aucun IBAN et aucune adresse ne correspondent
à quoi que ce soit de réel : les domaines sont en `.example`, réservé par la RFC 2606 précisément
pour ça.
