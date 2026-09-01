import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LIBELLES, LOCALES, traduire, type CleLibelle } from './catalogue';

// LE CATALOGUE SE GARDE PAR TEST — « un concept = une entrée, dans chaque
// locale servie » (revue n°2 §2).
//
// Ce que ce garde REMPLACE : rien. Il s'AJOUTE. Le lexique français continue de
// tenir la règle « un concept = un mot » sur les écrans non encore migrés ;
// le retirer maintenant laisserait ces écrans sans règle du tout, et la
// migration est progressive par décision (les écrans migrent quand ils sont
// touchés).

describe('le catalogue de libellés', () => {
  it('chaque entrée existe dans TOUTES les locales servies, et n’est jamais vide', () => {
    const manquantes: string[] = [];
    for (const [cle, e] of Object.entries(LIBELLES)) {
      for (const l of LOCALES) {
        const v = (e as Record<string, string>)[l];
        if (!v || !v.trim()) manquantes.push(`${cle} [${l}]`);
      }
    }
    expect(manquantes, 'entrées absentes ou vides').toEqual([]);
    expect(Object.keys(LIBELLES).length).toBeGreaterThan(40);
  });

  it('les variables d’un libellé sont les MÊMES dans chaque locale', () => {
    /* Une variable présente en anglais et absente en français rendrait
       « {n} à venir » littéralement, sans que rien n'échoue. */
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const divergentes: string[] = [];
    for (const [cle, e] of Object.entries(LIBELLES)) {
      const refs = new Set(LOCALES.map((l) => vars((e as Record<string, string>)[l])));
      if (refs.size > 1) divergentes.push(cle);
    }
    expect(divergentes, 'variables divergentes entre locales').toEqual([]);
  });

  it('l’anglais est le DÉFAUT, et la substitution fonctionne', () => {
    expect(traduire('en', 'vue.assignments')).toBe('My assignments');
    expect(traduire('fr', 'vue.assignments')).toBe('Mes attributions');
    expect(traduire('en', 'rail.aVenir', { n: 3 })).toBe('3 not yet available');
  });

  it('aucune clé appelée dans le code n’est absente du catalogue', () => {
    /* Le typage l'empêche déjà à la compilation ; ce test le vérifie sur le
       TEXTE, parce qu'un `t('...' as CleLibelle)` contournerait le typage. */
    const src = path.join(__dirname, '..', '..');
    const fichiers: string[] = [];
    const marcher = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) marcher(p);
        else if (/\.tsx?$/.test(e.name) && !/catalogue\.ts$|i18n\.test\.ts$/.test(e.name)) fichiers.push(p);
      }
    };
    marcher(src);
    const connues = new Set(Object.keys(LIBELLES));
    const inconnues = new Set<string>();
    for (const f of fichiers) {
      const code = fs.readFileSync(f, 'utf8');
      /* Une clé de catalogue porte un POINT (`vue.assignments`). L'exiger
         évite de confondre tout appel d'une fonction nommée `t` avec une
         traduction — la première version condamnait `t('ouvrir')` de l'écran
         « Interroger », qui n'a rien à voir. */
      for (const m of code.matchAll(/\bt\(\s*'([a-z][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)'/g)) {
        if (!connues.has(m[1])) inconnues.add(`${path.relative(src, f)} → ${m[1]}`);
      }
    }
    expect([...inconnues], 'clés appelées mais absentes du catalogue').toEqual([]);
  });
});

describe('l’échelle de statuts', () => {
  it('a un libellé catalogué pour chaque statut', async () => {
    const { ORDRE_STATUT } = await import('@/lib/services/sections');
    for (const st of ORDRE_STATUT) {
      expect(Object.keys(LIBELLES)).toContain(`statut.${st}` as CleLibelle);
    }
  });

  it('n’utilise PAS le rouge : il est réservé à ce qui bloque (vigilance §4)', async () => {
    const { ECHELLE } = await import('@/lib/services/sections');
    for (const [statut, v] of Object.entries(ECHELLE)) {
      expect(v.classe, `${statut} ne doit pas être rouge`).not.toBe('red');
      /* La couleur n'est jamais seule : chaque statut porte un repère de forme
         ET un libellé, pour rester lisible en daltonisme et à l'impression. */
      expect(v.repere.length, statut).toBeGreaterThan(0);
    }
  });
});
