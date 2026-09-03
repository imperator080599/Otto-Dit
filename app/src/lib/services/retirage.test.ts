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
import { lignesAtelier } from './workpapers/atelier';
import { lignesSortiesDuTirage, sortiesNonStatuees, statuerSortie } from './sampling';
import { obstaclesAuVisa } from './obstacles';
import { boucle } from './loop';

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
});
