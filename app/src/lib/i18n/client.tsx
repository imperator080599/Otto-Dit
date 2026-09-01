'use client';

import { createContext, useContext } from 'react';
import { traduire, type CleLibelle, type Locale } from './catalogue';

// LA LANGUE DANS LE NAVIGATEUR.
//
// Le catalogue est une donnée PURE : un composant client peut l'importer sans
// faire descendre la base avec lui. Ce qui manque au navigateur, c'est la
// LOCALE — elle vit en base, sur le cabinet. Le layout racine la lit une fois
// et la pose ici ; les composants clients traduisent alors avec exactement la
// même fonction que les composants serveur.
//
// C'est le remplaçant du passage de libellés en propriétés : une propriété par
// mot ne tient pas à trois cents mots, et deux mécanismes de traduction
// finissent toujours par diverger (règle 13).

const Ctx = createContext<Locale>('en');

export function FournisseurLocale({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

/** Le traducteur, côté navigateur : `const t = useT(); t('note.post')`. */
export function useT(): (cle: CleLibelle, vars?: Record<string, string | number>) => string {
  const l = useContext(Ctx);
  return (cle, vars) => traduire(l, cle, vars);
}
