import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from '@/lib/test/setup';
import { q } from '@/lib/db/client';
import { PROPRIETAIRE_SEUL, RETRAITS_0140, verdictOttoApp } from './assertions-role';

// LA COUVERTURE RLS NE DOIT PLUS POUVOIR DÉRIVER (ADR-109). 0004 avait posé
// le filet, puis 46 tables sont arrivées sans politique — invisible en local
// (le propriétaire contourne RLS), réel sur une base hébergée. Ce test
// échoue le jour où une table future arrive sans politique : l'oubli
// redevient un test rouge, pas un trou silencieux.
//
// La liste propriétaire-seul vit dans `assertions-role.ts` : c'est le MÊME
// ensemble que le bloc d'assertions imprimé au build contre la base réseau,
// pour qu'une justification ne puisse pas exister ici et manquer là.

describe('couverture RLS (ADR-109)', () => {
  beforeAll(async () => {
    await initTestDb();
  }, 120000);

  it('chaque table publique a RLS activée', async () => {
    const sans = await q<{ tablename: string }>(
      `select t.tablename from pg_tables t join pg_class c on c.relname = t.tablename
       where t.schemaname = 'public' and not c.relrowsecurity order by 1`);
    expect(sans.map((r) => r.tablename)).toEqual([]);
  });

  it('chaque table publique porte une politique — ou figure sur la liste propriétaire-seul, justifiée', async () => {
    const tables = await q<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by 1`);
    const avec = new Set((await q<{ tablename: string }>(
      `select distinct tablename from pg_policies`)).map((r) => r.tablename));
    const trous = tables
      .map((t) => t.tablename)
      .filter((t) => !avec.has(t) && !PROPRIETAIRE_SEUL.has(t));
    expect(trous, 'tables sans politique RLS ni justification — en ajouter une dans la MIGRATION, pas dans la liste').toEqual([]);
  });

  it('chaque table à RLS l’a FORCÉE — le propriétaire ne la contourne plus (0033, 0034)', async () => {
    const molles = await q<{ relname: string }>(
      `select c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         and c.relrowsecurity and not c.relforcerowsecurity order by 1`);
    expect(molles.map((r) => r.relname)).toEqual([]);
  });

  it('la liste propriétaire-seul ne porte AUCUNE table qui a désormais une politique — une justification périmée est un mensonge', async () => {
    /* LE SENS QUI MANQUAIT. Le test ci-dessus attrape une table sans politique
       ABSENTE de la liste. Il ne voyait pas le contraire : une table sur la
       liste à qui une migration a DONNÉ une politique — la justification
       « seul le propriétaire la lit » devient fausse et personne ne le sait.
       C'est arrivé le 2026-09-03 avec 0140 (cinq tables). */
    const avec = new Set((await q<{ tablename: string }>(
      `select distinct tablename from pg_policies where schemaname = 'public'`)).map((r) => r.tablename));
    const perimees = [...PROPRIETAIRE_SEUL].filter((t) => avec.has(t));
    expect(perimees, 'tables dites « propriétaire-seul » qui portent pourtant une politique — retirez-les de la liste').toEqual([]);
  });

  it('la liste propriétaire-seul ne porte que des tables qui existent — pas de justification fantôme', async () => {
    const tables = new Set((await q<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`)).map((r) => r.tablename));
    for (const t of PROPRIETAIRE_SEUL) expect(tables.has(t), t).toBe(true);
  });

  /**
   * LES SIX RETRAITS DE 0140, ÉPROUVÉS ICI ET PAS SEULEMENT EN CI (revue
   * hostile n°9, constat 14). Le script `scripts/db/verifier-role-applicatif.ts` ne tourne que
   * contre un Postgres RÉSEAU, dont le secret n'est pas posé : il n'a jamais
   * tourné. PGlite, lui, EST postgres — le rôle et ses droits existent après
   * migration, donc la vérification se fait ici, à chaque suite.
   */
  it('les six retraits de privilège de 0140 tiennent — une migration qui re-`grant`e en bloc rougit', async () => {
    const role = await q<{ b: boolean; s: boolean; l: boolean }>(
      `select rolbypassrls b, rolsuper s, rolcanlogin l from pg_roles where rolname = 'otto_app'`);
    expect(role.length, 'le rôle otto_app n’existe pas : 0140 n’est pas appliquée').toBe(1);
    const ouvertes: string[] = [];
    for (const r of RETRAITS_0140) {
      for (const priv of r.privileges) {
        const p = await q<{ ok: boolean }>(
          `select has_table_privilege('otto_app', $1, $2) ok`, [r.table, priv]);
        if (p[0]?.ok === true) ouvertes.push(`${r.table}.${priv}`);
      }
    }
    const definers = await q<{ n: string }>(
      `select p.proname n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.prosecdef
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       order by 1`);
    const defauts = verdictOttoApp({
      role: { bypass: role[0].b, superutilisateur: role[0].s, connexion: role[0].l },
      ouvertes,
      definers: definers.map((x) => x.n),
    });
    expect(defauts, 'le rôle applicatif ne tient pas ce que 0140 promet').toEqual([]);
  });

  it('le registre SQL des `security definer` et la liste du CODE disent la même chose', async () => {
    /* Deux sources pour une même règle : celle qu'on croit a toujours tort
       (règle 1). Le registre vit en base parce qu'une migration doit pouvoir
       le consulter ; la liste vit dans le code parce que le build et la suite
       doivent pouvoir le lire. Ce test les tient ensemble. */
    const { DEFINERS_JUSTIFIEES } = await import('./assertions-role');
    const enBase = (await q<{ nom: string }>(`select nom from rls_definer_justifiee order by 1`)).map((x) => x.nom);
    expect(enBase, 'le registre SQL est vide — 0141 ne l’a pas rempli').not.toEqual([]);
    expect(enBase).toEqual(Object.keys(DEFINERS_JUSTIFIEES).sort());
  });

  it('0140 est REJOUABLE — une seconde application ne lève pas (les politiques se déposent avant d’être posées)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { repoRoot } = await import('@/lib/db/client');
    const sql = fs.readFileSync(
      path.join(repoRoot(), 'supabase', 'migrations', '0140_role_applicatif.sql'), 'utf8');
    const { getDb } = await import('@/lib/db/client');
    const db = await getDb();
    /* Elle vient d'être appliquée par `migrate()` : on la rejoue telle quelle.
       Sans `drop policy if exists`, cette ligne lèverait « policy already
       exists » — et une migration non rejouable est une migration qu'on ne
       peut pas réparer sur place (revue hostile n°9, constat 18). */
    await db.exec(sql);
  });
});