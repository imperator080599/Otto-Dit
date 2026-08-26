// LA BOUCLE COMME OBJET (point 7).
//
// Ce qui se vérifie ici n'est pas que les maillons marchent — c'est déjà testé
// ailleurs. C'est que la boucle TOURNE, et qu'elle le dit : un écart repart en
// demande, et le compteur de tours passe de zéro à un.

import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q1 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import { runPart1UpToWorkpaper } from '@/lib/flows/part1';
import { boucle, tours } from './loop';
import { draftClarificationRequest, listExceptions } from './matching';

describe('la boucle tourne, et elle le dit', () => {
  beforeAll(async () => {
    await initTestDb();
    await runPart1UpToWorkpaper();
  });

  it('les étapes se suivent, et chaque compte est dérivé de l’état réel', async () => {
    const b = await boucle(IDS.engNep, 'REVENUE');
    expect(b.etapes.map((e) => e.code)).toEqual([
      'selection', 'demande', 'depot', 'lecture',
      'rapprochement', 'ecart', 'clarification', 'resolution', 'cumul',
    ]);
    // la sélection existe, sinon tout le reste est zéro et ne prouve rien
    expect(b.etapes[0].franchi).toBeGreaterThan(0);
    // et les étapes ne peuvent pas franchir plus que celle d'avant
    const sel = b.etapes[0].franchi;
    for (const e of b.etapes.slice(1, 5)) expect(e.franchi).toBeLessThanOrEqual(sel);
  });

  it('un écart NON clarifié laisse la boucle ouverte, et l’écran dit où', async () => {
    const b = await boucle(IDS.engNep, 'REVENUE');
    const ouverts = (await listExceptions(IDS.engNep)).filter(
      (x) => x.kind === 'substantive' && (x.status === 'open' || x.status === 'clarification_requested'),
    );
    if (ouverts.length > 0) {
      expect(b.fermee).toBe(false);
      expect(b.obstacles.length).toBeGreaterThan(0);
      expect(b.bloqueA).not.toBeNull();
    }
  });

  it('LE TOUR : le compteur est le nombre de demandes NÉES d’un écart', async () => {
    /* C'est LA vérification du point 7. Une file d'étapes se parcourt ; une
       boucle repart. Le déroulé de démonstration en a déjà fait un tour — c'est
       une bonne nouvelle, pas une raison de partir de zéro : on vérifie donc
       l'INVARIANT, pas un état de départ supposé. */
    const b = await boucle(IDS.engNep, 'REVENUE');
    expect(b.tours).toBeGreaterThan(0);

    const attendu = await q1<{ n: string }>(
      `select count(distinct ri.request_id) n from request_item ri
       join exception x on x.id = ri.exception_id
       where x.engagement_id = $1`,
      [IDS.engNep],
    );
    expect(b.tours).toBe(Number(attendu.n));

    const liste = await tours(IDS.engNep);
    expect(liste.length).toBeGreaterThan(0);
    // chaque tour SAIT de quel écart il vient — sinon « la constatation
    // circule » resterait une phrase
    for (const t of liste) {
      expect(t.exception_id).toBeTruthy();
      expect(t.taxonomy_code).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('un NOUVEAU tour fait monter le compteur, et il ne monte pas tout seul', async () => {
    const avant = await boucle(IDS.engNep, 'REVENUE');
    const ouverts = (await listExceptions(IDS.engNep)).filter(
      (x) => x.kind === 'substantive' && x.status === 'open' && x.taxonomy_code !== 'quarantined_evidence',
    );
    if (ouverts.length === 0) {
      // Rien à clarifier : le service REFUSE, et le compteur ne bouge pas.
      await expect(draftClarificationRequest(IDS.engNep, IDS.users.karim)).rejects.toThrow();
      expect((await boucle(IDS.engNep, 'REVENUE')).tours).toBe(avant.tours);
      return;
    }
    await draftClarificationRequest(IDS.engNep, IDS.users.karim);
    const apres = await boucle(IDS.engNep, 'REVENUE');
    expect(apres.tours).toBe(avant.tours + 1);
  });

  it('l’étape « clarification » compte les écarts clarifiés, pas les demandes', async () => {
    /* Une demande peut porter plusieurs écarts : compter les demandes
       surestimerait la couverture. */
    const b = await boucle(IDS.engNep, 'REVENUE');
    const clar = b.etapes.find((e) => e.code === 'clarification')!;
    const distincts = await q1<{ n: string }>(
      `select count(distinct x.id) n from exception x
       join sample_item si on si.id = x.sample_item_id
       join sample s on s.id = si.sample_id and s.status = 'drawn'
       join request_item ri on ri.exception_id = x.id
       where x.engagement_id = $1`,
      [IDS.engNep],
    );
    expect(clar.franchi).toBe(Number(distincts.n));
  });

  it('sans échantillon tiré, la boucle le DIT au lieu de rendre des zéros', async () => {
    const b = await boucle(IDS.engSox, 'REVENUE');
    expect(b.etapes).toHaveLength(0);
    expect(b.obstacles[0]).toMatch(/n’a pas commencé/);
    expect(b.fermee).toBe(false);
  });

  it('rien n’est stocké : la boucle se relit à l’identique', async () => {
    /* Un compteur tenu à part diverge un jour de ce qu'il compte, et c'est
       toujours le compteur qu'on croit. */
    const a = await boucle(IDS.engNep, 'REVENUE');
    const b = await boucle(IDS.engNep, 'REVENUE');
    expect(b).toEqual(a);
    const tables = await q<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name like '%loop%'`,
    );
    expect(tables, 'la boucle ne doit pas avoir de table à elle').toEqual([]);
  });
});
