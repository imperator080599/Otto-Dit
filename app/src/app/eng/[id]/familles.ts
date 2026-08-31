// LES NOMS DES FAMILLES D'OBSTACLES, EN UN SEUL ENDROIT.
//
// L'écran de clôture affichait les CODES — « questionnaire — 2 », « achevement
// — 1 » : des identifiants sans accents, donnés à lire à un signataire. Les
// titres existaient déjà sur l'écran des obstacles. Les recopier aurait créé
// deux vérités sur les mêmes familles, et c'est exactement ce que ce dossier
// refuse ailleurs : elles vivent ici, et les deux écrans les lisent.

export const FAMILLES: Record<string, { titre: string; pourquoi: string }> = {
  acceptation: {
    titre: 'Acceptation de la mission',
    pourquoi: 'Un dossier commence par une décision. Tant qu’elle n’est pas prise, rien d’autre ne compte.',
  },
  independance: {
    titre: 'Indépendance',
    pourquoi: 'Aucun travail attribué à quelqu’un dont la déclaration n’est pas signée n’entre au dossier.',
  },
  reprise: {
    titre: 'Reprise de l’exercice précédent',
    pourquoi: 'Une conclusion de N-1 non statuée serait reprise en silence — ou perdue en silence.',
  },
  questionnaire: {
    titre: 'Questionnaire résiduel de risque',
    pourquoi: 'Ce qu’aucune autre source du dossier ne peut lever : si personne ne répond, le risque ne voit que ce qui se compte.',
  },
  circularisation: {
    titre: 'Circularisations',
    pourquoi: 'Un compte que personne ne confirme, une demande jamais partie, un silence ou un écart non expliqué : la confirmation d’un tiers est une preuve qu’on ne fabrique pas soi-même.',
  },
  programme: {
    titre: 'Périmètre sans programme',
    pourquoi: 'Un poste retenu sur lequel aucune procédure n’est planifiée est un trou : soit on le travaille, soit on le sort du périmètre avec un motif.',
  },
  boucle: {
    titre: 'La boucle',
    pourquoi: 'Un élément sélectionné qui n’est ni conclu ni expliqué laisse la boucle ouverte.',
  },
  pointage: {
    titre: 'Pointage des états financiers',
    pourquoi: 'Conclure sur des états financiers sans les avoir pointés, c’est conclure sur ce qu’on n’a pas regardé.',
  },
  evaluation: {
    titre: 'Évaluation des anomalies',
    pourquoi: 'Une anomalie chiffrée ne sort pas de l’accumulation sans disposition.',
  },
  jalons: {
    titre: 'Jalons',
    pourquoi: 'Un retard n’est pas un défaut de substance, c’est un défaut de tenue — et il se voit.',
  },
};

