import { closeDb } from '../src/lib/db/client';
import { migrate } from '../src/lib/db/migrate';
import { enrichirMondeDemo } from '../src/lib/flows/enrichir';

// npm run demo:enrichir — enrichit le monde de démonstration SANS le remplacer
// (mandat de nuit n°2, 1.1). Rejouable : chaque étape n'ajoute que ce qui
// manque. Joué au déploiement par scripts/deploy/reconstruire.ts.

async function main() {
  /* Les migrations nouvelles s'appliquent d'abord : l'enrichissement écrit dans des tables que le monde de base n'avait peut-être pas. */
  await migrate();
  const r = await enrichirMondeDemo();
  for (const e of r.etapes) console.log(`  ${e.fait ? 'ok  ' : 'NON '} ${e.nom} — ${e.detail}`);
  const manques = r.etapes.filter((e) => !e.fait);
  console.log(`\nmonde enrichi : ${r.etapes.length - manques.length}/${r.etapes.length} étape(s) tenue(s)`);
  await closeDb();
  if (manques.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  await closeDb().catch(() => undefined);
  process.exit(1);
});
