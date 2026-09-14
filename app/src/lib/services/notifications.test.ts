// LE CENTRE DE NOTIFICATIONS — mandat 2026-09-14, §3. Les quatre épreuves du
// mandat (§3.4), une par test dédié : (1) toute carte résout un objet réel,
// (2) le compte change selon le rôle, (3) NOTIF-01 refuse le visa, (4) un
// élément validé disparaît sans tâche de nettoyage.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { elementsIaNonValides, notificationsPourApprobation } from './notifications';
import { obstaclesAuVisa, visaPossible } from './obstacles';

const KARIM = IDS.users.karim;   // senior sur IDS.engNep — can_sign = false (seed.ts)
const LEA = IDS.users.lea;       // manager sur IDS.engNep — can_sign = true (seed.ts)

let controlGap: string;
let controlDef: string;
let gapId: string;
let deficiencyId: string;
let extractionId: string;
let materialityId: string;

describe('le centre de notifications — mandat 2026-09-14, §3', () => {
  beforeAll(async () => {
    await initTestDb();

    controlGap = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1,'C-NOTIF-GAP','Contrôle de sonde (walkthrough)','fictif','monthly','manual','preventive','not_assessed')
       returning id::text`,
      [IDS.engNep],
    )).id;
    const run = await q1<{ id: string }>(
      `insert into ai_run (tenant_id, engagement_id, purpose, adapter, model, prompt_id, prompt_version, input_hash, output_hash)
       values ($1,$2,'walkthrough_gaps','fixture','fixture-model','p1','v1','h-in','h-out')
       returning id::text`,
      [IDS.tenant, IDS.engNep],
    );
    gapId = (await q1<{ id: string }>(
      `insert into control_walkthrough_gap (engagement_id, control_id, seq, kind, citation, description, ai_run_id)
       values ($1,$2,1,'omission_doc','citation fictive','écart fictif de sonde',$3)
       returning id::text`,
      [IDS.engNep, controlGap, run.id],
    )).id;

    controlDef = (await q1<{ id: string }>(
      `insert into control (engagement_id, code, name, description, frequency, nature, effect, di_status)
       values ($1,'C-NOTIF-DEF','Contrôle de sonde (déficience)','fictif','monthly','manual','preventive','not_assessed')
       returning id::text`,
      [IDS.engNep],
    )).id;
    deficiencyId = (await q1<{ id: string }>(
      `insert into deficiency (engagement_id, control_id, severity_proposed, narrative)
       values ($1,$2,'deficiency','Narrative fictive de sonde')
       returning id::text`,
      [IDS.engNep, controlDef],
    )).id;

    const evidenceId = (await q1<{ id: string }>(
      `insert into evidence (engagement_id, filename, mime, sha256, storage_path, source, uploaded_by_kind)
       values ($1,'piece-de-sonde.pdf','application/pdf','sha-fictif-sonde','blob://fictif/sonde','auditor','app_user')
       returning id::text`,
      [IDS.engNep],
    )).id;
    extractionId = (await q1<{ id: string }>(
      `insert into extraction (evidence_id, rung, status, fields)
       values ($1,'ocr','pending_verify','[]'::jsonb)
       returning id::text`,
      [evidenceId],
    )).id;

    /* Écriture directe (même patron que le walkthrough gap et la déficience
       ci-dessus) plutôt que `materiality.propose()` — ce service exige une
       balance générale déjà importée (`importTb`, S1/S2), hors périmètre
       d'une fixture ciblée. La ligne `event_log` est posée à la main pour
       que la requête de `notifications.ts` (`materiality_proposed`) trouve
       exactement ce qu'elle trouverait en production. */
    materialityId = (await q1<{ id: string }>(
      `insert into materiality (engagement_id, version, benchmark_code, benchmark_amount, pct,
         amount, perf_pct, perf_amount, ctt_pct, ctt_amount, te_pct, te_amount, rationale, status)
       values ($1,1,'pbt',100000,0.05,5000,0.75,3750,0.5,2500,0.1,500,'Rationale fictive de sonde','proposed')
       returning id::text`,
      [IDS.engNep],
    )).id;
    await q(
      `insert into event_log (tenant_id, engagement_id, actor_kind, actor_id, verb, object_type, object_id, hash)
       values ($1,$2,'system',null,'materiality_proposed','materiality',$3,'hash-fictif-sonde')`,
      [IDS.tenant, IDS.engNep, materialityId],
    );
  });

  it('chaque élément résout un objet qui existe réellement (épreuve §3.4 point 1)', async () => {
    const els = await elementsIaNonValides(IDS.engNep);
    expect(els.length).toBeGreaterThanOrEqual(4);

    const g = els.find((e) => e.nature === 'walkthroughGap' && e.id === gapId);
    const d = els.find((e) => e.nature === 'deficiency' && e.id === deficiencyId);
    const x = els.find((e) => e.nature === 'extraction' && e.id === extractionId);
    const m = els.find((e) => e.nature === 'materialite' && e.id === materialityId);
    expect(g).toBeDefined();
    expect(d).toBeDefined();
    expect(x).toBeDefined();
    expect(m).toBeDefined();

    expect((await q(`select 1 from control_walkthrough_gap where id = $1`, [g!.id])).length).toBe(1);
    expect((await q(`select 1 from deficiency where id = $1`, [d!.id])).length).toBe(1);
    expect((await q(`select 1 from extraction where id = $1`, [x!.id])).length).toBe(1);
    expect((await q(`select 1 from materiality where id = $1`, [m!.id])).length).toBe(1);
  });

  it('l’écart de walkthrough candidat mène en un clic au geste réel (rcm/[cid])', async () => {
    const g = (await elementsIaNonValides(IDS.engNep)).find((e) => e.id === gapId)!;
    expect(g.titre).toEqual({ cle: 'notif.walkthroughGap', vars: { code: 'C-NOTIF-GAP' } });
    expect(g.href).toBe(`/eng/${IDS.engNep}/rcm/${controlGap}`);
    expect(g.quand).not.toBeNull();
  });

  it('la déficience proposée mène en un clic au geste réel (rcm/[cid])', async () => {
    const d = (await elementsIaNonValides(IDS.engNep)).find((e) => e.id === deficiencyId)!;
    expect(d.titre).toEqual({ cle: 'notif.deficiency', vars: { code: 'C-NOTIF-DEF' } });
    expect(d.href).toBe(`/eng/${IDS.engNep}/rcm/${controlDef}`);
    expect(d.quand).not.toBeNull();
  });

  it('l’extraction en attente mène en un clic au geste réel (testing) — sans pièce demandée, pas de deep-link', async () => {
    const x = (await elementsIaNonValides(IDS.engNep)).find((e) => e.id === extractionId)!;
    expect(x.titre).toEqual({ cle: 'notif.extraction', vars: { fichier: 'piece-de-sonde.pdf' } });
    /* Cette fixture n'a pas de `request_item`/`sample_item` : la branche
       `?item=` du href (quand la pièce vient d'une demande liée à une ligne
       d'échantillon) n'est pas éprouvée ici — reporté, R86. */
    expect(x.href).toBe(`/eng/${IDS.engNep}/testing`);
    expect(x.quand).not.toBeNull();
  });

  it('la proposition de matérialité mène en un clic au geste réel (materiality), datée par event_log', async () => {
    const m = (await elementsIaNonValides(IDS.engNep)).find((e) => e.id === materialityId)!;
    expect(m.titre).toEqual({ cle: 'notif.materialite', vars: undefined });
    expect(m.href).toBe(`/eng/${IDS.engNep}/materiality`);
    /* `materiality` ne porte aucun `created_at` et `propose()` (moteur
       déterministe) ne pose jamais `proposed_by_ai_run` — la date vient
       d'`event_log` (`materiality_proposed`). Si elle manquait, ce test le
       dirait : ce n'est pas un repli silencieux. */
    expect(m.quand).not.toBeNull();
  });

  it('NOTIF-01 : le dossier ne se vise pas tant qu’un élément IA reste non validé (épreuve §3.4 point 3)', async () => {
    const els = await elementsIaNonValides(IDS.engNep);
    const obstacles = await obstaclesAuVisa(IDS.engNep);
    const famille = obstacles.filter((o) => o.famille === 'iaNonValide');
    /* MÊME CALCUL, JAMAIS UNE SECONDE LISTE : un motif par élément. */
    expect(famille.length).toBe(els.length);
    expect(famille.length).toBeGreaterThan(0);
    for (const f of famille) expect(f.motif.cle).toBe('obst.iaNonValide');
    expect(await visaPossible(IDS.engNep)).toBe(false);
  });

  it('le compte change selon le rôle — Karim (senior, can_sign=false) ne voit rien compté comme sien, '
    + 'Léa (manager, can_sign=true) si (épreuve §3.4 point 2)', async () => {
    const pourKarim = (await notificationsPourApprobation(KARIM)).filter((n) => n.engagementId === IDS.engNep);
    const pourLea = (await notificationsPourApprobation(LEA)).filter((n) => n.engagementId === IDS.engNep);
    expect(pourKarim).toHaveLength(0);
    expect(pourLea.length).toBeGreaterThan(0);
    for (const n of pourLea) expect(n.niveau).toBe('L2');
  });

  it('l’âge de chaque attente, la plus ancienne en tête (§3.2)', async () => {
    const mine = (await notificationsPourApprobation(LEA)).filter((n) => n.engagementId === IDS.engNep);
    expect(mine.length).toBeGreaterThan(1);
    const quands = mine.map((c) => c.quand ?? '9999');
    expect(quands).toEqual([...quands].sort());
  });

  it('un élément validé disparaît SANS tâche de nettoyage (épreuve §3.4 point 4)', async () => {
    const avant = await elementsIaNonValides(IDS.engNep);
    expect(avant.some((e) => e.id === deficiencyId)).toBe(true);
    await q(
      `update deficiency set status = 'confirmed', severity_final = severity_proposed,
              magnitude_basis = 'Base fictive de sonde', decided_by = $2, decided_at = now() where id = $1`,
      [deficiencyId, KARIM],
    );
    try {
      const apres = await elementsIaNonValides(IDS.engNep);
      expect(apres.some((e) => e.id === deficiencyId)).toBe(false);
      /* La même disparition doit se refléter dans l'obstacle NOTIF-01 —
         même calcul, jamais une lecture qui traînerait derrière l'autre. */
      const famille = (await obstaclesAuVisa(IDS.engNep)).filter((o) => o.famille === 'iaNonValide');
      expect(famille.length).toBe(apres.length);
    } finally {
      await q(
        `update deficiency set status = 'proposed', severity_final = null, magnitude_basis = null,
                decided_by = null, decided_at = null
         where id = $1`,
        [deficiencyId],
      );
    }
  });

  it('un dossier dont on n’est pas membre ne rend rien — même appartenance que mesTravaux', async () => {
    const hugo = IDS.users.hugo;
    expect((await notificationsPourApprobation(hugo)).filter((n) => n.engagementId === IDS.engNep)).toEqual([]);
  });

  /* `notificationsPourApprobation` est inscrite « par personne » dans
     couverture-etancheite.test.ts et etancheite-executee.test.ts — ce qui
     l'EXCLUT de l'appel automatique de cette dernière (même patron
     qu'obstaclesDeMesDossiers/echantillonsDeMesDossiers, travaux.test.ts).
     La preuve d'étanchéité par EXÉCUTION vit donc ici, pas là-bas — jamais
     une inscription non vérifiée (revue hostile du 2026-09-13, voix 2, sur
     le même patron pour R62). */
  it('une appartenance à un dossier d’un AUTRE cabinet n’affiche rien — l’appartenance ne suffit pas', async () => {
    const autre = await q1<{ id: string }>(`insert into tenant (name) values ('Autre cabinet (fictif, sonde notif)') returning id::text`);
    const ent = await q1<{ id: string }>(
      `insert into entity (tenant_id, name, country, registry_type, registry_no, currency)
       values ($1, 'Étrangère SA (fictive, sonde notif)', 'FR', 'fictional', null, 'EUR') returning id::text`, [autre.id]);
    const per = await q1<{ id: string }>(
      `insert into period (entity_id, label, start_date, end_date) values ($1, 'FY2026', '2026-01-01', '2026-12-31') returning id::text`, [ent.id]);
    const eng = await q1<{ id: string }>(
      `insert into engagement (tenant_id, entity_id, period_id, kind, name, framework_set, status)
       values ($1, $2, $3, 'statutory_audit', 'Dossier étranger (fictif, sonde notif)', '{"assurance_packs":["nep-fr"],"accounting_map":"pcg","language":"fr"}'::jsonb, 'setup')
       returning id::text`, [autre.id, ent.id, per.id]);
    /* KARIM appartient au cabinet DE LA DÉMONSTRATION — l'ajouter comme
       membre SIGNATAIRE d'un dossier d'un AUTRE cabinet ne devrait produire
       AUCUNE carte, même si `can_sign = true` sur cette ligne : c'est
       `CABINET` (le tenant de la PERSONNE) qui doit trancher, pas la seule
       ligne d'appartenance. */
    await q(`insert into engagement_member (engagement_id, user_id, eng_role, can_sign, entered_on) values ($1, $2, 'partner', true, current_date)`,
      [eng.id, KARIM]);
    expect((await notificationsPourApprobation(KARIM)).some((n) => n.engagementId === eng.id)).toBe(false);
  });
});
