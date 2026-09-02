import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep, samplingAndRequest, clientDeposits, extractAndVerify } from '@/lib/flows/part1';
import { currentRevenueSample } from '../sampling';
import { getAssurancePack } from '@/lib/packs';
import {
  calculerCellule, calculerGrille, cellulesDuDossier, colonnesCommandees, conclureLigne, disposerCellule,
  figerGrille, grilleDuDossier, lignesNonConclues, type ColonneGrille, type PieceLue,
} from './grille';
import { obstaclesLignes, avertissementsAuVisa, obstaclesAuVisa } from '../obstacles';
import type { ElementTexte } from './ancres';

// L'ATELIER DE TEST — LA GRILLE (W1). Deux étages :
//   1. le calcul d'UNE cellule, pur, sur des fixtures APPARIÉES (le cas qui
//      doit passer et le cas qui doit être refusé, côte à côte — règle 17) ;
//   2. le dossier de démonstration entier : la grille figée, les cellules de
//      chaque ligne, les refus TEST-02/03/04 par le service, la conclusion, la
//      péremption, l'avertissement au visa qui n'est PAS un obstacle.
// Aucun compte littéral : les propriétés se lisent sur l'inventaire (règle du
// mandat).

const TOL = getAssurancePack('nep-fr').substantive!.tolerances;
const PERIODE = { debut: '2025-01-01', fin: '2025-12-31' };

function colonne(code: string, extra: Partial<ColonneGrille> = {}): ColonneGrille {
  return {
    code, libelle: code, type: 'montant', document: 'invoice', reference: code, tolerance: 'x', toleranceSource: 'test',
    identite: code === 'tiers' || code === 'num_piece', ...extra,
  };
}

function piece(fields: Record<string, string>, docType = 'invoice'): PieceLue {
  return {
    evidenceId: '00000000-0000-4000-8000-0000000000e1', extractionId: '00000000-0000-4000-8000-0000000000x1',
    storagePath: 'nulle-part', docType, fields: Object.entries(fields).map(([name, value]) => ({ name, value, confidence: 1, page: 1 })),
  };
}

/** La couche texte d'une facture fictive : chaque libellé sur sa ligne. */
const ELEMENTS: ElementTexte[] = [
  { str: 'Numero : VE-2025-0101', x: 50, y: 740, w: 120, h: 11 },
  { str: 'Date : 15/06/2025', x: 50, y: 724, w: 100, h: 10 },
  { str: 'Client : Nordbrise Distribution SAS', x: 50, y: 708, w: 180, h: 10 },
  { str: 'Total HT : 10 040,00 EUR', x: 50, y: 600, w: 130, h: 11 },
];
const avecAncres = async () => ELEMENTS;
const sansAncres = async () => [] as ElementTexte[];

const GL = { montantCents: 1000000, dateEcriture: '2025-06-15', pieceRef: 'VE-2025-0101', tiers: 'Nordbrise Distribution SAS' };

describe('grille — une cellule, calculée sur des fixtures appariées', () => {
  it('montant à 0,4 % : DANS la tolérance (0,5 %), verte, delta signé imprimé, ancrée', async () => {
    const c = await calculerCellule({
      colonne: colonne('montant_ht'), gl: GL, periode: PERIODE, piece: piece({ totalNetCents: '1004000' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(c.etat).toBe('conforme');
    expect(c.delta).toBe(4000);
    expect(c.unite).toBe('cents');
    expect(c.page).toBe(1);
    expect(c.rect).not.toBeNull();
  });

  it('CAS APPARIÉ — montant à 0,6 % : hors tolérance, delta signé +, ancrée quand même', async () => {
    const c = await calculerCellule({
      colonne: colonne('montant_ht'), gl: GL, periode: PERIODE, piece: piece({ totalNetCents: '1006000' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(c.etat).toBe('hors_tolerance');
    expect(c.delta).toBe(6000);
    expect(c.rect).not.toBeNull();
  });

  it('un montant en dessous imprime un delta NÉGATIF — jamais une valeur absolue', async () => {
    const c = await calculerCellule({
      colonne: colonne('montant_ht'), gl: GL, periode: PERIODE, piece: piece({ totalNetCents: '999950' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(c.etat).toBe('conforme');
    expect(c.delta).toBe(-50);
  });

  it('TEST-01 au calcul — la valeur concorde mais la pièce ne la montre nulle part : « sans ancre », jamais verte', async () => {
    const c = await calculerCellule({
      colonne: colonne('montant_ht'), gl: GL, periode: PERIODE, piece: piece({ totalNetCents: '1000000' }),
      qteFacturee: undefined, tol: TOL, elements: sansAncres,
    });
    expect(c.etat).toBe('sans_ancre');
    expect(c.delta).toBe(0);
    expect(c.rect).toBeNull();
  });

  it('un champ non relevé : « absent », delta nul, l’attendu quand même écrit', async () => {
    const c = await calculerCellule({
      colonne: colonne('montant_ht'), gl: GL, periode: PERIODE, piece: piece({ invoiceNumber: 'VE-2025-0101' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(c.etat).toBe('absent');
    expect(c.delta).toBeNull();
    expect(c.attendu).toBe('1000000');
  });

  it('tiers : le MAUVAIS client rend la preuve non recevable ; le bon client (casse, forme juridique) est conforme', async () => {
    const mauvais = await calculerCellule({
      colonne: colonne('tiers'), gl: GL, periode: PERIODE, piece: piece({ buyerName: 'Sudvent Négoce SARL' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(mauvais.etat).toBe('non_recevable');
    expect(mauvais.delta).toBeNull();
    expect(mauvais.unite).toBe('identite');
    const bon = await calculerCellule({
      colonne: colonne('tiers'), gl: GL, periode: PERIODE, piece: piece({ buyerName: 'NORDBRISE DISTRIBUTION' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(bon.etat).toBe('conforme');
    expect(bon.delta).toBe(0);
  });

  it('numéro de pièce : l’identité se compare sans les espaces ni les tirets, et un autre numéro n’est pas recevable', async () => {
    const bon = await calculerCellule({
      colonne: colonne('num_piece'), gl: GL, periode: PERIODE, piece: piece({ invoiceNumber: 've 2025 0101' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(bon.etat).toBe('conforme');
    const autre = await calculerCellule({
      colonne: colonne('num_piece'), gl: GL, periode: PERIODE, piece: piece({ invoiceNumber: 'VE-2025-0102' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(autre.etat).toBe('non_recevable');
  });

  it('date de pièce : dans l’exercice = 0 j ; après la clôture = +n j ; avant l’ouverture = −n j', async () => {
    const dans = await calculerCellule({ colonne: colonne('date_piece'), gl: GL, periode: PERIODE, piece: piece({ invoiceDate: '2025-06-15' }), qteFacturee: undefined, tol: TOL, elements: avecAncres });
    expect(dans.etat).toBe('conforme');
    expect(dans.delta).toBe(0);
    const apres = await calculerCellule({ colonne: colonne('date_piece'), gl: GL, periode: PERIODE, piece: piece({ invoiceDate: '2026-01-06' }), qteFacturee: undefined, tol: TOL, elements: avecAncres });
    expect(apres.etat).toBe('hors_tolerance');
    expect(apres.delta).toBe(6);
    const avant = await calculerCellule({ colonne: colonne('date_piece'), gl: GL, periode: PERIODE, piece: piece({ invoiceDate: '2024-12-30' }), qteFacturee: undefined, tol: TOL, elements: avecAncres });
    expect(avant.delta).toBe(-2);
  });

  it('quantité livrée : 238 livrées pour 260 facturées = −22, hors tolérance (± 0)', async () => {
    const c = await calculerCellule({
      colonne: colonne('qte_livree', { document: 'delivery_note' }), gl: GL, periode: PERIODE,
      piece: piece({ qtyTotal: '238' }), qteFacturee: 260, tol: TOL,
      elements: async () => [{ str: 'Quantite totale livree : 238', x: 50, y: 500, w: 150, h: 11 }],
    });
    expect(c.etat).toBe('hors_tolerance');
    expect(c.delta).toBe(-22);
    expect(c.unite).toBe('units');
  });

  it('CAS APPARIÉ — un AVOIR du même montant n’appuie pas une vente : la comparaison est signée', async () => {
    const avoir = await calculerCellule({
      colonne: colonne('montant_ht'), gl: GL, periode: PERIODE, piece: piece({ totalNetCents: '1000000' }, 'credit_note'),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(avoir.etat).toBe('hors_tolerance');
    expect(avoir.delta).toBe(-2000000);
    /* Et un avoir appuie bien un débit de 709 (montant négatif au grand livre). */
    const bon = await calculerCellule({
      colonne: colonne('montant_ht'), gl: { ...GL, montantCents: -1000000 }, periode: PERIODE, piece: piece({ totalNetCents: '1000000' }, 'credit_note'),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(bon.etat).toBe('conforme');
    expect(bon.delta).toBe(0);
  });

  it('CAS APPARIÉ — un tiers vide ou trop court sur la pièce n’est jamais « contenu » dans le client du grand livre', async () => {
    for (const buyerName of ['SAS', 'S.A.', 'Nord']) {
      const c = await calculerCellule({
        colonne: colonne('tiers'), gl: GL, periode: PERIODE, piece: piece({ buyerName }),
        qteFacturee: undefined, tol: TOL, elements: avecAncres,
      });
      expect(c.etat, buyerName).not.toBe('conforme');
    }
  });

  it('CAS APPARIÉ — une date qui n’est pas ISO n’est pas comparée : « absente », la valeur gardée, jamais un NaN', async () => {
    const c = await calculerCellule({
      colonne: colonne('date_piece'), gl: GL, periode: PERIODE, piece: piece({ invoiceDate: '15/06/2025' }),
      qteFacturee: undefined, tol: TOL, elements: avecAncres,
    });
    expect(c.etat).toBe('absent');
    expect(c.delta).toBeNull();
    expect(c.trouve).toBe('15/06/2025');
  });

  it('l’ancre se cherche sur la PAGE du champ relevé, pas toujours la première', async () => {
    const pages: number[] = [];
    const c = await calculerCellule({
      colonne: colonne('montant_ht'), gl: GL, periode: PERIODE,
      piece: { ...piece({}), fields: [{ name: 'totalNetCents', value: '1000000', confidence: 1, page: 2 }] },
      qteFacturee: undefined, tol: TOL, elements: async (_p, page) => { pages.push(page); return ELEMENTS; },
    });
    expect(pages).toEqual([2]);
    expect(c.page).toBe(2);
  });

  it('sans pièce : chaque cellule est « absente », aucune n’est verte', async () => {
    for (const code of ['montant_ht', 'date_piece', 'tiers', 'num_piece']) {
      const c = await calculerCellule({ colonne: colonne(code), gl: GL, periode: PERIODE, piece: null, qteFacturee: undefined, tol: TOL, elements: avecAncres });
      expect(c.etat, code).toBe('absent');
      expect(c.evidenceId).toBeNull();
    }
  });
});

describe('grille — le dossier de démonstration entier', () => {
  let lignes: Awaited<ReturnType<typeof cellulesDuDossier>>['cellules'];
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    const requestId = await samplingAndRequest();
    await clientDeposits(requestId);
    await extractAndVerify();
  }, 240000);

  it('la grille se fige depuis la méthode et le pack : les colonnes du cycle CA, une empreinte, version 1 — et se refige à l’identique', async () => {
    const commandees = await colonnesCommandees(IDS.engNep);
    const g = await figerGrille(IDS.engNep, IDS.users.karim);
    expect(g.version).toBe(1);
    expect(g.colonnes.map((c) => c.code)).toEqual(commandees.colonnes.map((c) => c.code));
    expect(g.colonnes.some((c) => c.identite)).toBe(true);
    expect(g.colonnes.filter((c) => c.document === 'invoice').length).toBeGreaterThan(0);
    /* Les colonnes sont du CONTENU (méthode + pack), pas des libellés d'écran :
       la même grille se refige sans version neuve. */
    const encore = await figerGrille(IDS.engNep, IDS.users.karim);
    expect(encore.id).toBe(g.id);
    expect(await grilleDuDossier(IDS.engNep)).toMatchObject({ version: 1, empreinte: g.empreinte });
  });

  it('le calcul pose une cellule par ligne et par colonne applicable ; toute cellule verte porte une ancre ; toute comparaison imprime un delta signé', async () => {
    const r = await calculerGrille(IDS.engNep, IDS.users.karim);
    const sample = (await currentRevenueSample(IDS.engNep))!;
    expect(r.lignes).toBe(sample.items.length);
    const lu = await cellulesDuDossier(IDS.engNep);
    lignes = lu.cellules;
    const toutes = Object.values(lignes).flat();
    expect(toutes.length).toBe(r.cellules);
    expect(toutes.length).toBeGreaterThan(sample.items.length);
    for (const c of toutes) {
      if (c.etat === 'conforme') {
        expect(c.page, `${c.colonne} conforme sans page`).not.toBeNull();
        expect(c.rect, `${c.colonne} conforme sans rectangle`).not.toBeNull();
        expect(c.evidenceId).not.toBeNull();
      }
      if (c.etat === 'conforme' || c.etat === 'hors_tolerance' || c.etat === 'sans_ancre') {
        expect(c.delta, `${c.colonne} ${c.etat} sans delta`).not.toBeNull();
        expect(c.delta!, `${c.colonne} : delta non signé « ${c.delta} »`).toMatch(/^(\+|−|0)/);
      }
      if (c.etat === 'non_recevable') expect(c.identite).toBe(true);
    }
    /* Le jeu synthétique porte des anomalies : au moins une cellule hors
       tolérance existe, et son delta est signé. */
    const hors = toutes.filter((c) => c.etat === 'hors_tolerance');
    expect(hors.length).toBeGreaterThan(0);
    expect(hors.every((c) => /^[+−]/.test(c.delta!))).toBe(true);
    /* Et les lignes propres du jeu : au moins une ligne dont le montant est
       conforme avec un delta de 0 — imprimé, pas omis. */
    expect(toutes.some((c) => c.colonne === 'montant_ht' && c.etat === 'conforme' && c.deltaBrut === 0)).toBe(true);
  });

  it('le recalcul est idempotent : mêmes cellules (identité conservée), mêmes états', async () => {
    const avant = Object.values(lignes).flat().map((c) => [c.id, c.etat, c.deltaBrut]).sort();
    await calculerGrille(IDS.engNep, IDS.users.karim);
    const apres = Object.values((await cellulesDuDossier(IDS.engNep)).cellules).flat().map((c) => [c.id, c.etat, c.deltaBrut]).sort();
    expect(apres).toEqual(avant);
  });

  it('TEST-03 — disposer sans motif est refusé par le service, en nommant la cellule', async () => {
    const c = Object.values(lignes).flat().find((x) => x.etat === 'hors_tolerance' || x.etat === 'absent')!;
    await expect(disposerCellule(IDS.engNep, c.id, IDS.users.karim, '   ')).rejects.toThrow(/TEST-03/);
    await expect(disposerCellule(IDS.engNep, c.id, IDS.users.karim, '   ')).rejects.toThrow(new RegExp(c.colonne));
    /* Et une cellule d'un AUTRE dossier ne se dispose pas depuis celui-ci (revue hostile). */
    await expect(disposerCellule(IDS.engNepN1, c.id, IDS.users.karim, 'motif')).rejects.toThrow(/inconnue sur ce dossier/);
  });

  it('TEST-04 — conclure une ligne dont une cellule n’est pas conforme, sans disposition, est refusé en nommant l’attribut', async () => {
    const [itemId, cells] = Object.entries(lignes).find(([, cs]) => cs.some((x) => x.etat === 'hors_tolerance') && !cs.some((x) => x.etat === 'non_recevable'))!;
    const ouverte = cells.find((x) => x.etat !== 'conforme')!;
    await expect(conclureLigne(IDS.engNep, itemId, IDS.users.karim)).rejects.toThrow(/TEST-04/);
    await expect(conclureLigne(IDS.engNep, itemId, IDS.users.karim)).rejects.toThrow(new RegExp(ouverte.libelle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('TEST-02 — un attribut d’identité qui diverge ne se dispose pas et ne se conclut pas (fixture : le tiers d’une ligne est réécrit)', async () => {
    const [itemId, cells] = Object.entries(lignes).find(([, cs]) => cs.some((x) => x.colonne === 'tiers' && x.etat === 'conforme'))!;
    const tiers = cells.find((x) => x.colonne === 'tiers')!;
    await q(`update test_cell set state = 'non_recevable', delta_signed = null, found = 'Sudvent Négoce SARL (fictif)' where id = $1`, [tiers.id]);
    await expect(disposerCellule(IDS.engNep, tiers.id, IDS.users.karim, 'on force')).rejects.toThrow(/TEST-02/);
    await expect(conclureLigne(IDS.engNep, itemId, IDS.users.karim)).rejects.toThrow(/TEST-02.*Client facturé/);
    /* La garde en base refuse aussi, sans passer par le service (registre G-14). */
    const g = (await grilleDuDossier(IDS.engNep))!;
    await expect(q(
      `insert into test_line_conclusion (engagement_id, grid_id, sample_item_id, cells_hash, concluded_by) values ($1,$2,$3,'x',$4)`,
      [IDS.engNep, g.id, itemId, IDS.users.karim])).rejects.toThrow(/TEST-02/);
    /* CAS APPARIÉ : le recalcul remet la cellule d'aplomb (la pièce n'a pas changé), et la ligne redevient concluable. */
    await calculerGrille(IDS.engNep, IDS.users.karim);
    const relu = (await cellulesDuDossier(IDS.engNep)).cellules[itemId].find((x) => x.colonne === 'tiers')!;
    expect(relu.etat).toBe('conforme');
  });

  it('la disposition écrite lève TEST-04 ; la conclusion se pose ; une cellule qui change ensuite la rend PÉRIMÉE', async () => {
    const lu = await cellulesDuDossier(IDS.engNep);
    const [itemId, cells] = Object.entries(lu.cellules).find(([, cs]) => cs.some((x) => x.etat !== 'conforme') && !cs.some((x) => x.etat === 'non_recevable'))!;
    for (const c of cells.filter((x) => x.etat !== 'conforme')) {
      await disposerCellule(IDS.engNep, c.id, IDS.users.karim, `Écart vu et accepté sur pièce (démo, données synthétiques) — ${c.colonne}.`);
    }
    await conclureLigne(IDS.engNep, itemId, IDS.users.karim);
    let concl = (await cellulesDuDossier(IDS.engNep)).conclusions[itemId];
    expect(concl).toBeTruthy();
    expect(concl.perimee).toBe(false);
    /* Le journal porte la conclusion et la disposition (provenance). */
    const ev = await q<{ verb: string }>(`select verb from event_log where engagement_id = $1 and verb in ('test_line_concluded','test_cell_dispositioned','test_grid_frozen','test_grid_computed')`, [IDS.engNep]);
    expect(new Set(ev.map((e) => e.verb))).toEqual(new Set(['test_line_concluded', 'test_cell_dispositioned', 'test_grid_frozen', 'test_grid_computed']));
    /* Une cellule qui change après coup : la conclusion ne ment pas, elle se dit périmée. */
    const c0 = cells[0];
    await q(`update test_cell set delta_signed = coalesce(delta_signed, 0) + 1 where id = $1`, [c0.id]);
    concl = (await cellulesDuDossier(IDS.engNep)).conclusions[itemId];
    expect(concl.perimee).toBe(true);
    await q(`update test_cell set delta_signed = delta_signed - 1 where id = $1`, [c0.id]);
    /* ET UNE DISPOSITION NE COUVRE QUE LA VALEUR QU'ELLE A DISPOSÉE : la
       cellule disposée qui change de delta redevient « à disposer », le
       service ET la base refusent de conclure (revue hostile du jour). */
    const disposee = cells.find((x) => x.etat !== 'conforme')!;
    const deltaOrigine = (await q1<{ d: string | null }>(`select delta_signed::text d from test_cell where id = $1`, [disposee.id])).d;
    await q(`update test_cell set delta_signed = coalesce(delta_signed, 0) + 5000000 where id = $1`, [disposee.id]);
    const relue = (await cellulesDuDossier(IDS.engNep)).cellules[itemId].find((x) => x.id === disposee.id)!;
    expect(relue.disposition).toBeNull();
    expect(relue.dispositionPerimee).not.toBeNull();
    await expect(conclureLigne(IDS.engNep, itemId, IDS.users.karim)).rejects.toThrow(/TEST-04.*autre valeur/);
    const g = (await grilleDuDossier(IDS.engNep))!;
    await expect(q(`update test_line_conclusion set cells_hash = 'x' where sample_item_id = $1 and grid_id = $2`, [itemId, g.id])).rejects.toThrow(/TEST-04/);
    /* Remise à la valeur d'origine (qui peut être NULL — une cellule absente) : la disposition couvre de nouveau. */
    await q(`update test_cell set delta_signed = $2 where id = $1`, [disposee.id, deltaOrigine]);
    expect((await cellulesDuDossier(IDS.engNep)).cellules[itemId].find((x) => x.id === disposee.id)!.disposition).not.toBeNull();
  });

  it('famille unsupported_sample_items : un AVERTISSEMENT (drapeau nep-fr à off), jamais un obstacle — et la fixture appariée d’un dossier sain ne le déclenche pas', async () => {
    const l = await lignesNonConclues(IDS.engNep);
    expect(l.total).toBeGreaterThan(0);
    expect(l.nonConclues).toBeGreaterThan(0);
    const motifs = await obstaclesLignes(IDS.engNep);
    expect(motifs.some((m) => m.cle === 'obst.lignesNonConclues')).toBe(true);
    const avert = await avertissementsAuVisa(IDS.engNep);
    expect(avert.some((a) => a.motif.cle === 'obst.lignesNonConclues')).toBe(true);
    const obst = await obstaclesAuVisa(IDS.engNep);
    expect(obst.some((o) => o.motif.cle === 'obst.lignesNonConclues')).toBe(false);
    /* Le dossier N-1 n'a pas d'échantillon : aucun avertissement — la famille
       ne crie pas sur un dossier qui n'a rien à conclure. */
    expect(await lignesNonConclues(IDS.engNepN1)).toEqual({ total: 0, nonConclues: 0, perimees: 0 });
    expect(await avertissementsAuVisa(IDS.engNepN1)).toEqual([]);
  });

  it('rien ne s’écrit dans l’atelier d’un dossier scellé (garde de verrou 0003 sur les quatre tables)', async () => {
    const g = (await grilleDuDossier(IDS.engNep))!;
    const avant = await q1<{ status: string }>(`select status from engagement where id = $1`, [IDS.engNep]);
    await q(`update engagement set status = 'locked' where id = $1`, [IDS.engNep]);
    try {
      await expect(q1(`insert into test_grid (engagement_id, pack_id, version, columns, columns_hash) values ($1,'nep-fr',99,'[{"code":"x"}]'::jsonb,'x') returning id`, [IDS.engNep]))
        .rejects.toThrow(/locked/);
      await expect(q(`update test_cell set computed_at = now() where grid_id = $1`, [g.id])).rejects.toThrow(/locked/);
      await expect(conclureLigne(IDS.engNep, Object.keys(lignes)[0], IDS.users.karim)).rejects.toThrow(/scellé/);
    } finally {
      await q(`update engagement set status = $2 where id = $1`, [IDS.engNep, avant.status]);
    }
  });
});
