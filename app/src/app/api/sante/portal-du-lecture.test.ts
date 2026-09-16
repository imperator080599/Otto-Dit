import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q } from '@/lib/db/client';
import { demanderDetailDeCompte, approveSend, requestDetail } from '@/lib/services/requests';
import { GET } from './route';

// LOT 7, TRANCHE 1 (mandat REGISTRE_IDEES.md, H-1) — LA LECTURE « portail : "ce que vous me
// devez encore" cohérent avec les demandes ouvertes » DE /api/sante, cas connu mauvais (règle
// 17). `portalOutstandingItems` (portal.ts) elle-même est déjà couverte par deux cas connus
// mauvais en base (s3s4.test.ts) ; celle-ci prouve que /api/sante rougit RÉELLEMENT si la
// fonction régresse — un élément déjà réglé, ou dont la demande n'est plus ouverte, continue
// d'apparaître comme « encore dû ».

describe('portail « ce que vous me devez encore » : la lecture /api/sante', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
  }, 120000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucun élément encore dû : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('portail : « ce que vous me devez encore »'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucun élément');
  });

  it('une demande envoyée avec un élément pending : la lecture passe, non vide, cohérente', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'REVENUE', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    try {
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('portail : « ce que vous me devez encore »'));
      expect(lecture.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(lecture.detail).toMatch(/\d+ élément/);
    } finally {
      await q(`delete from request_item where request_id = $1`, [requestId]);
      await q(`delete from request where id = $1`, [requestId]);
    }
  });

  it('cas connu mauvais (règle 17) : un élément RÉGLÉ mais rendu quand même comme « encore dû » fait rougir /api/sante entier — régression, pas un état attendu', async () => {
    const requestId = await demanderDetailDeCompte(IDS.engNep, 'REVENUE', IDS.users.karim);
    await approveSend(requestId, IDS.users.karim);
    const detail = await requestDetail(requestId);
    const itemId = detail!.items[0].id;
    // l'élément est en réalité déjà réglé — l'état que la lecture doit attraper.
    await q(`update request_item set status = 'complete' where id = $1`, [itemId]);

    vi.resetModules();
    vi.doMock('@/lib/services/portal', async () => {
      const reel = await vi.importActual<typeof import('@/lib/services/portal')>('@/lib/services/portal');
      return {
        ...reel,
        // simule EXACTEMENT une régression de portalOutstandingItems : elle continue de
        // rendre l'élément malgré son état réel désormais 'complete'.
        portalOutstandingItems: async (entityId: string) => {
          const reelOutstanding = await reel.portalOutstandingItems(entityId);
          return [...reelOutstanding, {
            id: itemId, kind: 'document', description: 'sonde régression',
            request_id: requestId, seq_no: detail!.request.seq_no, request_title: detail!.request.title,
            due_date: null, engagement_name: 'sonde',
          }];
        },
      };
    });

    try {
      const { GET: GETAvecRegressionSimulee } = await import('./route');
      const rouge = await GETAvecRegressionSimulee();
      const bodyRouge = await rouge.json();
      const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('portail : « ce que vous me devez encore »'));
      expect(lectureRouge.ok).toBe(false);
      expect(lectureRouge.detail).toContain('complete');
      expect(rouge.status).toBe(500);
    } finally {
      await q(`delete from request_item where request_id = $1`, [requestId]);
      await q(`delete from request where id = $1`, [requestId]);
      vi.doUnmock('@/lib/services/portal');
      vi.resetModules();
    }
  });
});
