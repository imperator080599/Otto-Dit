/* Engendre le module JS du catalogue depuis methodology/*.json.
   Le prototype ne CONTIENT pas le catalogue : il l'intègre à la construction.
   La validation n'est pas réécrite ici — elle vit dans methodology/valider.mjs,
   avec les données, et sert aussi à l'application. Un catalogue invalide
   ARRÊTE la construction : on ne livre pas un prototype bâti sur des données
   qu'on n'a pas vérifiées. */
import fs from 'node:fs';
import path from 'node:path';
const racine = process.argv[2] || '/home/user/Otto-Dit';
const { chargerCatalogue } = await import(path.join(racine, 'methodology', 'valider.mjs'));

let cat;
try { cat = chargerCatalogue(racine); }
catch (e){ console.error(e.message); process.exit(1); }

const sortie = `/* ══ ENGENDRÉ — ne pas modifier ════════════════════════════════════════════
   Source : methodology/procedures.json et methodology/sources.json,
   versionnés dans le dépôt et validés contre methodology/schema.json par
   methodology/valider.mjs — le même validateur que celui de l'application.
   Régénéré à chaque assemblage par prototype/src/build.sh.
   ═══════════════════════════════════════════════════════════════════════ */
const CATALOGUE_VERSION = ${JSON.stringify(cat.version)};
const SENS_TEST = ${JSON.stringify(cat.sensDeTest, null, 2)};
const CAT_PROCEDURES = ${JSON.stringify(cat.procedures, null, 1)};
const CAT_SOURCES = ${JSON.stringify(cat.sources, null, 1)};
`;
fs.writeFileSync(path.join(process.argv[3] || '.', '_catalogue.gen.js'), sortie);
console.error(`catalogue : ${cat.procedures.length} procédures, ${Object.keys(cat.sources).length} sources — valide`);
