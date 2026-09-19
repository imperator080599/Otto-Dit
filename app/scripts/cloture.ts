/**
 * docs/CLOTURE.md EST ENGENDRÉ — jamais rédigé (règle 21 ; mandat de clôture, 2026-09-19 §2).
 *
 * POURQUOI. Le mandat de clôture demande UNE mesure : l'inventaire de CHAQUE épreuve
 * d'acceptation écrite dans les mandats du fondateur (docs/MANDATS/), avec pour chacune
 * EXACTEMENT UN statut — OBSERVÉ (avec le chemin cliqué et le SHA), NON OBSERVÉ (une phrase
 * nommant le manque), ou SANS OBJET (la décision du fondateur qui l'a écartée). « Rien n'est
 * déclaré. Tout est mesuré. »
 *
 * CE QU'IL LIT : docs/instantanes/cloture.json — les 31 épreuves des quatre mandats
 * (2026-09-08, 09, 10, 14), chacune avec son énoncé, son statut, et sa preuve ou son manque.
 * Ce fichier de données a été peuplé par une recherche adverse dédiée (quatre sous-agents
 * indépendants, un par mandat, cherchant une preuve CLIQUÉE — une station de
 * app/scripts/clics/scenario.ts confirmée par docs/CLICS.md — jamais un test vitest seul,
 * règle 15/37) ; ce script ne refait pas cette recherche, il ne fait que la RENDRE, en comptant
 * lui-même les totaux plutôt que de les recopier (règle 21 : aucun chiffre en prose que le
 * script n'a pas produit).
 *
 * CE QU'IL REFUSE, plutôt que de taire (règle 13) :
 *   · un statut qui n'est ni OBSERVE, ni NON_OBSERVE, ni SANS_OBJET ;
 *   · une épreuve OBSERVE sans son champ `preuve` ;
 *   · une épreuve NON_OBSERVE sans son champ `manque` ;
 *   · une épreuve SANS_OBJET sans son champ `decision`.
 *
 * OÙ IL CESSE DE REGARDER : il ne clique rien lui-même, il ne relance aucun test, il ne
 * revérifie aucune des 31 preuves contre l'arbre courant — il rapporte ce que la recherche du
 * 2026-09-19 a trouvé, avec sa date, pour que le rapport se sache daté et non rejouable sans
 * une recherche neuve (règle 12 : une vérification que personne ne peut rejouer est une
 * affirmation — ce script n'affirme rien de plus frais que sa propre source de données).
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';

interface Epreuve {
  id: string;
  codes: string[];
  enonce: string;
  statut: 'OBSERVE' | 'NON_OBSERVE' | 'SANS_OBJET';
  preuve?: string;
  sha?: string;
  manque?: string;
  decision?: string;
}

interface Mandat {
  date: string;
  fichier: string;
  section: string;
  epreuves: Epreuve[];
}

interface Cloture {
  engendrePar: string;
  recherche: { quand: string; methode: string };
  mandats: Mandat[];
}

function badge(statut: Epreuve['statut']): string {
  if (statut === 'OBSERVE') return '**OBSERVÉ**';
  if (statut === 'NON_OBSERVE') return '**NON OBSERVÉ**';
  return '**SANS OBJET**';
}

function ligneEpreuve(e: Epreuve): string {
  const codes = e.codes.length > 0 ? ` (\`${e.codes.join('`, `')}\`)` : '';
  const lignes = [`- ${badge(e.statut)}${codes} — ${e.enonce}`];
  if (e.statut === 'OBSERVE') {
    if (!e.preuve) throw new Error(`épreuve ${e.id} : statut OBSERVE sans champ 'preuve'`);
    lignes.push(`  Preuve : ${e.preuve}${e.sha ? ` SHA \`${e.sha}\`.` : ''}`);
  } else if (e.statut === 'NON_OBSERVE') {
    if (!e.manque) throw new Error(`épreuve ${e.id} : statut NON_OBSERVE sans champ 'manque'`);
    lignes.push(`  Manque : ${e.manque}`);
  } else {
    if (!e.decision) throw new Error(`épreuve ${e.id} : statut SANS_OBJET sans champ 'decision'`);
    lignes.push(`  Décision : ${e.decision}`);
  }
  return lignes.join('\n');
}

export function engendrer(): string {
  const cheminJson = path.join(repoRoot(), 'docs', 'instantanes', 'cloture.json');
  const data = JSON.parse(fs.readFileSync(cheminJson, 'utf8')) as Cloture;

  let total = 0, observe = 0, nonObserve = 0, sansObjet = 0;
  const sections: string[] = [];

  for (const m of data.mandats) {
    const lignes = m.epreuves.map((e) => {
      total++;
      if (e.statut === 'OBSERVE') observe++;
      else if (e.statut === 'NON_OBSERVE') nonObserve++;
      else if (e.statut === 'SANS_OBJET') sansObjet++;
      else throw new Error(`épreuve ${e.id} : statut inconnu « ${e.statut} »`);
      return ligneEpreuve(e);
    });
    sections.push(
      `## Mandat du ${m.date} — \`${m.fichier}\`, ${m.section}\n\n${lignes.join('\n\n')}`,
    );
  }

  const tauxObserve = total > 0 ? Math.round((observe / total) * 100) : 0;

  const en_tete = [
    '<!-- ENGENDRÉ par `cd app && npm run cloture` — ne pas éditer à la main. -->',
    '# Inventaire de clôture — chaque épreuve des mandats du fondateur, mesurée',
    '',
    `Recherche menée le ${data.recherche.quand}. Méthode : ${data.recherche.methode}`,
    '',
    `**${total} épreuves recensées dans les quatre mandats (08, 09, 10, 14 septembre 2026) — `
    + `${observe} OBSERVÉE(S), ${nonObserve} NON OBSERVÉE(S), ${sansObjet} SANS OBJET `
    + `(${tauxObserve} % observé).**`,
    '',
    'OBSERVÉ signifie observé en CONDUISANT le vrai parcours dans le monde semé — une station de '
    + '`app/scripts/clics/scenario.ts`, confirmée par une exécution réelle dans `docs/CLICS.md`. '
    + 'Un test vitest, aussi rigoureux soit-il, ne suffit PAS seul : c\'est la distinction qui a '
    + 'trouvé le blocage NOTIF-01 (seule voie qui l\'a vu), et c\'est pourquoi cet inventaire '
    + 'l\'applique partout, sans exception de confort.',
    '',
    '---',
    '',
  ].join('\n');

  return en_tete + sections.join('\n\n---\n\n') + '\n';
}

if (process.argv[1]?.endsWith('cloture.ts')) {
  const md = engendrer();
  const dest = path.join(repoRoot(), 'docs', 'CLOTURE.md');
  fs.writeFileSync(dest, md);
  const counts = md.match(/\*\*(\d+) épreuves recensées.*?\*\*/s);
  console.log(`docs/CLOTURE.md écrit — ${counts ? counts[0].replace(/\*\*/g, '') : ''}`);
}
