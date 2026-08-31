import { q } from '@/lib/db/client';

// MES TRAVAUX — le point d'origine qui manquait (constat de la revue hostile,
// tranche 9).
//
// Le mandat mesure la navigation « en trois clics depuis Mes travaux ». Cet
// écran n'existait nulle part : le critère portait sur un point de départ
// absent, et personne ne l'avait vu parce que personne ne l'avait cherché.
// Le voici — DÉRIVÉ, sans une table de plus : ce qui attend quelqu'un se lit
// déjà dans les notes qui lui sont adressées, dans les papiers qui attendent
// un visa, et dans les demandes au client dont l'échéance est passée.
//
// CE QUE CET ÉCRAN NE PRÉTEND PAS SAVOIR : qui, dans l'équipe, doit poser
// QUEL visa. Le produit ne modélise pas encore ce droit (le rôle de mission
// est partner/manager/senior/staff, l'ordre de visa est
// préparateur → réviseur → associé, et rien ne relie formellement les deux).
// La ligne dit donc « en attente du visa X » sur MES dossiers, sans affirmer
// que c'est à moi de le poser. Mieux vaut une ligne honnête qu'une
// attribution inventée (règle 13).

export type NatureTravail = 'note' | 'visa' | 'demande';

export interface LigneTravail {
  nature: NatureTravail;
  engagementId: string;
  mission: string;
  titre: string;
  detail: string;
  /** La destination : UN clic depuis cet écran mène à l'objet. */
  href: string;
  /** La date qui compte pour cette nature (pose, échéance). */
  quand: string | null;
  retard: boolean;
}

const ORDRE_VISA = ['preparer_validator', 'reviewer', 'partner'] as const;
const NOM_VISA: Record<string, string> = {
  preparer_validator: 'préparateur', reviewer: 'réviseur', partner: 'associé',
};

export async function mesTravaux(userId: string): Promise<LigneTravail[]> {
  const lignes: LigneTravail[] = [];

  /* 1. LES NOTES QUI M'ATTENDENT — les seules vraiment ATTRIBUÉES dans le
        produit : une note porte son destinataire. */
  const notes = await q<{
    id: string; engagement_id: string; mission: string; text: string;
    note_type: string; created_at: string; auteur: string;
  }>(
    `select n.id::text, n.engagement_id::text, e.name mission, n.text,
            n.note_type, n.created_at::text, a.name auteur
     from review_note n
     join engagement e on e.id = n.engagement_id
     join engagement_member m on m.engagement_id = n.engagement_id and m.user_id = $1
     join app_user a on a.id = n.author_id
     where n.assignee_id = $1 and n.assignee_kind = 'user' and n.status = 'open'
     order by n.created_at`,
    [userId],
  );
  for (const n of notes) {
    lignes.push({
      nature: 'note', engagementId: n.engagement_id, mission: n.mission,
      titre: n.text.length > 90 ? `${n.text.slice(0, 90)}…` : n.text,
      detail: `note de ${n.auteur}${n.note_type === 'a_corriger' ? ' — bloquante pour le visa' : ''}`,
      href: `/eng/${n.engagement_id}/notes`,
      quand: n.created_at.slice(0, 10),
      retard: n.note_type === 'a_corriger',
    });
  }

  /* 2. LES PAPIERS QUI ATTENDENT UN VISA sur mes dossiers. */
  const papiers = await q<{
    id: string; engagement_id: string; mission: string; code: string; title: string;
    status: string; poses: string | null;
  }>(
    `select w.id::text, w.engagement_id::text, e.name mission, w.code, w.title, w.status,
            (select string_agg(s.sign_role, ',') from signoff s where s.workpaper_id = w.id) poses
     from workpaper w
     join engagement e on e.id = w.engagement_id
     join engagement_member m on m.engagement_id = w.engagement_id and m.user_id = $1
     where w.status in ('draft','in_review','reviewed')
     order by e.name, w.code`,
    [userId],
  );
  for (const p of papiers) {
    const poses = new Set((p.poses ?? '').split(',').filter(Boolean));
    const attendu = ORDRE_VISA.find((r) => !poses.has(r));
    if (!attendu) continue;
    lignes.push({
      nature: 'visa', engagementId: p.engagement_id, mission: p.mission,
      titre: `${p.code} — ${p.title}`,
      detail: `en attente du visa ${NOM_VISA[attendu]}`,
      href: `/eng/${p.engagement_id}/workpapers/${p.id}`,
      quand: null, retard: false,
    });
  }

  /* 3. LES DEMANDES AU CLIENT DONT L'ÉCHÉANCE EST PASSÉE. */
  const demandes = await q<{
    id: string; engagement_id: string; mission: string; seq_no: number;
    title: string; due_date: string; status: string;
  }>(
    `select r.id::text, r.engagement_id::text, e.name mission, r.seq_no, r.title,
            r.due_date::text, r.status
     from request r
     join engagement e on e.id = r.engagement_id
     join engagement_member m on m.engagement_id = r.engagement_id and m.user_id = $1
     where r.status in ('sent','partially_submitted','reopened')
       and r.due_date is not null and r.due_date < current_date
     order by r.due_date`,
    [userId],
  );
  for (const d of demandes) {
    lignes.push({
      nature: 'demande', engagementId: d.engagement_id, mission: d.mission,
      titre: `R-${String(d.seq_no).padStart(3, '0')} — ${d.title}`,
      detail: `échéance dépassée · ${d.status === 'partially_submitted' ? 'partiellement reçue' : 'sans réponse complète'}`,
      href: `/eng/${d.engagement_id}/requests/${d.id}`,
      quand: d.due_date, retard: true,
    });
  }

  /* Ce qui est en retard d'abord, puis le plus ancien : l'ordre d'une liste
     de travail est une décision, pas un hasard de requête. */
  return lignes.sort((a, b) =>
    Number(b.retard) - Number(a.retard) || (a.quand ?? '9999').localeCompare(b.quand ?? '9999'));
}
