import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../src/lib/db/client';
import { loadEnvLocal, keyFingerprint } from '../../src/lib/core/env';
import { runLadder } from '../../src/lib/services/extraction/ladder';
import { getOcrAdapter } from '../../src/lib/services/extraction/adapters';
import { compareDoc, pct, score, emptyCounts, add, type Counts, type Comparison } from '../../src/lib/eval/metrics';

// LA PREMIÈRE MESURE HONNÊTE HORS CACHE (point 12, ADR-105) —
// `npm run eval:pieces-neuves`. Les pièces de dataset/pieces_neuves/ n'existent
// dans AUCUN cache d'extraction : ce que le modèle en lit est une vraie
// lecture, et la vérité champ par champ (verite.json, écrite par le
// générateur) permet le taux de champs corrects, la latence et le coût par
// document. Même chemin de code que l'application (runLadder).
//
// Le harnais REFUSE de tourner sans clé (rien ne se dépense par accident) et
// s'arrête au plafond (--budget, 2 $ par défaut : à ce volume c'est un
// détecteur de bogue, pas un budget — ADR-020).

interface Verite {
  filename: string; role: string;
  ligne: { piece: string; tiers: string | null; montantGl: string; dateGl: string };
  attendu: string;
  truth: Record<string, string>;
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const flag = (name: string, dflt: string) =>
    (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).split('=')[1];
  process.env.OTTO_OCR_ADAPTER = flag('adapter', 'anthropic');
  const budget = Number(flag('budget', '2'));
  const adapter = getOcrAdapter();
  if (adapter.name !== 'mock' && !process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY absent de app/.env.local — rien ne sera dépensé, rien ne sera mesuré. '
      + 'Ajoutez la clé (jamais dans un shell), puis relancez.');
    process.exit(1);
  }
  const dossier = path.join(repoRoot(), 'dataset', 'pieces_neuves');
  const veriteFichier = path.join(dossier, 'verite.json');
  if (!fs.existsSync(veriteFichier)) {
    console.error('dataset/pieces_neuves/verite.json absent — lancez `npm run pieces:neuves` (base semée) d\'abord.');
    process.exit(1);
  }
  const verites = JSON.parse(fs.readFileSync(veriteFichier, 'utf8')) as Verite[];
  console.log(`adaptateur : ${adapter.name} · clé : ${keyFingerprint()} · garde : $${budget.toFixed(2)} · ${verites.length} pièces`);

  interface Resultat {
    v: Verite; rung: string; latencyMs: number; costUsd: number;
    comparisons: Comparison[]; erreur: string | null;
  }
  const resultats: Resultat[] = [];
  let depense = 0;
  for (const v of verites) {
    if (depense >= budget) {
      console.error(`GARDE DE BUDGET à ${v.filename} après $${depense.toFixed(4)} — boucle ou tempête de relances à chercher.`);
      break;
    }
    const octets = new Uint8Array(fs.readFileSync(path.join(dossier, v.filename)));
    const t0 = Date.now();
    try {
      const res = await runLadder(octets, v.filename, adapter);
      depense += res.ai?.costUsd ?? 0;
      resultats.push({
        v, rung: res.rung, latencyMs: res.latencyMs, costUsd: res.ai?.costUsd ?? 0,
        comparisons: compareDoc(v.truth, res.fields).comparisons, erreur: null,
      });
    } catch (e) {
      resultats.push({
        v, rung: 'échec', latencyMs: Date.now() - t0, costUsd: 0,
        comparisons: compareDoc(v.truth, []).comparisons,
        erreur: e instanceof Error ? e.message.split('\n')[0] : String(e),
      });
    }
  }

  console.log('\n  fichier · rôle · échelon · latence · coût · champs corrects');
  for (const r of resultats) {
    const s = score(r.comparisons.reduce((c: Counts, x) => add(c, x.verdict), emptyCounts()));
    console.log(`  ${r.v.filename} · ${r.v.role} · ${r.rung} · ${r.latencyMs} ms · $${r.costUsd.toFixed(4)} · `
      + `${s.tp}/${s.tp + s.fp + s.fn}${r.erreur ? ` · ERREUR ${r.erreur.slice(0, 80)}` : ''}`);
    for (const c of r.comparisons.filter((x) => x.verdict === 'fp')) {
      console.log(`      FAUX ${c.field} : attendu « ${c.expected} », lu « ${c.got} »`);
    }
    for (const c of r.comparisons.filter((x) => x.verdict === 'fn')) {
      console.log(`      NON LU ${c.field} : attendu « ${c.expected} » — une abstention, pas une valeur fausse`);
    }
  }

  const tous = resultats.flatMap((r) => r.comparisons);
  const global = score(tous.reduce((c: Counts, x) => add(c, x.verdict), emptyCounts()));
  const modeles = resultats.filter((r) => r.costUsd > 0);
  const latences = modeles.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latences[Math.floor(latences.length / 2)] ?? 0;
  console.log('\n  ── MESURE (pièces jamais vues) ─────────────────');
  console.log(`  ${resultats.length} pièces · ${modeles.length} lues par le modèle · échecs ${resultats.filter((r) => r.erreur).length}`);
  console.log(`  précision ${pct(global.precision)} (${global.tp}/${global.tp + global.fp} valeurs rendues) · `
    + `rappel ${pct(global.recall)} (${global.tp}/${global.tp + global.fp + global.fn})`);
  console.log(`  coût total $${depense.toFixed(4)} · par document lu au modèle $${modeles.length ? (depense / modeles.length).toFixed(4) : '—'}`);
  console.log(`  latence p50 (modèle) ${p50} ms`);
  console.log('  (précision d\'abord : une valeur fausse coûte plus qu\'une valeur absente)');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
