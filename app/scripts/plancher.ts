import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { interdits, EXCEPTIONS } from '../src/lib/plancher';

// npm run plancher [-- --figer] : LE CLIQUET DES TESTS (1.7).
//
// Un dépôt perd ses tests sans le dire : un fichier supprimé avec la
// fonctionnalité qu'il couvrait, un `.skip` posé « pour l'instant », un
// `.only` oublié qui éteint tout le reste. Le compte des tests ne DESCEND
// donc jamais sans qu'on le dise (`--figer` relève le plancher, et le diff
// de docs/TESTS_PLANCHER.json le montre), et les formes qui éteignent ou
// isolent un test sont refusées.
//
// LE COMPTE VIENT DE VITEST (`vitest list` collecte les tests sans les
// exécuter : boucles, `each`, tout ce qu'une expression régulière ne voit
// pas — la première version comptait 7 tests là où il y en avait 20, revue
// hostile n°6). Ce qu'il ne voit toujours pas : un test vidé de ses
// assertions compte encore pour un test. Le cliquet compte des tests, pas
// des preuves.

const ici = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ici, '..');
const RACINES = [path.join(APP, 'src'), path.join(APP, '..', 'tests')];
const FIGE = path.join(APP, '..', 'docs', 'TESTS_PLANCHER.json');

function fichiers(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') fichiers(p, out); }
    else if (/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const eteints: string[] = [];
let exceptes = 0;
for (const f of RACINES.flatMap((r) => fichiers(r))) {
  const rel = path.relative(path.join(APP, '..'), f).split(path.sep).join('/');
  if (rel in EXCEPTIONS) { exceptes += 1; continue; }
  for (const x of interdits(fs.readFileSync(f, 'utf8'), rel)) {
    eteints.push(`${rel} → ${x}`);
  }
}
if (eteints.length) {
  console.error(`${eteints.length} test(s) éteint(s) ou isolé(s) — refusé :\n  ${eteints.join('\n  ')}`);
  process.exit(1);
}

/* La collecte : une ligne par test. Un échec de collecte est un ÉCHEC du
   cliquet, pas un compte à zéro. */
const liste = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'list'], { cwd: APP, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (liste.status !== 0) {
  console.error(`la collecte des tests a échoué (vitest list, code ${liste.status}) :\n${(liste.stderr || liste.stdout).slice(0, 2000)}`);
  process.exit(1);
}
const tests = liste.stdout.split(/\r?\n/).filter((l) => /\.test\.tsx? > /.test(l)).length;
if (tests === 0) {
  console.error('la collecte a rendu 0 test — le cliquet ne mesure rien, refusé.');
  process.exit(1);
}

if (process.argv.includes('--figer')) {
  fs.writeFileSync(FIGE, `${JSON.stringify({ tests }, null, 2)}\n`);
  console.log(`docs/TESTS_PLANCHER.json : plancher relevé à ${tests} test(s) (collectés par vitest) · ${exceptes} fichier(s) d’exception déclarée.`);
  process.exit(0);
}
if (!fs.existsSync(FIGE)) {
  console.error('docs/TESTS_PLANCHER.json est absent — lancez `npm run plancher -- --figer`.');
  process.exit(1);
}
const plancher = (JSON.parse(fs.readFileSync(FIGE, 'utf8')) as { tests: number }).tests;
if (tests < plancher) {
  console.error(`${tests} test(s) collecté(s), plancher ${plancher} : ${plancher - tests} test(s) ont DISPARU. Si c’est voulu, dites-le : \`npm run plancher -- --figer\` (le diff du plancher le montrera).`);
  process.exit(1);
}
console.log(`${tests} test(s) collecté(s) par vitest · plancher ${plancher} · aucune forme éteinte ou isolée · ${exceptes} fichier(s) d’exception déclarée (src/lib/plancher.ts).`);
