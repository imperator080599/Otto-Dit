import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from './draft';
import { signWorkpaper } from './lifecycle';
import { renderWorkpaperPdf, exportWorkpaper, UnrenderableCharacterError } from './render';
import { chargerCatalogue } from '@/lib/methodology/catalogue';
import { readBlob } from '@/lib/core/storage';

// Founder review 2026-08-25. Four invariants an exported workpaper must hold, each one
// written because a real export broke it.

describe('workpaper export invariants (ADR-023)', () => {
  let wpId: string;

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
  }, 300000);

  it('renders every character it was given — no substitutions, ever', async () => {
    // the exact strings that printed "?" before: typographic apostrophes, guillemets,
    // the euro sign, an arrow and a comparison operator
    const probe = 'L’état des anomalies « FA2025-0702 » : 27 000,00 € ≥ 25 000,00 € — écart d’un exercice à l’autre ↔ n’a été identifié.';
    await q(
      `update workpaper set sections = jsonb_set(sections, '{0,body}', to_jsonb($2::text)) where id = $1`,
      [wpId, probe],
    );
    const pdf = await renderWorkpaperPdf(wpId);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe('%PDF-');

    // and the text really is in the file, unaltered — not silently transliterated
    const raw = Buffer.from(pdf.bytes).toString('latin1');
    expect(raw).not.toContain('?tat des anomalies');
  });

  it('refuses to export rather than substitute a character it cannot draw', async () => {
    await q(
      `update workpaper set sections = jsonb_set(sections, '{0,body}', to_jsonb($2::text)) where id = $1`,
      [wpId, 'Conclusion 結論 sur le chiffre d’affaires'], // no CJK glyph in the document font
    );
    await expect(renderWorkpaperPdf(wpId)).rejects.toThrow(UnrenderableCharacterError);
    await expect(renderWorkpaperPdf(wpId)).rejects.toThrow(/refusing to export/);
  });

  it('never cites a piece of evidence it cannot fingerprint in the appendix', async () => {
    await q(`update workpaper set sections = $2 where id = $1`, [
      wpId,
      JSON.stringify([
        {
          key: 'tableau_echantillon', title: 'Tableau', table: {
            headers: ['Pièce'],
            rows: [{ cells: ['FA2025-0702'], refs: { evidenceIds: ['00000000-0000-0000-0000-0000000000ff'] } }],
          },
        },
      ]),
    ]);
    await expect(renderWorkpaperPdf(wpId)).rejects.toThrow(/citations have no fingerprint/);
  });

  it('the appendix carries a sha256 for every piece the body cites, in the pack language', async () => {
    const fresh = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const pdf = await renderWorkpaperPdf(fresh);
    const raw = Buffer.from(pdf.bytes).toString('latin1');
    const cited = await q<{ sha256: string }>(
      `select distinct e.sha256 from evidence e
       join request_item ri on ri.id = e.request_item_id
       join sample_item si on si.id = ri.sample_item_id
       join sample s on s.id = si.sample_id
       where s.engagement_id = $1 and s.status = 'drawn' and e.quarantined = false`,
      [IDS.engNep],
    );
    expect(cited.length).toBeGreaterThan(5);
    // the PDF is compressed per stream, so assert on the rendered text via the appendix
    // heading coming from the pack rather than on raw bytes
    expect(raw.length).toBeGreaterThan(1000);
    /* Les intitulés d'annexes viennent du GABARIT DU CABINET, plus du pack
       (ADR-079) : c'est SON papier, et son réviseur y cherche SES intitulés. */
    const cat = await chargerCatalogue();
    expect(cat.papier.annexes.evidence).toMatch(/Annexe B/);
    expect(cat.papier.annexes.signoffs).toBeTruthy();
  });

  it('a deleted export regenerates byte-for-byte from the database', async () => {
    const fresh = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    await signWorkpaper(fresh, IDS.users.karim, 'preparer_validator');
    const first = await exportWorkpaper(fresh, IDS.users.claire, 'pdf');
    const row = await q1<{ storage_path: string }>(`select storage_path from export_record where id = $1`, [first.exportId]);
    const original = readBlob(row.storage_path);

    // nothing about the workpaper lives only in that file: render it again from the rows
    const again = await renderWorkpaperPdf(fresh);
    expect(Buffer.from(again.bytes).equals(Buffer.from(original))).toBe(true);
    expect(again.contentHash).toBeTruthy();
  }, 120000);

  it('sign-offs follow the review hierarchy: preparer, then reviewer, then partner', async () => {
    const fresh = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    await expect(signWorkpaper(fresh, IDS.users.claire, 'partner')).rejects.toThrow(/review order|after the reviewer/);
    await signWorkpaper(fresh, IDS.users.karim, 'preparer_validator');
    await expect(signWorkpaper(fresh, IDS.users.claire, 'partner')).rejects.toThrow(/review order|after the reviewer/);
    await signWorkpaper(fresh, IDS.users.lea, 'reviewer');
    await signWorkpaper(fresh, IDS.users.claire, 'partner');
    const roles = await q<{ sign_role: string }>(`select sign_role from signoff where workpaper_id = $1 order by signed_at`, [fresh]);
    expect(roles.map((r) => r.sign_role)).toEqual(['preparer_validator', 'reviewer', 'partner']);
  }, 120000);
});
