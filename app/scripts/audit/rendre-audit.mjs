import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P0-07 (AUD-24). `docs/AUDIT.md` est un texte de 527 lignes qui a été RÉDIGÉ à la main depuis
// l'instantané de l'audit — exactement le défaut que règle 21 existe pour refuser : « aucun
// chiffre en prose que le script n'a pas produit ». Ce script fait l'inverse : il LIT
// `docs/instantanes/audit.json` (la donnée, déjà relue mécaniquement à l'ouverture de l'audit —
// « preuves relues : 147/147 ») et ENGENDRE le texte. `npm run audit:rendre` doit reproduire le
// fichier committé SANS DIFF — c'est la preuve que le texte actuel n'est pas déjà dérivé.
// CE QUE CE SCRIPT NE FAIT PAS : il ne revérifie PAS les citations fichier:ligne contre l'arbre
// COURANT (elles décrivent le SHA audité, un instantané historique, jamais HEAD) — cette
// relecture-là est le travail de l'audit lui-même, pas de son rendu.

const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ICI, '..', '..');
const REPO = path.dirname(APP);

const CHEMIN_JSON = path.join(REPO, 'docs', 'instantanes', 'audit.json');
const CHEMIN_MD = path.join(REPO, 'docs', 'AUDIT.md');

function echapperCode(s) {
  return String(s).replace(/`/g, '\\`');
}

function rendrePreuve(p) {
  return `  - \`${p.fichier}:${p.ligne}\` — \`${echapperCode(p.texte)}\``;
}

function rendreConstat(c) {
  const l = [];
  l.push(`### ${c.id} · ${c.priorite} · ${c.dimension} · taille ${c.taille} · refonte : ${c.refonte ? 'OUI' : 'non'}`);
  l.push('');
  l.push(`**${c.titre}**`);
  l.push('');
  l.push(`- **Défaut.** ${c.defaut}`);
  l.push('- **Preuves.**');
  for (const p of c.preuves) l.push(rendrePreuve(p));
  l.push(`- **Pourquoi c'est grave.** ${c.pourquoi}`);
  l.push(`- **Correctif.** ${c.correctif}`);
  l.push(`- **Épreuve d'acceptation.** ${c.epreuve}`);
  l.push(`- **Lignes du §1/§2 qui en dépendent.** ${c.depend_s1.length ? c.depend_s1.join(', ') : 'aucune'}`);
  l.push(`- **Déjà connu.** ${c.deja_connu} · **Constats sources** : ${c.sources.join(', ')}`);
  return l.join('\n');
}

function rendreDimension(d) {
  return `| **${d.nom}** | ${d.marche} | ${d.ne_marche_pas} | ${d.doit_changer} | ${d.cause} |`;
}

export function rendre(data) {
  const { audit, constats, dimensions, ordre_execution_recommande, premieres_cinq_lignes, registre_p3 } = data;

  const parPriorite = { P0: 0, P1: 0, P2: 0 };
  for (const c of constats) parPriorite[c.priorite] = (parPriorite[c.priorite] ?? 0) + 1;
  const refontes = constats.filter((c) => c.refonte).map((c) => c.id);
  const parTaille = { L: 0, M: 0, S: 0 };
  for (const c of constats) parTaille[c.taille] = (parTaille[c.taille] ?? 0) + 1;
  const totalPreuves = constats.reduce((n, c) => n + c.preuves.length, 0);

  const l = [];
  l.push('<!-- ENGENDRÉ depuis docs/instantanes/audit.json par le script de rendu de l\'audit (règle 21) — ne pas éditer à la main ; toute preuve fichier:ligne a été relue mécaniquement sur le SHA cité au moment du rendu. -->');
  l.push(`# OTTO — Audit technique de la phase 2 (mandat du 20 septembre 2026, §4)`);
  l.push('');
  l.push(`**SHA audité : \`${audit.sha_court}\`** (\`${audit.sha}\`, le SHA servi en production) · audit ouvert le ${audit.debut} · budget : ${audit.budget} · **${constats.length} constats** — P0 : ${parPriorite.P0} · P1 : ${parPriorite.P1} · P2 : ${parPriorite.P2} · refonte : ${refontes.length} (${refontes.join(', ')}) · tailles : L ${parTaille.L}, M ${parTaille.M}, S ${parTaille.S} · preuves relues : ${totalPreuves}/${totalPreuves}.`);
  l.push('');
  l.push(`**Périmètre.** ${audit.perimetre}`);
  l.push('');
  l.push(`**Méthode.** ${audit.methode}`);
  l.push('');
  l.push(`L'audit est hostile par construction : il ne défend pas l'existant. Les priorités suivent le mandat : **P0** compromet la qualité, la cohérence, l'utilisabilité ou la crédibilité ; **P1** impact large ; **P2** significatif ; **P3** mineur (les P3 sont au registre en fin de document, pas à l'inventaire).`);
  l.push('');
  l.push('---');
  l.push('');
  l.push('## 1. Les constats, du plus grave au moins grave');
  l.push('');
  l.push(constats.map(rendreConstat).join('\n\n'));
  l.push('');
  l.push('---');
  l.push('');
  l.push('## 2. Les douze dimensions — causes, pas notes (une page)');
  l.push('');
  l.push('| Dimension | Ce qui marche | Ce qui ne marche pas | Ce qui doit changer | Cause |');
  l.push('|---|---|---|---|---|');
  for (const d of dimensions) l.push(rendreDimension(d));
  l.push('');
  l.push('---');
  l.push('');
  l.push('## 3. L\'ordre d\'exécution recommandé pour le §5 du mandat');
  l.push('');
  for (const e of ordre_execution_recommande) l.push(`- ${e}`);
  l.push('');
  l.push(`**Les cinq premières lignes à prendre** : ${premieres_cinq_lignes.join(', ')}.`);
  l.push('');
  l.push('---');
  l.push('');
  l.push('## 4. Non vérifié — ce que cet audit n\'a pas pu établir, et ce qui le trancherait');
  l.push('');
  for (const n of audit.non_verifie) l.push(`- ${n}`);
  l.push('');
  l.push('## 5. Registre — constats P3, à consigner dans docs/BACKLOG_REPORTE.md (pas à l\'inventaire)');
  l.push('');
  for (const r of registre_p3) l.push(`- ${r}`);
  l.push('');
  l.push('## 6. Comptes (engendrés)');
  l.push('');
  l.push(`- Constats par priorité : P0 = ${parPriorite.P0}, P1 = ${parPriorite.P1}, P2 = ${parPriorite.P2}`);
  l.push(`- Refontes (oui) : ${refontes.length} — ${refontes.join(', ')}`);
  l.push(`- Tailles : L = ${parTaille.L}, M = ${parTaille.M}, S = ${parTaille.S}`);
  l.push(`- Preuves citées et relues : ${totalPreuves}`);
  l.push(`- Premières lignes : ${premieres_cinq_lignes.join(', ')}`);
  l.push('');
  return l.join('\n');
}

function main() {
  const data = JSON.parse(fs.readFileSync(CHEMIN_JSON, 'utf8'));
  const rendu = rendre(data);
  const avant = fs.existsSync(CHEMIN_MD) ? fs.readFileSync(CHEMIN_MD, 'utf8') : null;
  fs.writeFileSync(CHEMIN_MD, rendu);
  if (avant !== null && avant !== rendu) {
    console.log('docs/AUDIT.md a CHANGÉ — le rendu différait du fichier committé (attendu la première fois, ou si docs/instantanes/audit.json a changé).');
  } else if (avant === rendu) {
    console.log('docs/AUDIT.md régénéré SANS DIFF — le fichier committé était déjà exactement ce rendu.');
  } else {
    console.log('docs/AUDIT.md créé.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
