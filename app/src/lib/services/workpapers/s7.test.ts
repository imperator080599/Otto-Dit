import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper, type WpSection } from './draft';
import { getWorkpaper, editSection, listEdits, addReviewNote, transitionNote, listNotes, signWorkpaper, listSignoffs } from './lifecycle';
import { exportWorkpaper, renderWorkpaperPdf, listExports } from './render';

describe('S7 — workpaper engine (draft, edits, notes, sign-offs, exports)', () => {
  let wpId: string;

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
  }, 240000);

  it('drafts a French pack-formatted workpaper from stored facts with full provenance', async () => {
    const wp = await getWorkpaper(wpId);
    expect(wp!.language).toBe('fr');
    expect(wp!.engine_run_id).toBeTruthy();
    const sections = wp!.sections as WpSection[];
    const keys = sections.map((s) => s.key);
    expect(keys).toEqual(['objective', 'scope', 'method', 'sampleTable', 'exceptions', 'evaluation', 'verification', 'conclusion']);
    const sampleTable = sections.find((s) => s.key === 'sampleTable')!;
    expect(sampleTable.table!.rows.length).toBe(16);
    // every row with evidence carries click-through refs (P7)
    const withRefs = sampleTable.table!.rows.filter((r) => (r.refs?.evidenceIds?.length ?? 0) > 0);
    expect(withRefs.length).toBeGreaterThan(10);
    const evalSection = sections.find((s) => s.key === 'evaluation')!;
    expect(evalSection.body).toContain('36'); // known misstatement figure appears
    const conclusion = sections.find((s) => s.key === 'conclusion')!;
    // the file cannot be concluded definitively: the ledger audited is the provisional FEC
    // and two limitations on available evidence are recorded. The workpaper says so in the
    // conclusion itself rather than leaving the reader to discover it.
    const meta = conclusion.meta as {
      gate: { ok: boolean; blockers: { code: string }[]; withinTolerable: boolean | null };
      limitations: { taxonomy_code: string }[];
      responses: { kind: string }[];
    };
    expect(meta.gate.ok).toBe(false);
    expect(meta.gate.blockers.map((b) => b.code)).toContain('ledger_provisional');
    expect(meta.gate.withinTolerable).toBe(false);
    expect(meta.limitations.map((l) => l.taxonomy_code).sort()).toEqual(
      ['missing_document', 'missing_document', 'reconciliation_diff', 'reconciliation_diff'],
    );
    expect(meta.responses.map((r) => r.kind)).toEqual(['revise_strategy']);
    expect(conclusion.body).toMatch(/CONCLUSION DÉFINITIVE BLOQUÉE/);
    expect(conclusion.body).toMatch(/Limitations sur les éléments probants \(4\)/);
  });

  it('edits require justification and set the visible modification flag', async () => {
    await expect(editSection(wpId, IDS.users.karim, 'conclusion', 'Conclusion modifiée.', '')).rejects.toThrow(/justification/);
    await editSection(
      wpId, IDS.users.karim, 'conclusion',
      'Sur la base des travaux décrits, et compte tenu de l’anomalie de séparation des exercices portée à l’état des anomalies (36 330 €, non corrigée), les travaux ne révèlent pas d’autre anomalie significative sur le chiffre d’affaires.',
      'Rédaction de la conclusion par le collaborateur après revue des éléments (sortie du cadre du projet auto-généré).',
    );
    const edits = await listEdits(wpId);
    expect(edits.length).toBe(1);
    expect(edits[0].section).toBe('conclusion');
    // append-only trail
    await expect(q(`delete from workpaper_edit`)).rejects.toThrow(/append-only/);
  });

  it('review notes: open → addressed → closed (author closes)', async () => {
    const noteId = await addReviewNote(IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'Préciser dans la conclusion le renvoi vers l’état des anomalies.');
    await expect(transitionNote(noteId, IDS.users.karim, 'closed')).rejects.toThrow(/addressed/);
    await transitionNote(noteId, IDS.users.karim, 'addressed');
    await expect(transitionNote(noteId, IDS.users.karim, 'closed')).rejects.toThrow(/author/);
    await transitionNote(noteId, IDS.users.lea, 'closed');
    const notes = await listNotes(wpId);
    expect(notes[0].status).toBe('closed');
  });

  it('sign-offs enforce order, rights and open-note gates; immutable once signed', async () => {
    await expect(signWorkpaper(wpId, IDS.users.lea, 'reviewer')).rejects.toThrow(/preparer/);
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    // open note blocks review sign-off
    const blocker = await addReviewNote(IDS.engNep, wpId, IDS.users.lea, IDS.users.karim, 'Note bloquante test.');
    await expect(signWorkpaper(wpId, IDS.users.lea, 'reviewer')).rejects.toThrow(/open review notes/);
    await transitionNote(blocker, IDS.users.karim, 'addressed');
    await transitionNote(blocker, IDS.users.lea, 'closed');
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
    // staff cannot sign as partner
    await expect(signWorkpaper(wpId, IDS.users.karim, 'partner')).rejects.toThrow(/signing rights/);
    await signWorkpaper(wpId, IDS.users.claire, 'partner');
    const signoffs = await listSignoffs(wpId);
    expect(signoffs.map((s) => s.sign_role)).toEqual(['preparer_validator', 'reviewer', 'partner']);
    const wp = await getWorkpaper(wpId);
    expect(wp!.status).toBe('signed');
    await expect(q(`update signoff set sign_role = 'partner'`)).rejects.toThrow(/append-only/);
    // signed ⇒ no further edits on this version
    await expect(editSection(wpId, IDS.users.karim, 'conclusion', 'x', 'y')).rejects.toThrow(/redraft/);
  });

  it('redraft after sign-off creates a new unsigned version; the old one flips outdated', async () => {
    const v2 = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const old = await getWorkpaper(wpId);
    const neu = await getWorkpaper(v2);
    expect(old!.status).toBe('outdated');
    expect(neu!.version).toBe(2);
    expect(neu!.status).toBe('draft');
    expect((await listSignoffs(v2)).length).toBe(0);
  });

  it('exports are terminal, hash-stamped, self-contained; re-export supersedes (ADR-013)', async () => {
    const pdf = await renderWorkpaperPdf(wpId);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const first = await exportWorkpaper(wpId, IDS.users.claire, 'pdf');
    const second = await exportWorkpaper(wpId, IDS.users.claire, 'pdf');
    const exports = await listExports(wpId);
    const pdfExports = exports.filter((e) => e.format === 'pdf');
    expect(pdfExports.length).toBe(2);
    expect(pdfExports[0].supersedes_export_id).toBeTruthy();
    expect(first.sha256).toBe(second.sha256); // deterministic render
    const xlsx = await exportWorkpaper(wpId, IDS.users.claire, 'xlsx');
    expect(xlsx.sha256).toBeTruthy();
    // export records are append-only
    await expect(q(`delete from export_record`)).rejects.toThrow(/append-only/);
  });
});
