import { q1 } from '@/lib/db/client';

// LE RAIL MONTRE L'ÉTAT DU DOSSIER, PAS LE CATALOGUE DES FONCTIONS (ADR-103).
// Quatre demandes de « moins dense » ont produit trois replis : le problème
// n'était pas l'affichage, c'était le contenu. Une destination n'apparaît que
// quand l'état RÉEL du dossier la rend atteignable ; ce qui ne l'est pas
// encore est disponible en grisé avec sa raison en une ligne — jamais masqué
// sans explication — derrière « tout afficher ». Un dossier qui vient d'être
// créé montre cinq destinations, et le rail grandit à mesure qu'on travaille.
//
// Les raisons sont DÉRIVÉES de l'état, jamais stockées (le principe des
// statuts dérivés) : c'est la même requête qui dit « atteignable » et
// « pourquoi pas encore ».

export interface EntreeRail {
  href: string;
  label: string;
  /** Ce qu'un auditeur qui ouvre l'outil pour la première fois y trouvera. */
  phrase: string;
  atteignable: boolean;
  /** La raison, en une ligne, quand ce n'est pas atteignable. */
  raison?: string;
}

interface EtatDossier {
  n1: boolean; acceptee: boolean; importe: boolean; seuils_valides: boolean;
  perimetre: boolean; tirage: boolean; demandes: boolean; pieces: boolean;
  ecarts: boolean; papiers: boolean; notes: boolean; vise: boolean; acheve: boolean;
}

async function etatDossier(engagementId: string): Promise<EtatDossier> {
  const r = await q1<Record<keyof EtatDossier, boolean>>(
    `select
       exists(select 1 from engagement e2
              join engagement e1 on e1.id = $1
              join period p2 on p2.id = e2.period_id
              join period p1 on p1.id = e1.period_id
              where e2.entity_id = e1.entity_id and e2.id <> e1.id
                and p2.end_date < p1.end_date) n1,
       exists(select 1 from engagement_acceptance a
              where a.engagement_id = $1 and a.status = 'accepted') acceptee,
       exists(select 1 from import_file f where f.engagement_id = $1) importe,
       exists(select 1 from materiality m
              where m.engagement_id = $1 and m.status = 'validated') seuils_valides,
       exists(select 1 from fsli f
              where f.engagement_id = $1 and f.scoping in ('in_scope','in_scope_qualitative')) perimetre,
       exists(select 1 from sample s
              where s.engagement_id = $1 and s.status = 'drawn') tirage,
       exists(select 1 from request r where r.engagement_id = $1) demandes,
       exists(select 1 from evidence e where e.engagement_id = $1) pieces,
       (exists(select 1 from exception x where x.engagement_id = $1)
        or exists(select 1 from deviation d where d.engagement_id = $1)) ecarts,
       exists(select 1 from workpaper w where w.engagement_id = $1) papiers,
       exists(select 1 from review_note n where n.engagement_id = $1) notes,
       exists(select 1 from workpaper w
              join signoff s on s.workpaper_id = w.id
              where w.engagement_id = $1) vise,
       exists(select 1 from completion_item c
              where c.engagement_id = $1 and c.status = 'done') acheve`,
    [engagementId],
  );
  return r;
}

/**
 * Les entrées du rail, dans l'ordre du parcours, chacune avec sa PHRASE (ce
 * qu'on y trouve) et — dérivée de l'état — son atteignabilité et sa raison.
 */
export async function railDuDossier(engagementId: string, packs: string[]): Promise<EntreeRail[]> {
  const s = await etatDossier(engagementId);
  const base = `/eng/${engagementId}`;
  const sox = packs.includes('pcaob-sox');
  const nep = packs.includes('nep-fr');

  const e = (
    chemin: string, label: string, phrase: string,
    atteignable: boolean, raison?: string,
  ): EntreeRail => ({
    href: chemin ? `${base}/${chemin}` : base, label, phrase,
    atteignable, raison: atteignable ? undefined : raison,
  });

  const entrees: EntreeRail[] = [
    e('', 'Vue d\'ensemble', 'L\'état du dossier en une page : où on en est, ce qui bloque.', true),
    e('acceptance', 'Acceptation', 'La décision d\'accepter la mission, ses critères, et les jalons.', true),
    e('team', 'Équipe et indépendance', 'Qui travaille sur le dossier, déclarations d\'indépendance, ancienneté et rotation.', true),
    e('reunions', 'Réunions', 'Les contacts du client, les créneaux communs de l\'équipe, les invitations.', true),
    e('carry-forward', 'Reprise du dossier N-1', 'Ce que le dossier de l\'an dernier propose de reprendre — jamais repris en silence.',
      s.n1, 'disponible quand l\'entité porte un dossier antérieur'),
    e('imports', 'Imports (balance et grand livre)', 'Déposer la balance et le FEC, versions successives et rapport d\'impact.',
      s.acceptee, 'disponible après l\'acceptation de la mission'),
    e('reconciliation', 'Rapprochement comptable', 'La balance rapprochée du grand livre, compte par compte, écarts en tête.',
      s.importe, 'disponible après l\'import de la balance et du grand livre'),
    e('balances-aux', 'Balances auxiliaires', 'Les tiers N/N-1 : concentration, apparus, disparus, vieillissement — candidats au registre.',
      s.importe, 'disponible après l\'import de la balance et du grand livre'),
    e('materiality', 'Seuils de signification', 'Le seuil proposé par la règle du cabinet, validé par un humain, et ses déclinaisons.',
      s.importe, 'disponible après l\'import de la balance et du grand livre'),
    e('scoping', 'Périmètre (postes retenus)', 'Quels postes des comptes seront travaillés, et pourquoi.',
      s.seuils_valides, 'disponible après la validation des seuils'),
    e('processus', 'Contrôle interne et processus', 'Le processus en données structurées : diagramme généré, différence N/N-1 statuée, entretiens et écarts candidats.',
      s.acceptee, 'disponible après l\'acceptation de la mission'),
    e('risk', 'Risque par assertion', 'Le niveau de risque par assertion, le questionnaire, et le registre des facteurs.',
      s.perimetre, 'disponible après le périmètre'),
    e('estimations', 'Estimations comptables', 'Le fichier de calcul du client : rapproché, recalculé, sondé, taux justifiés.',
      s.perimetre, 'disponible après le périmètre'),
  ];
  if (nep) {
    entrees.push(
      e('population', 'Population contrôlable', 'Les écritures du poste retenu, prêtes pour le tirage.',
        s.perimetre, 'disponible après le périmètre'),
      e('sampling', 'Échantillon (sondage)', 'Le tirage : couverture, unités monétaires, germe rejouable.',
        s.perimetre, 'disponible après le périmètre'),
      e('testing', 'Contrôle sur pièces (testing)', 'L\'atelier : chaque élément tiré contrôlé contre ses pièces.',
        s.tirage, 'disponible après le tirage de l\'échantillon'),
      e('loop', 'Avancement de la boucle', 'Où en est le cycle : ce qui a franchi, ce qui attend, et de qui.',
        s.tirage, 'disponible après le tirage de l\'échantillon'),
    );
  }
  if (sox) {
    entrees.push(
      e('rcm', 'Contrôles internes (SOX)', 'La matrice des risques et contrôles, et les tests d\'efficacité.',
        s.acceptee, 'disponible après l\'acceptation de la mission'),
    );
  }
  entrees.push(
    e('requests', 'Demandes au client', 'Les justificatifs demandés, leurs relances, et ce qui manque encore.',
      s.tirage || s.demandes, 'disponible après le tirage — les demandes naissent de l\'échantillon'),
    e('circularisations', 'Circularisations', 'Banques et avocats : le listing du client, ce qu\'il ne couvre pas, et les soldes confirmés.',
      s.importe, 'disponible après le premier import — la complétude se juge contre le grand livre'),
    e('evidence', 'Pièces reçues', 'Tout ce que le client a déposé, empreinte et provenance comprises.',
      s.demandes || s.pieces, 'disponible dès la première demande au client'),
    e('exceptions', sox ? 'Déviations (SOX)' : 'Écarts relevés', 'Chaque écart, son explication, sa corroboration, sa suite.',
      s.ecarts, 'apparaît au premier écart relevé'),
    e('workpapers', 'Papiers de travail', 'Les papiers assemblés depuis les faits, leurs visas et leurs exports.',
      s.tirage, 'disponible après le tirage de l\'échantillon'),
    e('notes', 'Notes de revue', 'Toutes les notes, ancrées sur leurs objets, et qui doit y répondre.',
      s.papiers || s.notes, 'apparaît avec le premier papier ou la première note'),
    e('fs-tieout', 'Pointage des états financiers', 'Chaque chiffre de la plaquette rattaché à sa source.',
      s.vise, 'disponible après le visa du papier de travail'),
    e('ask', 'Interroger le dossier', 'Une question en français, une réponse calculée — jamais de prose inventée.',
      s.importe, 'disponible après le premier import'),
    e('completion', 'Achèvement', 'Les cinq natures de fin de dossier, conclues par écrit.',
      s.vise, 'disponible après les visas des travaux'),
    e('obstacles', 'Obstacles au visa', 'La liste calculée de tout ce qui empêche encore de signer.',
      s.acceptee, 'disponible après l\'acceptation de la mission'),
    e('close', 'Clôture et archive', 'Fermer le dossier et télécharger l\'archive scellée.',
      s.acheve, 'disponible après l\'achèvement'),
    e('dashboard', 'Pilotage', 'L\'avancement chiffré du dossier, pour le chef de mission.',
      s.importe, 'disponible après le premier import'),
    e('provenance', 'Provenance des chiffres', 'D\'où vient chaque chiffre : pièce, extraction, vérification.',
      s.pieces, 'apparaît avec les premières pièces'),
    e('events', 'Journal du dossier', 'Chaque geste, horodaté et chaîné — la piste d\'audit.', true),
  );
  return entrees;
}
