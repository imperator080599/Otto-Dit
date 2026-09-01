import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { horsCatalogue } from '../src/lib/langue';

// L'INSTRUMENT S'ÉPROUVE CONTRE DES CAS CONNUS MAUVAIS (règle 17).
//
// Un détecteur qui n'a jamais échoué exprès n'a jamais été testé. Celui-ci a
// affiché « 0 reste » sur cent quatre-vingts chaînes affichées, dont les vingt-
// deux phrases de la liste que lit un signataire avant de signer. Deux fois de
// suite : la première version effaçait les littéraux avant de lire, la seconde
// prenait un bouton d'un mot minuscule pour un identifiant.
//
// Ce script INJECTE le défaut dans un vrai écran, vérifie que la règle le
// dénonce, puis remet le fichier en place. Il échoue si un seul cas passe
// inaperçu — et il remet toujours les fichiers, même s'il échoue.

const ici = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ici, '..', 'src', 'app');

interface Cas {
  nom: string;
  fichier: string;
  avant: string;
  apres: string;
  /** Ce que la règle doit dire — pas seulement « elle a échoué ». */
  attendu: string;
}

const CAS: Cas[] = [
  {
    nom: 'une phrase française dans un nœud JSX',
    fichier: 'eng/[id]/obstacles/page.tsx',
    avant: "<h2>{t('obst.titre')}</h2>",
    apres: '<h2>Ce qui empêche de viser ce dossier</h2>',
    attendu: 'Ce qui empêche de viser ce dossier',
  },
  {
    /* LA CLASSE QUE LA PREMIÈRE VERSION EFFAÇAIT AVANT DE LIRE. */
    nom: 'une phrase rangée dans une table de libellés',
    fichier: 'eng/[id]/familles.ts',
    avant: "acceptation: { titre: 'famille.acceptation.titre'",
    apres: "acceptation: { titre: 'Acceptation de la mission'",
    attendu: 'Acceptation de la mission',
  },
  {
    /* LA CLASSE QUE LA DEUXIÈME VERSION PRENAIT POUR UN IDENTIFIANT. */
    nom: 'un bouton d’un seul mot, en minuscule',
    fichier: 'eng/[id]/risk/page.tsx',
    avant: ">{t('mot.keep')}</button>",
    apres: '>retenir</button>',
    attendu: 'retenir',
  },
  {
    /* LA RÈGLE EST STRUCTURELLE, PAS LINGUISTIQUE : si elle ne voit que le
       français, elle n'a rien prouvé — l'état mixte revient par l'anglais. */
    nom: 'une chaîne ANGLAISE hors catalogue',
    fichier: 'eng/[id]/dashboard/page.tsx',
    avant: "<h2>{t('dash.requestTracker')}</h2>",
    apres: '<h2>Request tracker</h2>',
    attendu: 'Request tracker',
  },
  {
    /* LA CLASSE QUE LA TROISIÈME VERSION RELEVAIT COMME UN LITTÉRAL : un
       attribut de libellé est affiché par construction, mais un mot minuscule
       d'un seul tenant y passait pour un nom de variable. */
    nom: 'un attribut de libellé d’un seul mot',
    fichier: 'eng/[id]/risk/page.tsx',
    avant: "placeholder={t('commun.motifCourt')}",
    apres: 'placeholder="motif"',
    attendu: 'motif',
  },
];

let echecs = 0;

/* L'ÉTAT DE DÉPART DOIT ÊTRE PROPRE : éprouver un instrument sur un arbre déjà
   sale ne prouve rien — on ne saurait pas si c'est le défaut injecté qu'il a vu. */
const depart = horsCatalogue(APP);
if (depart.restes.length > 0) {
  console.error(`  ÉCHEC  l’arbre n’est pas propre au départ : ${depart.restes.length} chaîne(s) hors catalogue`);
  for (const r of depart.restes.slice(0, 5)) console.error(`         ${r}`);
  process.exit(1);
}

for (const c of CAS) {
  const chemin = path.join(APP, c.fichier);
  const original = fs.readFileSync(chemin, 'utf8');
  if (!original.includes(c.avant)) {
    console.error(`  ÉCHEC  ${c.nom} : le point d’injection n’existe plus dans ${c.fichier}`);
    console.error('         (l’écran a changé — l’épreuve doit être remise à jour, pas retirée)');
    echecs += 1;
    continue;
  }
  try {
    fs.writeFileSync(chemin, original.replace(c.avant, c.apres));
    const { restes } = horsCatalogue(APP);
    const vu = restes.some((r) => r.includes(c.attendu));
    if (vu && restes.length === 1) {
      console.log(`  ok     ${c.nom}\n         dénoncé : ${restes[0]}`);
    } else if (vu) {
      console.log(`  ok     ${c.nom} (avec ${restes.length - 1} reste(s) collatéral(aux))`);
    } else {
      console.error(`  ÉCHEC  ${c.nom} : la règle N’A RIEN VU`);
      echecs += 1;
    }
  } finally {
    fs.writeFileSync(chemin, original);
  }
}

const fin = horsCatalogue(APP);
if (fin.restes.length > 0) {
  console.error(`  ÉCHEC  l’arbre n’a pas été remis en état : ${fin.restes.length} reste(s)`);
  echecs += 1;
}

console.log(`\n${CAS.length - echecs}/${CAS.length} cas connus mauvais dénoncés par la règle.`);
process.exit(echecs === 0 ? 0 : 1);
