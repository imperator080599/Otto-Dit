import { q } from '@/lib/db/client';
import { independenceObstacles } from './team';
import { questionnaireObstacles } from './questionnaire';
import { obstaclesReprise } from './carryforward';
import { obstaclesPointage } from './tieout';
import { currentAcceptation, jalonsEnRetard } from './acceptance';
import { boucle } from './loop';
import { conclusionGate, blockerText } from './evaluation';
import { obstaclesAchevement } from './completion';

// LES OBSTACLES AU VISA — une seule liste, CALCULÉE (point 8).
//
// CE QUI MANQUAIT. Chaque tranche avait ses propres blocages, chacun affiché
// sur son propre écran : indépendance sur l'écran équipe, questionnaire sur
// l'écran risque, reprise sur l'écran reprise, pointage sur l'écran états
// financiers. Personne ne pouvait dire, en un endroit, CE QUI EMPÊCHE DE
// SIGNER — et un signataire qui doit visiter huit écrans pour le savoir finit
// par signer sans les avoir tous vus.
//
// RIEN N'EST STOCKÉ, RIEN N'EST RÉDIGÉ À LA MAIN. Chaque obstacle est demandé
// au service qui le connaît. Une liste tenue à part diverge un jour de ce
// qu'elle liste — et c'est toujours la liste qu'on croit.
//
// UN OBSTACLE QUI N'EST PAS DANS CETTE LISTE N'EN EST PAS UN. Corollaire dit
// franchement : si une règle bloque quelque part sans apparaître ici, c'est un
// défaut, pas une subtilité.

export type Famille =
  | 'acceptation' | 'independance' | 'reprise' | 'questionnaire' | 'programme'
  | 'boucle' | 'pointage' | 'evaluation' | 'achevement' | 'jalons';

export interface Obstacle {
  famille: Famille;
  libelle: string;
  /** Où l'on va pour le lever. Un obstacle sans destination se contemple. */
  ou: string;
}

const OU: Record<Famille, string> = {
  acceptation: 'acceptance',
  independance: 'team',
  reprise: 'carry-forward',
  questionnaire: 'risk',
  programme: 'testing',
  boucle: 'loop',
  pointage: 'fs-tieout',
  evaluation: 'exceptions',
  achevement: 'completion',
  jalons: 'acceptance',
};

/** Les postes retenus au périmètre : c'est sur eux que les travaux se jugent. */
async function postesRetenus(engagementId: string): Promise<string[]> {
  const rows = await q<{ code: string }>(
    `select code from fsli where engagement_id = $1
       and scoping in ('in_scope', 'in_scope_qualitative') order by code`,
    [engagementId],
  );
  return rows.map((r) => r.code);
}

/**
 * Tout ce qui empêche de signer, en une liste.
 *
 * L'ordre suit celui du dossier — on ne fait pas remonter un obstacle de
 * pointage avant un obstacle d'acceptation, parce qu'on ne pointe pas les
 * états financiers d'une mission qu'on n'a pas acceptée.
 */
export async function obstaclesAuVisa(engagementId: string): Promise<Obstacle[]> {
  const out: Obstacle[] = [];
  const ajoute = (famille: Famille, libelles: string[]) => {
    for (const l of libelles) out.push({ famille, libelle: l, ou: OU[famille] });
  };

  // 1. L'acceptation, avant tout le reste.
  const acc = await currentAcceptation(engagementId);
  if (!acc || acc.status === 'open') {
    ajoute('acceptation', ['La mission n’est pas acceptée : aucun travail ne devrait y être planifié.']);
    /* On s'arrête là. Lister les obstacles d'un dossier non accepté noierait
       le seul qui compte sous quarante autres. */
    return out;
  }
  if (acc.status === 'declined') {
    ajoute('acceptation', [`La mission a été REFUSÉE — ${acc.decision_reason ?? ''}`]);
    return out;
  }

  // 2. L'indépendance.
  ajoute('independance', await independenceObstacles(engagementId));

  // 3. La reprise N-1.
  ajoute('reprise', await obstaclesReprise(engagementId));

  // 4. Le questionnaire résiduel — entité, puis chaque poste retenu.
  const postes = await postesRetenus(engagementId);
  ajoute('questionnaire', await questionnaireObstacles(engagementId, null));
  for (const p of postes) {
    ajoute('questionnaire', await questionnaireObstacles(engagementId, p));
  }

  /* 5. LE PÉRIMÈTRE SANS PROGRAMME — le trou que rien ne signalait.
     Un poste retenu au périmètre sur lequel AUCUNE procédure n'est planifiée
     est un trou dans le dossier : soit on le travaille, soit on le sort du
     périmètre avec un motif. Le laisser passer contredirait tout le reste du
     produit — on refuse une conclusion sans explication, une résolution sans
     pièce, un « sans objet » sans motif, et on acceptait un poste entier
     retenu puis jamais touché.
     Pourquoi il n'était pas visible : la boucle ne parle QUE des postes qui
     portent un échantillon (`if (b.etapes.length === 0) continue`), donc un
     poste sans rien du tout ne produisait aucun obstacle. Le silence exact
     que la règle 13 nomme : l'absence lue comme un acquis. */
  const sansProgramme = await q<{ code: string; name: string }>(
    `select f.code, f.name from fsli f
     where f.engagement_id = $1
       and f.scoping in ('in_scope', 'in_scope_qualitative')
       and not exists (
         select 1 from procedure_instance pi
         where pi.engagement_id = f.engagement_id and pi.fsli_code = f.code)
     order by f.code`,
    [engagementId],
  );
  ajoute('programme', sansProgramme.map(
    (f) => `${f.code} — ${f.name} : retenu au périmètre, aucune procédure planifiée`,
  ));

  // 6. La boucle, poste par poste : ce qui n'a pas fini de tourner.
  for (const p of postes) {
    const b = await boucle(engagementId, p);
    if (b.etapes.length === 0) continue;   // aucun échantillon : rien à reprocher ici
    ajoute('boucle', b.obstacles.map((o) => `${p} — ${o}`));
  }

  // 7. Le pointage des états financiers.
  ajoute('pointage', await obstaclesPointage(engagementId));

  // 8. L'évaluation des anomalies et la conclusion.
  const gate = await conclusionGate(engagementId);
  if (!gate.ok) ajoute('evaluation', gate.blockers.map((b) => blockerText(b, 'fr')));

  // 9. L'achèvement — les travaux qu'un inspecteur regarde en premier après coup.
  ajoute('achevement', await obstaclesAchevement(engagementId));

  // 10. Les jalons échus et non faits — le dernier, parce qu'un retard n'est pas
  //    un défaut de substance : c'est un défaut de tenue.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const retard = await jalonsEnRetard(engagementId, aujourdhui);
  ajoute('jalons', retard.map((j) => `Jalon échu et non fait : ${j.label} (${j.due_date})`));

  return out;
}

/** Le compte par famille, pour l'afficher sans relire la liste. */
export async function comptesParFamille(engagementId: string): Promise<Record<string, number>> {
  const l = await obstaclesAuVisa(engagementId);
  const out: Record<string, number> = {};
  for (const o of l) out[o.famille] = (out[o.famille] ?? 0) + 1;
  return out;
}

/** Le dossier peut-il être visé ? */
export async function visaPossible(engagementId: string): Promise<boolean> {
  return (await obstaclesAuVisa(engagementId)).length === 0;
}
