import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// LE LEXIQUE S'APPLIQUE, IL NE SE CONSULTE PAS (docs/LEXIQUE.md, §3.D).
//
// Un concept = un mot. La première version de ce test grepait des LIGNES de
// code, avec une heuristique de langue (« la ligne porte-t-elle un accent ? »)
// qui laissait passer la majorité des libellés courts — et elle ne regardait
// que les .tsx, alors que le rail et les catalogues portent des libellés
// depuis des .ts. Deux défauts de la même famille : chercher un mot n'est pas
// vérifier un chemin (règle 15).
//
// Cette version EXTRAIT d'abord le texte que l'utilisateur lit :
//   - le texte des nœuds JSX (entre deux balises) ;
//   - les attributs de libellé (placeholder, title, aria-label, label, alt) ;
//   - dans les .ts de service, les chaînes qui sont des PHRASES (une espace,
//     une majuscule ou un accent) — les libellés du rail, des catalogues et
//     des familles d'obstacles vivent là.
// puis applique les règles à CE TEXTE. Un identifiant, un import, une clé de
// mots-clés de recherche ne sont plus du texte d'écran.
//
// Ce que le test NE PEUT PAS faire, et qui reste à la revue éditoriale :
// distinguer deux concepts qui partagent une racine (« écart » du testing vs
// « anomalie » évaluée). Une règle qui ne se décide pas sans contexte n'est
// pas marquée ✓ dans LEXIQUE.md — mieux vaut une case vide qu'une case qui
// ment (règle 13).

const SRC = path.join(__dirname, '..');

/**
 * LA LANGUE SE LIT SUR LE TEXTE, PAS SUR LE FICHIER.
 *
 * La première version exemptait des FICHIERS entiers (« écrans hérités en
 * anglais ») : une exemption qui survit à son motif et couvre les libellés
 * français ajoutés depuis. Ici, chaque morceau de texte est jugé pour ce
 * qu'il est — « engagement » dans une phrase ANGLAISE est le mot juste ;
 * dans une phrase française, c'est la collision que le lexique interdit.
 *
 * Ce que cela laisse dehors, et qui est DIT dans LEXIQUE.md plutôt que
 * caché : les écrans encore anglais échappent aux règles françaises. Leur
 * francisation est un chantier nommé (M-13), pas une exception silencieuse.
 */
const STOPWORDS_FR = /\b(le|la|les|des|du|de|une|un|aux?|sur|dans|pour|qui|que|est|sont|et|ou|par|avec|sans|ne|pas|ce|cette|ces|leur|son|sa|ses|vos|votre|nos|notre|chaque|tout|toute)\b/i;

/** Ce texte est-il français ? Accent, mot-outil — ou trop court pour trancher. */
function francais(t: string): { fr: boolean; court: boolean } {
  const court = t.trim().split(/\s+/).length <= 3;
  return { fr: /[àâäéèêëîïôöùûüçœÀÉÈÊÎÔÇ]/.test(t) || STOPWORDS_FR.test(t), court };
}

interface Regle {
  motif: RegExp;
  regle: string;
  /** La règle ne vaut que dans un TITRE (th, h1..h4, summary). */
  titreSeulement?: boolean;
  /** Fichiers exemptés, par motif de chemin — motivés dans LEXIQUE.md. */
  saufFichier?: RegExp;
  /** La règle vaut quelle que soit la langue du texte (collision de concept). */
  toutesLangues?: boolean;
}

const REGLES: Regle[] = [
  { motif: /matérialité/i, regle: '« seuil de signification », jamais « matérialité »' },
  { motif: /feuille[s]? de travail/i, regle: '« papier », jamais « feuille de travail »' },
  /* « requête » est RÉSERVÉ à Interroger (NL→requête). L'écran ask/ garde le
     mot pour ce concept ; le contresens « requête au client » y reste interdit,
     l'exemption de fichier ne couvre donc pas la collision réelle. */
  { motif: /requête/i, regle: '« demande » pour le client — « requête » est réservé à Interroger',
    saufFichier: /(^|\/)ask\/|(^|\/)services\/query\// },
  { motif: /requêtes? (au|du|des|aux) client/i, regle: '« demande au client » — jamais « requête au client »', toutesLangues: true },
  { motif: /\bFSLI\b/, regle: '« poste » dans un libellé — FSLI reste un identifiant de code' },
  { motif: /\bengagements?\b/i, regle: '« dossier » ou « mission » à l\'écran — « engagement » est un mot de code' },
  { motif: /\btransactions?\b/i, regle: '« écriture » pour l\'écriture comptable — « transaction » est réservé au sens technique' },
  /* « justificatif » est toléré comme périphrase explicative (« les
     justificatifs demandés »), jamais comme TITRE de colonne ou de section :
     l'objet probant s'appelle « pièce ». */
  { motif: /justificatif/i, regle: '« pièce » en titre de colonne/section — « justificatif » reste une périphrase',
    titreSeulement: true, toutesLangues: true },
];

function fichiers(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p, ext));
    else if (ext.some((x) => e.name.endsWith(x)) && !e.name.includes('.test.')) out.push(p);
  }
  return out;
}

/** Un morceau de texte lu à l'écran, avec sa ligne. */
interface Texte { ligne: number; texte: string; titre: boolean }

/** Le texte VISIBLE d'un fichier d'écran (.tsx). */
export function texteEcran(source: string): Texte[] {
  const out: Texte[] = [];
  const lignes = source.split('\n');
  let dansCommentaire = false;
  lignes.forEach((l, i) => {
    /* Ni un commentaire, ni du SQL : ni l'un ni l'autre n'est lu à l'écran.
       (Deux faux positifs de la première version, corrigés ici plutôt
       qu'excusés au cas par cas.) */
    const nu = l.trim();
    if (dansCommentaire) { if (nu.includes('*/')) dansCommentaire = false; return; }
    if (nu.startsWith('/*') && !nu.includes('*/')) { dansCommentaire = true; return; }
    if (/^(\/\/|\*|\{\/\*|\/\*)/.test(nu)) return;
    if (/^(select|insert|update|delete|from|join|where|order by|group by|left join|and |on )/i.test(nu)) return;
    const ajoute = (texte: string, titre = false) => {
      const t = texte.replace(/\{[^}]*\}/g, ' ').replace(/&[a-z]+;/g, '\'').trim();
      if (t && /[a-zA-Zà-ÿ]/.test(t)) out.push({ ligne: i + 1, texte: t, titre });
    };
    /* Un titre : <th>…</th>, <h1..h4>…</h4>, <summary>…</summary>. */
    for (const m of l.matchAll(/<(th|h[1-4]|summary)\b[^>]*>([^<]*)</gi)) ajoute(m[2], true);
    /* Le texte d'un nœud JSX : entre > et <, sur la même ligne. */
    for (const m of l.matchAll(/>([^<>{}]{2,})</g)) ajoute(m[1]);
    /* Les attributs de libellé. */
    for (const m of l.matchAll(/\b(placeholder|title|aria-label|label|alt)=["']([^"']+)["']/gi)) ajoute(m[2]);
    /* Une ligne de texte JSX seule (paragraphe coupé par le formatage) :
       ni balise, ni accolade, ni code — juste des mots. */
    const nue = l.trim();
    if (nue && !/[<>{}=;]/.test(nue) && /^[A-Za-zÀ-ÿ«][^`]*$/.test(nue) && nue.includes(' ')) ajoute(nue);
  });
  return out;
}

/** Le texte de libellé d'un service (.ts) : les chaînes qui sont des phrases. */
export function texteService(source: string): Texte[] {
  const out: Texte[] = [];
  source.split('\n').forEach((l, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) return; // un commentaire n'est pas un écran
    /* Le VOCABULAIRE D'ENTRÉE n'est pas un libellé : les synonymes que
       l'utilisateur TAPE (examples, keywords, core) doivent au contraire
       couvrir les mots que le lexique bannit à l'écran — sinon la recherche
       ne comprend plus ce que les gens écrivent. */
    if (/\b(examples?|keywords?|core|synonym\w*|variantes?|mots)\s*:/.test(l)) return;
    for (const m of l.matchAll(/'((?:[^'\\]|\\.){6,}?)'|"((?:[^"\\]|\\.){6,}?)"/g)) {
      const t = (m[1] ?? m[2]).replace(/\\'/g, '\'').trim();
      /* Une PHRASE : une espace, et pas un chemin, une requête SQL, une clé. */
      if (!t.includes(' ')) continue;
      if (/^[a-z_]+ ?[:=]|select |insert |update |from |where |\bnull\b/i.test(t)) continue;
      if (/^[\/.]|\.\w{2,4}$|^https?:/.test(t)) continue;
      out.push({ ligne: i + 1, texte: t, titre: false });
    }
  });
  return out;
}

describe('lexique appliqué (docs/LEXIQUE.md)', () => {
  it('aucun synonyme interdit dans le texte lu à l\'écran', () => {
    const cibles: { rel: string; textes: Texte[] }[] = [
      ...fichiers(path.join(SRC, 'app'), ['.tsx']).map((f) => ({
        rel: path.relative(SRC, f).replace(/\\/g, '/'), textes: texteEcran(fs.readFileSync(f, 'utf8')),
      })),
      ...fichiers(path.join(SRC, 'lib', 'services'), ['.ts']).map((f) => ({
        rel: path.relative(SRC, f).replace(/\\/g, '/'), textes: texteService(fs.readFileSync(f, 'utf8')),
      })),
    ];
    const infractions: string[] = [];
    for (const { rel, textes } of cibles) {
      for (const r of REGLES) {
        if (r.saufFichier?.test(rel)) continue;
        for (const t of textes) {
          if (r.titreSeulement && !t.titre) continue;
          if (!r.toutesLangues) {
            const { fr, court } = francais(t.texte);
            /* Un texte long sans marqueur français est anglais : hors règles
               françaises (chantier de francisation, LEXIQUE.md). Un titre
               court et ambigu, lui, est jugé — c'est l'endroit le plus vu. */
            if (!fr && !court) continue;
          }
          if (r.motif.test(t.texte)) infractions.push(`${rel}:${t.ligne} — « ${t.texte.slice(0, 60)} » : ${r.regle}`);
        }
      }
    }
    expect(infractions, 'libellés hors lexique — corriger le libellé, ou motiver une exception DANS LEXIQUE.md').toEqual([]);
  });
});
