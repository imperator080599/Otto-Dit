import { q, q01 } from '@/lib/db/client';
import { missionN1 } from '../engagement';

// L'ANCRE D'UNE NOTE DE REVUE EST L'IDENTITÉ MÉTIER DE L'OBJET, JAMAIS UNE
// POSITION À L'ÉCRAN (ADR-097). « Ligne 12 colonne 4 » se casse au prochain
// tirage, au prochain recalcul, au prochain ré-import ; « l'écriture
// VE|0706|1, champ date » survit à tout cela. Quand l'objet a VRAIMENT
// disparu (élément sorti de l'échantillon au re-tirage), la note ne disparaît
// pas : son état devient « objet retiré » — DÉRIVÉ ici à la lecture, pas
// stocké, parce qu'un drapeau stocké mentirait au recalcul suivant.

export type AncreKind = 'sample_item' | 'workpaper_section' | 'questionnaire_answer'
  | 'materiality_param' | 'exception' | 'compte' | 'papier' | 'analytique' | 'process_model'
  | 'process_step' | 'control' | 'control_task' | 'assertion_risk' | 'transcript' | 'proposition'
  | 'fs_line';

export interface Ancre {
  kind: AncreKind;
  /** L'identité MÉTIER : natural_key d'écriture, code:section de papier,
   *  code de question, nom de paramètre. */
  ref: string;
  /** Le champ précis, s'il y a lieu (colonne du tableau de testing). */
  field: string | null;
  /** L'étiquette humaine, figée à la pose — elle reste lisible même retirée. */
  label: string;
}

export type EtatAncre = 'present' | 'retire';

export interface AncreResolue {
  etat: EtatAncre;
  /** Les objets ACTUELS qui portent l'ancre — ids de lignes vivantes, pour
   *  marquer l'écran. Une double comptabilisation peut en rendre deux :
   *  le marqueur se montre sur chacune, c'est honnête. */
  cibles: string[];
}

export const KINDS: Record<AncreKind, string> = {
  sample_item: 'élément d\'échantillon',
  workpaper_section: 'section de papier de travail',
  questionnaire_answer: 'réponse de questionnaire',
  materiality_param: 'paramètre de seuils',
  exception: 'écart (exception)',
  /* LA CELLULE DE LEADSHEET (mandat de la soirée, §2.2 et §5) : un compte dans
     son poste — « 706000, solde N ». L'identité est le code du poste et le
     numéro de compte, jamais la ligne du tableau ; le champ dit quelle
     colonne (solde, solde N-1, variation). */
  compte: 'compte de la leadsheet',
  /* LE PAPIER LUI-MÊME (P1-02, AUD-02, migration 0172). Remplace `ecran` —
     retiré, jamais atteignable par aucun écran de ce dépôt (vérifié avant
     retrait, en-tête de 0172_sections_et_notes.sql). Une note flottante
     (aucune ancre métier, un papier de travail attaché) s'ancre désormais ICI
     plutôt que de rester sans ancre — `addReviewNote` le fait automatiquement. */
  papier: 'papier de travail',
  analytique: 'revue analytique du poste',
  process_model: 'modèle de processus',
  process_step: 'étape de processus',
  control: 'contrôle interne',
  control_task: 'tâche de contrôle',
  assertion_risk: 'risque par assertion',
  transcript: 'transcript d\'entretien',
  proposition: 'proposition (IA/moteur)',
  fs_line: 'ligne des états financiers',
};

/**
 * Résout une ancre CONTRE L'ÉTAT ACTUEL du dossier. C'est le seul juge de
 * « présent » contre « objet retiré » — les écrans et la vue transverse le
 * consultent, aucun n'a sa propre opinion.
 */
export async function resoudreAncre(engagementId: string, a: Ancre): Promise<AncreResolue> {
  switch (a.kind) {
    case 'sample_item': {
      /* L'échantillon COURANT (status drawn), rejoint par l'identité naturelle
         de l'écriture — natural_key survit aux ré-imports (Gate 2) et un
         re-tirage qui reprend la même écriture reprend la note à son bord. */
      const rows = await q<{ id: string }>(
        `select si.id::text id from sample_item si
         join sample s on s.id = si.sample_id
         join gl_entry g on g.id = si.unit_id
         where s.engagement_id = $1 and s.status = 'drawn'
           and si.unit_kind = 'gl_entry' and g.natural_key = $2`,
        [engagementId, a.ref],
      );
      return { etat: rows.length ? 'present' : 'retire', cibles: rows.map((r) => r.id) };
    }
    case 'workpaper_section': {
      /* code du papier + clé de section : survit aux versions successives du
         papier (un redraft garde le code). Retiré si le gabarit du cabinet ne
         produit plus cette section. */
      const [code, section] = decoupeRef(a.ref);
      const wp = await q01<{ id: string; sections: unknown }>(
        `select id::text id, sections from workpaper
         where engagement_id = $1 and code = $2 and status <> 'outdated'
         order by version desc limit 1`,
        [engagementId, code],
      );
      const porte = Array.isArray(wp?.sections)
        && (wp!.sections as { key?: string }[]).some((s) => s.key === section);
      return { etat: porte ? 'present' : 'retire', cibles: porte ? [`${code}:${section}`] : [] };
    }
    case 'questionnaire_answer': {
      const row = await q01<{ id: string }>(
        `select id::text id from risk_question_answer
         where engagement_id = $1 and question_code = $2
         order by answered_at desc limit 1`,
        [engagementId, a.ref],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [a.ref] : [] };
    }
    case 'exception': {
      /* L'identité MÉTIER d'un écart : sa taxonomie + l'écriture qui le porte
         (natural_key — survit aux ré-imports et aux re-tirages, comme les
         cellules). « Pourquoi as-tu considéré celui-ci comme résolu ? » doit
         suivre L'ÉCART, pas le uuid d'une ligne recalculable. Les écarts sans
         écriture (rapprochement, import) s'ancrent par leur id, préfixé —
         leur recomposition ne les recrée pas. */
      if (a.ref.startsWith('id|')) {
        const row = await q01<{ id: string }>(
          `select id::text id from exception where engagement_id = $1 and id::text = $2`,
          [engagementId, a.ref.slice(3)],
        );
        return { etat: row ? 'present' : 'retire', cibles: row ? [row.id] : [] };
      }
      /* Le séparateur est le PREMIER « | » : la natural_key en contient
         elle-même (journal|pièce|ligne), on ne coupe qu'une fois. */
      const coupe = a.ref.indexOf('|');
      const taxo = coupe < 0 ? a.ref : a.ref.slice(0, coupe);
      const cle = coupe < 0 ? '' : a.ref.slice(coupe + 1);
      const rows = await q<{ id: string }>(
        `select x.id::text id from exception x
         join sample_item si on si.id = x.sample_item_id
         join gl_entry g on g.id = si.unit_id
         where x.engagement_id = $1 and x.taxonomy_code = $2 and g.natural_key = $3`,
        [engagementId, taxo, cle],
      );
      return { etat: rows.length ? 'present' : 'retire', cibles: rows.map((r) => r.id) };
    }
    case 'papier': {
      /* Le papier lui-même (remplace `ecran`, retiré — 0172) : présent tant
         que le workpaper existe et n'est pas dépassé (une version outdated
         reste lisible, mais n'est plus la section de travail — même doctrine
         que `sections.ts::SANS_PAPIER_DEPASSE`). */
      const wp = await q01<{ id: string }>(
        `select id::text id from workpaper where engagement_id = $1 and id::text = $2 and status <> 'outdated'`,
        [engagementId, a.ref],
      );
      return { etat: wp ? 'present' : 'retire', cibles: wp ? [wp.id] : [] };
    }
    case 'analytique': {
      /* La revue analytique d'un poste (0130) : présente tant qu'au moins une
         version existe pour ce poste — la ref est le CODE du poste, jamais un
         id de version (une nouvelle version ne retire pas la note, elle
         change ce que « la revue analytique » désigne, migration 0130). */
      const row = await q01<{ id: string }>(
        `select id::text id from fsli_analytique where engagement_id = $1 and fsli_code = $2
         order by version desc limit 1`,
        [engagementId, a.ref],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [a.ref] : [] };
    }
    case 'process_model': {
      /* `cycle_ref:exercice` — la clé unique du modèle (0027). */
      const [cycleRef, exercice] = decoupeRef(a.ref);
      const row = await q01<{ id: string }>(
        `select id::text id from process_model where engagement_id = $1 and cycle_ref = $2 and exercice = $3`,
        [engagementId, cycleRef, exercice],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [row.id] : [] };
    }
    case 'process_step': {
      /* `cycle_ref:exercice:code_etape` — l'étape est stable d'une version à
         l'autre du modèle (0027, commentaire de `process_step.code`). */
      const parts = a.ref.split(':');
      const [cycleRef, exercice, codeEtape] = parts.length === 3 ? parts : ['', '', ''];
      const row = await q01<{ id: string }>(
        `select ps.id::text id from process_step ps join process_model pm on pm.id = ps.process_id
         where pm.engagement_id = $1 and pm.cycle_ref = $2 and pm.exercice = $3 and ps.code = $4`,
        [engagementId, cycleRef, exercice, codeEtape],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [row.id] : [] };
    }
    case 'control': {
      /* Le code du contrôle (`control(engagement_id, code)` unique, 0002) —
         le même identifiant que le catalogue RCM affiche partout ailleurs. */
      const row = await q01<{ id: string }>(
        `select id::text id from control where engagement_id = $1 and code = $2`,
        [engagementId, a.ref],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [row.id] : [] };
    }
    case 'control_task': {
      /* `code_controle:seq_no` — la tâche d'un contrôle (0148). */
      const [codeControle, seq] = decoupeRef(a.ref);
      const row = await q01<{ id: string }>(
        `select ct.id::text id from control_task ct join control c on c.id = ct.control_id
         where c.engagement_id = $1 and c.code = $2 and ct.seq_no = $3::int`,
        [engagementId, codeControle, seq],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [row.id] : [] };
    }
    case 'assertion_risk': {
      /* `fsli_code:assertion` — la paire, pas l'id : le niveau est RE-DÉRIVÉ à
         chaque évaluation (0012, commentaire de `computed_level`), l'identité
         métier survit à une ré-évaluation, un id de ligne n'y survivrait pas. */
      const [fsliCode, assertion] = decoupeRef(a.ref);
      const row = await q01<{ id: string }>(
        `select id::text id from fsli_assertion_risk where engagement_id = $1 and fsli_code = $2 and assertion = $3`,
        [engagementId, fsliCode, assertion],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [a.ref] : [] };
    }
    case 'transcript': {
      /* Le transcript d'entretien (0027) — identifié par l'entretien
         (`interview_id`, unique sur `interview_transcript`). */
      const row = await q01<{ id: string }>(
        `select id::text id from interview_transcript where interview_id = $1
         and interview_id in (select id from process_interview where engagement_id = $2)`,
        [a.ref, engagementId],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [row.id] : [] };
    }
    case 'proposition': {
      /* La ligne `proposition` elle-même (0170) — un id direct : cette table
         n'est jamais recalculée en place, une nouvelle proposition est une
         nouvelle ligne (`propositions.ts`, ETANCH-04). */
      const row = await q01<{ id: string }>(
        `select id::text id from proposition where engagement_id = $1 and id::text = $2`,
        [engagementId, a.ref],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [row.id] : [] };
    }
    case 'fs_line': {
      /* `statement:ref` — la clé unique de la ligne (0019). */
      const [statement, ref] = decoupeRef(a.ref);
      const row = await q01<{ id: string }>(
        `select id::text id from fs_line where engagement_id = $1 and statement = $2 and ref = $3`,
        [engagementId, statement, ref],
      );
      return { etat: row ? 'present' : 'retire', cibles: row ? [row.id] : [] };
    }
    case 'compte': {
      /* Présent tant que le compte figure sur une balance ACTIVE du dossier (N
         ou comparative) ou sur la balance du dossier N-1 : un compte soldé
         cette année reste une cellule de la leadsheet (colonne N-1). */
      const coupe = a.ref.indexOf('|');
      const numero = coupe < 0 ? a.ref : a.ref.slice(coupe + 1);
      const ici = await q01<{ n: string }>(
        `select count(*)::text n from account x join tb_snapshot s on s.id = x.tb_snapshot_id
         where s.engagement_id = $1 and s.status = 'active' and x.number = $2`,
        [engagementId, numero],
      );
      let present = Number(ici?.n ?? 0) > 0;
      if (!present) {
        const n1 = await missionN1(engagementId);
        if (n1) {
          const la = await q01<{ n: string }>(
            `select count(*)::text n from account x join tb_snapshot s on s.id = x.tb_snapshot_id
             where s.engagement_id = $1 and s.status = 'active' and x.number = $2`,
            [n1.id, numero],
          );
          present = Number(la?.n ?? 0) > 0;
        }
      }
      return { etat: present ? 'present' : 'retire', cibles: present ? [a.ref] : [] };
    }
    case 'materiality_param': {
      /* Un jeu de seuils existe → le paramètre existe. Retiré seulement si la
         mission n'a plus aucun jeu de seuils (jamais vu, mais dérivé, pas nié). */
      const set = await q01<{ id: string }>(
        `select id::text id from materiality where engagement_id = $1
         order by version desc limit 1`,
        [engagementId],
      );
      return { etat: set ? 'present' : 'retire', cibles: set ? [a.ref] : [] };
    }
  }
}

function decoupeRef(ref: string): [string, string] {
  const i = ref.indexOf(':');
  return i < 0 ? [ref, ''] : [ref.slice(0, i), ref.slice(i + 1)];
}

/**
 * Valide une ancre À LA POSE : une note ne se pose que sur un objet qui
 * existe MAINTENANT. Poser une note sur un objet imaginaire serait la
 * position d'écran par un autre chemin.
 */
export async function assertAncrePosable(engagementId: string, a: Ancre): Promise<void> {
  if (!KINDS[a.kind]) throw new Error(`ancre : type « ${a.kind} » inconnu`);
  if (!a.ref.trim()) throw new Error('ancre : référence vide');
  if (!a.label.trim()) throw new Error('ancre : étiquette vide');
  const r = await resoudreAncre(engagementId, a);
  if (r.etat !== 'present') {
    throw new Error(
      `ancre : aucun objet « ${KINDS[a.kind]} » ne porte la référence « ${a.ref} » `
      + 'dans l\'état actuel du dossier — une note se pose sur un objet qui existe',
    );
  }
}
