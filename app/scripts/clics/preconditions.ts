import type { Contexte } from './contexte';
import { currentMateriality, propose, validate } from '../../src/lib/services/materiality';

// P0-04 (AUD-17). LE REGISTRE DES PRÉCONDITIONS, PAR PRÉFIXE DE STATION — le patron de
// `scripts/clics/mesure-testing.ts` : poser l'état par SERVICE (jamais en cliquant à travers les
// stations qu'on saute), avant que le serveur `next start` ne prenne la base (PGlite n'admet
// qu'un écrivain — `run.ts` ferme la connexion juste après avoir appelé ces fonctions, donc elles
// tournent ICI, jamais depuis `conduire()`). CE QUE CE REGISTRE NE FAIT PAS : il ne peut rien pour
// une station qui lit une variable LOCALE posée par une station SAUTÉE (`engNeuf`, posé par
// « création : … » dans `scenario.ts`) — une précondition tourne dans le processus du script,
// avant que le navigateur n'existe, donc elle ne peut écrire QUE dans la base, jamais dans une
// fermeture (closure) de `conduire()`. Les stations qui dépendent d'`engNeuf` (« rail », « acceptation
// du dossier neuf ») gardent leur garde-fou existant (`if (!engNeuf) { … return }`) et n'ont donc
// besoin d'AUCUNE précondition pour rester rejouables seules — un échec correctement DÉCLARÉ, pas
// un crash. Les nouvelles stations de la Phase 2 DOIVENT déclarer la leur ici ; les stations
// existantes ne sont pas migrées maintenant (P6-03).

export type Precondition = (ctx: Contexte) => Promise<void>;

export const PRECONDITIONS: Record<string, Precondition> = {
  /* « langue : … » et « rail : … » n'ont besoin de RIEN de plus que la base semée par
     `demo:seed` (déjà garantie par `run.ts` avant tout lancement, filtré ou non) : « langue »
     ne fait que lire `<html lang>` sur l'accueil, et « rail » porte déjà son propre garde-fou
     sur `engNeuf` (ci-dessus). Elles n'ont donc PAS d'entrée ici — une entrée qui ne ferait
     rien serait une preuve empruntée (règle 16), pas une précondition.

     « sondage » a besoin d'une matérialité VALIDÉE (le bouton « proposer les paramètres » du
     sondage la suppose) : le monde semé la porte déjà dans l'état ACTUEL de ce dépôt (mesuré,
     pas supposé — voir le journal de cette précondition), mais la fonction reste IDEMPOTENTE :
     si elle manquait, elle la proposerait et la validerait par service, exactement ce qu'un
     humain fait à l'écran « matérialité » avant d'ouvrir « sondage ».

     CE QUE CETTE PRÉCONDITION NE POSE PAS, MESURÉ (règle 19) : `npm run clics -- --station=sondage`
     conduit la station en entier, deux fois de suite sur la même base, sous le budget (< 1 min) —
     mais sa PREMIÈRE assertion (« les paramètres sont PROPOSÉS ») reste ÉCHEC, la MÊME façon les
     deux fois : sur le monde semé actuel, l'échantillon est déjà entièrement tiré ET la demande
     de pièces déjà engendrée (le programme normal de `demo:seed`), donc ni le bouton « valider les
     paramètres » ni « tirer » ne restent à l'écran — seul un ré-import du grand livre définitif
     (une AUTRE station, sautée ici) rend le tirage re-tirable (MAT-03). La précondition pose la
     matérialité, pas la fraîcheur du tirage ; combler cet écart est le travail de P6-03 (migration
     des stations existantes), pas de cette tranche — le dire ici plutôt que le laisser passer pour
     un vert qu'il n'est pas. */
  sondage: async (ctx) => {
    const m = await currentMateriality(ctx.eng);
    if (m && m.status === 'validated') {
      console.log(`  précondition « sondage » : matérialité déjà validée (v${m.version}) — rien à poser`);
      return;
    }
    console.log('  précondition « sondage » : matérialité absente ou non validée — proposée puis validée par service');
    const id = await propose(ctx.eng, ctx.associe.id);
    await validate(id, ctx.reviewer.id);
  },
};

/** Le préfixe `--station=` a-t-il une précondition déclarée ? Une absence n'est pas une erreur —
 *  seules les stations neuves de la Phase 2 sont TENUES d'en déclarer une (voir l'en-tête). */
export function preconditionDe(prefixe: string): Precondition | undefined {
  return PRECONDITIONS[prefixe];
}
