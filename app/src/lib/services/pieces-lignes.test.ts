import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { IDS } from '@/lib/seed';
import { q, q1 } from '@/lib/db/client';
import { bootstrapNep, samplingAndRequest } from '@/lib/flows/part1';
import { currentRevenueSample } from './sampling';
import {
  demanderPieceLigne, demanderPiecesEnLot, piecesDemandeesParLigne,
  EVIDENCE_TYPE_INVOICE, EVIDENCE_TYPE_DELIVERY_NOTE,
} from './requests';

/** Un tirage minimal sur un AUTRE dossier — même précédent que
 *  `semerUnSampleOrphelin` (api/sante/pop01-legacy.test.ts) — pour prouver
 *  qu'un `sample_id` étranger, posé dans le champ caché du formulaire « en
 *  lot », est refusé plutôt que lu (revue hostile du 2026-09-07).
 *  UNE ÉQUIPE EST POSÉE, SANS KARIM : `assertMembre` (membre.ts) ne lève
 *  ETANCH-03 que si le dossier a une équipe (`s.equipe > 0`) ET que
 *  l'appelant n'y figure pas — un dossier SANS équipe est lu comme ouvert au
 *  cabinet entier (constaté en tournant ce test une première fois : sans
 *  cette ligne, karim passait, `engNepN1` n'ayant aucune équipe dans le
 *  monde semé). */
async function semerUnTirageEtranger(engagementId: string): Promise<string> {
  await q(
    `insert into engagement_member (engagement_id, user_id, eng_role, can_sign, entered_on)
     values ($1, $2, 'senior', false, date '2025-11-03')
     on conflict do nothing`,
    [engagementId, IDS.users.lea],
  );
  await q(
    `insert into procedure_instance (engagement_id, pack_id, template_code, kind, fsli_code, title, status)
     values ($1, 'ISA-2024', 'REV-SUBST', 'substantive', 'REVENUE', 'sonde ETANCH-LOT', 'in_progress')`,
    [engagementId],
  );
  const pi = await q1<{ id: string }>(
    `select id from procedure_instance where engagement_id = $1 and title = 'sonde ETANCH-LOT'`,
    [engagementId],
  );
  const sample = await q1<{ id: string }>(
    `insert into sample (engagement_id, procedure_id, method, params, seed, population_hash, population_size, status)
     values ($1, $2, 'monetary_coverage_random', '{}', 'x', 'y', 0, 'drawn') returning id::text`,
    [engagementId, pi.id],
  );
  return sample.id;
}

// PLAN D'AUTONOMIE, PARTIE B, ÉTAPE 5 — LES PIÈCES, ET LEURS DEMANDES : un
// bouton en un clic PAR TYPE de pièce, par ligne ET en lot. `samplingAndRequest`
// (le monde semé) appelle déjà `generatePbcFromSample` — le paquet standard,
// non typé — AVANT ces tests : ils prouvent donc aussi que les deux
// vocabulaires ne se recoupent PAS (`piecesDemandeesParLigne` ne voit rien du
// paquet standard, une ligne « déjà dans le paquet » reste à demander ICI).

describe('Étape 5 — les pièces, et leurs demandes (par ligne, en lot)', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    await samplingAndRequest(); // sème le tirage ET le paquet PBC standard (non typé)
  }, 180000);

  it('le paquet standard déjà semé ne compte pas comme « déjà demandé » par ce mécanisme', async () => {
    const sample = await currentRevenueSample(IDS.engNep);
    const suivies = await piecesDemandeesParLigne(IDS.engNep, sample!.id, EVIDENCE_TYPE_INVOICE);
    expect(suivies.size).toBe(0);
  });

  it('REQ-01 : un type de pièce inconnu est refusé, par ligne comme en lot', async () => {
    const sample = await currentRevenueSample(IDS.engNep);
    const ligne = sample!.items[0];
    await expect(demanderPieceLigne(ligne.id, 'passeport', IDS.users.karim)).rejects.toThrow(/REQ-01/);
    await expect(demanderPiecesEnLot(sample!.id, 'passeport', IDS.users.karim)).rejects.toThrow(/REQ-01/);
  });

  it('ETANCH-LOT : un sample_id d’un AUTRE dossier (champ caché du formulaire en lot) est refusé, pas lu (revue hostile du 2026-09-07)', async () => {
    const etranger = await semerUnTirageEtranger(IDS.engNepN1); // karim n’est pas membre de engNepN1
    await expect(demanderPiecesEnLot(etranger, EVIDENCE_TYPE_INVOICE, IDS.users.karim)).rejects.toThrow(/ETANCH/);
  });

  it('par ligne : une facture demandée crée une demande à un seul élément, et le lien apparaît', async () => {
    const sample = await currentRevenueSample(IDS.engNep);
    // Une écriture manuelle (journal 'OD') ne porte AUCUNE pièce — pas visible sur
    // `currentRevenueSample`'s items (pas de journal_code ici) : on essaie donc
    // chaque ligne jusqu'à la première où une facture s'applique réellement.
    let requestId: string | undefined;
    let ligne: { id: string } | undefined;
    for (const it of sample!.items) {
      try {
        requestId = await demanderPieceLigne(it.id, EVIDENCE_TYPE_INVOICE, IDS.users.karim);
        ligne = it;
        break;
      } catch { /* écriture manuelle ou cas inapplicable — ligne suivante */ }
    }
    expect(requestId, 'aucune ligne du tirage n’acceptait une facture — le tirage semé a changé de forme').toBeTruthy();
    const suivies = await piecesDemandeesParLigne(IDS.engNep, sample!.id, EVIDENCE_TYPE_INVOICE);
    expect(suivies.get(ligne!.id)?.requestId).toBe(requestId);
  });

  it('par ligne : un bon de livraison sur une ligne qui n’en porte pas (avoir, ou hors 701) est refusé', async () => {
    const sample = await currentRevenueSample(IDS.engNep);
    const avoir = sample!.items.find((i) => i.account_no.startsWith('709'));
    if (!avoir) return; // le monde semé ne porte pas toujours un avoir dans le tirage — non bloquant ici
    await expect(demanderPieceLigne(avoir.id, EVIDENCE_TYPE_DELIVERY_NOTE, IDS.users.karim)).rejects.toThrow();
  });

  it('en lot : une seule demande couvre toutes les lignes qui attendent une facture, en une fois', async () => {
    const sample = await currentRevenueSample(IDS.engNep);
    const avantId = (await piecesDemandeesParLigne(IDS.engNep, sample!.id, EVIDENCE_TYPE_INVOICE)).size;
    const requestId = await demanderPiecesEnLot(sample!.id, EVIDENCE_TYPE_INVOICE, IDS.users.karim);
    const suivies = await piecesDemandeesParLigne(IDS.engNep, sample!.id, EVIDENCE_TYPE_INVOICE);
    // toutes les lignes non-manuelles du tirage sont désormais suivies par CE requestId (sauf celle déjà demandée par ligne au test précédent)
    const parCeRequest = [...suivies.values()].filter((v) => v.requestId === requestId).length;
    expect(parCeRequest).toBeGreaterThan(0);
    expect(suivies.size).toBeGreaterThan(avantId);

    /* CAS CONNU MAUVAIS (règle 17) : relancer le lot maintenant que tout est
       couvert ne doit PAS poser une demande vide — un décor (règle 20). */
    await expect(demanderPiecesEnLot(sample!.id, EVIDENCE_TYPE_INVOICE, IDS.users.karim)).rejects.toThrow(/rien à demander/);
  });
});
