import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { signWorkpaper } from './workpapers/lifecycle';
import { vuePoste, destinationsDuPoste } from './poste';

// L'ANATOMIE DE LA PAGE DE POSTE (mandat de la soirée, §2), lue par son service.
//
// Ce que le test prouve : la leadsheet porte N, N-1 et la variation ; les
// visas du poste sont ceux de ses papiers, rôle par rôle, et se lisent
// PÉRIMÉS quand le papier visé est dépassé ; les papiers, les écarts (avec le
// papier qui les porte) et les demandes du poste sont ceux de SES procédures ;
// les dix sections ont un état dérivé. Rien ici n'est stocké : tout se lit
// des faits.

const POSTE = 'REVENUE';

describe('vuePoste — l’anatomie du poste', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
    const { draftRevenueWorkpaper } = await import('./workpapers/draft');
    await draftRevenueWorkpaper(IDS.engNep, IDS.users.karim);
  }, 240000);

  it('leadsheet N/N-1, origine dite, dix sections dans l’ordre du travail', async () => {
    const v = (await vuePoste(IDS.engNep, POSTE))!;
    expect(v).not.toBeNull();
    expect(v.origineN1.source).toBe('balance_n1');
    expect(v.periode.n).not.toBe('');
    expect(v.comptes.length).toBeGreaterThan(0);
    for (const c of v.comptes) {
      expect(typeof c.balanceN1Cents).toBe('number');
      expect(c.variationCents).toBe(c.balanceCents - (c.balanceN1Cents ?? 0));
    }
    expect(v.totalN1Cents).not.toBeNull();
    expect(v.blocs.map((b) => b.cle)).toEqual([
      'leadsheet', 'analytique', 'processus', 'controle-interne', 'risques', 'echantillon', 'testing', 'papiers', 'ecarts', 'demandes',
    ]);
    expect(v.blocs.find((b) => b.cle === 'analytique')!.etat).toBe('a_faire');
    expect(destinationsDuPoste(IDS.engNep, POSTE)).toContain(`/eng/${IDS.engNep}/analytique`);
    /* Le poste garde ses références croisées : au moins un compte est testé par un papier. */
    expect(v.comptes.some((c) => c.xref.length > 0)).toBe(true);
  });

  it('les papiers, les écarts (avec leur papier) et les demandes sont ceux du poste', async () => {
    const v = (await vuePoste(IDS.engNep, POSTE))!;
    expect(v.papiers.length).toBeGreaterThan(0);
    expect(v.papiers[0]).toMatchObject({ code: expect.any(String), status: 'draft', version: 1 });
    expect(v.papiers[0].quand).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(v.ecarts.liste.length).toBeGreaterThan(0);
    expect(v.ecarts.total).toBe(v.ecarts.liste.length);
    expect(v.ecarts.dossierTotal).toBeGreaterThanOrEqual(v.ecarts.total);
    /* Chaque écart du poste connaît le papier qui documente sa procédure. */
    for (const x of v.ecarts.liste) expect(x.papier?.code).toBe(v.papiers[0].code);
    expect(v.demandes.length).toBeGreaterThan(0);
    expect(v.demandes.every((d) => d.items > 0 && d.faits <= d.items)).toBe(true);
    expect(v.blocs.find((b) => b.cle === 'papiers')!.etat).toBe('en_cours');
    expect(v.blocs.find((b) => b.cle === 'demandes')!.etat).not.toBe('sans_objet');
  });

  it('les visas du poste sont ceux de ses papiers, rôle par rôle — et PÉRIMÉS quand le papier visé est dépassé', async () => {
    const avant = (await vuePoste(IDS.engNep, POSTE))!;
    expect(avant.visas.map((x) => x.etat)).toEqual(['absent', 'absent', 'absent']);
    const wid = avant.papiers[0].id;
    await signWorkpaper(wid, IDS.users.karim, 'preparer_validator');
    const prep = (await vuePoste(IDS.engNep, POSTE))!;
    expect(prep.visas[0]).toMatchObject({ role: 'preparer_validator', etat: 'vise', papier: { id: wid } });
    expect(prep.visas[0].nom).not.toBeNull();
    expect(prep.visas[1].etat).toBe('absent');
    expect(prep.papiers[0].visas.map((s) => s.role)).toEqual(['preparer_validator']);
    await signWorkpaper(wid, IDS.users.lea, 'reviewer');
    const rev = (await vuePoste(IDS.engNep, POSTE))!;
    expect(rev.visas[1]).toMatchObject({ role: 'reviewer', etat: 'vise' });
    /* Le papier visé est dépassé : le visa se lit PÉRIMÉ, il ne disparaît pas. */
    await q(`update workpaper set status = 'outdated' where id = $1`, [wid]);
    const perime = (await vuePoste(IDS.engNep, POSTE))!;
    expect(perime.visas[0]).toMatchObject({ etat: 'perime', papier: { id: wid } });
    expect(perime.visas[1].etat).toBe('perime');
    /* Un papier dépassé ne porte plus les écarts : le lien vers le papier vivant disparaît, il n'est pas inventé. */
    expect(perime.ecarts.liste.every((x) => x.papier === null)).toBe(true);
  });
});
