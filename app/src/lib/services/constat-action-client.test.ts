import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { constatEtPointAction } from './matching';
import { demanderDetailDeCompte, approveSend } from './requests';

// H-2, slice 1 (Lot 7 — docs/REGISTRE_IDEES.md ligne 270 : « le cycle de vie du constat
// vis-à-vis du client »). `constatEtPointAction` ne fait qu'AFFICHER, côte à côte, deux objets
// que le code tient déjà séparés — cette suite prouve que la JOINTURE elle-même est correcte et
// que les deux statuts (exception vs request_item) restent bien deux champs distincts, jamais
// fusionnés. Fixture auto-suffisante par insertion SQL directe (comme obstacles-demandes.test.ts
// pour ses cas connus mauvais) plutôt que le cycle complet runMatching/draftClarificationRequest
// (trop lourd pour ce qui est prouvé ici : la jointure, pas le moteur de rapprochement).

describe('constatEtPointAction (H-2 slice 1) : le constat et le point d’action client restent deux objets distincts', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  }, 120000);

  it('un constat OUVERT sans clarification envoyée n’apparaît pas ici (aucun request_item ne le porte encore)', async () => {
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'open', 'sonde H-2 : constat sans clarification') returning id::text`,
      [IDS.engNep],
    );
    try {
      const rows = await constatEtPointAction(IDS.engNep);
      expect(rows.find((r) => r.exception_id === exc.id)).toBeUndefined();
    } finally {
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });

  it('une clarification envoyée fait apparaître les DEUX objets, avec leurs DEUX statuts distincts', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'PURCHASES', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const exc = await q1<{ id: string }>(
      `insert into exception (engagement_id, taxonomy_code, status, description)
       values ($1, 'missing_document', 'clarification_requested', 'sonde H-2 : constat clarifié') returning id::text`,
      [IDS.engNep],
    );
    const item = await q1<{ id: string }>(
      `insert into request_item (request_id, kind, description, exception_id, status)
       values ($1, 'explanation', 'sonde H-2 : merci d’expliquer', $2, 'pending') returning id::text`,
      [requestId, exc.id],
    );
    try {
      const rows = await constatEtPointAction(IDS.engNep);
      const trouve = rows.find((r) => r.exception_id === exc.id);
      expect(trouve, 'la ligne doit apparaître dès qu’un request_item la porte').toBeDefined();
      expect(trouve?.item_id).toBe(item.id);
      expect(trouve?.exception_status, 'le constat reste au statut du DOSSIER').toBe('clarification_requested');
      expect(trouve?.item_status, 'le point d’action reste au statut du CLIENT — jamais fusionné').toBe('pending');
      // le client répond : SEUL le point d'action bouge, jamais le dossier (règle H-2 :
      // « le point d'action client ne remplace jamais l'exception d'audit »)
      await q(`update request_item set status = 'complete', client_note = 'Réponse du client.' where id = $1`, [item.id]);
      const apres = (await constatEtPointAction(IDS.engNep)).find((r) => r.exception_id === exc.id);
      expect(apres?.item_status).toBe('complete');
      expect(apres?.exception_status, 'le dossier ne se referme QUE par un humain (resolveException), jamais par la réponse client').toBe('clarification_requested');
    } finally {
      await q(`delete from request_item where id = $1`, [item.id]);
      await q(`delete from exception where id = $1`, [exc.id]);
    }
  });
});
