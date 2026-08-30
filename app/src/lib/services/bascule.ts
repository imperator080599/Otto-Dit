import { q, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';

// LA BASCULE ENTRE MISSIONS D'UN GROUPE (ADR-100). Un client peut être un
// groupe : UN client, PLUSIEURS entités, parfois plusieurs mandats par
// entité. La bascule porte donc sur les MISSIONS, groupées par client — pas
// sur une liste plate de clients ni d'entités. Le « client » d'une mission
// est le GROUPE quand l'entité en fait partie (corp_group via component),
// sinon l'entité elle-même.
//
// Chaque changement est JOURNALISÉ : passer d'un dossier à l'autre est un
// acte de consultation du dossier, et un dossier d'audit sait qui l'a ouvert
// et d'où. C'est pour cela que la bascule est une ACTION (event_log) et pas
// un simple lien.

export interface MissionAccessible {
  id: string; name: string; status: string;
  entity_id: string; entity_name: string; period_label: string;
  client: string;
  packs: string[];
}

export interface ClientAvecMissions {
  client: string;
  entites: { entity_id: string; entity_name: string; missions: MissionAccessible[] }[];
}

/** Les missions du connecté, groupées client → entité → mission. */
export async function missionsParClient(userId: string): Promise<ClientAvecMissions[]> {
  const rows = await q<MissionAccessible & { framework_set: { assurance_packs: string[] } }>(
    `select e.id::text id, e.name, e.status, en.id::text entity_id, en.name entity_name,
            p.label period_label, e.framework_set,
            coalesce(g.name, en.name) client
     from engagement e
     join engagement_member m on m.engagement_id = e.id and m.user_id = $1
     join entity en on en.id = e.entity_id
     join period p on p.id = e.period_id
     left join component c on c.entity_id = en.id
     left join corp_group g on g.id = c.corp_group_id
     order by coalesce(g.name, en.name), en.name, p.end_date desc, e.name`,
    [userId],
  );
  const clients: ClientAvecMissions[] = [];
  for (const r of rows) {
    const mission: MissionAccessible = { ...r, packs: r.framework_set.assurance_packs };
    let cl = clients.find((c) => c.client === r.client);
    if (!cl) { cl = { client: r.client, entites: [] }; clients.push(cl); }
    let ent = cl.entites.find((x) => x.entity_id === r.entity_id);
    if (!ent) { ent = { entity_id: r.entity_id, entity_name: r.entity_name, missions: [] }; cl.entites.push(ent); }
    /* Une mission peut sortir DEUX fois de la requête si l'entité porte
       plusieurs components : on dédouble par id, pas par position. */
    if (!ent.missions.some((m) => m.id === mission.id)) ent.missions.push(mission);
  }
  return clients;
}

/**
 * BASCULER — avec les gardes dans l'ordre des refus les plus informatifs :
 * l'isolation d'abord (l'autre cabinet), l'affectation ensuite (pas membre).
 * Le tenant vient de l'utilisateur de SESSION, jamais d'un formulaire.
 */
export async function basculer(userId: string, versEngagementId: string, depuisEngagementId: string | null): Promise<string> {
  const user = await q1<{ id: string; tenant_id: string }>(
    `select id, tenant_id from app_user where id = $1`, [userId],
  );
  const cible = await q1<{ id: string; tenant_id: string; name: string }>(
    `select id, tenant_id, name from engagement where id = $1`, [versEngagementId],
  ).catch(() => { throw new Error('bascule : cette mission n\'existe pas'); });
  if (cible.tenant_id !== user.tenant_id) {
    throw new Error('isolation : cette mission appartient à un autre cabinet — bascule refusée');
  }
  const membre = await q<{ id: string }>(
    `select id from engagement_member where engagement_id = $1 and user_id = $2 and exited_on is null`,
    [versEngagementId, userId],
  );
  if (!membre.length) {
    throw new Error('bascule : vous n\'êtes pas affecté à cette mission — demandez l\'affectation à l\'associé');
  }
  await logEvent({
    tenantId: user.tenant_id, engagementId: versEngagementId, actorKind: 'user', actorId: userId,
    verb: 'engagement.switched', objectType: 'engagement', objectId: versEngagementId,
    payload: { depuis: depuisEngagementId },
  });
  return versEngagementId;
}
