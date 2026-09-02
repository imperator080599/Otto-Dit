import fs from 'node:fs';
import { getDb, q1 } from '../../src/lib/db/client';

// LE TÉMOIN DE LA SONDE (mandat de la soirée, §0.2) — sur une base LOCALE.
//
// `npm run accept` en mode sonde promet de ne rien écrire. Une promesse se
// mesure : ce script compte les lignes des tables que l'acceptation toucherait
// (grille, cellules, dispositions, conclusions, journal, rapports IPE, moteur)
// AVANT le passage (`--avant=<fichier>`) et les compare APRÈS
// (`--apres=<fichier>`). Une différence est un échec : la sonde a écrit.
//
// Il ne tourne que là où la base est lisible par ce processus (PGlite locale,
// serveur arrêté) — jamais contre la démonstration publique.

/* `section_visit` : le journal de consultation s'écrit AU RENDU d'une page de
   poste ou de papier, hors de toute action — la sonde doit le taire aussi
   (revue hostile de la soirée). `fsli_analytique` : la revue analytique (0130). */
const TABLES = ['test_grid', 'test_cell', 'cell_disposition', 'test_line_conclusion', 'event_log', 'engine_run', 'ipe', 'ipe_rapport', 'review_note', 'section_visit', 'fsli_analytique'];

async function compter(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = Number((await q1<{ n: string }>(`select count(*)::text n from ${t}`)).n);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const avant = args.find((a) => a.startsWith('--avant='))?.slice(8);
  const apres = args.find((a) => a.startsWith('--apres='))?.slice(8);
  const compte = await compter();
  await (await getDb()).close();
  if (avant) {
    fs.writeFileSync(avant, JSON.stringify(compte, null, 2));
    console.log(`témoin : ${TABLES.map((t) => `${t}=${compte[t]}`).join(' ')} → ${avant}`);
    return;
  }
  if (apres) {
    const ref = JSON.parse(fs.readFileSync(apres, 'utf8')) as Record<string, number>;
    const diff = TABLES.filter((t) => ref[t] !== compte[t]).map((t) => `${t} ${ref[t]} → ${compte[t]}`);
    if (diff.length) { console.error(`témoin : LA SONDE A ÉCRIT — ${diff.join(' · ')}`); process.exit(1); }
    console.log(`témoin : aucune écriture (${TABLES.length} tables identiques)`);
    return;
  }
  console.log(JSON.stringify(compte));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
