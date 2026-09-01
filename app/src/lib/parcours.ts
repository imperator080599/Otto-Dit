// LE PARCOURS NE DOIT PAS POUVOIR MAIGRIR EN SILENCE (défaut n°22).
//
// `npm run clics` conduit le chemin entier et compte ses échecs. Ce qu'il ne
// voyait pas : une station qui N'EST PLUS CONDUITE. Le scénario porte cent
// quatre-vingts vérifications, dont beaucoup derrière un `if` — « si le bouton
// est là, clique ». Le jour où le bouton change de nom, le `if` devient faux,
// la station disparaît du rapport, et le rapport reste VERT avec moins
// d'étapes. Un harnais qui vérifie moins qu'hier sans le dire est le silence lu
// comme un succès (règle 13) ; c'est exactement ainsi que dix-huit stations ont
// pu s'éteindre entre deux livraisons.
//
// DEUX GARDES, UN SEUL FICHIER FIGÉ (docs/PARCOURS.json) :
//   · la garde STATIQUE lit le scénario et dénonce une station DISPARUE DU
//     CODE — elle coûte une seconde et s'éprouve contre un cas connu mauvais ;
//   · la garde D'EXÉCUTION, dans `npm run clics`, dénonce une station présente
//     dans le code mais JAMAIS ATTEINTE — le silence que la première ne voit
//     pas.

/**
 * Une station figée.
 *
 * `gabarit` DIT COMMENT LIRE `nom`, et ce n'est pas un détail. Une première
 * version figeait les noms CONSTRUITS sur leur début — « mes travaux : » —
 * et ce préfixe de quatorze caractères avalait les six stations « mes
 * travaux : … » qui le suivaient : elles pouvaient toutes disparaître sans
 * que la garde ne bronche. Un nom construit est donc figé comme une
 * EXPRESSION, ancrée aux deux bouts, où seules les parties variables sont
 * libres.
 */
export interface Station { nom: string; gabarit: boolean }

const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ce que le code écrit (`\'`, `\\`) contre ce que le harnais dira à l'exécution. */
const denoter = (s: string): string => s.replace(/\\(['"`\\])/g, '$1');

/**
 * Les stations DÉCLARÉES par le scénario : le premier argument de chaque
 * `dire(` — c'est-à-dire chaque vérification que le parcours prétend produire.
 */
export function stationsDe(code: string, ecartees: string[] = []): Station[] {
  const out: Station[] = [];
  const vues = new Set<string>();
  /* LE GUILLEMET DOUBLE COMPTE AUSSI. Ne lire que `'` et `` ` `` laisserait une
     station écrite autrement disparaître du figé sans que rien ne le dise —
     dans le module dont c'est précisément le métier. */
  for (const m of code.matchAll(/\bdire\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
    const brut = denoter(m[2]).trim();
    const gabarit = brut.includes('${');
    /* Les parties FIXES sont exigées ; les parties variables sont libres. */
    const nom = gabarit
      ? `^${brut.split(/\$\{[^}]*\}/).map(echapper).join('[\\s\\S]*')}$`
      : brut;
    /* UN NOM TROP COURT N'IDENTIFIE RIEN — mais l'écarter EN SILENCE serait le
       défaut que ce module existe pour refuser. On le RAPPORTE. */
    if (brut.length < 12) { ecartees.push(brut); continue; }
    const cle = `${gabarit ? 'g' : 'x'}|${nom}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push({ nom, gabarit });
  }
  return out;
}

/**
 * Le figé, DÉCLARÉ UNE SEULE FOIS. Deux interfaces locales aux formes
 * incompatibles (`string[]` d'un côté, `Station[]` de l'autre) laissaient
 * `tsc` muet sur une divergence qui aurait vidé la garde.
 */
export interface Fige { declarees: Station[]; conduites: Station[] }

const cle = (s: Station): string => `${s.gabarit ? 'g' : 'x'}|${s.nom}`;

/** Les stations figées que le code ne déclare plus. */
export function disparues(fige: Station[], courant: Station[]): Station[] {
  const vues = new Set(courant.map(cle));
  return fige.filter((s) => !vues.has(cle(s)));
}

/** Une station figée est-elle atteinte par ce nom conduit ? */
export function atteinte(s: Station, nom: string): boolean {
  return s.gabarit ? new RegExp(s.nom).test(nom) : s.nom === nom;
}

/** Les stations figées qu'une exécution n'a PAS atteintes. */
export function jamaisAtteintes(fige: Station[], conduites: string[]): Station[] {
  return fige.filter((s) => !conduites.some((n) => atteinte(s, n)));
}

/**
 * L'empreinte des noms CONDUITS, à figer. Un nom qui correspond exactement à
 * une station littérale se fige tel quel ; sinon, et seulement sinon, on
 * cherche le gabarit qui l'accepte. L'ordre compte : l'inverse laisserait un
 * gabarit absorber des stations littérales voisines.
 */
export function empreintes(noms: string[], declarees: Station[]): Station[] {
  const litteraux = new Set(declarees.filter((s) => !s.gabarit).map((s) => s.nom));
  const gabarits = declarees.filter((s) => s.gabarit);
  const out: Station[] = [];
  const vues = new Set<string>();
  for (const n of noms) {
    let st: Station;
    if (litteraux.has(n)) st = { nom: n, gabarit: false };
    else {
      const g = gabarits.find((s) => atteinte(s, n));
      /* Un nom qu'aucune déclaration ne reconnaît est figé TEL QUEL : mieux
         vaut une station figée trop précisément qu'une station perdue. */
      st = g ?? { nom: n, gabarit: false };
    }
    if (vues.has(cle(st))) continue;
    vues.add(cle(st));
    out.push(st);
  }
  return out;
}
