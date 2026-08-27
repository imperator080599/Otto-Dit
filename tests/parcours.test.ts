// LE PARCOURS COMPLET — la définition de « fini ».
//
// Une mission entière, de la création du dossier à l'export scellé, exécutée
// par les MÊMES services que les écrans. Ce test ne vérifie pas des unités : il
// vérifie que l'ARC TOURNE, et il ne peut pas passer tant qu'une seule règle du
// dossier reste insatisfaite — la clôture demande LA liste des obstacles au
// visa (ADR-085).
//
// C'est le harnais qui rejoue DEMO_APP.md.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '../app/src/lib/test/setup';
import { q, q1, repoRoot } from '../app/src/lib/db/client';
import { importFec } from '../app/src/lib/services/imports';
import { computeTbGl } from '../app/src/lib/services/reconciliation';
import { IDS } from '../app/src/lib/seed';
import { runPart1UpToWorkpaper } from '../app/src/lib/flows/part1';
import { deroulerFin } from '../app/src/lib/flows/parcours';
import { draftRevenueWorkpaper } from '../app/src/lib/services/workpapers/draft';
import { signWorkpaper, addReviewNote, transitionNote } from '../app/src/lib/services/workpapers/lifecycle';
import { exportWorkpaper } from '../app/src/lib/services/workpapers/render';
import { obstaclesAuVisa, visaPossible } from '../app/src/lib/services/obstacles';
import { currentAcceptation } from '../app/src/lib/services/acceptance';
import { closeFile } from '../app/src/lib/services/retention';
import { sealFile } from '../app/src/lib/services/archive';

describe('la mission entière, de l’acceptation à l’export scellé', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 300000);

  it('le dossier commence par une DÉCISION, pas par un import', async () => {
    const a = await currentAcceptation(IDS.engNep);
    expect(a?.status).toBe('accepted');
    expect(a?.kind).toBe('maintien');
    expect(a?.decision_reason?.length).toBeGreaterThan(10);
  });

  it('les travaux se déroulent : import, rapprochement, seuils, périmètre, risque, sondage, boucle, papier', async () => {
    await runPart1UpToWorkpaper();
    const wpId = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    const noteId = await addReviewNote(
      IDS.engNep, wpId, IDS.users.lea, IDS.users.karim,
      'Préciser dans la conclusion le renvoi à l’état des anomalies.',
    );
    await transitionNote(noteId, IDS.users.karim, 'addressed');
    await transitionNote(noteId, IDS.users.lea, 'closed');
    await signWorkpaper(wpId, IDS.users.karim, 'preparer_validator');
    await signWorkpaper(wpId, IDS.users.lea, 'reviewer');
    await signWorkpaper(wpId, IDS.users.claire, 'partner');
    const pdf = await exportWorkpaper(wpId, IDS.users.claire, 'pdf');
    expect(pdf.sha256).toMatch(/^[0-9a-f]{64}$/);

    const wp = await q1<{ reference: string | null; status: string }>(
      `select reference, status from workpaper where id = $1`, [wpId]);
    // le papier porte la RÉFÉRENCE du plan de classement du cabinet
    expect(wp.reference).toMatch(/^[A-Z]-\d{2}$/);
    expect(wp.status).toBe('signed');
  }, 600000);

  it('à ce stade le dossier NE PEUT PAS être clos — et il dit pourquoi', async () => {
    /* C'est le point du branchement (point 11) : avant, seule la conclusion sur
       les anomalies était vérifiée, et un dossier sans lettre d'affirmation ni
       états financiers pointés produisait une archive complète d'un dossier
       incomplet. */
    expect(await visaPossible(IDS.engNep)).toBe(false);
    await expect(sealFile(IDS.engNep, IDS.users.claire, '2026-03-31')).rejects.toThrow();
    const obstacles = await obstaclesAuVisa(IDS.engNep);
    const familles = new Set(obstacles.map((o) => o.famille));
    expect(familles.has('questionnaire')).toBe(true);
    expect(familles.has('pointage') || familles.has('achevement')).toBe(true);
  }, 300000);

  it('la fin du parcours : reprise, questionnaire, pointage, achèvement', async () => {
    const { etapes, obstacles } = await deroulerFin(IDS.engNep);
    expect(etapes.map((e) => e.cle)).toEqual([
      'reponses', 'reprise', 'questionnaire', 'pointage', 'achevement', 'jalons',
      'boucle', 'obstacles',
    ]);
    /* Ce qui RESTE doit être l'évaluation seule : le grand livre est
       provisoire dans le jeu de démonstration, et c'est délibéré — un dossier
       qui se clôt sur un FEC provisoire serait le vrai défaut. */
    const familles = new Set(obstacles.map((o) => o.famille));
    expect(familles.has('questionnaire')).toBe(false);
    expect(familles.has('pointage')).toBe(false);
    expect(familles.has('achevement')).toBe(false);
    expect(familles.has('reprise')).toBe(false);
  }, 900000);

  it('le FEC provisoire bloque la clôture — c’est la règle, pas un accident', async () => {
    const obstacles = await obstaclesAuVisa(IDS.engNep);
    expect(obstacles.some((o) => o.famille === 'evaluation')).toBe(true);
    await expect(sealFile(IDS.engNep, IDS.users.claire, '2026-03-31')).rejects.toThrow();
  }, 300000);

  it('le FEC définitif levé, le dossier se CLÔT et l’archive est scellée', async () => {
    /* LE FEC DÉFINITIF ARRIVE — et il s'IMPORTE, il ne se décrète plus.
       Ce test posait le drapeau à false en SQL, en le disant honnêtement faute
       de second fichier. C'était quand même une clôture obtenue hors du
       produit : le dernier geste du métier n'était emprunté par personne. Le
       jeu de données porte désormais le fichier définitif — le même grand livre
       PLUS l'écriture de situation de 25 000 € que la balance contenait déjà —
       et c'est le RAPPROCHEMENT re-exécuté, propre cette fois, qui lève le
       drapeau (ADR-092). Le ré-import invalide l'aval en aval : il faut le
       confirmer, et c'est la règle ADR-016. */
    const definitif = fs.readFileSync(
      path.join(repoRoot(), 'dataset', 'definitif', '999888777FEC20251231.txt'));
    await importFec({
      engagementId: IDS.engNep, userId: IDS.users.karim,
      filename: '999888777FEC20251231.txt', bytes: definitif,
      confirmInvalidation: true,
    });
    await computeTbGl(IDS.engNep, IDS.users.karim);
    const apres = await q1<{ p: boolean }>(
      `select ledger_is_provisional p from engagement where id = $1`, [IDS.engNep]);
    expect(apres.p, 'le rapprochement propre doit lever le drapeau « provisoire »').toBe(false);

    const restants = await obstaclesAuVisa(IDS.engNep);
    if (restants.length > 0) {
      // Si quelque chose bloque encore, le test doit le DIRE, pas contourner.
      expect(restants.map((o) => `${o.famille}: ${o.libelle}`)).toEqual([]);
    }
    expect(await visaPossible(IDS.engNep)).toBe(true);

    const closed = await closeFile(IDS.engNep, IDS.users.claire, '2026-03-31');
    expect(closed.archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(closed.archive.fileCount).toBeGreaterThan(3);
    expect(closed.completionDue).toBe('2026-05-30');   // 60 jours, D. 821-186 III-IV

    const eng = await q1<{ status: string; locked_at: string | null }>(
      `select status, locked_at::text as locked_at from engagement where id = $1`, [IDS.engNep]);
    expect(eng.status).toBe('locked');
    expect(eng.locked_at).toBeTruthy();
  }, 900000);
});
