import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { migrate, empreinteMigration, MigrationEditee } from './migrate';

/**
 * ON N'ÉDITE PAS UNE MIGRATION APPLIQUÉE (règle 17 : la garde est éprouvée
 * contre le cas connu mauvais qu'elle existe pour attraper).
 *
 * LE DÉFAUT QU'ELLE AURAIT ATTRAPÉ. Le 3 septembre, 0140 était appliquée en
 * production ; le soir, j'y ai AJOUTÉ une table. `_migrations` connaît une
 * migration par son NOM : elle n'a jamais rejoué là-bas, la table n'y a jamais
 * existé, 0141 a échoué à chaque déploiement, et TROIS tranches poussées sur
 * `main` ne sont jamais arrivées à l'URL — pendant que la suite et le parcours
 * cliqué restaient verts.
 */
describe('la garde des migrations éditées', () => {
  beforeAll(async () => { await initTestDb(); }, 120000);

  it('une base à jour ne déclenche rien — sinon la garde crierait à chaque lancement', async () => {
    await expect(migrate()).resolves.toEqual([]);
  });

  it('CAS CONNU MAUVAIS — une migration dont le contenu a changé depuis son application est REFUSÉE, et NOMMÉE', async () => {
    const [cible] = await q<{ name: string; empreinte: string }>(
      `select name, empreinte from _migrations where empreinte is not null order by name limit 1`);
    expect(cible, 'aucune migration empreintée : la garde ne mesure rien').toBeDefined();
    const vraie = cible.empreinte;
    await q(`update _migrations set empreinte = $2 where name = $1`,
      [cible.name, empreinteMigration('-- contenu différent, comme une édition après coup')]);
    try {
      await expect(migrate()).rejects.toThrow(MigrationEditee);
      await expect(migrate()).rejects.toThrow(new RegExp(cible.name.replace('.', '\\.')));
    } finally {
      await q(`update _migrations set empreinte = $2 where name = $1`, [cible.name, vraie]);
    }
    /* La fixture est rendue : les cas suivants mesurent bien autre chose. */
    await expect(migrate()).resolves.toEqual([]);
  });

  it('FAUX POSITIF — une ligne SANS empreinte (appliquée avant la garde) ne bloque pas', async () => {
    /* Les bases qui existaient avant la garde gardent leurs lignes. Les bloquer
       rendrait tout déploiement impossible ; les bénir en enregistrant leur
       empreinte du jour reviendrait à approuver l'édition qu'on interdit. Elles
       sont donc dites NON VÉRIFIABLES, et laissées passer. */
    const [cible] = await q<{ name: string; empreinte: string }>(
      `select name, empreinte from _migrations where empreinte is not null order by name limit 1`);
    const vraie = cible.empreinte;
    await q(`update _migrations set empreinte = null where name = $1`, [cible.name]);
    try {
      await expect(migrate()).resolves.toEqual([]);
    } finally {
      await q(`update _migrations set empreinte = $2 where name = $1`, [cible.name, vraie]);
    }
  });

  it('toutes les migrations appliquées par ce code portent leur empreinte', async () => {
    const [r] = await q<{ n: string; sans: string }>(
      `select count(*)::text n, count(*) filter (where empreinte is null)::text sans from _migrations`);
    expect(Number(r.n), 'aucune migration appliquée : le test ne mesure rien').toBeGreaterThan(0);
    expect(Number(r.sans), 'une migration appliquée par ce code n’a pas d’empreinte').toBe(0);
  });

  it('LE CAS DE LA PANNE, REJOUÉ : 0141 s’applique sur une base où le registre n’existe PAS', async () => {
    /* CE QUE LA PRODUCTION A VÉCU TROIS FOIS. 0140 y était appliquée dans sa
       version d'origine — sans `rls_definer_justifiee`. 0141, qui écrit dedans,
       a rencontré une table absente : « relation "rls_definer_justifiee" does
       not exist », et le déploiement s'est arrêté là.

       Ici on reproduit exactement cet état — on retire la table — puis on
       rejoue 0141 telle qu'elle est sur le disque. Elle doit se suffire. */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { repoRoot } = await import('@/lib/db/client');
    const sql = fs.readFileSync(
      path.join(repoRoot(), 'supabase', 'migrations', '0141_portail_par_jeton_et_pieces.sql'), 'utf8');

    await q(`drop table if exists rls_definer_justifiee cascade`);
    const avant = await q<{ n: string }>(
      `select count(*)::text n from information_schema.tables
        where table_schema = 'public' and table_name = 'rls_definer_justifiee'`);
    expect(Number(avant[0].n), 'la table est encore là : le cas de la panne n’est pas reproduit').toBe(0);

    /* ON REJOUE LA TÊTE DU FICHIER, PAS LE FICHIER ENTIER : les politiques de
       0141 existent déjà sur cette base, et leur re-création lèverait pour une
       raison qui n'a rien à voir avec la panne. La tête est précisément la
       partie qui touchait la table absente — tout ce qui précède la première
       fonction. Lire le fichier plutôt que recopier le SQL est ce qui rend ce
       test capable d'échouer si quelqu'un défait la correction. */
    const tete = sql.slice(0, sql.indexOf('create or replace function'));
    expect(tete, 'la tête de 0141 ne mentionne plus le registre : le test ne mesure rien')
      .toMatch(/rls_definer_justifiee/);
    const { getDb } = await import('@/lib/db/client');
    await expect((await getDb()).exec(tete)).resolves.toBeDefined();

    const apres = await q<{ n: string }>(`select count(*)::text n from rls_definer_justifiee`);
    expect(Number(apres[0].n), 'le registre est vide : les deux fonctions du portail ne sont pas inscrites')
      .toBeGreaterThanOrEqual(2);
  });
});
