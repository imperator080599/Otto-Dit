// ACCEPTATION, MAINTIEN, JALONS (point 1) — le premier bout de l'arc.
//
// Ce fichier ne vérifie pas qu'un formulaire s'enregistre : il vérifie que la
// règle REFUSE. Aucun travail ne se planifie avant la décision — c'est ce qui
// distingue une tranche de produit d'un écran de saisie.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { chargerCatalogue, criteres } from '@/lib/methodology/catalogue';
import {
  ouvrirAcceptation, currentAcceptation, repondreCritere, manquePourDecider,
  decider, assertAccepte, assurerJalons, jalons, poserJalon, jalonsEnRetard,
  AcceptanceRuleError,
} from './acceptance';
import { assignMember } from './team';
import { assessFsli } from './risk';
import { creerMission } from './engagement';

/* Une mission NEUVE, non acceptée : elle existe pour être refusée. */
const NEUVE = '00000000-0000-4000-8000-0000000000e1';

async function creerMissionNeuve(): Promise<void> {
  const per = await q1<{ id: string }>(
    `select id from period where entity_id = $1 and prior_period_id is null limit 1`, [IDS.entity],
  );
  await q(
    `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id)
     values ($1, $2, $3, $4, 'statutory_audit', 'Mission non acceptée (fixture)',
       '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}', 'setup', $5)`,
    [NEUVE, IDS.tenant, IDS.entity, per.id, IDS.methodology],
  );
}

describe('l’acceptation commande, elle ne décore pas', () => {
  beforeAll(async () => {
    await initTestDb();
    await creerMissionNeuve();
  });

  /* ═══ 1. LA RÈGLE QUI REFUSE ═════════════════════════════════════════ */

  it('sans décision, AUCUN travail ne se planifie — affectation refusée', async () => {
    await expect(assignMember({
      engagementId: NEUVE, userId: IDS.users.karim, engRole: 'senior',
      canSign: false, enteredOn: null, actorUserId: IDS.users.claire,
    })).rejects.toThrow(/pas encore acceptée/);
  });

  it('mais l’ISOLATION passe AVANT : un refus qui égare est pire qu’un refus sec', async () => {
    /* Répondre « faites accepter la mission » à quelqu'un qui vise le dossier
       d'un AUTRE cabinet l'enverrait faire ce qu'il ne doit jamais faire — et
       lui apprendrait que la mission existe. Ordre corrigé après que la suite
       l'ait fait tomber (ADR-069, ADR-082). */
    const autreCabinet = '00000000-0000-4000-8000-0000000000e9';
    const autreUser = '00000000-0000-4000-8000-0000000000ea';
    await q(`insert into tenant (id, name, issuer_reports_2024) values ($1,'Cabinet tiers (fictif)',0)`, [autreCabinet]);
    await q(
      `insert into app_user (id, tenant_id, name, email, firm_role)
       values ($1,$2,'Inconnu','inconnu@tiers.example','staff')`, [autreUser, autreCabinet]);
    await expect(assignMember({
      engagementId: NEUVE, userId: autreUser, engRole: 'staff',
      canSign: false, enteredOn: null, actorUserId: IDS.users.claire,
    })).rejects.toThrow(/autre cabinet/);
  });

  it('… et évaluation du risque refusée aussi', async () => {
    await expect(assessFsli(NEUVE, 'REVENUE', IDS.users.karim)).rejects.toThrow(/pas encore acceptée/);
  });

  it('la mission SEMÉE est acceptée — sinon les refus ci-dessus ne prouveraient rien', async () => {
    /* Un garde qui refuse TOUT refuserait aussi les cas légitimes. */
    await expect(assertAccepte(IDS.engNep)).resolves.toBeUndefined();
    const a = await currentAcceptation(IDS.engNep);
    expect(a?.status).toBe('accepted');
    expect(a?.decision_reason?.length).toBeGreaterThan(10);
  });

  /* ═══ 2. LA NATURE SE DÉDUIT, ELLE NE SE DEMANDE PAS ═════════════════ */

  it('première année = acceptation, renouvellement = maintien', async () => {
    const neuve = await ouvrirAcceptation(NEUVE, IDS.users.claire);
    expect(neuve.kind).toBe('acceptation');   // période sans exercice précédent
    const semee = await currentAcceptation(IDS.engNep);
    expect(semee?.kind).toBe('maintien');     // FY2025 a un FY2024
  });

  it('les questions ne sont pas les mêmes selon la nature', async () => {
    const cat = await chargerCatalogue();
    const acc = criteres(cat, 'acceptation').map((c) => c.code);
    const mai = criteres(cat, 'maintien').map((c) => c.code);
    expect(acc).toContain('predecesseur');            // première année seulement
    expect(mai).not.toContain('predecesseur');
    expect(mai).toContain('difficultes_exercice_precedent');   // renouvellement seulement
    expect(acc).not.toContain('difficultes_exercice_precedent');
  });

  it('répondre à un critère hors portée est refusé', async () => {
    await expect(repondreCritere(NEUVE, IDS.users.claire, 'difficultes_exercice_precedent', 'non'))
      .rejects.toThrow(/inconnu pour une décision de acceptation/);
  });

  /* ═══ 3. CE QUI MANQUE POUR DÉCIDER ══════════════════════════════════ */

  it('décider avec des questions sans réponse est refusé, et le refus les NOMME', async () => {
    const manque = await manquePourDecider(NEUVE);
    expect(manque.length).toBeGreaterThan(0);
    expect(manque.every((m) => m.raison === 'sans réponse')).toBe(true);
    await expect(decider(NEUVE, IDS.users.claire, 'accepted', 'ok'))
      .rejects.toThrow(/décision impossible/);
  });

  it('une réponse DÉFAVORABLE sur un critère bloquant exige un motif écrit', async () => {
    const cat = await chargerCatalogue();
    for (const c of criteres(cat, 'acceptation')) {
      await repondreCritere(NEUVE, IDS.users.claire, c.code,
        c.reponse_defavorable === 'oui' ? 'non' : 'oui', '');
    }
    expect(await manquePourDecider(NEUVE)).toEqual([]);

    // On rend UNE réponse défavorable, sans précision : la décision se bloque.
    const bloquant = criteres(cat, 'acceptation').find((c) => c.bloquant)!;
    await repondreCritere(NEUVE, IDS.users.claire, bloquant.code, bloquant.reponse_defavorable, '');
    const manque = await manquePourDecider(NEUVE);
    expect(manque).toHaveLength(1);
    expect(manque[0].code).toBe(bloquant.code);
    expect(manque[0].raison).toMatch(/sans précision écrite/);

    // « Bloquant » n'est pas « interdit » : avec le motif, la décision passe.
    await repondreCritere(NEUVE, IDS.users.claire, bloquant.code, bloquant.reponse_defavorable,
      'Point relevé, traité par une revue indépendante du dossier avant signature.');
    expect(await manquePourDecider(NEUVE)).toEqual([]);
  });

  it('un critère NON bloquant défavorable n’empêche pas de décider', async () => {
    const cat = await chargerCatalogue();
    const souple = criteres(cat, 'acceptation').find((c) => !c.bloquant)!;
    await repondreCritere(NEUVE, IDS.users.claire, souple.code, souple.reponse_defavorable, '');
    expect(await manquePourDecider(NEUVE)).toEqual([]);
  });

  it('décider SANS MOTIF est refusé — accepter comme refuser', async () => {
    await expect(decider(NEUVE, IDS.users.claire, 'accepted', '   '))
      .rejects.toThrow(/se motive par écrit/);
    await expect(decider(NEUVE, IDS.users.claire, 'declined', ''))
      .rejects.toThrow(/se motive par écrit/);
  });

  it('la base refuse aussi, pas seulement le service', async () => {
    /* Une règle qui ne tient qu'à la couche de service ne tient pas (ADR-007). */
    await expect(q(
      `update engagement_acceptance set status = 'accepted' where engagement_id = $1`, [NEUVE],
    )).rejects.toThrow(/decision_needs_a_written_reason/);
  });

  /* ═══ 4. LA DÉCISION OUVRE LE DOSSIER ════════════════════════════════ */

  it('une fois acceptée, le travail se planifie', async () => {
    await decider(NEUVE, IDS.users.claire, 'accepted',
      'Client connu, équipe disponible, indépendance acquise ; point d’intégrité traité par revue indépendante.');
    await expect(assertAccepte(NEUVE)).resolves.toBeUndefined();
    // et la décision ne se réécrit pas
    await expect(decider(NEUVE, IDS.users.claire, 'declined', 'changement d’avis'))
      .rejects.toThrow(/déjà prise/);
    await expect(repondreCritere(NEUVE, IDS.users.claire, 'independance', 'non', 'x'))
      .rejects.toThrow(/déjà prise/);
  });

  it('une mission REFUSÉE bloque, et le refus dit le motif', async () => {
    const autre = '00000000-0000-4000-8000-0000000000e2';
    const per = await q1<{ id: string }>(
      `select id from period where entity_id = $1 and prior_period_id is null limit 1`, [IDS.entity]);
    await q(
      `insert into engagement (id, tenant_id, entity_id, period_id, kind, name, framework_set, status, methodology_id)
       values ($1,$2,$3,$4,'statutory_audit','Mission refusée (fixture)',
         '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}','setup',$5)`,
      [autre, IDS.tenant, IDS.entity, per.id, IDS.methodology]);
    const a = await ouvrirAcceptation(autre, IDS.users.claire);
    const cat = await chargerCatalogue();
    for (const c of criteres(cat, a.kind)) {
      await repondreCritere(autre, IDS.users.claire, c.code,
        c.reponse_defavorable === 'oui' ? 'non' : 'oui', '');
    }
    await decider(autre, IDS.users.claire, 'declined',
      'Honoraires incompatibles avec les diligences requises sur un premier exercice.');
    await expect(assertAccepte(autre)).rejects.toThrow(/a été REFUSÉE/);
    await expect(assertAccepte(autre)).rejects.toThrow(/Honoraires incompatibles/);
  });

  /* ═══ 5. LES JALONS ══════════════════════════════════════════════════ */

  it('le jalon d’assemblage se DÉRIVE et ne se saisit pas', async () => {
    await assurerJalons(NEUVE);
    await expect(poserJalon(NEUVE, IDS.users.claire, 'assemblage', '2026-12-31'))
      .rejects.toThrow(/se recalcule, il ne se saisit pas/);
  });

  it('poser la date de rapport RECALCULE le délai d’assemblage', async () => {
    await poserJalon(NEUVE, IDS.users.claire, 'date_rapport', '2026-04-30');
    const j = (await jalons(NEUVE)).find((x) => x.code === 'assemblage')!;
    // 60 jours (C. com. D. 821-186 III-IV) — la règle vient du noyau, pas d'ici
    expect(j.due_date).toBe('2026-06-29');
    expect(j.basis).toMatch(/60 jours/);
  });

  it('changer la date de rapport rebouge la dérivée — elle ne se fige pas', async () => {
    await poserJalon(NEUVE, IDS.users.claire, 'date_rapport', '2026-03-31');
    const j = (await jalons(NEUVE)).find((x) => x.code === 'assemblage')!;
    expect(j.due_date).toBe('2026-05-30');
  });

  it('les jalons échus et non faits sont une liste CALCULÉE', async () => {
    const retard = await jalonsEnRetard(NEUVE, '2026-05-01');
    expect(retard.map((j) => j.code)).toContain('date_rapport');
    expect(retard.map((j) => j.code)).not.toContain('assemblage');   // échéance postérieure
    expect(await jalonsEnRetard(NEUVE, '2020-01-01')).toEqual([]);
  });

  it('un jalon inconnu de la méthode est refusé', async () => {
    await expect(poserJalon(NEUVE, IDS.users.claire, 'reunion_de_lancement', '2026-01-05'))
      .rejects.toThrow(/inconnu de la méthode du cabinet/);
  });

  it('ouvrir deux fois ne crée pas deux décisions', async () => {
    const a = await ouvrirAcceptation(IDS.engNep, IDS.users.claire);
    const b = await ouvrirAcceptation(IDS.engNep, IDS.users.claire);
    expect(b.id).toBe(a.id);
    const n = await q1<{ n: string }>(
      `select count(*) n from engagement_acceptance where engagement_id = $1`, [IDS.engNep]);
    expect(Number(n.n)).toBe(1);
  });

  it('la décision laisse une trace au journal', async () => {
    const rows = await q<{ verb: string }>(
      `select verb from event_log where verb like 'acceptance.%' order by id`);
    const verbes = rows.map((r) => r.verb);
    expect(verbes).toContain('acceptance.opened');
    expect(verbes).toContain('acceptance.accepted');
    expect(verbes).toContain('acceptance.declined');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   LA CRÉATION DU DOSSIER — l'autre moitié du point 1.
   Un dossier se créait par le peuplement, donc jamais devant personne.
   ═══════════════════════════════════════════════════════════════════════ */

describe('créer un dossier', () => {
  beforeAll(async () => { await initTestDb(); });

  it('un dossier neuf naît avec la méthode EN VIGUEUR désignée', async () => {
    /* Sans elle il naîtrait déjà cassé : le premier chargement de catalogue le
       refuserait, et l'utilisateur ne saurait pas pourquoi. */
    const per = await q1<{ id: string }>(
      `select id from period where entity_id = $1 and prior_period_id is null limit 1`, [IDS.entity]);
    const row = await creerMission({
      tenantId: IDS.tenant, entityId: IDS.entity, periodId: per.id,
      kind: 'integrated', name: '', packs: ['nep-fr'], accountingMap: 'pcg',
      language: 'fr', actorUserId: IDS.users.claire,
    });
    const eng = await q1<{ methodology_id: string; status: string; name: string }>(
      `select methodology_id, status, name from engagement where id = $1`, [row.id]);
    expect(eng.methodology_id).toBe(IDS.methodology);
    expect(eng.status).toBe('setup');
    // sans nom donné, il en reçoit un lisible plutôt que d'être vide
    expect(eng.name.length).toBeGreaterThan(5);
    // et il n'est PAS accepté : c'est la première étape, pas un acquis
    await expect(assertAccepte(row.id)).rejects.toThrow(/pas encore acceptée/);
  });

  it('créer sur l’entité d’un AUTRE cabinet est refusé', async () => {
    const t2 = '00000000-0000-4000-8000-0000000000f1';
    const e2 = '00000000-0000-4000-8000-0000000000f2';
    await q(`insert into tenant (id, name, issuer_reports_2024) values ($1,'Cabinet quatre (fictif)',0)`, [t2]);
    await q(
      `insert into entity (id, tenant_id, name, country, registry_type, currency)
       values ($1,$2,'Cliente d''un autre (fictive)','FR','fictional','EUR')`, [e2, t2]);
    const per = await q1<{ id: string }>(`select id from period where entity_id = $1 limit 1`, [IDS.entity]);
    await expect(creerMission({
      tenantId: IDS.tenant, entityId: e2, periodId: per.id, kind: 'statutory_audit',
      name: 'x', packs: ['nep-fr'], accountingMap: 'pcg', language: 'fr', actorUserId: IDS.users.claire,
    })).rejects.toThrow(/isolation/);
  });

  it('un exercice qui n’est pas celui de l’entité est refusé', async () => {
    const t2 = '00000000-0000-4000-8000-0000000000f3';
    const e2 = '00000000-0000-4000-8000-0000000000f4';
    const p2 = '00000000-0000-4000-8000-0000000000f5';
    await q(`insert into tenant (id, name, issuer_reports_2024) values ($1,'Cabinet cinq (fictif)',0)`, [t2]);
    await q(
      `insert into entity (id, tenant_id, name, country, registry_type, currency)
       values ($1,$2,'Autre entité (fictive)','FR','fictional','EUR')`, [e2, t2]);
    await q(
      `insert into period (id, entity_id, label, start_date, end_date)
       values ($1,$2,'FY2025','2025-01-01','2025-12-31')`, [p2, e2]);
    await expect(creerMission({
      tenantId: IDS.tenant, entityId: IDS.entity, periodId: p2, kind: 'statutory_audit',
      name: 'x', packs: ['nep-fr'], accountingMap: 'pcg', language: 'fr', actorUserId: IDS.users.claire,
    })).rejects.toThrow(/pas celui de cette entité/);
  });

  it('deux dossiers de même nature sur le même exercice sont refusés', async () => {
    /* Ils feraient deux vérités sur les mêmes comptes. */
    const per = await q1<{ id: string }>(
      `select period_id as id from engagement where id = $1`, [IDS.engNep]);
    await expect(creerMission({
      tenantId: IDS.tenant, entityId: IDS.entity, periodId: per.id, kind: 'statutory_audit',
      name: 'doublon', packs: ['nep-fr'], accountingMap: 'pcg', language: 'fr', actorUserId: IDS.users.claire,
    })).rejects.toThrow(/existe déjà/);
  });

  it('une mission sans référentiel est refusée', async () => {
    const per = await q1<{ id: string }>(
      `select id from period where entity_id = $1 and prior_period_id is null limit 1`, [IDS.entity]);
    await expect(creerMission({
      tenantId: IDS.tenant, entityId: IDS.entity, periodId: per.id, kind: 'sox_component',
      name: 'sans pack', packs: [], accountingMap: 'pcg', language: 'fr', actorUserId: IDS.users.claire,
    })).rejects.toThrow(/sans référentiel/);
  });

  it('un cabinet SANS méthode publiée ne peut pas créer de dossier, et on lui dit pourquoi', async () => {
    const t3 = '00000000-0000-4000-8000-0000000000f6';
    const e3 = '00000000-0000-4000-8000-0000000000f7';
    const p3 = '00000000-0000-4000-8000-0000000000f8';
    await q(`insert into tenant (id, name, issuer_reports_2024) values ($1,'Cabinet sans méthode',0)`, [t3]);
    await q(
      `insert into entity (id, tenant_id, name, country, registry_type, currency)
       values ($1,$2,'Cliente (fictive)','FR','fictional','EUR')`, [e3, t3]);
    await q(
      `insert into period (id, entity_id, label, start_date, end_date)
       values ($1,$2,'FY2025','2025-01-01','2025-12-31')`, [p3, e3]);
    await expect(creerMission({
      tenantId: t3, entityId: e3, periodId: p3, kind: 'statutory_audit',
      name: 'x', packs: ['nep-fr'], accountingMap: 'pcg', language: 'fr', actorUserId: IDS.users.claire,
    })).rejects.toThrow(/chargez-la avant de créer un dossier/);
  });
});
