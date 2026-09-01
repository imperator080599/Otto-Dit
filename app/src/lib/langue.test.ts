import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// PLUS UNE SEULE CHAÎNE D'ÉCRAN HORS CATALOGUE (revue n°2, puis n°3).
//
// L'ÉTAT INTERMÉDIAIRE EST PIRE QUE L'ÉTAT INITIAL. Un rail anglais avec des
// infobulles françaises, un titre de page français au milieu d'entrées
// anglaises, un bandeau qui mélange les deux langues dans une même phrase :
// c'est le constat du fondateur, et il est juste. Une migration progressive
// « quand l'écran est touché » a produit exactement ça. La règle devient donc
// binaire, et c'est un test qui la tient.
//
// CE QUE CE TEST COUVRE : le texte que l'utilisateur LIT dans les écrans
// (`src/app`) — nœuds JSX et attributs de libellé. Un littéral français y est
// un échec ; un `{t('cle')}` n'est pas un littéral.
//
// CE QU'IL NE COUVRE PAS, ET QUI EST DIT PLUTÔT QUE CACHÉ : les messages de
// REFUS levés par les services. Ils sont user-visibles (le bandeau de refus les
// affiche) mais ils portent des faits variables ; les traduire par une chaîne
// serait recopier le défaut ailleurs. Ils appellent des CODES d'erreur
// paramétrés — un chantier de conception, nommé au registre, pas une passe de
// traduction. Leur compte est publié ci-dessous pour qu'il ne se perde pas.

const APP = path.join(__dirname, '..', 'app');

const ACCENT = /[àâäéèêëîïôöùûüçœÀÂÉÈÊËÎÏÔÖÙÛÜÇŒ]/;
const MOTS_TOUS = /\b(le|la|les|des|du|de|une|un|aux|sur|dans|pour|qui|que|est|sont|et|ou|par|avec|sans|ne|pas|ce|cette|ces|leur|son|sa|ses|vos|votre|nos|notre|chaque|tout|toute|au|en|il|elle|on|nous|vous)\b/gi;
/* DES MOTS FRANÇAIS SANS ACCENT ET SANS ÉQUIVALENT ANGLAIS. « Bonjour {nom} »
   n'avait ni accent ni mot-outil : le détecteur le laissait passer, et le
   portail restait moitié français. Un seul de ces mots suffit à conclure. */
const MOTS_NETS = /\b(bonjour|aucun|aucune|jamais|toujours|encore|depuis|ainsi|alors|donc|mais|dont|quand|comme|ici|celui|celle|cela|faire|fait|doit|peut|peuvent|avoir|moins|tous|toutes|bien|oui|non|merci|envoyer|ouvrir|fermer|ajouter|supprimer|choisir|valider|signer|voir|revoir|manque|manquant|dossier|demande|demandes|papier|papiers|ecart|ecarts|seuil|auditeur|exercice|travaux|libelle)\b/i;

/**
 * Le texte qu'un utilisateur LIT : nœuds JSX et attributs de libellé.
 *
 * LES COMMENTAIRES SONT RETIRÉS D'ABORD, et ce n'est pas un détail : les
 * commentaires de ce dépôt sont en français par décision, et un détecteur qui
 * les compte pousserait à les traduire ou à les supprimer — c'est-à-dire à
 * effacer le raisonnement pour faire passer un test.
 */
export function textesLus(code: string): string[] {
  code = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const out: string[] = [];
  /* Les attributs de libellé se relèvent AVANT le nettoyage : ce sont des
     chaînes entre guillemets, et le nettoyage les efface. */
  for (const m of code.matchAll(
    /(?:placeholder|title|aria-label|alt|label|summary)=\{?["'`]([^"'`]+)["'`]\}?/g)) out.push(m[1]);
  /* LES LITTÉRAUX NE SONT PAS DU TEXTE D'ÉCRAN. Un `select … join … on …`
     porte « on », « des », « la » ; sans ce nettoyage le détecteur accusait le
     SQL d'être de l'interface — et un détecteur qui crie faux se fait taire.
     Le texte d'un nœud JSX, lui, n'est JAMAIS entre guillemets. */
  code = code.replace(/`[^`]*`/g, ' ').replace(/"[^"\n]*"/g, ' ')
    .replace(/(^|[([,:={ ])'(?:\\.|[^'\\\n])*'/g, '$1 ');
  /* UN NŒUD JSX SE LIT SUR PLUSIEURS LIGNES et reste UNE phrase. Sans ce
     repliage, « Le compte <span>…</span> n’est couvert par aucun tiers »
     échappait au détecteur au seul motif que la balise ouvrante finissait la
     ligne — la moitié des phrases d'un écran soigné sont dans ce cas. */
  code = code.replace(/\s*\n\s*/g, ' ');

  /* LE TEXTE ENTRE DEUX EXPRESSIONS compte autant : « Date du rapport :
     {d} — non posée » est lu par l'utilisateur comme une phrase. La première
     version de ce détecteur ne voyait que les nœuds bornés par des balises, et
     laissait donc passer toute phrase entrecoupée d'une valeur. */
  for (const m of code.matchAll(/[>}]([^<>{}]+)[<{]/g)) out.push(m[1]);
  return out.map((s) => s.trim()).filter((s) => s.length > 2);
}

export function estFrancais(s: string): boolean {
  if (/^[\d\s.,%€:/·—–-]+$/.test(s)) return false;
  /* CE QUI RESTE DU CODE APRÈS NETTOYAGE N'EST PAS DE L'INTERFACE. Un
     `? fr : en)` porte « en », un `x.atteignable || tout)` porte « tout » : le
     détecteur les accusait d'être des libellés. Un détecteur qui crie faux se
     fait taire, et se taire est le défaut que ce fichier existe pour empêcher. */
  if (/===|!==|=>|\|\||&&|\?\?|\b(await|const|let|return|null|typeof)\b/.test(s)) return false;
  if (/\w=$/.test(s) || /^[,\s]*\w+:$/.test(s)) return false;
  /* UN SEUL MOT-OUTIL NE FAIT PAS UNE PHRASE FRANÇAISE : « Select an object
     on the left » porte « on », « demo runs on … » aussi. Sans accent, il faut
     DEUX mots-outils distincts — l'anglais en aligne rarement deux. */
  if (ACCENT.test(s) || MOTS_NETS.test(s)) return true;
  const outils = new Set((s.toLowerCase().match(MOTS_TOUS) ?? []).map((x) => x));
  return outils.size >= 2;
}

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

describe('la langue des écrans', () => {
  it('aucun littéral français dans un écran : tout passe par le catalogue', () => {
    const restes: string[] = [];
    for (const f of fichiers(APP)) {
      const code = fs.readFileSync(f, 'utf8');
      for (const s of textesLus(code)) {
        if (estFrancais(s)) restes.push(`${path.relative(APP, f)} → « ${s.slice(0, 70)} »`);
      }
    }
    expect(restes.length, `chaînes d’écran hors catalogue :\n  ${restes.slice(0, 40).join('\n  ')}`)
      .toBe(0);
  });

  it('le détecteur détecte : sinon il garderait un écran vide', () => {
    expect(estFrancais('Le contact clé fait le lien')).toBe(true);
    expect(estFrancais('Overview')).toBe(false);
    /* Sans accent ET sans mot-outil : « Bonjour » a laissé passer le portail. */
    expect(estFrancais('Bonjour ')).toBe(true);
    /* Un seul mot-outil ambigu ne suffit pas : l'anglais en porte aussi. */
    expect(estFrancais('Select an object on the left.')).toBe(false);
    expect(estFrancais('demo runs on recorded fixtures')).toBe(false);
    /* Ce qui reste du code après nettoyage n'est pas de l'interface. */
    expect(estFrancais('| null = null; let refus = ; if (de && a)')).toBe(false);
    expect(estFrancais('12,50 €')).toBe(false);
    expect(textesLus('<p>Bonjour tout le monde</p>')).toContain('Bonjour tout le monde');
    expect(textesLus('<input placeholder="Nom du client" />')).toContain('Nom du client');
    /* Un appel au catalogue n'est PAS un littéral. */
    expect(textesLus('<p>{t(\'vue.assignments\')}</p>')).toEqual([]);
    /* Le texte ENTRE deux expressions : « Date du rapport : {d} — non posée ». */
    expect(textesLus('<p>{d} — non posée sur ce dossier{x}</p>')).toContain('— non posée sur ce dossier');
    /* Un littéral n'est pas un nœud JSX : le SQL ne doit pas être accusé. */
    expect(textesLus("q<{a:string}>(`select u.id from app_user u join x on x.id = u.id`)")).toEqual([]);
    /* Un commentaire français n'est pas un écran. */
    expect(textesLus('/* rend un <div> (section entière) au lieu d\'un <span> */')).toEqual([]);
  });
});
