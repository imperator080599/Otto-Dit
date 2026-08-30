import { q, q01 } from '@/lib/db/client';

// L'ANCRE D'UNE NOTE DE REVUE EST L'IDENTITÉ MÉTIER DE L'OBJET, JAMAIS UNE
// POSITION À L'ÉCRAN (ADR-097). « Ligne 12 colonne 4 » se casse au prochain
// tirage, au prochain recalcul, au prochain ré-import ; « l'écriture
// VE|0706|1, champ date » survit à tout cela. Quand l'objet a VRAIMENT
// disparu (élément sorti de l'échantillon au re-tirage), la note ne disparaît
// pas : son état devient « objet retiré » — DÉRIVÉ ici à la lecture, pas
// stocké, parce qu'un drapeau stocké mentirait au recalcul suivant.

export type AncreKind = 'sample_item' | 'workpaper_section' | 'questionnaire_answer' | 'materiality_param';

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
