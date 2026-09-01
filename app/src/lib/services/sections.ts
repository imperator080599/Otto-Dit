import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { postesRetenus } from './rail';

// LES SECTIONS DU DOSSIER — détenir, répondre de, suivre, avoir ouvert
// (revue utilisateur n°2, §4 et §5).
//
// LA REMARQUE QUI COMMANDE TOUT : « Currently With Me » et « Assigned To Me »
// ne sont PAS deux filtres du même champ. L'un dit « on me l'a envoyée »
// (détenteur courant), l'autre « j'en réponds » (propriétaire). Modélisés en
// un seul champ, les deux listes montrent la même chose et la vue perd son
// sens — c'est exactement le genre de raccourci qui rend un tableau de bord
// inutile sans qu'on sache pourquoi.
//
// Quatre notions, quatre mécanismes distincts :
//   · propriétaire  — une attribution
//   · détenteur     — un envoi, qui déplace le détenteur SANS toucher au
//                     propriétaire
//   · suivi         — un ABONNEMENT volontaire (on suit ce qu'on a choisi)
//   · récent        — un journal de CONSULTATION par personne, qui n'est pas
//                     la piste d'audit : lire n'est pas changer d'état.
//
// LE STATUT SE DÉRIVE, il ne se stocke pas. L'échelle est unique et tenue
// partout ; elle sort du visa du papier et de l'avancement du contrôle sur
// pièces, jamais d'un champ qu'on oublierait de mettre à jour.

export type Statut = 'not_started' | 'in_preparation' | 'completed' | 'reviewed';

/**
 * L'ÉCHELLE UNIQUE DU PRODUIT — une seule, tenue partout (vigilance §4).
 *
 * La couleur n'est JAMAIS seule : chaque statut porte un libellé et un repère
 * de forme, pour rester lisible en daltonisme et à l'impression. Et le ROUGE
 * n'est pas dans cette échelle : il est réservé à ce qui BLOQUE.
 */
export const ECHELLE: Record<Statut, { classe: string; repere: string; en: string; fr: string }> = {
  not_started: { classe: 'gray', repere: '○', en: 'Not started', fr: 'Non commencé' },
  in_preparation: { classe: 'amber', repere: '◐', en: 'In preparation', fr: 'En préparation' },
  completed: { classe: 'green', repere: '●', en: 'Completed', fr: 'Terminé' },
  reviewed: { classe: 'blue', repere: '✓', en: 'Reviewed', fr: 'Revu' },
};

export const ORDRE_STATUT: Statut[] = ['not_started', 'in_preparation', 'completed', 'reviewed'];

export interface Section {
  id: string;
  engagementId: string;
  mission: string;
  kind: 'poste' | 'papier';
  ref: string;
  label: string;
  statut: Statut;
  ownerId: string | null;
  ownerNom: string | null;
  holderId: string | null;
  holderNom: string | null;
  href: string;
}

/* Le statut DÉRIVÉ, en SQL, pour les deux natures de section. Écrit une fois
   et réutilisé : deux dérivations du même statut divergeraient. */
const STATUT_PAPIER = `
  case w.status
    when 'signed' then 'reviewed'
    when 'reviewed' then 'completed'
    when 'in_review' then 'completed'
    else 'in_preparation'
  end`;

const STATUT_POSTE = `
  case
    when exists (select 1 from workpaper w2
                 join procedure_instance p2 on p2.id = w2.procedure_id
                 where w2.engagement_id = s.engagement_id and p2.fsli_code = s.ref
                   and w2.status = 'signed') then 'reviewed'
    when (select count(*) from sample_item i
          join sample sa on sa.id = i.sample_id
          join procedure_instance p3 on p3.id = sa.procedure_id
          where p3.engagement_id = s.engagement_id and p3.fsli_code = s.ref
            and sa.status = 'drawn') = 0 then 'not_started'
    when (select count(*) from sample_item i
          join sample sa on sa.id = i.sample_id
          join procedure_instance p3 on p3.id = sa.procedure_id
          where p3.engagement_id = s.engagement_id and p3.fsli_code = s.ref
            and sa.status = 'drawn' and i.status = 'pending') = 0 then 'completed'
    else 'in_preparation'
  end`;

/**
 * Les sections du dossier, DÉRIVÉES de ce qu'il contient : un poste retenu est
 * une section, un papier est une section. Créées si elles manquent — une liste
 * tenue à la main oublie la section suivante, et l'oubli est silencieux.
 */
export async function assurerSections(engagementId: string): Promise<void> {
  for (const p of await postesRetenus(engagementId)) {
    await q(
      `insert into section_state (engagement_id, kind, ref, label)
       values ($1, 'poste', $2, $3)
       on conflict (engagement_id, kind, ref) do update set label = excluded.label`,
      [engagementId, p.code, p.name]);
  }
  const papiers = await q<{ id: string; code: string; title: string }>(
    `select id::text, code, title from workpaper where engagement_id = $1`, [engagementId]);
  for (const w of papiers) {
    await q(
      `insert into section_state (engagement_id, kind, ref, label)
       values ($1, 'papier', $2, $3)
       on conflict (engagement_id, kind, ref) do update set label = excluded.label`,
      [engagementId, w.id, `${w.code} — ${w.title}`]);
  }
}

const CHAMPS = `
  s.id::text, s.engagement_id::text "engagementId", e.name mission, s.kind, s.ref, s.label,
  s.owner_id::text "ownerId", o.name "ownerNom",
  s.holder_id::text "holderId", h.name "holderNom",
  case when s.kind = 'papier'
       then coalesce((select ${STATUT_PAPIER} from workpaper w where w.id::text = s.ref), 'not_started')
       else ${STATUT_POSTE} end statut,
  case when s.kind = 'papier'
       then '/eng/' || s.engagement_id::text || '/workpapers/' || s.ref
       else '/eng/' || s.engagement_id::text || '/poste/' || s.ref end href`;

const DEPUIS = `
  from section_state s
  join engagement e on e.id = s.engagement_id
  left join app_user o on o.id = s.owner_id
  left join app_user h on h.id = s.holder_id`;

export interface MesSections {
  detenues: Section[];
  attribuees: Section[];
  suivies: Section[];
  recentes: Section[];
}

/** Les quatre listes de « My assignments » — quatre mécanismes, quatre requêtes. */
export async function mesSections(userId: string): Promise<MesSections> {
  const membre = `s.engagement_id in (select engagement_id from engagement_member where user_id = $1)`;
  const detenues = await q<Section>(
    `select ${CHAMPS} ${DEPUIS} where s.holder_id = $1 and ${membre} order by s.label`, [userId]);
  const attribuees = await q<Section>(
    `select ${CHAMPS} ${DEPUIS} where s.owner_id = $1 and ${membre} order by s.label`, [userId]);
  const suivies = await q<Section>(
    `select ${CHAMPS} ${DEPUIS}
     join section_watch wt on wt.section_id = s.id and wt.user_id = $1
     where ${membre} order by s.label`, [userId]);
  const recentes = await q<Section>(
    `select distinct on (s.id) ${CHAMPS}, v.visited_at ${DEPUIS}
     join section_visit v on v.section_id = s.id and v.user_id = $1
     where ${membre}
     order by s.id, v.visited_at desc`, [userId]);
  recentes.sort((a, b) =>
    String((b as unknown as { visited_at: string }).visited_at)
      .localeCompare(String((a as unknown as { visited_at: string }).visited_at)));
  return { detenues, attribuees, suivies, recentes: recentes.slice(0, 8) };
}

/** Toutes les sections d'un dossier, avec leur statut dérivé. */
export async function sectionsDuDossier(engagementId: string): Promise<Section[]> {
  return q<Section>(`select ${CHAMPS} ${DEPUIS} where s.engagement_id = $1 order by s.kind, s.label`,
    [engagementId]);
}

/** L'avancement du dossier, par statut — la matière du graphique. */
export async function avancement(engagementId: string): Promise<{ statut: Statut; n: number }[]> {
  const secs = await sectionsDuDossier(engagementId);
  return ORDRE_STATUT.map((st) => ({ statut: st, n: secs.filter((s) => s.statut === st).length }));
}

async function section(sectionId: string) {
  return q1<{ engagement_id: string; label: string; owner_id: string | null; holder_id: string | null }>(
    `select engagement_id::text, label, owner_id::text, holder_id::text
     from section_state where id = $1`, [sectionId]);
}

async function tenantDe(engagementId: string): Promise<string> {
  return (await q1<{ tenant_id: string }>(
    `select tenant_id::text from engagement where id = $1`, [engagementId])).tenant_id;
}

/**
 * ENVOYER une section à quelqu'un : le détenteur change, le propriétaire NON.
 * C'est toute la différence entre les deux listes ; la confondre les rendrait
 * identiques.
 */
export async function envoyerA(sectionId: string, versUserId: string, parUserId: string): Promise<void> {
  const s = await section(sectionId);
  const membre = await q01<{ n: string }>(
    `select count(*) n from engagement_member where engagement_id = $1 and user_id = $2`,
    [s.engagement_id, versUserId]);
  if (Number(membre?.n ?? 0) === 0) {
    throw new Error('On n’envoie pas une section à quelqu’un qui n’est pas sur la mission.');
  }
  await q(`update section_state set holder_id = $2, updated_at = now() where id = $1`,
    [sectionId, versUserId]);
  await logEvent({
    tenantId: await tenantDe(s.engagement_id), engagementId: s.engagement_id,
    actorKind: 'user', actorId: parUserId,
    verb: 'section.sent', objectType: 'section_state', objectId: sectionId,
    payload: { vers: versUserId, label: s.label },
  });
}

/** ATTRIBUER une section : le propriétaire change, le détenteur non. */
export async function attribuerA(sectionId: string, ownerId: string, parUserId: string): Promise<void> {
  const s = await section(sectionId);
  await q(`update section_state set owner_id = $2, updated_at = now() where id = $1`,
    [sectionId, ownerId]);
  await logEvent({
    tenantId: await tenantDe(s.engagement_id), engagementId: s.engagement_id,
    actorKind: 'user', actorId: parUserId,
    verb: 'section.assigned', objectType: 'section_state', objectId: sectionId,
    payload: { owner: ownerId, label: s.label },
  });
}

/** SUIVRE : un abonnement volontaire, qu'on pose et qu'on retire. */
export async function suivre(sectionId: string, userId: string, suivi: boolean): Promise<void> {
  if (suivi) {
    await q(`insert into section_watch (section_id, user_id) values ($1,$2)
             on conflict do nothing`, [sectionId, userId]);
  } else {
    await q(`delete from section_watch where section_id = $1 and user_id = $2`, [sectionId, userId]);
  }
}

/**
 * VISITER : le journal de consultation, par personne. Il n'entre PAS dans
 * event_log — une piste d'audit qui enfle d'une ligne à chaque coup d'œil
 * cesse d'être lisible, et lire n'est pas un changement d'état.
 */
export async function visiter(engagementId: string, kind: 'poste' | 'papier', ref: string, userId: string): Promise<void> {
  const s = await q01<{ id: string }>(
    `select id::text from section_state where engagement_id = $1 and kind = $2 and ref = $3`,
    [engagementId, kind, ref]);
  if (!s) return;
  await q(`insert into section_visit (section_id, user_id) values ($1,$2)`, [s.id, userId]);
}
