import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01, annulerApres, tx } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { bootstrapNep } from '@/lib/flows/part1';
import { enregistrerAnalytique, lireAnalytique } from '@/lib/services/analytique';

// LA SONDE EN TRANSACTION ANNULÉE (mandat de la soirée, §0.2), ÉPROUVÉE.
//
// Le cas connu BON : un geste conduit sous `annulerApres` ne laisse RIEN en
// base, et son résultat comme son refus sont rendus tels quels. Le cas connu
// MAUVAIS (ce qui se passerait sans elle) : le même geste, conduit nu, écrit.
// Et `q()` appelé PLUS BAS qu'une transaction ouverte y participe — c'est la
// propriété qui rend la sonde possible.

describe('annulerApres — le geste réel, rien d’écrit', () => {
  beforeAll(async () => { await initTestDb(); }, 120000);

  const NOM = 'Cabinet de sonde (fictif)';

  it('un geste conduit sous annulerApres rend son résultat et ne laisse aucune ligne', async () => {
    const r = await annulerApres(async () => {
      const t = await q01<{ id: string }>(`insert into tenant (name) values ($1) returning id::text`, [NOM]);
      /* Tout ce qui suit lit DANS la transaction : la ligne y est visible. */
      const vu = await q01<{ n: string }>(`select count(*)::text n from tenant where name = $1`, [NOM]);
      return { id: t!.id, vu: Number(vu!.n) };
    });
    expect(r.vu).toBe(1);
    expect(await q01<{ n: string }>(`select count(*)::text n from tenant where name = $1`, [NOM])).toEqual({ n: '0' });
  });

  it('CAS CONNU MAUVAIS — le même geste conduit NU écrit pour de bon', async () => {
    await q(`insert into tenant (name) values ($1)`, [NOM]);
    expect(await q01<{ n: string }>(`select count(*)::text n from tenant where name = $1`, [NOM])).toEqual({ n: '1' });
    await q(`delete from tenant where name = $1`, [NOM]);
  });

  it('un refus du service est relancé tel quel — après l’annulation', async () => {
    await expect(annulerApres(async () => {
      await q(`insert into tenant (name) values ($1)`, [NOM]);
      throw new Error('TEST-99 : refus du service, pour l’épreuve');
    })).rejects.toThrow(/TEST-99/);
    expect(await q01<{ n: string }>(`select count(*)::text n from tenant where name = $1`, [NOM])).toEqual({ n: '0' });
  });

  it('tx() attire aussi les q() appelés plus bas : une écriture par q() dans une transaction annulée disparaît', async () => {
    await expect(tx(async () => {
      await q(`insert into tenant (name) values ($1)`, [NOM]);
      throw new Error('annule exprès');
    })).rejects.toThrow(/annule exprès/);
    expect(await q01<{ n: string }>(`select count(*)::text n from tenant where name = $1`, [NOM])).toEqual({ n: '0' });
    /* Et la base semée est intacte : le locataire de démonstration est toujours là. */
    expect(await q01<{ id: string }>(`select id::text from tenant where id = $1`, [IDS.tenant])).not.toBeNull();
  });

  /* LE CAS QUE LA REVUE HOSTILE A TROUVÉ : un service RÉEL qui réussit sous la
     sonde — il écrit, puis journalise dans SA propre transaction. Avant, la
     transaction imbriquée figeait la base ; ce test attend au plus huit
     secondes, et « BLOQUÉ » est le verdict qu'il refuse. */
  it('une transaction ouverte sous une transaction ouverte la REJOINT — elle ne fige pas la base', async () => {
    const r = await Promise.race([
      tx(async () => tx(async (run) => { await run('select 1'); return 'fini'; })),
      new Promise<string>((res) => setTimeout(() => res('BLOQUÉ'), 8000)),
    ]);
    expect(r).toBe('fini');
    /* Et une transaction imbriquée qui ÉCHOUE n'emporte que ses propres écritures. */
    await tx(async () => {
      await q(`insert into tenant (name) values ($1)`, [NOM]);
      await expect(tx(async () => {
        await q(`insert into tenant (name) values ($1)`, [`${NOM} 2`]);
        throw new Error('échec intérieur');
      })).rejects.toThrow(/échec intérieur/);
      expect(await q01<{ n: string }>(`select count(*)::text n from tenant where name like $1`, [`${NOM}%`])).toEqual({ n: '1' });
    });
    expect(await q01<{ n: string }>(`select count(*)::text n from tenant where name like $1`, [`${NOM}%`])).toEqual({ n: '1' });
    await q(`delete from tenant where name = $1`, [NOM]);
  }, 20000);

  it('un service réel qui RÉUSSIT sous la sonde rend son résultat et ne laisse rien — ni sa ligne, ni son événement', async () => {
    await bootstrapNep();
    const avant = async () => q01<{ a: string; e: string }>(
      `select (select count(*) from fsli_analytique)::text a, (select count(*) from event_log)::text e`);
    const t0 = await avant();
    const r = await Promise.race([
      annulerApres(() => enregistrerAnalytique(IDS.engNep, 'REVENUE', IDS.users.karim, 'Sous la sonde (fictive).', { origine: 'humaine' })),
      new Promise<string>((res) => setTimeout(() => res('BLOQUÉ'), 8000)),
    ]);
    expect(r).toMatchObject({ version: 1 });
    expect(await avant()).toEqual(t0);
    expect(await lireAnalytique(IDS.engNep, 'REVENUE')).toBeNull();
  }, 200000);
});
