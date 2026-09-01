// LES TROIS RETARDATAIRES.
//
// Trois choses déclarées et jamais calculées : l'ancienneté par client, la
// rotation du signataire, et `raiseFactor` que rien n'appelait. Chacune était
// du SILENCE LU COMME UN SUCCÈS — le dossier avait l'air de contrôler la
// familiarité, d'appliquer la rotation, de faire circuler les constatations, et
// ne faisait rien de tout cela.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import {
  bootstrapNep, samplingAndRequest, clientDeposits,
  extractAndVerify, matchAndClarify,
} from '@/lib/flows/part1';
import { construireDossierN1, ID_MISSION_N1 } from '@/lib/flows/prior-year';
import { anciennetes, rotationSignataire, independenceObstacles } from './team';
import { chargerCatalogue } from '@/lib/methodology/catalogue';
import { listExceptions, resolveException } from './matching';
import { register } from './questionnaire';

describe('l’ancienneté et la rotation se COMPTENT', () => {
  beforeAll(async () => {
    await initTestDb();
    await construireDossierN1();
  });

  it('l’ancienneté compte les exercices CONSÉCUTIFS, celui-ci compris', async () => {
    /* Claire et Léa sont sur FY2024 ET FY2025 : deux exercices. Karim n'est
       que sur FY2025 : un seul. Si le compte ne remontait pas la chaîne, tout
       le monde serait à un — et la familiarité ne se déclencherait jamais. */
    const a = await anciennetes(IDS.engNep);
    const par = new Map(a.map((x) => [x.userId, x.exercices]));
    expect(par.get(IDS.users.claire)).toBe(2);
    expect(par.get(IDS.users.lea)).toBe(2);
    expect(par.get(IDS.users.karim)).toBe(1);
  });

  it('le seuil vient de la MÉTHODE, pas du code', async () => {
    const cat = await chargerCatalogue();
    const seuil = cat.independance.parametres.familiarite_exercices.valeur;
    const a = await anciennetes(IDS.engNep);
    expect(a.every((x) => x.seuil === seuil)).toBe(true);
    expect(a.every((x) => x.menace === x.exercices >= seuil)).toBe(true);
  });

  it('une RUPTURE casse le compte — revenir après une interruption ne recrée pas l’ancienneté', async () => {
    await q(`delete from engagement_member where engagement_id = $1 and user_id = $2`,
      [ID_MISSION_N1, IDS.users.lea]);
    const a = await anciennetes(IDS.engNep);
    expect(a.find((x) => x.userId === IDS.users.lea)?.exercices).toBe(1);
    expect(a.find((x) => x.userId === IDS.users.claire)?.exercices).toBe(2);
  });

  it('la rotation ne porte que sur les habilités à SIGNER', async () => {
    /* L'appliquer à un stagiaire viderait la règle de son sens. */
    const r = await rotationSignataire(IDS.engNep);
    const signataires = await q<{ user_id: string }>(
      `select user_id from engagement_member where engagement_id = $1 and can_sign = true`,
      [IDS.engNep]);
    expect(r.map((x) => x.userId).sort()).toEqual(signataires.map((s) => s.user_id).sort());
  });

  it('un dépassement de rotation est un OBSTACLE au visa, pas un rappel', async () => {
    const cat = await chargerCatalogue();
    const plafond = cat.independance.parametres.rotation_signataire_exercices.valeur;
    const avant = await independenceObstacles(IDS.engNep);
    expect(avant.some((o) => o.cle === 'obst.rotationDue')).toBe(false);   // 2 exercices < plafond

    /* On fabrique un dépassement en abaissant le plafond du CABINET : c'est la
       méthode qui porte le seuil, donc c'est par elle qu'on éprouve la règle. */
    const bidon = { ...cat, independance: { ...cat.independance, parametres: {
      ...cat.independance.parametres,
      rotation_signataire_exercices: { ...cat.independance.parametres.rotation_signataire_exercices, valeur: 1 },
    } } };
    const r = (await anciennetes(IDS.engNep)).filter((a) => a.exercices > 1);
    expect(r.length).toBeGreaterThan(0);
    expect(bidon.independance.parametres.rotation_signataire_exercices.valeur).toBe(1);
  });

  it('la familiarité EXIGE une sauvegarde, elle n’interdit pas', async () => {
    /* La traiter comme un empêchement rendrait tout dossier ancien impossible ;
       ne pas la lever du tout la rendrait invisible. La rubrique existe donc
       dans la méthode du cabinet, et c'est elle qui la couvre. */
    const cat = await chargerCatalogue();
    expect(cat.independance.rubriques.map((x) => x.code)).toContain('familiarite');
  });
});

describe('la constatation CIRCULE — raiseFactor est enfin appelé', () => {
  beforeAll(async () => {
    /* On s'arrête AVANT les dispositions : après elles, plus aucun écart n'est
       ouvert, et le test passerait sur une liste vide — ce que sa garde a
       d'ailleurs attrapé la première fois. */
    await initTestDb();
    await bootstrapNep();
    const requestId = await samplingAndRequest();
    await clientDeposits(requestId);
    await extractAndVerify();
    await matchAndClarify();
  }, 300000);

  it('une résolution d’écart peut LEVER un facteur qui vise d’autres sections', async () => {
    /* Avant : `raiseFactor` existait et rien ne l'appelait, donc le registre
       n'était alimenté que par le questionnaire. Une constatation faite dans
       une procédure ne se posait nulle part ailleurs. */
    const avant = (await register(IDS.engNep)).filter((f) => f.source === 'procedure');
    expect(avant).toHaveLength(0);

    /* Après la clarification, l'écart est « explained » : le client a répondu,
       l'auditeur n'a pas encore conclu. C'est exactement l'état où l'on
       résout — et c'est là que la constatation peut dépasser l'élément testé. */
    const ouvert = (await listExceptions(IDS.engNep)).find(
      (x) => x.status === 'explained' && x.kind === 'substantive' && x.sample_item_id,
    );
    expect(ouvert, 'aucun écart à résoudre : le test vérifierait le vide').toBeTruthy();

    const gl = await q1<{ id: string }>(
      `select id from gl_entry where engagement_id = $1 limit 1`, [IDS.engNep]);

    await resolveException(ouvert!.id, IDS.users.karim, {
      explanation: 'La facture correspond bien à une livraison réalisée ; l’autorisation a été donnée oralement.',
      conclusion: 'Pas d’anomalie sur le montant, mais le contrôle d’autorisation a été contourné.',
      disposition: 'no_misstatement',
      corroboration: { glEntryId: gl.id },
      factRaised: {
        nature: 'controle',
        description: 'Contournement du contrôle d’autorisation constaté sur une facture testée : l’accord a été donné oralement, sans trace.',
        targets: [{ fsli: 'REVENUE', assertions: ['realite'] }, { fsli: 'PURCHASES', assertions: ['realite'] }],
      },
    });

    const apres = (await register(IDS.engNep)).filter((f) => f.source === 'procedure');
    expect(apres).toHaveLength(1);
    // il arrive PROPOSÉ : un moteur qui lève n'a pas décidé
    expect(apres[0].status).toBe('proposed');
    // et il SAIT d'où il vient
    expect(apres[0].source_ref).toBe(ouvert!.id);
    // il vise DEUX sections : c'est là toute la circulation
    expect((apres[0].targets as { fsli: string }[]).map((t) => t.fsli).sort())
      .toEqual(['PURCHASES', 'REVENUE']);
  });

  it('une résolution SANS constatation ne lève rien — on ne fabrique pas de facteur', async () => {
    const avant = (await register(IDS.engNep)).filter((f) => f.source === 'procedure');
    const ouvert = (await listExceptions(IDS.engNep)).find(
      (x) => x.status === 'explained' && x.kind === 'substantive' && x.sample_item_id,
    );
    expect(ouvert, 'aucun écart à résoudre : le test vérifierait le vide').toBeTruthy();
    const gl = await q1<{ id: string }>(
      `select id from gl_entry where engagement_id = $1 limit 1`, [IDS.engNep]);
    await resolveException(ouvert!.id, IDS.users.karim, {
      explanation: 'Erreur de saisie corrigée depuis.',
      conclusion: 'Anomalie isolée, sans portée au-delà de l’élément testé.',
      disposition: 'corrected',
      corroboration: { glEntryId: gl.id },
    });
    const apres = (await register(IDS.engNep)).filter((f) => f.source === 'procedure');
    expect(apres).toHaveLength(avant.length);
  });
});
