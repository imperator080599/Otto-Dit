import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep, samplingAndRequest, clientDeposits, extractAndVerify } from '@/lib/flows/part1';
import { ajouterColonneGrille, calculerGrille, cellulesDuDossier, conclureLigne, disposerCellule } from './grille';
import { demanderPieceLigne, EVIDENCE_TYPE_INVOICE } from '../requests';

// ÉTAPE 7 — LA COLONNE AJOUTÉE À LA MAIN (mandat du fondateur, Partie B,
// B.3-B.4). Fichier séparé de grille.test.ts : ce dernier tient un dossier
// déjà mutable ligne par ligne (dispositions, conclusions, versions de
// grille) dans un ordre précis — un fichier neuf garde sa propre base en
// mémoire (§7 de CLAUDE.md) et n'entre pas en collision avec cet ordre.
//
// COL-01 : ajouter une colonne sans dire de quelle pièce vient la donnée
// (titre ambigu, titre sans correspondance, doublon). REQ-02 : conclure une
// ligne dont une colonne AJOUTÉE exige une pièce jamais demandée — même
// quand la pièce existe déjà par un autre chemin (le paquet PBC antérieur à
// l'étape 5), preuve que « exister » et « avoir été demandée par ce
// mécanisme » sont deux choses différentes.

describe('colonne ajoutée — COL-01 et REQ-02', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    const requestId = await samplingAndRequest();
    await clientDeposits(requestId);
    await extractAndVerify();
  }, 240000);

  it('COL-01 : un titre qui touche deux entrées du catalogue est refusé, jamais résolu au hasard', async () => {
    await expect(ajouterColonneGrille(IDS.engNep, 'date facture livraison', IDS.users.karim))
      .rejects.toThrow(/COL-01.*plusieurs/);
  });

  it('COL-01 : un titre qui ne touche aucune entrée du catalogue est refusé', async () => {
    await expect(ajouterColonneGrille(IDS.engNep, 'quelque chose sans rapport', IDS.users.karim))
      .rejects.toThrow(/COL-01.*ne dit pas/);
  });

  it('COL-01 : un titre net est accepté, et le même titre une seconde fois est un doublon refusé', async () => {
    const id = await ajouterColonneGrille(IDS.engNep, 'numéro de facture', IDS.users.karim);
    expect(id).toBeTruthy();
    await expect(ajouterColonneGrille(IDS.engNep, 'numéro de facture', IDS.users.karim))
      .rejects.toThrow(/COL-01.*doublon/);
  });

  it("REQ-02 : la ligne ne se conclut pas tant que la pièce de la colonne ajoutée n'a jamais été demandée — puis se conclut une fois la pièce demandée", async () => {
    /* La colonne ajoutée par le test précédent (« numéro de facture » →
       invoiceNumber, invoice) entre dans la grille au prochain calcul. */
    await calculerGrille(IDS.engNep, IDS.users.karim);
    const { grille, cellules } = await cellulesDuDossier(IDS.engNep);
    /* UNE LIGNE PROPRE SUR LE PACK, jamais un index fixe (même précédent que
       pieces-lignes.test.ts, revue hostile du 2026-09-07) : on isole REQ-02
       de TEST-02/TEST-04 en cherchant une ligne dont les colonnes DU PACK
       sont déjà toutes conformes — la colonne AJOUTÉE, elle, n'a jamais
       d'ancre (MOTIF_ANCRE ne connaît que les codes du pack) et reste donc
       « sans ancre » même quand la donnée est présente ; on la couvre par une
       disposition écrite (le mécanisme TEST-04 existant), pour que seul
       REQ-02 reste à observer. */
    const packCodes = new Set(grille!.colonnes.filter((c) => c.origine === 'pack').map((c) => c.code));
    const itemId = Object.entries(cellules).find(([, cs]) => {
      const pack = cs.filter((c) => packCodes.has(c.colonne));
      return pack.length > 0 && pack.every((c) => c.etat === 'conforme');
    })?.[0];
    if (!itemId) throw new Error('aucune ligne propre (pack) trouvée dans le dossier de démonstration — le test ne peut pas isoler REQ-02');
    /* PAR `colonne` (le CODE), jamais par `champ` (le nom du champ relevé) :
       la colonne du pack « num_piece » relève elle aussi « invoiceNumber »
       (table CHAMP, grille.ts) — chercher par `champ` retrouve la cellule
       du PACK, déjà conforme, pas la cellule AJOUTÉE (code 'invoiceNumber')
       que ce test veut observer. Constaté en tournant ce test une première
       fois : il passait pour la mauvaise raison (TEST-04 sur num_piece,
       jamais atteint puisque déjà conforme). */
    const colAjoutee = cellules[itemId].find((c) => c.colonne === 'invoiceNumber');
    expect(colAjoutee).toBeTruthy();
    if (colAjoutee!.etat !== 'conforme') {
      await disposerCellule(IDS.engNep, colAjoutee!.id, IDS.users.karim, 'donnée relevée manuellement, sans ancre — vérifiée (démo, données synthétiques)');
    }

    /* CAS CONNU MAUVAIS (règle 17) : la cellule de la colonne ajoutée est
       maintenant couverte (conforme ou disposée) — TEST-02/TEST-04
       passeraient — et pourtant REQ-02 refuse : la pièce n'a jamais été
       demandée par le mécanisme typé (piecesDemandeesParLigne, étape 5). */
    await expect(conclureLigne(IDS.engNep, itemId, IDS.users.karim)).rejects.toThrow(/REQ-02/);
    await expect(conclureLigne(IDS.engNep, itemId, IDS.users.karim)).rejects.toThrow(/numéro de la facture/);

    /* On retire le défaut : la pièce est demandée. */
    await demanderPieceLigne(itemId, EVIDENCE_TYPE_INVOICE, IDS.users.karim);
    await expect(conclureLigne(IDS.engNep, itemId, IDS.users.karim)).resolves.toBeUndefined();
  });

  it("une colonne ajoutée de type delivery_note obtient une cellule sur TOUTE ligne, même sans bon de livraison déjà demandé à l'ancien format PBC (revue hostile du 2026-09-07, convergée par deux réviseurs)", async () => {
    /* `requiertBl` (calculerGrille) ne gate QUE les colonnes du PACK — sans
       ce filtre, une colonne ajoutée delivery_note n'obtenait AUCUNE
       cellule sur toute ligne sans BL déjà demandé à l'ancien format, un
       manque SILENCIEUX (règle 13). */
    await ajouterColonneGrille(IDS.engNep, 'quantité totale', IDS.users.karim);
    const { lignes: nLignes } = await calculerGrille(IDS.engNep, IDS.users.karim);
    const { cellules } = await cellulesDuDossier(IDS.engNep);
    const avecCelluleQte = Object.values(cellules).filter((cs) => cs.some((c) => c.colonne === 'qtyTotal')).length;
    expect(avecCelluleQte).toBe(nLignes);
  });
});
