<!-- ENGENDRÉ par `cd app && npm run densite` — ne pas éditer à la main. -->
# Densité mesurée — 73 écrans (build de production, base semée)

Mesure prise sur le commit `4f77ccb + arbre de travail modifié (mesure prise avant le commit qui la publie)`, build `tkkivxuM-ClrMXJHh6kDW`.
Définitions : voir l'en-tête de `app/scripts/mesures/densite.ts` (la mesure porte sa définition).
Critère du mandat §3.D : aucun écran au-delà de **5 actions primaires** — 0 dépassement(s).

« Repliées » et « d'item » sont hors critère PAR CONCEPTION (repli piloté ADR-072, geste
d'objet) — et publiées ici précisément pour que replier ne devienne jamais un moyen de
passer sous le seuil. « Champs à taper » compte les champs repliés : replier ne supprime
pas la frappe. Le titre est celui LU dans la page — la preuve que la mesure a vu l'écran.

Écrans qui déclarent des gestes d'OBJET (exclus du critère, raison écrite dans la mesure) :
- `/eng/[id]/workpapers/[wid]` — les gestes PAR NOTE de revue (traiter, clore) — un groupe par note
- `/eng/[id]/testing` — les onglets de pièce de l'atelier — choisir une pièce parmi n, comme des onglets
- `/methodology` — la bande de sélection du fichier de méthode — un lien par fichier attendu

| Écran | Actions primaires | Repliées | D'item | Champs à taper | Titre lu |
|---|---|---|---|---|---|
| `/eng/[id]/reunions (SOX)` | 5 | 0 | 0 | 6 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/obstacles` | 5 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/events` | 4 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/events (SOX)` | 4 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/obstacles (SOX)` | 4 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/workpapers/[wid]` | 3 | 3 | 136 | 10 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/team` | 3 | 0 | 3 | 9 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/team (SOX)` | 3 | 0 | 3 | 9 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/reunions` | 3 | 0 | 0 | 6 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/dashboard` | 3 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/dashboard (SOX)` | 3 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/provenance` | 3 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/provenance (SOX)` | 3 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/processus` | 2 | 0 | 0 | 11 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/processus (SOX)` | 2 | 0 | 0 | 11 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/` | 2 | 1 | 0 | 6 | Engagements |
| `/eng/[id]/imports` | 2 | 0 | 0 | 1 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/imports (SOX)` | 2 | 0 | 0 | 1 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/testing` | 2 | 1 | 2 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/testing (SOX)` | 2 | 2 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/estimations` | 1 | 0 | 0 | 2 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/estimations (SOX)` | 1 | 0 | 0 | 2 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/ask` | 1 | 0 | 0 | 1 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/ask (SOX)` | 1 | 0 | 0 | 1 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/balances-aux` | 1 | 0 | 0 | 1 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/balances-aux (SOX)` | 1 | 0 | 0 | 1 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/carry-forward` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/circularisations` | 1 | 2 | 2 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/completion` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/completion (SOX)` | 1 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/fs-tieout` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/fs-tieout (SOX)` | 1 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/loop` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/materiality` | 1 | 0 | 4 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/materiality (SOX)` | 1 | 0 | 4 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/population` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/population (SOX)` | 1 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/poste/[code]` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/rcm` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/reconciliation` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/reconciliation (SOX)` | 1 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/requests/[rid]` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/risk` | 1 | 0 | 17 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/sampling` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/sampling (SOX)` | 1 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/scoping` | 1 | 0 | 17 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/scoping (SOX)` | 1 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/workpapers` | 1 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/methodology` | 1 | 0 | 12 | 0 | Firm methodology |
| `/portal/[token]/[rid]` | 1 | 0 | 27 | 0 | R-001 — Justificatifs — contrôle du chiffre d'affaires (sélection) |
| `/eng/[id]` | 0 | 0 | 10 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id] (SOX)` | 0 | 0 | 10 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/acceptance` | 0 | 0 | 11 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/acceptance (SOX)` | 0 | 0 | 11 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/carry-forward (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/circularisations (SOX)` | 0 | 2 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/close` | 0 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/close (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/evidence` | 0 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/evidence (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/exceptions` | 0 | 0 | 13 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/exceptions (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/loop (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/notes` | 0 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/notes (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/rcm (SOX)` | 0 | 0 | 8 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/rcm/[cid]` | 0 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/requests` | 0 | 0 | 0 | 0 | Altiverre FY2025 — Audit légal (NEP) |
| `/eng/[id]/requests (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/risk (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/eng/[id]/workpapers (SOX)` | 0 | 0 | 0 | 0 | Altiverre FY2025 — SOX 404 component (PCAOB/COSO) |
| `/portal/[token]` | 0 | 0 | 7 | 0 | Bonjour Sophie Marchand |
| `/travaux` | 0 | 0 | 0 | 0 | My work |
