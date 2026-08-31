import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from './draft';
import { joindreAnnexe, annexesDuPapier } from './annexes';

// LES ANNEXES DU PAPIER (ADR-106). La table wp_attachment existait depuis la
// migration 0002 sans qu'aucun chemin ne l'atteigne — le test prouve les deux
// bouts du chemin neuf : joindre (avec empreinte, provenance et journal) et
// relire ; et le refus du fichier vide.

describe('annexes de papier de travail (ADR-106)', () => {
  let wid: string;

  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    wid = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
  }, 180000);

  it('un tableur se joint au papier, entre au moteur de pièces, et se relit', async () => {
    const octets = new TextEncoder().encode('gamme;base;taux\nA;120000;0,02\nB;80000;0,04\n');
    await joindreAnnexe(wid, {
      filename: 'calcul-provision-garantie.csv', mime: 'text/csv', bytes: octets,
    }, IDS.users.karim);

    const annexes = await annexesDuPapier(wid);
    expect(annexes).toHaveLength(1);
    expect(annexes[0].filename).toBe('calcul-provision-garantie.csv');
    expect(annexes[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(annexes[0].sizeBytes).toBe(octets.length);

    // la pièce porte sa provenance : déposée par l'auditeur, interne au dossier
    const ev = await q1<{ source: string; audience: string }>(
      `select source, audience from evidence where id = $1`, [annexes[0].evidenceId],
    );
    expect(ev.source).toBe('auditor');
    expect(ev.audience).toBe('internal');

    // et le geste est au journal
    const evt = await q<{ id: string }>(
      `select id from event_log where verb = 'workpaper_attachment_added' and object_id = $1`, [wid],
    );
    expect(evt.length).toBe(1);
  });

  it('un fichier vide est refusé — rien à joindre n\'est pas une annexe', async () => {
    await expect(joindreAnnexe(wid, { filename: 'vide.csv', mime: 'text/csv', bytes: new Uint8Array() }, IDS.users.karim))
      .rejects.toThrow(/vide/);
    expect(await annexesDuPapier(wid)).toHaveLength(1);
  });
});
