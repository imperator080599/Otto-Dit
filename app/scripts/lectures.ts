import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// UN FAIT STOCKÉ QUE PLUS AUCUN ÉCRAN NE REND N'EXISTE PAS (règle 13).
//
// CE QUI EST ARRIVÉ. Un balayage de prose — supprimer les paragraphes
// d'explication que le fondateur ne veut pas — a emporté HUIT chemins de
// lecture sur huit écrans : qui a consenti à être enregistré et quand, le
// dossier N-1 dont on reprend les conclusions, l'empreinte de population à
// laquelle l'échantillon se lie, le run du moteur qui a produit le papier, le
// dénominateur du ratio d'honoraires, la part de quantitatif du risque. Aucun
// test ne l'a vu : les services rendaient toujours les données, les écrans
// rendaient toujours 200, et le seul à s'en apercevoir a été le parcours
// cliqué — sur UN des huit.
//
// LA RÈGLE. Une EXPRESSION DE DONNÉE (`{objet.champ}`) retirée d'un écran doit
// réapparaître quelque part dans ce même écran. Sinon c'est une lecture perdue,
// et il faut la rétablir ou dire pourquoi elle disparaît.
//
// `npm run lectures [ref]` — la référence par défaut est `origin/main`.

const ici = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ici, '..', '..');
const ref = process.argv[2] ?? 'origin/main';

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
}

/* Le diff COMMITÉ depuis la référence, plus ce qui n'est pas encore commité :
   une lecture perdue dans l'arbre de travail est perdue tout autant. */
const diff = git('diff', ref, 'HEAD', '--', 'app/src/app')
  + git('diff', '--', 'app/src/app');

if (!diff.trim()) {
  console.log(`aucune différence d’écran depuis ${ref} — rien à vérifier.`);
  process.exit(0);
}

/* CE QUE LA RÈGLE NE PEUT PAS DISTINGUER, ET QU'ON DÉCLARE PLUTÔT QUE DE TAIRE.
   Le portail portait sa PROPRE table de libellés (`t.allDone`, `t.upload`…) ;
   elle a été remplacée par le catalogue (`t('portal.toutTransmis')`). Le champ
   change de nom parce que le mécanisme change, pas parce que la lecture
   disparaît. Toute autre exemption doit être écrite ici, avec sa raison. */
const EXEMPTS: { fichier: RegExp; champs: RegExp; pourquoi: string }[] = [
  {
    fichier: /portal\//,
    champs: /^t\./,
    pourquoi: 'table de libellés propre au portail, remplacée par le catalogue',
  },
];

const perdus = new Map<string, Set<string>>();
let fichier: string | null = null;
for (const l of diff.split('\n')) {
  if (l.startsWith('+++ b/')) fichier = l.slice(6);
  if (!l.startsWith('-') || l.startsWith('---') || fichier === null) continue;
  const corps = l.slice(1);
  if (/^\s*(\/\/|\*|\/\*)/.test(corps)) continue;          // un commentaire n'est pas une lecture
  for (const m of corps.matchAll(/\{([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)/g)) {
    if (!perdus.has(fichier)) perdus.set(fichier, new Set());
    perdus.get(fichier)!.add(m[1]);
  }
}

let restants = 0;
for (const [f, exprs] of [...perdus].sort()) {
  const chemin = path.join(RACINE, f);
  if (!fs.existsSync(chemin)) continue;                     // écran supprimé : c'est une décision, pas un oubli
  const courant = fs.readFileSync(chemin, 'utf8');
  /* ON COMPARE SUR LE CHEMIN DE CHAMP, PAS SUR LE NOM DE LA VARIABLE. Renommer
     `t` en `x` dans un `map` n'est pas perdre une lecture — et un détecteur qui
     crie faux se fait taire, ce qui est exactement le défaut qu'on traque. */
  const absents = [...exprs]
    .filter((e) => {
      if (courant.includes(e)) return false;
      const champ = e.slice(e.indexOf('.'));               // « .consentement », « .risque.formules »
      return !courant.includes(champ);
    })
    .filter((e) => !EXEMPTS.some((x) => x.fichier.test(f) && x.champs.test(e)))
    .sort();
  if (absents.length) {
    console.error(`  ${f.replace('app/src/app/', '')}`);
    for (const a of absents) console.error(`      ${a}`);
    restants += absents.length;
  }
}

console.log(`\n${restants} lecture(s) retirée(s) d’un écran et jamais rétablie(s) (référence : ${ref}).`);
process.exit(restants === 0 ? 0 : 1);
