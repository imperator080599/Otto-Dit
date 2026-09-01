import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instantane, pertes, type Instantane } from '../src/lib/lectures';

// `npm run lectures`        — compare les écrans à l'instantané figé.
// `npm run lectures:figer`  — met l'instantané à jour (geste EXPLICITE, relu en revue).

const ici = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ici, '..', 'src', 'app');
const FIGE = path.join(ici, '..', '..', 'docs', 'LECTURES.json');
const figer = process.argv.includes('--figer');

const courant = instantane(APP);

if (figer) {
  fs.writeFileSync(FIGE, `${JSON.stringify(courant, null, 1)}\n`);
  const n = Object.values(courant).reduce((s, c) => s + Object.keys(c).length, 0);
  console.log(`instantané figé : ${Object.keys(courant).length} écrans · ${n} chemins de champ · docs/LECTURES.json`);
  process.exit(0);
}

if (!fs.existsSync(FIGE)) {
  console.error('  ÉCHEC  aucun instantané : lancez `npm run lectures:figer` et relisez le fichier produit.');
  process.exit(1);
}

const fige = JSON.parse(fs.readFileSync(FIGE, 'utf8')) as Instantane;
const perdues = pertes(fige, courant);

for (const p of perdues) {
  console.error(`  ${p.fichier} → ${p.champ} : ${p.avant} → ${p.apres}`);
}
const total = Object.values(fige).reduce((s, c) => s + Object.keys(c).length, 0);
console.log(`\n${perdues.length} lecture(s) perdue(s) sur ${total} chemins figés dans ${Object.keys(fige).length} écrans.`);
if (perdues.length > 0) {
  console.error('Rétablissez la lecture, ou figez l’instantané À LA MAIN en disant pourquoi elle disparaît.');
}
process.exit(perdues.length === 0 ? 0 : 1);
