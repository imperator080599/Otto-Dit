import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q1, tx } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { IDS } from '@/lib/seed';
import { estUnSignalDeNext } from '@/app/refus';

/**
 * R37, CLASSE ET PAS INSTANCE — une redirection Next.js AVALE l'écriture qui
 * la précède, dans la MÊME transaction.
 *
 * LE FAIT, mesuré par exécution (docs/CHASSE.md §3, 2026-09-06) : la station
 * « sondage » soumet le BON `sample_id` (`drawn`, pas périmé), le clic
 * atterrit sur `/eng/{id}/requests` — l'URL du SUCCÈS, pas un refus — et
 * pourtant `event_log` ne porte aucune seconde ligne `request_generated`, et
 * aucune demande n'existe pour l'échantillon courant. Le service tourne
 * jusqu'au bout ; la redirection réussit ; l'écriture disparaît.
 *
 * LA CAUSE : `redirect()` de Next signale par une exception portant un
 * `digest` (`estUnSignalDeNext`, app/refus.ts) — ce n'est PAS une erreur.
 * `tx()` ne le sait pas : sur une transaction NEUVE (`db.transaction`) comme
 * sur un point de reprise (`rollback to savepoint`), toute exception qui
 * traverse `fn()` est traitée comme un échec à annuler. Une action serveur
 * qui écrit PUIS redirige vers une AUTRE page (le patron le plus courant du
 * dépôt — `redirect(chemin)` en fin d'`executer()` est hors transaction, mais
 * un `redirect()` posé DANS la fonction métier, comme `pbcAction`, ne l'est
 * pas) voit son écriture annulée alors que l'utilisateur atterrit sur un
 * écran de succès. C'est le silence lu comme un succès (règle 13) au niveau
 * le plus bas du dépôt : personne n'écrivait ce cas, parce que rien
 * n'annonçait qu'il existait.
 *
 * LE CAS CONNU MAUVAIS (règle 17) : on écrit RÉELLEMENT une ligne, PUIS on
 * lève un signal Next à l'intérieur de la MÊME transaction — comme le fait
 * une action serveur qui redirige après avoir écrit. Avant le correctif de
 * `tx()`, ce test échoue : la ligne écrite disparaît. Après, elle tient.
 */
describe('R37 — un signal Next (redirect) ne doit PAS annuler l’écriture qui le précède', () => {
  beforeAll(async () => {
    await initTestDb();
  });

  const signalNext = (): Error => {
    const e = new Error('NEXT_REDIRECT');
    (e as unknown as { digest: string }).digest = 'NEXT_REDIRECT;push;/quelque-part;307;';
    return e;
  };

  it('cas connu mauvais : tx() SANS transaction déjà ouverte (db.transaction)', async () => {
    expect(estUnSignalDeNext(signalNext())).toBe(true); // la sonde elle-même est correcte

    let ecrit: string | null = null;
    await expect(
      withTenant(IDS.tenant, async () => {
        const row = await q1<{ id: string }>(
          `insert into tenant (name) values ('Écriture avant redirection (fictif, R37)') returning id::text`);
        ecrit = row.id;
        throw signalNext();
      }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(ecrit).not.toBeNull();
    const relu = await q1<{ id: string | null }>(
      `select id::text from tenant where id = $1`, [ecrit]).catch(() => null);
    expect(relu, 'la ligne écrite juste avant le signal Next doit SURVIVRE, pas être annulée')
      .not.toBeNull();
  });

  it('cas connu mauvais : tx() imbriquée (point de reprise / savepoint)', async () => {
    let ecrit: string | null = null;
    await expect(
      withTenant(IDS.tenant, () => tx(async () => {
        const row = await q1<{ id: string }>(
          `insert into tenant (name) values ('Écriture sous savepoint avant redirection (fictif, R37)') returning id::text`);
        ecrit = row.id;
        throw signalNext();
      })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(ecrit).not.toBeNull();
    const relu = await q1<{ id: string | null }>(
      `select id::text from tenant where id = $1`, [ecrit]).catch(() => null);
    expect(relu, 'la ligne écrite sous un point de reprise, avant le signal Next, doit SURVIVRE')
      .not.toBeNull();
  });

  it('témoin : une VRAIE erreur, elle, annule bien l’écriture (le correctif ne doit pas désarmer ça)', async () => {
    let ecrit: string | null = null;
    await expect(
      withTenant(IDS.tenant, async () => {
        const row = await q1<{ id: string }>(
          `insert into tenant (name) values ('Écriture qui doit être annulée (fictif, R37)') returning id::text`);
        ecrit = row.id;
        throw new Error('une vraie panne, pas une redirection');
      }),
    ).rejects.toThrow('une vraie panne');

    expect(ecrit).not.toBeNull();
    const relu = await q1<{ id: string | null }>(
      `select id::text from tenant where id = $1`, [ecrit]).catch(() => null);
    expect(relu, 'une vraie erreur doit toujours annuler ce qu’elle a écrit').toBeNull();
  });
});
