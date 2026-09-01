import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { horsCatalogue } from '../src/lib/langue';

// LA RÈGLE, REJOUABLE À LA MAIN : `npm run langue`.
const ici = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(ici, '..', 'src', 'app');
const { restes, refus } = horsCatalogue(app);
const cible = process.argv[2];
const vus = cible ? restes.filter((r) => r.startsWith(cible)) : restes;
for (const r of vus) console.log(r);
console.log(`\n${restes.length} chaîne(s) hors catalogue · ${refus} message(s) de refus (exception documentée)`);
process.exit(restes.length === 0 ? 0 : 1);
