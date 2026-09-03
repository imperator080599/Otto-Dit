import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, repoRoot } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { detectTbMapping, importTb, importFec } from './imports';
import { computeTbGl, latestTbGl, noteReconciliationLimitation } from './reconciliation';
import { rebuildFslis, proposeScoping } from './fsli';
import { propose, validate } from './materiality';
import { assessFsli, risksFor, overrideLevel, requiredProcedures } from './risk';
import { programmeDuDossier, planifierProcedure, redigerPapierDeProcedure } from './programme';
import { signWorkpaper } from './workpapers/lifecycle';
import { catalogueDeLaMission } from '@/lib/methodology/depot';

const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);

/**
 * LE PROGRAMME DE TRAVAIL, VU D'UN ÉCRAN (mandat du soir et de la nuit J3,
 * étage 1.1).
 *
 * CE QUE CES CAS EXISTENT POUR ATTRAPER. Les services de planification vivaient
 * depuis des semaines sans qu'aucun écran ne les appelle : ils étaient donc
 * « verts » sans que personne ne puisse s'en servir. Ici, on emprunte le chemin
 * de l'écran — la même fonction de lecture, les mêmes services d'action — et on
 * vérifie ce que l'auditeur verra, y compris quand le risque change d'avis.
 */
describe('le programme de travail', () => {
  const POSTE = 'REVENUE';

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
    /* LE PÉRIMÈTRE EST PROPOSÉ PAR LE SERVICE, jamais posé en SQL : le
       programme de travail ne connaît que les postes RETENUS, et un poste
       retenu à la main dans la fixture ne prouverait pas que le chemin réel y
       mène. */
    await proposeScoping(IDS.engNep, IDS.users.karim);
    await assessFsli(IDS.engNep, POSTE, IDS.users.karim);
  }, 180000);

  it('LE CAS CONNU MAUVAIS DE DÉPART : le risque commande des procédures, et AUCUNE n’est planifiée', async () => {
    /* C'est l'état exact dans lequel le dossier vivait avant cette nuit : une
       liste de procédures « commandées » que rien ne rendait planifiables. */
    const poste = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE);
    expect(poste, 'le poste n’est pas au programme : la fixture ne mesure rien').toBeDefined();
    expect(poste!.risqueEvalue).toBe(true);
    expect(poste!.commandees.length, 'le risque ne commande aucune procédure : rien à planifier')
      .toBeGreaterThan(0);
    expect(poste!.commandees.every((l) => l.planifiee === null),
      'une procédure est déjà planifiée : la fixture ne part pas de zéro').toBe(true);
  });

  it('planifier depuis l’écran fait apparaître la procédure comme planifiée, sans papier', async () => {
    const poste = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!;
    const cible = poste.commandees[0];
    await planifierProcedure({
      engagementId: IDS.engNep, fsliCode: POSTE, code: cible.code, userId: IDS.users.karim,
    });
    const apres = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!;
    const ligne = apres.commandees.find((l) => l.code === cible.code)!;
    expect(ligne.planifiee, 'la procédure planifiée n’apparaît pas comme telle').not.toBeNull();
    expect(ligne.planifiee!.papier, 'un papier existe alors que personne ne l’a rédigé').toBeNull();
    expect(ligne.planifiee!.vise, 'une procédure neuve est annoncée visée').toBe(false);
  });

  it('rédiger le papier depuis l’écran le rattache à la procédure, en version 1', async () => {
    const poste = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!;
    const ligne = poste.commandees.find((l) => l.planifiee !== null)!;
    await redigerPapierDeProcedure({ procedureId: ligne.planifiee!.id, userId: IDS.users.karim });
    const apres = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!;
    const relue = apres.commandees.find((l) => l.code === ligne.code)!;
    expect(relue.planifiee!.papier, 'le papier rédigé n’est pas atteignable depuis le programme').not.toBeNull();
    expect(relue.planifiee!.papier!.version).toBe(1);
  });

  it('REFUS PROG-02 — planifier une procédure que la méthode n’applique pas à ce poste', async () => {
    /* LE PREMIER JET DE CE TEST NE PROUVAIT RIEN : il prenait la première
       procédure commandée sur le chiffre d'affaires et tentait de la planifier
       sur un autre poste. Or presque toutes les procédures de cette méthode
       sont TRANSVERSES (`cycle: "*"`) : la méthode les applique partout, et le
       refus attendu n'existait pas. On choisit donc une procédure d'un AUTRE
       cycle — celle-là, la méthode ne l'applique pas au chiffre d'affaires. */
    const cat = await catalogueDeLaMission(IDS.engNep);
    const dUnAutreCycle = cat.procedures.find((p) => p.cycle !== '*' && p.cycle !== 'CA');
    expect(dUnAutreCycle, 'aucune procédure d’un autre cycle : le refus ne peut pas être emprunté')
      .toBeDefined();
    await expect(planifierProcedure({
      engagementId: IDS.engNep, fsliCode: POSTE, code: dUnAutreCycle!.code, userId: IDS.users.karim,
    })).rejects.toThrow(/PROG-02/);
  });

  it('REFUS PROG-01 — planifier une procédure absente du catalogue de la méthode', async () => {
    await expect(planifierProcedure({
      engagementId: IDS.engNep, fsliCode: POSTE, code: 'PROCEDURE-QUI-N-EXISTE-PAS',
      userId: IDS.users.karim,
    })).rejects.toThrow(/PROG-01/);
  });

  it('LE CAS QUE L’ÉCRAN EXISTE POUR MONTRER : le risque baisse, la procédure sort des requises — et le travail RESTE VISIBLE', async () => {
    /* LA RÈGLE, LA MÊME QU'AU RE-TIRAGE (ADR-133) : un recalcul ne fait pas
       disparaître du travail humain en silence. Baisser un niveau d'assertion
       retire une procédure de la liste des requises ; si l'écran s'arrêtait là,
       le papier déjà rédigé dessous sortirait de la vue sans qu'aucune personne
       ne l'ait décidé. */
    /* LE NIVEAU LE PLUS BAS VIENT DE LA MÉTHODE, jamais d'un tri alphabétique :
       « eleve » précède « faible » dans l'alphabet, et le premier jet de ce
       test descendait donc les assertions au niveau le plus HAUT en croyant
       faire l'inverse. L'échelle du cabinet est ordonnée du plus faible au plus
       élevé, et c'est elle qui répond. */
    const cat = await catalogueDeLaMission(IDS.engNep);
    const plusBas = cat.risque.niveaux[0];

    /* ET LA PROCÉDURE CHOISIE DOIT POUVOIR SORTIR. Le premier jet prenait la
       première planifiée : c'était DETAIL, dont le minimum est le niveau le
       plus bas — elle reste requise quoi qu'il arrive, et le cas ne se jouait
       pas. On choisit une procédure dont la méthode exige STRICTEMENT plus que
       le plancher. */
    /* ET IL FAUT D'ABORD QU'UNE TELLE PROCÉDURE SOIT COMMANDÉE. Sur ce dossier,
       toutes les assertions sont évaluées au plancher : seules les procédures
       de minimum « plancher » sont requises, et aucune ne peut donc SORTIR.
       Le geste qui rend le cas réel est celui d'un auditeur : MONTER une
       assertion avec un motif écrit — ce que l'écran du risque offre — puis la
       redescendre. On monte donc l'assertion d'une procédure que la méthode
       exige au-dessus du plancher. */
    const cible = cat.procedures.find((pr) => pr.risque_minimum !== plusBas
      && (pr.cycle === '*' || pr.cycle === 'CA'));
    expect(cible, 'la méthode n’a aucune procédure exigeant plus que le plancher : le cas ne se joue pas')
      .toBeDefined();
    const plusHaut = cat.risque.niveaux[cat.risque.niveaux.length - 1];
    await overrideLevel(IDS.engNep, POSTE, cible!.assertion, plusHaut,
      'Épreuve : l’auditeur monte cette assertion, ce que l’écran du risque lui offre de faire.',
      IDS.users.lea);

    const avant = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!;
    const sortable = avant.commandees.find((l) => l.code === cible!.code);
    expect(sortable, 'la procédure n’entre pas dans les requises après la montée du risque')
      .toBeDefined();
    await planifierProcedure({
      engagementId: IDS.engNep, fsliCode: POSTE, code: sortable!.code, userId: IDS.users.karim,
    });
    const replanifiee = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!
      .commandees.find((l) => l.code === sortable!.code)!;
    await redigerPapierDeProcedure({ procedureId: replanifiee.planifiee!.id, userId: IDS.users.karim });
    const planifiee = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!
      .commandees.find((l) => l.code === sortable!.code)!;
    expect(planifiee.planifiee?.papier, 'le papier n’a pas été rédigé : le cas ne se joue pas').toBeTruthy();

    await overrideLevel(IDS.engNep, POSTE, planifiee.assertion, plusBas,
      'Épreuve : l’assertion est ramenée au niveau le plus bas de l’échelle du cabinet.',
      IDS.users.lea);

    const apres = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!;
    const requisesApres = (await requiredProcedures(IDS.engNep, POSTE)).map((r) => r.procedure.code);
    if (requisesApres.includes(planifiee.code)) {
      /* LE CAS NE S'EST PAS JOUÉ, ET LE TEST LE DIT AU LIEU DE PASSER. Sur ce
         millésime de méthode, cette procédure reste requise même au niveau le
         plus bas : la fixture ne prouve rien, et un test vert ici serait un
         silence lu comme un succès (règle 13). */
      throw new Error(
        `la procédure « ${planifiee.code} » reste requise au niveau « ${plusBas} » : `
        + 'la fixture n’exerce pas la sortie des requises — à réécrire, pas à ignorer');
    }
    const sortie = apres.horsCommande.find((l) => l.code === planifiee.code);
    expect(sortie, 'la procédure sortie des requises a DISPARU de l’écran avec son papier').toBeDefined();
    expect(sortie!.planifiee?.papier, 'le papier rédigé n’est plus atteignable').toBeTruthy();
  });

  it('REFUS PROG-06 — dépasser un papier VISÉ sans motif écrit, et l’écran le SAIT avant de l’offrir', async () => {
    /* LA RÈGLE QUE CET ÉCRAN MET EN AVANT, et que la revue hostile a trouvée
       éprouvée par AUCUN harnais livré (constat 2). Deux choses se vérifient
       ici, et la seconde est celle qui compte : le refus existe, ET la vue le
       sait — sinon l'écran offre un geste dont il ignore qu'il sera refusé, ou
       réclame un motif dont personne n'a besoin. */
    const poste = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!;
    const avecPapier = poste.commandees.find((l) => l.planifiee?.papier)!;
    expect(avecPapier, 'aucun papier rédigé : le cas ne se joue pas').toBeDefined();
    expect(avecPapier.planifiee!.vise, 'le papier est déjà annoncé visé avant tout visa').toBe(false);

    await signWorkpaper(avecPapier.planifiee!.papier!.id, IDS.users.karim, 'preparer_validator');

    const apres = (await programmeDuDossier(IDS.engNep)).find((p) => p.code === POSTE)!
      .commandees.find((l) => l.code === avecPapier.code)!;
    expect(apres.planifiee!.vise,
      'la vue ignore que le papier est visé : l’écran n’offrira pas le champ de motif, et le geste sera refusé sans qu’on sache pourquoi')
      .toBe(true);

    await expect(redigerPapierDeProcedure({
      procedureId: apres.planifiee!.id, userId: IDS.users.karim,
    })).rejects.toThrow(/PROG-06/);

    /* AVEC LE MOTIF, la version nouvelle passe — et périme les visas, ce qui
       est précisément ce que le motif documente. */
    const v2 = await redigerPapierDeProcedure({
      procedureId: apres.planifiee!.id, userId: IDS.users.karim,
      motif: 'La méthode a changé de version : le papier est repris sur le gabarit courant.',
    });
    expect(v2.version).toBe(2);
  });
});
