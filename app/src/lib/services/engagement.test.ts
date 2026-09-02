import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { q, q01 } from '@/lib/db/client';
import {
  creerClient, creerExercice, creerMission, missionN1, preverifierMission, lireDateFr, EngagementRuleError,
} from './engagement';
import { missionPrecedente } from './carryforward';

// LA CRÉATION DE MISSION DEPUIS L'ÉCRAN (Groupe 1, item 1.1) : un client neuf
// toujours fictif, un exercice neuf qui se relie seul à son prédécesseur
// CONTIGU, la classe et le référentiel de seuil posés, et chaque refus nommé.
// Les cas mauvais viennent de la revue hostile n°4 : l'entité d'un autre
// cabinet, le 29 février, le trou de deux ans, l'exercice créé après coup, la
// mission SOX qui prenait la NEP pour N-1.

const CLAIRE = IDS.users.claire;
const mission = (c: string, p: string, kind: 'statutory_audit' | 'sox_component' = 'statutory_audit', extra: Record<string, unknown> = {}) =>
  creerMission({
    tenantId: IDS.tenant, entityId: c, periodId: p, kind, name: '',
    packs: [kind === 'sox_component' ? 'pcaob-sox' : 'nep-fr'], accountingMap: 'pcg', language: 'fr',
    actorUserId: CLAIRE, ...extra,
  });
const exercice = (c: string, endDate: string, more: Record<string, unknown> = {}) =>
  creerExercice({ tenantId: IDS.tenant, entityId: c, endDate, actorUserId: CLAIRE, ...more });

describe('création de mission (1.1)', () => {
  beforeAll(async () => { await initTestDb(); }, 120000);

  it('jj/mm/aaaa se lit, et rien d’autre — dans des années plausibles', () => {
    expect(lireDateFr('31/12/2026')).toBe('2026-12-31');
    expect(lireDateFr(' 1/2/2027 ')).toBe('2027-02-01');
    expect(lireDateFr('2026-12-31')).toBeNull();
    expect(lireDateFr('31/02/2026')).toBeNull();   // le 31 février n'existe pas
    expect(lireDateFr('31/12/1900')).toBeNull();   // quatre chiffres ne font pas une année
    expect(lireDateFr('')).toBeNull();
  });

  it('un client neuf est FICTIF par construction ; doublon (casse, accents, espaces), devise et pays sont refusés', async () => {
    const c = await creerClient({ tenantId: IDS.tenant, name: 'Client de nuit (fictif)', actorUserId: CLAIRE });
    const row = await q01<{ registry_type: string; registry_no: string | null; currency: string }>(
      `select registry_type, registry_no, currency from entity where id = $1`, [c.id]);
    expect(row).toMatchObject({ registry_type: 'fictional', registry_no: null, currency: 'EUR' });
    await expect(creerClient({ tenantId: IDS.tenant, name: 'client DE NUIT (fictif)', actorUserId: CLAIRE }))
      .rejects.toThrow(EngagementRuleError);
    await expect(creerClient({ tenantId: IDS.tenant, name: 'Client  de nuit (fictif)', actorUserId: CLAIRE }))
      .rejects.toThrow(/existe déjà/);
    await creerClient({ tenantId: IDS.tenant, name: 'Société Générale du Nuit (fictif)', actorUserId: CLAIRE });
    await expect(creerClient({ tenantId: IDS.tenant, name: 'Societe Generale du Nuit (fictif)', actorUserId: CLAIRE }))
      .rejects.toThrow(/existe déjà/);
    await expect(creerClient({ tenantId: IDS.tenant, name: 'X', actorUserId: CLAIRE }))
      .rejects.toThrow(/deux caractères/);
    await expect(creerClient({ tenantId: IDS.tenant, name: 'Devise SA (fictif)', currency: 'EURO', actorUserId: CLAIRE }))
      .rejects.toThrow(/devise/);
    await expect(creerClient({ tenantId: IDS.tenant, name: 'Pays SA (fictif)', country: 'FRA', actorUserId: CLAIRE }))
      .rejects.toThrow(/pays/);
  });

  it('un exercice neuf dure douze mois — même au 29 février — refuse le chevauchement, et se relie seul au précédent', async () => {
    const c = await creerClient({ tenantId: IDS.tenant, name: 'Exercices SA (fictif)', actorUserId: CLAIRE });
    const p1 = await exercice(c.id, '2026-12-31');
    const r1 = await q01<{ start_date: string; label: string; prior_period_id: string | null }>(
      `select start_date::text, label, prior_period_id from period where id = $1`, [p1.id]);
    expect(r1).toMatchObject({ start_date: '2026-01-01', label: 'FY2026', prior_period_id: null });
    await expect(exercice(c.id, '2027-06-30')).rejects.toThrow(/chevauche/);
    const p2 = await exercice(c.id, '2027-12-31');
    expect(p2.priorPeriodId).toBe(p1.id);
    await expect(exercice(c.id, '2028-12-31', { startDate: '2029-01-01' })).rejects.toThrow(/commence avant de finir/);

    const bis = await creerClient({ tenantId: IDS.tenant, name: 'Bissextile SA (fictif)', actorUserId: CLAIRE });
    const pb = await exercice(bis.id, '2028-02-29');
    const rb = await q01<{ start_date: string }>(`select start_date::text from period where id = $1`, [pb.id]);
    expect(rb?.start_date).toBe('2027-03-01');
  });

  it('un exercice sur l’entité d’un AUTRE cabinet, ou inconnue, est un refus nommé — jamais une page 500', async () => {
    const autre = await q01<{ id: string }>(
      `insert into tenant (name) values ('Autre cabinet (fictif)') returning id`);
    const etrangere = await q01<{ id: string }>(
      `insert into entity (tenant_id, name, country, registry_type, registry_no, currency)
       values ($1, 'Entité étrangère (fictive)', 'FR', 'fictional', null, 'EUR') returning id`, [autre!.id]);
    await expect(exercice(etrangere!.id, '2026-12-31')).rejects.toThrow(/isolation/);
    await expect(exercice('00000000-0000-0000-0000-000000000000', '2026-12-31')).rejects.toThrow(/entité inconnue/);
    await expect(exercice('pas-un-identifiant', '2026-12-31')).rejects.toThrow(/entité inconnue/);   // mal formé : refus nommé, pas une erreur uuid
    expect(await q01(`select 1 from period where entity_id = $1`, [etrangere!.id])).toBeNull();
  });

  it('la création d’exercice écrit un événement (règle 3)', async () => {
    const c = await creerClient({ tenantId: IDS.tenant, name: 'Journal SA (fictif)', actorUserId: CLAIRE });
    const p = await exercice(c.id, '2026-12-31');
    const ev = await q01<{ verb: string; payload: { label: string; start: string } }>(
      `select verb, payload from event_log where object_type = 'period' and object_id = $1`, [p.id]);
    expect(ev?.verb).toBe('period.created');
    expect(ev?.payload).toMatchObject({ label: 'FY2026', start: '2026-01-01' });
  });

  it('le chaînage n’enjambe pas un trou, et se pose sur le successeur créé après coup', async () => {
    const c = await creerClient({ tenantId: IDS.tenant, name: 'Trous SA (fictif)', actorUserId: CLAIRE });
    const p24 = await exercice(c.id, '2024-12-31');
    const p27 = await exercice(c.id, '2027-12-31');
    expect(p27.priorPeriodId).toBeNull();           // deux années absentes : pas une continuité
    const p23 = await exercice(c.id, '2023-12-31');
    expect(p23.priorPeriodId).toBeNull();
    const r24 = await q01<{ prior_period_id: string | null }>(
      `select prior_period_id from period where id = $1`, [p24.id]);
    expect(r24?.prior_period_id).toBe(p23.id);      // FY2024 a trouvé son prédécesseur après coup
  });

  it('la mission porte sa classe et sa préférence de seuil, et la N+1 voit la N-1 en en-tête', async () => {
    const c = await creerClient({ tenantId: IDS.tenant, name: 'Chaîne SAS (fictif)', actorUserId: CLAIRE });
    const p1 = await exercice(c.id, '2026-12-31');
    const m1 = await mission(c.id, p1.id, 'statutory_audit', { classe: 'eip', benchmarkPrefere: 'revenue' });
    const row = await q01<{ classe: string; framework_set: { materiality_benchmark?: string }; name: string }>(
      `select classe, framework_set, name from engagement where id = $1`, [m1.id]);
    expect(row?.classe).toBe('eip');
    expect(row?.framework_set.materiality_benchmark).toBe('revenue');
    expect(row?.name).toBe('Chaîne SAS (fictif) — FY2026');
    expect(await missionN1(m1.id)).toBeNull();

    const p2 = await exercice(c.id, '2027-12-31');
    const m2 = await mission(c.id, p2.id, 'statutory_audit', { name: 'Année 2' });
    const n1 = await missionN1(m2.id);
    expect(n1?.id).toBe(m1.id);
    expect(n1?.period_label).toBe('FY2026');
    /* La classe par défaut, et « auto » ne laisse aucune préférence. */
    const r2 = await q01<{ classe: string; framework_set: { materiality_benchmark?: string } }>(
      `select classe, framework_set from engagement where id = $1`, [m2.id]);
    expect(r2?.classe).toBe('autre');
    expect(r2?.framework_set.materiality_benchmark).toBeUndefined();
  });

  it('N-1 est de la MÊME NATURE — une seule définition, lue par l’en-tête et la reprise', async () => {
    const c = await creerClient({ tenantId: IDS.tenant, name: 'Deux natures SA (fictif)', actorUserId: CLAIRE });
    const p1 = await exercice(c.id, '2026-12-31');
    const p2 = await exercice(c.id, '2027-12-31');
    const nep1 = await mission(c.id, p1.id, 'statutory_audit');
    const sox1 = await mission(c.id, p1.id, 'sox_component');
    const sox2 = await mission(c.id, p2.id, 'sox_component');
    expect((await missionN1(sox2.id))?.id).toBe(sox1.id);
    expect((await missionPrecedente(sox2.id))?.id).toBe(sox1.id);
    const nep2 = await mission(c.id, p2.id, 'statutory_audit');
    expect((await missionN1(nep2.id))?.id).toBe(nep1.id);
    /* Une nature sans prédécesseur : ni l'en-tête ni la reprise n'inventent. */
    const integ = await creerMission({
      tenantId: IDS.tenant, entityId: c.id, periodId: p2.id, kind: 'integrated', name: '',
      packs: ['nep-fr', 'pcaob-sox'], accountingMap: 'pcg', language: 'fr', actorUserId: CLAIRE,
    });
    expect(await missionN1(integ.id)).toBeNull();
    expect(await missionPrecedente(integ.id)).toBeNull();
    /* Et l'acceptation lit la même règle : une PREMIÈRE mission SOX d'une
       entité auditée en NEP l'an passé s'ouvre en acceptation, pas en
       maintien. */
    const { ouvrirAcceptation } = await import('./acceptance');
    const p3 = await exercice(c.id, '2028-12-31');
    const nep3 = await mission(c.id, p3.id, 'statutory_audit');          // FY2028 : NEP seule
    const p4 = await exercice(c.id, '2029-12-31');
    const sox4 = await mission(c.id, p4.id, 'sox_component');            // FY2029 : première SOX
    const nep4 = await mission(c.id, p4.id, 'statutory_audit');
    expect((await ouvrirAcceptation(sox4.id, CLAIRE)).kind).toBe('acceptation');
    expect((await ouvrirAcceptation(nep4.id, CLAIRE)).kind).toBe('maintien');
    expect((await missionN1(nep4.id))?.id).toBe(nep3.id);
  });

  it('une classe, un référentiel de seuil, une nature ou un pack inconnus sont refusés — jamais rangés en silence', async () => {
    const c = await creerClient({ tenantId: IDS.tenant, name: 'Refus SARL (fictif)', actorUserId: CLAIRE });
    const p = await exercice(c.id, '2026-12-31');
    const base = {
      tenantId: IDS.tenant, entityId: c.id, periodId: p.id, kind: 'statutory_audit' as const, name: '',
      packs: ['nep-fr'], accountingMap: 'pcg', language: 'fr' as const, actorUserId: CLAIRE,
    };
    await expect(creerMission({ ...base, classe: 'banque' as never })).rejects.toThrow(/classe de mission inconnue/);
    await expect(creerMission({ ...base, benchmarkPrefere: 'ebitda' as never })).rejects.toThrow(/référentiel de seuil inconnu/);
    await expect(creerMission({ ...base, kind: 'revue' as never })).rejects.toThrow(/nature de mission inconnue/);
    await expect(creerMission({ ...base, packs: ['ifrs-xx'] })).rejects.toThrow(/référentiel inconnu/);
    /* Et la pré-vérification de l'action, AVANT toute écriture. */
    await expect(preverifierMission({ tenantId: IDS.tenant, kind: 'revue', packs: ['nep-fr'], language: 'fr' }))
      .rejects.toThrow(/nature de mission inconnue/);
    await expect(preverifierMission({ tenantId: IDS.tenant, kind: 'statutory_audit', packs: ['nep-fr'], language: 'de' }))
      .rejects.toThrow(/langue inconnue/);
    const sansMethode = await q01<{ id: string }>(`insert into tenant (name) values ('Sans méthode (fictif)') returning id`);
    await expect(preverifierMission({ tenantId: sansMethode!.id, kind: 'statutory_audit', packs: ['nep-fr'], language: 'fr' }))
      .rejects.toThrow(/aucune méthode publiée/);
    expect((await q(`select 1 from entity where tenant_id = $1`, [sansMethode!.id])).length).toBe(0);
  });
});
