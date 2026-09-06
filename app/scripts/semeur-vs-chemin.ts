import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS, type ObjetSemeur } from '../src/lib/semeur/registre';
import { violationsDeCoherence } from '../src/lib/semeur/coherence';

// npm run semeur [-- --figer] : docs/SEMEUR_VS_CHEMIN.md est GÉNÉRÉ depuis le
// registre (R44, mandat du semeur §1 ; CLAUDE.md règle 20). Même patron que
// `npm run gardes` : le script SANS option compare le fichier au registre et
// échoue s'il a divergé ; `--figer` le réécrit. Aucun chiffre de ce document
// n'est tapé en prose ailleurs — il est calculé ici, une fois.

const ici = path.dirname(fileURLToPath(import.meta.url));
const CIBLE = path.join(ici, '..', '..', 'docs', 'SEMEUR_VS_CHEMIN.md');

/* LE GARDE D'ABORD, TOUJOURS (constat E1, relecture hostile du 2026-09-06) :
   un registre incohérent ne doit jamais atteindre --figer ni la comparaison —
   les deux modes en dépendent également. */
const incoherences = violationsDeCoherence(SECTIONS);
if (incoherences.length > 0) {
  console.error(`${incoherences.length} incohérence(s) dans src/lib/semeur/registre.ts :`);
  for (const e of incoherences) console.error(`  - ${e}`);
  process.exit(1);
}

const cell = (s: string | null): string => (s === null ? '—' : `\`${s.replace(/\|/g, '\\|')}\``);
const badge = (o: ObjetSemeur): string => {
  if (o.etat === 'decor') return '**DÉCOR**';
  if (o.etat === 'non_prouve') return 'non prouvé';
  return 'prouvé';
};

function md(): string {
  const tous = SECTIONS.flatMap((s) => s.objets);
  const decors = tous.filter((o) => o.etat === 'decor');
  const nonProuves = tous.filter((o) => o.etat === 'non_prouve');
  const prouves = tous.filter((o) => o.etat === 'prouve');

  const lignes: string[] = [];
  lignes.push('# Le semeur et le chemin — objet par objet');
  lignes.push('');
  lignes.push('*Généré depuis `app/src/lib/semeur/registre.ts` par `npm run semeur -- --figer` ;');
  lignes.push('`npm run semeur` échoue si ce fichier a divergé du registre. Ne pas éditer à la main');
  lignes.push('(règle 21) — le registre, lui, se tient à la main, sourcé par citation fichier:ligne.*');
  lignes.push('');
  lignes.push('**La question, chacune répondue objet par objet (règle 20, mandat du semeur §1)** :');
  lignes.push('le semeur crée-t-il cet objet ? Un chemin HUMAIN (une action serveur, un bouton, un');
  lignes.push('écran — jamais un script, jamais un test) existe-t-il pour créer ou atteindre le');
  lignes.push('même objet ? Et si oui, `scripts/clics/scenario.ts` l’exerce-t-il ?');
  lignes.push('');
  lignes.push('**Trois états.** `DÉCOR` — le semeur crée, aucun chemin humain n’existe : c’est');
  lignes.push('l’invariant de la règle 20 en clair, un état que seul le semeur peut produire.');
  lignes.push('`non prouvé` — le chemin existe mais aucune station ne le clique : personne ne l’a');
  lignes.push('vu marcher. `prouvé` — le chemin existe et une station l’exerce (ce qui ne veut PAS');
  lignes.push('dire que la station vérifie que le résultat est correct — voir « ce que ce registre');
  lignes.push('ne vérifie pas » ci-dessous, et dans l’en-tête de `src/lib/semeur/registre.ts`).');
  lignes.push('');
  lignes.push(`**Compte** : ${tous.length} objet(s)/geste(s) recensé(s) sur les cinq fichiers du semeur · `
    + `**${decors.length} DÉCOR** (aucun chemin humain) · **${nonProuves.length} non prouvé(s)** `
    + `(chemin humain existant, jamais cliqué) · ${prouves.length} prouvé(s).`);
  lignes.push('');
  lignes.push('**Ce que ce registre ne vérifie PAS** : qu’une station qui clique un chemin observe');
  lignes.push('le bon résultat derrière (« cliqué » n’est pas « prouvé correct ») ; les tables de');
  lignes.push('référence pures sans genèse d’un objet de dossier ; tout objet absent des cinq');
  lignes.push('fichiers cités (le registre part du décor, pas de l’inverse) ; le monde enrichi');
  lignes.push('au-delà de ces cinq fichiers. Une note de nuance, quand il y en a une, est écrite');
  lignes.push('sous la ligne — elle ne se cache pas dans le badge.');
  lignes.push('');

  for (const section of SECTIONS) {
    lignes.push(`## \`${section.fichier}\` — ${section.titre}`);
    lignes.push('');
    lignes.push('| Objet | Semeur | Chemin humain | Clic scénario | État |');
    lignes.push('|---|---|---|---|---|');
    for (const o of section.objets) {
      lignes.push(`| ${o.objet} | ${cell(o.semeur)} | ${cell(o.cheminHumain)} | ${cell(o.clique)} | ${badge(o)} |`);
      if (o.note) lignes.push(`| | | | | ↳ ${o.note.replace(/\|/g, '\\|')} |`);
    }
    lignes.push('');
  }

  lignes.push('## La liste « décor » seule, pour ne pas la chercher dans le tableau');
  lignes.push('');
  for (const o of decors) lignes.push(`- **${o.objet}** (\`${o.semeur}\`)${o.note ? ` — ${o.note}` : ''}`);
  lignes.push('');
  lignes.push('## La liste « non prouvé » seule, pour ne pas la chercher dans le tableau');
  lignes.push('');
  for (const o of nonProuves) lignes.push(`- **${o.objet}** — chemin : \`${o.cheminHumain}\`${o.note ? ` — ${o.note}` : ''}`);
  lignes.push('');
  return lignes.join('\n');
}

const contenu = md();
if (process.argv.includes('--figer')) {
  fs.writeFileSync(CIBLE, contenu);
  const tous = SECTIONS.flatMap((s) => s.objets);
  console.log(`docs/SEMEUR_VS_CHEMIN.md écrit : ${tous.length} objet(s), `
    + `${tous.filter((o) => o.etat === 'decor').length} décor(s).`);
  process.exit(0);
}
if (!fs.existsSync(CIBLE)) {
  console.error('docs/SEMEUR_VS_CHEMIN.md est absent — lancez `npm run semeur -- --figer`.');
  process.exit(1);
}
if (fs.readFileSync(CIBLE, 'utf8').replace(/\r\n/g, '\n') !== contenu.replace(/\r\n/g, '\n')) {
  console.error('docs/SEMEUR_VS_CHEMIN.md a DIVERGÉ du registre — lancez `npm run semeur -- --figer` et relisez la table.');
  process.exit(1);
}
console.log('docs/SEMEUR_VS_CHEMIN.md à jour avec le registre.');
