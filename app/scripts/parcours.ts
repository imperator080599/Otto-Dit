import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stationsDe, disparues, direVide, type Fige, type Station } from '../src/lib/parcours';

// npm run parcours [-- --figer] : LA GARDE STATIQUE DU PARCOURS (défaut n°22).
//
// Elle compare les vérifications DÉCLARÉES par le scénario à la liste figée
// dans docs/PARCOURS.json. Une station retirée du code — ou renommée, ce qui
// revient au même pour qui lit le rapport — sort en échec.
//
// POURQUOI UN FIGÉ ET PAS UN SEUIL. « Au moins 150 étapes » ne dit pas
// LESQUELLES : on peut en perdre vingt et en gagner vingt sans que personne ne
// voie que la clôture n'est plus vérifiée. Le figé nomme chacune.

const ici = path.dirname(fileURLToPath(import.meta.url));
const SCENARIO = path.join(ici, 'clics', 'scenario.ts');
const FIGE = path.join(ici, '..', '..', 'docs', 'PARCOURS.json');

const CODE_SCENARIO = fs.readFileSync(SCENARIO, 'utf8');
const courant = stationsDe(CODE_SCENARIO);

/* P0-03 (AUD-17) : une assertion `dire(nom, true, …)` ne teste rien — elle
   bloque avant `--figer` comme après, un plafond figé n'a rien à voir avec
   une forme interdite en toutes circonstances. */
const vides = direVide(CODE_SCENARIO);
if (vides.length) {
  console.error(`${vides.length} assertion(s) \`dire(nom, true, …)\` vide(s) de sens — refusé :`);
  for (const nom of vides) console.error(`  · ${nom}`);
  console.error('\nChaque assertion doit porter un prédicat qui peut être faux (`compte === 0`, `envoyees > 0`…).');
  process.exit(1);
}

if (process.argv.includes('--figer')) {
  /* LE FIGÉ STATIQUE NE RÉÉCRIT QUE LES DÉCLARÉES. Les conduites ET la liste
     des « jamais conduites » viennent du parcours cliqué (`npm run clics --
     --figer`) : les réécrire ici sans elles effaçait, sans un mot, le champ
     qui dit que vert n'est pas complet (revue hostile n°4). */
  const ancien: Fige & { jamaisConduites?: string[] } = fs.existsSync(FIGE)
    ? (JSON.parse(fs.readFileSync(FIGE, 'utf8')) as Fige) : { declarees: [], conduites: [] };
  fs.writeFileSync(FIGE, `${JSON.stringify({
    declarees: courant, conduites: ancien.conduites,
    ...(ancien.jamaisConduites ? { jamaisConduites: ancien.jamaisConduites } : {}),
  }, null, 2)}\n`);
  console.log(`docs/PARCOURS.json figé : ${courant.length} station(s) déclarée(s), `
    + `${ancien.conduites.length} conduite(s) et ${ancien.jamaisConduites?.length ?? 0} jamais conduite(s) conservée(s).`);
  process.exit(0);
}

if (!fs.existsSync(FIGE)) {
  console.error('docs/PARCOURS.json est absent — lancez `npm run parcours -- --figer`.');
  process.exit(1);
}
const fige = JSON.parse(fs.readFileSync(FIGE, 'utf8')) as Fige;
const perdues = disparues(fige.declarees, courant);

console.log(`${courant.length} station(s) déclarée(s) par le scénario · ${fige.declarees.length} figée(s).`);
if (perdues.length === 0) {
  const neuves = disparues(courant, fige.declarees);
  if (neuves.length) console.log(`  ${neuves.length} station(s) NOUVELLE(S) — à figer quand le parcours sera vert.`);
  console.log('0 station perdue.');
  process.exit(0);
}
console.error(`\n${perdues.length} station(s) DISPARUE(S) du scénario :`);
for (const s of perdues) console.error(`  · ${s.gabarit ? '(gabarit) ' : ''}${s.nom}`);
console.error('\nSi la disparition est voulue, refigez : `npm run parcours -- --figer`.');
process.exit(1);
