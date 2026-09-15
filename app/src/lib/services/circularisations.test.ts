// LES CIRCULARISATIONS — ce qu'elles REFUSENT, puis ce qu'elles trouvent.
//
// Le fondateur décrit une file d'agents ; ce que le dossier exige, ce sont des
// CONSTATS reproductibles : un compte que le listing ne couvre pas, une ligne
// de listing qu'aucun compte ne porte, un écart entre le solde confirmé et la
// comptabilité. Tout cela se dérive — aucun modèle, aucun statut stocké.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { declarerContactCle } from './reunions';
import {
  importerListing, completude, envoyer, deposerReponse, rapprochement,
  redigerQuestions, obstaclesCircularisation, expliquerEcart, tiers, campagne,
} from './circularisations';

const LISTING = [
  'Tiers;Contact;Reference;Compte',
  'Banque Lyonnaise de Crédit (fictive);confirmations@blc-fictive.example;FR76 3000 1000 0100 0000 0000 123;512900',
  'Crédit Méridien (fictif);tresorerie@credit-meridien-fictif.example;FR76 4000 2000 0200 0000 0000 456;512200',
].join('\n');

const CORRIGE = [
  'Tiers;Contact;Reference;Compte',
  'Banque Lyonnaise de Crédit (fictive);confirmations@blc-fictive.example;FR76 3000 1000 0100 0000 0000 123;512100',
].join('\n');

const K = IDS.users.karim;

async function pieceBidon(nom: string): Promise<string> {
  const r = await q1<{ id: string }>(
    `insert into evidence (engagement_id, filename, mime, sha256, size_bytes, storage_path,
                           source, audience, uploaded_by_kind)
     values ($1,$2,'application/pdf',$3,10,'x','email','client_provided','client_contact')
     returning id::text`,
    [IDS.engNep, nom, `sha-${nom}`]);
  return r.id;
}

describe('circularisations : la complétude et le rapprochement se DÉRIVENT', () => {
  beforeAll(async () => {
    await initTestDb();
    await bootstrapNep();
    const contact = await q1<{ id: string }>(
      `select c.id::text from client_contact c
       join engagement e on e.entity_id = c.entity_id
       where e.id = $1 and c.active order by c.email limit 1`, [IDS.engNep]);
    await declarerContactCle(IDS.engNep, contact.id, K);
  });

  /* ═══ 1. L'IMPORT REFUSE CE QU'IL NE SAIT PAS LIRE ══════════════════════ */

  it('un listing vide, une colonne absente, une adresse fausse ou une référence en double sont REFUSÉS', async () => {
    await expect(importerListing(IDS.engNep, 'banque', 'Tiers;Contact;Reference', K))
      .rejects.toThrow(/vide/);
    await expect(importerListing(IDS.engNep, 'banque', 'Banque;Mail\nX;y@z.fr', K))
      .rejects.toThrow(/colonne « tiers »|colonne « reference »/);
    await expect(importerListing(IDS.engNep, 'banque',
      'Tiers;Contact;Reference\nBanque X;pas-une-adresse;REF-1', K))
      .rejects.toThrow(/adresse de courriel/);
    await expect(importerListing(IDS.engNep, 'banque',
      'Tiers;Contact;Reference\nA;a@b.fr;REF-1\nB;b@c.fr;REF-1', K))
      .rejects.toThrow(/deux fois/);
    expect(await campagne(IDS.engNep, 'banque')).toBeNull();
  });

  /* ═══ 2. LES DEUX SENS DE LA COMPLÉTUDE ════════════════════════════════ */

  it('le listing importé, la complétude nomme le compte NON COUVERT et les lignes SANS compte', async () => {
    const { lignes } = await importerListing(IDS.engNep, 'banque', LISTING, K);
    expect(lignes).toBe(2);

    const c = await completude(IDS.engNep, 'banque');
    expect(c.poste).toBe('CASH');
    expect(c.comptesSansTiers.map((x) => x.compte)).toContain('512100');
    expect(c.tiersSansCompte.map((x) => x.compte).sort()).toEqual(['512200', '512900']);
  });

  /* ═══ 3. L'ENVOI : UNE FOIS, ET TRACÉ ══════════════════════════════════ */

  it('la demande part (simulée, qui le dit) et ne repart pas deux fois', async () => {
    const [t1] = await tiers(IDS.engNep, 'banque');
    const r = await envoyer(t1.id, K);
    expect(r.remis).toBe(false);
    expect(r.detail).toMatch(/simulé/);
    await expect(envoyer(t1.id, K)).rejects.toThrow(/déjà partie/);

    const ev = await q<{ verb: string }>(
      `select verb from event_log where engagement_id = $1 and verb like 'circularisation%'`,
      [IDS.engNep]);
    expect(ev.map((e) => e.verb)).toContain('circularisation.envoi_simule');
  });

  it('on ne DÉPOSE pas la réponse d’un tiers qu’on n’a jamais interrogé', async () => {
    const jamais = (await tiers(IDS.engNep, 'banque')).find((t) => !t.sent_at)!;
    await expect(deposerReponse({
      partyId: jamais.id, userId: K, evidenceId: await pieceBidon('faux.pdf'), montantConfirmeCents: 1,
    })).rejects.toThrow(/aucune demande n’est partie|aucune demande n'est partie/);
  });

  /* R96 : TRADE_PAYABLES n'a qu'UN SEUL compte collectif au grand livre —
     déposer une réponse fournisseur comparerait le solde d'un tiers au solde
     ENTIER du compte, et afficherait un écart qui n'en est pas un. Trouvé par
     une revue hostile qui a prouvé, par exécution, que sans ce refus l'ÉCRAN
     (pas seulement le semeur) pouvait déclencher le défaut. */
  it('R96 : importer et envoyer une demande FOURNISSEUR reste possible, mais DÉPOSER une réponse est REFUSÉ', async () => {
    await importerListing(IDS.engNep, 'fournisseur',
      ['Tiers;Contact;Reference;Compte',
        'Float Glass Industries GmbH (fictif);comptes-clients@floatglass-fictif.example;CLI-ALT-4471;401000'].join('\n'), K);
    const floatGlass = (await tiers(IDS.engNep, 'fournisseur')).find((t) => t.reference === 'CLI-ALT-4471')!;
    expect(floatGlass, 'le listing fournisseur importe bien le tiers').toBeTruthy();

    // Importer et envoyer ne sont PAS concernés par R96 — ils ne comparent rien au compte collectif.
    await envoyer(floatGlass.id, K);
    const apresEnvoi = (await tiers(IDS.engNep, 'fournisseur')).find((t) => t.id === floatGlass.id)!;
    expect(apresEnvoi.sent_at).toBeTruthy();

    await expect(deposerReponse({
      partyId: floatGlass.id, userId: K, evidenceId: await pieceBidon('confirmation-floatglass.pdf'),
      montantConfirmeCents: 19350233,
    })).rejects.toThrow(/compte collectif|R96/);
  });

  /* ═══ 4. LE RAPPROCHEMENT, ET LA RÈGLE « TOUT ÉCART SE DIT » ═══════════ */

  it('listing corrigé, réponse déposée : l’écart au grand livre est CALCULÉ, et tout écart remonte', async () => {
    await importerListing(IDS.engNep, 'banque', CORRIGE, K);
    const blc = (await tiers(IDS.engNep, 'banque')).find((t) => t.compte === '512100');
    expect(blc, 'le listing corrigé rattache la banque au compte réel').toBeTruthy();

    const avant = await rapprochement(IDS.engNep, 'banque');
    const ligne = avant.lignes.find((l) => l.id === blc!.id)!;
    expect(ligne.etat).toBe(blc!.sent_at ? 'envoyee' : 'a_envoyer');
    const solde = ligne.soldeComptableCents!;
    expect(solde).toBeGreaterThan(0);

    if (!blc!.sent_at) await envoyer(blc!.id, K);
    await deposerReponse({
      partyId: blc!.id, userId: K,
      evidenceId: await pieceBidon('confirmation-blc.pdf'),
      montantConfirmeCents: solde + 125000,        // 1 250,00 € de frais non comptabilisés
    });

    const apres = await rapprochement(IDS.engNep, 'banque');
    const l = apres.lignes.find((x) => x.id === blc!.id)!;
    expect(l.ecartCents).toBe(125000);
    expect(l.remonte).toBe(true);
    expect(l.etat).toBe('ecart');
    expect(apres.regle).toMatch(/tout écart/);
  });

  it('un solde confirmé ÉGAL au grand livre ne remonte pas — et l’état le dit', async () => {
    /* Le même chemin, sur un tiers neuf : la règle doit distinguer, sinon elle
       ne mesure rien. */
    await importerListing(IDS.engNep, 'banque',
      ['Tiers;Contact;Reference;Compte',
        'Banque Lyonnaise de Crédit (fictive);confirmations@blc-fictive.example;FR76 3000 1000 0100 0000 0000 123;512100',
        'Banque témoin (fictive);temoin@banque-fictive.example;REF-TEMOIN;512100'].join('\n'), K);
    const temoin = (await tiers(IDS.engNep, 'banque')).find((t) => t.reference === 'REF-TEMOIN')!;
    await envoyer(temoin.id, K);
    const solde = (await rapprochement(IDS.engNep, 'banque'))
      .lignes.find((l) => l.id === temoin.id)!.soldeComptableCents!;
    await deposerReponse({
      partyId: temoin.id, userId: K, evidenceId: await pieceBidon('confirmation-temoin.pdf'),
      montantConfirmeCents: solde,
    });
    const l = (await rapprochement(IDS.engNep, 'banque')).lignes.find((x) => x.id === temoin.id)!;
    expect(l.ecartCents).toBe(0);
    expect(l.remonte).toBe(false);
    expect(l.etat).toBe('rapprochee');
  });

  it('avocat : une provision qui ÉGALE le solde créditeur ne fabrique pas un écart doublé (Lot 5, poste Provisions)', async () => {
    /* Trouvé par une revue hostile le 2026-09-15 : `rapprochement()` comparait
       `provisions` (toujours saisi POSITIF par l'auditeur, « la provision
       déclarée est de 60 000 € ») directement au solde SIGNÉ du grand livre —
       négatif pour un poste créditeur comme PROVISIONS. Une provision EXACTE
       produisait donc `ecart = provisions - solde = 60 000 - (-60 000) =
       120 000` : un écart FABRIQUÉ, doublé, sur une confirmation parfaite —
       reproduit par exécution avant ce test, à travers `deposerReponse()`,
       le même chemin qu'un clic réel emprunterait. Ce test EST le cas connu
       mauvais (règle 17) : sans le correctif du signe dans `rapprochement()`,
       il échoue avec `ecartCents: 120000`, pas `0`. */
    await importerListing(IDS.engNep, 'avocat',
      ['Tiers;Contact;Reference;Compte',
        'Cabinet Vialar & Associés (fictif);secretariat@vialar-associes.example;DOSSIER-2025-014;151000'].join('\n'), K);
    const vialar = (await tiers(IDS.engNep, 'avocat')).find((t) => t.reference === 'DOSSIER-2025-014')!;
    expect(vialar, 'le listing avocat importe bien le tiers').toBeTruthy();
    await envoyer(vialar.id, K);

    const solde = (await rapprochement(IDS.engNep, 'avocat'))
      .lignes.find((l) => l.id === vialar.id)!.soldeComptableCents!;
    expect(solde, 'PROVISIONS est un poste créditeur : son solde de grand livre est négatif').toBeLessThan(0);

    await deposerReponse({
      partyId: vialar.id, userId: K, evidenceId: await pieceBidon('confirmation-vialar.pdf'),
      litiges: [{ objet: 'Litige test (fictif)', provision_cents: -solde, statut: 'ongoing' }],
    });

    const l = (await rapprochement(IDS.engNep, 'avocat')).lignes.find((x) => x.id === vialar.id)!;
    expect(l.provisionConfirmeeCents).toBe(-solde);
    expect(l.ecartCents).toBe(0);
    expect(l.remonte).toBe(false);
    expect(l.etat).toBe('rapprochee');
  });

  it('avocat : une VRAIE différence entre la provision et le solde reste mesurée, pas silencieusement annulée', async () => {
    await importerListing(IDS.engNep, 'avocat',
      ['Tiers;Contact;Reference;Compte',
        'Cabinet témoin (fictif);temoin@cabinet-fictif.example;DOSSIER-TEMOIN;151000'].join('\n'), K);
    const temoin = (await tiers(IDS.engNep, 'avocat')).find((t) => t.reference === 'DOSSIER-TEMOIN')!;
    await envoyer(temoin.id, K);
    const solde = (await rapprochement(IDS.engNep, 'avocat'))
      .lignes.find((l) => l.id === temoin.id)!.soldeComptableCents!;

    const provisionDeclareeCents = -solde + 500000;   // 5 000,00 € de provision sous-évaluée
    await deposerReponse({
      partyId: temoin.id, userId: K, evidenceId: await pieceBidon('confirmation-temoin-avocat.pdf'),
      litiges: [{ objet: 'Litige témoin (fictif)', provision_cents: provisionDeclareeCents, statut: 'ongoing' }],
    });

    const l = (await rapprochement(IDS.engNep, 'avocat')).lignes.find((x) => x.id === temoin.id)!;
    expect(l.ecartCents).toBe(500000);
  });

  /* ═══ 5. CE QUI EN SORT ════════════════════════════════════════════════ */

  it('les questions au client naissent en BROUILLON, une par constat', async () => {
    const reqId = await redigerQuestions(IDS.engNep, 'banque', K);
    const r = await q1<{ status: string; title: string }>(
      `select status, title from request where id = $1`, [reqId]);
    expect(r.status).toBe('draft');
    expect(r.title).toMatch(/[Cc]ircularisation/);
    const items = await q<{ description: string }>(
      `select description from request_item where request_id = $1`, [reqId]);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => /1 250,00 €|1250.00/.test(i.description))).toBe(true);
  });

  it('un écart NON EXPLIQUÉ bloque le visa ; une explication écrite le lève', async () => {
    const enEcart = (await rapprochement(IDS.engNep, 'banque')).lignes.find((l) => l.etat === 'ecart')!;
    expect((await obstaclesCircularisation(IDS.engNep)).some((o) => o.cle === 'obst.circEcartNonExplique')).toBe(true);

    await expect(expliquerEcart(enEcart.id, 'RAS', K)).rejects.toThrow(/se rédige/);
    await expliquerEcart(enEcart.id,
      'Frais de tenue de compte prélevés le 31/12 et comptabilisés en janvier — rattachement corrigé.', K);
    const apres = await obstaclesCircularisation(IDS.engNep);
    expect(apres.some((o) => o.cle === 'obst.circEcartNonExplique' && o.vars?.nom === enEcart.nom)).toBe(false);

    /* Une explication sans écart n'a pas lieu d'être. */
    const sansEcart = (await rapprochement(IDS.engNep, 'banque')).lignes.find((l) => l.etat === 'rapprochee')!;
    await expect(expliquerEcart(sansEcart.id, 'Une explication qui ne correspond à rien.', K))
      .rejects.toThrow(/aucun écart/);
  });

  it('les obstacles au visa NOMMENT ce qui manque, et aucune campagne = aucun obstacle', async () => {

    /* Aucune campagne = aucun obstacle : on ne reproche pas de ne pas avoir
       circularisé ce qu'on n'a pas décidé de circulariser. */
    const vierge = await q01<{ id: string }>(`select id::text from engagement where id = $1`, [IDS.engSox]);
    expect(await obstaclesCircularisation(vierge!.id)).toEqual([]);
  });
});
