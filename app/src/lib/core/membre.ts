import { q01 } from '@/lib/db/client';

// L'ÉTANCHÉITÉ ENTRE CABINETS, TENUE DANS LES SERVICES (mandat du jour n°3,
// §1.1 — trouvée par `core/etancheite.test.ts`, qui montrait ONZE gestes sur
// treize acceptés depuis un autre cabinet).
//
// CE QUI LA TENAIT AVANT : `requireMember` sur les ÉCRANS, et rien d'autre.
// Les services prenaient un `userId` sans jamais vérifier qu'il appartient à
// l'équipe du dossier — une action serveur atteinte autrement que par son
// écran (un identifiant deviné, un formulaire rejoué, un appel direct)
// écrivait dans le dossier d'un autre cabinet. Et la politique RLS est INERTE
// en production (le rôle qui sert l'application porte BYPASSRLS) : la base ne
// rattrape rien. Le secret professionnel entre deux dossiers de clients
// concurrents ne tenait donc qu'à la porte d'entrée des écrans.
//
// DEUX REFUS, DANS CET ORDRE, ET L'ORDRE EST LA RÈGLE :
//   · ETANCH-01 — l'acteur n'est pas du CABINET du dossier. Ce refus passe
//     AVANT tous les autres : répondre « faites d'abord accepter la mission »
//     à quelqu'un qui vise le dossier d'un autre cabinet lui apprendrait que
//     la mission existe (même doctrine qu'ADR-069/ADR-082, écrite dans
//     acceptance.test.ts).
//   · ETANCH-03 — l'acteur est du cabinet, mais n'est pas sur CETTE mission.
//
// OÙ CETTE RÈGLE CESSE DE REGARDER, dit ici :
//   · Une mission SANS AUCUNE ÉQUIPE ne se garde pas par l'équipe : avant
//     l'acceptation, personne ne peut être membre (`assignMember` le refuse),
//     et c'est `assertAccepte` qui parle. La garde d'équipe se tait donc tant
//     que l'équipe est vide — le cabinet, lui, est vérifié quand même.
//   · Elle ne juge PAS le rôle : un membre est un membre. Qui clôt une note,
//     qui vise, qui scelle — ce sont d'autres règles (ADR-028, la hiérarchie
//     de visa), et elles vivent ailleurs.
//   · Elle ne s'applique PAS à un acteur nul : un moteur qui recalcule n'a pas
//     de personne. Le service qui passe `null` déclare par là qu'il est un
//     chemin SYSTÈME ; l'événement qu'il écrit porte `actorKind: 'system'`.
//   · Elle ne remplace PAS la RLS : tant que l'étape 3 de docs/PLAN_RLS.md
//     n'est pas exécutée, un accès direct à Postgres avec la chaîne de
//     l'application voit tout. C'est écrit dans le plan et dans le rapport.

interface Situation {
  cabinetDuDossier: string | null;
  cabinetDeLaPersonne: string | null;
  equipe: number;
  mien: number;
}

async function situation(engagementId: string, userId: string): Promise<Situation> {
  const r = await q01<{ eng: string | null; per: string | null; equipe: string; mien: string }>(
    `select (select tenant_id::text from engagement where id = $1) eng,
            (select tenant_id::text from app_user where id = $2) per,
            (select count(*)::text from engagement_member where engagement_id = $1 and exited_on is null) equipe,
            (select count(*)::text from engagement_member where engagement_id = $1 and user_id = $2 and exited_on is null) mien`,
    [engagementId, userId]);
  return {
    cabinetDuDossier: r?.eng ?? null,
    cabinetDeLaPersonne: r?.per ?? null,
    equipe: Number(r?.equipe ?? 0),
    mien: Number(r?.mien ?? 0),
  };
}

/** ETANCH-01 / ETANCH-03 — l'acteur d'un geste est du cabinet, et de l'équipe. */
export async function assertMembre(engagementId: string, userId: string | null | undefined, geste: string): Promise<void> {
  if (userId === null || userId === undefined) return;
  const s = await situation(engagementId, userId);
  if (!s.cabinetDuDossier || s.cabinetDeLaPersonne !== s.cabinetDuDossier) {
    throw new Error(`ETANCH-01 : ${geste} — ce dossier n’est pas de ce cabinet`);
  }
  if (s.equipe > 0 && s.mien === 0) {
    throw new Error(`ETANCH-03 : ${geste} — cette personne n’est pas de l’équipe de ce dossier`);
  }
}

/** ETANCH-02 — le DESTINATAIRE d'une attribution est du cabinet, et de l'équipe. */
export async function assertDestinataire(engagementId: string, userId: string | null | undefined, geste: string): Promise<void> {
  if (userId === null || userId === undefined) return;
  const s = await situation(engagementId, userId);
  if (!s.cabinetDuDossier || s.cabinetDeLaPersonne !== s.cabinetDuDossier || (s.equipe > 0 && s.mien === 0)) {
    throw new Error(`ETANCH-02 : ${geste} — on ne confie pas un travail à quelqu’un qui n’est pas sur la mission`);
  }
}

/** La même question, sans lever : ce que les écrans lisent pour offrir un geste. */
export async function estMembre(engagementId: string, userId: string): Promise<boolean> {
  const s = await situation(engagementId, userId);
  return Boolean(s.cabinetDuDossier) && s.cabinetDeLaPersonne === s.cabinetDuDossier && (s.equipe === 0 || s.mien > 0);
}

// ── LE DOSSIER D'UN OBJET FILS, RÉSOLU EN BASE ────────────────────────────
//
// LE TROU QUE CE BLOC FERME (mandat du soir, étage 0.1). Trente-sept écritures
// n'étaient désignées ni par un dossier ni par une personne, mais par
// l'identifiant d'un OBJET FILS — `exception_id`, `deviation_id`, `item_id`,
// `evidence_id`, `declaration_id`. L'acteur venait de la session ; l'objet, NON :
// il arrivait du formulaire, et personne ne le rattachait à son dossier. Un
// utilisateur parfaitement légitime du cabinet A postait l'`exception_id` du
// cabinet B et écrivait dans le dossier B — escalade en anomalie, résolution de
// déficience, mise en quarantaine d'une pièce. `requireMember` sur l'écran ne
// voyait rien : il validait le dossier que l'attaquant DÉCLARE pendant que le
// geste portait sur l'objet qu'il DÉSIGNE.
//
// La résolution ne s'écrit donc pas trente-sept fois : elle vit ici, une fois,
// sous forme de CATALOGUE. Un type d'objet absent du catalogue est REFUSÉ
// (ETANCH-05) — une règle inconnue qu'on ignore est le défaut que la règle 13
// traque, et un `default:` silencieux rouvrirait le trou à la première table
// neuve.
//
// UN OBJET QUI NE SE RÉSOUT PAS ET UN OBJET D'UN AUTRE CABINET REÇOIVENT LE
// MÊME REFUS (ETANCH-04), et c'est délibéré : distinguer « cet écart n'existe
// pas » de « cet écart n'est pas à vous » APPREND à un intrus que l'objet
// existe. Même doctrine qu'ETANCH-01 avant ETANCH-03 (ADR-069/ADR-082).

/** Les objets FILS par lesquels une écriture peut être désignée. */
export type ObjetFils =
  | 'carry_forward' | 'confirmation_party' | 'control' | 'deficiency' | 'deviation'
  | 'estimation' | 'evidence' | 'exception' | 'extraction' | 'independence_declaration'
  | 'ipe_rapport' | 'meeting_invitation' | 'process_interview' | 'reconciliation_item'
  | 'request' | 'request_item' | 'sample' | 'sample_evaluation' | 'transcript_gap'
  | 'workpaper' | 'wp_extra_column';

/**
 * COMMENT CHAQUE OBJET REMONTE À SON DOSSIER. Une entrée = une requête, et la
 * requête est ÉCRITE ici plutôt que devinée : les sauts (un écart de
 * rapprochement passe par son rapprochement, une évaluation par son
 * échantillon, une extraction par sa pièce) sont la partie qu'on oublie.
 */
const RESOLUTION: Record<ObjetFils, string> = {
  carry_forward: `select engagement_id::text e from carry_forward where id = $1`,
  confirmation_party: `select c.engagement_id::text e from confirmation_party p
     join confirmation_campaign c on c.id = p.campaign_id where p.id = $1`,
  control: `select engagement_id::text e from control where id = $1`,
  deficiency: `select engagement_id::text e from deficiency where id = $1`,
  deviation: `select engagement_id::text e from deviation where id = $1`,
  estimation: `select engagement_id::text e from estimation where id = $1`,
  evidence: `select engagement_id::text e from evidence where id = $1`,
  exception: `select engagement_id::text e from exception where id = $1`,
  extraction: `select v.engagement_id::text e from extraction x
     join evidence v on v.id = x.evidence_id where x.id = $1`,
  independence_declaration: `select engagement_id::text e from independence_declaration where id = $1`,
  ipe_rapport: `select engagement_id::text e from ipe_rapport where id = $1`,
  meeting_invitation: `select engagement_id::text e from meeting_invitation where id = $1`,
  process_interview: `select engagement_id::text e from process_interview where id = $1`,
  reconciliation_item: `select r.engagement_id::text e from reconciliation_item i
     join reconciliation r on r.id = i.reconciliation_id where i.id = $1`,
  request: `select engagement_id::text e from request where id = $1`,
  request_item: `select r.engagement_id::text e from request_item i
     join request r on r.id = i.request_id where i.id = $1`,
  sample: `select engagement_id::text e from sample where id = $1`,
  sample_evaluation: `select s.engagement_id::text e from sample_evaluation v
     join sample s on s.id = v.sample_id where v.id = $1`,
  transcript_gap: `select i.engagement_id::text e from transcript_gap g
     join process_interview i on i.id = g.interview_id where g.id = $1`,
  workpaper: `select engagement_id::text e from workpaper where id = $1`,
  wp_extra_column: `select engagement_id::text e from wp_extra_column where id = $1`,
};

/** Le dossier auquel appartient un objet fils — null s'il ne se résout pas. */
export async function engagementDe(kind: ObjetFils, id: string): Promise<string | null> {
  const sql = RESOLUTION[kind];
  if (!sql) {
    throw new Error(`ETANCH-05 : type d\u2019objet « ${kind} » inconnu du catalogue de résolution `
      + `(app/src/lib/core/membre.ts). Ajoutez-le AVEC sa requête, ou l\u2019écriture n\u2019est gardée par rien.`);
  }
  if (!id) return null;
  const r = await q01<{ e: string | null }>(sql, [id]);
  return r?.e ?? null;
}

/**
 * ETANCH-04 puis ETANCH-01/03 — le geste porte sur un objet FILS : on remonte
 * à son dossier EN BASE, puis on garde ce dossier-là. Rend l'identifiant du
 * dossier, pour que l'appelant n'ait pas à le relire.
 *
 * `equipe: false` garde le CABINET seulement. Une seule famille l'emploie
 * aujourd'hui, et la raison est la même que pour `openDeclaration` : la
 * déclaration d'indépendance PRÉCÈDE l'affectation — on la signe pour POUVOIR
 * rejoindre l'équipe. Exiger l'appartenance rendrait l'entrée impossible.
 */
export async function assertMembreDe(
  kind: ObjetFils, id: string, userId: string | null | undefined, geste: string,
  opts: { equipe?: boolean } = {},
): Promise<string> {
  const engagementId = await engagementDe(kind, id);
  if (!engagementId) {
    throw new Error(`ETANCH-04 : ${geste} — cet objet n\u2019appartient à aucun dossier de ce cabinet`);
  }
  if (opts.equipe === false) await assertCabinet(engagementId, userId, geste);
  else await assertMembre(engagementId, userId, geste);
  return engagementId;
}

/** ETANCH-01 seul : le CABINET, sans exiger l'appartenance à l'équipe. */
export async function assertCabinet(engagementId: string, userId: string | null | undefined, geste: string): Promise<void> {
  if (userId === null || userId === undefined) return;
  const s = await situation(engagementId, userId);
  if (!s.cabinetDuDossier || s.cabinetDeLaPersonne !== s.cabinetDuDossier) {
    throw new Error(`ETANCH-01 : ${geste} — ce dossier n\u2019est pas de ce cabinet`);
  }
}

/** Les types d'objet du catalogue — lu par l'instrument de couverture. */
export const OBJETS_FILS = Object.keys(RESOLUTION) as ObjetFils[];

/**
 * ETANCH-07 — LE CABINET SANS DOSSIER. `creerClient` n'a pas d'`engagement_id`
 * à garder : il en crée un chez un locataire. La question devient alors « cette
 * personne est-elle DE ce cabinet ? », et elle se pose quand même — sinon un
 * utilisateur du cabinet A crée une entité chez le cabinet B en postant son
 * `tenantId`.
 *
 * OÙ ELLE CESSE DE REGARDER : elle ne dit rien du RÔLE (qui a le droit de créer
 * un client est une autre règle), ni d'un acteur nul (chemin système).
 */
export async function assertCabinetDuLocataire(tenantId: string, userId: string | null | undefined, geste: string): Promise<void> {
  if (userId === null || userId === undefined) return;
  const r = await q01<{ t: string | null }>(`select tenant_id::text t from app_user where id = $1`, [userId]);
  if (!tenantId || r?.t !== tenantId) {
    throw new Error(`ETANCH-07 : ${geste} — cette personne n\u2019est pas de ce cabinet`);
  }
}
