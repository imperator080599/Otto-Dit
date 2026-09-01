import { traduire, type CleLibelle } from '@/lib/i18n/catalogue';

// LE PORTAIL AVANT TOUT CONTEXTE.
//
// Un lien mort ne dit rien du dossier : ni le cabinet, ni la mission, ni donc
// la langue. Choisir l'anglais par défaut serait une décision prise à la place
// du client ; garder une phrase bilingue en dur serait une chaîne hors
// catalogue. Les DEUX libellés du catalogue sont donc rendus, dans l'ordre où
// le produit sert ses cabinets.
export function deuxLangues(cle: CleLibelle): string {
  return `${traduire('fr', cle)} / ${traduire('en', cle)}`;
}
