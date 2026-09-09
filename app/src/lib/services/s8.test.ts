import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapSox, runControlCycle, runPart2 } from '@/lib/flows/part2';
import {
  listControls, listDeviations, listDeficiencies, attributeGrid, drawAttributeSample, setDiStatus, resolveDeviation,
  attacherWalkthrough, ajouterTacheControle, documenterProcedureTache, listerTachesControle,
  documenterFacteurDesign, declarerIuc, lierRisqueControle, delierRisqueControle, risquesLiesAuControle,
  documenterIucPreuve, iucDuControle,
} from './sox';
import { ingestEvidence } from './evidence';
import { getWorkpaper } from './workpapers/lifecycle';
import { renderWorkpaperPdf } from './workpapers/render';
import type { WpSection } from './workpapers/draft';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

describe('S8 — SOX OE cycle on the same engines (PCAOB/COSO pack)', () => {
  let manifest: { deviations: { id: string; control: string; instance: string; taxonomy: string }[]; sampling: { bankRec: { sampled: string[] }; approvals: { sampled: string[] } } };

  beforeAll(async () => {
    await initTestDb();
    manifest = JSON.parse(fs.readFileSync(ds('manifest.json'), 'utf8'));
    await bootstrapSox();
  }, 180000);

  it('imports the RCM with 7 controls incl. one ITGC and their attributes', async () => {
    const controls = await listControls(IDS.engSox);
    expect(controls.length).toBe(7);
    expect(controls.filter((c) => c.itgc_code).length).toBe(1);
    expect(controls.find((c) => c.code === 'C-BR-01')!.frequency).toBe('monthly');
    const attrs = await q<{ n: string }>(`select count(*) n from attribute_def`, []);
    expect(Number(attrs[0].n)).toBeGreaterThan(7);
  });

  it('D&I gate blocks OE testing on a not-assessed control', async () => {
    /* Les SEPT contrôles démarrent `not_assessed` depuis la correction CTRL-01 du
       2026-09-08 (importRcm ne lit plus di_status du listing client — un jugement de
       l'auditeur ne vient jamais du client) : C-REV-03 est choisi PAR CODE, pas « le
       premier non évalué », pour rester indépendant de l'ordre de la liste. */
    const notAssessed = (await listControls(IDS.engSox)).find((c) => c.code === 'C-REV-03')!;
    expect(notAssessed.di_status).toBe('not_assessed');
    await expect(drawAttributeSample(notAssessed.id, IDS.users.lea)).rejects.toThrow(/D&I gate/);

    // CTRL-01 (mandat contrôle interne, 2026-09-08) : sans tâche documentée, aucune conclusion.
    await expect(setDiStatus(notAssessed.id, IDS.users.karim, 'effective', 'Walkthrough performed — design effective.'))
      .rejects.toThrow(/CTRL-01/);

    // CAS CONNU MAUVAIS (règle 17) : une tâche documentée par la SEULE inquiry ne suffit pas
    // — la garde doit ÉCHOUER ici avant qu'on retire le défaut.
    const { evidenceId } = await ingestEvidence({
      engagementId: IDS.engSox, filename: 'walkthrough-C-REV-03.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('synthetic walkthrough transcript'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    await attacherWalkthrough(notAssessed.id, IDS.users.karim, evidenceId);
    const taskId = await ajouterTacheControle(notAssessed.id, IDS.users.karim, 'Credit memo review as observed', '01:23');
    const tachesInquiryOnly = await listerTachesControle(notAssessed.id);
    expect(tachesInquiryOnly[0].procedures).toEqual([{ procedure: 'inquiry', notes: expect.any(String), evidence_id: evidenceId }]);
    await expect(setDiStatus(notAssessed.id, IDS.users.karim, 'effective', 'Walkthrough performed — design effective.'))
      .rejects.toThrow(/CTRL-01.*Credit memo review as observed/);

    // Défaut retiré : une procédure autre que l'inquiry est documentée, la conclusion passe.
    await documenterProcedureTache(taskId, IDS.users.karim, 'observation', 'Reviewer observed performing the review live.');
    const taches = await listerTachesControle(notAssessed.id);
    expect(taches[0].procedures.map((p) => p.procedure).sort()).toEqual(['inquiry', 'observation']);

    // CTRL-02/CTRL-03 (mandat contrôle interne, §2.3/§2.4, tranche 2) : mêmes conditions que
    // CTRL-01 ci-dessus — sans les quatre facteurs et une déclaration IUC, la conclusion refuse.
    await expect(setDiStatus(notAssessed.id, IDS.users.karim, 'effective', 'Walkthrough performed — design effective.'))
      .rejects.toThrow(/CTRL-02.*reponse_risque, autorite_competence, frequence_constance, seuil_investigation/);
    for (const f of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation'] as const) {
      await documenterFacteurDesign(notAssessed.id, IDS.users.karim, f, `Conclusion pour ${f}.`);
    }
    await expect(setDiStatus(notAssessed.id, IDS.users.karim, 'effective', 'Walkthrough performed — design effective.'))
      .rejects.toThrow(/CTRL-03.*aucune déclaration IUC/);
    await declarerIuc(notAssessed.id, IDS.users.karim, false);
    await setDiStatus(notAssessed.id, IDS.users.karim, 'effective', 'Walkthrough performed — design effective.');
    const after = (await listControls(IDS.engSox)).find((c) => c.code === 'C-REV-03')!;
    expect(after.di_status).toBe('effective');
  });

  it('documenterProcedureTache refuses "inquiry" at runtime — it never overwrites the systematic inquiry row', async () => {
    /* CAS CONNU MAUVAIS (règle 17), trouvé PAR DEUX voix indépendantes de la revue hostile du
       2026-09-08 (confirmé par réfutation, règle 30) : le type TypeScript de `procedure` exclut
       'inquiry', mais rien ne l'empêchait à l'exécution — un `FormData` posté à la main (le
       formulaire HTML n'est pas une contrainte serveur) écrasait silencieusement la ligne
       d'inquiry systématique, effaçant sa citation de la vidéo du walkthrough. */
    const control = (await listControls(IDS.engSox)).find((c) => c.code === 'C-REV-04')!;
    const { evidenceId } = await ingestEvidence({
      engagementId: IDS.engSox, filename: 'walkthrough-C-REV-04.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('synthetic walkthrough transcript'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    await attacherWalkthrough(control.id, IDS.users.karim, evidenceId);
    const taskId = await ajouterTacheControle(control.id, IDS.users.karim, 'Price master change reviewed');
    const avant = (await listerTachesControle(control.id))[0].procedures.find((p) => p.procedure === 'inquiry')!;

    await expect(documenterProcedureTache(
      taskId, IDS.users.karim, 'inquiry' as unknown as 'inspection', 'ATTAQUANT : notes réécrites',
    )).rejects.toThrow(/CTRL-01.*procédure documentable/);

    const apres = (await listerTachesControle(control.id))[0].procedures.find((p) => p.procedure === 'inquiry')!;
    expect(apres).toEqual(avant);

    // Une pièce en quarantaine ne peut ni servir de walkthrough ni corroborer une procédure.
    const { evidenceId: pieceQuarantaine } = await ingestEvidence({
      engagementId: IDS.engSox, filename: 'suspecte.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('x'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    await q(`update evidence set quarantined = true where id = $1`, [pieceQuarantaine]);
    await expect(attacherWalkthrough(control.id, IDS.users.karim, pieceQuarantaine)).rejects.toThrow(/quarantaine/);
    await expect(documenterProcedureTache(taskId, IDS.users.karim, 'inspection', 'note', pieceQuarantaine)).rejects.toThrow(/quarantaine/);
  });

  it('attacherWalkthrough refuses a task before the video is attached, and a mismatched-dossier evidence', async () => {
    const control = await q1<{ id: string; engagement_id: string }>(
      `select id, engagement_id from control where engagement_id = $1 and code = 'C-BR-01'`, [IDS.engSox],
    );
    await expect(ajouterTacheControle(control.id, IDS.users.karim, 'reconciliation prepared'))
      .rejects.toThrow(/enregistrement vidéo/);
    const autreDossier = await ingestEvidence({
      engagementId: IDS.engNep, filename: 'ailleurs.txt', mime: 'text/plain',
      bytes: new TextEncoder().encode('x'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    await expect(attacherWalkthrough(control.id, IDS.users.karim, autreDossier.evidenceId))
      .rejects.toThrow(/n’appartient pas à ce dossier/);
  });

  /** Une tâche minimale, au-delà de l'inquiry — le préalable commun à CTRL-02/CTRL-03. */
  async function tacheMinimale(controlId: string, filename: string): Promise<void> {
    const { evidenceId } = await ingestEvidence({
      engagementId: IDS.engSox, filename, mime: 'text/plain',
      bytes: new TextEncoder().encode('synthetic walkthrough transcript'), source: 'auditor',
      uploadedBy: { kind: 'app_user', id: IDS.users.karim }, audience: 'internal',
    });
    await attacherWalkthrough(controlId, IDS.users.karim, evidenceId);
    const taskId = await ajouterTacheControle(controlId, IDS.users.karim, 'tâche de sonde');
    await documenterProcedureTache(taskId, IDS.users.karim, 'inspection', 'inspection de sonde');
  }

  it('CTRL-02 : le facteur « réponse au risque » exige un lien réel vers un risque, pas seulement sa conclusion écrite', async () => {
    const control = (await listControls(IDS.engSox)).find((c) => c.code === 'C-TR-01')!;
    await tacheMinimale(control.id, 'walkthrough-C-TR-01.txt');

    // CAS CONNU MAUVAIS #1 (règle 17) : aucun des quatre facteurs — nommés tous les quatre.
    await expect(setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.'))
      .rejects.toThrow(/CTRL-02.*reponse_risque, autorite_competence, frequence_constance, seuil_investigation/);

    // Les trois facteurs SANS lien de risque documentés — le quatrième (réponse au risque)
    // manque encore, nommé seul.
    for (const f of ['autorite_competence', 'frequence_constance', 'seuil_investigation'] as const) {
      await documenterFacteurDesign(control.id, IDS.users.karim, f, `Conclusion pour ${f}.`);
    }
    await expect(setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.'))
      .rejects.toThrow(/CTRL-02.*— reponse_risque\./);

    // CAS CONNU MAUVAIS #2 (règle 17) : la conclusion du facteur « réponse au risque » est
    // écrite, mais AUCUN risque réel n'est lié (importRcm en lie pourtant un automatiquement —
    // retiré ici pour provoquer le cas) : le facteur SEUL ne suffit pas, sans texte libre.
    await documenterFacteurDesign(control.id, IDS.users.karim, 'reponse_risque', 'Répond au risque de paiement non autorisé.');
    const risquesAutoLies = await risquesLiesAuControle(control.id);
    expect(risquesAutoLies.length).toBeGreaterThan(0); // importRcm en a lié un vrai (0150)
    for (const r of risquesAutoLies) await delierRisqueControle(control.id, IDS.users.karim, r.id);
    await expect(setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.'))
      .rejects.toThrow(/CTRL-02.*réponse au risque.*ne pointe aucun risque réel/);

    // Un risque d'un AUTRE dossier ne peut pas être lié (étanchéité, comme les pièces).
    const risqueNep = await q1<{ id: string }>(
      `insert into risk (engagement_id, assertion, level, description) values ($1,'existence','high','x') returning id`,
      [IDS.engNep],
    );
    await expect(lierRisqueControle(control.id, IDS.users.karim, risqueNep.id)).rejects.toThrow(/n’appartient pas à ce dossier/);

    // Défaut retiré : un vrai risque du dossier est lié, la conclusion passe.
    const risqueSox = await q1<{ id: string }>(
      `insert into risk (engagement_id, assertion, level, description) values ($1,'existence','high','Unauthorized disbursements.') returning id`,
      [IDS.engSox],
    );
    await lierRisqueControle(control.id, IDS.users.karim, risqueSox.id);
    await declarerIuc(control.id, IDS.users.karim, false);
    await setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.');
    const after = (await listControls(IDS.engSox)).find((c) => c.code === 'C-TR-01')!;
    expect(after.di_status).toBe('effective');
  });

  it('CTRL-03 : une IUC déclarée utilisée exige exactitude ET exhaustivité, chacune nommée si elle manque', async () => {
    const control = (await listControls(IDS.engSox)).find((c) => c.code === 'C-ITGC-01')!;
    await tacheMinimale(control.id, 'walkthrough-C-ITGC-01.txt');
    for (const f of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation'] as const) {
      await documenterFacteurDesign(control.id, IDS.users.karim, f, `Conclusion pour ${f}.`);
    }

    // documenterIucPreuve refuse tant qu'aucune déclaration n'existe.
    await expect(documenterIucPreuve(control.id, IDS.users.karim, 'exactitude', 'note'))
      .rejects.toThrow(/CTRL-03.*déclarez d’abord/);

    // CAS CONNU MAUVAIS (règle 17) : aucune déclaration IUC du tout — nommé distinctement
    // d'une IUC déclarée utilisée à qui il manquerait un volet.
    await expect(setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.'))
      .rejects.toThrow(/CTRL-03.*aucune déclaration IUC/);

    // Déclarée NON utilisée : aucune preuve requise, et en documenter une est refusé (rien à
    // corroborer).
    await declarerIuc(control.id, IDS.users.karim, false);
    await expect(documenterIucPreuve(control.id, IDS.users.karim, 'exactitude', 'note'))
      .rejects.toThrow(/CTRL-03.*sans IUC utilisée/);

    // Redéclarée utilisée : les deux volets manquent, nommés tous les deux.
    await declarerIuc(control.id, IDS.users.karim, true, 'Rapport ERP des accès utilisateurs.');
    await expect(setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.'))
      .rejects.toThrow(/CTRL-03.*exactitude ni exhaustivite/);

    // Un seul volet documenté : l'autre manque encore, nommé seul.
    await documenterIucPreuve(control.id, IDS.users.karim, 'exactitude', 'Rapport rapproché au référentiel des accès RH.');
    await expect(setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.'))
      .rejects.toThrow(/CTRL-03.*sans exhaustivite documentée/);

    // Défaut retiré : les deux volets documentés, la conclusion passe.
    await documenterIucPreuve(control.id, IDS.users.karim, 'exhaustivite', 'Recensement complet des comptes actifs recoupé avec le rapport.');
    const iuc = await iucDuControle(control.id);
    expect(iuc!.preuves.map((p) => p.volet).sort()).toEqual(['exactitude', 'exhaustivite']);
    await setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.');
    const after = (await listControls(IDS.engSox)).find((c) => c.code === 'C-ITGC-01')!;
    expect(after.di_status).toBe('effective');
  });

  it('CTRL-07 : un tirage sans dérogation refuse tant que la table du cabinet est vide, et la dérogation écrite (ADR-010) le débloque', async () => {
    /* CAS CONNU MAUVAIS (règle 17) : la table `attributeSampleSizes` du pack PCAOB/SOX est
       livrée VIDE (`pcaob-sox.ts`, mandat §3.2) — aucune fréquence n'y a de taille « vérifiée ».
       `drawAttributeSample` doit REFUSER tant qu'aucune dérogation écrite n'est fournie, et
       accepter dès qu'elle l'est (ADR-010, chemin déjà existant, inchangé). */
    const control = (await listControls(IDS.engSox)).find((c) => c.code === 'C-REV-02')!;
    expect(control.frequency).toBe('many_daily');
    await tacheMinimale(control.id, 'walkthrough-C-REV-02.txt');
    for (const f of ['reponse_risque', 'autorite_competence', 'frequence_constance', 'seuil_investigation'] as const) {
      await documenterFacteurDesign(control.id, IDS.users.karim, f, `Conclusion pour ${f}.`);
    }
    await declarerIuc(control.id, IDS.users.karim, false);
    await setDiStatus(control.id, IDS.users.karim, 'effective', 'D&I effective.');
    await q(
      `insert into control_instance (control_id, label, occurred_on, performer_name, source) values ($1,'INV-1',null,null,'listing'), ($1,'INV-2',null,null,'listing')`,
      [control.id],
    );
    // CTRL-05 (mandat §3.1, tranche 5) : many_daily n'est pas dérivable — sans une demande
    // client de la population, le tirage refuserait avant même d'atteindre le garde CTRL-07 que
    // ce test exerce. Posée ici pour isoler les deux gardes l'un de l'autre.
    const { demanderPopulationControle } = await import('./requests');
    await demanderPopulationControle(control.id, IDS.users.karim);

    // Cas connu mauvais : aucune taille explicite (donc pas de dérogation) → CTRL-07 refuse,
    // en nommant la fréquence et le chemin de secours (ADR-010).
    await expect(drawAttributeSample(control.id, IDS.users.lea))
      .rejects.toThrow(/CTRL-07.*many_daily.*ADR-010/);

    // Une taille explicite SANS justification écrite reste refusée par la garde existante
    // (ADR-010, inchangée) — CTRL-07 n'affaiblit pas cette exigence.
    await expect(drawAttributeSample(control.id, IDS.users.lea, 2))
      .rejects.toThrow(/written justification/);

    // Défaut retiré : taille + justification écrite → le tirage aboutit.
    const draw = await drawAttributeSample(
      control.id, IDS.users.lea, 2,
      'Table du cabinet non encore fournie (CTRL-07) — taille intérimaire de 2, en attendant.',
    );
    expect(draw.selected.length).toBe(2);
  });

  it('tailleEchantillonOe : une fréquence présente dans le pack est vérifiée, une fréquence absente ne l’est pas', async () => {
    const { tailleEchantillonOe } = await import('./sox');
    const verifiee = tailleEchantillonOe({ attributeSampleSizes: { monthly: 3 } }, 'monthly');
    expect(verifiee).toEqual({ valeur: 3, verifie: true });
    const nonVerifiee = tailleEchantillonOe({ attributeSampleSizes: { monthly: 3 } }, 'weekly');
    expect(nonVerifiee).toEqual({ valeur: null, verifie: false });
    const tableVide = tailleEchantillonOe({}, 'monthly');
    expect(tableVide).toEqual({ valeur: null, verifie: false });
  });

  it('documenterFacteurDesign/documenterIucPreuve : un intrus avec une valeur INVALIDE reçoit le refus ETANCH, jamais CTRL-02/CTRL-03', async () => {
    /* CAS CONNU MAUVAIS (règle 17), trouvé par la revue hostile du 2026-09-08 (voix 2) :
       la première version validait `factor`/`volet` AVANT `assertMembreDe` — un acteur d'un
       AUTRE cabinet envoyant une valeur invalide recevait le refus CTRL-02/CTRL-03 (« pas un
       facteur/volet reconnu ») plutôt que le refus d'étanchéité, ce qui apprend à l'intrus que
       l'objet EXISTE (même doctrine qu'ETANCH-01 avant ETANCH-03, ADR-069/ADR-082). Le premier
       correctif (un type TypeScript inline plutôt qu'un alias nommé) faisait passer le test
       d'étanchéité auto-généré SANS fermer le trou — le harnais fabrique alors une valeur
       VALIDE et n'exerce plus jamais la combinaison valeur-invalide + acteur-étranger (règle 13 :
       le silence lu comme un succès). Ce test-ci envoie une valeur DÉLIBÉRÉMENT invalide,
       exactement ce que le harnais auto-généré ne fait plus. */
    const cabinet = await q1<{ id: string }>(`insert into tenant (name) values ('Cabinet Étranger (sonde étanchéité)') returning id::text`);
    const intrus = (await q1<{ id: string }>(
      `insert into app_user (tenant_id, name, email, firm_role) values ($1, 'Sonde Intrus', 'intrus@sonde.test', 'partner') returning id::text`,
      [cabinet.id])).id;
    const control = (await listControls(IDS.engSox))[0];
    await expect(documenterFacteurDesign(control.id, intrus, 'facteur-bidon' as never, 'x')).rejects.toThrow(/ETANCH/);
    await expect(documenterIucPreuve(control.id, intrus, 'volet-bidon' as never, 'x')).rejects.toThrow(/ETANCH/);
  });

  it('runs the monthly bank-rec control end-to-end and surfaces every seeded deviation', async () => {
    const res = await runControlCycle('C-BR-01');
    expect(res.deviations).toBeGreaterThanOrEqual(4);

    // the app's attribute draw reproduces the pinned manifest draw
    const sampled = await q<{ label: string }>(
      `select ci.label from sample_item si
       join control_instance ci on ci.id = si.unit_id
       join sample s on s.id = si.sample_id
       join control_test ct on ct.sample_id = s.id
       join control c on c.id = ct.control_id
       where c.code = 'C-BR-01' order by ci.label`,
      [],
    );
    // the FIRST draw is the pinned 3-instance sample …
    const firstSample = await q1<{ sample_id: string }>(
      `select ct.sample_id from control_test ct join control c on c.id = ct.control_id
       where c.code = 'C-BR-01' and c.engagement_id = $1 order by ct.created_at limit 1`,
      [IDS.engSox],
    );
    const firstLabels = await q<{ label: string }>(
      `select ci.label from sample_item si join control_instance ci on ci.id = si.unit_id
       where si.sample_id = $1 order by ci.label`,
      [firstSample.sample_id],
    );
    expect(firstLabels.map((s) => s.label)).toEqual([...manifest.sampling.bankRec.sampled].sort());

    // … all three failed, so the engine required the population and the flow tested it
    const tests = await q<{ extension_required: boolean; n: string }>(
      `select ct.extension_required, (select count(*) from sample_item si where si.sample_id = ct.sample_id)::text n
       from control_test ct join control c on c.id = ct.control_id
       where c.code = 'C-BR-01' and c.engagement_id = $1 order by ct.created_at`,
      [IDS.engSox],
    );
    expect(tests.map((t) => [t.extension_required, Number(t.n)])).toEqual([[true, 3], [false, 12]]);

    // zero false negatives: every manifest deviation has a matching typed deviation
    const deviations = await listDeviations(IDS.engSox);
    for (const d of manifest.deviations) {
      const hit = deviations.some((x) => x.control_code === d.control && x.instance_label === d.instance && x.taxonomy_code === d.taxonomy);
      expect(hit, `${d.id}: ${d.taxonomy} on ${d.instance}`).toBe(true);
    }
    // no extra deviations beyond the seeded set — counted on the extended test, where the
    // nine additional months are clean (false positives would show up here)
    const latestSample = await q1<{ sample_id: string }>(
      `select ct.sample_id from control_test ct join control c on c.id = ct.control_id
       where c.code = 'C-BR-01' and c.engagement_id = $1 order by ct.created_at desc limit 1`,
      [IDS.engSox],
    );
    const onLatest = await q<{ taxonomy_code: string; label: string }>(
      `select d.taxonomy_code, ci.label from deviation d
       join sample_item si on si.id = d.sample_item_id
       join control_instance ci on ci.id = si.unit_id
       where si.sample_id = $1 order by ci.label, d.taxonomy_code`,
      [latestSample.sample_id],
    );
    expect(onLatest.length).toBe(manifest.deviations.length);
  });

  it('attribute grid renders per-instance results with their basis', async () => {
    const control = await q1<{ id: string }>(`select id from control where engagement_id = $1 and code = 'C-BR-01'`, [IDS.engSox]);
    const grid = await attributeGrid(control.id);
    expect(grid.length).toBeGreaterThan(8);
    expect(grid.some((g) => g.result === 'fail' && g.basis === 'extraction_field')).toBe(true);
    expect(grid.some((g) => g.result === 'na' && g.basis === 'human')).toBe(true); // missing-evidence month
  });

  it('a deviation cannot be explained away on a sentence (migration 0010)', async () => {
    const d = (await listDeviations(IDS.engSox)).find((x) => x.status === 'open');
    expect(d, 'au moins une déviation ouverte').toBeTruthy();
    await expect(
      resolveDeviation(d!.id, IDS.users.karim, {
        explanation: 'Le client indique que le rapprochement a bien été fait.',
        conclusion: 'Explication reçue et jugée plausible.',
        disposition: 'control_operated',
        evidenceId: '',
      }),
    ).rejects.toThrow(/link the evidence that shows the control operated/);

    // la contrainte CHECK est le filet derrière le service
    await expect(
      q(`update deviation set status = 'explained', resolution = 'ok', resolved_by = $2, resolved_at = now() where id = $1`,
        [d!.id, IDS.users.lea]),
    ).rejects.toThrow(/deviation_closure_is_probative/);

    // et une déviation qui subsiste reste ouverte : elle alimente le taux
    expect((await listDeviations(IDS.engSox)).find((x) => x.id === d!.id)!.status).toBe('open');
  });

  it('deficiency ladder proposes severity from rules (L3) and records the human decision', async () => {
    const deficiencies = await listDeficiencies(IDS.engSox);
    expect(deficiencies.length).toBe(1);
    const d = deficiencies[0];
    // a key cash control, an exposure at least equal to materiality, an instance nobody
    // could evidence and one the preparer approved themselves ⇒ material weakness proposed
    expect(d.severity_proposed).toBe('material_weakness');
    expect(d.status).toBe('confirmed');
    expect(d.narrative).toMatch(/Rules-based severity proposal/);
    expect(d.narrative).toMatch(/deviation rate 25 %/);
    const basis = d.basis as { rule: string; deviationRate: number; severeNatures: string[]; sampleSize: number };
    expect(basis.deviationRate).toBeCloseTo(0.25, 4); // 3 deviating months of 12 tested
    expect(basis.sampleSize).toBe(12);
    expect(basis.severeNatures.sort()).toEqual(['missing_evidence', 'wrong_performer']);
    // the number that drove severity says where it came from
    const mb = await q1<{ magnitude_basis: string }>(`select magnitude_basis from deficiency where id = $1`, [d.id]);
    expect(mb.magnitude_basis).toMatch(/balance importée|solde de clôture/);
  });

  it('drafts the ENGLISH OE workpaper through the SAME documentation engine (pluggability proof)', async () => {
    const wpRow = await q1<{ id: string }>(
      `select id from workpaper where engagement_id = $1 and code = 'OE-C-BR-01' order by version desc limit 1`,
      [IDS.engSox],
    );
    const wp = await getWorkpaper(wpRow.id);
    expect(wp!.language).toBe('en');
    expect(wp!.pack_id).toBe('pcaob-sox');
    const sections = wp!.sections as WpSection[];
    expect(sections.map((s) => s.key)).toEqual(['objective', 'scope', 'method', 'sampleTable', 'exceptions', 'evaluation', 'verification', 'conclusion']);
    expect(sections[0].title).toBe('Objective'); // EN pack strings
    expect(sections.find((s) => s.key === 'scope')!.body).toMatch(/Design & implementation: EFFECTIVE/);
    expect(sections.find((s) => s.key === 'sampleTable')!.table!.headers.some((h) => h.startsWith('SOD'))).toBe(true);
    expect(sections.find((s) => s.key === 'evaluation')!.body).toMatch(/DEFICIENCY|SIGNIFICANT|MATERIAL/);
    // same renderer, English content
    const pdf = await renderWorkpaperPdf(wpRow.id);
    expect(Buffer.from(pdf.bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('the clean approval control concludes effective on the same engines', async () => {
    const res = await runControlCycle('C-REV-01');
    expect(res.deviations).toBe(0);
    const wp = await getWorkpaper(res.workpaperId);
    const conclusion = (wp!.sections as WpSection[]).find((s) => s.key === 'conclusion')!;
    expect(conclusion.body).toMatch(/No deviations were noted/);
    // the OCR-mock approval form was verified before use (ADR-012)
    const verified = await q<{ n: string }>(
      `select count(*) n from extraction x join evidence e on e.id = x.evidence_id
       where e.engagement_id = $1 and x.rung = 'ocr' and x.status = 'verified'`,
      [IDS.engSox],
    );
    expect(Number(verified[0].n)).toBe(1);
  });

  it('both cycles share one engine set: sampling/matching/documentation engine_runs on both packs', async () => {
    const runs = await q<{ pack_id: string; engine: string; n: string }>(
      `select pack_id, engine, count(*) n from engine_run group by pack_id, engine order by pack_id, engine`,
      [],
    );
    const packs = new Set(runs.map((r) => r.pack_id));
    expect(packs.has('pcaob-sox')).toBe(true);
    expect(runs.some((r) => r.pack_id === 'pcaob-sox' && r.engine === 'sampling')).toBe(true);
    expect(runs.some((r) => r.pack_id === 'pcaob-sox' && r.engine === 'workpaper_draft')).toBe(true);
    expect(runs.some((r) => r.pack_id === 'pcaob-sox' && r.engine === 'attribute_testing')).toBe(true);
  });
});
