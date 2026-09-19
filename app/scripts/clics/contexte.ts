import { q01, q1 } from '../../src/lib/db/client';

// LES IDENTIFIANTS DU PARCOURS CLIQUÉ, résolus AVANT que le serveur ne prenne
// la base : PGlite n'admet qu'un écrivain, donc le harnais lit tout ce dont il
// a besoin, ferme, puis lance le serveur.

export interface Contexte {
  /** Le dossier de démonstration — celui qui porte le cycle complet. */
  eng: string;
  /** Les trois identités du visa : préparateur, reviewer, associé signataire. */
  preparateur: { id: string; nom: string };
  reviewer: { id: string; nom: string };
  associe: { id: string; nom: string };
  /** Le jeton du portail client — l'autre moitié du produit. */
  jeton: string;
  /** §4 point 3 (R74) : un contrôle SOX qui porte déjà un enregistrement de walkthrough —
   *  null si aucun (le monde de démonstration n'en garantit pas toujours un). Le dossier SOX
   *  (`kind = 'sox_component'`) est un AUTRE engagement que `eng` ci-dessus : le parcours ne
   *  l'avait jamais résolu avant cette tranche. */
  controleWalkthrough: { engId: string; controlId: string; code: string } | null;
  /** Inventaire de clôture (2026-09-19), lignes CTRL-01..07/VID-01/table-sourcee : trois
   *  contrôles ENCORE VIERGES (`di_walkthrough_evidence_id is null`, semés par `bootstrapSox`
   *  mais jamais cyclés par `runControlCycle` — RCM importe sept contrôles, seuls deux sont
   *  cyclés) — le seul état qui permet d'observer un refus CTRL-0X en le PROVOQUANT par un
   *  clic, plutôt que de lire un contrôle déjà entièrement conclu par le semeur. */
  controlePristineMensuel: { engId: string; controlId: string; code: string } | null;
  controlePristineAdhoc: { engId: string; controlId: string; code: string } | null;
  controlePristineQuotidien: { engId: string; controlId: string; code: string } | null;
}

export async function contexte(): Promise<Contexte> {
  /* Le dossier le plus RICHE, pas « le premier » : le dossier N-1 existe aussi
     et n'a ni demande ni papier — le choisir ferait échouer la moitié des
     étapes pour une raison qui n'a rien à voir avec le produit (ADR-076). */
  const eng = await q1<{ id: string }>(
    `select e.id::text id from engagement e join period p on p.id = e.period_id
     where e.kind = 'statutory_audit'
     order by (select count(*) from workpaper w where w.engagement_id = e.id) desc,
              p.end_date desc, e.id
     limit 1`);

  /* Les rôles viennent de l'AFFECTATION sur la mission, pas du rôle cabinet :
     c'est l'affectation qui commande le visa. */
  const par = async (role: string) => q01<{ id: string; nom: string }>(
    `select u.id::text id, u.name nom from engagement_member m
     join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.eng_role = $2 and m.exited_on is null
     order by m.can_sign desc, u.name limit 1`,
    [eng.id, role]);

  const senior = await par('senior') ?? await par('staff');
  const manager = await par('manager');
  const partner = await par('partner');
  if (!senior || !manager || !partner) {
    throw new Error(
      'le parcours cliqué a besoin des trois rôles du visa sur la mission '
      + `(senior/staff, manager, partner) — trouvés : ${[senior, manager, partner].map((x) => x?.nom ?? '—').join(', ')}`,
    );
  }

  const contact = await q1<{ jeton: string }>(
    `select c.portal_token jeton from client_contact c
     join engagement e on e.entity_id = c.entity_id
     where e.id = $1 and c.active order by c.name limit 1`,
    [eng.id]);

  const walkthrough = await q01<{ eng_id: string; control_id: string; code: string }>(
    `select c.engagement_id::text eng_id, c.id::text control_id, c.code
     from control c
     where c.di_walkthrough_evidence_id is not null order by c.code limit 1`);

  /* CONSTAT MOYEN DU RÉFUTATEUR (inventaire de clôture §3, réfutateur du commit 6fd6427) :
     `enrichir.ts:388` importe le MÊME `rcm.csv` dans engNep dès que sa RCM est vide — vrai à
     chaque `npm run demo` (`demo-enrichir.ts`) et à chaque reconstruction de production
     (`scripts/deploy/reconstruire.ts`). Un contrôle vierge (`di_walkthrough_evidence_id is
     null`) existe alors potentiellement dans DEUX engagements sous le MÊME code — non scopé
     par engagement, `order by c.code limit 1` devient un pari sur l'ordre de retour de la
     base. Scopé sur l'engagement du contrôle qui PORTE un walkthrough (`walkthrough.eng_id`,
     ci-dessus) — c'est la SEULE requête de ce fichier qui identifie de façon fiable le
     dossier SOX, puisque seul `runControlCycle` (part2.ts, jamais appelé pour engNep) attache
     un walkthrough. Si `walkthrough` est absent (aucun contrôle cyclé nulle part), on retombe
     sans filtre — même comportement qu'avant, sur un monde qui de toute façon ne permettrait
     aucune des stations qui en dépendent. */
  const pristine = async (frequency: string) => q01<{ eng_id: string; control_id: string; code: string }>(
    walkthrough
      ? `select c.engagement_id::text eng_id, c.id::text control_id, c.code
         from control c
         where c.di_walkthrough_evidence_id is null and c.frequency = $1 and c.engagement_id = $2
         order by c.code limit 1`
      : `select c.engagement_id::text eng_id, c.id::text control_id, c.code
         from control c
         where c.di_walkthrough_evidence_id is null and c.frequency = $1
         order by c.code limit 1`,
    walkthrough ? [frequency, walkthrough.eng_id] : [frequency],
  );
  const pristineMensuel = await pristine('monthly');
  const pristineAdhoc = await pristine('adhoc');
  const pristineQuotidien = await pristine('daily');

  return {
    eng: eng.id,
    preparateur: senior, reviewer: manager, associe: partner,
    jeton: contact.jeton,
    controleWalkthrough: walkthrough ? { engId: walkthrough.eng_id, controlId: walkthrough.control_id, code: walkthrough.code } : null,
    controlePristineMensuel: pristineMensuel
      ? { engId: pristineMensuel.eng_id, controlId: pristineMensuel.control_id, code: pristineMensuel.code } : null,
    controlePristineAdhoc: pristineAdhoc
      ? { engId: pristineAdhoc.eng_id, controlId: pristineAdhoc.control_id, code: pristineAdhoc.code } : null,
    controlePristineQuotidien: pristineQuotidien
      ? { engId: pristineQuotidien.eng_id, controlId: pristineQuotidien.control_id, code: pristineQuotidien.code } : null,
  };
}
