import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { q, q1 } from '@/lib/db/client';
import { detecterBasculesMaterialite, basculesMaterialite, frameworkSet, fsliAccounts } from './fsli';
import { EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT } from './requests';
import { numToCents, centsToNum } from '@/lib/util/num';

// LA BASCULE DE MATÉRIALITÉ (mandat 2026-09-09, §2.1) — « voir si on a loupé du testing ».
//
// LE CAS QUI COMPTE N'EST PAS CELUI QUE `proposeScoping` CORRIGE DÉJÀ SEUL. `bootstrapNep`
// confirme CHAQUE poste hors chiffre d'affaires en `ns_confirmed` (part1.ts) — une décision
// HUMAINE que `proposeScoping` ne touchera plus jamais (D9). C'est exactement le poste dont ce
// test simule le solde qui grossit après un nouvel import — le cas que `detecterBasculesMaterialite`
// existe pour attraper, puisque rien d'autre dans le produit ne le corrige de lui-même.
//
// §2.3 : la fixture pose son propre `coa_map_rule` en SQL DIRECT plutôt que par
// `addMappingOverride` (fsli.ts) — trouvé par ce test lui-même, pas deviné : `addMappingOverride`
// termine par un `rebuildFslis`, qui RÉINITIALISE le `scoping` de tout FSLI sans `confirmed_by` à
// `unscoped` (fsli.ts, `proposeScoping`/`rebuildFslis`). REVENUE, `in_scope` mais JAMAIS confirmé
// par un humain dans `bootstrapNep` (part1.ts ne le boucle pas — il reste la seule variable du
// jeu), redevenait alors un candidat, basculait lui aussi sur le MÊME import, et la ligne
// supplémentaire faisait échouer le nettoyage du test (contrainte de clé étrangère sur
// `import_file`). Poser le `coa_map_rule` sans rebuild évite l'effet de bord entièrement.

describe('bascule de matérialité (mandat §2.1)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
  }, 120000);

  it('un poste CONFIRMÉ non matériel dont le solde dépasse la matérialité de travail se flague — CTRL comme les autres, jamais deux fois', async () => {
    const poste = (await q1<{ id: string; code: string; scoping: string; confirmed_by: string | null }>(
      `select id, code, scoping, confirmed_by from fsli
       where engagement_id = $1 and scoping = 'ns_confirmed' and confirmed_by is not null limit 1`,
      [IDS.engNep],
    ));
    expect(poste.confirmed_by, 'bootstrapNep confirme des postes ns_confirmed — sinon ce test n’a rien à éprouver').toBeTruthy();

    const mat = (await q1<{ perf_amount: string }>(
      `select perf_amount::text from materiality where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
      [IDS.engNep],
    ));
    /* SIMULE UN NOUVEL IMPORT : le solde du poste, déjà confirmé non matériel, grossit au-delà
       de la matérialité de travail — comme un client qui a eu une grosse année sur un poste
       jusque-là petit. `detecterBasculesMaterialite` ne rejoue pas l'import lui-même (couvert par
       imports.test.ts ailleurs) : il lit l'état `fsli` tel qu'un import l'aurait laissé. */
    await q(`update fsli set balance = $2 where id = $1`, [poste.id, Number(mat.perf_amount) * 2]);

    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-bascule.csv', 'sonde-sha', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));

    const posees = await detecterBasculesMaterialite(IDS.engNep, fichier.id, IDS.users.karim);
    expect(posees.map((b) => b.fsliCode)).toContain(poste.code);

    /* §2.2 (mandat 2026-09-09) : LA MÊME DÉTECTION OUVRE LA SECTION. `poste.scoping` reste
       `ns_confirmed` (D9 — jamais touché ici) donc `postesRetenus` ne l'inclut toujours pas ;
       sans ce geste, `assurerSections` ne lui créerait jamais de `section_state` et le drapeau
       resterait invisible du tableau de bord (règle 13). */
    const section = (await q1<{ id: string; label: string }>(
      `select id::text, label from section_state where engagement_id = $1 and kind = 'poste' and ref = $2`,
      [IDS.engNep, poste.code],
    ));
    expect(section, 'la bascule doit avoir ouvert la section du poste').toBeDefined();

    const liste = await basculesMaterialite(IDS.engNep);
    const ligne = liste.find((b) => b.fsliCode === poste.code);
    expect(ligne).toBeDefined();
    expect(ligne!.importFilename).toBe('sonde-bascule.csv');
    /* Aucune procédure n'a jamais été planifiée pour ce poste (hors chiffre d'affaires, jamais
       retenu au périmètre) — « ce qui n'a pas été testé » est donc tout, honnêtement compté. */
    expect(Number(ligne!.procedureCount)).toBe(0);

    /* CAS CONNU MAUVAIS PROTECTEUR (règle 17) : un second appel (un ré-import ultérieur) ne
       pose PAS une seconde ligne — le premier import qui a franchi le seuil garde le dossier. */
    const rejoue = await detecterBasculesMaterialite(IDS.engNep, fichier.id, IDS.users.karim);
    expect(rejoue.map((b) => b.fsliCode)).not.toContain(poste.code);
    const compte = (await q1<{ n: string }>(
      `select count(*) n from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`,
      [IDS.engNep, poste.code],
    ));
    expect(Number(compte.n)).toBe(1);
  });

  it('cas connu mauvais (règle 17) : un poste SYSTÈME (jamais confirmé), sous le seuil, ne se flague pas', async () => {
    /* FIXTURE CONSTRUITE, PAS UN ÉTAT ACCIDENTEL DU MONDE DE DÉMONSTRATION (revue hostile, deux
       voix indépendantes, même constat) : la première version cherchait un FSLI système déjà
       présent dans le monde `bootstrapNep` — après cette même tranche, `bootstrapNep` confirme
       TOUS les postes non-CA en `ns_confirmed` (part1.ts), donc `confirmed_by is null` n'y existe
       plus jamais pour un poste non-CA. Le test se déclarait « rien à éprouver » à chaque run —
       la protection qu'il prétendait garder n'a jamais tourné une seule fois (règle 17 : un
       détecteur qui n'a jamais échoué exprès n'a jamais été testé). Posé ici directement, sous
       le seuil, système, pour que le cas existe à coup sûr. */
    const code = 'SONDE-SYSTEME-SOUS-SEUIL';
    await q(
      `insert into fsli (engagement_id, code, name, statement, balance, scoping)
       values ($1, $2, 'Poste de sonde, système, sous le seuil', 'BS', 100, 'ns_proposed')`,
      [IDS.engNep, code],
    );
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-bascule-neg.csv', 'sonde-sha-2', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    try {
      const posees = await detecterBasculesMaterialite(IDS.engNep, fichier.id, IDS.users.karim);
      expect(posees.map((b) => b.fsliCode)).not.toContain(code);
      const compte = (await q1<{ n: string }>(
        `select count(*) n from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`,
        [IDS.engNep, code],
      ));
      expect(Number(compte.n)).toBe(0);
      /* §2.2 : sous le seuil, aucune bascule → aucune section ouverte non plus (le geste est
         attaché à la détection, pas à la simple candidature). */
      const section = await q1<{ n: string }>(
        `select count(*)::text n from section_state where engagement_id = $1 and kind = 'poste' and ref = $2`,
        [IDS.engNep, code],
      );
      expect(Number(section!.n)).toBe(0);
    } finally {
      await q(`delete from fsli where engagement_id = $1 and code = $2`, [IDS.engNep, code]);
    }
  });

  it('sans matérialité validée : aucune erreur, aucune bascule (rien à comparer)', async () => {
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-sans-mat.csv', 'sonde-sha-3', 'validated', 1) returning id::text`,
      [IDS.engSox],
    ));
    await expect(detecterBasculesMaterialite(IDS.engSox, fichier.id, IDS.users.karim)).resolves.toEqual([]);
  });

  /** Pose un `coa_map_rule` SANS passer par `addMappingOverride` (voir le commentaire d'en-tête du
   *  fichier) : ce test n'a besoin que de la règle, pas du `rebuildFslis` qu'`addMappingOverride`
   *  déclenche derrière — celui-ci réinitialiserait `REVENUE` (jamais confirmé par un humain dans
   *  `bootstrapNep`) et le ferait rebasculer sur le même import, hors du périmètre de ce test. */
  async function poserRegleDeSonde(prefix: string, fsliCode: string): Promise<void> {
    const fs = await frameworkSet(IDS.engNep);
    await q(
      `insert into coa_map_rule (pack_id, engagement_id, account_prefix, fsli_code, priority) values ($1,$2,$3,$4,$5)`,
      [fs.accounting_map, IDS.engNep, prefix, fsliCode, 1000 + prefix.length],
    );
  }

  it('§2.3 : la même détection crée la demande de détail, FILTRÉE au-dessus du CTT (pas tout le poste)', async () => {
    /* Poste dédié à CE test, jamais déjà basculé (indépendant de l'ordre d'exécution des tests
       précédents dans ce fichier) — voir le test §2.1 ci-dessus pour la même précaution. */
    const poste = (await q1<{ code: string }>(
      `select f.code from fsli f
       where f.engagement_id = $1 and f.scoping = 'ns_confirmed'
         and not exists (select 1 from fsli_materiality_bascule b where b.engagement_id = f.engagement_id and b.fsli_code = f.code)
       limit 1`,
      [IDS.engNep],
    ));
    const mat = (await q1<{ perf_amount: string; ctt_amount: string }>(
      `select perf_amount::text, ctt_amount::text from materiality
       where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
      [IDS.engNep],
    ));
    const cttCents = numToCents(mat.ctt_amount);
    expect(cttCents, 'le CTT validé doit être positif — sinon ce test ne distingue rien').toBeGreaterThan(0);

    const snap = (await q1<{ id: string }>(
      `select id::text from tb_snapshot where engagement_id = $1 and period_kind = 'current' and status = 'active'`,
      [IDS.engNep],
    ));
    /* PRÉFIXE DE SONDE, jamais un vrai préfixe du plan comptable — n'entre en collision avec
       AUCUN compte réel du monde de démonstration. */
    const prefix = 'SONDECTT';
    await poserRegleDeSonde(prefix, poste.code);
    const auDessus = centsToNum(cttCents + 10000); // CTT + 100 € — sans ambiguïté au-dessus
    const sousLe = centsToNum(Math.max(1, Math.floor(cttCents / 2))); // strictement sous le CTT
    await q(
      `insert into account (tb_snapshot_id, number, label, debit, credit, balance) values
         ($1, 'SONDECTT01', 'Sonde au-dessus du CTT', $2, 0, $2),
         ($1, 'SONDECTT02', 'Sonde sous le CTT', $3, 0, $3)`,
      [snap.id, auDessus, sousLe],
    );
    await q(`update fsli set balance = $2 where engagement_id = $1 and code = $3`,
      [IDS.engNep, centsToNum(numToCents(mat.perf_amount) * 2), poste.code]);
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-ctt.csv', 'sonde-sha-ctt', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    try {
      const posees = await detecterBasculesMaterialite(IDS.engNep, fichier.id, IDS.users.karim);
      /* GARDE-FOU DU TEST LUI-MÊME : cette détection ne doit flaguer QUE le poste choisi — sinon
         le nettoyage ci-dessous (ciblé sur `poste.code`) laisserait une ligne orpheline référençant
         `fichier.id` et le `delete from import_file` final échouerait (contrainte de clé
         étrangère). Si ce test échoue ICI, la cause est ailleurs (un autre poste a basculé), pas
         dans le filtre CTT que ce test vise. */
      expect(posees.map((b) => b.fsliCode)).toEqual([poste.code]);

      const req = (await q1<{ id: string }>(
        `select id::text from request where engagement_id = $1 and fsli_code = $2 and evidence_type_code = $3
         order by seq_no desc limit 1`,
        [IDS.engNep, poste.code, EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT],
      ));
      expect(req, 'la bascule doit avoir créé une demande de détail').toBeDefined();
      const item = (await q1<{ description: string }>(
        `select description from request_item where request_id = $1 limit 1`,
        [req!.id],
      ));
      /* LE CAS CONNU MAUVAIS PROTECTEUR (règle 17) EST ICI : un filtre absent ou cassé
         inclurait TOUT le poste (comme `demanderDetailDeCompte`, Partie B) — la présence seule de
         SONDECTT01 ne le prouverait pas, seule l'ABSENCE de SONDECTT02 le prouve. */
      expect(item!.description).toContain('SONDECTT01');
      expect(item!.description).not.toContain('SONDECTT02');
    } finally {
      await q(`delete from request_item where request_id in (select id from request where engagement_id = $1 and fsli_code = $2 and evidence_type_code = $3)`,
        [IDS.engNep, poste.code, EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT]);
      await q(`delete from request where engagement_id = $1 and fsli_code = $2 and evidence_type_code = $3`,
        [IDS.engNep, poste.code, EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT]);
      await q(`delete from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`, [IDS.engNep, poste.code]);
      await q(`delete from section_state where engagement_id = $1 and kind = 'poste' and ref = $2`, [IDS.engNep, poste.code]);
      await q(`delete from account where tb_snapshot_id = $1 and number like 'SONDECTT%'`, [snap.id]);
      await q(`delete from coa_map_rule where engagement_id = $1 and account_prefix = $2`, [IDS.engNep, prefix]);
      await q(`delete from import_file where id = $1`, [fichier.id]);
    }
  });

  it('§2.3 : aucun compte au-dessus du CTT → aucune demande créée (pas une erreur)', async () => {
    const poste = (await q1<{ code: string }>(
      `select f.code from fsli f
       where f.engagement_id = $1 and f.scoping = 'ns_confirmed'
         and not exists (select 1 from fsli_materiality_bascule b where b.engagement_id = f.engagement_id and b.fsli_code = f.code)
       limit 1`,
      [IDS.engNep],
    ));
    const mat = (await q1<{ perf_amount: string; ctt_amount: string }>(
      `select perf_amount::text, ctt_amount::text from materiality
       where engagement_id = $1 and status = 'validated' order by version desc limit 1`,
      [IDS.engNep],
    ));
    const cttCents = numToCents(mat.ctt_amount);
    const snap = (await q1<{ id: string }>(
      `select id::text from tb_snapshot where engagement_id = $1 and period_kind = 'current' and status = 'active'`,
      [IDS.engNep],
    ));
    const prefix = 'SONDECTB'; // préfixe distinct du test précédent — aucune collision de compte
    /* CE TEST VEUT UN POSTE SANS AUCUN COMPTE AU-DESSUS DU CTT, et un poste réel du monde de
       démonstration peut très bien EN AVOIR déjà (trouvé par ce test lui-même : le premier
       essai laissait les comptes réels de l'import en place et la demande se créait quand même,
       à raison — CTT = 1 800 €, bien en dessous de beaucoup de comptes réels du jeu synthétique).
       Les comptes réels de CE poste sont donc retirés d'abord — seuls les comptes de sonde,
       CONTRÔLÉS ci-dessous, décident du résultat. */
    const reels = await fsliAccounts(IDS.engNep, poste.code);
    if (reels.length) {
      await q(`delete from account where tb_snapshot_id = $1 and number = any($2)`,
        [snap.id, reels.map((c) => c.number)]);
    }
    await poserRegleDeSonde(prefix, poste.code);
    /* Beaucoup de PETITS comptes, chacun sous le CTT, dont la SOMME dépasse quand même la
       matérialité de travail (le cas nommé par le commentaire d'en-tête de
       `detecterBasculesMaterialite` : un poste peut basculer par somme de petits comptes). */
    const petit = centsToNum(Math.max(1, Math.floor(cttCents / 2)));
    await q(
      `insert into account (tb_snapshot_id, number, label, debit, credit, balance) values
         ($1, 'SONDECTB01', 'Petit compte 1', $2, 0, $2),
         ($1, 'SONDECTB02', 'Petit compte 2', $2, 0, $2)`,
      [snap.id, petit],
    );
    await q(`update fsli set balance = $2 where engagement_id = $1 and code = $3`,
      [IDS.engNep, centsToNum(numToCents(mat.perf_amount) * 2), poste.code]);
    const fichier = (await q1<{ id: string }>(
      `insert into import_file (engagement_id, kind, filename, sha256, status, row_count)
       values ($1, 'tb', 'sonde-ctt-vide.csv', 'sonde-sha-ctt-vide', 'validated', 1) returning id::text`,
      [IDS.engNep],
    ));
    try {
      const posees = await detecterBasculesMaterialite(IDS.engNep, fichier.id, IDS.users.karim);
      expect(posees.map((b) => b.fsliCode)).toEqual([poste.code]); // le poste bascule quand même…
      const req = await q1<{ n: string }>(
        `select count(*)::text n from request where engagement_id = $1 and fsli_code = $2 and evidence_type_code = $3`,
        [IDS.engNep, poste.code, EVIDENCE_TYPE_DETAIL_DE_COMPTE_CTT],
      );
      expect(Number(req!.n), '…mais aucun compte n’étant au-dessus du CTT, aucune demande').toBe(0);
    } finally {
      await q(`delete from fsli_materiality_bascule where engagement_id = $1 and fsli_code = $2`, [IDS.engNep, poste.code]);
      await q(`delete from section_state where engagement_id = $1 and kind = 'poste' and ref = $2`, [IDS.engNep, poste.code]);
      await q(`delete from account where tb_snapshot_id = $1 and number like 'SONDECTB%'`, [snap.id]);
      await q(`delete from coa_map_rule where engagement_id = $1 and account_prefix = $2`, [IDS.engNep, prefix]);
      await q(`delete from import_file where id = $1`, [fichier.id]);
    }
  });
});
