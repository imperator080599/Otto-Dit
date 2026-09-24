import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

// P1-10 (AUD-12) : AUCUNE ÉCRITURE NUE — toute fonction exportée de `lib/services` qui
// écrit (`insert`/`update ... set`/`delete from`) doit AUSSI appeler `logEvent` dans la
// MÊME fonction, sinon la piste d'audit (règle 3 : « Pourquoi cette pièce existe-t-elle ? »)
// a un trou que rien ne voit — un état change, aucune trace n'explique pourquoi. C'est
// exactement le défaut que `automatisation.ts::definirNiveauMission` portait avant cette
// tranche (voir le commit qui l'a corrigé) : trouvé en CONSTRUISANT ce balayage, pas
// avant — la preuve qu'un balayage neuf doit d'abord s'éprouver contre le dépôt réel.
//
// CE QUE CE BALAYAGE NE FAIT PAS, ET LE DIT (règle 19) :
//   · Il ne comprend pas TypeScript — un compteur de profondeur de blocs, qui ignore le
//     contenu des chaînes/gabarits/commentaires pour ne pas se tromper sur un `{}` ou un
//     `insert into` qui vivrait DANS une chaîne SQL au lieu d'être le code lui-même (le
//     motif est le MÊME que le SQL cherche : « insert into » apparaît FORCÉMENT dans le
//     texte de la requête, la question n'est donc pas « ce mot existe-t-il » mais
//     « cette fonction appelle-t-elle q()/tx()/run() avec ce motif », ce qui revient au
//     même texte — la distinction qui compte ici est brace-vs-chaîne, pas SQL-vs-code).
//   · Il ne voit PAS une écriture faite par une fonction APPELÉE (`await autreFonction()`
//     qui elle-même écrit et journalise) — seule l'écriture DIRECTE, dans le corps de la
//     fonction exportée elle-même, compte. Une fonction qui délègue entièrement l'écriture
//     et la trace à une autre est donc INVISIBLE à ce balayage, par construction.
//   · Il ne distingue pas une vraie écriture (`update engagement set …`) d'un `select`
//     qui contiendrait accidentellement les mots « insert »/« update »/« delete » dans un
//     commentaire SQL ou un littéral — le motif exige les trois mots-clés SQL en tête de
//     leur propre requête, pas n'importe où dans le texte, ce qui réduit le risque sans
//     l'éliminer.
//
// LA LISTE FIGÉE (docs/instantanes/ecritures-nues.json) NE PEUT QUE BAISSER — une entrée
// RETIRÉE l'est parce qu'un `logEvent` a été ajouté, jamais parce que la fonction a
// disparu sans qu'on l'ait remarqué (le test échouerait alors différemment : la fonction
// citée dans le figé n'existerait plus, `--figer` le retire explicitement).

const RACINE = path.join(__dirname, '..', '..', '..');
const SERVICES = path.join(RACINE, 'src', 'lib', 'services');
const FIGE = path.join(RACINE, '..', 'docs', 'instantanes', 'ecritures-nues.json');

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) fichiers(p, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** La fin du bloc ouvert en `depart` (l'indice de son `{`) — un compteur de profondeur qui
 *  saute le contenu des chaînes ('...'), gabarits (`...`, `${...}` réentre en code),
 *  chaînes doubles ("..."), et commentaires (// et /* *\/), pour ne jamais compter une
 *  accolade qui vit DANS un texte plutôt que dans la structure du code. */
function finDuBloc(code: string, depart: number): number {
  let profondeur = 0;
  let i = depart;
  const pileGabarit: number[] = []; // profondeur de `{` à laquelle un gabarit a réentré en code via ${
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i++; continue; }
    if (c === '\'' || c === '"') {
      const q = c; i++;
      while (i < code.length && code[i] !== q) { if (code[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '`') {
      i++;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === '`') break;
        if (code[i] === '$' && code[i + 1] === '{') { pileGabarit.push(profondeur); profondeur++; i += 2; break; }
        i++;
      }
      if (code[i] === '`') continue; // gabarit sans interpolation restante, refermé normalement
      // on a réentré en code sous ${ : continuer la boucle principale, elle recomptera ce `{`
      i--; // le for va ré-avancer i, on ne veut pas sauter le caractère suivant
      continue;
    }
    if (c === '{') {
      profondeur++;
      continue;
    }
    if (c === '}') {
      profondeur--;
      if (pileGabarit.length && profondeur === pileGabarit[pileGabarit.length - 1]) {
        // on referme le ${ : revenir en mode gabarit jusqu'au backtick fermant
        pileGabarit.pop();
        i++;
        while (i < code.length) {
          if (code[i] === '\\') { i += 2; continue; }
          if (code[i] === '`') break;
          if (code[i] === '$' && code[i + 1] === '{') { pileGabarit.push(profondeur); profondeur++; i += 2; break; }
          i++;
        }
        if (code[i] === '`') continue;
        i--; continue;
      }
      if (profondeur === 0) return i;
      continue;
    }
  }
  return -1;
}

interface FonctionExportee { fichier: string; nom: string; corps: string; ligne: number }

function fonctionsExportees(code: string, fichier: string): FonctionExportee[] {
  const out: FonctionExportee[] = [];
  const re = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  for (const m of code.matchAll(re)) {
    const nomFn = m[1];
    let i = m.index! + m[0].length - 1; // sur le '(' d'ouverture des paramètres
    let profondeurParen = 0;
    for (; i < code.length; i++) {
      if (code[i] === '(') profondeurParen++;
      else if (code[i] === ')') { profondeurParen--; if (profondeurParen === 0) { i++; break; } }
    }
    // Entre la fin des paramètres et le corps : SEULEMENT une annotation de type de retour
    // (convention Prettier de ce dépôt, vérifiée : la première `{` suivie d'un saut de
    // ligne EST le corps — un type de retour objet inline, `Promise<{ x }>`, n'est jamais
    // seul sur sa ligne). Une signature sans corps trouvable (déclaration de type, pas une
    // fonction) est simplement ignorée.
    const apresParams = code.slice(i);
    const bodyMatch = apresParams.match(/\{[ \t]*\r?\n/);
    if (!bodyMatch) continue;
    const debutCorps = i + bodyMatch.index!;
    const finCorps = finDuBloc(code, debutCorps);
    if (finCorps < 0) continue;
    const corps = code.slice(debutCorps, finCorps + 1);
    const ligne = code.slice(0, m.index).split('\n').length;
    out.push({ fichier, nom: nomFn, corps, ligne });
  }
  return out;
}

/** Retire les commentaires (// et /* *\/) SANS toucher au contenu des chaînes/gabarits —
 *  c'est LÀ que vit le vrai SQL, jamais dans un commentaire qui en PARLE. Un `insert into`
 *  mentionné en commentaire ne doit pas compter comme une écriture réelle. */
function sansCommentaires(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      const q = c; out += c; i++;
      while (i < code.length && code[i] !== q) { out += code[i]; if (code[i] === '\\') { i++; out += code[i] ?? ''; } i++; }
      if (i < code.length) { out += code[i]; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

const ECRITURE = /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i;

describe('aucune écriture nue dans lib/services (P1-10, AUD-12, règle 3)', () => {
  it('chaque fonction exportée qui écrit (insert/update/delete) appelle logEvent — ou est une exception nommée', () => {
    if (!fs.existsSync(FIGE)) {
      throw new Error('docs/instantanes/ecritures-nues.json est absent — lancez `npm run ecritures-nues -- --figer` (ou créez-le manuellement, vide : {"exceptions":[]}).');
    }
    const fige = JSON.parse(fs.readFileSync(FIGE, 'utf8')) as { exceptions: string[] };
    const plafond = new Set(fige.exceptions);
    const nues: string[] = [];
    for (const f of fichiers(SERVICES)) {
      const code = fs.readFileSync(f, 'utf8');
      const rel = path.relative(path.join(RACINE, 'src', 'lib', 'services'), f).split(path.sep).join('/');
      for (const fn of fonctionsExportees(code, f)) {
        if (!ECRITURE.test(sansCommentaires(fn.corps))) continue;
        if (fn.corps.includes('logEvent(')) continue;
        const id = `${rel}::${fn.nom}`;
        if (plafond.has(id)) continue;
        nues.push(`${id} (${rel}:${fn.ligne})`);
      }
    }
    expect(nues, `écriture(s) sans logEvent, hors des exceptions figées :\n  ${nues.join('\n  ')}`).toEqual([]);
  });

  it('cas connu mauvais (règle 17) : une fonction qui écrit SANS logEvent est détectée', () => {
    const code = `
export async function ecritSansTrace(x: string): Promise<void> {
  await q(\`insert into demo_table (x) values ($1)\`, [x]);
}
`;
    const fns = fonctionsExportees(code, 'sonde.ts');
    expect(fns).toHaveLength(1);
    expect(ECRITURE.test(sansCommentaires(fns[0].corps))).toBe(true);
    expect(fns[0].corps.includes('logEvent(')).toBe(false);
  });

  it('cas connu BON (règle 17, le régression-guard) : une fonction qui écrit ET journalise ne l’est pas', () => {
    const code = `
export async function ecritEtTrace(x: string): Promise<void> {
  await q(\`insert into demo_table (x) values ($1)\`, [x]);
  await logEvent({ tenantId: 't', actorKind: 'system', verb: 'x', objectType: 'x' });
}
`;
    const fns = fonctionsExportees(code, 'sonde.ts');
    expect(fns).toHaveLength(1);
    expect(ECRITURE.test(sansCommentaires(fns[0].corps))).toBe(true);
    expect(fns[0].corps.includes('logEvent(')).toBe(true);
  });

  it('une fonction qui ne fait QUE lire (select) n’est jamais signalée, même sans logEvent', () => {
    const code = `
export async function lit(x: string): Promise<unknown> {
  return q1(\`select * from demo_table where x = $1\`, [x]);
}
`;
    const fns = fonctionsExportees(code, 'sonde.ts');
    expect(fns).toHaveLength(1);
    expect(ECRITURE.test(sansCommentaires(fns[0].corps))).toBe(false);
  });

  it('un `insert into` mentionné DANS UN COMMENTAIRE, sans vraie écriture, n’est pas une fausse alerte', () => {
    const code = `
export async function litSeulement(x: string): Promise<unknown> {
  // on pourrait un jour faire un insert into ici, pas encore fait
  return q1(\`select * from demo_table where x = $1\`, [x]);
}
`;
    const fns = fonctionsExportees(code, 'sonde.ts');
    expect(fns).toHaveLength(1);
    expect(ECRITURE.test(sansCommentaires(fns[0].corps))).toBe(false);
  });
});
