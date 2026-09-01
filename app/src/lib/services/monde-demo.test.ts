// LA REMISE À ZÉRO — éprouvée en RESTAURANT, pas en lisant le code.
//
// Une branche de repli que rien n'exécute jamais est un silence lu comme un
// succès (règle 13). Le chemin complet est donc joué ici : instantané, monde
// abîmé, restauration, et l'état d'avant retrouvé — chiffres à l'appui.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q, q01 } from '@/lib/db/client';
import { IDS } from '@/lib/seed';
import {
  ordreDeDependance, instantanerLeMonde, etatInstantane, comparaison,
  remettreLeMondeAZero, SCHEMA_INSTANTANE,
} from './monde-demo';

const compte = async (table: string) =>
  Number((await q01<{ n: string }>(`select count(*)::text n from public."${table}"`))!.n);

describe('l’ordre de restauration se dérive du graphe des clés étrangères', () => {
  it('met les parents avant les enfants', () => {
    const { ordre, cycle } = ordreDeDependance(
      ['evidence', 'engagement', 'tenant', 'request'],
      [
        { enfant: 'engagement', parent: 'tenant' },
        { enfant: 'request', parent: 'engagement' },
        { enfant: 'evidence', parent: 'engagement' },
      ],
    );
    expect(cycle).toEqual([]);
    expect(ordre.indexOf('tenant')).toBeLessThan(ordre.indexOf('engagement'));
    expect(ordre.indexOf('engagement')).toBeLessThan(ordre.indexOf('request'));
    expect(ordre.indexOf('engagement')).toBeLessThan(ordre.indexOf('evidence'));
  });

  it('ignore les auto-références (vérifiées en fin d’instruction, pas de ligne)', () => {
    const { ordre, cycle } = ordreDeDependance(
      ['note'], [{ enfant: 'note', parent: 'note' }]);
    expect(cycle).toEqual([]);
    expect(ordre).toEqual(['note']);
  });

  it('NOMME un cycle au lieu de le taire, et n’oublie aucune table', () => {
    const { ordre, cycle } = ordreDeDependance(
      ['a', 'b', 'c'],
      [{ enfant: 'a', parent: 'b' }, { enfant: 'b', parent: 'a' }],
    );
    expect(cycle).toEqual(['a', 'b']);
    expect(ordre.sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('instantané et remise à zéro, sur une vraie base', () => {
  beforeAll(async () => {
    await initTestDb();
    /* Le geste n'existe QUE sur la démonstration publique : le refus est dans
       le service, il faut donc déclarer la démonstration pour l'exercer. */
    process.env.OTTO_DEMO_PUBLIC = '1';
  });
  afterAll(() => { delete process.env.OTTO_DEMO_PUBLIC; });

  it('refuse de restaurer quand il n’y a pas d’instantané', async () => {
    const etat = await etatInstantane();
    expect(etat.existe).toBe(false);
    await expect(remettreLeMondeAZero()).rejects.toThrow(/Aucun instantané/);
  });

  it('prend un instantané daté qui couvre toutes les tables publiques', async () => {
    const inst = await instantanerLeMonde();
    expect(inst.tables).toBeGreaterThan(50);
    expect(inst.lignes).toBeGreaterThan(0);
    const etat = await etatInstantane();
    expect(etat.existe).toBe(true);
    expect(etat.aJour).toBe(true);
    expect(etat.desaccords).toEqual([]);
    expect(etat.prisLe).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('restaure exactement l’état figé : ce qui a été ajouté part, ce qui a été retiré revient', async () => {
    const avant = {
      engagement: await compte('engagement'),
      client_contact: await compte('client_contact'),
      engagement_member: await compte('engagement_member'),
      review_note: await compte('review_note'),
      event_log: await compte('event_log'),
    };
    expect(avant.engagement).toBeGreaterThan(0);
    expect(avant.client_contact).toBeGreaterThan(0);

    /* On ABÎME le monde des deux façons : on ajoute, et on retire. */
    await q(
      `insert into review_note (engagement_id, author_id, note_type, text, status,
                                anchor_kind, anchor_ref, anchor_label)
       values ($1,$2,'question','note posée après l’instantané','open',
               'materiality_param','benchmark','Référence retenue')`,
      [IDS.engNep, IDS.users.karim]);
    await q(`delete from client_contact`);
    expect(await compte('client_contact')).toBe(0);

    const abime = await comparaison();
    const notes = abime.find((l) => l.table === 'review_note')!;
    expect(notes.actuel).toBe(avant.review_note + 1);
    expect(notes.instantane).toBe(avant.review_note);

    const r = await remettreLeMondeAZero({ userId: IDS.users.karim });
    expect(r.lignes).toBeGreaterThan(0);

    expect(await compte('engagement')).toBe(avant.engagement);
    expect(await compte('client_contact')).toBe(avant.client_contact);
    expect(await compte('engagement_member')).toBe(avant.engagement_member);
    expect(await compte('review_note')).toBe(avant.review_note);
    /* L'ÉVÉNEMENT S'ÉCRIT APRÈS la restauration : un de plus que l'instantané,
       et il chaîne sur le dernier événement restauré. */
    expect(await compte('event_log')).toBe(avant.event_log + 1);
    const dernier = await q01<{ verb: string; prev_hash: string; hash: string }>(
      `select verb, prev_hash, hash from event_log order by id desc limit 1`);
    expect(dernier!.verb).toBe('demo.world.reset');
    expect(dernier!.prev_hash).not.toBe('');
  });

  it('la séquence de event_log est recalée : le geste SUIVANT n’entre pas en collision', async () => {
    const max = Number((await q01<{ n: string }>(`select coalesce(max(id),0)::text n from event_log`))!.n);
    const prochain = Number((await q01<{ n: string }>(
      `select nextval('public.event_log_id_seq')::text n`))!.n);
    expect(prochain).toBeGreaterThan(max);
  });

  it('l’instantané n’est pas lisible par le public (il porte les mêmes données sans la RLS)', async () => {
    const droits = await q<{ privilege_type: string }>(
      `select privilege_type from information_schema.usage_privileges
       where object_schema = $1 and grantee = 'PUBLIC'`, [SCHEMA_INSTANTANE]);
    expect(droits).toEqual([]);
  });
});
