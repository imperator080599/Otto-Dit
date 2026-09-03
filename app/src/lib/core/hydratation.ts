// LA COMPARAISON SERVEUR/CLIENT DU #418, PURE (mandat du soir, étage 0.4).
//
// Elle vit ici, et non dans le harnais, pour une raison : un comparateur qui
// répondrait « aucune divergence » à tout passerait pour sain sur un parcours
// vert. Ici, il est éprouvé contre des cas connus MAUVAIS (règle 17) sans
// navigateur, en quelques millisecondes.
//
// CE QUE CET INSTRUMENT FAIT, ET OÙ IL S'ARRÊTE. Il compare le CORPS du HTML
// servi au `outerHTML` relevé dans le navigateur au moment de l'erreur, après
// avoir retiré ce que React et le navigateur transforment LÉGITIMEMENT. Il ne
// dit donc pas « voici le #418 » : il dit « voici le premier endroit où les
// deux textes cessent d'être le même, une fois le bruit connu écarté ». Chaque
// famille de bruit écartée est nommée ci-dessous et tenue par un cas connu
// mauvais dans hydratation.test.ts — sans quoi elle serait un aveuglement.

/* LES ÉLÉMENTS QUE REACT AJOUTE POUR L'ACTION SERVEUR, ET RETIRE À
   L'HYDRATATION. Une page qui porte `<form action={uneActionServeur}>` est
   servie avec les champs cachés `$ACTION_REF_n` / `$ACTION_n:k` (la
   dégradation gracieuse : sans JavaScript, le formulaire poste vraiment), et
   le DOM hydraté ne les porte plus. Ce n'est pas une divergence de rendu :
   c'est React qui reprend la main. Mesuré sur les quatre incidents capturés
   la nuit du 3 septembre — c'était le PREMIER écart signalé sur les quatre,
   et il masquait tout ce qui suit. */
const CHAMP_ACTION = /^\$ACTION/;
/* Sur le même formulaire, React sert `action="" encType=… method="POST"` et
   remplace `action` à l'hydratation par un garde-fou `javascript:throw …`. Les
   trois attributs partent ENSEMBLE et SEULEMENT sur ce formulaire-là : un
   `action` qui vaut autre chose est comparé normalement (cas connu mauvais
   « une action de formulaire qui diffère vraiment »). */
const ACTION_HYDRATEE = /^javascript:throw new Error\('A React form/;
const ATTRS_DE_L_ACTION = new Set(['action', 'enctype', 'method']);

interface Attr { nom: string; valeur: string | null }

function attributs(brut: string): Attr[] {
  const out: Attr[] = [];
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(brut))) {
    const valeur = m[2] ?? m[3] ?? m[4] ?? null;
    out.push({ nom: m[1].toLowerCase(), valeur });
  }
  return out;
}

/** Les balises réécrites sous une forme canonique : nom et attributs en
 *  minuscules, attributs TRIÉS, barre de fermeture retirée.
 *
 *  POURQUOI TRIER. Le navigateur ne re-sérialise pas les attributs dans
 *  l'ordre du source mais dans l'ordre où ils ont été POSÉS : le même
 *  formulaire s'écrit `class="row" action=""` côté serveur et
 *  `action="…" class="row"` côté client. Sans le tri, chaque formulaire, chaque
 *  `<input>`, chaque `<meta>` serait dénoncé — et le comparateur parlerait
 *  sans rien dire. Le tri ne cache rien : un attribut présent d'un seul côté,
 *  ou dont la VALEUR diffère, reste dénoncé (deux cas connus mauvais). */
function balises(s: string): string {
  return s.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s/>]*))?)*)\s*\/?>/g,
    (_tout, nom: string, brut: string) => {
      const tag = nom.toLowerCase();
      let attrs = attributs(brut);
      if (tag === 'input' && CHAMP_ACTION.test(attrs.find((a) => a.nom === 'name')?.valeur ?? '')) return '';
      if (tag === 'form') {
        const action = attrs.find((a) => a.nom === 'action')?.valeur;
        if (action === '' || (typeof action === 'string' && ACTION_HYDRATEE.test(action))) {
          attrs = attrs.filter((a) => !ATTRS_DE_L_ACTION.has(a.nom));
        }
      }
      const corps = attrs
        .sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0))
        .map((a) => (a.valeur === null ? a.nom : `${a.nom}="${a.valeur}"`))
        .join(' ');
      return corps ? `<${tag} ${corps}>` : `<${tag}>`;
    },
  );
}

/** Le HTML réduit à ce qui doit être comparé — normalisé pour ne pas accuser
 *  ce que React et Next transforment LÉGITIMEMENT à l'hydratation. */
export function normaliser(html: string): string {
  /* ON NE COMPARE QUE LE CORPS, ET LA RAISON EST MESURÉE. Le premier jet
     comparait les documents entiers : chaque incident rendait « à l'octet 1 »,
     parce que le HTML servi commence par `<!DOCTYPE html>` que
     `document.documentElement.outerHTML` ne porte pas, et parce que React
     RÉORDONNE les attributs et les balises de `<head>` à l'hydratation (le
     `<link rel=stylesheet>` passe avant les `<meta>`). Un comparateur qui
     dénonce le doctype à chaque fois ne dénonce rien : c'était un instrument
     qui parle sans rien dire (règle 13). Le corps, lui, est rendu dans l'ordre
     de l'arbre des deux côtés. */
  const corps = (s: string) => {
    const i = s.indexOf('<body');
    if (i === -1) return s;
    const j = s.lastIndexOf('</body>');
    return s.slice(s.indexOf('>', i) + 1, j === -1 ? undefined : j);
  };
  /* TROIS ARTEFACTS DE SÉRIALISATION QUI NE SONT PAS DES DIVERGENCES, et que
     la première version accusait — donc trois faux positifs à chaque incident,
     qui masquaient le vrai :
       · `<!-- -->` : le séparateur que React émet côté serveur entre deux
         expressions voisines, et que le DOM ne conserve pas ;
       · `style="a:1px"` contre `style="a: 1px;"` : le navigateur RE-SÉRIALISE
         toute déclaration de style ;
       · `&#x27;` contre `'` : les entités sont décodées dans le DOM. */
  const entites = (s: string) => s
    .replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const styles = (s: string) => s.replace(/style="([^"]*)"/g, (_m, v: string) =>
    `style="${String(v).replace(/\s*:\s*/g, ':').replace(/;\s*$/, '').replace(/;\s*/g, ';').trim()}"`);
  /* L'ORDRE COMPTE : les balises sont canonisées AVANT que les entités soient
     décodées, sinon un `&quot;` dans une valeur d'attribut deviendrait un vrai
     guillemet et couperait l'attribut en deux au moment de l'analyse. */
  const net = (s: string) => entites(styles(balises(corps(s)
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<template[\s\S]*?<\/template>/g, '')
    .replace(/<next-route-announcer[\s\S]*?<\/next-route-announcer>/g, '')
    .replace(/ data-reactroot="[^"]*"/g, '')
    .replace(/<!-- -->/g, '')
    .replace(/<!--\$-->|<!--\/\$-->|<!--\$\?-->|<!--\/\$\?-->|<!--\$!-->/g, ''))))
    /* LES ESPACES ASCII SEULEMENT — ET C'EST UN DÉFAUT QUE CET INSTRUMENT A EU.
       La version d'avant écrasait `/\s+/`, qui en JavaScript comprend
       l'espace insécable (U+00A0) ET l'espace insécable ÉTROITE (U+202F). Or
       `Intl.NumberFormat('fr-FR')` sépare les milliers par l'une ou par
       l'autre SELON LA VERSION D'ICU : celle de Node et celle du navigateur ne
       sont pas la même. C'est une divergence de nœud de texte sur CHAQUE
       montant en euros de l'application — exactement la famille que cet
       instrument existe pour attraper — et il l'aurait effacée avant de
       comparer. Les deux espaces sont donc rendus VISIBLES, et distincts. */
    .replace(/\u00a0/g, '⟦nbsp⟧').replace(/\u202f/g, '⟦nnbsp⟧')
    .replace(/[ \t\n\r\f\v]+/g, ' ')
    .trim();
  return net(html);
}

/* LA LEÇON DE LA PREMIÈRE MESURE, ET LA RAISON DE CE QUI SUIT. La version
   d'avant ne rendait que le PREMIER point de divergence. Sur les trois
   incidents du poste de travail, ce premier point était l'astuce du rail —
   rendue dans un `useEffect`, donc absente du HTML servi et présente dans le
   DOM relevé, et parfaitement saine. Elle arrive plus tôt dans le corps que le
   défaut volontairement injecté pour éprouver la sonde : l'instrument nommait
   le bruit et TAISAIT ce qu'il existait pour attraper. C'est mot pour mot « le
   silence lu comme un succès » (règle 13). Il rend désormais TOUTES les
   divergences, et l'œil humain trie. */

/** Le corps découpé en balises et en textes : l'unité de comparaison. */
function jetons(s: string): string[] {
  return s.split(/(<[^>]*>)/).filter((x) => x !== '' && x !== ' ');
}

const RESYNC = 6;      // combien de jetons identiques font une reprise crédible
const FENETRE = 400;   // au-delà, on ne cherche plus : on le dit

function reprend(a: string[], i: number, b: string[], j: number): boolean {
  for (let k = 0; k < RESYNC; k++) {
    if (i + k >= a.length && j + k >= b.length) return true;
    if (a[i + k] !== b[j + k]) return false;
  }
  return true;
}

export interface Ecart {
  /** le rang du jeton servi où l'écart commence — pour situer, pas pour citer */
  jeton: number;
  serveur: string;
  client: string;
  contexte: string;
}

/** TOUS les endroits où le HTML servi et le DOM relevé cessent d'être le même,
 *  une fois écarté le bruit connu. Une liste vide veut dire : aucune. */
export function divergences(serveur: string, client: string): Ecart[] {
  const a = jetons(normaliser(serveur));
  const b = jetons(normaliser(client));
  const out: Ecart[] = [];
  let i = 0; let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    const contexte = a.slice(Math.max(0, i - 4), i).join('');
    /* On cherche la plus courte reprise : d jetons sautés d'un côté, de
       l'autre, ou des deux. Le plus petit d gagne — sinon un écart d'un jeton
       serait rendu comme un remplacement de tout le reste de la page. */
    let trouve = false;
    for (let d = 1; d <= FENETRE && !trouve; d++) {
      const essais: [number, number][] = [[i + d, j], [i, j + d], [i + d, j + d]];
      for (const [ia, jb] of essais) {
        if (ia > a.length || jb > b.length) continue;
        if (!reprend(a, ia, b, jb)) continue;
        out.push({ jeton: i, serveur: a.slice(i, ia).join(''), client: b.slice(j, jb).join(''), contexte });
        i = ia; j = jb; trouve = true; break;
      }
    }
    if (!trouve) {
      out.push({
        jeton: i, contexte,
        serveur: a.slice(i, i + 20).join(''),
        client: b.slice(j, j + 20).join(''),
      });
      break; // AUCUNE REPRISE TROUVÉE : le dire, jamais faire semblant de continuer
    }
  }
  return out;
}

/** La forme lisible d'un écart, pour un rapport lu par un humain. */
export function direEcart(e: Ecart, largeur = 220): string {
  const coupe = (s: string) => (s.length > largeur ? `${s.slice(0, largeur)}…` : s) || '(rien)';
  return `au jeton ${e.jeton}, après …${e.contexte.slice(-90)}\n`
    + `    SERVEUR : ${coupe(e.serveur)}\n    CLIENT  : ${coupe(e.client)}`;
}

/** Le PREMIER point de divergence — conservé pour les cas connus mauvais qui
 *  ne posent qu'une question : « le voit-il, oui ou non ? ». */
export function divergence(serveur: string, client: string): string | null {
  const tous = divergences(serveur, client);
  return tous.length === 0 ? null : direEcart(tous[0]);
}
