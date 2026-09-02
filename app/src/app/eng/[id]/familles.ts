// LES NOMS DES FAMILLES D'OBSTACLES, EN UN SEUL ENDROIT.
//
// L'écran de clôture affichait les CODES — « questionnaire — 2 », « achevement
// — 1 » : des identifiants sans accents, donnés à lire à un signataire. Les
// titres existaient déjà sur l'écran des obstacles. Les recopier aurait créé
// deux vérités sur les mêmes familles, et c'est exactement ce que ce dossier
// refuse ailleurs : elles vivent ici, et les deux écrans les lisent.
//
// CE QUI VIT ICI, DEPUIS LA REVUE N°3, CE SONT DES CLÉS — pas des phrases. Une
// table de libellés est un écran comme un autre : le français y était invisible
// au détecteur de langue, et trois écrans le rendaient.

import type { CleLibelle } from '@/lib/i18n/catalogue';
import type { Famille } from '@/lib/services/obstacles';

/* TYPÉ SUR LA LISTE DES FAMILLES : « achevement » et « processus » manquaient,
   et le monde semé affichait « achevement » en code brut sur quatre écrans —
   un repli `FAMILLES[f] ? t(…) : f` que le détecteur de langue ne peut pas
   voir, une variable n'étant pas un littéral (revue hostile n°5). Une famille
   sans titre ne compile plus. */
export const FAMILLES: Record<Famille, { titre: CleLibelle; pourquoi: CleLibelle }> = {
  acceptation: { titre: 'famille.acceptation.titre', pourquoi: 'famille.acceptation.pourquoi' },
  independance: { titre: 'famille.independance.titre', pourquoi: 'famille.independance.pourquoi' },
  reprise: { titre: 'famille.reprise.titre', pourquoi: 'famille.reprise.pourquoi' },
  questionnaire: { titre: 'famille.questionnaire.titre', pourquoi: 'famille.questionnaire.pourquoi' },
  circularisation: { titre: 'rail.circularisations', pourquoi: 'famille.circularisation.pourquoi' },
  programme: { titre: 'famille.programme.titre', pourquoi: 'famille.programme.pourquoi' },
  boucle: { titre: 'famille.boucle.titre', pourquoi: 'famille.boucle.pourquoi' },
  ipe: { titre: 'wp.ipe', pourquoi: 'famille.ipe.pourquoi' },
  pointage: { titre: 'rail.pointage', pourquoi: 'famille.pointage.pourquoi' },
  evaluation: { titre: 'famille.evaluation.titre', pourquoi: 'famille.evaluation.pourquoi' },
  jalons: { titre: 'famille.jalons.titre', pourquoi: 'famille.jalons.pourquoi' },
  processus: { titre: 'rail.processus', pourquoi: 'famille.processus.pourquoi' },
  achevement: { titre: 'rail.achevement', pourquoi: 'famille.achevement.pourquoi' },
};
