import { q } from '@/lib/db/client';
import { addReviewNote, type OptionsNote } from '../workpapers/lifecycle';
import type { Ancre } from './ancres';

// P1-02 (AUD-02) : LE POINT D'ENTRÉE NOMMÉ PAR LE PLAN (§7.2). `poserNote()` délègue à
// `addReviewNote()` (workpapers/lifecycle.ts) — le même chemin, la même dérivation de
// `section_id`, le même refus NOTE-01 — sous la forme d'objet nommé que les écrans neufs
// de P1-02+ utilisent, sans dupliquer la logique d'écriture.

export interface PoserNoteOpts {
  engagementId: string;
  workpaperId?: string | null;
  ancre?: Ancre;
  texte: string;
  auteur: string;
  destinataire?: string | null;
  type?: OptionsNote['noteType'];
}

export async function poserNote(opts: PoserNoteOpts): Promise<string> {
  return addReviewNote(
    opts.engagementId, opts.workpaperId ?? null, opts.auteur, opts.destinataire ?? null, opts.texte,
    { ...(opts.ancre ? { ancre: opts.ancre } : {}), ...(opts.type ? { noteType: opts.type } : {}) },
  );
}

export interface NoteDeSection {
  id: string;
  texte: string;
  status: string;
  noteType: string;
  authorId: string;
  assigneeId: string | null;
  ancreKind: string | null;
  ancreRef: string | null;
  createdAt: string;
}

/** Les notes d'UNE section, les plus récentes d'abord — le panneau de section les lit ici,
 *  jamais par une re-résolution d'ancre à chaque écran (P3-02 construira le panneau ;
 *  cette lecture existe dès maintenant pour que rien ne la précède). */
export async function notesDeSection(sectionId: string): Promise<NoteDeSection[]> {
  return q<NoteDeSection>(
    `select id::text, text texte, status, note_type "noteType", author_id::text "authorId",
            assignee_id::text "assigneeId", anchor_kind "ancreKind", anchor_ref "ancreRef",
            created_at::text "createdAt"
     from review_note where section_id = $1 order by created_at desc`,
    [sectionId],
  );
}

interface NotePourHref {
  workpaper_id: string | null;
  anchor_kind: string | null;
  anchor_ref: string | null;
  anchor_field: string | null;
}

/**
 * LE RÉSOLVEUR UNIQUE (P1-02, §7.2) : remplace `ecranPorteur` (notes/page.tsx) et la clé
 * ad hoc de `notesPourEcran` (lifecycle.ts, ligne 291 avant ce correctif) — un seul endroit
 * qui sait où mène une note, pour la navigation ET pour le marquage d'écran.
 * Toujours un `#` (jamais vide) : `assertAncrePosable` a déjà validé l'ancre à la pose,
 * `hrefDeNote` ne re-valide rien — il route, il ne juge pas la présence de l'objet.
 */
export function hrefDeNote(engagementId: string, n: NotePourHref): string {
  const eng = `/eng/${engagementId}`;
  if (n.workpaper_id) return `${eng}/workpapers/${n.workpaper_id}`;
  const ref = n.anchor_ref ?? '';
  switch (n.anchor_kind) {
    case 'compte': return `${eng}/poste/${encodeURIComponent(ref.split('|')[0])}`;
    case 'sample_item': return `${eng}/testing`;
    case 'exception': return `${eng}/exceptions`;
    case 'questionnaire_answer': return `${eng}/risk`;
    case 'assertion_risk': return `${eng}/risk`;
    case 'materiality_param': return `${eng}/materiality`;
    case 'analytique': return `${eng}/analytique`;
    case 'process_model': case 'process_step': return `${eng}/processus`;
    case 'control': case 'control_task': return `${eng}/rcm`;
    case 'transcript': return `${eng}/processus`;
    case 'fs_line': return `${eng}/fs-tieout`;
    case 'proposition': return `${eng}/notifications`;
    default: return `${eng}/workpapers`;
  }
}
