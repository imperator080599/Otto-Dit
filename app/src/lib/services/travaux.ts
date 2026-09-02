import { q } from '@/lib/db/client';
import type { CleLibelle } from '@/lib/i18n/catalogue';
import { motif, type Motif } from './motif';
import { obstaclesAuVisa, type Famille } from './obstacles';
import { mesSections, type MesSections, type Section } from './sections';
import { numeroDemande } from './requests';

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
// ET DEPUIS LA NUIT (Groupe 1, 1.2) : LE TABLEAU DE BORD ENTIER, HORS RAIL.
// Mes sections (dans mon camp, attribuées, suivies, ouvertes récemment) sur
// TOUS mes dossiers, ce qui empêche le visa sur chacun d'eux compté par
// famille, et les notes ouvertes par ancienneté. Rien n'y est stocké non plus :
// les sections viennent du service des sections, les obstacles du même calcul
// que l'écran des obstacles du dossier, les notes d'une seule requête. Un
// tableau de bord qui tiendrait ses propres chiffres divergerait un jour de
// ceux du dossier — et c'est toujours le tableau de bord qu'on croit.
//
// CE QUE CET ÉCRAN NE PRÉTEND PAS SAVOIR : qui, dans l'équipe, doit poser
// QUEL visa. Le produit ne modélise pas encore ce droit (le rôle de mission
// est partner/manager/senior/staff, l'ordre de visa est
// préparateur → réviseur → associé, et rien ne relie formellement les deux).
// La ligne dit donc « en attente du visa X » sur MES dossiers, sans affirmer
// que c'est à moi de le poser. Mieux vaut une ligne honnête qu'une
// attribution inventée (règle 13).
//
// CE QU'IL NE REGARDE PAS : l'ancienneté des notes est en jours CALENDAIRES
// (les jours ouvrés sont l'affaire de la file de revue, 1.4) ; les dossiers
// SCELLÉS ou archivés n'y figurent pas — ni obstacles, ni sections, ni notes
// (il n'y reste rien à faire) ; et il ne recalcule pas les sections d'un
// dossier dont la vue d'ensemble n'a jamais été ouverte — elles naissent là,
// pas ici.

export type NatureTravail = 'note' | 'visa' | 'demande';

export interface LigneTravail {
  nature: NatureTravail;
  engagementId: string;
  mission: string;
  titre: string;
  /** Où en est-ce — une CLÉ et ses variables, jamais une phrase (revue n°3).
   *  La phrase française qui vivait ici (« en attente du visa réviseur »)
   *  était rendue telle quelle sur l'instance anglaise, et le détecteur de
   *  langue ne la voyait pas : un gabarit `detail:` n'était ni un nœud JSX
   *  ni un libellé qu'il lisait. */
  detail: Motif;
  /** La destination : UN clic depuis cet écran mène à l'objet. */
  href: string;
  /** La date qui compte pour cette nature (pose, échéance). */
  quand: string | null;
  retard: boolean;
}

const ORDRE_VISA = ['preparer_validator', 'reviewer', 'partner'] as const;
type RoleVisa = (typeof ORDRE_VISA)[number];
const NOM_VISA: Record<RoleVisa, CleLibelle> = {
  preparer_validator: 'visa.role.preparer_validator',
  reviewer: 'visa.role.reviewer',
  partner: 'visa.role.partner',
};

/* LE CABINET, EN PLUS DE L'APPARTENANCE : les quatre lectures filtraient sur
   `engagement_member` seul ; une ligne d'appartenance fausse en base aurait
   affiché un dossier étranger avec son nom (revue hostile n°5). Et les
   dossiers SCELLÉS ou archivés sortent de TOUT le tableau de bord, pas
   seulement des obstacles — l'écran le dit une fois pour toutes. */
const CABINET = `e.tenant_id = (select tenant_id from app_user where id = $1)`;
const OUVERT = `e.status not in ('locked', 'archived')`;

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
       and ${CABINET}
     order by n.created_at`,
    [userId],
  );
  for (const n of notes) {
    lignes.push({
      nature: 'note', engagementId: n.engagement_id, mission: n.mission,
      titre: n.text.length > 90 ? `${n.text.slice(0, 90)}…` : n.text,
      detail: motif(n.note_type === 'a_corriger' ? 'trav.detail.noteBloquante' : 'trav.detail.note',
        { auteur: n.auteur }),
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
     where w.status in ('draft','in_review','reviewed') and ${CABINET}
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
      detail: motif('trav.detail.visa', { role: { cle: NOM_VISA[attendu] } }),
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
     where r.status in ('sent','partially_submitted','reopened') and ${CABINET}
       and r.due_date is not null and r.due_date < current_date
     order by r.due_date`,
    [userId],
  );
  for (const d of demandes) {
    lignes.push({
      nature: 'demande', engagementId: d.engagement_id, mission: d.mission,
      titre: `${numeroDemande(d.seq_no)} — ${d.title}`,
      detail: motif(d.status === 'partially_submitted'
        ? 'trav.detail.demandePartielle' : 'trav.detail.demandeSansReponse'),
      href: `/eng/${d.engagement_id}/requests/${d.id}`,
      quand: d.due_date, retard: true,
    });
  }

  /* Ce qui est en retard d'abord, puis le plus ancien : l'ordre d'une liste
     de travail est une décision, pas un hasard de requête. */
  return lignes.sort((a, b) =>
    Number(b.retard) - Number(a.retard) || (a.quand ?? '9999').localeCompare(b.quand ?? '9999'));
}

// ── LE TABLEAU DE BORD (1.2) ─────────────────────────────────────────────────

/** Un de mes dossiers, et ce qui y empêche le visa, compté par famille — dans
 *  l'ordre du dossier, celui que rend la liste unique des obstacles. */
export interface ObstaclesDossier {
  engagementId: string;
  mission: string;
  familles: { famille: Famille; n: number; href: string }[];
}

/**
 * Les obstacles au visa de CHACUN de mes dossiers ouverts, par le même calcul
 * que l'écran des obstacles du dossier — jamais une seconde liste.
 *
 * Le coût est celui de ce calcul, dossier par dossier : quelques dizaines de
 * requêtes par dossier, et davantage par poste retenu (le questionnaire et la
 * boucle en font plusieurs chacun). Sur les quelques dossiers d'une personne,
 * c'est la seconde ; on ne le cache pas derrière un compteur stocké qui
 * mentirait dès la prochaine action. Le chiffre exact n'est pas publié : il
 * n'a pas de commande qui le rejoue.
 */
export async function obstaclesDeMesDossiers(userId: string): Promise<ObstaclesDossier[]> {
  const dossiers = await q<{ id: string; mission: string }>(
    `select e.id::text, e.name mission
     from engagement e
     join engagement_member m on m.engagement_id = e.id and m.user_id = $1
     where ${OUVERT} and ${CABINET}
     order by e.name`,
    [userId],
  );
  const out: ObstaclesDossier[] = [];
  for (const d of dossiers) {
    const parFamille = new Map<Famille, { n: number; ou: string }>();
    for (const o of await obstaclesAuVisa(d.id)) {
      const f = parFamille.get(o.famille) ?? { n: 0, ou: o.ou };
      f.n += 1;
      parFamille.set(o.famille, f);
    }
    out.push({
      engagementId: d.id, mission: d.mission,
      familles: [...parFamille].map(([famille, f]) => ({ famille, n: f.n, href: `/eng/${d.id}/${f.ou}` })),
    });
  }
  return out;
}

/** Les trois tranches d'ancienneté d'une note ouverte, en jours calendaires
 *  depuis sa pose : jusqu'à 7, de 8 à 30, au-delà. */
export type Anciennete = 'j7' | 'j30' | 'plus';
export const ANCIENNETES: Anciennete[] = ['j7', 'j30', 'plus'];

export interface NotesDossier {
  engagementId: string;
  mission: string;
  href: string;
  parAnciennete: Record<Anciennete, number>;
  total: number;
}

/**
 * Les notes de revue OUVERTES de mes dossiers, quel qu'en soit le destinataire,
 * par ancienneté. « Ouverte » veut dire ce que dit la vue d'ensemble du
 * dossier : `status = 'open'` — une note adressée mais non close n'y est pas
 * comptée, pour que les deux écrans donnent le même chiffre.
 * Un dossier sans note ouverte n'a pas de ligne.
 */
export async function notesOuvertesParAnciennete(userId: string): Promise<NotesDossier[]> {
  const rows = await q<{ id: string; mission: string; j7: string; j30: string; plus: string }>(
    `select e.id::text, e.name mission,
            count(n.id) filter (where n.created_at::date >= current_date - 7)::text j7,
            count(n.id) filter (where n.created_at::date <  current_date - 7
                                  and n.created_at::date >= current_date - 30)::text j30,
            count(n.id) filter (where n.created_at::date <  current_date - 30)::text plus
     from engagement e
     join engagement_member m on m.engagement_id = e.id and m.user_id = $1
     join review_note n on n.engagement_id = e.id and n.status = 'open'
     where ${OUVERT} and ${CABINET}
     group by e.id, e.name
     order by e.name`,
    [userId],
  );
  return rows.map((r) => {
    const parAnciennete = { j7: Number(r.j7), j30: Number(r.j30), plus: Number(r.plus) };
    return {
      engagementId: r.id, mission: r.mission, href: `/eng/${r.id}/notes`, parAnciennete,
      total: parAnciennete.j7 + parAnciennete.j30 + parAnciennete.plus,
    };
  });
}

export interface TableauDeBord {
  lignes: LigneTravail[];
  sections: MesSections;
  obstacles: ObstaclesDossier[];
  notes: NotesDossier[];
}

/** Tout ce que l'écran « Mes travaux » montre, en un appel. */
export async function tableauDeBord(userId: string): Promise<TableauDeBord> {
  const sections = await mesSections(userId);
  /* Les sections d'un dossier scellé sortent ici — `mesSections` sert aussi
     la vue d'ensemble DU dossier, où l'on veut les voir. */
  const ouverts = new Set((await q<{ id: string }>(
    `select e.id::text from engagement e
     join engagement_member m on m.engagement_id = e.id and m.user_id = $1
     where ${OUVERT}`, [userId])).map((r) => r.id));
  const filtre = (l: Section[]) => l.filter((s) => ouverts.has(s.engagementId));
  return {
    lignes: await mesTravaux(userId),
    sections: {
      detenues: filtre(sections.detenues), attribuees: filtre(sections.attribuees),
      suivies: filtre(sections.suivies), recentes: filtre(sections.recentes),
    },
    obstacles: await obstaclesDeMesDossiers(userId),
    notes: await notesOuvertesParAnciennete(userId),
  };
}
