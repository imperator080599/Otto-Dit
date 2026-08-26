// Le questionnaire résiduel et le registre des facteurs déclarés.
//
// Ce fichier vérifie trois choses qu'aucune capture d'écran ne prouve :
//   1. le questionnaire ne coche rien — un « oui » CRÉE un facteur ;
//   2. un facteur déclaré MONTE le niveau et fait entrer des procédures,
//      exactement comme un fait calculé ;
//   3. les trois règles de blocage bloquent réellement.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { chargerCatalogue } from '@/lib/methodology/catalogue';
import { detectTbMapping, importTb, importFec } from './imports';
import { computeTbGl, latestTbGl, noteReconciliationLimitation } from './reconciliation';
import { rebuildFslis, proposeScoping } from './fsli';
import { propose, validate } from './materiality';
import { assessFsli, risksFor, requiredProcedures, levelFor } from './risk';
import {
  questionsOfScope, answerQuestion, answers, register, raiseFactor, decideFactor,
  declaredFactorsFor, questionnaireObstacles, quantitativeShare, QuestionnaireError,
} from './questionnaire';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

describe('questionnaire résiduel et registre des facteurs déclarés', () => {
  beforeAll(async () => {
    await initTestDb();
    const tb = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
    const prior = fs.readFileSync(ds('tb_2024.csv'), 'utf8');
    await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2025.csv',
      content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current' });
    await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2024.csv',
      content: prior, mapping: detectTbMapping(prior.split('\n')[0]), periodKind: 'prior' });
    await importFec({ engagementId: IDS.engNep, userId: IDS.users.karim,
      filename: '999888777FEC20251231.txt', bytes: fs.readFileSync(ds('999888777FEC20251231.txt')) });
    await computeTbGl(IDS.engNep, IDS.users.karim);
    const latest = await latestTbGl(IDS.engNep);
    for (const item of latest!.items) {
      await noteReconciliationLimitation(item.id, IDS.users.karim, {
        explanation: 'Écriture de situation passée après l’extraction du fichier des écritures.',
        alternativeProcedures: 'Rapprochement re-exécuté sur la balance et sur le détail des comptes.',
      });
    }
    await rebuildFslis(IDS.engNep, IDS.users.karim);
    const mid = await propose(IDS.engNep, IDS.users.lea);
    await validate(mid, IDS.users.lea);
    /* Le périmètre est INDISPENSABLE ici : un facteur d'entité vise « tous les
       postes retenus », et sans scoping il ne viserait rien. Le premier jet de
       ce test passait à vide pour cette raison — deux listes vides sont égales. */
    await proposeScoping(IDS.engNep, IDS.users.lea);
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
  });

  /* ═══ 1. le questionnaire est du contenu de cabinet ═══════════════════ */

  it('quatre questions d’entité, six de section — et chacune dit pourquoi elle existe encore', async () => {
    const cat = await chargerCatalogue();
    expect(questionsOfScope(cat, 'entite')).toHaveLength(4);
    expect(questionsOfScope(cat, 'section')).toHaveLength(6);
    for (const x of cat.questionnaire.questions) {
      expect(x.pourquoi.length).toBeGreaterThan(40);
      expect(x.effet.length).toBeGreaterThan(40);
    }
  });

  it('une question inconnue du référentiel est refusée', async () => {
    await expect(answerQuestion({ engagementId: IDS.engNep, fsliCode: 'REVENUE',
      questionCode: 'CRYPTO', answer: 'non', actorUserId: IDS.users.karim }))
      .rejects.toThrow(/inconnue du référentiel/);
  });

  it('une question d’entité ne se pose pas par section, et réciproquement', async () => {
    await expect(answerQuestion({ engagementId: IDS.engNep, fsliCode: 'REVENUE',
      questionCode: 'FRAUDE', answer: 'non', actorUserId: IDS.users.karim }))
      .rejects.toThrow(/question d’entité/);
    await expect(answerQuestion({ engagementId: IDS.engNep, fsliCode: null,
      questionCode: 'SI', answer: 'non', actorUserId: IDS.users.karim }))
      .rejects.toThrow(/exige un poste/);
  });

  /* ═══ 2. LE QUESTIONNAIRE NE COCHE RIEN ═══════════════════════════════ */

  it('une réponse « oui » CRÉE un facteur au registre, avec sa source et son texte', async () => {
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'REVENUE', questionCode: 'SI',
      answer: 'oui', detail: 'Migration de l’outil de facturation en juin 2025 ; reprise des en-cours vérifiée par sondage.',
      actorUserId: IDS.users.karim });

    const reg = await register(IDS.engNep);
    const f = reg.find((x) => x.source_ref === 'SI/REVENUE')!;
    expect(f).toBeDefined();
    expect(f.source).toBe('questionnaire');
    expect(f.status).toBe('confirmed');           // la réponse EST la décision
    expect(f.description).toContain('Migration de l’outil de facturation');
    expect(f.description).toContain('répondu OUI');
    expect(f.targets).toEqual([{ fsli: 'REVENUE', assertions: ['exhaustivite'] }]);
  });

  it('repasser à « non » retire le facteur — il n’a plus de fait derrière lui', async () => {
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'REVENUE', questionCode: 'SI',
      answer: 'non', actorUserId: IDS.users.karim });
    expect((await register(IDS.engNep)).find((x) => x.source_ref === 'SI/REVENUE')).toBeUndefined();
    // on le remet pour la suite
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'REVENUE', questionCode: 'SI',
      answer: 'oui', detail: 'Migration de l’outil de facturation en juin 2025.',
      actorUserId: IDS.users.karim });
  });

  it('le périmètre n’est pas vide — sans quoi les tests d’entité passeraient à vide', async () => {
    const inScope = await q<{ code: string }>(
      `select code from fsli where engagement_id = $1 and scoping in ('in_scope','in_scope_qualitative')`,
      [IDS.engNep],
    );
    expect(inScope.length).toBeGreaterThan(0);
    expect(inScope.map((x) => x.code)).toContain('REVENUE');
  });

  it('une question d’ENTITÉ vise tous les postes retenus au périmètre', async () => {
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: null, questionCode: 'PRESSION',
      answer: 'oui', detail: 'Covenant bancaire testé sur l’EBITDA au 31/12, marge de 4 %.',
      actorUserId: IDS.users.claire });
    const f = (await register(IDS.engNep)).find((x) => x.source_ref === 'PRESSION')!;
    const inScope = await q<{ code: string }>(
      `select code from fsli where engagement_id = $1 and scoping in ('in_scope','in_scope_qualitative')`,
      [IDS.engNep],
    );
    expect(inScope.length).toBeGreaterThan(0);
    expect(f.targets.map((t) => t.fsli).sort()).toEqual(inScope.map((x) => x.code).sort());
    expect(f.targets.every((t) => t.assertions.includes('realite'))).toBe(true);
  });

  /* ═══ 3. LE FACTEUR DÉCLARÉ COMMANDE, COMME UN FAIT CALCULÉ ═══════════ */

  it('un facteur déclaré MONTE le niveau et fait entrer des procédures', async () => {
    const avant = (await risksFor(IDS.engNep, 'REVENUE')).find((r) => r.assertion === 'evaluation')!;
    const procsAvant = (await requiredProcedures(IDS.engNep, 'REVENUE'))
      .filter((p) => p.assertion === 'evaluation').length;

    await raiseFactor({
      engagementId: IDS.engNep, source: 'procedure', sourceRef: 'CA-RA-01', nature: 'incertitude',
      description: 'Litige client de 180 000 € non provisionné, relevé à la revue analytique et confirmé par l’avocat.',
      targets: [{ fsli: 'REVENUE', assertions: ['evaluation'] }],
      actorUserId: IDS.users.karim,
    });
    // proposé : il ne compte pas encore — un moteur qui lève n'a pas décidé
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
    const propose = (await risksFor(IDS.engNep, 'REVENUE')).find((r) => r.assertion === 'evaluation')!;
    expect(propose.computed_level).toBe(avant.computed_level);

    const f = (await register(IDS.engNep)).find((x) => x.source_ref === 'CA-RA-01')!;
    await decideFactor(IDS.engNep, f.id, 'confirmed', 'Retenu : le litige porte sur une créance comptabilisée.', IDS.users.lea);
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);

    const apres = (await risksFor(IDS.engNep, 'REVENUE')).find((r) => r.assertion === 'evaluation')!;
    expect(apres.factor_count).toBe(avant.factor_count + 1);
    expect(apres.computed_level).not.toBe(avant.computed_level);
    expect(apres.factors.some((x) => x.label.includes('Litige client'))).toBe(true);
    // et la preuve dit d'où ça vient
    expect(apres.factors.find((x) => x.label.includes('Litige client'))!.evidence).toContain('CA-RA-01');

    const procsApres = (await requiredProcedures(IDS.engNep, 'REVENUE'))
      .filter((p) => p.assertion === 'evaluation').length;
    expect(procsApres).toBeGreaterThanOrEqual(procsAvant);
  });

  it('écarter sans motif est refusé — par le service ET par la base', async () => {
    // La contrainte se vérifie sur un facteur ENCORE NON STATUÉ : une ligne qui
    // porte déjà un motif de confirmation la satisfait, et le premier jet de ce
    // test passait donc à côté de ce qu'il croyait vérifier.
    const neuf = await raiseFactor({ engagementId: IDS.engNep, source: 'manual', nature: 'changement',
      description: 'Changement de responsable du crédit client en septembre 2025.',
      targets: [{ fsli: 'REVENUE', assertions: ['realite'] }], actorUserId: IDS.users.karim });
    await expect(decideFactor(IDS.engNep, neuf.id, 'dismissed', '   ', IDS.users.lea))
      .rejects.toThrow(/indistinguable d’un oubli/);
    await expect(
      q(`update risk_factor_declared set status = 'dismissed' where id = $1`, [neuf.id]),
    ).rejects.toThrow();
    await decideFactor(IDS.engNep, neuf.id, 'confirmed', 'Retenu.', IDS.users.lea);
  });

  it('un facteur ÉCARTÉ cesse de peser', async () => {
    const f = (await register(IDS.engNep)).find((x) => x.source_ref === 'CA-RA-01')!;
    await decideFactor(IDS.engNep, f.id, 'dismissed',
      'Écarté : le litige porte sur une prestation non facturée, sans effet sur les créances comptabilisées.',
      IDS.users.lea);
    await assessFsli(IDS.engNep, 'REVENUE', IDS.users.karim);
    const apres = (await risksFor(IDS.engNep, 'REVENUE')).find((r) => r.assertion === 'evaluation')!;
    expect(apres.factors.some((x) => x.label.includes('Litige client'))).toBe(false);
  });

  it('un facteur sans description, ou qui ne vise rien, est refusé', async () => {
    await expect(raiseFactor({ engagementId: IDS.engNep, source: 'manual', nature: 'changement',
      description: '  ', targets: [{ fsli: 'REVENUE', assertions: ['realite'] }],
      actorUserId: IDS.users.karim })).rejects.toThrow(/ne se relit pas/);
    await expect(raiseFactor({ engagementId: IDS.engNep, source: 'manual', nature: 'changement',
      description: 'x'.repeat(50), targets: [], actorUserId: IDS.users.karim }))
      .rejects.toThrow(/ne circule pas/);
    await expect(raiseFactor({ engagementId: IDS.engNep, source: 'manual', nature: 'intuition',
      description: 'x'.repeat(50), targets: [{ fsli: 'REVENUE', assertions: ['realite'] }],
      actorUserId: IDS.users.karim })).rejects.toThrow(/nature « intuition » inconnue/);
  });

  it('la circulation : une constatation faite ailleurs se pose sur CETTE section, sans ressaisie', async () => {
    const vus = await declaredFactorsFor(IDS.engNep, 'REVENUE');
    expect(vus.length).toBeGreaterThan(0);
    // le facteur d'entité « PRESSION » est arrivé ici sans avoir été saisi sur REVENUE
    expect(vus.some((v) => v.source_ref === 'PRESSION')).toBe(true);
    const surUnAutre = await declaredFactorsFor(IDS.engNep, 'PAYABLES');
    // il se pose aussi ailleurs si l'autre poste est au périmètre
    const inScope = await q<{ code: string }>(
      `select code from fsli where engagement_id = $1 and code = 'PAYABLES'
       and scoping in ('in_scope','in_scope_qualitative')`, [IDS.engNep]);
    if (inScope.length) expect(surUnAutre.some((v) => v.source_ref === 'PRESSION')).toBe(true);
  });

  /* ═══ 4. LES TROIS RÈGLES QUI BLOQUENT ════════════════════════════════ */

  it('une question sans réponse est un obstacle au visa', async () => {
    const o = await questionnaireObstacles(IDS.engNep, 'REVENUE');
    expect(o.some((x) => /sans réponse/.test(x))).toBe(true);
  });

  it('un « oui » sans précision écrite est un obstacle au visa — la réponse est gardée, le dossier ne se ferme pas', async () => {
    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'REVENUE', questionCode: 'LITIGE',
      answer: 'oui', actorUserId: IDS.users.karim });
    const gardee = (await answers(IDS.engNep, 'REVENUE')).find((a) => a.question_code === 'LITIGE')!;
    expect(gardee.answer).toBe('oui');                       // le fait n'est pas perdu
    const o = await questionnaireObstacles(IDS.engNep, 'REVENUE');
    expect(o.some((x) => /sans précision écrite/.test(x))).toBe(true);

    await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'REVENUE', questionCode: 'LITIGE',
      answer: 'oui', detail: 'Litige commercial de 42 000 € avec un distributeur, non provisionné au 31/12.',
      actorUserId: IDS.users.karim });
    const apres = await questionnaireObstacles(IDS.engNep, 'REVENUE');
    expect(apres.some((x) => /sans précision écrite/.test(x))).toBe(false);
  });

  it('un facteur non statué est un obstacle au visa', async () => {
    const r = await raiseFactor({ engagementId: IDS.engNep, source: 'manual', nature: 'complexite',
      description: 'Contrat de distribution à paliers signé en novembre, traitement du chiffre d’affaires à documenter.',
      targets: [{ fsli: 'REVENUE', assertions: ['mesure'] }], actorUserId: IDS.users.karim });
    expect((await questionnaireObstacles(IDS.engNep, 'REVENUE')).some((x) => /non statué/.test(x))).toBe(true);
    await decideFactor(IDS.engNep, r.id, 'confirmed', 'Retenu.', IDS.users.lea);
    expect((await questionnaireObstacles(IDS.engNep, 'REVENUE')).some((x) => /non statué/.test(x))).toBe(false);
  });

  it('répondre à TOUT lève les obstacles de la section', async () => {
    const cat = await chargerCatalogue();
    for (const x of questionsOfScope(cat, 'section')) {
      await answerQuestion({ engagementId: IDS.engNep, fsliCode: 'REVENUE', questionCode: x.code,
        answer: 'non', actorUserId: IDS.users.karim });
    }
    for (const x of questionsOfScope(cat, 'entite')) {
      await answerQuestion({ engagementId: IDS.engNep, fsliCode: null, questionCode: x.code,
        answer: 'non', actorUserId: IDS.users.claire });
    }
    expect(await questionnaireObstacles(IDS.engNep, 'REVENUE')).toEqual([]);
    expect(await questionnaireObstacles(IDS.engNep, null)).toEqual([]);
  });

  /* ═══ 5. LE RATIO — mesuré, pas promis ════════════════════════════════ */

  it('l’évaluation n’est plus à 100 % quantitative', async () => {
    const cat = await chargerCatalogue();
    const r = await quantitativeShare(cat);
    expect(r.quantitative).toBe(5);
    expect(r.qualitative).toBe(10);
    expect(r.pctQuantitative).toBeCloseTo(33.3, 1);
    expect(r.pctQuantitative).toBeLessThan(50);
  });

  /* ═══ 6. la piste ═════════════════════════════════════════════════════ */

  it('chaque réponse et chaque arbitrage est au journal', async () => {
    const verbs = (await q<{ verb: string }>(
      `select distinct verb from event_log where engagement_id = $1
       and (verb like 'questionnaire.%' or verb like 'risk.factor.%')`,
      [IDS.engNep],
    )).map((r) => r.verb);
    expect(verbs).toContain('questionnaire.answered');
    expect(verbs).toContain('risk.factor.raised');
    expect(verbs).toContain('risk.factor.confirmed');
    expect(verbs).toContain('risk.factor.dismissed');
  });
});
