import { q, q1 } from '@/lib/db/client';
import { motDuPack } from '@/lib/packs';
import { GROUPES_CLES, type CleGroupe, type EntreeRail } from './rail-vue';
import type { CleLibelle } from '@/lib/i18n/catalogue';

/* La FORME du rail vit dans `rail-vue.ts`, sans un import de base : c'est le
   seul module que le composant client a le droit de lire (voir son en-tête). */
export { GROUPES_CLES };
export type { CleGroupe, EntreeRail };

/** Le traducteur que le rail reçoit — il ne choisit pas la langue, il la sert. */
export type Traducteur = (cle: CleLibelle, vars?: Record<string, string | number>) => string;

// LE RAIL SUIT LE DOSSIER, PAS LE CATALOGUE DES FONCTIONS (ADR-103, ADR-112).
//
// Deux règles, et la seconde est arrivée avec la revue utilisateur n°1 :
//
//  1. Une destination n'apparaît que quand l'état RÉEL du dossier la rend
//     atteignable ; ce qui ne l'est pas encore est disponible en grisé avec sa
//     raison en une ligne — jamais masqué sans explication.
//
//  2. L'AXE DE LA NAVIGATION EST LE POSTE (R-03). Un auditeur ne pense pas
//     « échantillon », il pense « chiffre d'affaires » — puis, dans le poste,
//     leadsheet, processus, contrôle interne, risques, échantillon, testing.
//     Les postes retenus sont donc des destinations de premier rang, une par
//     poste, et les écrans qui les servent (population, sondage, testing,
//     risque, boucle, papiers) vivent DANS le poste au lieu d'occuper le rail.
//
// Les raisons sont DÉRIVÉES de l'état, jamais stockées : c'est la même requête
// qui dit « atteignable » et « pourquoi pas encore ».


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

/** Les postes RETENUS, dans l'ordre du bilan puis du compte de résultat. */
export async function postesRetenus(engagementId: string): Promise<{ code: string; name: string }[]> {
  return q<{ code: string; name: string }>(
    `select code, name from fsli
     where engagement_id = $1 and scoping in ('in_scope','in_scope_qualitative')
     order by statement, code`,
    [engagementId],
  );
}

/**
 * Les entrées du rail, dans l'ordre du parcours, chacune avec sa PHRASE (ce
 * qu'on y trouve) et — dérivée de l'état — son atteignabilité et sa raison.
 */
export async function railDuDossier(
  engagementId: string, packs: string[], t: Traducteur,
): Promise<EntreeRail[]> {
  const s = await etatDossier(engagementId);
  const base = `/eng/${engagementId}`;
  const sox = packs.includes('pcaob-sox');
  const mot = (c: Parameters<typeof motDuPack>[1]) => motDuPack(packs, c);

  let groupeCle: CleGroupe = GROUPES_CLES[0];
  const entrees: EntreeRail[] = [];
  const g = (cle: CleGroupe) => { groupeCle = cle; };
  const e = (
    chemin: string, label: string, phrase: string,
    atteignable: boolean, raison?: string,
  ) => {
    entrees.push({
      href: chemin ? `${base}/${chemin}` : base, label, phrase,
      groupe: t(groupeCle), groupeCle,
      atteignable, raison: atteignable ? undefined : raison,
    });
  };

  g('rail.groupe.dossier');
  e('', t('rail.vue'), t('rail.quoi.vue'), true);
  e('acceptance', t('rail.acceptation'), t('rail.quoi.acceptation'), true);
  e('team', t('rail.equipe'), t('rail.quoi.equipe'), true);
  e('reunions', t('rail.reunions'), t('rail.quoi.reunions'), true);
  e('carry-forward', t('rail.reprise'), t('rail.quoi.reprise'),
    s.n1, t('rail.raison.dossierAnterieur'));

  g('rail.groupe.comptes');
  e('imports', t('rail.imports'), t('rail.quoi.imports'),
    s.acceptee, t('rail.raison.apresAcceptation'));
  e('reconciliation', t('rail.rapprochement'), t('rail.quoi.rapprochement'),
    s.importe, t('rail.raison.apresImport'));
  e('balances-aux', t('rail.balancesAux'), t('rail.quoi.balancesAux'),
    s.importe, t('rail.raison.apresImport'));
  e('materiality', mot('materialite'), t('rail.quoi.materialite'),
    s.importe, t('rail.raison.apresImport'));
  e('scoping', mot('scoping'), t('rail.quoi.scoping'),
    s.seuils_valides, t('rail.raison.apresSeuils'));

  /* LES POSTES RETENUS SONT DES DESTINATIONS, PAS UN FILTRE (R-03). Chaque
     poste ouvre son propre espace de travail — leadsheet, processus, contrôle
     interne, risques, échantillon, testing — et c'est là que se trouvent les
     écrans qui ne sont plus dans le rail. */
  g('rail.groupe.postes');
  const postes = s.perimetre ? await postesRetenus(engagementId) : [];
  if (postes.length === 0) {
    e('scoping', t('rail.postesRetenus'), t('rail.quoi.postesRetenus'),
      false, t('rail.raison.desQuUnPosteEstRetenu'));
  }
  for (const p of postes) {
    e(`poste/${encodeURIComponent(p.code)}`, p.name,
      t('rail.quoi.poste'), true);
  }

  g('rail.groupe.transverse');
  e('processus', t('rail.processus'), t('rail.quoi.processus'),
    s.acceptee, t('rail.raison.apresAcceptation'));
  e('rcm', t('rail.controleInterne'), t('rail.quoi.controleInterne'),
    s.acceptee, t('rail.raison.apresAcceptation'));
  e('estimations', t('rail.estimations'), t('rail.quoi.estimations'),
    s.perimetre, t('rail.raison.apresPerimetre'));
  e('circularisations', t('rail.circularisations'), t('rail.quoi.circularisations'),
    s.importe, t('rail.raison.apresPremierImport'));
  e('exceptions', sox ? t('rail.deviations') : t('rail.ecarts'), t('rail.quoi.ecarts'),
    s.ecarts, t('rail.raison.auPremierEcart'));
  e('notes', t('rail.notes'), t('rail.quoi.notes'),
    s.papiers || s.notes, t('rail.raison.auPremierPapier'));

  g('rail.demandes');
  e('requests', t('rail.demandes'), t('rail.quoi.demandes'),
    s.tirage || s.demandes, t('rail.raison.apresTirage'));
  e('evidence', t('rail.pieces'), t('rail.quoi.pieces'),
    s.demandes || s.pieces, t('rail.raison.apresPremiereDemande'));

  g('rail.groupe.fin');
  e('fs-tieout', t('rail.pointage'), t('rail.quoi.pointage'),
    s.vise, t('rail.raison.apresVisa'));
  e('completion', t('rail.achevement'), t('rail.quoi.achevement'),
    s.vise, t('rail.raison.apresVisas'));
  e('obstacles', mot('obstacles'), t('rail.quoi.obstacles'),
    s.acceptee, t('rail.raison.apresAcceptation'));
  e('close', t('rail.cloture'), t('rail.quoi.cloture'),
    s.acheve, t('rail.raison.apresAchevement'));
  e('events', t('rail.journal'), t('rail.quoi.journal'), true);

  return entrees;
}
