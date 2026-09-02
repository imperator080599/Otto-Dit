// LES PHRASES ET FORMATS DE LA LEADSHEET N/N-1, partagés par la page du poste
// et la revue analytique du dossier — purs, sans base : un composant client
// pourrait les lire.

import type { OrigineN1 } from './analytique';
import type { CleLibelle, Variable } from '@/lib/i18n/catalogue';

type T = (cle: CleLibelle, vars?: Record<string, Variable>) => string;

/** LA PHRASE D'ORIGINE DES CHIFFRES N-1 — la même sur la page du poste et sur la revue du dossier. */
export function phraseOrigineN1(t: T, o: OrigineN1): string {
  switch (o.source) {
    case 'dossier_n1': return t('poste.n1.dossier', { mission: o.mission?.name ?? '', periode: o.mission?.period_label ?? '' });
    case 'balance_n1': return t('poste.n1.balance');
    default: return t('poste.n1.aucune');
  }
}

/** Un montant signé : « +12 345,00 € », « −800,00 € », « 0,00 € ». */
export function signe(cents: number, eur: (c: number) => string): string {
  return (cents > 0 ? '+' : cents < 0 ? '−' : '') + eur(Math.abs(cents));
}

/** Un pourcentage signé, une décimale, ou « — » quand il ne se calcule pas. */
export function pct(v: number | null, locale: 'fr' | 'en'): string {
  if (v === null) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
