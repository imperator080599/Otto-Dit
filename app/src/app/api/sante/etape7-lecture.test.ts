import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { bootstrapNep, samplingAndRequest, clientDeposits, extractAndVerify } from '@/lib/flows/part1';
import { q } from '@/lib/db/client';
import { ajouterColonneGrille, calculerGrille, cellulesDuDossier, disposerCellule } from '@/lib/services/testing/grille';
import { demanderPieceLigne, EVIDENCE_TYPE_INVOICE } from '@/lib/services/requests';
import { GET } from './route';

// Étape 7 (plan d'autonomie, Partie B) — LA LECTURE « aucune ligne conclue
// sans pièce demandée pour ses colonnes ajoutées » DE /api/sante, cas connu
// mauvais (règle 17) : preuve rejouable (règle 12) qu'elle rougit bien sur
// une ligne conclue dont une colonne ajoutée n'a jamais eu sa pièce demandée
// — chose que `conclureLigne` (grille.ts, REQ-02) ne produit jamais
// elle-même. Atteint ici par un contournement DIRECT de la base (comme
// l'en-tête de la lecture le documente) : les déclencheurs TEST-02/TEST-04
// (0050_grille_de_test.sql) restent, eux, satisfaits — seul REQ-02, qui vit
// uniquement dans le service, est court-circuité.

describe('étape 7 : la lecture /api/sante rougit sur une ligne conclue sans pièce demandée (REQ-02)', () => {
  const AVANT = process.env.OTTO_DEMO_PUBLIC;
  beforeAll(async () => {
    process.env.OTTO_DEMO_PUBLIC = '1';
    await initTestDb();
    await bootstrapNep();
    const requestId = await samplingAndRequest();
    await clientDeposits(requestId);
    await extractAndVerify();
  }, 240000);
  afterAll(() => { process.env.OTTO_DEMO_PUBLIC = AVANT; });

  it('sans aucune colonne ajoutée : la lecture passe, vide', async () => {
    const res = await GET();
    const body = await res.json();
    const lecture = body.lectures.find((l: { nom: string }) => l.nom.startsWith('étape 7'));
    expect(lecture.ok).toBe(true);
    expect(lecture.detail).toContain('aucune colonne ajoutée');
  });

  it('une ligne CONCLUE (contournement direct) dont la colonne ajoutée n’a jamais eu sa pièce demandée fait rougir la lecture — puis la pièce demandée la fait repasser au vert', async () => {
    await ajouterColonneGrille(IDS.engNep, 'numéro de facture', IDS.users.karim);
    await calculerGrille(IDS.engNep, IDS.users.karim);
    const { grille, cellules } = await cellulesDuDossier(IDS.engNep);
    const packCodes = new Set(grille!.colonnes.filter((c) => c.origine === 'pack').map((c) => c.code));
    const itemId = Object.entries(cellules).find(([, cs]) => {
      const pack = cs.filter((c) => packCodes.has(c.colonne));
      return pack.length > 0 && pack.every((c) => c.etat === 'conforme');
    })?.[0];
    if (!itemId) throw new Error('aucune ligne propre (pack) trouvée — le test ne peut pas isoler la lecture étape 7');
    /* La cellule de la colonne ajoutée est DISPOSÉE — les déclencheurs
       TEST-02/TEST-04 de test_line_conclusion l'exigent, eux, à l'insertion
       (0050_grille_de_test.sql) : seul REQ-02, qui ne vit que dans
       conclureLigne, est court-circuité ci-dessous. */
    const colAjoutee = cellules[itemId].find((c) => c.colonne === 'invoiceNumber')!;
    if (colAjoutee.etat !== 'conforme') {
      await disposerCellule(IDS.engNep, colAjoutee.id, IDS.users.karim, 'sonde étape 7 — donnée relevée manuellement, sans ancre');
    }
    await q(
      `insert into test_line_conclusion (engagement_id, grid_id, sample_item_id, cells_hash, concluded_by)
       values ($1,$2,$3,'sonde-etape7',$4)
       on conflict (sample_item_id) do update set grid_id = excluded.grid_id, cells_hash = excluded.cells_hash,
         concluded_by = excluded.concluded_by, concluded_at = now()`,
      [IDS.engNep, grille!.id, itemId, IDS.users.karim],
    );

    const rouge = await GET();
    const bodyRouge = await rouge.json();
    const lectureRouge = bodyRouge.lectures.find((l: { nom: string }) => l.nom.startsWith('étape 7'));
    expect(lectureRouge.ok).toBe(false);
    expect(lectureRouge.detail).toContain('jamais été demandée');
    expect(lectureRouge.detail).toContain('invoice');
    expect(rouge.status).toBe(500);

    await demanderPieceLigne(itemId, EVIDENCE_TYPE_INVOICE, IDS.users.karim);

    const vert = await GET();
    const bodyVert = await vert.json();
    const lectureVerte = bodyVert.lectures.find((l: { nom: string }) => l.nom.startsWith('étape 7'));
    expect(lectureVerte.ok).toBe(true);
    expect(lectureVerte.detail).toContain('colonne(s) ajoutée(s)');
    expect(vert.status).toBe(200);
  });
});
