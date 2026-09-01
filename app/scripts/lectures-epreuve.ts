import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instantane, pertes, type Instantane } from '../src/lib/lectures';
import { prendreLeVerrou } from './verrou';

// LE GARDE DES LECTURES S'ÉPROUVE CONTRE LES DÉFAUTS QU'IL EXISTE POUR ATTRAPER
// (règle 17). Les six cas ci-dessous sont ceux qui ont fait tomber la PREMIÈRE
// version du garde : ce ne sont pas des cas imaginés, ce sont les trous
// constatés par une relecture hostile.
//
// LES FICHIERS SONT TOUJOURS REMIS EN ÉTAT — y compris sur SIGHUP, SIGINT et
// SIGTERM. Le `finally` seul ne suffit pas : une fermeture de terminal laissait
// un littéral français, ou la suppression d'une lecture, dans un écran de
// production.

const ici = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ici, '..', 'src', 'app');
const FIGE = path.join(ici, '..', '..', 'docs', 'LECTURES.json');

const fige = JSON.parse(fs.readFileSync(FIGE, 'utf8')) as Instantane;

interface Cas { nom: string; fichier: string; avant: string; apres: string; champ: string }

const CAS: Cas[] = [
  {
    nom: 'la ligne du consentement, supprimée',
    fichier: 'eng/[id]/processus/page.tsx',
    avant: '{itv.participants.map',
    apres: '{[].map',
    champ: 'participants',
  },
  {
    /* LE CAS QUE LA PREMIÈRE VERSION NE VOYAIT PAS : la lecture est passée en
       ARGUMENT d'un t(...), donc jamais précédée d'une accolade. */
    nom: 'une lecture passée en argument de t(), supprimée',
    fichier: 'eng/[id]/workpapers/[wid]/page.tsx',
    avant: 'run: wp.engine_run_id.slice(0, 8),',
    apres: "run: '',",
    champ: 'engine_run_id',
  },
  {
    /* Un champ qui SURVIT dans un prédicat mais n'est plus affiché : c'est
       pourquoi l'instantané compte les occurrences au lieu de les chercher. */
    nom: 'un affichage supprimé alors que le champ survit dans un prédicat',
    fichier: 'eng/[id]/processus/page.tsx',
    avant: "{itv.retentionUntil && <> · {t('proc.conservationJusquAu')} {itv.retentionUntil}</>}",
    apres: '',
    champ: 'retentionUntil',
  },
  {
    /* L'écriture optionnelle, que la regex d'origine ne captait pas. */
    nom: 'une lecture écrite avec ?. , supprimée',
    fichier: 'eng/[id]/risk/page.tsx',
    avant: 'cat.risque.formules?.[v.formule]?.calcul ?? v.formule',
    apres: 'v.formule',
    champ: 'formules',
  },
  {
    nom: 'l’empreinte de population, supprimée',
    fichier: 'eng/[id]/population/page.tsx',
    avant: '{pop.hash.slice(0, 30)}',
    apres: '{null}',
    champ: 'hash',
  },
  {
    nom: 'le lien vers le dossier N-1, supprimé',
    fichier: 'eng/[id]/carry-forward/page.tsx',
    avant: '{prev.name}',
    apres: '{null}',
    champ: 'name',
  },
];

prendreLeVerrou('lectures:epreuve');

const aRemettre = new Map<string, string>();
function remettre(): void {
  for (const [f, contenu] of aRemettre) fs.writeFileSync(f, contenu);
  aRemettre.clear();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => { remettre(); process.exit(130); });
}
process.on('uncaughtException', (e) => { remettre(); throw e; });

let echecs = 0;
try {
  const depart = pertes(fige, instantane(APP));
  if (depart.length > 0) {
    console.error(`  ÉCHEC  l’arbre n’est pas propre au départ : ${depart.length} lecture(s) déjà perdue(s)`);
    process.exit(1);
  }
  for (const c of CAS) {
    const chemin = path.join(APP, c.fichier);
    const original = fs.readFileSync(chemin, 'utf8');
    if (!original.includes(c.avant)) {
      console.error(`  ÉCHEC  ${c.nom} : le point d’injection n’existe plus dans ${c.fichier}`);
      console.error('         (l’écran a changé — l’épreuve se remet à jour, elle ne se retire pas)');
      echecs += 1;
      continue;
    }
    aRemettre.set(chemin, original);
    fs.writeFileSync(chemin, original.replace(c.avant, c.apres));
    const vues = pertes(fige, instantane(APP));
    const vu = vues.some((x) => x.fichier === c.fichier && x.champ === c.champ);
    if (vu) console.log(`  ok     ${c.nom}\n         dénoncé : ${c.fichier} → ${c.champ}`);
    else { console.error(`  ÉCHEC  ${c.nom} : la règle N’A RIEN VU`); echecs += 1; }
    remettre();
  }
} finally {
  remettre();
}

if (pertes(fige, instantane(APP)).length > 0) {
  console.error('  ÉCHEC  l’arbre n’a pas été remis en état');
  echecs += 1;
}
console.log(`\n${CAS.length - echecs}/${CAS.length} cas connus mauvais dénoncés par le garde des lectures.`);
process.exit(echecs === 0 ? 0 : 1);
