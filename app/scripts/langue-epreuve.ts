import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { horsCatalogue, libellesDeService } from '../src/lib/langue';
import { LIBELLES } from '../src/lib/i18n/catalogue';
import { prendreLeVerrou } from './verrou';

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
const LIB = path.join(ici, '..', 'src', 'lib');

/* LA MESURE COMPLÈTE : les chaînes d'écran ET les libellés tenus dans un
   service. Éprouver une règle et pas l'autre laisserait la seconde sans cas
   connu mauvais — c'est-à-dire non testée (règle 17). */
function mesure(): string[] {
  const { restes } = horsCatalogue(APP);
  const { restes: services } = libellesDeService(LIB, new Set(Object.keys(LIBELLES)));
  return [...restes, ...services];
}

interface Cas {
  nom: string;
  /** Où vit le fichier : un écran (`src/app`) ou un service (`src/lib`). */
  racine?: 'app' | 'lib';
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
    /* Le point d'injection a changé d'ancre le 2026-09-03 : « Request tracker »
       est devenu le TITRE d'une section repliable (`titre={t(...)}`), donc la
       chaîne `<h2>{t('dash.requestTracker')}</h2>` n'existe plus dans l'écran.
       L'épreuve suit l'écran — on la remet à jour, on ne la retire pas. */
    fichier: 'eng/[id]/dashboard/page.tsx',
    avant: "<h2>{t('col.deficiencies')}</h2>",
    apres: '<h2>Deficiency register</h2>',
    attendu: 'Deficiency register',
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
  {
    /* LA CLASSE QUE LA QUATRIÈME VERSION EFFAÇAIT AVANT DE LIRE. Le nettoyage
       du SQL cherchait `` `…select…` `` par expression régulière : le motif
       n'exigeait pas que la zone soit À L'INTÉRIEUR d'un gabarit, si bien
       qu'il mangeait le JSX compris entre le backtick FERMANT d'un
       `className={`…`}` et le backtick OUVRANT du suivant, dès qu'il
       contenait un `<select>`. 63 785 caractères dans 25 écrans, 108 chaînes
       affichées invisibles. Ce cas est posé DANS une de ces zones. */
    nom: 'une phrase dans une zone qu’un nettoyage effaçait (voisinage d’un <select>)',
    fichier: 'eng/[id]/materiality/page.tsx',
    avant: "{t('mat.engineProposalHumanDecides')}",
    apres: 'Proposition du moteur — un humain décide',
    attendu: 'Proposition du moteur',
  },
  {
    /* LA CLASSE QUE LA CINQUIÈME VERSION ÉCARTAIT COMME DU CODE. Une entité
       HTML porte un POINT-VIRGULE — « Approve &amp; send (L2) » — et le filtre
       qui écarte le code écartait la phrase avec lui. Sept chaînes d’écran,
       dont le bouton qui APPROUVE ET ENVOIE une demande au client, étaient
       invisibles à la règle pour ce seul caractère. */
    nom: 'une phrase portant une entité HTML (le point-virgule pris pour du code)',
    fichier: 'eng/[id]/requests/[rid]/page.tsx',
    avant: ">{t('req.approveAndSendL2')}<",
    apres: '>Approve &amp; send (L2)<',
    attendu: 'Approve & send (L2)',
  },
  {
    /* Et la variante sans entité : un nom de TOUCHE du clavier passait pour un
       identifiant jusque dans un en-tête de colonne du RCM. */
    nom: 'un en-tête de colonne qui porte le nom d’une touche du clavier',
    fichier: 'eng/[id]/rcm/page.tsx',
    avant: "<tr><th>{t('proc.controle')}</th>",
    apres: '<tr><th>Control</th>',
    attendu: 'Control',
  },
  {
    /* LA CLASSE QUE LA RÈGLE D'ÉCRAN NE POUVAIT PAS VOIR : un écran
       irréprochable qui rend une TABLE DE LIBELLÉS tenue dans un service.
       `NOTE_TYPES` portait « à corriger (bloquante) » et deux écrans
       l'affichaient tel quel, quelle que soit la langue du cabinet. */
    nom: 'une table de libellés tenue dans un SERVICE',
    racine: 'lib',
    fichier: 'services/workpapers/lifecycle.ts',
    avant: "a_corriger: { libelle: 'note.type.a_corriger'",
    apres: "a_corriger: { libelle: '\u00e0 corriger (bloquante)'",
    attendu: '\u00e0 corriger (bloquante)',
  },
  {
    /* LA CLASSE QUE LA SIXIÈME VERSION NE LISAIT PAS : un `detail:` en GABARIT
       (backticks) dans un service. « en attente du visa réviseur » se rendait
       tel quel sur l'instance anglaise, sur l'écran d'où l'on part — et le
       détecteur affichait 0 reste (revue hostile n°4). */
    nom: 'un « detail » français en gabarit dans un service',
    racine: 'lib',
    fichier: 'services/travaux.ts',
    avant: "detail: motif('trav.detail.visa', { role: { cle: NOM_VISA[attendu] } }),",
    apres: 'detail: `en attente du visa ${NOM_VISA[attendu]}`,',
    attendu: 'en attente du visa',
  },
  {
    /* LA FORME TERNAIRE, que la septième version ne lisait pas : la propriété
       est suivie d'une condition, pas d'une chaîne. */
    nom: 'un « resume » français en ternaire dans un service',
    racine: 'lib',
    fichier: 'services/poste.ts',
    avant: "        ? motif('poste.resume.rienAControler')\n        : motif('poste.resume.testes', { testes: ech!.testes, items: ech!.items }),",
    apres: "        ? 'rien à contrôler tant que l’échantillon n’est pas tiré'\n        : `${ech!.testes} / ${ech!.items} élément(s) contrôlé(s)`,",
    attendu: 'rien à contrôler',
  },
  {
    /* Un nom de propriété que la liste ne portait pas. */
    nom: 'une « description » française hors catalogue dans un service',
    racine: 'lib',
    fichier: 'services/travaux.ts',
    avant: "      quand: d.due_date, retard: true,",
    apres: "      quand: d.due_date, retard: true, description: 'échéance dépassée, sans réponse',",
    attendu: 'échéance dépassée, sans réponse',
  },
  {
    /* Et la variante ANGLAISE, pour que la règle des services reste
       structurelle et non linguistique, comme celle des écrans. */
    nom: 'un libellé ANGLAIS en dur dans un service',
    racine: 'lib',
    fichier: 'services/poste.ts',
    avant: "cle: 'leadsheet', titre: 'poste.section.leadsheet'",
    apres: "cle: 'leadsheet', titre: 'Leadsheet and account balances'",
    attendu: 'Leadsheet and account balances',
  },
  {
    /* LA CLASSE QUE CINQ VERSIONS ONT LAISSÉE PASSER : les deux branches d'un
       ternaire placé en ENFANT JSX sont affichées, mais elles étaient relevées
       comme des LITTÉRAUX — et un mot minuscule d'un seul tenant y passe pour
       un identifiant. `{m.can_sign ? 'oui' : 'non'}` s'affichait en français
       sur l'instance anglaise. */
    nom: 'les deux branches d\u2019un ternaire affiché',
    fichier: 'eng/[id]/team/page.tsx',
    avant: "{m.can_sign ? t('commun.oui') : t('commun.non')}",
    apres: "{m.can_sign ? 'oui' : 'non'}",
    attendu: 'oui',
  },
  {
    /* LA CLASSE QUE LE PREMIER FILTRE ÉCARTAIT : « > 90 j (N) » n'a pas deux
       lettres de suite. Le « j » est français (jours) et l'en-tête restait
       français sur l'instance anglaise. DA-22 l'avait annoncé corrigé par le
       décodage des entités : c'était faux, le point-virgule n'y était pour
       rien. */
    nom: 'un en-tête sans deux lettres de suite',
    fichier: 'eng/[id]/balances-aux/page.tsx',
    avant: "<th className=\"num\">{t('bal.plus90jN')}</th>",
    apres: '<th className="num">&amp;gt; 90 j (N)</th>',
    attendu: '> 90 j (N)',
  },
];

/* LES FICHIERS SONT REMIS EN ÉTAT MÊME SUR SIGHUP. Un `finally` ne s'exécute
   pas quand le terminal se ferme : une coupure laissait un littéral français
   injecté dans un écran de production — le défaut que l'épreuve existe pour
   attraper, abandonné dans l'arbre. */
prendreLeVerrou('langue:epreuve');

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

/* L'ÉTAT DE DÉPART DOIT ÊTRE PROPRE : éprouver un instrument sur un arbre déjà
   sale ne prouve rien — on ne saurait pas si c'est le défaut injecté qu'il a vu. */
const depart = mesure();
if (depart.length > 0) {
  console.error(`  ÉCHEC  l’arbre n’est pas propre au départ : ${depart.length} chaîne(s) hors catalogue`);
  for (const r of depart.slice(0, 5)) console.error(`         ${r}`);
  process.exit(1);
}

for (const c of CAS) {
  const chemin = path.join(c.racine === 'lib' ? LIB : APP, c.fichier);
  const original = fs.readFileSync(chemin, 'utf8');
  if (!original.includes(c.avant)) {
    console.error(`  ÉCHEC  ${c.nom} : le point d’injection n’existe plus dans ${c.fichier}`);
    console.error('         (l’écran a changé — l’épreuve doit être remise à jour, pas retirée)');
    echecs += 1;
    continue;
  }
  try {
    aRemettre.set(chemin, original);
    fs.writeFileSync(chemin, original.replace(c.avant, c.apres));
    const restes = mesure();
    /* LE RESTE DOIT VENIR DU FICHIER INJECTÉ. Se contenter de « une chaîne
       contient le texte attendu » laisserait un cas passer pour une mauvaise
       raison : n'importe quel reste portant le mot « motif » validerait le cas
       du `placeholder`. */
    const vu = restes.some((r) => r.startsWith(c.fichier) && r.includes(c.attendu));
    if (vu && restes.length === 1) {
      console.log(`  ok     ${c.nom}\n         dénoncé : ${restes[0]}`);
    } else if (vu) {
      console.log(`  ok     ${c.nom} (avec ${restes.length - 1} reste(s) collatéral(aux))`);
    } else {
      console.error(`  ÉCHEC  ${c.nom} : la règle N’A RIEN VU`);
      echecs += 1;
    }
  } finally {
    remettre();
  }
}

const fin = mesure();
if (fin.length > 0) {
  console.error(`  ÉCHEC  l’arbre n’a pas été remis en état : ${fin.length} reste(s)`);
  echecs += 1;
}

console.log(`\n${CAS.length - echecs}/${CAS.length} cas connus mauvais dénoncés par la règle.`);
process.exit(echecs === 0 ? 0 : 1);
