import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// L'INSTRUMENT S'ÉPROUVE CONTRE DES CAS CONNUS MAUVAIS (règle 17).
//
// La garde du parcours existe pour dénoncer une station qui s'éteint. Elle
// n'aurait aucune valeur si personne n'avait vérifié qu'elle échoue vraiment
// quand une station s'éteint : ce dépôt a déjà vu cinq instruments de suite
// mesurer à côté de ce qu'ils devaient voir.
//
// Chaque cas RETIRE ou RENOMME une vraie station du scénario, lance
// `npm run parcours`, exige qu'il SORTE EN ÉCHEC en nommant la station perdue,
// puis remet le fichier — même sur SIGHUP.

import { jamaisAtteintes, type Fige } from '../src/lib/parcours';
import { prendreLeVerrou } from './verrou';

const ici = path.dirname(fileURLToPath(import.meta.url));
const SCENARIO = path.join(ici, 'clics', 'scenario.ts');
const FIGE = path.join(ici, '..', '..', 'docs', 'PARCOURS.json');

interface Cas { nom: string; avant: string; apres: string; attendu: string }

const CAS: Cas[] = [
  {
    /* LA CLASSE EXACTE DU DÉFAUT : une station retirée, un rapport toujours
       vert avec moins d'étapes. */
    nom: 'une station RETIRÉE du scénario',
    avant: "dire('clôture : le dossier se CLÔT",
    apres: "direRetiree('clôture : le dossier se CLÔT",
    attendu: 'clôture : le dossier se CLÔT',
  },
  {
    /* Renommer revient au même pour qui lit le rapport : la vérification
       d'hier n'y est plus, et rien ne le dit. */
    nom: 'une station RENOMMÉE',
    avant: "dire('langue : le parcours lit le catalogue",
    apres: "dire('langue : verifiee autrement",
    attendu: 'langue : le parcours lit le catalogue',
  },
  {
    /* LE DÉFAUT QUE CETTE GARDE A EU ELLE-MÊME. Sa première version figeait un
       nom CONSTRUIT sur son DÉBUT — « mes travaux : » — et ce préfixe de
       quatorze caractères avalait les six stations « mes travaux : … » qui le
       suivaient : toutes pouvaient disparaître sans qu'elle ne bronche. Ce cas
       retire une station littérale voisine d'une station construite. */
    nom: 'une station littérale voisine d\u2019une station construite',
    avant: "dire('mes travaux : la note adress\u00e9e APPARA\u00ceT dans la liste de travail'",
    apres: "direRetiree('mes travaux : la note adress\u00e9e APPARA\u00ceT dans la liste de travail'",
    attendu: 'mes travaux : la note adress\u00e9e APPARA\u00ceT dans la liste de travail',
  },
  {
    /* Et la station CONSTRUITE elle-même : elle est figée comme une expression
       ancrée aux deux bouts, donc elle se dénonce aussi. */
    nom: 'une station au nom construit',
    avant: "dire(`papier : l\u2019export ${nom} est offert sur l\u2019\u00e9cran`",
    apres: "direRetiree(`papier : l\u2019export ${nom} est offert sur l\u2019\u00e9cran`",
    attendu: 'papier : l',
  },
];

prendreLeVerrou('parcours:epreuve');

const aRemettre = new Map<string, string>();
function remettre(): void {
  for (const [f, c] of aRemettre) fs.writeFileSync(f, c);
  aRemettre.clear();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => { remettre(); process.exit(130); });
}
process.on('uncaughtException', (e) => { remettre(); throw e; });

/** `npm run parcours`, tel qu'il tourne dans la chaîne. */
function garde(): { code: number; sortie: string } {
  try {
    const sortie = execFileSync(process.execPath, [
      path.join(ici, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(ici, 'parcours.ts'),
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, sortie };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, sortie: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

let echecs = 0;

const depart = garde();
if (depart.code !== 0) {
  console.error('  ÉCHEC  la garde n’est pas verte au départ — éprouver sur un arbre sale ne prouve rien');
  console.error(depart.sortie.split('\n').slice(0, 6).map((l) => `         ${l}`).join('\n'));
  process.exit(1);
}

for (const c of CAS) {
  const original = fs.readFileSync(SCENARIO, 'utf8');
  if (!original.includes(c.avant)) {
    console.error(`  ÉCHEC  ${c.nom} : le point d’injection n’existe plus dans le scénario`);
    console.error('         (le parcours a changé — l’épreuve doit être remise à jour, pas retirée)');
    echecs += 1;
    continue;
  }
  try {
    aRemettre.set(SCENARIO, original);
    fs.writeFileSync(SCENARIO, original.replace(c.avant, c.apres));
    const r = garde();
    if (r.code !== 0 && r.sortie.includes(c.attendu)) {
      console.log(`  ok     ${c.nom}\n         dénoncée : ${c.attendu}`);
    } else if (r.code !== 0) {
      console.error(`  ÉCHEC  ${c.nom} : la garde a échoué SANS nommer la station perdue`);
      echecs += 1;
    } else {
      console.error(`  ÉCHEC  ${c.nom} : la garde N’A RIEN VU`);
      echecs += 1;
    }
  } finally {
    remettre();
  }
}

const fin = garde();
if (fin.code !== 0) {
  console.error('  ÉCHEC  le scénario n’a pas été remis en état');
  echecs += 1;
}

/* LA GARDE D'EXÉCUTION S'ÉPROUVE AUSSI (défaut n°22, second volet). Les cas
   ci-dessus n'exercent que la garde STATIQUE : celle qui lit le code. Celle qui
   compare les stations CONDUITES au figé n'avait aucun cas connu mauvais — et
   c'est précisément elle qui était inerte tant que `conduites` restait vide.

   On ne relance pas un navigateur pour cela : on prend le figé RÉEL, on retire
   une station de la liste des conduites, et on exige que la garde la nomme. */
const figeReel = JSON.parse(fs.readFileSync(FIGE, 'utf8')) as Fige;
if (figeReel.conduites.length === 0) {
  console.error('  ÉCHEC  le figé ne porte AUCUNE station conduite : la garde d’exécution est inerte');
  console.error('         (figez un parcours vert : `npm run clics -- --figer`)');
  echecs += 1;
} else {
  const conduites = figeReel.conduites.map((x) => x.nom);
  const retiree = figeReel.conduites.find((x) => !x.gabarit)!;
  const sansElle = conduites.filter((n) => n !== retiree.nom);
  const vues = jamaisAtteintes(figeReel.conduites, sansElle);
  if (vues.some((x) => x.nom === retiree.nom)) {
    console.log(`  ok     une station figée mais NON CONDUITE\n         dénoncée : ${retiree.nom}`);
  } else {
    console.error('  ÉCHEC  une station figée mais NON CONDUITE : la garde N’A RIEN VU');
    echecs += 1;
  }
  /* Et le cas symétrique : rien retiré, rien dénoncé — une garde qui crie
     toujours ne vaut pas mieux qu'une garde muette. */
  if (jamaisAtteintes(figeReel.conduites, conduites).length !== 0) {
    console.error('  ÉCHEC  la garde d’exécution crie sur un parcours COMPLET');
    echecs += 1;
  }
}

console.log(`\n${CAS.length + 1 - echecs}/${CAS.length + 1} cas connus mauvais dénoncés par la garde du parcours.`);
process.exit(echecs === 0 ? 0 : 1);
