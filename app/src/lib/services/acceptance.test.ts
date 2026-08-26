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
