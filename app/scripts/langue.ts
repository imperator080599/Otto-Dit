import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { horsCatalogue, libellesDeService } from '../src/lib/langue';
import { LIBELLES } from '../src/lib/i18n/catalogue';

// LA RÈGLE, REJOUABLE À LA MAIN : `npm run langue`.
//
// DEUX PORTÉES, PARCE QU'UN ÉCRAN IRRÉPROCHABLE PEUT AFFICHER DU FRANÇAIS : il
// suffit qu'il rende une table de libellés tenue dans un service. La règle
// compte les deux, et le total est ce qui doit valoir zéro.
const ici = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(ici, '..', 'src', 'app');
const lib = path.join(ici, '..', 'src', 'lib');
const { restes, refus } = horsCatalogue(app);
const { restes: services, differes, exclus } = libellesDeService(lib, new Set(Object.keys(LIBELLES)));
const cible = process.argv[2];
const vus = cible ? restes.filter((r) => r.startsWith(cible)) : restes;
for (const r of vus) console.log(r);
for (const r of services) console.log(`services · ${r}`);
/* LES DIFFÉRÉS SE LISENT, ILS NE SE COMPTENT PAS SEULEMENT : une exception
   qu'on ne relit jamais devient un acquis. `npm run langue --differes` les
   déroule avec leur raison. */
if (process.argv.includes('--differes')) {
  for (const d of differes) console.log(`différé · ${d}`);
  for (const d of exclus) console.log(`exclu · ${d}`);
}
console.log(`\n${restes.length} chaîne(s) d’écran hors catalogue · ${services.length} libellé(s) en dur dans un service`
  + ` · ${differes.length} libellé(s) différé(s) avec raison · ${exclus.length} chaîne(s) exclue(s) avec raison (--differes pour les lire) · ${refus} message(s) de refus`
  + ' (exceptions documentées dans src/lib/langue.ts)');
process.exit(restes.length === 0 && services.length === 0 ? 0 : 1);
