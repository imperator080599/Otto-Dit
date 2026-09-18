import { sha256 } from '@/lib/core/hash';
import type { GlRow } from './types';

// Canonicalization + population_hash spec v1 (docs/04 §7bis). This module is the single
// definition both the generator and the app import — they cannot drift (ADR-015).

export function naturalKey(journalCode: string, entryNo: string, lineNo: number): string {
  return `${journalCode}|${entryNo}|${lineNo}`;
}

/** Parse a FEC-style amount ("1234,56" or "1234.56" or "") into integer cents. */
export function parseAmountCents(raw: string): number {
  const s = (raw ?? '').trim();
  if (s === '') return 0;
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`unparseable amount: "${raw}"`);
  return Math.round(value * 100);
}

export function centsToStr(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${euros}.${rest}`;
}

/** Format cents for display (fr-style workpapers use narrow spaces; UI uses this). */
export function fmtEur(cents: number, lang: 'fr' | 'en' = 'en'): string {
  const v = cents / 100;
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v) + ' €';
}

/** `fmtEur`, avec un espace INSÉCABLE (U+00A0) avant `€` au lieu d'un espace
    cassable — réservée aux endroits qui affichent ce texte comme LE chiffre
    unique d'une carte-résumé (`.kpi .v`, `.epure-chiffre`), en grande taille
    (H-6, --t7 : 40px). Née d'un vrai défaut trouvé par la revue hostile de
    H-6 tranche 2 (2026-09-17, capture d'écran) : à cette taille, l'espace
    cassable laissait le navigateur couper la ligne entre le montant et le
    symbole (population/page.tsx, « 5 648 676,30 » sur une ligne, « € » seul
    sur la suivante). Le premier correctif changeait `fmtEur` elle-même,
    PARTOUT — un A/B direct (npm run visuel avec/sans le changement, même
    arbre sinon) a prouvé que c'était la cause d'un SECOND défaut, réel, dans
    une table dense et déjà tendue (/eng/[id]/testing, table.data.cellules,
    colonnes Attendu/Trouvé) : la même espace insécable, dans une cellule de
    tableau ordinaire, retire le seul point de coupure disponible et pousse
    la page en débordement horizontal — deux tentatives de correctif CSS
    structurel (table-scroll, min-width:0 sur les items de la grille
    .atelier) n'ont RIEN changé à la mesure, prouvant que le défaut n'était
    pas là où elles le supposaient. Scinder la fonction ferme les deux
    défauts sans en rouvrir un troisième : `fmtEur` retrouve son comportement
    d'origine (cassable) pour les 20+ appelants restants — tableaux denses
    compris — et seuls les appels qui rendent VRAIMENT un `.kpi .v`/
    `.epure-chiffre` lisent `fmtEurTitre`. */
export function fmtEurTitre(cents: number, lang: 'fr' | 'en' = 'en'): string {
  const v = cents / 100;
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v) + '\u00A0€';
}

/** FEC date AAAAMMJJ → ISO yyyy-mm-dd (throws on invalid calendar dates). */
export function fecDateToIso(raw: string): string {
  if (!/^\d{8}$/.test(raw)) throw new Error(`bad FEC date: "${raw}"`);
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`invalid calendar date: "${raw}"`);
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export function isoToFecDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/** population_hash v1 over financial GL rows (docs/04 §7bis). */
export function populationHash(rows: GlRow[]): string {
  const sorted = rows
    .slice()
    .sort((a, b) =>
      a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 :
      a.entryNo < b.entryNo ? -1 : a.entryNo > b.entryNo ? 1 :
      a.lineNo - b.lineNo,
    );
  const body = sorted
    .map((r) => [r.naturalKey, r.accountNo, String(r.debitCents), String(r.creditCents)].join('|'))
    .join('\n');
  return 'pophash-v1:' + sha256(body);
}

/** population_hash v1 over control instances (docs/04 §7bis). */
export function controlPopulationHash(
  instances: { label: string; occurredOn?: string; performerName?: string }[],
): string {
  const sorted = instances.slice().sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const body = sorted
    .map((i) => [i.label, i.occurredOn ?? '', i.performerName ?? ''].join('|'))
    .join('\n');
  return 'pophash-v1:' + sha256(body);
}

/** Normalize a counterparty/party name for deterministic matching (docs/05 §4). */
export function normalizeParty(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^A-Z0-9]+/g, ' ') // punctuation \u2192 spaces (so "S.A.R.L." \u2192 "S A R L" \u2192 below)
    .replace(/\b(S A S U|S A R L|S A S|S A|SAS|SARL|SA|SASU|EURL|SNC|INC|LLC|GMBH|LTD|SL|BV|CO)\b/g, '')
    .replace(/\s+/g, '');
}
