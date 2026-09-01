import { q01 } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { LOCALES, traduire, type CleLibelle, type Locale } from './catalogue';

export { LOCALES, traduire };
export type { CleLibelle, Locale };

/** La langue du CABINET — pas de l'utilisateur : c'est un réglage de cabinet. */
export async function localeDuCabinet(tenantId: string): Promise<Locale> {
  const r = await q01<{ locale: string }>(`select locale from tenant where id = $1`, [tenantId]);
  const l = r?.locale as Locale | undefined;
  return l && (LOCALES as readonly string[]).includes(l) ? l : 'en';
}

/**
 * La locale de la session. Anglais par défaut — y compris sans session : un
 * écran de connexion n'a pas de cabinet, et le défaut du produit est l'anglais.
 */
export async function locale(): Promise<Locale> {
  const u = await getSessionUser();
  return u ? localeDuCabinet(u.tenant_id) : 'en';
}

/** Le traducteur de la session : `const t = await tr(); t('vue.assignments')`. */
export async function tr(): Promise<(cle: CleLibelle, vars?: Record<string, string | number>) => string> {
  const l = await locale();
  return (cle, vars) => traduire(l, cle, vars);
}
