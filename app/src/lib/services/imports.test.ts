import { describe, it, expect } from 'vitest';

/* ── L'IPE CAPTURÉE À L'IMPORT (1.8) ─────────────────────────────────────── */
describe('l’import capture l’information produite par l’entité, et le rapport la reprend', () => {
  it('les cinq champs sont facultatifs à l’import, stockés tels quels, et repris par un rapport créé sur le fichier', async () => {
    const { initTestDb } = await import('@/lib/test/setup');
    await initTestDb();
    const { IDS } = await import('@/lib/seed');
    const { importTb, detectTbMapping } = await import('./imports');
    const { q01 } = await import('@/lib/db/client');
    const { creerRapport, lireRapport } = await import('./ipe');
    const csv = 'account_no;label;debit;credit\n701000;Ventes;0;1000\n411000;Clients;1000;0\n';
    const sans = await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb-sans.csv', content: csv,
      mapping: detectTbMapping(csv.split('\n')[0]), periodKind: 'current' });
    const r0 = await q01<{ systeme_source: string | null; nature_ipe: string | null }>(
      `select systeme_source, nature_ipe from import_file where id = $1`, [sans.importFileId]);
    expect(r0).toEqual({ systeme_source: null, nature_ipe: null });
    const avec = await importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb-avec.csv', content: csv,
      mapping: detectTbMapping(csv.split('\n')[0]), periodKind: 'prior',
      ipe: { systemeSource: 'SAP ECC (fictif)', natureIpe: 'systeme', identifiantRapport: 'ZFI_TB', extraitLe: '2026-01-10', extraitPar: 'S. Marchand (fictif)' } });
    const r1 = await q01<{ systeme_source: string; nature_ipe: string; identifiant_rapport: string; extrait_le: string; extrait_par: string }>(
      `select systeme_source, nature_ipe, identifiant_rapport, extrait_le::text, extrait_par from import_file where id = $1`, [avec.importFileId]);
    expect(r1).toEqual({ systeme_source: 'SAP ECC (fictif)', nature_ipe: 'systeme', identifiant_rapport: 'ZFI_TB', extrait_le: '2026-01-10', extrait_par: 'S. Marchand (fictif)' });
    await expect(importTb({ engagementId: IDS.engNep, userId: IDS.users.karim, filename: 'tb-x.csv', content: csv,
      mapping: detectTbMapping(csv.split('\n')[0]), periodKind: 'prior', ipe: { natureIpe: 'robot' as never } })).rejects.toThrow(/nature IPE/);
    const rap = await creerRapport(IDS.engNep, { nom: 'Balance générale', periodeFin: '2025-12-31', nature: 'systeme',
      importFileId: avec.importFileId, exhaustivite: 'x', exactitude: 'y' }, IDS.users.karim);
    expect(await lireRapport(rap.id)).toMatchObject({ systemeSource: 'SAP ECC (fictif)', codeRapport: 'ZFI_TB', generePar: 'S. Marchand (fictif)', genereLe: '2026-01-10' });
  });
});
