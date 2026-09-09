import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, q01, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec } from './imports';
import { computeTbGl, latestTbGl, noteReconciliationLimitation } from './reconciliation';
import { rebuildFslis } from './fsli';
import { propose, validate } from './materiality';
import { proposeRevenueSample, validateSampleParams, drawRevenueSample, currentRevenueSample } from './sampling';
import { generatePbcFromSample, approveSend } from './requests';
import { ingestEvidence } from './evidence';
import { draftRevenueWorkpaper } from './workpapers/draft';
import { signWorkpaper } from './workpapers/lifecycle';
import { lignesAtelier } from './workpapers/atelier';
import { lignesSortiesDuTirage, lignesSuperseesSansRetirage, sortiesNonStatuees, statuerSortie } from './sampling';
import { obstaclesAuVisa, avertissementsAuVisa } from './obstacles';
import { boucle } from './loop';
import { reconcilierDetailRevenueSemeur } from '@/lib/flows/part1';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

/**
 * LE RE-TIRAGE APRÈS UN RÉ-IMPORT (ADR-133 ; mandat du soir et de la nuit J3, étage 1.2).
 *
 * CE QUE CE FICHIER REPRODUIT, ET POURQUOI IL EXISTE. Le parcours cliqué échouait en sept
 * stations de l'atelier — pas de visionneuse, pas de provenance, pas de comparaison, aucune
 * cellule ancrée, aucun delta signé. Sept symptômes, un seul défaut : ré-importer le grand
 * livre définitif recrée chaque écriture avec un NOUVEL identifiant, le re-tirage désigne les
 * mêmes écritures par ces nouveaux identifiants, et tout le travail déjà fait — les demandes
 * envoyées, les pièces déposées par le client — reste accroché aux ANCIENNES lignes, qu'aucun
 * écran n'atteint plus.
 *
 * Le test suit le geste réel d'une fin de mission : tirer, demander, recevoir, puis recevoir
 * le FEC définitif et re-tirer.
 */
describe('le re-tirage ne fait pas disparaître le travail humain', () => {
  let ancien: string;   // l'échantillon du grand livre provisoire
  let nouveau: string;  // celui du grand livre définitif
  let clefsRepondues: string[] = [];
  let clefAvecPiece = '';
  /* MAT-03 (mandat 2026-09-09, §2.4) : comptes AVANT le ré-import du FEC définitif, pour prouver
     — pas supposer — qu'aucune ligne de `sample_item`/`workpaper`/`signoff` ne disparaît. */
  let avantReimport: { sampleItems: number; workpapers: number; signoffs: number };

  beforeAll(async () => {
    await initTestDb();
    const tb = fs.readFileSync(ds('tb_2025.csv'), 'utf8');
    await importTb({
      engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb_2025.csv',
      content: tb, mapping: detectTbMapping(tb.split('\n')[0]), periodKind: 'current',
    });
    await importFec({
      engagementId: IDS.engNep, userId: IDS.users.karim,
      filename: '999888777FEC20251231.txt', bytes: fs.readFileSync(ds('999888777FEC20251231.txt')),
    });
    await computeTbGl(IDS.engNep, IDS.users.karim);
    for (const item of (await latestTbGl(IDS.engNep))!.items) {
      await noteReconciliationLimitation(item.id, IDS.users.karim, {
        explanation: 'Écriture de situation passée après l’extraction du fichier des écritures.',
        alternativeProcedures: 'Rapprochement re-exécuté sur la balance ; à rejouer sur le FEC définitif.',
      });
    }
    await rebuildFslis(IDS.engNep, IDS.users.karim);
    await validate(await propose(IDS.engNep, IDS.users.lea), IDS.users.lea);

    /* 1. LE TIRAGE SUR LE GRAND LIVRE PROVISOIRE, la demande, et la pièce du client. */
    await reconcilierDetailRevenueSemeur(IDS.engNep); // POP-01 : rapprochement requis avant propose
    ancien = await proposeRevenueSample(IDS.engNep, IDS.users.karim);
    await validateSampleParams(ancien, IDS.users.lea);
    await drawRevenueSample(ancien, IDS.users.lea);
    const requestId = await generatePbcFromSample(IDS.engNep, ancien, IDS.users.karim);
    await approveSend(requestId, IDS.users.lea);
    /* Le client répond à TOUT ce qu'on lui a demandé — c'est le cas normal, et
       c'est ce qui rend la perte mesurable : on saura ensuite laquelle de ces
       écritures survit au re-tirage. */
    const items = await q<{ id: string; nk: string }>(
      `select ri.id::text id, g.natural_key nk from request_item ri
       join sample_item si on si.id = ri.sample_item_id
       join gl_entry g on g.id = si.unit_id
       where ri.request_id = $1 and ri.kind = 'document' order by g.natural_key`,
      [requestId]);
    for (const it of items) {
      await ingestEvidence({
        engagementId: IDS.engNep, requestItemId: it.id, filename: `${it.nk}.pdf`,
        mime: 'application/pdf', bytes: Buffer.from(`%PDF-1.4 pièce du client ${it.nk}`),
        source: 'portal', uploadedBy: { kind: 'client_contact', id: null },
      });
    }
    clefsRepondues = items.map((x) => x.nk);

    /* MAT-03 (revue hostile, voix 1, constat 2) : un papier RÉEL, VISÉ, doit exister avant la
       mesure — sinon les assertions "aucun papier/visa ne disparaît" seraient triviales (0 avant,
       0 après, toujours vraies, rien de réellement éprouvé — règle 17). Un seul visa
       (preparer_validator) suffit : ce test ne rejoue pas le cycle de visa complet, seulement sa
       survie au ré-import. */
    const wpAvant = await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
    await signWorkpaper(wpAvant, IDS.users.karim, 'preparer_validator');

    /* MAT-03 : la mesure AVANT, pas une supposition — comptée juste avant le geste qui pourrait
       détruire, sur le même dossier, avant que rien d'autre ne bouge. */
    avantReimport = {
      sampleItems: Number((await q1<{ n: string }>(
        `select count(*) n from sample_item si join sample s on s.id = si.sample_id where s.engagement_id = $1`,
        [IDS.engNep]))!.n),
      workpapers: Number((await q1<{ n: string }>(
        `select count(*) n from workpaper where engagement_id = $1`, [IDS.engNep]))!.n),
      signoffs: Number((await q1<{ n: string }>(
        `select count(*) n from signoff so join workpaper w on w.id = so.workpaper_id where w.engagement_id = $1`,
        [IDS.engNep]))!.n),
    };

    /* 2. LE FEC DÉFINITIF, invalidation confirmée (ADR-016) : chaque écriture est recréée
          avec un NOUVEL identifiant, et l'échantillon passe en `superseded`. */
    await importFec({
      engagementId: IDS.engNep, userId: IDS.users.karim, confirmInvalidation: true,
      filename: '999888777FEC20251231.txt',
      bytes: fs.readFileSync(ds('definitif', '999888777FEC20251231.txt')),
    });

    /* 3. LE RE-TIRAGE. */
    nouveau = await proposeRevenueSample(IDS.engNep, IDS.users.karim);
    await validateSampleParams(nouveau, IDS.users.lea);
    await drawRevenueSample(nouveau, IDS.users.lea);

    /* L'ÉCRITURE QUE LE TEST SUIT : une de celles auxquelles le client a répondu et
       que le nouveau tirage désigne ENCORE. S'il n'y en a aucune, la fixture ne
       reproduit plus rien, et le premier test le dit avant les autres. */
    const commune = await q01<{ nk: string }>(
      `select g.natural_key nk from sample_item si join gl_entry g on g.id = si.unit_id
       where si.sample_id = $1 and g.natural_key = any($2::text[]) order by g.natural_key limit 1`,
      [nouveau, clefsRepondues]);
    clefAvecPiece = commune?.nk ?? '';
  }, 180000);

  it('MAT-03 : le ré-import du FEC définitif ne détruit AUCUNE ligne de tirage, papier ou visa', async () => {
    /* Comparé à la mesure prise juste avant le ré-import (`avantReimport`, ci-dessus) — jamais une
       valeur supposée. Un `<` signalerait une VRAIE destruction (règle 28) ; un `superseded` ou un
       `outdated` sont des UPDATE, jamais une disparition de ligne — le compte ne peut donc que
       monter ou rester stable, jamais descendre. */
    const apres = {
      sampleItems: Number((await q1<{ n: string }>(
        `select count(*) n from sample_item si join sample s on s.id = si.sample_id where s.engagement_id = $1`,
        [IDS.engNep]))!.n),
      workpapers: Number((await q1<{ n: string }>(
        `select count(*) n from workpaper where engagement_id = $1`, [IDS.engNep]))!.n),
      signoffs: Number((await q1<{ n: string }>(
        `select count(*) n from signoff so join workpaper w on w.id = so.workpaper_id where w.engagement_id = $1`,
        [IDS.engNep]))!.n),
    };
    expect(apres.sampleItems, 'aucune ligne de tirage ne doit disparaître').toBeGreaterThanOrEqual(avantReimport.sampleItems);
    expect(apres.workpapers, 'aucun papier ne doit disparaître').toBeGreaterThanOrEqual(avantReimport.workpapers);
    expect(apres.signoffs, 'aucun visa ne doit disparaître').toBeGreaterThanOrEqual(avantReimport.signoffs);
    /* La colonne polymorphe SANS clé étrangère (`sample_item.unit_id`, quand `unit_kind =
       'gl_entry'`) est le seul endroit où un orphelin pourrait apparaître sans qu'une contrainte
       de base ne le refuse — même lecture que `/api/sante` (« MAT-03 »), rejouée ici après un VRAI
       ré-import plutôt que sur un état statique. */
    const orphelins = await q<{ id: string }>(
      `select si.id::text from sample_item si join sample s on s.id = si.sample_id
       where s.engagement_id = $1 and si.unit_kind = 'gl_entry'
         and not exists (select 1 from gl_entry g where g.id = si.unit_id)`,
      [IDS.engNep]);
    expect(orphelins, 'aucune ligne de tirage ne doit pointer une écriture disparue').toEqual([]);
  });

  it('LE CAS CONNU MAUVAIS : les deux tirages désignent les mêmes écritures par des identifiants différents', async () => {
    const r = await q1<{ communes: string; memeid: string }>(
      `with a as (select si.unit_id, g.natural_key k from sample_item si join gl_entry g on g.id = si.unit_id where si.sample_id = $1),
            b as (select si.unit_id, g.natural_key k from sample_item si join gl_entry g on g.id = si.unit_id where si.sample_id = $2)
       select (select count(*) from a join b using (k))::text communes,
              (select count(*) from a join b on a.unit_id = b.unit_id)::text memeid`,
      [ancien, nouveau]);
    expect(Number(r.communes), 'les deux tirages ne partagent aucune écriture : la fixture ne reproduit rien')
      .toBeGreaterThan(0);
    expect(Number(r.memeid), 'le ré-import n’a pas recréé les écritures : la fixture ne reproduit pas le défaut')
      .toBe(0);
    expect(clefAvecPiece, 'aucune écriture répondue par le client ne survit au re-tirage : la fixture ne mesure plus rien')
      .not.toBe('');
  });

  it('la pièce déposée par le client reste ATTEIGNABLE depuis la ligne du nouveau tirage', async () => {
    /* LE DÉFAUT, MOT POUR MOT : 33 pièces mesurées sur le dossier de démonstration portaient
       sur une écriture toujours échantillonnée, et aucun écran ne les atteignait plus. */
    const courant = await currentRevenueSample(IDS.engNep);
    expect(courant!.id).toBe(nouveau);
    const ligne = (await lignesAtelier(IDS.engNep)).lignes
      .find((l) => l.naturalKey === clefAvecPiece);
    expect(ligne, 'l’écriture qui portait la pièce n’est plus au tirage — la fixture a dérivé').toBeDefined();
    expect(ligne!.evidences.length,
      'la pièce du client n’est plus atteignable depuis la ligne : le re-tirage a fait disparaître du travail humain')
      .toBeGreaterThan(0);
  });

  it('la ligne reprise DIT de quelle ligne elle reprend le travail — la provenance ne se devine pas', async () => {
    const r = await q1<{ n: string }>(
      `select count(*)::text n from sample_item si
       join gl_entry g on g.id = si.unit_id
       where si.sample_id = $1 and g.natural_key = $2 and si.repris_de is not null`,
      [nouveau, clefAvecPiece]);
    expect(Number(r.n), 'la ligne ne désigne pas celle qu’elle reprend').toBe(1);
  });

  /* ─── CE QUI SORT DU TIRAGE ────────────────────────────────────────────── */

  it('une ligne sortie du tirage qui porte du travail est LISTÉE, avec ce qu’elle porte', async () => {
    const sorties = await lignesSortiesDuTirage(IDS.engNep);
    expect(sorties.length, 'aucune ligne sortie : le re-tirage n’a rien laissé derrière lui, la règle ne se mesure pas')
      .toBeGreaterThan(0);
    expect(sorties.every((l) => l.travail.pieces + l.travail.ecarts + l.travail.cellules > 0),
      'une ligne SANS travail est listée : la règle ferait du bruit au lieu de dire quelque chose').toBe(true);
  });

  it('FAUX POSITIF — une ligne REPRISE par le tirage courant n’est jamais dite « sortie »', async () => {
    /* Le premier cas de faux positif, et le plus coûteux : la reprise venant
       d'être livrée, une règle écrite trop large compterait comme « sortie »
       toute ligne de l'ancien tirage — y compris les douze que le nouveau
       reprend — et fabriquerait douze obstacles au visa qui n’existent pas. */
    const sorties = await lignesSortiesDuTirage(IDS.engNep);
    const reprises = await q<{ id: string }>(
      `select repris_de::text id from sample_item where sample_id = $1 and repris_de is not null`,
      [nouveau]);
    expect(reprises.length, 'aucune reprise : le test ne prouve rien').toBeGreaterThan(0);
    for (const r of reprises) {
      expect(sorties.some((l) => l.id === r.id),
        'une ligne reprise est comptée comme sortie du tirage').toBe(false);
    }
  });

  it('FAUX POSITIF — une ligne sortie SANS travail ne bloque rien', async () => {
    /* Une ligne que le nouveau tirage ne reprend pas et sur laquelle personne
       n’a rien fait n’est pas une perte : c’est un tirage qui a changé. */
    const sansTravail = await q<{ id: string }>(
      `select si.id::text from sample_item si join sample s on s.id = si.sample_id
        where s.id = $1
          and not exists (select 1 from request_item ri join evidence e on e.request_item_id = ri.id
                           where ri.sample_item_id = si.id)
          and not exists (select 1 from exception x where x.sample_item_id = si.id)
          and not exists (select 1 from test_cell c where c.sample_item_id = si.id)`,
      [ancien]);
    const sorties = await lignesSortiesDuTirage(IDS.engNep);
    for (const l of sansTravail) {
      expect(sorties.some((x) => x.id === l.id),
        'une ligne sans aucun travail est comptée comme une perte').toBe(false);
    }
  });

  it('FAUX POSITIF — sans tirage COURANT, la règle se tait', async () => {
    /* LE CAS QUE MES TROIS FIXTURES N'AVAIENT PAS PRÉVU, et que le parcours de
       bout en bout a trouvé : il importe le grand livre définitif À LA FIN,
       une fois tout le testing fait. Le ré-import supersède la sélection
       (ADR-016) et personne ne re-tire. Sans cette clause, les seize lignes
       travaillées devenaient seize obstacles au visa sur une mission achevée —
       une famille neuve rendant insignable le seul dossier qu'on ouvre. */
    await q(`update sample set status = 'superseded' where id = $1`, [nouveau]);
    expect(await lignesSortiesDuTirage(IDS.engNep),
      'la règle parle alors qu’aucun tirage courant n’existe').toEqual([]);
    await q(`update sample set status = 'drawn' where id = $1`, [nouveau]);
    expect((await lignesSortiesDuTirage(IDS.engNep)).length,
      'la fixture n’a pas été rendue à son état — les tests suivants mesureraient autre chose')
      .toBeGreaterThan(0);
  });

  it('R30, option retenue (Lot 4, tranche 2) — sans tirage courant, le travail accroché à la sélection remplacée est un AVERTISSEMENT, jamais un obstacle', async () => {
    /* Exactement l'état que le test précédent nomme « la règle se tait » —
       mais cette fois on prouve ce que le silence de `lignesSortiesDuTirage`
       cachait vraiment : `lignesSuperseesSansRetirage` (R30, option a) le
       rend visible SANS bloquer, à côté, jamais à la place. */
    await q(`update sample set status = 'superseded' where id = $1`, [nouveau]);
    try {
      const superseedees = await lignesSuperseesSansRetirage(IDS.engNep);
      expect(superseedees.length,
        'aucune ligne remontée : la fixture ne prouve rien, ou R30 (option a) est non corrigée')
        .toBeGreaterThan(0);
      expect(superseedees.every((l) => l.travail.pieces + l.travail.ecarts + l.travail.cellules
        + l.travail.verifs + l.travail.extras > 0),
        'une ligne SANS travail est remontée : la règle ferait du bruit').toBe(true);

      /* REVUE HOSTILE (les deux voix, constat convergent) : l'exclusion
         `repris_de` n'était couverte par AUCUN test — ni le FAUX POSITIF
         (déjà exclu par le scoping procédure), ni cette assertion avant
         elle (seulement `length > 0`). On prouve ici, précisément, qu'une
         ligne de `ancien` REPRISE par `nouveau` (donc son travail reste
         atteignable ailleurs) n'apparaît PAS parmi les lignes remontées,
         même pendant cette fenêtre où `ancien` ET `nouveau` sont tous deux
         `superseded`. */
      const ligneAncienneReprise = await q1<{ id: string }>(
        `select si.id::text id from sample_item si join gl_entry g on g.id = si.unit_id
          where si.sample_id = $1 and g.natural_key = $2`, [ancien, clefAvecPiece]);
      expect(superseedees.some((l) => l.id === ligneAncienneReprise.id),
        'l’exclusion `repris_de` ne fait rien : une ligne reprise, dont le travail reste atteignable '
        + 'ailleurs, est comptée deux fois').toBe(false);

      const avert = await avertissementsAuVisa(IDS.engNep);
      expect(avert.filter((o) => o.famille === 'tirage').length,
        'le travail non re-tiré n’atteint pas l’écran des avertissements').toBeGreaterThan(0);

      const obst = await obstaclesAuVisa(IDS.engNep);
      expect(obst.filter((o) => o.famille === 'tirage').length,
        'R30 (option a) devenue un OBSTACLE — c’est la question de méthode que R30 laisse ouverte, '
        + 'pas cette tranche').toBe(0);

      /* La même chose, par la lecture RÉELLE de /api/sante — le chemin que
         règle 22 exige, pas seulement les fonctions de service. */
      const avantEnv = process.env.OTTO_DEMO_PUBLIC;
      process.env.OTTO_DEMO_PUBLIC = '1';
      try {
        const { GET } = await import('@/app/api/sante/route');
        const res = await GET();
        const body = await res.json();
        const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('travail non re-tiré'));
        expect(lecture, 'la lecture /api/sante n’existe pas').toBeDefined();
        expect(lecture.ok, 'la lecture /api/sante rougit sur un avertissement — jamais un obstacle').toBe(true);
        expect(lecture.detail).toContain('sélection remplacée jamais re-tirée');
      } finally {
        process.env.OTTO_DEMO_PUBLIC = avantEnv;
      }
    } finally {
      await q(`update sample set status = 'drawn' where id = $1`, [nouveau]);
    }
    expect((await lignesSortiesDuTirage(IDS.engNep)).length,
      'la fixture n’a pas été rendue à son état — les tests suivants mesureraient autre chose')
      .toBeGreaterThan(0);
  });

  it('FAUX POSITIF — un tirage courant existant : `lignesSuperseesSansRetirage` se tait, même avec un ancien superseded qui porte du travail', async () => {
    /* Le cas normal de ce fichier entier : `nouveau` EST le tirage courant.
       Le travail de `ancien` (superseded) est repris ou déjà couvert par
       `lignesSortiesDuTirage` — `lignesSuperseesSansRetirage` ne doit RIEN
       en dire de plus, sous peine de compter deux fois le même travail dans
       deux avertissements différents. */
    const superseedees = await lignesSuperseesSansRetirage(IDS.engNep);
    expect(superseedees, 'du travail sur une procédure qui A un tirage courant remonte quand même')
      .toEqual([]);

    /* REVUE HOSTILE (voix 2, constat B) : le test R30 plus haut n'éprouve la
       garde de RECOUPEMENT de `/api/sante` (obstacle ET avertissement à la
       fois) que pendant la fenêtre où `nouveau` est superseded — un état où
       la clause de scoping y est vacueusement satisfaite. C'est ICI, dans
       l'état NORMAL de ce fichier entier (nouveau=drawn), que la garde a
       vraiment quelque chose à refuser si le scoping se casse — donc c'est
       ICI qu'on l'appelle réellement, pas seulement via les fonctions de
       service. */
    const avantEnv = process.env.OTTO_DEMO_PUBLIC;
    process.env.OTTO_DEMO_PUBLIC = '1';
    try {
      const { GET } = await import('@/app/api/sante/route');
      const res = await GET();
      const body = await res.json();
      const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('travail non re-tiré'));
      expect(lecture, 'la lecture /api/sante n’existe pas').toBeDefined();
      expect(lecture.ok, 'la garde de recoupement rougit alors qu’aucun recoupement réel n’existe').toBe(true);
      expect(lecture.detail).toContain('aucune sélection remplacée');
    } finally {
      process.env.OTTO_DEMO_PUBLIC = avantEnv;
    }
  });

  it('la famille « tirage » BLOQUE le visa tant que la ligne n’est pas statuée', async () => {
    const avant = await obstaclesAuVisa(IDS.engNep);
    expect(avant.filter((o) => o.famille === 'tirage').length,
      'une ligne sortie du tirage avec du travail dessus ne bloque pas le visa').toBeGreaterThan(0);
    expect(avant.find((o) => o.famille === 'tirage')!.ou,
      'l’obstacle ne dit pas où l’on va pour le lever').toBe('sampling');
  });

  it('REFUS TIRAGE-03 — statuer sans motif écrit est refusé', async () => {
    const [l] = await sortiesNonStatuees(IDS.engNep);
    await expect(statuerSortie({ sampleItemId: l.id, decision: 'sans_suite', motif: '   ', userId: IDS.users.lea }))
      .rejects.toThrow(/TIRAGE-03/);
  });

  it('REFUS TIRAGE-02 — statuer une ligne qui n’est pas sortie du tirage est refusé', async () => {
    const [ligneCourante] = await q<{ id: string }>(
      `select id::text from sample_item where sample_id = $1 limit 1`, [nouveau]);
    await expect(statuerSortie({
      sampleItemId: ligneCourante.id, decision: 'sans_suite',
      motif: 'motif parfaitement écrit, sur la mauvaise ligne', userId: IDS.users.lea,
    })).rejects.toThrow(/TIRAGE-02/);
  });

  it('FAUX POSITIF — un AUTRE tirage courant dans le dossier ne fait pas ressurgir les reprises', async () => {
    /* CONSTAT 1 DE LA REVUE HOSTILE, mesuré par elle : `courant` valait « le
       dernier échantillon tiré du dossier », sans filtre de procédure. Or un
       test d'efficacité de contrôle (`sox.ts`) insère lui aussi un `sample` en
       statut `drawn` dans le même dossier. S'il était plus récent, la chaîne
       des reprises partait de SES lignes, aucune reprise du chiffre d'affaires
       n'y figurait, et les douze lignes reprises ressurgissaient comme
       « sorties » : quatre sorties devenaient quinze, zéro obstacle en
       devenait treize — sur du travail parfaitement atteignable. */
    const avant = (await lignesSortiesDuTirage(IDS.engNep)).length;
    const proc = await q1<{ id: string }>(
      `insert into procedure_instance (engagement_id, pack_id, template_code, kind, title, params, status)
       select $1, pack_id, 'EPREUVE-AUTRE-PROC', 'control_test', 'Épreuve : une autre procédure', '{}', 'planned'
         from procedure_instance where engagement_id = $1 limit 1
       returning id::text`, [IDS.engNep]);
    const autre = await q1<{ id: string }>(
      `insert into sample (engagement_id, procedure_id, method, seed, params, rationale, status,
                           population_size, population_amount, population_hash)
       values ($1, $2, 'attribute_frequency', 'epreuve', '{}', 'épreuve', 'drawn', 0, 0, 'epreuve')
       returning id::text`, [IDS.engNep, proc.id]);
    try {
      expect((await lignesSortiesDuTirage(IDS.engNep)).length,
        'un échantillon d’une AUTRE procédure fait ressurgir les lignes reprises').toBe(avant);
    } finally {
      await q(`delete from sample where id = $1`, [autre.id]);
      await q(`delete from procedure_instance where id = $1`, [proc.id]);
    }
  });

  it('REFUS TIRAGE-04 — récrire une décision déjà prise est refusé, en nommant qui l’avait prise', async () => {
    /* CONSTAT 7 DE LA REVUE HOSTILE : la seconde décision écrasait la
       première en silence ; celle de Léa ne survivait que dans le journal, et
       l’écran ne montrait que la dernière. « Une décision qu’on ne peut plus
       revoir », règle 13. */
    const [l] = await sortiesNonStatuees(IDS.engNep);
    await statuerSortie({
      sampleItemId: l.id, decision: 'sans_suite', userId: IDS.users.lea,
      motif: 'Première décision, écrite et datée.',
    });
    await expect(statuerSortie({
      sampleItemId: l.id, decision: 'sans_suite', userId: IDS.users.karim,
      motif: 'Seconde décision, contraire à la première.',
    })).rejects.toThrow(/TIRAGE-04.*Léa Moreau/s);
  });

  it('la GRILLE DE TEST voit la même pièce que l’atelier — deux lectures, une seule vérité', async () => {
    /* CONSTAT 2 DE LA REVUE HOSTILE, dans sa forme la plus coûteuse : un seul
       chemin de lecture suivait la chaîne. L’atelier trouvait deux pièces sur
       la ligne reprise pendant que la grille n’en trouvait AUCUNE — donc
       toutes ses cellules « absente », aucun delta signé, aucune ancre. Deux
       fonctions de production, le même objet, deux réponses contraires : pire
       que le défaut d’origine, parce que l’une des deux rassure. */
    const ligne = (await lignesAtelier(IDS.engNep)).lignes.find((l) => l.naturalKey === clefAvecPiece)!;
    expect(ligne.evidences.length, 'la fixture a dérivé : l’atelier ne voit plus la pièce').toBeGreaterThan(0);
    const vueParLaGrille = await q1<{ n: string }>(
      `with recursive lignage(id) as (
         select $1::uuid
         union
         select si.repris_de from sample_item si join lignage l on l.id = si.id where si.repris_de is not null
       )
       select count(*)::text n from evidence e
        join request_item ri on ri.id = e.request_item_id
        where ri.sample_item_id in (select id from lignage) and e.quarantined = false`,
      [ligne.sampleItemId]);
    expect(Number(vueParLaGrille.n), 'le lignage n’est pas emprunté par la même requête que la grille')
      .toBe(ligne.evidences.length);
  });

  it('statuée par écrit, la ligne garde son travail, dit qui a décidé, et l’obstacle tombe', async () => {
    const toutes = (await lignesSortiesDuTirage(IDS.engNep)).length;
    const avant = await sortiesNonStatuees(IDS.engNep);
    expect(avant.length, 'plus rien à statuer : le test ne mesure rien').toBeGreaterThan(0);
    for (const l of avant) {
      await statuerSortie({
        sampleItemId: l.id, decision: 'sans_suite', userId: IDS.users.lea,
        motif: 'Écriture absente du grand livre définitif : la pièce reçue reste au dossier, '
          + 'la ligne n’est plus au périmètre du tirage.',
      });
    }
    const apres = await lignesSortiesDuTirage(IDS.engNep);
    expect(apres.length, 'une ligne statuée a disparu de la vue — le travail se perdrait à nouveau')
      .toBe(toutes);
    expect(apres.every((l) => l.decision !== null && l.decision.qui !== '' && l.decision.motif !== ''),
      'la décision ne dit pas qui, ni pourquoi').toBe(true);
    expect(apres.every((l) => l.travail.pieces + l.travail.ecarts + l.travail.cellules > 0),
      'le travail porté par la ligne a disparu').toBe(true);
    expect((await obstaclesAuVisa(IDS.engNep)).filter((o) => o.famille === 'tirage').length,
      'l’obstacle subsiste alors que tout est statué').toBe(0);
  });

  it('LA BOUCLE ne redemande pas au client une pièce qu’il a déjà envoyée', async () => {
    /* CONSTAT 6 DE LA REVUE HOSTILE, et la cause du dernier obstacle qui
       empêchait le dossier de démonstration de se clore : la boucle comptait
       les `request_item` du seul tirage courant. Après le re-tirage, elle
       annonçait dix-sept lignes « en attente du client » dont les pièces
       étaient déjà au dossier — un obstacle au visa fabriqué, et un écran qui
       pousse à redemander ce qu'on a déjà. */
    const b = await boucle(IDS.engNep, 'REVENUE');
    const depot = b.etapes.find((e) => e.code === 'depot');
    expect(depot, 'l’étape « dépôt » n’existe pas : le test lirait un champ absent').toBeDefined();
    /* CE QUE LE TEST COMPARE, ET POURQUOI IL LE CALCULE PLUTÔT QUE DE LE
       SUPPOSER : « au moins autant que de reprises » serait faux — une ligne
       reprise dont la demande n'appelait aucun document ne porte pas de pièce.
       On compte donc en base les reprises qui en portent VRAIMENT une, et
       l'étape du dépôt doit toutes les avoir franchies. Sans le lignage, ce
       compte valait zéro. */
    const avecPiece = Number((await q<{ n: string }>(
      `select count(distinct n.id)::text n from sample_item n
        join request_item ri on ri.sample_item_id = n.repris_de
        join evidence e on e.request_item_id = ri.id and e.quarantined = false
       where n.sample_id = $1 and n.repris_de is not null`, [nouveau]))[0].n);
    expect(avecPiece, 'aucune ligne reprise ne porte de pièce : le test ne prouve rien').toBeGreaterThan(0);
    expect(depot!.franchi, 'les pièces des lignes reprises ne franchissent pas l’étape du dépôt')
      .toBeGreaterThanOrEqual(avecPiece);
  });

  /* ─── R34 (Lot 4, tranche 2) — DEUX cas connus mauvais, EN DERNIER dans ce
     fichier : chacun plante une ligne synthétique qui reste dans la base pour
     le reste de l'exécution (voir chaque test), donc placée après tout ce qui
     mesure des comptes précis plus haut. */

  it('R34, CAS CONNU MAUVAIS — une ligne dont le SEUL travail est une vérification en aveugle (verification_check) est désormais comptée', async () => {
    /* Avant ce correctif, le prédicat de « travail » ne connaissait que
       pieces/ecarts/cellules — une ligne sortie du tirage ne portant qu'une
       re-exécution en aveugle sortait du tirage SANS UN MOT (aucun obstacle,
       aucune ligne listée), exactement le manque que R34 nommait. Dans cette
       fixture, toute ligne de l'ancien tirage porte déjà une pièce (le client
       répond à tout, en amont) : aucune ligne « sans travail » n'existe
       naturellement pour isoler le cas. On en PLANTE une, synthétique, sur un
       `gl_entry` réel du dossier — comme « un AUTRE tirage courant » le fait
       plus haut pour une autre garde. PAS DE NETTOYAGE EN FIN DE TEST :
       `verification_check` est APPEND-ONLY (déclencheur `verification_check_
       append_only`, 0003_infra.sql — la même discipline que `event_log`,
       règle 3), et `sample_item` ne peut donc plus être effacée non plus (la
       clé étrangère la retient) — la ligne synthétique reste, pour de vrai,
       exactement comme le ferait une vraie vérification. C'est pourquoi ce
       test est le DERNIER de ce describe : rien après lui ne mesure un compte
       qu'il pourrait fausser. */
    const gl = await q1<{ id: string }>(
      `select unit_id::text id from sample_item where sample_id = $1 limit 1`, [ancien]);
    const proc = await q1<{ id: string }>(`select procedure_id::text id from sample where id = $1`, [ancien]);
    const candidat = await q1<{ id: string }>(
      `insert into sample_item (sample_id, unit_kind, unit_id, selection_reason, amount, status)
       values ($1, 'gl_entry', $2, 'random', 0, 'pending') returning id::text id`,
      [ancien, gl.id]);

    const avant = await lignesSortiesDuTirage(IDS.engNep);
    expect(avant.some((l) => l.id === candidat.id),
      'la ligne plantée porte déjà du travail avant toute vérification — le test ne prouverait rien de neuf')
      .toBe(false);

    await q(
      `insert into verification_check (engagement_id, procedure_id, sample_item_id, verifier_id, result)
       values ($1, $2, $3, $4, 'agree')`,
      [IDS.engNep, proc.id, candidat.id, IDS.users.lea]);

    const apres = await lignesSortiesDuTirage(IDS.engNep);
    const ligne = apres.find((l) => l.id === candidat.id);
    expect(ligne, 'R34 non corrigé : la ligne porte une vérification et reste absente, sans un mot').toBeDefined();
    expect(ligne!.travail.verifs).toBe(1);
  });

  it('R34, CAS CONNU MAUVAIS — une ligne dont le SEUL travail est une colonne ajoutée remplie (wp_extra_cell) est désormais comptée', async () => {
    /* Même défaut, seconde table nommée par R34. `wp_extra_cell` n'est PAS
       append-only : celle-ci se nettoie en fin de test. */
    const gl = await q1<{ id: string }>(
      `select unit_id::text id from sample_item where sample_id = $1 limit 1`, [ancien]);
    const candidat = await q1<{ id: string }>(
      `insert into sample_item (sample_id, unit_kind, unit_id, selection_reason, amount, status)
       values ($1, 'gl_entry', $2, 'random', 0, 'pending') returning id::text id`,
      [ancien, gl.id]);
    const col = await q1<{ id: string }>(
      `insert into wp_extra_column (engagement_id, workpaper_code, titre, justification, created_by)
       values ($1, 'EPREUVE-R34', 'R34 — colonne d’épreuve', 'Colonne d’épreuve pour le cas connu mauvais R34.', $2)
       returning id::text id`,
      [IDS.engNep, IDS.users.karim]);

    try {
      const avant = await lignesSortiesDuTirage(IDS.engNep);
      expect(avant.some((l) => l.id === candidat.id),
        'la ligne plantée porte déjà du travail avant toute cellule ajoutée — le test ne prouverait rien de neuf')
        .toBe(false);

      /* `outcome='introuvable'` : la contrainte `wp_extra_cell_outcome_coherent`
         exige `valeur`+`evidence_id` non nuls pour `trouvee` — introuvable
         reste un genre de travail réel (une recherche a eu lieu, sans pièce à
         charge), donc un candidat légitime pour ce cas connu mauvais. */
      await q(
        `insert into wp_extra_cell (column_id, engagement_id, sample_item_id, outcome)
         values ($1, $2, $3, 'introuvable')`,
        [col.id, IDS.engNep, candidat.id]);

      const apres = await lignesSortiesDuTirage(IDS.engNep);
      const ligne = apres.find((l) => l.id === candidat.id);
      expect(ligne, 'R34 non corrigé : la ligne porte une colonne ajoutée remplie et reste absente, sans un mot')
        .toBeDefined();
      expect(ligne!.travail.extras).toBe(1);
    } finally {
      await q(`delete from wp_extra_cell where sample_item_id = $1`, [candidat.id]);
      await q(`delete from wp_extra_column where id = $1`, [col.id]);
      await q(`delete from sample_item where id = $1`, [candidat.id]);
    }
  });
});
