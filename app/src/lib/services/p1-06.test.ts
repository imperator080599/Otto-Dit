import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { pendingVerifications, verifyExtraction } from './extraction/ladder';
import { propose, validate } from './materiality';
import { rebuildFslis, listFslis, confirmScoping } from './fsli';
import { importerProcessus } from './processus';
import { resoudreAncre } from './notes/ancres';

// P1-06 (AUD-10, §7.6 du plan maître) : la VRAIE supersede — jamais de `delete`, jamais
// une mutation en place d'une ligne déjà vérifiée/validée/importée. Chaque bloc ci-dessous
// EXERCE le chemin réel (règle 15), pas un texte relu.

describe('P1-06 : extraction — append-only (0178)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 60000);

  it('CAS CONNU MAUVAIS (règle 17) : la garde en base refuse toute mutation directe d’une ligne extraction', async () => {
    const ev = await q1<{ id: string }>(
      `insert into evidence (engagement_id, filename, mime, sha256, size_bytes, storage_path, source, audience, uploaded_by_kind)
       values ($1,'sonde-p1-06.pdf','application/pdf','sha-sonde-p1-06',1,'sonde/inexistant','auditor','internal','app_user')
       returning id::text`,
      [IDS.engNep],
    );
    const x = await q1<{ id: string }>(
      `insert into extraction (evidence_id, rung, status, fields, overall_confidence)
       values ($1,'ocr','pending_verify','[]'::jsonb,0.4) returning id::text`,
      [ev.id],
    );
    await expect(q(`update extraction set status = 'failed' where id = $1`, [x.id]))
      .rejects.toThrow(/extraction is append-only/);
    await expect(q(`delete from extraction where id = $1`, [x.id]))
      .rejects.toThrow(/extraction is append-only/);
  });

  it('verifyExtraction insère une ligne NEUVE, jamais une mutation — la ligne d’origine est intacte et n’est plus « en attente »', async () => {
    const ev = await q1<{ id: string }>(
      `insert into evidence (engagement_id, filename, mime, sha256, size_bytes, storage_path, source, audience, uploaded_by_kind)
       values ($1,'sonde-p1-06-verif.pdf','application/pdf','sha-sonde-p1-06-verif',1,'sonde/inexistant','auditor','internal','app_user')
       returning id::text`,
      [IDS.engNep],
    );
    const original = await q1<{ id: string }>(
      `insert into extraction (evidence_id, rung, status, fields, overall_confidence)
       values ($1,'ocr','pending_verify','[{"name":"total_ht","value":"100,00","confidence":0.4,"page":1}]'::jsonb,0.4) returning id::text`,
      [ev.id],
    );
    const avant = await pendingVerifications(IDS.engNep);
    expect(avant.some((p) => p.id === original.id)).toBe(true);

    await verifyExtraction(original.id, IDS.users.karim, [{ name: 'total_ht', value: '1 000,00', confidence: 1, page: 1 }]);

    /* L'ORIGINALE N'A PAS BOUGÉ : même champ brut, même statut « pending_verify ». */
    const origineApres = await q1<{ status: string; fields: { name: string; value: string }[] }>(
      `select status, fields from extraction where id = $1`, [original.id]);
    expect(origineApres.status).toBe('pending_verify');
    expect(origineApres.fields[0].value).toBe('100,00');

    /* UNE LIGNE NEUVE porte la correction, `verified`, et pointe vers l'originale. */
    const toutes = await q<{ id: string; status: string; supersedes_extraction_id: string | null; fields: { value: string }[]; overall_confidence: string | null }>(
      `select id::text, status, supersedes_extraction_id::text, fields, overall_confidence::text from extraction where evidence_id = $1 order by created_at`,
      [ev.id],
    );
    expect(toutes.length).toBe(2);
    const neuve = toutes.find((r) => r.id !== original.id)!;
    expect(neuve.status).toBe('verified');
    expect(neuve.supersedes_extraction_id).toBe(original.id);
    expect(neuve.fields[0].value).toBe('1 000,00');
    expect(neuve.overall_confidence).toBe('1.000');

    /* pendingVerifications() n'affiche plus cette pièce : la ligne d'origine reste
       « pending_verify » pour toujours (append-only) mais elle est supersédée. */
    const apres = await pendingVerifications(IDS.engNep);
    expect(apres.some((p) => p.id === original.id)).toBe(false);
    expect(apres.some((p) => p.evidence_id === ev.id)).toBe(false);
  });

  it('verifyExtraction refuse une ligne déjà vérifiée (pas « pending_verify »)', async () => {
    const ev = await q1<{ id: string }>(
      `insert into evidence (engagement_id, filename, mime, sha256, size_bytes, storage_path, source, audience, uploaded_by_kind)
       values ($1,'sonde-p1-06-deja-verifiee.pdf','application/pdf','sha-sonde-p1-06-deja-verifiee',1,'sonde/inexistant','auditor','internal','app_user')
       returning id::text`,
      [IDS.engNep],
    );
    const original = await q1<{ id: string }>(
      `insert into extraction (evidence_id, rung, status, fields, overall_confidence)
       values ($1,'ocr','pending_verify','[]'::jsonb,0.4) returning id::text`,
      [ev.id],
    );
    await verifyExtraction(original.id, IDS.users.karim);
    await expect(verifyExtraction(original.id, IDS.users.karim)).rejects.toThrow(/n'attend plus de vérification/);
  });

  it('CORRECTIF DE REVUE HOSTILE (règle 17, V1-05) — deux verifyExtraction concurrents sur la MÊME ligne : un seul gagne, une seule ligne « verified » derrière', async () => {
    const ev = await q1<{ id: string }>(
      `insert into evidence (engagement_id, filename, mime, sha256, size_bytes, storage_path, source, audience, uploaded_by_kind)
       values ($1,'sonde-p1-06-course.pdf','application/pdf','sha-sonde-p1-06-course',1,'sonde/inexistant','auditor','internal','app_user')
       returning id::text`,
      [IDS.engNep],
    );
    const original = await q1<{ id: string }>(
      `insert into extraction (evidence_id, rung, status, fields, overall_confidence)
       values ($1,'ocr','pending_verify','[]'::jsonb,0.4) returning id::text`,
      [ev.id],
    );
    /* SANS le CLAIM (revue hostile P1-06, voix 1, V1-05), les deux appels passaient tous deux
       la lecture initiale et inséraient chacun une ligne « verified » qui supersède la MÊME
       originale — deux corrections humaines concurrentes, `latestExtraction()` n'en gardant
       qu'une au hasard de l'ordre, l'autre orpheline et jamais dite. */
    const resultats = await Promise.allSettled([
      verifyExtraction(original.id, IDS.users.karim, [{ name: 'total_ht', value: 'A', confidence: 1, page: 1 }]),
      verifyExtraction(original.id, IDS.users.lea, [{ name: 'total_ht', value: 'B', confidence: 1, page: 1 }]),
    ]);
    expect(resultats.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(resultats.filter((r) => r.status === 'rejected').length).toBe(1);
    const verifiees = await q<{ id: string }>(`select id::text from extraction where supersedes_extraction_id = $1`, [original.id]);
    expect(verifiees.length).toBe(1);
  });
});

describe('P1-06 : materiality — l’ajustement crée une version, jamais une mutation de la proposition', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 60000);

  it('validate(adjust) supersède la proposition ET toute version validée antérieure — au plus une « validated » à la fin', async () => {
    const v1 = await propose(IDS.engNep, IDS.users.lea);
    await validate(v1, IDS.users.lea); // tel quel — v1 devient 'validated' en place
    const avantV1 = await q1<{ status: string; perf_pct: string }>(`select status, perf_pct::text perf_pct from materiality where id = $1`, [v1]);
    expect(avantV1.status).toBe('validated');

    const v2 = await propose(IDS.engNep, IDS.users.lea); // nouvelle proposition, 'proposed'
    await validate(v2, IDS.users.lea, { benchmarkCode: 'revenue', pct: 0.01 }); // ajustée

    const lignes = await q<{ id: string; status: string; supersedes_id: string | null; version: number; perf_pct: string }>(
      `select id::text, status, supersedes_id::text, version, perf_pct::text from materiality where engagement_id = $1 order by version`,
      [IDS.engNep],
    );
    /* bootstrapNep() pose déjà une matérialité (proposée puis validée telle quelle) avant ce
       test : v1/v2 s'y ajoutent, jamais ne la remplacent — d'où 4 lignes, pas 3, et AUCUNE
       n'est jamais supprimée (règle 28). */
    expect(lignes.length).toBe(4);
    const l1 = lignes.find((l) => l.id === v1)!;
    const l2 = lignes.find((l) => l.id === v2)!;
    const l3 = lignes.find((l) => l.status === 'validated')!; // la ligne neuve — la seule validée
    expect(l1.status).toBe('superseded'); // l'ancienne validée, supersédée par l3
    expect(l2.status).toBe('superseded'); // la proposition ajustée, jamais mutée
    expect(l3.id).not.toBe(v1);
    expect(l3.id).not.toBe(v2);
    expect(l3.supersedes_id).toBe(v2); // supersède la PROPOSITION qu'elle ajuste, pas v1
    expect(l3.perf_pct).toBe(l2.perf_pct); // perf/ctt/te portés tels quels depuis la proposition ajustée

    const validees = await q1<{ n: string }>(`select count(*)::text n from materiality where engagement_id = $1 and status = 'validated'`, [IDS.engNep]);
    expect(validees.n).toBe('1'); // l'invariant « au plus une validée » tient après un ajustement
  });

  it('CORRECTIF DE REVUE HOSTILE (règle 17) — deux validate(adjust) concurrents sur la MÊME proposition : un seul gagne, l’autre est refusé, jamais deux versions validées', async () => {
    const v = await propose(IDS.engNep, IDS.users.lea);
    const resultats = await Promise.allSettled([
      validate(v, IDS.users.lea, { benchmarkCode: 'revenue', pct: 0.01 }),
      validate(v, IDS.users.karim, { benchmarkCode: 'total_assets', pct: 0.02 }),
    ]);
    const reussis = resultats.filter((r) => r.status === 'fulfilled');
    const refuses = resultats.filter((r) => r.status === 'rejected');
    expect(reussis.length, 'exactement un des deux appels concurrents doit réussir').toBe(1);
    expect(refuses.length).toBe(1);
    expect((refuses[0] as PromiseRejectedResult).reason.message).toMatch(/course concurrente|only a proposed version/);
    const compte = await q1<{ n: string }>(`select count(*)::text n from materiality where engagement_id = $1 and status = 'validated'`, [IDS.engNep]);
    expect(compte.n, 'jamais zéro (la course trouvée par la revue hostile), jamais deux — exactement une').toBe('1');
  });

  it('CORRECTIF DE REVUE HOSTILE (règle 17) — deux validate(adjust) concurrents sur DEUX propositions distinctes : jamais zéro ligne validée à la fin', async () => {
    const b = await propose(IDS.engNep, IDS.users.lea);
    const c = await propose(IDS.engNep, IDS.users.lea);
    await Promise.allSettled([
      validate(b, IDS.users.lea, { benchmarkCode: 'revenue', pct: 0.01 }),
      validate(c, IDS.users.karim, { benchmarkCode: 'total_assets', pct: 0.02 }),
    ]);
    /* LA COURSE TROUVÉE PAR LA REVUE HOSTILE (voix 1, V1-04, CONFIRMÉ HAUTE) : sans le CLAIM
       atomique, l'entrelacement pouvait laisser ZÉRO ligne validée (chacune des deux insertions
       supersédait l'AUTRE avant que sa propre transaction ne commette) — plus aucun seuil pour
       le sondage ni le scoping. */
    const compte = await q1<{ n: string }>(`select count(*)::text n from materiality where engagement_id = $1 and status = 'validated'`, [IDS.engNep]);
    expect(Number(compte.n)).toBe(1);
  });
});

describe('P1-06 : fsli — rebuildFslis upsert, confirmed_at survit au recalcul', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 60000);

  it('un scoping CONFIRMÉ garde son id ET son confirmed_at à travers un recalcul', async () => {
    const fslis = await listFslis(IDS.engNep);
    const revenue = fslis.find((f) => f.code === 'REVENUE')!;
    expect(revenue).toBeTruthy();
    await confirmScoping(revenue.id, IDS.users.karim, 'in_scope', 'confirmé pour la sonde P1-06');
    const avant = await q1<{ id: string; confirmed_at: string | null; confirmed_by: string | null }>(
      `select id::text, confirmed_at::text, confirmed_by::text from fsli where id = $1`, [revenue.id]);
    expect(avant.confirmed_at).not.toBeNull();
    expect(avant.confirmed_by).toBe(IDS.users.karim);

    await rebuildFslis(IDS.engNep, IDS.users.karim); // recalcul — AVANT le correctif, confirmed_at retombait à NULL ici
    const apres = await q1<{ id: string; confirmed_at: string | null; confirmed_by: string | null; scoping: string }>(
      `select id::text, confirmed_at::text, confirmed_by::text, scoping from fsli where engagement_id = $1 and code = 'REVENUE'`,
      [IDS.engNep],
    );
    expect(apres.id).toBe(avant.id); // même ligne — un upsert, pas un delete-puis-insert
    expect(apres.confirmed_at).toBe(avant.confirmed_at); // LE CORRECTIF : la date survit
    expect(apres.confirmed_by).toBe(IDS.users.karim);
    expect(apres.scoping).toBe('in_scope'); // une décision confirmée n'est jamais réinitialisée par un recalcul
  });
});

describe('P1-06 : process_model — vraie supersede (jamais de delete)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 60000);

  function processusJson(suffixe: string) {
    return new TextEncoder().encode(JSON.stringify({
      cycle: 'REVENUE',
      nom: `Cycle ventes ${suffixe}`,
      etapes: [
        { code: 'CMD', libelle: `Commande ${suffixe}`, acteur: 'Service commercial', systeme: 'CRM' },
        { code: 'FACT', libelle: `Facturation ${suffixe}`, acteur: 'Comptabilité', systeme: 'ERP' },
      ],
      controles: [
        { code: `CTRL-${suffixe}`, etape: 'FACT', libelle: `Rapprochement ${suffixe}`, frequence: 'monthly', proprietaire: 'Contrôleur' },
      ],
    }));
  }

  it('un second import du même cycle/exercice supersède le premier : ancien conservé (règle 28), control réaccroché', async () => {
    const v1 = await importerProcessus({
      engagementId: IDS.engNep, exercice: 'n', filename: 'processus-v1.json',
      contenu: processusJson('v1'), userId: IDS.users.karim, fsliCode: 'REVENUE',
    });
    const v1Steps = await q1<{ n: string }>(`select count(*)::text n from process_step where process_id = $1`, [v1]);
    expect(Number(v1Steps.n)).toBe(2);

    /* Un contrôle rattaché à la version 1 — le seul écrivain de ce lien aujourd'hui est ce
       test (aucun chemin applicatif ne l'écrit encore, voir processus.ts) ; il sert à
       prouver le réaccrochage, pas à décrire un usage réel. */
    const ctrl = await q1<{ id: string }>(
      `insert into control (engagement_id, process_model_id, code, name, description, frequency, nature, effect)
       values ($1,$2,'C-P106-SONDE','Contrôle sonde P1-06','sonde, données synthétiques','monthly','manual','detective')
       returning id::text`,
      [IDS.engNep, v1],
    );

    const v2 = await importerProcessus({
      engagementId: IDS.engNep, exercice: 'n', filename: 'processus-v2.json',
      contenu: processusJson('v2'), userId: IDS.users.karim, fsliCode: 'REVENUE', confirmerRemplacement: true,
    });
    expect(v2).not.toBe(v1);

    const lignes = await q<{ id: string; status: string; supersedes_id: string | null; code: string }>(
      `select id::text, status, supersedes_id::text, code from process_model where engagement_id = $1 and cycle_ref = 'REVENUE' and exercice = 'n'`,
      [IDS.engNep],
    );
    expect(lignes.length).toBe(2); // v1 ET v2, jamais un delete
    const l1 = lignes.find((l) => l.id === v1)!;
    const l2 = lignes.find((l) => l.id === v2)!;
    expect(l1.status).toBe('superseded');
    expect(l2.status).toBe('active');
    expect(l2.supersedes_id).toBe(v1);
    expect(l1.code).toBe(l2.code); // même code stable — l'index partiel n'admet qu'UNE active par code

    /* Les étapes/contrôles de la version 1 sont INTACTS, attachés à v1, jamais supprimés. */
    const v1StepsApres = await q<{ label: string }>(`select label from process_step where process_id = $1 order by seq`, [v1]);
    expect(v1StepsApres.map((s) => s.label)).toEqual(['Commande v1', 'Facturation v1']);
    const v2Steps = await q<{ label: string }>(`select label from process_step where process_id = $1 order by seq`, [v2]);
    expect(v2Steps.map((s) => s.label)).toEqual(['Commande v2', 'Facturation v2']);

    /* Le contrôle suit la version ACTIVE. */
    const ctrlApres = await q1<{ process_model_id: string }>(`select process_model_id::text from control where id = $1`, [ctrl.id]);
    expect(ctrlApres.process_model_id).toBe(v2);

    /* lireProcessus ne rend que la version active — jamais une version périmée au hasard. */
    const { lireProcessus } = await import('./processus');
    const lu = await lireProcessus(IDS.engNep, 'REVENUE');
    expect(lu.n!.id).toBe(v2);
    expect(lu.n!.nom).toBe('Cycle ventes v2');

    /* CORRECTIF DE REVUE HOSTILE (P1-06, deux voix indépendantes, CONFIRMÉ MOYENNE, V1-03/F6) :
       une note ancrée sur `process_model` (ADR-097) doit résoudre vers la version ACTIVE,
       jamais l'ancienne — et une note ancrée sur une ÉTAPE de l'ancienne version (CMD/FACT
       existent dans les deux ici, donc pas de cas ; c'est le CODE de contrôle qui distingue
       la v1) doit rester résolue tant que le code d'étape existe encore dans la version
       active. Sans le filtre `status = 'active'`, `resoudreAncre` pouvait rendre l'id de la
       ligne SUPERSÉDÉE (v1) au hasard de l'ordre SQL. */
    const ancreModele = await resoudreAncre(IDS.engNep, { kind: 'process_model', ref: 'REVENUE:n', field: null, label: 'sonde' });
    expect(ancreModele.etat).toBe('present');
    expect(ancreModele.cibles).toEqual([v2]);
    const ancreEtape = await resoudreAncre(IDS.engNep, { kind: 'process_step', ref: 'REVENUE:n:CMD', field: null, label: 'sonde' });
    expect(ancreEtape.etat).toBe('present');
    const etapeV2 = await q1<{ id: string }>(`select id::text from process_step where process_id = $1 and code = 'CMD'`, [v2]);
    expect(ancreEtape.cibles).toEqual([etapeV2.id]); // jamais l'id de l'étape v1, homonyme
  });

  it('un troisième import refuse sans confirmerRemplacement, comme avant P1-06', async () => {
    await expect(importerProcessus({
      engagementId: IDS.engNep, exercice: 'n', filename: 'processus-v3.json',
      contenu: processusJson('v3'), userId: IDS.users.karim, fsliCode: 'REVENUE',
    })).rejects.toThrow(/déjà décrite/);
  });

  it('CORRECTIF DE REVUE HOSTILE (règle 17) — deux remplacements concurrents du MÊME cycle : un seul gagne, une seule ligne active à la fin', async () => {
    await importerProcessus({
      engagementId: IDS.engNep, exercice: 'n1', filename: 'processus-course-v1.json',
      contenu: processusJson('course-v1'), userId: IDS.users.karim, fsliCode: 'REVENUE',
    });
    const resultats = await Promise.allSettled([
      importerProcessus({
        engagementId: IDS.engNep, exercice: 'n1', filename: 'processus-course-v2.json',
        contenu: processusJson('course-v2'), userId: IDS.users.karim, fsliCode: 'REVENUE', confirmerRemplacement: true,
      }),
      importerProcessus({
        engagementId: IDS.engNep, exercice: 'n1', filename: 'processus-course-v3.json',
        contenu: processusJson('course-v3'), userId: IDS.users.lea, fsliCode: 'REVENUE', confirmerRemplacement: true,
      }),
    ]);
    expect(resultats.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(resultats.filter((r) => r.status === 'rejected').length).toBe(1);
    const actifs = await q1<{ n: string }>(
      `select count(*)::text n from process_model where engagement_id = $1 and cycle_ref = 'REVENUE' and exercice = 'n1' and status = 'active'`,
      [IDS.engNep],
    );
    expect(actifs.n).toBe('1'); // jamais zéro, jamais deux — l'index partiel + le claim tiennent sous la course
  });
});
