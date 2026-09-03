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
