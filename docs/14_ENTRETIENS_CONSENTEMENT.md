# Entretiens enregistrés : consentement, données personnelles, conservation

Ce document formalise la précaution juridique du module « Contrôle interne et processus »
(ADR-108). Il dit ce que le produit FAIT, et marque [UNVERIFIED] ce qui relève d'un état du
droit que cet environnement n'a pas pu vérifier sur texte primaire (mêmes blocages réseau
que methodology/sources.json : legifrance.gouv.fr et les textes consolidés de l'UE n'ont pas
été atteints). **Rien ici n'est un avis juridique** — avant un usage réel, faire valider ces
règles par le référent juridique/DPO du cabinet.

## Ce que le produit impose, dans le code

1. **Le module fonctionne SANS enregistrement.** Le support par défaut d'un entretien est
   « notes » : compréhension documentée saisie à la main, aucun transcript, aucun
   consentement requis. C'est le chemin complet — refuser d'être enregistré ne prive
   d'aucune fonctionnalité d'audit.
2. **Enregistrer exige le consentement EXPLICITE de chaque participant, AVANT.** La création
   d'un entretien au support « enregistrement » est refusée si un seul participant n'a pas
   coché son consentement ; le refus nomme la personne. Chaque consentement est tracé —
   qui, quand (`interview_participant.consent_at`) — et visible à l'écran.
3. **Une durée de conservation explicite, écrite à la création.** Un enregistrement sans
   échéance de conservation est refusé. À l'échéance, la purge supprime le TRANSCRIPT
   (le verbatim, qui contient des données personnelles : noms, propos) ; la COMPRÉHENSION
   DOCUMENTÉE et les ÉCARTS STATUÉS restent — ce sont les travaux de l'auditeur, soumis aux
   règles de conservation du dossier d'audit (six ans, voir rétention). L'écran DIT qu'une
   purge a eu lieu ; il ne fait pas disparaître l'entretien.
4. **Le transcript ne voyage pas.** Il vit dans la base de la mission (isolation par
   locataire), n'est pas montré en clair sur l'écran après dépôt, et n'est envoyé qu'à
   l'analyste configuré (rejeu local par défaut ; modèle réel uniquement sur choix explicite
   `npm run demo:ia`, journalisé dans `ai_run`).

## Pourquoi ces règles — l'état du droit tel que compris, non vérifié

- Un enregistrement de réunion où des personnes sont identifiables constitue un traitement
  de données personnelles au sens du RGPD (règlement (UE) 2016/679) ; il exige une base
  légale, une information des personnes, une durée de conservation limitée à la finalité et
  des droits d'accès/effacement. [UNVERIFIED : texte consolidé non atteint depuis cet
  environnement — les numéros d'articles ne sont volontairement pas cités.]
- La CNIL recommande, pour l'enregistrement d'entretiens et de réunions, une information
  préalable et un consentement lorsque l'enregistrement n'est pas strictement nécessaire à
  une obligation légale. [UNVERIFIED : doctrine CNIL non consultée sur source primaire.]
- Enregistrer une conversation À L'INSU d'un participant expose à des sanctions pénales en
  droit français (atteinte à la vie privée). [UNVERIFIED : article non vérifié.] Le produit
  rend ce cas impossible par construction : pas de consentement de chacun, pas
  d'enregistrement.
- La conservation du DOSSIER D'AUDIT (six ans, R. 820-42 — vérifié ailleurs, voir
  docs/DECISIONS.md rétention) ne s'applique pas au verbatim brut : la pièce d'audit est la
  compréhension documentée et les écarts statués, pas l'enregistrement. D'où la double
  échéance : transcript purgeable court, travaux conservés long. [Le partage exact de cette
  frontière est un choix de produit, à valider par le cabinet.]

## Ce que le produit ne fait PAS (encore)

- Pas de purge PLANIFIÉE : la purge est un geste d'écran (bouton, journalisé). Une échéance
  passée sans clic reste en base — l'écran la montre, il ne l'exécute pas seul.
- Pas de recueil du consentement PAR les participants eux-mêmes (par exemple via le portail
  client) : c'est l'auditeur qui atteste les consentements recueillis en séance.
- Pas de registre des traitements ni d'analyse d'impact (AIPD) : hors périmètre produit,
  charge du cabinet.
