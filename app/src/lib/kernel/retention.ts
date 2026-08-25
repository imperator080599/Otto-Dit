// Documentation-file deadlines: assembly/completion window and retention period.
//
// These are LEGAL CONSTANTS. Two rules govern this file (ADR-014 rev. 2):
//   1. every number carries its primary-text citation, the instrument that enacted it,
//      the date it came into force, and how its currency was verified;
//   2. anything this environment could not verify against the primary text is marked
//      `unverified` — in the code, not only in the docs. Secondary sources return
//      repealed provisions with complete confidence, so they are never sufficient.
//
// The PCAOB completion window is NOT a constant: it phases in by fiscal year and firm
// size, so it is modelled as a function of engagement facts.

export type VerificationStatus = 'primary_text' | 'unverified';

export interface LegalSource {
  /** The provision itself, as it should be cited in a workpaper. */
  citation: string;
  /** The instrument that enacted or amended it. */
  instrument?: string;
  /** ISO date the provision came into force. */
  inForceSince?: string;
  /** What this provision replaced, when a predecessor is commonly mis-cited. */
  supersedes?: string;
  verification: VerificationStatus;
  /** Who reached the primary text, and where. */
  verifiedBy?: string;
  verifiedOn?: string;
  note?: string;
}

export interface RetentionRule {
  years: number;
  from: 'report_date';
  source: LegalSource;
}

export interface CompletionRule {
  days: number;
  from: 'report_signature';
  source: LegalSource;
  /** Set when the rule that applies depends on engagement facts (PCAOB phase-in). */
  determinedBy?: string;
}

export type DocRuleSetId = 'nep-fr-2024' | 'pcaob-as1215';

// ─────────────────────────────────────────────────────────────────────────────
// France — statutory audit (commissariat aux comptes)
// ─────────────────────────────────────────────────────────────────────────────
// Verified on the primary text at Légifrance by the founder (statutory auditor) on
// 2026-08-25. This build environment cannot reach legifrance.gouv.fr (egress proxy
// blocks the domain), so the session did not re-read the text itself; the provenance
// below records exactly who did.
//
// The widely repeated "10 years" figure comes from the 2007 version of NEP 230 and is
// obsolete. It is recorded here so a future reader does not reintroduce it.

const FR_VERIFICATION = {
  verification: 'primary_text' as const,
  verifiedBy: 'fondateur (commissaire aux comptes) — Légifrance, texte primaire',
  verifiedOn: '2026-08-25',
};

export const NEP_FR_RETENTION: RetentionRule = {
  years: 6,
  from: 'report_date',
  source: {
    citation: 'C. com., art. R. 820-42',
    instrument: 'décret n° 2023-1394, art. 9',
    inForceSince: '2024-02-01',
    supersedes:
      'art. R. 823-10 (abrogé au 2024-02-01) — cet article ne portait aucune durée de conservation; ' +
      'son successeur est l’art. D. 821-186',
    ...FR_VERIFICATION,
    note:
      'Le chiffre de dix ans provient de la NEP 230 dans sa version de 2007, périmée. ' +
      'La NEP 230 est désormais codifiée à l’art. A. 821-66 C. com. (arrêté du 28 décembre 2023), ' +
      'dont le §11 renvoie aux six ans de l’art. R. 820-42.',
  },
};

export const NEP_FR_COMPLETION: CompletionRule = {
  days: 60,
  from: 'report_signature',
  source: {
    citation: 'C. com., art. D. 821-186, III et IV',
    instrument: 'décret n° 2023-1394',
    inForceSince: '2024-02-01',
    ...FR_VERIFICATION,
    note:
      'Clôture du dossier au plus tard soixante jours après la signature du rapport. ' +
      'Règle du Code de commerce, et non simple pratique doctrinale; reprise au §09 de ' +
      'l’art. A. 821-66 C. com. (ex-NEP 230).',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PCAOB — issuer audits and referred component work
// ─────────────────────────────────────────────────────────────────────────────
// pcaobus.org is blocked by this environment's egress proxy, so nothing below was read
// from the primary text in this session. The figures were confirmed and the phase-in
// supplied by the founder; every source is therefore marked `unverified` and must be
// re-checked against AS 1215 before it governs a real engagement.

const PCAOB_UNVERIFIED = {
  verification: 'unverified' as const,
  verifiedBy: 'fondateur (chiffres confirmés, échelonnement fourni) — non relu sur texte primaire',
  verifiedOn: '2026-08-25',
  note: 'pcaobus.org est bloqué par le proxy de sortie de cet environnement: [UNVERIFIED] à relire sur AS 1215.',
};

export const PCAOB_RETENTION: RetentionRule = {
  years: 7,
  from: 'report_date',
  source: {
    citation: 'AS 1215.14 [UNVERIFIED]',
    ...PCAOB_UNVERIFIED,
    note:
      PCAOB_UNVERIFIED.note +
      ' SEC Rule 2-06 impose par ailleurs sept ans sur un périmètre d’enregistrements plus large.',
  },
};

/** Firm-level facts the AS 1215.15 phase-in depends on. */
export interface PcaobFirmProfile {
  /** Number of issuer audit reports the firm issued in 2024 (phase-in test). */
  issuerReports2024: number;
}

const PCAOB_PHASE_IN_LARGE = '2024-12-15'; // firms with >100 issuer reports in 2024
const PCAOB_PHASE_IN_OTHER = '2025-12-15'; // all other firms
const PCAOB_LARGE_FIRM_REPORTS = 100;

/**
 * The documentation-completion window under AS 1215.15. NOT a constant: the 14-day
 * period phases in by the fiscal year under audit and the size of the firm; before the
 * applicable date the legacy 45-day period governs.
 *
 * @param fiscalYearStart ISO date on which the audited fiscal year begins.
 */
export function pcaobCompletionRule(fiscalYearStart: string, firm: PcaobFirmProfile): CompletionRule {
  const isLargeFirm = firm.issuerReports2024 > PCAOB_LARGE_FIRM_REPORTS;
  const appliesFrom = isLargeFirm ? PCAOB_PHASE_IN_LARGE : PCAOB_PHASE_IN_OTHER;
  const inScope = fiscalYearStart >= appliesFrom;
  const determinedBy =
    `exercice ouvert le ${fiscalYearStart}; cabinet ayant émis ${firm.issuerReports2024} rapport(s) ` +
    `d’émetteurs en 2024 (${isLargeFirm ? '> 100' : '≤ 100'}) ⇒ règle des 14 jours applicable aux ` +
    `exercices ouverts à compter du ${appliesFrom} ⇒ ${inScope ? '14 jours' : '45 jours (régime antérieur)'}`;
  return {
    days: inScope ? 14 : 45,
    from: 'report_signature',
    source: {
      citation: inScope ? 'AS 1215.15, tel qu’amendé [UNVERIFIED]' : 'AS 1215.15, régime antérieur [UNVERIFIED]',
      instrument: 'amendements adoptés avec AS 1000 [UNVERIFIED]',
      inForceSince: appliesFrom,
      ...PCAOB_UNVERIFIED,
      note:
        PCAOB_UNVERIFIED.note +
        ' Entrée en vigueur échelonnée: exercices ouverts à compter du 15/12/2024 pour les cabinets ayant ' +
        'émis plus de 100 rapports d’émetteurs en 2024, du 15/12/2025 pour tous les autres.',
    },
    determinedBy,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution + date arithmetic
// ─────────────────────────────────────────────────────────────────────────────

export interface FileDeadlineInputs {
  ruleSet: DocRuleSetId;
  /** ISO date the audit report is signed / released. */
  reportDate: string;
  /** ISO date the audited fiscal year begins (PCAOB phase-in test). */
  fiscalYearStart: string;
  firm: PcaobFirmProfile;
}

export interface FileDeadlines {
  ruleSet: DocRuleSetId;
  completion: CompletionRule;
  retention: RetentionRule;
  /** ISO date the assembled file must be closed by. */
  completionDue: string;
  /** ISO date until which the file must be kept. */
  retentionUntil: string;
  /** True when any governing source is not primary-text verified. */
  anyUnverified: boolean;
}

export function resolveRules(input: FileDeadlineInputs): { completion: CompletionRule; retention: RetentionRule } {
  return input.ruleSet === 'nep-fr-2024'
    ? { completion: NEP_FR_COMPLETION, retention: NEP_FR_RETENTION }
    : { completion: pcaobCompletionRule(input.fiscalYearStart, input.firm), retention: PCAOB_RETENTION };
}

export function computeFileDeadlines(input: FileDeadlineInputs): FileDeadlines {
  const { completion, retention } = resolveRules(input);
  return {
    ruleSet: input.ruleSet,
    completion,
    retention,
    completionDue: addDays(input.reportDate, completion.days),
    retentionUntil: addYears(input.reportDate, retention.years),
    anyUnverified:
      completion.source.verification !== 'primary_text' || retention.source.verification !== 'primary_text',
  };
}

/** UTC date arithmetic on ISO yyyy-mm-dd; no locale, no DST, no float. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addYears(iso: string, years: number): string {
  const [y, m, day] = iso.split('-').map(Number);
  // 29 February + n years lands on 28 February when the target year is not a leap year
  const target = new Date(Date.UTC(y + years, m - 1, day));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** One-paragraph basis note, generated from the sources so it can never drift. */
export function basisNote(ruleSet: DocRuleSetId, lang: 'fr' | 'en'): string {
  if (ruleSet === 'nep-fr-2024') {
    return lang === 'fr'
      ? `Clôture du dossier au plus tard ${NEP_FR_COMPLETION.days} jours après la signature du rapport ` +
        `(${NEP_FR_COMPLETION.source.citation}); conservation ${NEP_FR_RETENTION.years} ans ` +
        `(${NEP_FR_RETENTION.source.citation}, en vigueur depuis le ${NEP_FR_RETENTION.source.inForceSince}). ` +
        `NEP 230 codifiée à l’art. A. 821-66 C. com. Vérifié sur texte primaire — cf. ADR-014.`
      : `File closed within ${NEP_FR_COMPLETION.days} days of report signature (${NEP_FR_COMPLETION.source.citation}); ` +
        `retained ${NEP_FR_RETENTION.years} years (${NEP_FR_RETENTION.source.citation}, in force ` +
        `${NEP_FR_RETENTION.source.inForceSince}). Verified against the primary text — see ADR-014.`;
  }
  return lang === 'fr'
    ? `Délai d’assemblage AS 1215.15 échelonné (14 ou 45 jours selon l’exercice et la taille du cabinet, ` +
      `calculé par mandat); conservation ${PCAOB_RETENTION.years} ans (${PCAOB_RETENTION.source.citation}); ` +
      `SEC Rule 2-06 sur un périmètre plus large. [UNVERIFIED] — cf. ADR-014.`
    : `AS 1215.15 completion window phases in (14 or 45 days depending on fiscal year and firm size, ` +
      `computed per engagement); retention ${PCAOB_RETENTION.years} years (${PCAOB_RETENTION.source.citation}); ` +
      `SEC Rule 2-06 covers a broader record set. [UNVERIFIED] — see ADR-014.`;
}
