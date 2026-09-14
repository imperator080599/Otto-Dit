import { q } from '@/lib/db/client';
import { motif, type Motif } from './motif';
import { CABINET, OUVERT } from './travaux';

// LE CENTRE DE NOTIFICATIONS — mandat 2026-09-14, §3.
//
// « Le centre de notifications ne possède aucun objet. C'est une VUE sur les
// éléments préparés par l'IA et non encore validés » (§3.1). Rien n'est stocké
// ici, exactement le principe déjà tenu par `obstaclesAuVisa` (obstacles.ts) et
// `mesTravaux`/`tableauDeBord` (travaux.ts) : une liste tenue à part diverge un
// jour de ce qu'elle liste, et c'est toujours la liste qu'on croit.
//
// CE QUE `elementsIaNonValides` COUVRE — quatre familles, chacune avec une
// identité réelle (un id qui existe en base) et un geste humain réel qui la
// résout (jamais un formulaire dupliqué) :
//   - écart de walkthrough candidat (`control_walkthrough_gap.status = 'candidate'`)
//     → `statuerEcartWalkthrough`, sur `/eng/[id]/rcm/[cid]`.
//   - déficience proposée (`deficiency.status = 'proposed'`)
//     → `decideDeficiency`, sur `/eng/[id]/rcm/[cid]`.
//   - extraction en attente de vérification (`extraction.status = 'pending_verify'`)
//     → `verifyExtraction`, sur `/eng/[id]/testing`.
//   - proposition de matérialité (`materiality.status = 'proposed'`)
//     → `validate`, sur `/eng/[id]/materiality`.
//
// CE QU'ELLE NE COUVRE PAS, DÉLIBÉRÉMENT (règle 19, reporté R84/R85) :
//   - `wp_extra_cell.verifie = false` — dérivé de l'état de l'extraction qui la
//     remplit ; la compter à part aurait doublé le même geste de validation
//     sous deux cartes distinctes.
//   - `review_note` portant une réponse automatisée d'OTTO — il n'existe
//     aujourd'hui aucun geste d'« approbation » distinct de la fermeture
//     générique de la note (`transitionNoteAction`), donc aucune carte
//     n'y résoudrait un geste RÉEL et non dupliqué (§3, "jamais un
//     formulaire dupliqué").
//   - une `extraction.status = 'pending_verify'` SANS LIGNE COURANTE résolue
//     par `lignesAtelier` — CORRIGÉ le 2026-09-14 après un défaut mesuré en
//     conduisant le parcours cliqué jusqu'à la clôture (jamais par grep,
//     règle 15) : sur le monde de démonstration, DIX extractions
//     pending_verify n'avaient AUCUN geste réel nulle part dans le produit —
//     neuf fichiers de POPULATION (listings clients/fournisseurs/banques,
//     journaux de revenus : `request_item_id` NULL, jamais liés au sondage)
//     et une pièce dont la ligne avait QUITTÉ le tirage après un re-tirage
//     (`sample_item` superseded) — exactement le cas que l'écran `testing`
//     documente déjà lui-même comme « n'étant l'obligation de personne »
//     (`app/src/app/eng/[id]/testing/page.tsx`, le compteur `pending`, qui ne
//     compte QUE les lignes de `lignesAtelier`, jamais le dossier entier). Le
//     href se dégradait alors en un lien SANS `?item=` — un cul-de-sac (la
//     page `/testing` ne montre RIEN à attester pour ces pièces) — tout en
//     comptant comme obstacle BLOQUANT (NOTIF-01) : la démonstration entière
//     devenait insignable (règle 25 : aucune famille bloquante neuve ne doit
//     rendre la démonstration insignable — violée sans avoir été mesurée,
//     faute d'un `npm run clics` complet avant l'expédition de §3). Le même
//     filtre qui construit le lien (`ligneParExtraction`, la résolution par
//     lignage, ADR-133) sert maintenant AUSSI à décider l'INCLUSION : sans
//     ligne courante résolue, aucun geste réel n'existe — l'élément n'est ni
//     montré, ni compté (même principe que `wp_extra_cell.verifie=false`
//     ci-dessus, symétrique).
//
// `elementsIaNonValides` NE FILTRE PAS PAR ACCEPTATION DE LA MISSION (revue
// hostile du 2026-09-14, voix 2, finding MOYEN, reporté R88). C'est une VUE
// PURE (§3.1) : elle montre ce qui existe, jamais ce qui bloque. `obstaclesAuVisa`,
// elle, s'arrête AVANT de calculer la famille `iaNonValide` tant que la mission
// n'est pas acceptée — comme pour TOUTES les familles, un comportement qui ne
// date pas de cette tranche. Sur une mission non encore acceptée qui porte
// déjà un élément IA, la VUE (ici, `/travaux`, `/eng/[id]/notifications`) peut
// donc montrer une carte alors que l'OBSTACLE correspondant n'existe pas
// encore — sans risque pour le visa lui-même (l'obstacle `acceptation` bloque
// déjà tout, inconditionnellement). La lecture `/api/sante` NOTIF-01
// (route.ts) est gardée contre ce cas précis pour ne jamais rougir à tort.
//
// LE NIVEAU (§2.3, `niveau`) EST ENCORE UNE CONSTANTE, PAS UNE DONNÉE PAR
// ÉLÉMENT. §2 (AUTO-02 : le niveau horodaté à la production) n'est pas encore
// construit — ce mandat l'exécute APRÈS §3 (§5, ordre d'exécution). Tant que
// L2 reste l'unique niveau jamais posé nulle part dans ce dépôt (règle 7),
// l'afficher tel quel est un fait vérifiable aujourd'hui, jamais une valeur
// inventée. Ce champ deviendra une vraie lecture par élément une fois AUTO-02
// posé — jusque-là, il ne varie pas parce que rien ne le fait varier encore.
export const NIVEAU_ACTUEL = 'L2' as const;

export type NatureElementIa = 'walkthroughGap' | 'deficiency' | 'extraction' | 'materialite';

export interface ElementIa {
  id: string;
  nature: NatureElementIa;
  engagementId: string;
  /** CE QUI est en attente, en clé de catalogue — jamais une phrase (règle 15). */
  titre: Motif;
  /** Où l'on va pour le résoudre — UN clic, le geste réel. */
  href: string;
  /** Date de production réelle, ou `null` quand elle n'a jamais été mesurée
   *  (règle 31 : jamais une date plausible écrite en passant). */
  quand: string | null;
  niveau: typeof NIVEAU_ACTUEL;
}

/**
 * Les éléments préparés par l'IA et non encore validés, sur UN dossier.
 *
 * RIEN N'EST STOCKÉ (§3.1) : chaque famille est relue à l'instant depuis la
 * table qui la connaît, exactement le principe d'`obstaclesAuVisa`. Un élément
 * validé (le statut change) disparaît ici au prochain appel, SANS tâche de
 * nettoyage — épreuve 4 du mandat.
 */
export async function elementsIaNonValides(engagementId: string): Promise<ElementIa[]> {
  const out: ElementIa[] = [];

  const gaps = await q<{ id: string; control_id: string; code: string; quand: string | null }>(
    `select g.id::text, g.control_id::text, c.code,
            coalesce(ar.created_at, tr.created_at)::text quand
     from control_walkthrough_gap g
     join control c on c.id = g.control_id
     left join ai_run ar on ar.id = g.ai_run_id
     left join control_walkthrough_transcript tr on tr.control_id = g.control_id
     where g.engagement_id = $1 and g.status = 'candidate'
     order by coalesce(ar.created_at, tr.created_at) asc nulls last`,
    [engagementId],
  );
  for (const g of gaps) {
    out.push({
      id: g.id, nature: 'walkthroughGap', engagementId,
      titre: motif('notif.walkthroughGap', { code: g.code }),
      href: `/eng/${engagementId}/rcm/${g.control_id}`,
      quand: g.quand, niveau: NIVEAU_ACTUEL,
    });
  }

  const deficiencies = await q<{ id: string; control_id: string; code: string; created_at: string }>(
    `select d.id::text, d.control_id::text, c.code, d.created_at::text
     from deficiency d join control c on c.id = d.control_id
     where d.engagement_id = $1 and d.status = 'proposed'
     order by d.created_at asc`,
    [engagementId],
  );
  for (const d of deficiencies) {
    out.push({
      id: d.id, nature: 'deficiency', engagementId,
      titre: motif('notif.deficiency', { code: d.code }),
      href: `/eng/${engagementId}/rcm/${d.control_id}`,
      quand: d.created_at, niveau: NIVEAU_ACTUEL,
    });
  }

  const extractions = await q<{ id: string; created_at: string; filename: string }>(
    `select x.id::text, x.created_at::text, e.filename
     from extraction x
     join evidence e on e.id = x.evidence_id
     where e.engagement_id = $1 and x.status = 'pending_verify'
     order by x.created_at asc`,
    [engagementId],
  );
  /* LE DEEP-LINK VERS LA LIGNE DE L'ATELIER (`?item=`) NE LIT PAS
     `request_item.sample_item_id` DIRECTEMENT (revue hostile du 2026-09-14,
     voix 2, finding ÉLEVÉ, reproduit par lecture). Après un re-tirage
     (ADR-133), cet identifiant reste celui de la ligne D'ORIGINE — souvent
     SUPERSEDED — alors que `atelier.tsx` ne cherche que parmi les lignes
     COURANTES (`lignesAtelier`, elle-même construite sur le lignage,
     `LIGNAGE`). La résolution réutilise donc `lignesAtelier` elle-même
     (jamais une seconde implémentation du lignage) : chaque pièce y est déjà
     rattachée à SA ligne COURANTE, remontée à travers le lignage.
     SANS ligne courante résolue, l'élément est EXCLU (pas seulement privé de
     lien) — voir l'en-tête de ce fichier : ni un fichier de population
     jamais lié au sondage, ni une pièce dont la ligne a quitté le tirage
     n'ont de geste réel à offrir ; les compter bloquerait le visa sur un
     cul-de-sac (règle 25). */
  if (extractions.length > 0) {
    const { lignesAtelier } = await import('./workpapers/atelier');
    const { lignes } = await lignesAtelier(engagementId);
    const ligneParExtraction = new Map<string, string>();
    for (const l of lignes) {
      for (const ev of l.evidences) {
        if (ev.extraction) ligneParExtraction.set(ev.extraction.id, l.sampleItemId);
      }
    }
    for (const x of extractions) {
      const sampleItemId = ligneParExtraction.get(x.id);
      if (!sampleItemId) continue;
      out.push({
        id: x.id, nature: 'extraction', engagementId,
        titre: motif('notif.extraction', { fichier: x.filename }),
        href: `/eng/${engagementId}/testing?item=${sampleItemId}`,
        quand: x.created_at, niveau: NIVEAU_ACTUEL,
      });
    }
  }

  /* `materiality` NE PORTE AUCUN `created_at` (0001_core.sql) et
     `proposed_by_ai_run` n'est JAMAIS posé par `materiality.ts::propose`
     (moteur déterministe, pas un appel IA — vérifié en lisant le service,
     pas supposé). La date réelle vient donc d'`event_log`
     (`materiality_proposed`, règle 3 : tout changement d'état s'y écrit,
     TOUJOURS) — `ai_run` reste en premier au cas où un futur chemin poserait
     un jour `proposed_by_ai_run` (défense en profondeur, jamais supposée). */
  const materialites = await q<{ id: string; quand: string | null }>(
    `select m.id::text, coalesce(ar.created_at, ev.created_at)::text quand
     from materiality m
     left join ai_run ar on ar.id = m.proposed_by_ai_run
     left join event_log ev on ev.object_type = 'materiality' and ev.object_id = m.id::text
       and ev.verb = 'materiality_proposed'
     where m.engagement_id = $1 and m.status = 'proposed'
     order by coalesce(ar.created_at, ev.created_at) asc nulls last`,
    [engagementId],
  );
  for (const m of materialites) {
    out.push({
      id: m.id, nature: 'materialite', engagementId,
      titre: motif('notif.materialite'),
      href: `/eng/${engagementId}/materiality`,
      quand: m.quand, niveau: NIVEAU_ACTUEL,
    });
  }

  return out;
}

/** NOTIF-01 (§3.3) : les mêmes éléments, en motifs d'obstacle au visa — jamais
 *  une seconde liste. Un dossier qui porte encore un élément IA non validé ne
 *  se signe pas. */
export async function obstaclesIaNonValidee(engagementId: string): Promise<Motif[]> {
  const elements = await elementsIaNonValides(engagementId);
  return elements.map((e) => motif('obst.iaNonValide', { quoi: e.titre }));
}

export interface CarteNotification extends ElementIa {
  mission: string;
}

/**
 * §3.2 : « Ce que moi je dois approuver » — filtré par la personne ET son
 * rôle. `can_sign` (0001_core.sql, `engagement_member`) est déjà la capacité
 * qui, dans ce dépôt, dit qu'une signature de cette personne compte sur ce
 * dossier (`team.ts::anciennetes`, la rotation du signataire). Le produit ne
 * modélise pas encore un droit plus fin — QUI valide QUEL type d'élément
 * (même limite assumée que `mesTravaux`, travaux.ts) — donc une personne sans
 * `can_sign` sur un dossier voit zéro élément de CE dossier compté comme
 * sien : « une proposition qu'un staff ne peut pas valider ne lui est pas
 * comptée comme sienne » (§3.2), au sens le plus honnête qu'on puisse prouver
 * aujourd'hui, sans inventer une règle d'autorisation plus fine que celle qui
 * existe déjà.
 *
 * L'âge de chaque attente, la plus ancienne en tête (§3.2) — les éléments
 * sans date mesurée (règle 31) sont classés en dernier, jamais devinés.
 */
export async function notificationsPourApprobation(userId: string): Promise<CarteNotification[]> {
  const dossiers = await q<{ id: string; mission: string }>(
    `select e.id::text, e.name mission
     from engagement e
     join engagement_member m on m.engagement_id = e.id and m.user_id = $1
     where ${OUVERT} and ${CABINET} and m.can_sign = true
     order by e.name`,
    [userId],
  );
  const out: CarteNotification[] = [];
  for (const d of dossiers) {
    const elements = await elementsIaNonValides(d.id);
    out.push(...elements.map((e) => ({ ...e, mission: d.mission })));
  }
  return out.sort((a, b) => (a.quand ?? '9999').localeCompare(b.quand ?? '9999'));
}
