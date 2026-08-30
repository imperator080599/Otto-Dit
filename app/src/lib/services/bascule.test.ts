import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { missionsParClient, basculer } from './bascule';

// LA BASCULE SE PROUVE EN TENTANT LA FUITE (modèle team.test.ts) : un second
// cabinet est semé, et on ESSAIE de basculer vers sa mission — dans les deux
// sens de refus (autre cabinet, puis non-affecté du même cabinet).

const AUTRE = {
  tenant: 'aaaa1111-0000-4000-8000-000000000001',
  user: 'aaaa1111-0000-4000-8000-000000000002',
  entity: 'aaaa1111-0000-4000-8000-000000000003',
  period: 'aaaa1111-0000-4000-8000-000000000004',
  eng: 'aaaa1111-0000-4000-8000-000000000005',
};

describe('bascule entre missions d\'un groupe', () => {
  beforeAll(async () => {
    await initTestDb();
    await q(`insert into tenant (id, name, issuer_reports_2024) values ($1, 'Cabinet Lambert (fictif)', 0)`, [AUTRE.tenant]);
    await q(
      `insert into app_user (id, tenant_id, name, email, firm_role)
       values ($1, $2, 'Paul Lambert', 'paul@lambert.example', 'partner')`,
      [AUTRE.user, AUTRE.tenant],
    );
    await q(
      `insert into entity (id, tenant_id, name, country, registry_type, registry_no, currency)
       values ($1, $2, 'Société Rivale SAS', 'FR', 'fictional', '111222333', 'EUR')`,
      [AUTRE.entity, AUTRE.tenant],
    );
    await q(
      `insert into period (id, entity_id, label, start_date, end_date)
       values ($1, $2, 'FY2025', '2025-01-01', '2025-12-31')`,
      [AUTRE.period, AUTRE.entity],
    );
    await q(
      `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status)
       values ($1, $2, $3, $4, 'statutory_audit', 'Rivale FY2025',
         '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}', 'fieldwork')`,
      [AUTRE.eng, AUTRE.tenant, AUTRE.entity, AUTRE.period],
    );
    await q(
      `insert into engagement_member (engagement_id, user_id, eng_role, can_sign) values ($1, $2, 'partner', true)`,
      [AUTRE.eng, AUTRE.user],
    );
  }, 120000);

  it('les missions se groupent client → entité → mission ; le groupe EST le client', async () => {
    const clients = await missionsParClient(IDS.users.claire);
    /* Altiverre appartient au groupe Meridian (component) : le client affiché
       est le GROUPE, et ses deux mandats (NEP + SOX) pendent sous l'entité. */
    const meridian = clients.find((c) => /Meridian/.test(c.client));
    expect(meridian).toBeTruthy();
    const altiverre = meridian!.entites.find((e) => /Altiverre/.test(e.entity_name));
    expect(altiverre).toBeTruthy();
    expect(altiverre!.missions.length).toBeGreaterThanOrEqual(2);
    /* Et rien d'un autre cabinet n'y figure. */
    expect(clients.some((c) => /Rivale/.test(c.client))).toBe(false);
  });

  it('basculer vers sa propre mission est journalisé, avec la provenance', async () => {
    const vers = await basculer(IDS.users.claire, IDS.engSox, IDS.engNep);
    expect(vers).toBe(IDS.engSox);
    const ev = await q<{ payload: { depuis: string | null }; actor_id: string }>(
      `select payload, actor_id from event_log
       where verb = 'engagement.switched' and engagement_id = $1 order by id desc limit 1`,
      [IDS.engSox],
    );
    expect(ev[0].actor_id).toBe(IDS.users.claire);
    expect(ev[0].payload.depuis).toBe(IDS.engNep);
  });

  it('TENTER la mission d\'un autre cabinet : refus d\'isolation, et rien au journal', async () => {
    await expect(basculer(IDS.users.claire, AUTRE.eng, IDS.engNep))
      .rejects.toThrow(/isolation.*autre cabinet.*refusée/);
    const ev = await q<{ id: string }>(
      `select id from event_log where verb = 'engagement.switched' and engagement_id = $1`,
      [AUTRE.eng],
    );
    expect(ev).toHaveLength(0);
    /* Et dans l'autre sens : Lambert ne bascule pas chez Vermeil. */
    await expect(basculer(AUTRE.user, IDS.engNep, null))
      .rejects.toThrow(/isolation.*refusée/);
  });

  it('même cabinet mais non affecté : refus d\'affectation (Hugo, sans déclaration signée)', async () => {
    await expect(basculer(IDS.users.hugo, IDS.engNep, null))
      .rejects.toThrow(/pas affecté/);
  });

  it('une mission inexistante est dite inexistante — pas un conflit de base', async () => {
    await expect(basculer(IDS.users.claire, 'aaaa1111-0000-4000-8000-00000000dead', null))
      .rejects.toThrow(/n'existe pas/);
  });
});
