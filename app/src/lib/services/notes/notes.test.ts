import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from '../workpapers/draft';
import { addReviewNote } from '../workpapers/lifecycle';
import { poserNote, notesDeSection, hrefDeNote } from './notes';
import type { AncreKind } from './ancres';
import { sectionPourNote } from '../sections';

// P1-02 (AUD-02) : `poserNote`/`hrefDeNote` se prouvent en les EXERÇANT (règle 15) — une
// note posée sur chaque nature, puis résolue, jamais lue en base sans passer par le chemin.

describe('poserNote / hrefDeNote (P1-02)', () => {
  let wpId: string;

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
  }, 240000);

  it('NOTE-01 : une note d’audit sans ancre ET sans papier est refusée', async () => {
    await expect(addReviewNote(IDS.engNep, null, IDS.users.lea, IDS.users.karim, 'Sans nulle part où aller.'))
      .rejects.toThrow(/NOTE-01/);
  });

  it('une note flottante (papier, sans ancre) reçoit une section ET un anchor_kind — jamais une ligne orpheline', async () => {
    const id = await addReviewNote(IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'Flottante, sur le papier.');
    const row = await q1<{ section_id: string | null; anchor_kind: string | null }>(
      `select section_id::text "section_id", anchor_kind from review_note where id = $1`, [id]);
    expect(row.section_id).toBeTruthy();
    expect(row.anchor_kind).toBe('papier');
  });

  it('poser sur chaque nature déjà résolvable → hrefDeNote rend un href non vide vers le dossier', async () => {
    const question = await q01<{ question_code: string }>(
      `select question_code from risk_question_answer where engagement_id = $1 limit 1`, [IDS.engNep]);
    const materialite = await q01<{ id: string }>(
      `select id::text id from materiality where engagement_id = $1 order by version desc limit 1`, [IDS.engNep]);
    const item = await q1<{ id: string; natural_key: string }>(
      `select si.id::text id, g.natural_key from sample_item si
       join sample s on s.id = si.sample_id join gl_entry g on g.id = si.unit_id
       where s.engagement_id = $1 and s.status = 'drawn' and si.unit_kind = 'gl_entry' limit 1`,
      [IDS.engNep]);
    const compte = await q01<{ number: string }>(
      `select a.number from account a join tb_snapshot s on s.id = a.tb_snapshot_id
       where s.engagement_id = $1 and s.status = 'active' and s.period_kind = 'current' limit 1`,
      [IDS.engNep]);
    const exc = await q01<{ id: string }>(`select id::text id from exception where engagement_id = $1 limit 1`, [IDS.engNep]);

    const cas: { kind: AncreKind; ref: string; label: string }[] = [
      ...(question ? [{ kind: 'questionnaire_answer' as AncreKind, ref: question.question_code, label: 'Réponse' }] : []),
      ...(materialite ? [{ kind: 'materiality_param' as AncreKind, ref: 'benchmark', label: 'Seuils' }] : []),
      ...(item ? [{ kind: 'sample_item' as AncreKind, ref: item.natural_key, label: 'Écriture' }] : []),
      ...(compte ? [{ kind: 'compte' as AncreKind, ref: `REVENUE|${compte.number}`, label: 'Compte' }] : []),
      ...(exc ? [{ kind: 'exception' as AncreKind, ref: `id|${exc.id}`, label: 'Écart' }] : []),
      { kind: 'papier' as AncreKind, ref: wpId, label: 'Papier' },
    ];
    expect(cas.length).toBeGreaterThanOrEqual(5);

    for (const c of cas) {
      const id = await poserNote({
        engagementId: IDS.engNep, auteur: IDS.users.lea, destinataire: IDS.users.karim,
        texte: `Sonde ${c.kind}.`, ancre: { kind: c.kind, ref: c.ref, field: null, label: c.label },
      });
      const row = await q1<{ workpaper_id: string | null; anchor_kind: string | null; anchor_ref: string | null; anchor_field: string | null; section_id: string | null }>(
        `select workpaper_id::text "workpaper_id", anchor_kind, anchor_ref, anchor_field, section_id::text "section_id"
         from review_note where id = $1`, [id]);
      expect(row.section_id, `${c.kind} : section_id`).toBeTruthy();
      const href = hrefDeNote(IDS.engNep, row);
      expect(href, c.kind).toMatch(new RegExp(`^/eng/${IDS.engNep}/`));
    }
  });

  it('poser sur les natures neuves (P1-02) résolvables contre de vraies lignes — control/control_task/process_model/process_step/fs_line', async () => {
    const ev = await q1<{ id: string }>(
      `insert into evidence (engagement_id, filename, mime, sha256, size_bytes, storage_path, source, audience, uploaded_by_kind)
       values ($1, 'sonde.txt', 'text/plain', repeat('0', 64), 3, 'sonde/notes-test-1', 'auditor', 'internal', 'app_user')
       returning id::text`,
      [IDS.engNep]);
    const proc = await q1<{ id: string }>(
      `insert into process_model (engagement_id, cycle_ref, exercice, name, evidence_id, created_by)
       values ($1, 'REVENUE', 'n', 'Ventes', $2, $3) returning id::text`,
      [IDS.engNep, ev.id, IDS.users.lea]);
    const step = await q1<{ id: string; code: string }>(
      `insert into process_step (process_id, code, seq, label, actor_name, system_name)
       values ($1, 'ETAPE-1', 1, 'Réception commande', 'Commercial', 'CRM') returning id::text, code`,
      [proc.id]);
    const ctrl = await q1<{ id: string; code: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect)
       values ($1, 'C-SONDE-01', 'Contrôle sonde', 'Description sonde', 'monthly', 'manual', 'preventive')
       returning id::text, code`, [IDS.engNep]);
    const task = await q1<{ id: string }>(
      `insert into control_task (engagement_id, control_id, seq_no, description) values ($1, $2, 1, 'Tâche sonde')
       returning id::text`, [IDS.engNep, ctrl.id]);
    const fsl = await q1<{ id: string }>(
      `insert into fs_line (engagement_id, statement, ref, label, presented) values ($1, 'IS', 'CA', 'Chiffre d’affaires', 1000)
       returning id::text`, [IDS.engNep]);

    const cas: { kind: AncreKind; ref: string; label: string }[] = [
      { kind: 'process_model', ref: 'REVENUE:n', label: 'Modèle' },
      { kind: 'process_step', ref: `REVENUE:n:${step.code}`, label: 'Étape' },
      { kind: 'control', ref: ctrl.code, label: 'Contrôle' },
      { kind: 'control_task', ref: `${ctrl.code}:1`, label: 'Tâche' },
      { kind: 'fs_line', ref: 'IS:CA', label: 'Ligne FS' },
    ];
    for (const c of cas) {
      const id = await poserNote({
        engagementId: IDS.engNep, auteur: IDS.users.lea, destinataire: IDS.users.karim,
        texte: `Sonde ${c.kind}.`, ancre: { kind: c.kind, ref: c.ref, field: null, label: c.label },
      });
      expect(id, c.kind).toBeTruthy();
    }
    void task;
  });

  it('poser sur workpaper_section/analytique/assertion_risk/transcript/proposition', async () => {
    const wp = await q1<{ code: string; sections: unknown }>(`select code, sections from workpaper where id = $1`, [wpId]);
    const section = Array.isArray(wp.sections) && (wp.sections as { key?: string }[])[0]?.key;
    const analytique = await q1<{ fsli_code: string }>(
      `insert into fsli_analytique (engagement_id, fsli_code, version, text, origine, soldes_hash, author_id)
       values ($1, 'REVENUE', 1, 'Sonde analytique.', 'humaine', repeat('0', 8), $2) returning fsli_code`,
      [IDS.engNep, IDS.users.lea]);
    const risque = await q1<{ fsli_code: string; assertion: string }>(
      `insert into fsli_assertion_risk (engagement_id, fsli_code, assertion, computed_level, methodology_version)
       values ($1, 'REVENUE', 'presentation', 'eleve', 'sonde-v1')
       on conflict (engagement_id, fsli_code, assertion) do update set computed_level = excluded.computed_level
       returning fsli_code, assertion`,
      [IDS.engNep]);
    const proposition = await q01<{ id: string }>(`select id::text id from proposition where engagement_id = $1 limit 1`, [IDS.engNep]);
    const interview = await q1<{ id: string }>(
      `insert into process_interview (engagement_id, cycle_ref, date_entretien, sujet, support, created_by)
       values ($1, 'REVENUE', current_date, 'Sonde', 'notes', $2) returning id::text`,
      [IDS.engNep, IDS.users.lea]);
    const transcript = await q1<{ interview_id: string }>(
      `insert into interview_transcript (interview_id, contenu, created_by) values ($1, 'Sonde de contenu.', $2)
       returning interview_id::text "interview_id"`,
      [interview.id, IDS.users.lea]);

    const cas: { kind: AncreKind; ref: string; label: string }[] = [
      ...(section ? [{ kind: 'workpaper_section' as AncreKind, ref: `${wp.code}:${section}`, label: 'Section' }] : []),
      { kind: 'analytique' as AncreKind, ref: analytique.fsli_code, label: 'Analytique' },
      { kind: 'assertion_risk' as AncreKind, ref: `${risque.fsli_code}:${risque.assertion}`, label: 'Risque' },
      { kind: 'transcript' as AncreKind, ref: transcript.interview_id, label: 'Transcript' },
      ...(proposition ? [{ kind: 'proposition' as AncreKind, ref: proposition.id, label: 'Proposition' }] : []),
    ];
    for (const c of cas) {
      const id = await poserNote({
        engagementId: IDS.engNep, auteur: IDS.users.lea, destinataire: IDS.users.karim,
        texte: `Sonde ${c.kind}.`, ancre: { kind: c.kind, ref: c.ref, field: null, label: c.label },
      });
      expect(id, c.kind).toBeTruthy();
    }
  });

  it('cas connu mauvais : une ancre non spécialement dérivée retombe sur mission.vue, jamais une exception', async () => {
    const sectionId = await sectionPourNote(IDS.engNep, null, { kind: 'transcript', ref: 'inconnu', field: null, label: 'x' });
    const s = await q1<{ kind: string; ref: string }>(`select kind, ref from section_state where id = $1`, [sectionId]);
    expect(s.kind).toBe('mission.vue');
    expect(s.ref).toBe('');
  });

  it('notesDeSection lit les notes d’une section, les plus récentes d’abord', async () => {
    const sectionId = await sectionPourNote(IDS.engNep, wpId, null);
    const notes = await notesDeSection(sectionId);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.id)).toBe(true);
  });
});
