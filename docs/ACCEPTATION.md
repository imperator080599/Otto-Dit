# Acceptation cliquée — http://localhost:3393

SHA déclaré par l'instance : `36bac9e7e580ecd1fcaa6df710c7b5c89e3276ed` · mode sonde (écritures annulées) · 17 tâche(s) · **0 FAIL** · 2026-09-03 09:20 UTC

| code | tâche | verdict | quand (UTC) | détail | capture |
|---|---|---|---|---|---|
| A-01 | accueil : les identités de démonstration sont proposées | PASS | 2026-09-03 09:20:08 | 4 identités proposées | `A-01.png` |
| A-02 | tableau de bord « Mes travaux » : sections attribuées et obstacles (Groupe 1, 1.2) | PASS | 2026-09-03 09:20:09 | 18 ligne(s) de travaux | `A-02.png` |
| A-03 | dossier : le rail et les destinations rendent | PASS | 2026-09-03 09:20:10 | 34 destinations | `A-03.png` |
| A-04 | obstacles au visa : la liste calculée rend | PASS | 2026-09-03 09:20:11 | OTTOassurance platform DEMONSTRATION — fictional data only · données fictives un | `A-04.png` |
| A-05 | IPE : redésigner un rapport pour un AUTRE arrêté est REFUSÉ — les deux dates côte à côte sur un papier ouvert, « papier visé » sur un papier déjà visé (Groupe 1, 1.8) | PASS | 2026-09-03 09:20:12 | papier visé — refusé : « Ce papier est visé : l’information produite par l’entité ne se modifie plus. » | `A-05.png` |
| A-06 | atelier de test : la pièce est dans l’écran, à côté de la ligne | PASS | 2026-09-03 09:20:15 | 16 ligne(s), visionneuse présente | `A-06.png` |
| W1-01 | grille : la grille est calculée (cliquée en écriture, lue en mode sonde) et une ligne montre sa bande de cellules avec un delta signé | PASS | 2026-09-03 09:20:16 | 91 cellule(s) · 74 delta(s) signé(s) : 0 € · 0 j · 0 · 0 · 0 · 0 j | `W1-01.png` |
| W1-02 | ancre : cliquer une cellule ouvre la pièce avec le rectangle, à sa page ; le PDF rendu diffère de la pièce nue | PASS | 2026-09-03 09:20:23 | page=1;x=50;y=560.08;w=128.99;h=13.75 | `W1-02.png` |
| W1-03 | refus : V sur une ligne dont une cellule n’est pas conforme est refusé, attribut et code nommés (TEST-04) | PASS | 2026-09-03 09:20:25 | refusé : « TEST-04 : la ligne ne se conclut pas — la cellule « Montant HT » est absent sans disposition écrite. » | `W1-03.png` |
| W1-04 | refus : disposer une cellule sans motif est refusé par le serveur (TEST-03) | PASS | 2026-09-03 09:20:27 | refusé : « TEST-03 : une disposition porte un motif écrit — la cellule « signature » reste absent. » | `W1-04.png` |
| W1-05 | grille figée : l’en-tête annonce la version et le nombre de colonnes du pack, et aucune ligne ne montre plus de cellules que la grille n’a de colonnes | PASS | 2026-09-03 09:20:29 | grille v1, 7 colonnes ; au plus 7 cellules par ligne | `W1-05.png` |
| S2-01 | poste : visas en haut, leadsheet N/N-1 signée avec son origine, dix sections en ancres, plus de « ce qui reste ouvert », refus ANA-01 observé | PASS | 2026-09-03 09:20:33 | 3 visas en haut · 7 colonnes · N-1 : dossier_n1 · 10 ancres · refus ANA-01 : « ANA-01 : une revue analytique vide n’est pas une revue analy » | `S2-01.png` |
| S2-02 | sonde : un geste qui RÉUSSIT (enregistrer une revue analytique) répond sans figer le serveur — en sonde la version n’avance pas, en écriture elle avance | PASS | 2026-09-03 09:20:36 | réponse en 8.5 s · version 1 → 1 (sonde) | `S2-02.png` |
| E-01 | monde enrichi : le tableau de bord a une forme — des sections dans les quatre états, réparties entre plusieurs personnes | PASS | 2026-09-03 09:20:47 | quatre états portés par des lignes de section · 6 détenteur(s) | `E-01.png` |
| E-02 | monde enrichi : le poste porte au moins cinq papiers à des visas différents, et l’en-tête lit un visa PÉRIMÉ | PASS | 2026-09-03 09:20:48 | 7 papier(s) · statuts signed, in_review, draft, outdated · 1 visa(s) périmé(s) en en-tête | `E-02.png` |
| E-03 | monde enrichi : des notes de revue ouvertes, d’ancienneté variable, dont une posée sur une cellule | PASS | 2026-09-03 09:20:50 | 10 note(s) ouverte(s), dont une sur une cellule | `E-03.png` |
| N-01 | notes de revue : le repère d’une cellule ouvre le FIL à côté du travail — type, ancienneté en jours ouvrés, destinataire, réponses — et la clôture par l’auteur est refusée en toutes lettres | PASS | 2026-09-03 09:20:51 | 1 repère(s) · 1 note(s) dans le panneau · posted 1 business day(s) ago · 0 clôture(s) offerte(s), 1 raison(s) écrite(s) · repli basculé puis remis | `N-01.png` |

Captures : `/tmp/claude-0/-home-user-Otto-Dit/0d8524a6-59f7-5065-a6ae-7c87bd5d0d83/scratchpad/captures` (hors dépôt). Ce que ce harnais ne prouve pas : les visas, le scellé, l'isolation entre cabinets — il conduit une identité sur un dossier.
