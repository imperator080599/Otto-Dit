import { describe, it, expect } from 'vitest';
import {
  NEP_FR_COMPLETION, NEP_FR_RETENTION, PCAOB_RETENTION, addDays, addYears,
  basisNote, computeFileDeadlines, pcaobCompletionRule,
} from './retention';

// ADR-014 rev. 2. The previous version of this rule set was wrong in a way tests would
// not have caught — it was a plausible number with a citation that carried no duration.
// So these tests assert the CITATIONS and the VERIFICATION STATUS too, not just the
// arithmetic: a future edit that changes 6 back to 10 has to change a citation to pass.

describe('documentation-file deadlines (ADR-014 rev. 2)', () => {
  it('France: six years under R. 820-42, not the obsolete ten', () => {
    expect(NEP_FR_RETENTION.years).toBe(6);
    expect(NEP_FR_RETENTION.source.citation).toBe('C. com., art. R. 820-42');
    expect(NEP_FR_RETENTION.source.inForceSince).toBe('2024-02-01');
    expect(NEP_FR_RETENTION.source.supersedes).toMatch(/R\. 823-10.*abrogé/);
    expect(NEP_FR_RETENTION.source.note).toMatch(/dix ans.*2007/);
    expect(NEP_FR_RETENTION.source.verification).toBe('primary_text');
  });

  it('France: sixty days to close the file is a Code de commerce rule, not a convention', () => {
    expect(NEP_FR_COMPLETION.days).toBe(60);
    expect(NEP_FR_COMPLETION.source.citation).toBe('C. com., art. D. 821-186, III et IV');
    expect(NEP_FR_COMPLETION.source.note).toMatch(/A\. 821-66/);
    expect(NEP_FR_COMPLETION.source.verification).toBe('primary_text');
  });

  it('PCAOB sources are marked unverified while the primary text is unreachable', () => {
    expect(PCAOB_RETENTION.years).toBe(7);
    expect(PCAOB_RETENTION.source.verification).toBe('unverified');
    expect(PCAOB_RETENTION.source.citation).toMatch(/UNVERIFIED/);
    const r = pcaobCompletionRule('2025-01-01', { issuerReports2024: 250 });
    expect(r.source.verification).toBe('unverified');
  });

  it('PCAOB completion is a function of fiscal year and firm size, not a constant', () => {
    const large = { issuerReports2024: 250 };
    const small = { issuerReports2024: 12 };
    // large firm: 14 days from fiscal years beginning on/after 2024-12-15
    expect(pcaobCompletionRule('2024-12-15', large).days).toBe(14);
    expect(pcaobCompletionRule('2025-01-01', large).days).toBe(14);
    expect(pcaobCompletionRule('2024-12-14', large).days).toBe(45);
    // every other firm: not until fiscal years beginning on/after 2025-12-15
    expect(pcaobCompletionRule('2025-01-01', small).days).toBe(45);
    expect(pcaobCompletionRule('2025-12-15', small).days).toBe(14);
    // exactly 100 reports is not "more than 100"
    expect(pcaobCompletionRule('2025-01-01', { issuerReports2024: 100 }).days).toBe(45);
    expect(pcaobCompletionRule('2025-01-01', { issuerReports2024: 101 }).days).toBe(14);
    // the reasoning is recorded, not just the number
    expect(pcaobCompletionRule('2025-01-01', small).determinedBy).toMatch(/12 rapport.*2025-12-15.*45 jours/);
  });

  it('an unknown firm size resolves to the later phase-in, never the shorter deadline', () => {
    expect(pcaobCompletionRule('2025-06-01', { issuerReports2024: 0 }).days).toBe(45);
  });

  it('computes both dates from the report date', () => {
    const fr = computeFileDeadlines({
      ruleSet: 'nep-fr-2024', reportDate: '2026-04-30',
      fiscalYearStart: '2025-01-01', firm: { issuerReports2024: 0 },
    });
    expect(fr.completionDue).toBe('2026-06-29'); // +60 days
    expect(fr.retentionUntil).toBe('2032-04-30'); // +6 years
    expect(fr.anyUnverified).toBe(false);

    const us = computeFileDeadlines({
      ruleSet: 'pcaob-as1215', reportDate: '2026-02-20',
      fiscalYearStart: '2025-01-01', firm: { issuerReports2024: 250 },
    });
    expect(us.completionDue).toBe('2026-03-06'); // +14 days
    expect(us.retentionUntil).toBe('2033-02-20'); // +7 years
    expect(us.anyUnverified).toBe(true); // PCAOB text unreachable → surfaced in the data
  });

  it('date arithmetic is UTC and survives leap years', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addYears('2024-02-29', 6)).toBe('2030-02-28'); // no 29 Feb in 2030
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('the basis note is generated from the sources, so it cannot drift from them', () => {
    const fr = basisNote('nep-fr-2024', 'fr');
    expect(fr).toContain('R. 820-42');
    expect(fr).toContain('6 ans');
    expect(fr).not.toContain('10 ans');
    expect(basisNote('pcaob-as1215', 'en')).toContain('UNVERIFIED');
  });
});
