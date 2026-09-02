import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GARDES } from '../src/lib/gardes/registre';

// npm run gardes [-- --figer] : docs/GUARDS.md est GÉNÉRÉ depuis le registre.
//
// La table que le fondateur lit doit être celle que le test éprouve : deux
// sources divergent un jour, et c'est toujours la table qu'on croit. Le
// script sans option COMPARE le fichier au registre et échoue s'il est
// périmé ; `--figer` le réécrit. La PREUVE, elle, ne vit pas ici : c'est
// `npx vitest run src/lib/gardes` qui la prend, garde par garde, en deux
// passes — la table le dit en tête, et marque chaque ligne par sa NATURE de
// preuve, jamais par un « ok » qu'aucune exécution n'aurait produit.

const ici = path.dirname(fileURLToPath(import.meta.url));
const CIBLE = path.join(ici, '..', '..', 'docs', 'GUARDS.md');
const RESULTATS = path.join(ici, '..', '..', 'docs', 'GARDES_RESULTATS.json');

/* LE VERDICT VIENT DE L'EXÉCUTION. `docs/GARDES_RESULTATS.json` est écrit par
   gardes.test.ts à chaque passage ; une garde sans résultat enregistré s'écrit
   SANS RÉSULTAT — jamais « prouvée » par le seul fait d'être au registre. */
type Resultat = { prouvee: boolean; raison: string; quand: string };
const resultats: Record<string, Resultat> = fs.existsSync(RESULTATS)
  ? (JSON.parse(fs.readFileSync(RESULTATS, 'utf8')) as Record<string, Resultat>) : {};
function verdict(code: string): string {
  const r = resultats[code];
  if (!r) return '**SANS RÉSULTAT**';
  return r.prouvee ? `PROUVÉE (${r.quand.slice(0, 10)})` : `**NON PROUVÉE** — ${r.raison}`;
}

function md(): string {
  const sql = GARDES.filter((g) => g.nature === 'sql');
  const service = GARDES.filter((g) => g.nature === 'service');
  const declarees = GARDES.filter((g) => g.nature === 'declaree');
  const lignes: string[] = [];
  lignes.push('# Le registre des gardes');
  lignes.push('');
  lignes.push('*Généré depuis `app/src/lib/gardes/registre.ts` par `npm run gardes -- --figer` ; `npm run gardes`');
  lignes.push('échoue si ce fichier a divergé du registre. Ne pas éditer à la main.*');
  lignes.push('');
  lignes.push('**Comment lire « prouvée ».** Une garde SQL est prouvée par `npx vitest run src/lib/gardes` en DEUX');
  lignes.push('passes : son attaque est jouée normalement (elle doit être refusée, par ELLE — le refus est');
  lignes.push('comparé à son expression), puis dans une transaction annulée où la garde est neutralisée (elle');
  lignes.push('doit réussir). Si elle refuse encore, l’attaque n’a jamais atteint la garde et le test ÉCHOUE en la');
  lignes.push('nommant. Une garde de SERVICE n’a qu’une passe (aucune neutralisation SQL) : son refus nommé. Une');
  lignes.push('garde DÉCLARÉE n’est pas prouvée par ce registre : la colonne dit où vit sa preuve, ou qu’il n’y en a');
  lignes.push('pas. L’épreuve elle-même est éprouvée contre trois gardes connues mauvaises (règle 17).');
  lignes.push('');
  const prouvees = [...sql, ...service].filter((g) => resultats[g.code]?.prouvee).length;
  const sansResultat = [...sql, ...service].filter((g) => !resultats[g.code]).length;
  lignes.push(`**Compte** : ${sql.length} garde(s) SQL à deux passes · ${service.length} garde(s) de service à une passe · ${declarees.length} déclarée(s), dont ${declarees.filter((g) => g.nature === 'declaree' && !g.preuve).length} sans aucune preuve. **Verdicts observés** (docs/GARDES_RESULTATS.json, écrit par \`npx vitest run src/lib/gardes\`) : ${prouvees} prouvée(s), ${sansResultat} sans résultat.`);
  lignes.push('');
  lignes.push('**Retirer une garde, et voir le registre le dire** : le test « une garde RETIRÉE est dénoncée par son nom » (gardes.test.ts) désactive `review_note_close_guard` et lit le verdict « G-03 : l’attaque a RÉUSSI sans neutralisation — la garde n’existe pas » ; c’est le critère du plan, joué à chaque exécution.');
  lignes.push('');
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  lignes.push('## Gardes SQL — prouvées en deux passes');
  lignes.push('');
  lignes.push('| Code | Verdict observé | Invariant | Tenu par | Rayon si elle tombe | Refus attendu | Neutralisation d’épreuve | Où elle cesse de regarder |');
  lignes.push('|---|---|---|---|---|---|---|---|');
  for (const g of sql) {
    if (g.nature !== 'sql') continue;
    lignes.push(`| ${g.code} | ${verdict(g.code)} | ${cell(g.enonce)} | \`${cell(g.point)}\` | ${cell(g.rayon)} | \`${g.rejet.source}\` | \`${cell(g.neutraliser)}\` | ${cell(g.stops_looking)} |`);
  }
  lignes.push('');
  lignes.push('## Gardes de service — prouvées en une passe');
  lignes.push('');
  lignes.push('| Code | Verdict observé | Invariant | Tenu par | Rayon si elle tombe | Refus attendu | Où elle cesse de regarder |');
  lignes.push('|---|---|---|---|---|---|---|');
  for (const g of service) {
    if (g.nature !== 'service') continue;
    lignes.push(`| ${g.code} | ${verdict(g.code)} | ${cell(g.enonce)} | \`${cell(g.point)}\` | ${cell(g.rayon)} | \`${g.rejet.source}\` | ${cell(g.stops_looking)} |`);
  }
  lignes.push('');
  lignes.push('## Gardes déclarées — la preuve vit ailleurs, ou n’existe pas');
  lignes.push('');
  lignes.push('| Code | Invariant | Tenu par | Rayon si elle tombe | Preuve | Où elle cesse de regarder |');
  lignes.push('|---|---|---|---|---|---|');
  for (const g of declarees) {
    if (g.nature !== 'declaree') continue;
    lignes.push(`| ${g.code} | ${cell(g.enonce)} | \`${cell(g.point)}\` | ${cell(g.rayon)} | ${g.preuve ? `\`${g.preuve}\`` : '**aucune**'} | ${cell(g.stops_looking)} |`);
  }
  lignes.push('');
  return lignes.join('\n');
}

const contenu = md();
if (process.argv.includes('--figer')) {
  fs.writeFileSync(CIBLE, contenu);
  console.log(`docs/GUARDS.md écrit : ${GARDES.length} garde(s).`);
  process.exit(0);
}
if (!fs.existsSync(CIBLE)) {
  console.error('docs/GUARDS.md est absent — lancez `npm run gardes -- --figer`.');
  process.exit(1);
}
/* Comparé fins de ligne normalisées : un `autocrlf` ne fait pas une divergence. */
if (fs.readFileSync(CIBLE, 'utf8').replace(/\r\n/g, '\n') !== contenu.replace(/\r\n/g, '\n')) {
  console.error('docs/GUARDS.md a DIVERGÉ du registre — lancez `npm run gardes -- --figer` et relisez la table.');
  process.exit(1);
}
console.log(`docs/GUARDS.md à jour : ${GARDES.length} garde(s).`);
