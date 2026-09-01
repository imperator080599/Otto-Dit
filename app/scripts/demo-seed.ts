import { closeDb, q1, q01 } from '../src/lib/db/client';
import { migrate } from '../src/lib/db/migrate';
import { seedBase, IDS } from '../src/lib/seed';
import { runPart1UpToWorkpaper } from '../src/lib/flows/part1';
import { draftRevenueWorkpaper } from '../src/lib/services/workpapers/draft';
import { addReviewNote, transitionNote, signWorkpaper } from '../src/lib/services/workpapers/lifecycle';
import { exportWorkpaper } from '../src/lib/services/workpapers/render';
import { runPart2 } from '../src/lib/flows/part2';
import { construireDossierN1 } from '../src/lib/flows/prior-year';
import { ensureReminders } from '../src/lib/services/requests';
import { warp, resetClock, DAY_MS } from '../src/lib/core/clock';
import { signWorkpaper as signOe } from '../src/lib/services/workpapers/lifecycle';

// npm run demo:seed — drives BOTH demo parts end-to-end through the real services, so a
// reviewer can open the app and inspect a finished engagement immediately. Every step is
// the same call the UI makes (no back doors).

export async function construireMondeDemo(stage: string = 'all') {
  await migrate();
  await seedBase();
  await resetClock();

  /* LE DOSSIER N-1, construit par les mêmes services que les clics. Il existe
     pour que la REPRISE ait quelque chose de réel à reprendre : on ne reprend
     pas des chiffres, on reprend des conclusions — un périmètre décidé, des
     facteurs statués, un questionnaire rempli (ADR-083). */
  await construireDossierN1();
  console.log('  dossier N-1 FY2024 construit (périmètre, risque, questionnaire)');

  if (stage === 'all' || stage === 'part1') {
    console.log('Part 1 — NEP revenue cycle…');
    await runPart1UpToWorkpaper();
    const wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, IDS.users.karim,
      'Préciser dans la conclusion le renvoi à l’état des anomalies (anomalie de cut-off non corrigée).',
    );
    await transitionNote(noteId, IDS.users.karim, 'addressed');
    /* ADR-028 (ADR-102) : jamais l'auteur — la note de Léa se clôt par Claire. */
    await transitionNote(noteId, IDS.users.claire, 'closed');

    /* L'INFORMATION PRODUITE PAR L'ENTITÉ, répondue AVANT le visa — c'est
       l'ordre réel : sans elle, le visa reste bloqué (obstacle « ipe »). Le
       fichier désigné est le grand livre IMPORTÉ, qui est bien un objet du
       dossier : l'échantillon en est tiré. */
    {
      const { enregistrerIpe, proposerRedaction } = await import('../src/lib/services/ipe');
      const fec = await q01<{ id: string; filename: string }>(
        `select id::text, filename from import_file
         where engagement_id = $1 and kind in ('fec','gl_generic') order by created_at desc limit 1`,
        [IDS.engNep]);
      if (!fec) throw new Error('demo: aucun grand livre importé — l’IPE n’aurait rien à désigner');
      const red = proposerRedaction({ nature: 'systeme', rapportCode: 'FEC-2025', nomFichier: fec.filename });
      await enregistrerIpe(wpId, {
        utilisee: true, nature: 'systeme', rapportCode: 'FEC-2025',
        importFileId: fec.id,
        exhaustivite: red.exhaustivite.replace(' [à revoir et à compléter par le préparateur avant visa]',
          ' Total et nombre de lignes rapprochés de la balance générale : concordants.'),
        exactitude: red.exactitude.replace(' [à revoir et à compléter par le préparateur avant visa]',
          ' Quatre lignes rapprochées des factures d’origine : concordantes.'),
        dateDocument: '2025-12-31', approprie: true, redigeParIa: true,
      }, IDS.users.karim);
    }

    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
    await signWorkpaper(wpId, IDS.users.claire, 'partner');
    const pdf = await exportWorkpaper(wpId, IDS.users.claire, 'pdf');
    await exportWorkpaper(wpId, IDS.users.claire, 'xlsx');
    console.log(`  REV-01 signed and exported (pdf sha256 ${pdf.sha256.slice(0, 16)}…)`);

    // Fieldwork spans weeks: advance the demo clock so the file shows a realistic
    // follow-up position — some requested items never arrived, the deadline has passed
    // and the reminder cadence has fired. This is the real reminder engine on the real
    // clock (docs/07 story 11), not a backdated row.
    /* LES SECTIONS DU DOSSIER — « My assignments » ne se démontre pas sur des
       listes vides. Karim répond du poste, Claire le DÉTIENT (on la lui a
       envoyée), et Léa suit le papier : les trois mécanismes sont distincts,
       et le monde le montre. */
    {
      const { assurerSections, attribuerA, envoyerA, suivre, visiter } =
        await import('../src/lib/services/sections');
      await assurerSections(IDS.engNep);
      const poste = await q01<{ id: string }>(
        `select id::text from section_state where engagement_id = $1 and kind = 'poste' limit 1`,
        [IDS.engNep]);
      const papier = await q01<{ id: string; ref: string }>(
        `select id::text, ref from section_state where engagement_id = $1 and kind = 'papier' limit 1`,
        [IDS.engNep]);
      /* Un dossier réel : l'associée RÉPOND du poste, le préparateur le
         DÉTIENT ; le papier appartient au préparateur et lui a été ENVOYÉ pour
         revue. Les quatre listes de l'associée sont alors remplies, et chacune
         par un mécanisme différent — c'est la démonstration de la remarque. */
      if (poste) {
        await attribuerA(poste.id, IDS.users.claire, IDS.users.claire);
        await envoyerA(poste.id, IDS.users.karim, IDS.users.claire);
      }
      if (papier) {
        await attribuerA(papier.id, IDS.users.karim, IDS.users.claire);
        await envoyerA(papier.id, IDS.users.claire, IDS.users.karim);
        await suivre(papier.id, IDS.users.claire, true);
        await visiter(IDS.engNep, 'papier', papier.ref, IDS.users.claire);
      }
    }

    await warp(25 * DAY_MS);
    await ensureReminders(IDS.engNep);
    console.log('  clock advanced 25 days — reminders sent; the revenue request is now overdue');
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

  /* UNE INVITATION DE RÉUNION SUR LE DOSSIER SOX (ADR-101) : le monde de
     démonstration montre l'objet fini — contact clé, copies dans l'ordre,
     .ics — et la route /api/reunion-ics/[iid] a un objet à servir. Le dossier
     NEP reste SANS contact clé : le parcours cliqué y éprouve le refus. */
  {
    const { declarerContactCle, choisirCreneau } = await import('../src/lib/services/reunions');
    await declarerContactCle(IDS.engSox, IDS.contacts.sophie, IDS.users.claire);
    await choisirCreneau({
      engagementId: IDS.engSox, userId: IDS.users.claire,
      debut: '2026-03-03T09:00:00Z', fin: '2026-03-03T10:00:00Z',
      objet: 'Kick-off des tests d\'efficacité — accès et documents',
      destinataireContactId: IDS.contacts.sophie,
    });
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
  await closeDb();
}

/* Exécuté en script (npm run demo:seed) : construit tout. Importé (script de
   déploiement, ADR-109) : n'exécute rien tout seul. */
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  construireMondeDemo(process.argv[2] ?? 'all').catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
