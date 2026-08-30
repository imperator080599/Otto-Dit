import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { draftRevenueWorkpaper } from './draft';
import {
  interpreterTitre, ajouterColonne, confirmerEtRemplir, annulerColonne,
  proposerClarification, colonnesDuPapier, cellulesDuPapier,
} from './colonne';

// LA COLONNE AJOUTÉE (ADR-099). Le piège central se prouve en l'exerçant :
// rien ne se remplit avant la confirmation humaine, un titre illisible ne se
// remplit jamais sur une devinette, et chaque cellule a DEUX issues — la
// donnée avec sa provenance, ou l'introuvable qui PROPOSE une clarification.

describe('colonne ajoutée au tableau de testing', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
  }, 240000);

  it('l\'interprétation est déterministe, et le doute ne propose RIEN', () => {
    expect(interpreterTitre('Date livraison').interpretation)
      .toMatchObject({ champ: 'deliveryDate', docType: 'delivery_note' });
    expect(interpreterTitre('Qté livrée').interpretation)
      .toMatchObject({ champ: 'qtyTotal' });
    expect(interpreterTitre('Montant HT facture').interpretation)
      .toMatchObject({ champ: 'totalNetCents', docType: 'invoice' });
    expect(interpreterTitre('BL signé ?').interpretation).toBeNull();
    /* « date » seul matche facture ET bon de livraison ? Non — les motifs
       exigent le contexte ; « date » nu ne matche rien : doute assumé. */
    expect(interpreterTitre('date').interpretation).toBeNull();
  });

  it('sans justification, pas de colonne : le modèle standard modifié se justifie', async () => {
    await expect(ajouterColonne(IDS.engNep, 'REV-01', 'Date livraison', '  ', IDS.users.karim))
      .rejects.toThrow(/justification/);
  });

  it('RIEN ne se remplit avant la confirmation humaine — c\'est le point central', async () => {
    const col = await ajouterColonne(
      IDS.engNep, 'REV-01', 'Date livraison',
      'Vérifier le cut-off : la date de livraison commande l\'exercice de rattachement.',
      IDS.users.karim,
    );
    expect(col.statut).toBe('proposee');
    expect(col.interpretation?.phrase).toBe('je cherche la date figurant sur le bon de livraison, dans les pièces de type bon de livraison');
    const cellules = await cellulesDuPapier(IDS.engNep, 'REV-01');
    expect(cellules.filter((c) => c.column_id === col.id)).toHaveLength(0);

    /* La confirmation déclenche la recherche — pièces REÇUES seulement, avec
       provenance, deux issues. */
    const res = await confirmerEtRemplir(col.id, IDS.users.lea);
    expect(res.trouvees).toBeGreaterThan(0);
    expect(res.introuvables).toBeGreaterThan(0);
    const remplies = (await cellulesDuPapier(IDS.engNep, 'REV-01')).filter((c) => c.column_id === col.id);
    expect(remplies).toHaveLength(res.trouvees + res.introuvables);
    for (const c of remplies.filter((x) => x.outcome === 'trouvee')) {
      expect(c.valeur).toBeTruthy();
      expect(c.evidence_id).toBeTruthy(); // jamais un chiffre sans provenance (P7)
    }
    /* Et la base refuse une « trouvée » sans pièce. */
    await expect(q(
      `insert into wp_extra_cell (column_id, engagement_id, sample_item_id, outcome, valeur)
       select $1, $2, si.id, 'trouvee', 'x' from sample_item si limit 1`,
      [col.id, IDS.engNep],
    )).rejects.toThrow(/outcome_coherent|unique/);
  });

  it('un titre illisible ne se remplit JAMAIS sur une devinette — confirmer exige un champ', async () => {
    const col = await ajouterColonne(
      IDS.engNep, 'REV-01', 'BL signé ?', 'Contrôle d\'existence : la signature atteste la réception.',
      IDS.users.karim,
    );
    expect(col.interpretation).toBeNull();
    await expect(confirmerEtRemplir(col.id, IDS.users.lea)).rejects.toThrow(/devinette|catalogue/);
    /* CORRIGER : l'humain choisit dans le catalogue fermé — un champ inconnu est refusé. */
    await expect(confirmerEtRemplir(col.id, IDS.users.lea, { champ: 'signature' })).rejects.toThrow(/catalogue|pas un champ/);
    const res = await confirmerEtRemplir(col.id, IDS.users.lea, { champ: 'deliveryNoteNumber' });
    expect(res.trouvees + res.introuvables).toBeGreaterThan(0);
  });

  it('les introuvables PROPOSENT une clarification — brouillon L2, jamais d\'envoi automatique', async () => {
    const cols = await colonnesDuPapier(IDS.engNep, 'REV-01');
    const col = cols.find((c) => c.titre === 'Date livraison')!;
    const { requestId, items } = await proposerClarification(col.id, IDS.users.karim);
    expect(items).toBeGreaterThan(0);
    const req = await q01<{ status: string; title: string }>(
      `select status, title from request where id = $1`, [requestId],
    );
    expect(req!.status).toBe('draft');
    expect(req!.title).toMatch(/Clarification/);
    /* Une seconde proposition sans nouvelle ligne vide est refusée. */
    await expect(proposerClarification(col.id, IDS.users.karim)).rejects.toThrow(/aucune ligne/);
  });

  it('une colonne remplie ne s\'annule plus ; une proposée s\'annule et se voit', async () => {
    const cols = await colonnesDuPapier(IDS.engNep, 'REV-01');
    await expect(annulerColonne(cols[0].id, IDS.users.karim)).rejects.toThrow(/remplie/);
    const col = await ajouterColonne(IDS.engNep, 'REV-01', 'TVA', 'Recoupement arithmétique.', IDS.users.karim);
    await annulerColonne(col.id, IDS.users.karim);
    const apres = await colonnesDuPapier(IDS.engNep, 'REV-01');
    expect(apres.find((c) => c.id === col.id)).toBeUndefined();
    await expect(confirmerEtRemplir(col.id, IDS.users.lea)).rejects.toThrow(/annulée/);
  });
});
