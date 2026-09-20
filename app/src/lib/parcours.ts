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
 * P0-03 (AUD-17). Une assertion `dire(nom, true, …)` ne teste RIEN : son
 * deuxième argument est le littéral JavaScript `true`, jamais un état lu à
 * l'écran — elle passe même quand le produit est cassé. Cette garde dénonce
 * chaque site, par le nom de la station qui le porte, pour que `npm run
 * parcours` (donc `npm run verify`) refuse d'en laisser un s'introduire.
 * N'attrape QUE le littéral `true` — un booléen calculé (`enAttente === 0`,
 * `envoyees > 0`) n'est jamais dénoncé, quelle que soit sa valeur au moment
 * du run : c'est la forme du code qui est jugée, pas le résultat.
 */
export function direVide(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/\bdire\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1\s*,\s*true\s*,/gs)) {
    out.push(denoter(m[2]).trim());
  }
  return out;
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

/**
 * P0-02 (AUD-16). Une `pageerror` #418 de SIGNATURE CONNUE (docs/instantanes/parcours-
 * avertissements.json) est comptée en avertissement plutôt qu'en échec bloquant — mais SEULEMENT
 * la signature nommée, jamais « toute erreur navigateur ». Une signature se juge sur la PREMIÈRE
 * divergence d'hydratation de l'incident (`Ecart`, `src/lib/core/hydratation.ts`) : le côté
 * CLIENT doit porter le motif nommé, et le côté SERVEUR ne doit PAS le porter (sinon une vraie
 * divergence de contenu qui contiendrait par hasard le même mot serait classée à tort). Une
 * incident sans première divergence connue (SANS sonde, ou dont le message ne correspond à AUCUNE
 * signature) n'est JAMAIS classé — il reste un échec bloquant, ce qui est le comportement par
 * défaut si `docs/instantanes/parcours-avertissements.json` est absent ou vide.
 */
export interface SignatureAvertissement {
  id: string;
  motif: string;
  plafond: number;
  raison: string;
  depuis: string;
}

export interface Avertissements { signatures: SignatureAvertissement[] }

/**
 * REVUE HOSTILE (2026-09-20, P0-02) : la première version ne lisait QUE `ecarts[0]` — exactement
 * le défaut que `divergences()` (`src/lib/core/hydratation.ts`) existe pour refuser (son propre
 * en-tête : le 2026-09-03, la première divergence était le bruit `rail-astuce` connu et MASQUAIT
 * un vrai défaut injecté plus loin dans le même incident). Corrigé : un incident n'est classé QUE
 * si l'incident tient en UNE SEULE divergence (`ecarts.length === 1`) ET qu'elle correspond à une
 * signature connue — jamais sur la première d'une liste plus longue. C'est délibérément PLUS
 * ÉTROIT que ce que les mesures montrent (F60, docs/CHASSE.md : deux des quatre incidents connus
 * portent 10 à 21 divergences, toutes lues comme du bruit F11 après relecture manuelle) : sous-
 * classer laisse un incident réel en échec bloquant (règle 25, le défaut sûr) ; sur-classer
 * masquerait un vrai défaut derrière un bruit toléré (règle 17/18, le défaut qu'on refuse). Élargir
 * à la famille F11 (re-sérialisation CSS des raccourcis) exige sa propre signature, structurelle,
 * pas une extension de celle-ci — non fait ici, hors périmètre de P0-02.
 */
export function classifierIncident(
  ecarts: { serveur: string; client: string }[] | undefined,
  signatures: SignatureAvertissement[],
): string | null {
  if (!ecarts || ecarts.length !== 1) return null;
  const [seule] = ecarts;
  for (const s of signatures) {
    if (seule.client.includes(s.motif) && !seule.serveur.includes(s.motif)) return s.id;
  }
  return null;
}

/**
 * Sépare les `pageerror` (toutes, dans l'ordre) en avertissements comptés (signature connue) et
 * `dursReels` (tout le reste : les autres lignes de `durs` — `console`/HTTP 5xx —, ET toute
 * `pageerror` non classée). Corrélation par POSITION entre `pageerrors` et `incidents` : la
 * sonde d'hydratation (`scripts/clics/hydratation.ts`) ne capture QUE les codes 418/419/422/423/
 * 425, dans le même ordre que les `pageerror` surviennent — un `pageerror` d'un autre code n'a
 * jamais d'entrée dans `incidents` et n'avance donc jamais l'index correspondant : il reste, à
 * raison, non classable.
 */
export function classerPageerrors(
  durs: string[],
  pageerrors: string[],
  incidents: { ecarts: { serveur: string; client: string }[] }[],
  signatures: SignatureAvertissement[],
): { dursReels: string[]; avertissementsComptes: Record<string, number> } {
  const CODE_SONDE = /Minified React error #(418|419|422|423|425)\b/;
  const nonPageerror = durs.filter((d) => !pageerrors.includes(d));
  const dursReels: string[] = [...nonPageerror];
  const avertissementsComptes: Record<string, number> = {};
  let iIncident = 0;
  for (const ligne of pageerrors) {
    if (!CODE_SONDE.test(ligne)) { dursReels.push(ligne); continue; }
    const incident = incidents[iIncident];
    iIncident++;
    const id = classifierIncident(incident?.ecarts, signatures);
    if (id) avertissementsComptes[id] = (avertissementsComptes[id] ?? 0) + 1;
    else dursReels.push(ligne);
  }
  return { dursReels, avertissementsComptes };
}

/** Un plafond DÉPASSÉ (jamais atteint pile — le plafond mesuré lui-même est admis) rougit le run. */
export function depassementsDePlafond(
  comptes: Record<string, number>,
  signatures: SignatureAvertissement[],
): string[] {
  const out: string[] = [];
  for (const [id, n] of Object.entries(comptes)) {
    const sig = signatures.find((s) => s.id === id);
    if (sig && n > sig.plafond) out.push(`${id} : ${n} > plafond ${sig.plafond}`);
  }
  return out;
}
