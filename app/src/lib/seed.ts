import { q, q01 } from '@/lib/db/client';
import { demoId } from '@/lib/core/ids';
import { logEvent } from '@/lib/core/events';

// Base demo world (docs/07 §6 cast — all fictional, synthetic-only rule).
// Idempotent: skips if the tenant already exists. Deterministic IDs via demoId().

export const IDS = {
  tenant: demoId('tenant:vermeil'),
  users: {
    claire: demoId('user:claire'),
    karim: demoId('user:karim'),
    lea: demoId('user:lea'),
  },
  entity: demoId('entity:altiverre'),
  group: demoId('group:meridian'),
  componentParent: demoId('component:meridian-parent'),
  componentAltiverre: demoId('component:altiverre'),
  periodFY2025: demoId('period:fy2025'),
  periodFY2024: demoId('period:fy2024'),
  engNep: demoId('engagement:nep-fy2025'),
  engSox: demoId('engagement:sox-fy2025'),
  contacts: {
    sophie: demoId('contact:sophie'),
    theo: demoId('contact:theo'),
  },
} as const;

export const PORTAL_TOKENS = {
  sophie: 'demo-sophie-altiverre',
  theo: 'demo-theo-altiverre',
} as const;

export async function seedBase(): Promise<void> {
  const exists = await q01(`select id from tenant where id = $1`, [IDS.tenant]);
  if (exists) return;

  // issuer_reports_2024 drives the AS 1215.15 phase-in test (ADR-014 rev. 2): a small
  // French firm doing referred component work is well under the 100-report threshold,
  // so the 14-day window only reaches it for fiscal years beginning on/after 2025-12-15.
  await q(`insert into tenant (id, name, issuer_reports_2024) values ($1, $2, 0)`, [IDS.tenant, 'Vermeil Audit (cabinet fictif)']);

  await q(
    `insert into app_user (id, tenant_id, name, email, firm_role) values
     ($1, $4, 'Claire Fontaine', 'claire.fontaine@vermeil-audit.example', 'partner'),
     ($2, $4, 'Karim Benali', 'karim.benali@vermeil-audit.example', 'senior'),
     ($3, $4, 'Léa Moreau', 'lea.moreau@vermeil-audit.example', 'manager')`,
    [IDS.users.claire, IDS.users.karim, IDS.users.lea, IDS.tenant],
  );

  await q(
    `insert into entity (id, tenant_id, name, country, registry_type, registry_no, currency)
     values ($1, $2, 'Altiverre SAS', 'FR', 'fictional', '999888777', 'EUR')`,
    [IDS.entity, IDS.tenant],
  );

  await q(`insert into corp_group (id, tenant_id, name, listing) values ($1, $2, 'Meridian Industrial Group, Inc. (fictional)', 'US-listed (fictional ticker MRSI)')`, [IDS.group, IDS.tenant]);
  await q(
    `insert into component (id, corp_group_id, entity_id, role, significance)
     values ($1, $2, $3, 'component', 'significant component (revenue share)')`,
    [IDS.componentAltiverre, IDS.group, IDS.entity],
  );
  await q(
    `insert into referral_instruction (component_id, title, body, issued_by, received_at)
     values ($1, 'Group audit instructions FY2025 — referred SOX work',
       'Perform operating-effectiveness testing of key controls over revenue and treasury at Altiverre SAS per the group RCM extract. Report deviations and proposed deficiency classifications to the group team by 2026-02-15. Materiality allocated to component: see group instructions annex (fictional).',
       'Group auditor of Meridian Industrial Group (fictional)', '2025-10-15')`,
    [IDS.componentAltiverre],
  );

  await q(
    `insert into period (id, entity_id, label, start_date, end_date) values
     ($1, $2, 'FY2024', '2024-01-01', '2024-12-31')`,
    [IDS.periodFY2024, IDS.entity],
  );
  await q(
    `insert into period (id, entity_id, label, start_date, end_date, prior_period_id) values
     ($1, $2, 'FY2025', '2025-01-01', '2025-12-31', $3)`,
    [IDS.periodFY2025, IDS.entity, IDS.periodFY2024],
  );

  await q(
    `insert into engagement (id, tenant_id, entity_id, period_id, component_id, kind, name, framework_set, status, report_date)
     values ($1, $2, $3, $4, null, 'statutory_audit', 'Altiverre FY2025 — Audit légal (NEP)',
       '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}', 'fieldwork', '2026-03-31')`,
    [IDS.engNep, IDS.tenant, IDS.entity, IDS.periodFY2025],
  );
  await q(
    `insert into engagement (id, tenant_id, entity_id, period_id, component_id, kind, name, framework_set, status, report_date)
     values ($1, $2, $3, $4, $5, 'sox_component', 'Altiverre FY2025 — SOX 404 component (PCAOB/COSO)',
       '{"assurance_packs":["pcaob-sox"],"accounting_map":"pcg","language":"en"}', 'fieldwork', '2026-02-20')`,
    [IDS.engSox, IDS.tenant, IDS.entity, IDS.periodFY2025, IDS.componentAltiverre],
  );

  for (const engId of [IDS.engNep, IDS.engSox]) {
    await q(
      `insert into engagement_member (engagement_id, user_id, eng_role, can_sign) values
       ($1, $2, 'partner', true), ($1, $3, 'senior', false), ($1, $4, 'manager', true)`,
      [engId, IDS.users.claire, IDS.users.karim, IDS.users.lea],
    );
  }

  await q(
    `insert into client_contact (id, entity_id, name, email, title, portal_token) values
     ($1, $3, 'Sophie Marchand', 'sophie.marchand@altiverre.example', 'Directrice financière', $4),
     ($2, $3, 'Théo Girard', 'theo.girard@altiverre.example', 'Chef comptable', $5)`,
    [IDS.contacts.sophie, IDS.contacts.theo, IDS.entity, PORTAL_TOKENS.sophie, PORTAL_TOKENS.theo],
  );

  await q(
    `insert into itgc_area (code, name) values
     ('access', 'Access to programs and data'),
     ('change', 'Program changes and development'),
     ('operations', 'Computer operations')`,
  );

  for (const engId of [IDS.engNep, IDS.engSox]) {
    await logEvent({
      tenantId: IDS.tenant,
      engagementId: engId,
      actorKind: 'system',
      verb: 'engagement_created',
      objectType: 'engagement',
      objectId: engId,
      payload: { seeded: true },
    });
  }
}
