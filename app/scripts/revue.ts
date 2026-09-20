/**
 * docs/REVUE.md EST ENGENDRÉ — jamais rédigé (règle 21 ; mandat 2026-09-20 §5.1, plan §15, tâche P0-00).
 *
 * POURQUOI. Le mandat de phase 2 demande UN inventaire : une ligne par épreuve du fondateur
 * (R-F1..22, mandat §1), par observation du superviseur (S-1..6, mandat §2), et par constat P0/P1
 * de l'audit technique (AUD-01..18, docs/AUDIT.md), avec pour chacune EXACTEMENT UN statut —
 * OBSERVÉE (avec la station et le SHA), NON OBSERVÉE (une phrase nommant le manque), ou SANS OBJET
 * (la décision du fondateur qui l'a écartée — aucune ligne ne l'est à l'ouverture de la Phase 2).
 * « Rien n'est déclaré. Tout est mesuré. »
 *
 * CE QU'IL LIT : docs/instantanes/revue.json — les 46 lignes de l'inventaire, chacune avec son
 * énoncé, son état, et sa preuve, son manque ou sa décision ; et la table des gestes du §20 du
 * plan (H-1..H-8), rendue à part, hors du compte de l'inventaire.
 *
 * CE QU'IL REFUSE, plutôt que de taire (règle 13) :
 *   · un état qui n'est ni OBSERVEE, ni NON_OBSERVEE, ni SANS_OBJET ;
 *   · une ligne OBSERVEE sans un `station` ET un `sha` nommés (acceptation P0-00 : « une ligne ne
 *     passe à OBSERVEE qu'avec un SHA et une station nommés ») ;
 *   · une ligne NON_OBSERVEE sans son champ `manque` ;
 *   · une ligne SANS_OBJET sans son champ `decision`.
 *
 * OÙ IL CESSE DE REGARDER : il ne clique rien lui-même, il ne relance aucun test, il ne revérifie
 * aucune des épreuves contre l'arbre courant — il rapporte ce que docs/instantanes/revue.json
 * affirme, daté, pour que le rapport se sache non rejouable sans une mesure neuve derrière chaque
 * passage à OBSERVEE (règle 12).
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@/lib/db/client';

type Etat = 'OBSERVEE' | 'NON_OBSERVEE' | 'SANS_OBJET';

interface Ligne {
  id: string;
  source: string;
  titre: string;
  epreuve: string;
  etat: Etat;
  station?: string;
  sha?: string;
  manque?: string;
  decision?: string;
  tache: string[];
  phase: number;
}

interface GesteH {
  id: string;
  geste: string;
  quand: string;
  etat: string;
  note: string;
}

export interface Revue {
  sources: {
    mandat: { date: string; fichier: string; sections: string };
    audit: { date: string; fichier: string; sha: string; note: string };
    plan: { fichier: string; correspondance: string };
  };
  ouvertureDePhase: { quand: string; note: string };
  lignes: Ligne[];
  gestesH: GesteH[];
}

function badge(etat: Etat): string {
  if (etat === 'OBSERVEE') return '**OBSERVÉE**';
  if (etat === 'NON_OBSERVEE') return '**NON OBSERVÉE**';
  return '**SANS OBJET**';
}

function validerLigne(l: Ligne): void {
  if (l.etat !== 'OBSERVEE' && l.etat !== 'NON_OBSERVEE' && l.etat !== 'SANS_OBJET') {
    throw new Error(`ligne ${l.id} : état inconnu « ${l.etat} »`);
  }
  if (l.etat === 'OBSERVEE') {
    if (!l.station || !l.sha) {
      throw new Error(
        `ligne ${l.id} : état OBSERVEE sans 'station' et 'sha' nommés (acceptation P0-00)`,
      );
    }
  } else if (l.etat === 'NON_OBSERVEE') {
    if (!l.manque) throw new Error(`ligne ${l.id} : état NON_OBSERVEE sans champ 'manque'`);
  } else {
    if (!l.decision) throw new Error(`ligne ${l.id} : état SANS_OBJET sans champ 'decision'`);
  }
}

function ligneMd(l: Ligne): string {
  const tache = l.tache.length > 0 ? ` — tâche(s) \`${l.tache.join('`, `')}\`` : '';
  const out = [`### ${l.id} — ${l.titre} (${l.source}${tache})`, '', `Épreuve : ${l.epreuve}`, ''];
  out.push(`${badge(l.etat)}`);
  if (l.etat === 'OBSERVEE') {
    out.push(`Preuve : station « ${l.station} », SHA \`${l.sha}\`.`);
  } else if (l.etat === 'NON_OBSERVEE') {
    out.push(`Manque : ${l.manque}`);
  } else {
    out.push(`Décision : ${l.decision}`);
  }
  return out.join('\n');
}

export function rendre(data: Revue): string {
  let observee = 0, nonObservee = 0, sansObjet = 0;
  for (const l of data.lignes) {
    validerLigne(l);
    if (l.etat === 'OBSERVEE') observee++;
    else if (l.etat === 'NON_OBSERVEE') nonObservee++;
    else sansObjet++;
  }
  const total = data.lignes.length;
  const tauxObserve = total > 0 ? Math.round((observee / total) * 100) : 0;

  const parPhase = new Map<number, Ligne[]>();
  for (const l of data.lignes) {
    const arr = parPhase.get(l.phase) ?? [];
    arr.push(l);
    parPhase.set(l.phase, arr);
  }
  const phasesTriees = [...parPhase.keys()].sort((a, b) => a - b);

  const enTete = [
    '<!-- ENGENDRÉ par `cd app && npm run revue` — ne pas éditer à la main. -->',
    '# Inventaire de la phase 2 — chaque épreuve du fondateur et de l\'audit, mesurée',
    '',
    `Mandat du ${data.sources.mandat.date} — \`${data.sources.mandat.fichier}\`, `
    + `${data.sources.mandat.sections}. Audit du ${data.sources.audit.date} (SHA `
    + `\`${data.sources.audit.sha.slice(0, 7)}\`) — \`${data.sources.audit.fichier}\`. `
    + `${data.sources.audit.note}`,
    '',
    `**${total} lignes — ${observee} OBSERVÉE(S), ${nonObservee} NON OBSERVÉE(S), `
    + `${sansObjet} SANS OBJET (${tauxObserve} % observé).**`,
    '',
    data.ouvertureDePhase.note,
    '',
    'OBSERVÉE signifie observé en CONDUISANT le vrai parcours dans le monde semé — une station de '
    + '`app/scripts/clics/scenario.ts`, confirmée par une exécution réelle, avec son SHA (règle 15/37 : '
    + 'un balayage de texte n\'est pas une garde, chercher un mot n\'est pas vérifier un chemin).',
    '',
    '---',
    '',
  ].join('\n');

  const corps = phasesTriees
    .map((phase) => {
      const lignes = parPhase.get(phase)!;
      const enteteBloc = `## Phase ${phase}\n`;
      return enteteBloc + '\n' + lignes.map(ligneMd).join('\n\n');
    })
    .join('\n\n---\n\n');

  const gestes = [
    '---',
    '',
    '## Gestes du plan §20 (main humaine) — hors du compte ci-dessus',
    '',
    'Ce que ce document ne peut ni prendre ni simuler (plan §20). Une ligne ici n\'entre jamais '
    + 'dans le compte OBSERVÉE/NON OBSERVÉE/SANS OBJET : ce sont des gestes, pas des épreuves.',
    '',
    ...data.gestesH.map(
      (h) => `- **${h.id}** (${h.quand}, état : \`${h.etat}\`) — ${h.geste}. ${h.note}`,
    ),
    '',
  ].join('\n');

  return enTete + corps + '\n\n' + gestes;
}

export function lireDonnees(): Revue {
  const cheminJson = path.join(repoRoot(), 'docs', 'instantanes', 'revue.json');
  return JSON.parse(fs.readFileSync(cheminJson, 'utf8')) as Revue;
}

export function engendrer(): string {
  return rendre(lireDonnees());
}

/**
 * Le cliquet (`--figer`) : `docs/instantanes/revue-plafond.json` fige le compte NON_OBSERVEE
 * courant. Entre deux `--figer`, ce compte ne doit que BAISSER (une tranche ferme des lignes,
 * elle n'en rouvre pas) — patron identique à `plancher.ts`/`parcours.ts` (règle 17, §17 du plan :
 * « les listes figées qui ne peuvent que baisser »). Sans fichier de plafond, aucune garde ne
 * s'applique (premier passage, avant le premier `--figer`).
 */
function compterNonObservee(data: Revue): number {
  return data.lignes.filter((l) => l.etat === 'NON_OBSERVEE').length;
}

if (process.argv[1]?.endsWith('revue.ts')) {
  const md = engendrer();
  const dest = path.join(repoRoot(), 'docs', 'REVUE.md');
  fs.writeFileSync(dest, md);
  const counts = md.match(/\*\*(\d+) lignes.*?\*\*/s);
  console.log(`docs/REVUE.md écrit — ${counts ? counts[0].replace(/\*\*/g, '') : ''}`);

  const data = lireDonnees();
  const nonObservee = compterNonObservee(data);
  const chemPlafond = path.join(repoRoot(), 'docs', 'instantanes', 'revue-plafond.json');

  if (process.argv.includes('--figer')) {
    fs.writeFileSync(
      chemPlafond,
      `${JSON.stringify({ nonObservee, quand: data.ouvertureDePhase.quand }, null, 2)}\n`,
    );
    console.log(`docs/instantanes/revue-plafond.json : plafond NON_OBSERVEE figé à ${nonObservee}.`);
  } else if (fs.existsSync(chemPlafond)) {
    const plafond = (JSON.parse(fs.readFileSync(chemPlafond, 'utf8')) as { nonObservee: number })
      .nonObservee;
    if (nonObservee > plafond) {
      console.error(
        `${nonObservee} ligne(s) NON OBSERVÉE, plafond figé ${plafond} : `
        + `${nonObservee - plafond} ligne(s) sont RÉAPPARUES NON OBSERVÉE. `
        + 'Si c\'est voulu (une ligne nouvelle, une ligne rouverte), dites-le : `npm run revue:figer`.',
      );
      process.exit(1);
    }
  }
}
