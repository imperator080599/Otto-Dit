import { q01 } from '@/lib/db/client';
import { getSessionUser } from '@/lib/core/auth';
import { LOCALES, traduire, type CleLibelle, type Locale, type Variable } from './catalogue';

export { LOCALES, traduire };
export type { CleLibelle, Locale, Variable };

/** La langue du CABINET — pas de l'utilisateur : c'est un réglage de cabinet. */
export async function localeDuCabinet(tenantId: string): Promise<Locale> {
  /* LA LANGUE NE FAIT PAS TOMBER UN ÉCRAN. `locale()` est appelée par le layout
     RACINE : une base indisponible, ou une migration 0031 non appliquée, aurait
     rendu 500 sur les 81 routes — y compris sur une 404 — alors que la seule
     chose manquante est un réglage d'affichage. On retombe sur le défaut du
     produit, et on le dit dans le journal plutôt que dans la figure de
     l'utilisateur. */
  try {
    const r = await q01<{ locale: string }>(`select locale from tenant where id = $1`, [tenantId]);
    const l = r?.locale as Locale | undefined;
    return l && (LOCALES as readonly string[]).includes(l) ? l : 'en';
  } catch (e) {
    console.warn('locale du cabinet illisible — repli sur « en » :', (e as Error).message);
    return 'en';
  }
}

/**
 * La locale de la session. Anglais par défaut — y compris sans session : un
 * écran de connexion n'a pas de cabinet, et le défaut du produit est l'anglais.
 */
export async function locale(): Promise<Locale> {
  try {
    const u = await getSessionUser();
    return u ? localeDuCabinet(u.tenant_id) : 'en';
  } catch {
    return 'en';
  }
}

/** Le traducteur de la session : `const t = await tr(); t('vue.assignments')`. */
export async function tr(): Promise<(cle: CleLibelle, vars?: Record<string, Variable>) => string> {
  const l = await locale();
  return (cle, vars) => traduire(l, cle, vars);
}
