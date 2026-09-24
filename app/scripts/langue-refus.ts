import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// npm run langue-refus [-- --figer] : LE PLAFOND DES REFUS NON MIGRÉS (P1-09, AUD-14).
//
// LE CONTRAIRE DE scripts/plancher.ts : LÀ, UN COMPTE QUI DESCEND EST LE DÉFAUT à
// traquer (des tests qui disparaissent) ; ICI, UN COMPTE QUI MONTE L'EST — chaque
// `throw new Error('CODE : phrase')` dans src/lib/services ou src/lib/core est un
// refus qui devrait passer par `refus()` (lib/core/refus.ts, le REGISTRE_REFUS) mais
// ne le fait pas encore. Le plafond gèle ce zéro : un futur `throw new
// Error('NOUVEAU-01 : ...')` qui contourne le registre fait ROUGIR cette commande
// plutôt que de rouvrir en silence le trou que `Refus` ferme (D.6 : aucun code
// technique en tête d'un message vu par un auditeur, sans passer par le registre qui
// sait le traduire et le cataloguer).
//
// CORRIGÉ LE JOUR MÊME (P1-10, règle 13/31) : la PREMIÈRE version de ce balayage
// (et de la migration P1-09 elle-même) testait `throw new Error(` et le CODE sur
// LA MÊME LIGNE — un `throw new Error(\n  \`CODE : ...\`)` (code et backtick sur la
// ligne SUIVANTE, un style d'écriture courant dans ce dépôt pour les messages
// longs) lui échappait entièrement. Le plafond « 0 » posé par P1-09 était donc
// FAUX : 20 sites réels, dans 9 fichiers, avaient survécu à la migration sans
// qu'aucun harnais ne le voie — trouvé en travaillant P1-10 (automatisation.ts),
// pas par une revue qui aurait re-vérifié le compte. Corrigé : le balayage lit
// désormais le CONTENU ENTIER de chaque fichier (pas ligne par ligne), et le motif
// tolère un saut de ligne entre la parenthèse ouvrante et le code.
//
// CE QUE CE PLAFOND NE COUVRE PAS (règle 19) : les ~304 `throw new Error('phrase sans
// code')` déjà dans ces mêmes dossiers, disclosed dans app/refus.ts (R152,
// docs/BACKLOG_REPORTE.md) — cette commande ne les compte PAS, seulement la FORME
// « MAJUSCULES[-MAJUSCULES/lettre...] : » en tête de chaîne, la même forme que
// `Refus`/`separerCode` reconnaissent. Un message technique qui fuiterait sans cette
// forme (`q1()` « expected a row : <SQL> », par exemple) n'est pas vu par ce plafond.

const EXCLUS = new Set([
  // Harnais interne (gardes/registre.ts), jamais un vrai refus de production —
  // vérifié à la migration (grep sur les services : aucun site de levée réel).
  'IMPOSSIBLE', 'REPLI-03',
  // Fixture de test (sonde.test.ts).
  'TEST-99',
  // Assertions d'intégrité de /api/sante (db/tenant.ts) — pas un refus métier
  // affiché via executer(), une panique de sonde qui doit rester brute pour
  // que /api/sante puisse ROUGIR dessus (règle 22).
  'SANTE-TENANT', 'SANTE-TENANT-VIDE',
  // Référence à une décision (docs/DECISIONS.md), pas un code de refus — la forme
  // « ADR-016: phrase » ressemble à un code mais nomme un ADR, pas une famille.
  'ADR-016',
]);

const ici = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ici, '..');
const LIB = path.join(RACINE, 'src', 'lib');
const FIGE = path.join(RACINE, '..', 'docs', 'instantanes', 'langue-refus.json');

function fichiers(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') fichiers(p, out); }
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

const sites: string[] = [];
for (const f of fichiers(LIB)) {
  const rel = path.relative(RACINE, f).split(path.sep).join('/');
  const code = fs.readFileSync(f, 'utf8');
  /* MULTI-LIGNES, EXPRÈS (voir l'en-tête) : le code peut suivre la parenthèse
     ouvrante sur la ligne SUIVANTE. Le numéro de ligne rapporté est celui du
     MATCH (donc de la parenthèse), pas celui du code — suffisant pour retrouver
     le site, jamais utilisé pour autre chose qu'un message d'erreur humain. */
  for (const m of code.matchAll(/throw new Error\(\s*\n?\s*(`|')([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)\s?:/g)) {
    const c = m[2];
    if (EXCLUS.has(c)) continue;
    const ligne = code.slice(0, m.index).split('\n').length;
    sites.push(`${rel}:${ligne} → ${c}`);
  }
}

if (process.argv.includes('--figer')) {
  fs.mkdirSync(path.dirname(FIGE), { recursive: true });
  fs.writeFileSync(FIGE, `${JSON.stringify({ plafond: sites.length, sites }, null, 2)}\n`);
  console.log(`docs/instantanes/langue-refus.json : plafond figé à ${sites.length} refus non migré(s).`);
  process.exit(0);
}
if (!fs.existsSync(FIGE)) {
  console.error('docs/instantanes/langue-refus.json est absent — lancez `npm run langue-refus -- --figer`.');
  process.exit(1);
}
const { plafond } = JSON.parse(fs.readFileSync(FIGE, 'utf8')) as { plafond: number };
if (sites.length > plafond) {
  const nouveaux = sites.slice(plafond);
  console.error(`${sites.length} refus non migré(s) trouvé(s), plafond ${plafond} : ${sites.length - plafond} `
    + `nouveau(x) contournent le registre (lib/core/refus.ts) au lieu de \`refus('CODE', ...)\`.\n  `
    + nouveaux.join('\n  '));
  process.exit(1);
}
console.log(`${sites.length} refus non migré(s) (plafond ${plafond}${sites.length < plafond ? ` — en baisse, relancez avec --figer` : ''}).`);
