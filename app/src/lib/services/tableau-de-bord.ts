import { q, q01 } from '@/lib/db/client';
import { mesTravaux, type LigneTravail } from './travaux';
import { obstaclesAuVisa, type Obstacle } from './obstacles';
import { postesRetenus } from './rail';

// LA VUE D'ENSEMBLE EST UN TABLEAU DE BORD (R-04, ADR-112).
//
// Ce qu'elle montrait : le pack de référentiel, deux échéances légales et la
// composition de l'équipe — trois choses vraies dont aucune ne dit ce qu'il y
// a à faire aujourd'hui. La revue utilisateur n°1 l'a jugée inutile, et elle
// avait raison : une page d'accueil de dossier qui ne dit pas « voilà ce qui
// t'attend » fait perdre le premier clic à tout le monde.
//
// Ce qu'elle montre maintenant, dans cet ordre : CE QUI M'ATTEND, MOI (les
// notes qui me sont adressées, les papiers qui attendent un visa, les
// demandes échues) ; l'avancement par poste ; qui porte quoi dans l'équipe ;
// ce qui empêche de signer.
//
// TOUT EST DÉRIVÉ. Aucun statut d'avancement n'est stocké : un pourcentage
// tenu à part diverge un jour de ce qu'il compte, et c'est toujours le
// pourcentage qu'on croit.

export interface AvancementPoste {
  code: string;
  name: string;
  /** Éléments tirés, et ceux qui sont contrôlés. */
  items: number;
  testes: number;
  ecarts: number;
  pct: number;
}

export interface ChargePersonne {
  userId: string;
  nom: string;
  role: string;
  /** Notes de revue ouvertes qui lui sont adressées. */
  notes: number;
  /** Dont bloquantes pour le visa. */
  bloquantes: number;
  /** Notes qu'il a POSÉES et qui ne sont pas encore closes. */
  posees: number;
}

export interface NoteRedigee {
  id: string;
  texte: string;
  type: string;
  auteur: string;
  destinataire: string | null;
  quand: string;
}

export interface TableauDeBord {
  moi: LigneTravail[];
  postes: AvancementPoste[];
  equipe: ChargePersonne[];
  notes: NoteRedigee[];
  obstacles: Obstacle[];
  demandes: { total: number; ouvertes: number; echues: number; recues: number };
  papiers: { total: number; signes: number; enRevue: number; brouillons: number };
}

const n = (v: unknown) => Number(v ?? 0);

export async function tableauDeBord(engagementId: string, userId: string): Promise<TableauDeBord> {
  /* CE QUI M'ATTEND — la MÊME dérivation que « Mes travaux » (ADR-110),
     restreinte à ce dossier. Deux calculs de « ce qui m'attend »
     divergeraient, et ce serait toujours celui qu'on regarde. */
  const moi = (await mesTravaux(userId)).filter((l) => l.engagementId === engagementId);

  const postes: AvancementPoste[] = [];
  for (const p of await postesRetenus(engagementId)) {
    const r = await q01<{ items: string; testes: string; ecarts: string }>(
      `select
         (select count(*) from sample_item i join sample s on s.id = i.sample_id
          join procedure_instance pi on pi.id = s.procedure_id
          where pi.engagement_id = $1 and pi.fsli_code = $2 and s.status = 'drawn')::text items,
         (select count(*) from sample_item i join sample s on s.id = i.sample_id
          join procedure_instance pi on pi.id = s.procedure_id
          where pi.engagement_id = $1 and pi.fsli_code = $2 and s.status = 'drawn'
            and i.status in ('tested','complete','exception'))::text testes,
         (select count(*) from exception x join sample_item i on i.id = x.sample_item_id
          join sample s on s.id = i.sample_id join procedure_instance pi on pi.id = s.procedure_id
          where pi.engagement_id = $1 and pi.fsli_code = $2
            and x.status not in ('resolved','scope_limitation'))::text ecarts`,
      [engagementId, p.code]);
    const items = n(r?.items);
    postes.push({
      code: p.code, name: p.name, items, testes: n(r?.testes), ecarts: n(r?.ecarts),
      pct: items === 0 ? 0 : Math.round((n(r?.testes) / items) * 100),
    });
  }

  /* QUI PORTE QUOI. Le produit ne modélise pas encore « qui doit poser quel
     visa » — le rôle de mission et l'ordre des visas ne sont pas reliés. Il
     sait en revanche à qui une note est ADRESSÉE et qui l'a POSÉE : ce sont
     les deux seules attributions nominatives réelles, et ce sont donc les
     deux seules colonnes. Inventer la troisième serait plus grave que de
     l'avouer (règle 13). */
  const equipe = await q<{ user_id: string; nom: string; role: string; notes: string; bloquantes: string; papiers: string }>(
    `select u.id::text user_id, u.name nom, m.eng_role role,
            (select count(*) from review_note x
             where x.engagement_id = $1 and x.assignee_kind = 'user'
               and x.assignee_id = u.id and x.status = 'open')::text notes,
            (select count(*) from review_note x
             where x.engagement_id = $1 and x.assignee_kind = 'user'
               and x.assignee_id = u.id and x.status = 'open' and x.note_type = 'a_corriger')::text bloquantes,
            (select count(*) from review_note x
             where x.engagement_id = $1 and x.author_id = u.id and x.status = 'open')::text papiers
     from engagement_member m
     join app_user u on u.id = m.user_id
     where m.engagement_id = $1
     order by u.name`,
    [engagementId]);

  const notes = (await q<{ id: string; text: string; note_type: string; auteur: string; destinataire: string | null; created_at: string }>(
    `select x.id::text, x.text, x.note_type, a.name auteur, d.name destinataire, x.created_at::text
     from review_note x
     join app_user a on a.id = x.author_id
     left join app_user d on d.id = x.assignee_id
     where x.engagement_id = $1 and x.status = 'open'
     order by (x.note_type = 'a_corriger') desc, x.created_at desc
     limit 8`, [engagementId])).map((x) => ({
    id: x.id, texte: x.text, type: x.note_type, auteur: x.auteur,
    destinataire: x.destinataire, quand: x.created_at.slice(0, 10),
  }));

  const demandes = await q01<{ total: string; ouvertes: string; echues: string; recues: string }>(
    `select count(*)::text total,
            count(*) filter (where status in ('sent','partially_submitted','reopened'))::text ouvertes,
            count(*) filter (where status in ('sent','partially_submitted','reopened')
                               and due_date is not null and due_date < current_date)::text echues,
            count(*) filter (where status = 'submitted')::text recues
     from request where engagement_id = $1`, [engagementId]);

  const papiers = await q01<{ total: string; signes: string; en_revue: string; brouillons: string }>(
    `select count(*)::text total,
            count(*) filter (where status = 'signed')::text signes,
            count(*) filter (where status in ('in_review','reviewed'))::text en_revue,
            count(*) filter (where status = 'draft')::text brouillons
     from workpaper where engagement_id = $1`, [engagementId]);

  return {
    moi, postes, notes,
    equipe: equipe.map((e) => ({
      userId: e.user_id, nom: e.nom, role: e.role,
      notes: n(e.notes), bloquantes: n(e.bloquantes), posees: n(e.papiers),
    })),
    obstacles: await obstaclesAuVisa(engagementId),
    demandes: {
      total: n(demandes?.total), ouvertes: n(demandes?.ouvertes),
      echues: n(demandes?.echues), recues: n(demandes?.recues),
    },
    papiers: {
      total: n(papiers?.total), signes: n(papiers?.signes),
      enRevue: n(papiers?.en_revue), brouillons: n(papiers?.brouillons),
    },
  };
}
