import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { chaines, lisible, horsCatalogue } from './langue';
import { LIBELLES, LOCALES, traduire, type Locale } from './i18n/catalogue';

// Le détecteur vit dans `langue.ts`, pas ici : une vérification que personne ne
// peut rejouer est une affirmation (règle 12). `npm run langue` la rejoue.

const APP = path.join(__dirname, '..', 'app');

describe('la langue des écrans', () => {
  it('aucune chaîne d’écran hors catalogue — quelle que soit sa langue', () => {
    const { restes, refus } = horsCatalogue(APP);
    /* Le compte des refus est PUBLIÉ, pas caché : c'est la seule catégorie que
       la règle laisse dehors, et elle doit rester visible pour qu'on la traite. */
    expect(refus).toBeGreaterThan(0);
    expect(restes.length, `chaînes d’écran hors catalogue :\n  ${restes.slice(0, 40).join('\n  ')}`)
      .toBe(0);
  });

  it('le détecteur détecte : sinon il garderait un écran vide', () => {
    /* Les quatre classes que la PREMIÈRE version laissait passer. */
    expect(chaines("export const F = { a: { titre: 'Acceptation de la mission' } };").chaines)
      .toContain('Acceptation de la mission');
    expect(chaines("<span>{x ? 'oui' : 'non'}</span>").chaines).toContain('oui');
    expect(chaines('<p title="l\'objet ancré n\'existe plus">x</p>').chaines)
      .toContain("l'objet ancré n'existe plus");
    expect(chaines('<h1>Missions</h1>').chaines.filter(lisible)).toEqual(['Missions']);
    /* Un nœud JSX écrit sur plusieurs lignes reste UNE phrase. */
    expect(chaines('<p>\n  Le compte <span>{c}</span> n’est couvert par aucun tiers\n</p>')
      .chaines.filter(lisible).join(' ')).toMatch(/Le compte/);
    /* Un appel au catalogue n'est PAS un littéral. */
    expect(chaines("<p>{t('vue.assignments')}</p>").chaines.filter(lisible)).toEqual([]);
    /* Le SQL, le style, les classes et les chemins ne sont pas de l'interface. */
    expect(chaines('q(`select u.id from app_user u join x on x.id = u.id`)').chaines.filter(lisible)).toEqual([]);
    expect(lisible('badge amber')).toBe(false);
    expect(lisible('1px solid var(--line)')).toBe(false);
    expect(lisible('/eng/${id}/scoping')).toBe(false);
    /* Un message de refus est relevé À PART, pas compté comme un libellé. */
    expect(chaines("throw new Error('la mission n’est pas acceptée');").refus)
      .toContain('la mission n’est pas acceptée');
  });
});

describe('le catalogue de libellés', () => {
  const cles = Object.keys(LIBELLES) as (keyof typeof LIBELLES)[];

  it('chaque clé porte les deux locales, et les mêmes variables', () => {
    for (const cle of cles) {
      const e = LIBELLES[cle] as Record<Locale, string>;
      for (const l of LOCALES) expect(e[l], `${cle}.${l}`).toBeTruthy();
      const vars = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',');
      expect(vars(e.en), `variables divergentes sur ${cle}`).toBe(vars(e.fr));
    }
  });

  it('aucune clé morte : un libellé que personne n’affiche est un libellé qui ment', () => {
    const src = fichiersTous(path.join(__dirname, '..'));
    const texte = src.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    /* UNE CLÉ CONSTRUITE N'EST PAS UNE CLÉ MORTE. Six clés se composent à
       l'exécution (`atl.champ.${n}`, `note.type.${x}`, `portal.item.${s}`…) :
       une recherche littérale les déclarerait mortes, et les supprimer ferait
       tomber l'écran qui les emploie. On reconnaît donc le PRÉFIXE construit. */
    const prefixes = [...texte.matchAll(/`([\w.]+)\.\$\{/g)].map((m) => `${m[1]}.`);
    const mortes = cles.filter((c) => !texte.includes(`'${c}'`)
      && !prefixes.some((p) => c.startsWith(p)));
    expect(mortes.length, `clés définies et jamais employées :\n  ${mortes.slice(0, 30).join('\n  ')}`).toBe(0);
  });

  it('aucun doublon sémantique : un concept, une entrée', () => {
    const parFr = new Map<string, string[]>();
    for (const cle of cles) {
      const fr = (LIBELLES[cle] as Record<Locale, string>).fr;
      /* Les mots trop courts se répètent légitimement (« Total », « — »). */
      if (fr.length < 12) continue;
      (parFr.get(fr) ?? parFr.set(fr, []).get(fr)!).push(cle);
    }
    const doublons = [...parFr.entries()].filter(([, v]) => v.length > 1);
    expect(doublons.length, `même phrase sous plusieurs clés :\n  ${doublons.slice(0, 20).map(([f, v]) => `${v.join(' = ')} → « ${f.slice(0, 50)} »`).join('\n  ')}`)
      .toBe(0);
  });

  it('une clé inconnue se dénonce au lieu de faire tomber la page', () => {
    /* `traduire` lisait `LIBELLES[cle][locale]` : sur une clé absente — et il en
       existe six, construites dynamiquement — c'était une page 500 pleine. */
    expect(traduire('fr', 'cle.qui.nexiste.pas' as never)).toBe('⟨cle.qui.nexiste.pas⟩');
  });
});

function fichiersTous(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiersTous(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
