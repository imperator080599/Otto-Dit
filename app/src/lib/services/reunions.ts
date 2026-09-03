import { q, q01, q1 } from '@/lib/db/client';
import { logEvent } from '@/lib/core/events';
import { now } from '@/lib/core/clock';
import { genererIcs } from '@/lib/kernel/ics';
import { getAgendaAdapter, getTransportInvitation, type CreneauOccupe } from './agenda/adapters';
import { assertMembre } from '@/lib/core/membre';

// LES INVITATIONS DE RÉUNION — LA PARTIE DÉTERMINISTE (ADR-101).
// Tout ce qui peut être calculé l'est ici, testé, hors ligne : les contacts
// de la mission, la proposition de créneaux contre les disponibilités
// (libre/occupé SEULEMENT), l'ordre exact des copies, le .ics et le corps.
// Le CHOIX DU CRÉNEAU EST HUMAIN, obligatoire — jamais d'envoi automatique ;
// la lecture d'agendas et l'envoi vivent derrière des adaptateurs simulés,
// et l'écran le dit.

/** L'ordre de séniorité du cabinet. AUCUN tri sur eng_role n'existait avant :
 *  « order by eng_role » trie l'ALPHABET (manager < partner < senior < staff)
 *  et mentait en silence. Le rang est nommé, ici, une fois. */
export const RANG_SENIORITE: Record<string, number> = { partner: 0, manager: 1, senior: 2, staff: 3 };

async function ctxEng(engagementId: string) {
  return q1<{ tenant_id: string }>(`select tenant_id from engagement where id = $1`, [engagementId]);
}

// ── LES CONTACTS DE LA MISSION ───────────────────────────────────────────────

export async function contactsDeLaMission(engagementId: string) {
  return q<{ id: string; client_contact_id: string; nom: string; email: string; titre: string | null; role: string; domaine: string | null }>(
    `select ec.id::text id, cc.id::text client_contact_id, cc.name nom, cc.email, cc.title titre, ec.role, ec.domaine
     from engagement_contact ec join client_contact cc on cc.id = ec.client_contact_id
     where ec.engagement_id = $1
     order by case ec.role when 'cle' then 0 else 1 end, cc.name`,
    [engagementId],
  );
}

export async function contactsDisponibles(engagementId: string) {
  return q<{ id: string; nom: string; email: string; titre: string | null }>(
    `select cc.id::text id, cc.name nom, cc.email, cc.title titre
     from client_contact cc
     join engagement e on e.entity_id = cc.entity_id
     where e.id = $1 and cc.active order by cc.name`,
    [engagementId],
  );
}

/** Déclarer le contact CLÉ. Une nouvelle clé REMPLACE l'ancienne — qui
 *  redevient contact simple — et le remplacement se journalise. */
export async function declarerContactCle(engagementId: string, clientContactId: string, userId: string): Promise<void> {
  await assertMembre(engagementId, userId, 'declarerContactCle');
  const contact = await q01<{ id: string; entity_id: string }>(
    `select cc.id, cc.entity_id from client_contact cc where cc.id = $1 and cc.active`, [clientContactId],
  );
  if (!contact) throw new Error('contact : inconnu ou désactivé');
  const eng = await q1<{ entity_id: string; tenant_id: string }>(
    `select entity_id, tenant_id from engagement where id = $1`, [engagementId],
  );
  if (contact.entity_id !== eng.entity_id) {
    throw new Error('isolation : ce contact appartient à une autre entité — déclaration refusée');
  }
  const ancien = await q01<{ id: string }>(
    `select id from engagement_contact where engagement_id = $1 and role = 'cle'`, [engagementId],
  );
  if (ancien) await q(`delete from engagement_contact where id = $1`, [ancien.id]);
  await q(`delete from engagement_contact where engagement_id = $1 and client_contact_id = $2`, [engagementId, clientContactId]);
  await q(
    `insert into engagement_contact (engagement_id, client_contact_id, role, created_by)
     values ($1, $2, 'cle', $3)`,
    [engagementId, clientContactId, userId],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'reunion.contact_cle', objectType: 'engagement_contact', objectId: clientContactId,
    payload: { remplace: ancien?.id ?? null },
  });
}

export async function declarerContactDomaine(engagementId: string, clientContactId: string, domaine: string, userId: string): Promise<void> {
  await assertMembre(engagementId, userId, 'declarerContactDomaine');
  if (!domaine.trim()) throw new Error('contact : le domaine est vide — « ventes », « trésorerie »…');
  const eng = await ctxEng(engagementId);
  await q(
    `insert into engagement_contact (engagement_id, client_contact_id, role, domaine, created_by)
     values ($1, $2, 'domaine', $3, $4)
     on conflict (engagement_id, client_contact_id) do update set role = 'domaine', domaine = $3`,
    [engagementId, clientContactId, domaine.trim(), userId],
  );
  await logEvent({
    tenantId: eng.tenant_id, engagementId, actorKind: 'user', actorId: userId,
    verb: 'reunion.contact_domaine', objectType: 'engagement_contact', objectId: clientContactId,
    payload: { domaine: domaine.trim() },
  });
}

// ── LES CRÉNEAUX ─────────────────────────────────────────────────────────────

export interface CreneauPropose { debut: string; fin: string }

/** PURE : l'intersection des libertés. Testée à part de tout adaptateur. */
export function creneauxCommuns(
  occupations: CreneauOccupe[][], de: Date, a: Date, dureeMin: number, max = 6,
): CreneauPropose[] {
  const out: CreneauPropose[] = [];
  const pas = 30 * 60000;
  const duree = dureeMin * 60000;
  const jour = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()));
  while (jour <= a && out.length < max) {
    const dow = jour.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const ouvre = new Date(jour); ouvre.setUTCHours(8, 0, 0, 0);
      const ferme = new Date(jour); ferme.setUTCHours(17, 0, 0, 0);
      for (let t = ouvre.getTime(); t + duree <= ferme.getTime() && out.length < max; t += pas) {
        const debut = t; const fin = t + duree;
        const conflit = occupations.some((blocs) => blocs.some((b) => {
          const bd = Date.parse(b.debut); const bf = Date.parse(b.fin);
          return bd < fin && bf > debut;
        }));
        if (!conflit) {
          out.push({ debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString() });
          t += duree - pas; // les créneaux proposés ne se chevauchent pas
        }
      }
    }
    jour.setUTCDate(jour.getUTCDate() + 1);
  }
  return out;
}

export async function proposerCreneaux(engagementId: string, de: Date, a: Date, dureeMin: number): Promise<{ creneaux: CreneauPropose[]; adaptateur: string; equipe: string[] }> {
  if (a < de) throw new Error('créneaux : la fenêtre est inversée');
  const equipe = await q<{ email: string }>(
    `select u.email from engagement_member m join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.exited_on is null`,
    [engagementId],
  );
  if (!equipe.length) throw new Error('créneaux : aucune équipe affectée à la mission');
  const agenda = getAgendaAdapter();
  const occ = await agenda.occupations(equipe.map((e) => e.email), de, a);
  return {
    creneaux: creneauxCommuns(Object.values(occ), de, a, dureeMin),
    adaptateur: agenda.name,
    equipe: equipe.map((e) => e.email),
  };
}

// ── L'INVITATION ─────────────────────────────────────────────────────────────

export interface Copie { nom: string; email: string; titre: string }

/** L'ORDRE EXACT ET CALCULÉ des copies : le contact client clé de la mission,
 *  puis l'équipe du plus senior au moins senior, à grade égal par ordre
 *  alphabétique. Figé dans l'invitation à la création. */
export async function copiesCalculees(engagementId: string): Promise<Copie[]> {
  const cle = await q01<{ nom: string; email: string }>(
    `select cc.name nom, cc.email from engagement_contact ec
     join client_contact cc on cc.id = ec.client_contact_id
     where ec.engagement_id = $1 and ec.role = 'cle'`,
    [engagementId],
  );
  if (!cle) {
    throw new Error('invitation : la mission n\'a pas de contact client clé — déclarez-le d\'abord (écran Réunions)');
  }
  const equipe = await q<{ nom: string; email: string; eng_role: string }>(
    `select u.name nom, u.email, m.eng_role from engagement_member m
     join app_user u on u.id = m.user_id
     where m.engagement_id = $1 and m.exited_on is null`,
    [engagementId],
  );
  equipe.sort((x, y) =>
    (RANG_SENIORITE[x.eng_role] ?? 9) - (RANG_SENIORITE[y.eng_role] ?? 9)
    || x.nom.localeCompare(y.nom, 'fr'));
  return [
    { nom: cle.nom, email: cle.email, titre: 'contact client clé' },
    ...equipe.map((m) => ({ nom: m.nom, email: m.email, titre: m.eng_role })),
  ];
}

export async function choisirCreneau(input: {
  engagementId: string; userId: string;
  debut: string; fin: string; objet: string; destinataireContactId: string;
}): Promise<string> {
  if (!input.objet.trim()) throw new Error('invitation : l\'objet est vide');
  if (!input.destinataireContactId) throw new Error('invitation : choisissez le contact client destinataire — le choix est humain, toujours');
  const dest = await q01<{ id: string; nom: string; email: string; entity_id: string }>(
    `select id, name nom, email, entity_id from client_contact where id = $1 and active`,
    [input.destinataireContactId],
  );
  if (!dest) throw new Error('invitation : destinataire inconnu ou désactivé');
  const eng = await q1<{ tenant_id: string; entity_id: string; name: string }>(
    `select tenant_id, entity_id, name from engagement where id = $1`, [input.engagementId],
  );
  if (dest.entity_id !== eng.entity_id) {
    throw new Error('isolation : ce destinataire appartient à une autre entité — invitation refusée');
  }
  const debut = new Date(input.debut); const fin = new Date(input.fin);
  if (!(fin > debut)) throw new Error('invitation : créneau invalide');
  const copies = await copiesCalculees(input.engagementId);
  const organisateur = await q1<{ nom: string; email: string }>(
    `select name nom, email from app_user where id = $1`, [input.userId],
  );
  const corps = [
    `Bonjour ${dest.nom},`,
    '',
    `Dans le cadre de la mission « ${eng.name} », nous vous proposons un échange`,
    `le ${debut.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} de ${debut.toISOString().slice(11, 16)} à ${fin.toISOString().slice(11, 16)} (UTC).`,
    `Objet : ${input.objet.trim()}`,
    '',
    `En copie : ${copies.map((c) => `${c.nom} (${c.titre})`).join(', ')}.`,
    '',
    `${organisateur.nom}, pour la mission.`,
  ].join('\n');
  const row = await q1<{ id: string }>(
    `insert into meeting_invitation (engagement_id, objet, debut, fin, destinataire_contact_id, copies, corps, ics, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,'',$8) returning id`,
    [input.engagementId, input.objet.trim(), debut.toISOString(), fin.toISOString(),
     dest.id, JSON.stringify(copies), corps, input.userId],
  );
  const ics = genererIcs({
    uid: `${row.id}@otto.example`,
    tampon: await now(),
    debut, fin,
    objet: input.objet.trim(),
    description: corps,
    organisateur: { nom: organisateur.nom, email: organisateur.email },
    participants: [{ nom: dest.nom, email: dest.email }, ...copies.map((c) => ({ nom: c.nom, email: c.email }))],
  });
  await q(`update meeting_invitation set ics = $2 where id = $1`, [row.id, ics]);
  await logEvent({
    tenantId: eng.tenant_id, engagementId: input.engagementId, actorKind: 'user', actorId: input.userId,
    verb: 'reunion.creneau_choisi', objectType: 'meeting_invitation', objectId: row.id,
    payload: { debut: debut.toISOString(), fin: fin.toISOString(), destinataire: dest.email, copies: copies.length },
  });
  return row.id;
}

export async function envoyer(invitationId: string, userId: string): Promise<{ remis: boolean; detail: string }> {
  const inv = await q1<{ id: string; engagement_id: string; statut: string; objet: string; corps: string; ics: string; copies: Copie[]; destinataire_contact_id: string }>(
    `select id, engagement_id, statut, objet, corps, ics, copies, destinataire_contact_id from meeting_invitation where id = $1`,
    [invitationId],
  );
  if (inv.statut !== 'choisie') throw new Error('invitation : déjà envoyée (simulée) — on n\'envoie pas deux fois');
  const dest = await q1<{ email: string }>(`select email from client_contact where id = $1`, [inv.destinataire_contact_id]);
  const transport = getTransportInvitation();
  const res = await transport.envoyer(
    [dest.email, ...inv.copies.map((c) => c.email)], inv.objet, inv.corps, inv.ics,
  );
  const ctx = await ctxEng(inv.engagement_id);
  await q(
    `update meeting_invitation set statut = 'envoyee_simulee', sent_by = $2, sent_at = now() where id = $1`,
    [invitationId, userId],
  );
  await logEvent({
    tenantId: ctx.tenant_id, engagementId: inv.engagement_id, actorKind: 'user', actorId: userId,
    verb: 'reunion.envoi_simule', objectType: 'meeting_invitation', objectId: invitationId,
    payload: { transport: transport.name, remis: res.remis },
  });
  return res;
}

export async function invitations(engagementId: string) {
  return q<{ id: string; objet: string; debut: string; fin: string; statut: string; corps: string; copies: Copie[]; destinataire: string; created_at: string }>(
    `select i.id::text id, i.objet, i.debut::text debut, i.fin::text fin, i.statut, i.corps, i.copies,
            cc.name destinataire, i.created_at::text created_at
     from meeting_invitation i join client_contact cc on cc.id = i.destinataire_contact_id
     where i.engagement_id = $1 order by i.created_at desc`,
    [engagementId],
  );
}
