import type { CleLibelle, Variable } from '@/lib/i18n/catalogue';

// UN OBSTACLE AU VISA N'EST PAS UNE PHRASE — C'EST UN FAIT (revue n°3, point 1).
//
// Les douze services qui savent ce qui empêche de signer rendaient des PHRASES
// FRANÇAISES. La liste unique — l'écran qu'un signataire lit en premier —
// restait donc française sous un rail anglais, et le détecteur de langue ne
// pouvait rien y voir : une phrase rangée dans un littéral de service n'est ni
// un nœud JSX ni un attribut.
//
// Un motif porte une CLÉ de catalogue et ses variables. Le service décide CE
// QUI bloque ; l'écran décide dans quelle langue le dire. Et un test peut
// désormais affirmer QUEL obstacle est levé, au lieu de chercher un bout de
// phrase — « chercher un mot n'est pas vérifier un chemin » (règle 15).

export interface Motif {
  cle: CleLibelle;
  vars?: Record<string, Variable>;
}

export const motif = (cle: CleLibelle, vars?: Record<string, Variable>): Motif => ({ cle, vars });
