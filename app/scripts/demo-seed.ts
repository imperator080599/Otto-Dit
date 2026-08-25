import { getDb, q1 } from '../src/lib/db/client';
import { migrate } from '../src/lib/db/migrate';
import { seedBase, IDS } from '../src/lib/seed';
import { runPart1UpToWorkpaper } from '../src/lib/flows/part1';
import { draftRevenueWorkpaper } from '../src/lib/services/workpapers/draft';
import { addReviewNote, transitionNote, signWorkpaper } from '../src/lib/services/workpapers/lifecycle';
import { exportWorkpaper } from '../src/lib/services/workpapers/render';
import { runPart2 } from '../src/lib/flows/part2';
import { signWorkpaper as signOe } from '../src/lib/services/workpapers/lifecycle';

// npm run demo:seed — drives BOTH demo parts end-to-end through the real services, so a
// reviewer can open the app and inspect a finished engagement immediately. Every step is
// the same call the UI makes (no back doors).

async function main() {
  const stage = process.argv[2] ?? 'all';
  await migrate();
  await seedBase();

  if (stage === 'all' || stage === 'part1') {
    console.log('Part 1 — NEP revenue cycle…');
    await runPart1UpToWorkpaper();
    const wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, IDS.users.karim,
      'Préciser dans la conclusion le renvoi à l’état des anomalies (anomalie de cut-off non corrigée).',
    );
    await transitionNote(noteId, IDS.users.karim, 'addressed');
    await transitionNote(noteId, IDS.users.lea, 'closed');
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
    await signWorkpaper(wpId, IDS.users.claire, 'partner');
    const pdf = await exportWorkpaper(wpId, IDS.users.claire, 'pdf');
    await exportWorkpaper(wpId, IDS.users.claire, 'xlsx');
    console.log(`  REV-01 signed and exported (pdf sha256 ${pdf.sha256.slice(0, 16)}…)`);
  }

  if (stage === 'all' || stage === 'part2') {
    console.log('Part 2 — SOX 404 component OE testing…');
    const res = await runPart2();
    for (const part of [res.bankRec, res.approvals]) {
      await signOe(part.workpaperId, IDS.users.karim, 'preparer_validator');
      await signOe(part.workpaperId, IDS.users.lea, 'reviewer');
      await signOe(part.workpaperId, IDS.users.claire, 'partner');
      await exportWorkpaper(part.workpaperId, IDS.users.claire, 'pdf');
    }
    console.log(`  C-BR-01: ${res.bankRec.deviations} deviation(s); C-REV-01: ${res.approvals.deviations} deviation(s) — OE workpapers signed and exported`);
  }

  const counts = await q1<{ exceptions: string; deviations: string; workpapers: string; events: string }>(
    `select (select count(*) from exception) exceptions,
            (select count(*) from deviation) deviations,
            (select count(*) from workpaper) workpapers,
            (select count(*) from event_log) events`,
    [],
  );
  console.log(
    `demo state ready — ${counts.exceptions} exceptions, ${counts.deviations} deviations, ` +
    `${counts.workpapers} workpapers, ${counts.events} events. Run "npm run dev" and sign in as any user.`,
  );
  const db = await getDb();
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
