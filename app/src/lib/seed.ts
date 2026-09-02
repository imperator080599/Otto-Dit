import { q, q01 } from '@/lib/db/client';
import { publierMethodologie, contenuDuDepot, catalogueParId } from '@/lib/methodology/depot';
import { criteres } from '@/lib/methodology/catalogue';
import {
  ouvrirAcceptation, repondreCritere, decider, assurerJalons, poserJalon,
} from '@/lib/services/acceptance';
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
    // Hugo existe pour être REFUSÉ : membre du cabinet, aucune déclaration
    // signée, donc aucun travail ne peut lui être attribué. C'est la règle
    // d'indépendance rendue démontrable en un clic (0011, DEMO.md étape 6).
    hugo: demoId('user:hugo'),
  },
  entity: demoId('entity:altiverre'),
  group: demoId('group:meridian'),
  componentParent: demoId('component:meridian-parent'),
  componentAltiverre: demoId('component:altiverre'),
  periodFY2025: demoId('period:fy2025'),
  periodFY2024: demoId('period:fy2024'),
  // La méthode DU CABINET, chargée par lui. Le monde de démonstration part de
  // la méthode livrée avec le produit, mais il la charge comme un cabinet le
  // ferait — sans quoi rien ne prouverait que le chemin existe.
  methodology: demoId('methodology:vermeil-2026'),
  engNep: demoId('engagement:nep-fy2025'),
  /* LA MISSION N-1 (NEP FY2024) EXISTE DANS LE MONDE DE BASE — une ligne, son
     acceptation, rien d'autre ; le peuplement de démonstration la remplit.
     Sans elle, FY2025 s'ouvrait en « acceptation » : la règle de N-1 (même
     nature, missionN1) ne connaît pas un exercice sans mission. Altiverre
     est un renouvellement, donc la mission d'avant existe. L'identifiant est
     celui que le flux N-1 imposait déjà. */
  engNepN1: '00000000-0000-4000-8000-000000002024',
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
     ($3, $4, 'Léa Moreau', 'lea.moreau@vermeil-audit.example', 'manager'),
     ($5, $4, 'Hugo Vasseur', 'hugo.vasseur@vermeil-audit.example', 'staff')`,
    [IDS.users.claire, IDS.users.karim, IDS.users.lea, IDS.tenant, IDS.users.hugo],
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

  // Le cabinet CHARGE sa méthode, il ne la reçoit pas. Le paquet passe par le
  // validateur : un fichier invalide n'arriverait pas en base. Les deux
  // missions la DÉSIGNENT dès leur création — une mission sans méthodologie
  // désignée est refusée au chargement, jamais repliée en silence sur celle de
  // l'éditeur.
  await publierMethodologie({
    tenantId: IDS.tenant,
    label: 'Méthode Vermeil Audit — millésime 2026',
    contenu: await contenuDuDepot(),
    actorUserId: IDS.users.claire,
    id: IDS.methodology,
  });

  await q(
    `insert into engagement (id, tenant_id, entity_id, period_id, component_id, kind, name, framework_set, status, report_date, methodology_id)
     values ($1, $2, $3, $4, null, 'statutory_audit', 'Altiverre FY2024 — Audit légal (NEP)',
       '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}', 'fieldwork', '2025-03-31', $5)`,
    [IDS.engNepN1, IDS.tenant, IDS.entity, IDS.periodFY2024, IDS.methodology],
  );
  await q(
    `insert into engagement (id, tenant_id, entity_id, period_id, component_id, kind, name, framework_set, status, report_date, methodology_id)
     values ($1, $2, $3, $4, null, 'statutory_audit', 'Altiverre FY2025 — Audit légal (NEP)',
       '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}', 'fieldwork', '2026-03-31', $5)`,
    [IDS.engNep, IDS.tenant, IDS.entity, IDS.periodFY2025, IDS.methodology],
  );
  await q(
    `insert into engagement (id, tenant_id, entity_id, period_id, component_id, kind, name, framework_set, status, report_date, methodology_id)
     values ($1, $2, $3, $4, $5, 'sox_component', 'Altiverre FY2025 — SOX 404 component (PCAOB/COSO)',
       '{"assurance_packs":["pcaob-sox"],"accounting_map":"pcg","language":"en"}', 'fieldwork', '2026-02-20', $6)`,
    [IDS.engSox, IDS.tenant, IDS.entity, IDS.periodFY2025, IDS.componentAltiverre, IDS.methodology],
  );

  /* LA MISSION EST ACCEPTÉE AVANT QUE QUOI QUE CE SOIT NE SE PLANIFIE.
     Ce n'est pas une commodité de peuplement : c'est la règle du service, et
     le monde de démonstration doit être un dossier tel qu'il DOIT être, pas
     tel qu'il serait si la règle n'existait pas. Les réponses sont celles d'un
     dossier sans difficulté — le refus se démontre ailleurs, sur une mission
     faite pour ça (DEMO_APP.md). */
  /* N-1 D'ABORD : c'est son existence, acceptée, qui fait de FY2025 un
     « maintien » — l'ordre est la règle, pas un détail de peuplement. */
  for (const engId of [IDS.engNepN1, IDS.engNep, IDS.engSox]) {
    const acc = await ouvrirAcceptation(engId, IDS.users.claire);
    for (const c of criteres(await catalogueParId(IDS.methodology), acc.kind)) {
      await repondreCritere(
        engId, IDS.users.claire, c.code,
        c.reponse_defavorable === 'oui' ? 'non' : 'oui',
        '',
      );
    }
    await decider(
      engId, IDS.users.claire, 'accepted',
      'Aucun critère défavorable ; compétences et disponibilité vérifiées ; indépendance acquise.',
    );
    await assurerJalons(engId);
    await poserJalon(engId, IDS.users.claire, 'lettre_mission', '2025-10-20');
    await poserJalon(engId, IDS.users.claire, 'intervention_interimaire', '2025-11-24');
    await poserJalon(engId, IDS.users.claire, 'inventaire', '2025-12-31');
    await poserJalon(engId, IDS.users.claire, 'intervention_finale', '2026-02-09');
    await poserJalon(engId, IDS.users.claire,
      'date_rapport', engId === IDS.engNep ? '2026-03-31' : '2026-02-20');
  }

  // L'équipe, et sa déclaration d'indépendance SIGNÉE — sans quoi la mission
  // démarrerait en état d'obstacle au visa (0011). Une affectation sans
  // déclaration signée n'est pas un état de départ : c'est un défaut, et la
  // règle du service la refuserait aujourd'hui. On sème donc le dossier tel
  // qu'il doit être, pas tel qu'il serait si la règle n'existait pas.
  const equipe: [string, string][] = [
    [IDS.users.claire, 'partner'],
    [IDS.users.karim, 'senior'],
    [IDS.users.lea, 'manager'],
  ];
  const rubriques = (await catalogueParId(IDS.methodology)).independance.rubriques;
  const reponses = JSON.stringify(
    Object.fromEntries(rubriques.map((r) => [r.code, { answer: 'non', detail: '' }])),
  );
  for (const engId of [IDS.engNep, IDS.engSox]) {
    for (const [uid, role] of equipe) {
      await q(
        `insert into engagement_member (engagement_id, user_id, eng_role, can_sign, entered_on)
         values ($1, $2, $3, $4, date '2025-11-03')`,
        [engId, uid, role, role !== 'senior'],
      );
      await q(
        `insert into independence_declaration
           (tenant_id, engagement_id, user_id, version, answers, signed_at, signed_by)
         values ($1, $2, $3, 1, $4::jsonb, timestamptz '2025-11-03 09:00Z', $3)`,
        [IDS.tenant, engId, uid, reponses],
      );
    }
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
